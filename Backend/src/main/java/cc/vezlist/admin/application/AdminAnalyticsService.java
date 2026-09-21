package cc.vezlist.admin.application;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import cc.vezlist.admin.persistence.AdminAnalyticsRepository;
import cc.vezlist.admin.web.AdminAnalyticsSummaryResponse;
import cc.vezlist.shared.domain.SiteScope;

@Service
@Transactional(readOnly = true)
public class AdminAnalyticsService {
    private final AdminAnalyticsRepository analytics;

    public AdminAnalyticsService(AdminAnalyticsRepository analytics) {
        this.analytics = analytics;
    }

    public AdminAnalyticsSummaryResponse summary(SiteScope site) {
        return new AdminAnalyticsSummaryResponse(
                site.name(),
                analytics.totalUsers(),
                analytics.suspendedUsers(),
                analytics.totalListings(site),
                analytics.listingsByStatus(site),
                analytics.newListingsSince(site, 7),
                analytics.newListingsSince(site, 30),
                analytics.activeReportsCount(site),
                analytics.openModerationCasesCount(site));
    }
}
