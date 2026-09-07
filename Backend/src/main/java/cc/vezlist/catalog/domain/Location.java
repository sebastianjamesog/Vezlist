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

    public String getId() { return id; }
    public String getLabel() { return label; }
    public LocationType getType() { return type; }
    public Location getParent() { return parent; }
    public int getDisplayOrder() { return displayOrder; }
    public boolean isPopular() { return popular; }
    public boolean isEnabled() { return enabled; }
}
