package cc.vezlist.catalog.persistence;

import java.util.List;

import cc.vezlist.catalog.domain.Location;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LocationRepository extends JpaRepository<Location, String> {
    @EntityGraph(attributePaths = "parent")
    List<Location> findByEnabledTrueOrderByDisplayOrderAscLabelAsc();

    @Query("""
            select (count(area) > 0)
            from Location area join area.parent province
            where area.id = :areaId
              and area.type = cc.vezlist.catalog.domain.LocationType.AREA
              and area.enabled = true
              and province.id = :provinceId
              and province.enabled = true
            """)
    boolean existsEnabledAreaInProvince(
            @Param("provinceId") String provinceId,
            @Param("areaId") String areaId);
}
