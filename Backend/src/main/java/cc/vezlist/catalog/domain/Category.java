package cc.vezlist.catalog.domain;

import cc.vezlist.shared.domain.SiteScope;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "categories")
public class Category {

    @Id
    private String id;

    @Column(nullable = false)
    private String label;

    @Column(nullable = false)
    private String icon;

    @Enumerated(EnumType.STRING)
    @Column(name = "site_scope", nullable = false)
    private SiteScope siteScope;

    @Column(name = "primary_category", nullable = false)
    private boolean primary;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(nullable = false)
    private boolean enabled;

    protected Category() {
    }

    public String getId() { return id; }
    public String getLabel() { return label; }
    public String getIcon() { return icon; }
    public SiteScope getSiteScope() { return siteScope; }
    public boolean isPrimary() { return primary; }
    public int getDisplayOrder() { return displayOrder; }
    public boolean isEnabled() { return enabled; }
}
