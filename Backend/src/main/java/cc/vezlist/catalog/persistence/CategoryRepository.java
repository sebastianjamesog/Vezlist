package cc.vezlist.catalog.persistence;

import java.util.List;

import cc.vezlist.catalog.domain.Category;
import cc.vezlist.shared.domain.SiteScope;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CategoryRepository extends JpaRepository<Category, String> {
    List<Category> findBySiteScopeAndEnabledTrueOrderByDisplayOrderAscLabelAsc(SiteScope siteScope);

    List<Category> findBySiteScope(SiteScope siteScope);

    boolean existsByIdAndSiteScopeAndEnabledTrue(String id, SiteScope siteScope);
}
