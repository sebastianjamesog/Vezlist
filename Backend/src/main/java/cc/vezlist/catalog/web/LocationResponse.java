package cc.vezlist.catalog.web;

import java.util.List;
import cc.vezlist.catalog.domain.Location;

public record LocationResponse(String id, String label, String provinceId, String provinceLabel, boolean popular,
                               String type, String areaId, String areaLabel, List<LocationResponse> neighbourhoods) {
    public LocationResponse(String id, String label, String provinceId, String provinceLabel, boolean popular) {
        this(id, label, provinceId, provinceLabel, popular, "AREA", id, label, List.of());
    }
    public static LocationResponse from(Location location) { return from(location, List.of()); }
    public static LocationResponse from(Location location, List<LocationResponse> neighbourhoods) {
        Location province = location.getProvince();
        Location area = location.getArea();
        return new LocationResponse(location.getId(), location.getLabel(), province.getId(), province.getLabel(),
                location.isPopular(), location.getType().name(), area == null ? null : area.getId(),
                area == null ? null : area.getLabel(), neighbourhoods);
    }
}
