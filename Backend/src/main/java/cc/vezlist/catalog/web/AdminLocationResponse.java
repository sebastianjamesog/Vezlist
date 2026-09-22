package cc.vezlist.catalog.web;

import cc.vezlist.catalog.domain.Location;

public record AdminLocationResponse(
        String id, String label, String type, String parentId, int displayOrder, boolean popular, boolean enabled) {
    public static AdminLocationResponse from(Location location) {
        return new AdminLocationResponse(
                location.getId(), location.getLabel(), location.getType().name(),
                location.getParent() == null ? null : location.getParent().getId(),
                location.getDisplayOrder(), location.isPopular(), location.isEnabled());
    }
}
