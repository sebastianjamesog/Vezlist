package cc.vezlist.discovery.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import cc.vezlist.discovery.application.FeaturedFeedService.Candidate;
import cc.vezlist.discovery.application.FeaturedFeedService.Feed;
import org.junit.jupiter.api.Test;

class FeaturedFeedServiceTest {
    private static final Instant NOW = Instant.parse("2026-09-28T12:00:00Z");

    @Test
    void explicitAvailabilityOwnsTheAvailableNowFeed() {
        assertThat(FeaturedFeedService.assign(candidate(30, true, 10, 0), NOW, 0, 0))
                .isEqualTo(Feed.AVAILABLE_NOW);
    }

    @Test
    void freshAndTrendingCandidatesMoveWithSlotPressure() {
        Candidate both = candidate(1, false, 3, 0);

        assertThat(FeaturedFeedService.assign(both, NOW, 0, 0)).isEqualTo(Feed.TRENDING);
        assertThat(FeaturedFeedService.assign(both, NOW, 0, 5)).isEqualTo(Feed.NEW_TODAY);
    }

    @Test
    void recentFeaturedExposureWeakensRawSaveCounts() {
        assertThat(FeaturedFeedService.assign(candidate(30, false, 2, 20), NOW, 0, 0))
                .isNull();
        assertThat(FeaturedFeedService.assign(candidate(30, false, 2, 0), NOW, 0, 0))
                .isEqualTo(Feed.TRENDING);
    }

    @Test
    void olderUnengagedAdsStayInNormalBrowseWithoutAFeaturedSlot() {
        assertThat(FeaturedFeedService.assign(candidate(30, false, 0, 0), NOW, 0, 0))
                .isNull();
    }

    private Candidate candidate(long ageHours, boolean available, long saves, long slots) {
        return new Candidate(UUID.randomUUID(), NOW.minus(Duration.ofHours(ageHours)),
                available, saves, slots, null);
    }
}
