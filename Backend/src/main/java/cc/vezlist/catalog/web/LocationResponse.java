package cc.vezlist.catalog.web;

import cc.vezlist.catalog.domain.Location;

public record LocationResponse(String id, String label, String provinceId, String provinceLabel, boolean popular) {
    public static LocationResponse from(Location location) {
        Location province = location.getParent();
        return new LocationResponse(
                location.getId(),
                location.getLabel(),
                province == null ? null : province.getId(),
                province == null ? null : province.getLabel(),
                location.isPopular());
    }
}
