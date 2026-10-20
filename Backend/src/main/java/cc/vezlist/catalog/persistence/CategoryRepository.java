package cc.vezlist.catalog.persistence;

import java.util.List;

import cc.vezlist.catalog.domain.Category;
import cc.vezlist.shared.domain.SiteScope;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CategoryRepository extends JpaRepository<Category, String> {
    List<Category> findBySiteScopeAndEnabledTrueOrderByDisplayOrderAscLabelAsc(SiteScope siteScope);

    List<Category> findBySiteScope(SiteScope siteScope);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select c from Category c where c.siteScope = :site order by c.id")
    List<Category> lockSite(@org.springframework.data.repository.query.Param("site") SiteScope site);

    boolean existsByIdAndSiteScopeAndEnabledTrue(String id, SiteScope siteScope);
}
