package cc.vezlist.catalog.persistence;

import java.util.List;

import cc.vezlist.catalog.domain.Location;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LocationRepository extends JpaRepository<Location, String> {
    @EntityGraph(attributePaths = {"parent", "parent.parent"})
    List<Location> findByEnabledTrueOrderByDisplayOrderAscLabelAsc();

    @Query("""
            select place from Location place join fetch place.parent parent left join fetch parent.parent province
            where place.enabled = true and parent.enabled = true
              and ((place.type = cc.vezlist.catalog.domain.LocationType.AREA
                    and parent.type = cc.vezlist.catalog.domain.LocationType.PROVINCE)
                or (place.type = cc.vezlist.catalog.domain.LocationType.NEIGHBOURHOOD
                    and parent.type = cc.vezlist.catalog.domain.LocationType.AREA
                    and province.type = cc.vezlist.catalog.domain.LocationType.PROVINCE and province.enabled = true))
              and (:query = '' or locate(:query, lower(place.label)) > 0
                   or locate(:query, lower(parent.label)) > 0 or locate(:query, lower(province.label)) > 0)
            order by place.popular desc, place.displayOrder asc, place.label asc, place.id asc
            """)
    List<Location> searchEnabledAreas(@Param("query") String query, Pageable pageable);

    @Query(value = """
            SELECT ancestor.id FROM locations ancestor
            WHERE ancestor.id IN (:provinceId, :areaId)
               OR ancestor.id=(SELECT child.parent_id FROM locations child WHERE child.id=:areaId)
            ORDER BY ancestor.id FOR SHARE
            """, nativeQuery = true)
    List<String> lockSelectedAncestry(@Param("provinceId") String provinceId, @Param("areaId") String areaId);

    @Query("""
            select (count(place) > 0)
            from Location place join place.parent parent left join parent.parent province
            where place.id = :areaId and place.enabled = true and parent.enabled = true
              and ((place.type = cc.vezlist.catalog.domain.LocationType.AREA
                    and parent.id = :provinceId and parent.type = cc.vezlist.catalog.domain.LocationType.PROVINCE)
                or (place.type = cc.vezlist.catalog.domain.LocationType.NEIGHBOURHOOD
                    and parent.type = cc.vezlist.catalog.domain.LocationType.AREA
                    and province.id = :provinceId and province.enabled = true
                    and province.type = cc.vezlist.catalog.domain.LocationType.PROVINCE))
            """)
    boolean existsEnabledAreaInProvince(@Param("provinceId") String provinceId, @Param("areaId") String areaId);
}
