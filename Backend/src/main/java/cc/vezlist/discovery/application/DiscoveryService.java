package cc.vezlist.discovery.application;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.function.Supplier;

import cc.vezlist.discovery.domain.DiscoverySort;
import cc.vezlist.discovery.domain.PostedWithin;
import cc.vezlist.discovery.persistence.DiscoveryRepository;
import cc.vezlist.discovery.persistence.DiscoveryRepository.DiscoveryRow;
import cc.vezlist.discovery.web.DiscoveryListingResponse;
import cc.vezlist.discovery.web.DiscoveryMapRequest;
import cc.vezlist.discovery.web.DiscoveryMapPinResponse;
import cc.vezlist.discovery.web.DiscoveryPageResponse;
import cc.vezlist.discovery.web.DiscoverySearchRequest;
import cc.vezlist.media.storage.ObjectStorage;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DiscoveryService {
    private static final int DEFAULT_PAGE_SIZE = 24;
    private static final int MAX_PAGE_SIZE = 50;
    private static final int DEFAULT_MAP_SIZE = 200;
    private static final int MAX_MAP_SIZE = 500;

    private final DiscoveryRepository repository;
    private final DiscoveryCursorCodec cursors;
    private final ObjectStorage storage;
    private final MeterRegistry metrics;

    public DiscoveryService(
            DiscoveryRepository repository,
            DiscoveryCursorCodec cursors,
            ObjectStorage storage,
            MeterRegistry metrics) {
        this.repository = repository;
        this.cursors = cursors;
        this.storage = storage;
        this.metrics = metrics;
    }

    @Transactional(readOnly = true)
    public DiscoveryPageResponse search(DiscoverySearchRequest request) {
        PreparedQuery prepared = prepare(request, false);
        DiscoveryCriteria criteria = prepared.criteria();
        return timed("search", criteria, () -> {
            List<DiscoveryRow> fetched = repository.search(criteria);
            boolean hasMore = fetched.size() > criteria.limit();
            List<DiscoveryRow> pageRows = hasMore
                    ? fetched.subList(0, criteria.limit())
                    : fetched;
            List<DiscoveryListingResponse> items = pageRows.stream()
                    .map(this::response)
                    .toList();
            String nextCursor = hasMore
                    ? cursors.encode(
                            criteria.sort(),
                            prepared.fingerprint(),
                            criteria.asOf(),
                            pageRows.get(pageRows.size() - 1).cursorAnchor())
                    : null;
            return new DiscoveryPageResponse(items, nextCursor, hasMore);
        });
    }

    @Transactional(readOnly = true)
    public List<DiscoveryMapPinResponse> mapPins(DiscoveryMapRequest request) {
        DiscoverySearchRequest searchRequest = new DiscoverySearchRequest(
                request.site(), request.q(), request.category(), request.province(), request.area(),
                request.minPrice(), request.maxPrice(), request.verifiedOnly(), request.postedWithin(),
                DiscoverySort.NEAREST, request.latitude(), request.longitude(), request.radiusKm(),
                null, request.limit(), null);
        PreparedQuery prepared = prepare(searchRequest, true);
        DiscoveryCriteria criteria = prepared.criteria();
        return timed("map", criteria, () -> repository.mapPins(criteria).stream()
                .map(pin -> new DiscoveryMapPinResponse(
                        pin.id(), pin.title(), pin.categoryId(), pin.price(), pin.latitude(), pin.longitude(),
                        pin.distanceKm(), pin.verified()))
                .toList());
    }

    private PreparedQuery prepare(DiscoverySearchRequest request, boolean map) {
        DiscoverySort sort = map ? DiscoverySort.NEAREST
                : request.sort() == null ? DiscoverySort.NEWEST : request.sort();
        PostedWithin postedWithin = request.postedWithin() == null ? PostedWithin.ANY : request.postedWithin();
        List<String> categoryIds = normalizeIds(request.category(), 10, "categories");
        List<String> areaIds = normalizeIds(request.area(), 20, "areas");
        String query = normalize(request.q());
        String province = normalizeId(request.province());
        int limit = request.limit() == null
                ? map ? DEFAULT_MAP_SIZE : DEFAULT_PAGE_SIZE
                : request.limit();
        int maxLimit = map ? MAX_MAP_SIZE : MAX_PAGE_SIZE;
        if (limit < 1 || limit > maxLimit) {
            throw new DiscoveryQueryInvalidException("Limit must be between 1 and " + maxLimit + ".");
        }
        if (request.minPrice() != null && request.maxPrice() != null
                && request.minPrice().compareTo(request.maxPrice()) > 0) {
            throw new DiscoveryQueryInvalidException("Minimum price cannot exceed maximum price.");
        }
        boolean anyCoordinate = request.latitude() != null
                || request.longitude() != null
                || request.radiusKm() != null;
        boolean allCoordinates = request.latitude() != null
                && request.longitude() != null
                && request.radiusKm() != null;
        if (anyCoordinate && !allCoordinates) {
            throw new DiscoveryQueryInvalidException(
                    "Latitude, longitude, and radiusKm must be supplied together.");
        }
        if ((map || sort == DiscoverySort.NEAREST) && !allCoordinates) {
            throw new DiscoveryQueryInvalidException(
                    "Nearest discovery requires latitude, longitude, and a radiusKm of at most 100.");
        }

        String canonical = String.join("|",
                request.site().name(),
                value(query),
                String.join(",", categoryIds),
                value(province),
                String.join(",", areaIds),
                decimal(request.minPrice()),
                decimal(request.maxPrice()),
                Boolean.toString(Boolean.TRUE.equals(request.verifiedOnly())),
                Boolean.toString(Boolean.TRUE.equals(request.availableOnly())),
                postedWithin.name(),
                sort.name(),
                number(request.latitude()),
                number(request.longitude()),
                number(request.radiusKm()));
        String fingerprint = cursors.fingerprint(canonical);
        Instant asOf = Instant.now();
        DiscoveryCursorCodec.CursorAnchor cursor = null;
        if (!map && request.cursor() != null && !request.cursor().isBlank()) {
            DiscoveryCursorCodec.DecodedCursor decoded = cursors.decode(
                    request.cursor(), sort, fingerprint);
            asOf = decoded.asOf();
            cursor = decoded.anchor();
        }
        DiscoveryCriteria criteria = new DiscoveryCriteria(
                request.site(), query, categoryIds, province, areaIds,
                request.minPrice(), request.maxPrice(), Boolean.TRUE.equals(request.verifiedOnly()),
                Boolean.TRUE.equals(request.availableOnly()),
                postedWithin, sort, request.latitude(), request.longitude(), request.radiusKm(),
                limit, asOf, cursor);
        return new PreparedQuery(criteria, fingerprint);
    }

    private DiscoveryListingResponse response(DiscoveryRow row) {
        String imageUrl = row.coverObjectKey() == null
                ? null
                : storage.authorizeDownload(row.coverObjectKey()).toString();
        return new DiscoveryListingResponse(
                row.id(), row.site(), row.title(), row.businessName(), row.price(),
                row.categoryId(), row.categoryLabel(), row.provinceId(), row.provinceLabel(),
                row.locationId(), row.locationLabel(), row.latitude(), row.longitude(), row.distanceKm(),
                row.verified(), imageUrl, row.photoCount(), row.publishedAt(), row.viewCount());
    }

    private List<String> normalizeIds(List<String> raw, int maximum, String label) {
        if (raw == null) return List.of();
        List<String> normalized = new ArrayList<>();
        for (String value : raw) {
            if (value == null) continue;
            for (String part : value.split(",")) {
                String id = normalizeId(part);
                if (id != null) normalized.add(id);
            }
        }
        List<String> unique = normalized.stream().distinct().sorted(Comparator.naturalOrder()).toList();
        if (unique.size() > maximum) {
            throw new DiscoveryQueryInvalidException("Too many " + label + " were requested.");
        }
        return unique;
    }

    private String normalize(String value) {
        if (value == null || value.isBlank()) return null;
        return value.strip().toLowerCase(Locale.ROOT);
    }

    private String normalizeId(String value) {
        return normalize(value);
    }

    private String value(String value) {
        return value == null ? "" : value;
    }

    private String decimal(BigDecimal value) {
        return value == null ? "" : value.stripTrailingZeros().toPlainString();
    }

    private String number(Double value) {
        return value == null ? "" : BigDecimal.valueOf(value).stripTrailingZeros().toPlainString();
    }

    private <T> T timed(String endpoint, DiscoveryCriteria criteria, Supplier<T> action) {
        Timer.Sample sample = Timer.start(metrics);
        String outcome = "success";
        try {
            return action.get();
        } catch (RuntimeException exception) {
            outcome = "error";
            throw exception;
        } finally {
            sample.stop(Timer.builder("vezlist.discovery.query")
                    .description("Vezlist public discovery query duration")
                    .tag("endpoint", endpoint)
                    .tag("site", criteria.site().name().toLowerCase(Locale.ROOT))
                    .tag("sort", criteria.sort().name().toLowerCase(Locale.ROOT))
                    .tag("outcome", outcome)
                    .register(metrics));
        }
    }

    private record PreparedQuery(DiscoveryCriteria criteria, String fingerprint) {
    }
}
