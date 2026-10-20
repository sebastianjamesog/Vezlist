package cc.vezlist.admin.web;

import cc.vezlist.admin.application.AdminAnalyticsService;
import cc.vezlist.shared.domain.SiteScope;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** GET /api/v1/admin/analytics/summary?site= — real aggregate counts, no fabricated numbers. */
@RestController
@RequestMapping("/api/v1/admin/analytics")
@PreAuthorize("hasAnyRole('MODERATOR', 'ADMIN')")
public class AdminAnalyticsController {
    private final AdminAnalyticsService analytics;

    public AdminAnalyticsController(AdminAnalyticsService analytics) {
        this.analytics = analytics;
    }

    @GetMapping("/queues")
    public java.util.Map<String, Long> queues(@RequestParam(required=false) SiteScope site) { return analytics.queueCounts(site); }

    @GetMapping("/summary")
    public AdminAnalyticsSummaryResponse summary(@RequestParam SiteScope site) {
        return analytics.summary(site);
    }
}
