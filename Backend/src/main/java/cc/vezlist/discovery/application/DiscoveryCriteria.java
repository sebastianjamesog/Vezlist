package cc.vezlist.discovery.application;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import cc.vezlist.discovery.domain.DiscoverySort;
import cc.vezlist.discovery.domain.PostedWithin;
import cc.vezlist.shared.domain.SiteScope;

public record DiscoveryCriteria(
        SiteScope site,
        String query,
        List<String> categoryIds,
        String provinceId,
        List<String> areaIds,
        BigDecimal minPrice,
        BigDecimal maxPrice,
        boolean verifiedOnly,
        boolean availableOnly,
        PostedWithin postedWithin,
        DiscoverySort sort,
        Double latitude,
        Double longitude,
        Double radiusKm,
        int limit,
        Instant asOf,
        DiscoveryCursorCodec.CursorAnchor cursor,
        List<String> ethnicities) {

    public boolean hasCoordinates() {
        return latitude != null;
    }

    public Instant postedAfter() {
        return postedWithin.duration() == null ? null : asOf.minus(postedWithin.duration());
    }
}
