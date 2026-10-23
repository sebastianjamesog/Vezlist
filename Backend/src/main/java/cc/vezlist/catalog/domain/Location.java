package cc.vezlist.catalog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "locations")
public class Location {

    @Id
    private String id;

    @Column(nullable = false)
    private String label;

    @Enumerated(EnumType.STRING)
    @Column(name = "location_type", nullable = false)
    private LocationType type;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private Location parent;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(nullable = false)
    private boolean popular;

    @Column(nullable = false)
    private boolean enabled;

    protected Location() {
    }

    public Location(String id, String label, LocationType type, Location parent, int displayOrder, boolean popular) {
        if (type == LocationType.AREA && (parent == null || parent.getType() != LocationType.PROVINCE)) {
            throw new IllegalArgumentException("An area must have a parent province.");
        }
        if (type == LocationType.NEIGHBOURHOOD && (parent == null || parent.getType() != LocationType.AREA)) {
            throw new IllegalArgumentException("A neighbourhood must have a parent area.");
        }
        if (type == LocationType.PROVINCE && parent != null) {
            throw new IllegalArgumentException("A province cannot have a parent.");
        }
        this.id = id;
        this.label = label;
        this.type = type;
        this.parent = parent;
        this.displayOrder = displayOrder;
        this.popular = popular;
        this.enabled = true;
    }

    public void update(String label, int displayOrder, boolean popular) {
        this.label = label;
        this.displayOrder = displayOrder;
        this.popular = popular;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public Location getArea() {
        return type == LocationType.AREA ? this : type == LocationType.NEIGHBOURHOOD ? parent : null;
    }
    public Location getProvince() {
        return type == LocationType.PROVINCE ? this : getArea().getParent();
    }
    public boolean isHierarchyEnabled() {
        return enabled && (parent == null || parent.isHierarchyEnabled());
    }

    public String getId() { return id; }
    public String getLabel() { return label; }
    public LocationType getType() { return type; }
    public Location getParent() { return parent; }
    public int getDisplayOrder() { return displayOrder; }
    public boolean isPopular() { return popular; }
    public boolean isEnabled() { return enabled; }
}
