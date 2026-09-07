package cc.vezlist.catalog.web;

import java.util.List;

public record ProvinceResponse(String id, String label, List<LocationResponse> areas) {
}
