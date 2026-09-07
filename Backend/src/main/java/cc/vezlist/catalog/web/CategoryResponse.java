package cc.vezlist.catalog.web;

import cc.vezlist.catalog.domain.Category;

public record CategoryResponse(String id, String label, String icon, boolean primary) {
    public static CategoryResponse from(Category category) {
        return new CategoryResponse(category.getId(), category.getLabel(), category.getIcon(), category.isPrimary());
    }
}
