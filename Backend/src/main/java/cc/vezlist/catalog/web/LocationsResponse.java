package cc.vezlist.catalog.web;

import java.util.List;

public record LocationsResponse(List<ProvinceResponse> provinces, List<LocationResponse> popularAreas) {
}
