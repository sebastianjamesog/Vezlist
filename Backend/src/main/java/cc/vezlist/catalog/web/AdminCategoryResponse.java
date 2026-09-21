package cc.vezlist.catalog.web;

import cc.vezlist.catalog.domain.Category;
import cc.vezlist.shared.domain.SiteScope;

public record AdminCategoryResponse(
        String id, String label, String icon, SiteScope site, boolean primary, int displayOrder, boolean enabled) {
    public static AdminCategoryResponse from(Category category) {
        return new AdminCategoryResponse(
                category.getId(), category.getLabel(), category.getIcon(), category.getSiteScope(),
                category.isPrimary(), category.getDisplayOrder(), category.isEnabled());
    }
}
