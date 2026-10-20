package cc.vezlist.discovery.application;

import java.math.BigDecimal;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import cc.vezlist.discovery.domain.DiscoverySort;
import org.springframework.stereotype.Component;

@Component
public class DiscoveryCursorCodec {
    private static final int VERSION = 1;
    private final ObjectMapper objectMapper;

    public DiscoveryCursorCodec(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public String fingerprint(String canonicalQuery) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(canonicalQuery.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable.", exception);
        }
    }

    public String encode(
            DiscoverySort sort,
            String fingerprint,
            Instant asOf,
            CursorAnchor anchor) {
        CursorPayload payload = new CursorPayload(
                VERSION,
                sort,
                fingerprint,
                asOf,
                anchor.publishedAt(),
                anchor.price(),
                anchor.distanceKm(),
                anchor.id(),
                anchor.verified());
        try {
            byte[] json = objectMapper.writeValueAsBytes(payload);
            return Base64.getUrlEncoder().withoutPadding().encodeToString(json);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not encode a discovery cursor.", exception);
        }
    }

    public DecodedCursor decode(
            String encoded,
            DiscoverySort expectedSort,
            String expectedFingerprint) {
        try {
            byte[] json = Base64.getUrlDecoder().decode(encoded);
            CursorPayload payload = objectMapper.readValue(json, CursorPayload.class);
            if (payload.version() != VERSION
                    || payload.sort() != expectedSort
                    || !MessageDigest.isEqual(
                            payload.fingerprint().getBytes(StandardCharsets.UTF_8),
                            expectedFingerprint.getBytes(StandardCharsets.UTF_8))
                    || payload.asOf() == null
                    || payload.publishedAt() == null
                    || payload.id() == null) {
                throw new DiscoveryCursorInvalidException();
            }
            if ((expectedSort == DiscoverySort.PRICE_ASC || expectedSort == DiscoverySort.PRICE_DESC)
                    && payload.price() == null) {
                throw new DiscoveryCursorInvalidException();
            }
            if (expectedSort == DiscoverySort.NEAREST && payload.distanceKm() == null) {
                throw new DiscoveryCursorInvalidException();
            }
            if (expectedSort == DiscoverySort.VERIFIED_FIRST && payload.verified() == null) {
                throw new DiscoveryCursorInvalidException();
            }
            return new DecodedCursor(
                    payload.asOf(),
                    new CursorAnchor(
                            payload.publishedAt(), payload.price(), payload.distanceKm(), payload.id(), payload.verified()));
        } catch (DiscoveryCursorInvalidException exception) {
            throw exception;
        } catch (RuntimeException | IOException exception) {
            throw new DiscoveryCursorInvalidException();
        }
    }

    public record CursorAnchor(
            Instant publishedAt,
            BigDecimal price,
            Double distanceKm,
            UUID id,
            Boolean verified) {
    }

    public record DecodedCursor(Instant asOf, CursorAnchor anchor) {
    }

    private record CursorPayload(
            int version,
            DiscoverySort sort,
            String fingerprint,
            Instant asOf,
            Instant publishedAt,
            BigDecimal price,
            Double distanceKm,
            UUID id,
            Boolean verified) {
    }
}
