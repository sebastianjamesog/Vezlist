package cc.vezlist.admin.web;

import java.util.Map;

public record AdminAnalyticsSummaryResponse(
        String site,
        long totalUsers,
        long suspendedUsers,
        long totalListings,
        Map<String, Long> listingsByStatus,
        long newListingsLast7Days,
        long newListingsLast30Days,
        long activeReportsCount,
        long openModerationCasesCount) {
}
