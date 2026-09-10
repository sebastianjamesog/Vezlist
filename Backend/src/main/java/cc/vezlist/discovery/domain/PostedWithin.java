package cc.vezlist.discovery.domain;

import java.time.Duration;

public enum PostedWithin {
    ANY(null),
    HOURS_24(Duration.ofHours(24)),
    DAYS_7(Duration.ofDays(7)),
    DAYS_30(Duration.ofDays(30));

    private final Duration duration;

    PostedWithin(Duration duration) {
        this.duration = duration;
    }

    public Duration duration() {
        return duration;
    }
}
