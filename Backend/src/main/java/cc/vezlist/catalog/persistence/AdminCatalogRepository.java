package cc.vezlist.catalog.persistence;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Reference-integrity checks the JPA-mapped {@code Category}/{@code Location} entities don't own themselves. */
@Repository
public class AdminCatalogRepository {
    private final JdbcTemplate jdbc;

    public AdminCatalogRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public long activeListingsReferencingCategory(String categoryId) {
        Long count = jdbc.queryForObject(
                "SELECT count(*) FROM listings WHERE category_id = ? AND status <> 'DELETED'", Long.class, categoryId);
        return count == null ? 0 : count;
    }

    public void lockLocation(String locationId) {
        jdbc.query("SELECT id FROM locations WHERE id=? FOR UPDATE", (rs, row) -> rs.getString("id"), locationId);
    }

    public boolean hasLocationChildren(String locationId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM locations WHERE parent_id=?)", Boolean.class, locationId));
    }

    // All statuses retain foreign keys and historical meaning, including deleted ads.
    public long activeListingsReferencingLocation(String locationId) {
        Long count = jdbc.queryForObject(
                "SELECT count(*) FROM listings WHERE (location_id = ? OR province_id = ?)",
                Long.class, locationId, locationId);
        return count == null ? 0 : count;
    }
}
