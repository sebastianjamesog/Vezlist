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

    public long activeListingsReferencingLocation(String locationId) {
        Long count = jdbc.queryForObject(
                "SELECT count(*) FROM listings WHERE (location_id = ? OR province_id = ?) AND status <> 'DELETED'",
                Long.class, locationId, locationId);
        return count == null ? 0 : count;
    }
}
