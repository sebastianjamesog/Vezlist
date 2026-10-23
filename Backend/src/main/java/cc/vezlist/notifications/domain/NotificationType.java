package cc.vezlist.notifications.domain;

public enum NotificationType {
    APPEAL_SUBMITTED("Appeal received", "Your appeal was received. Follow its review status in My Ads.", "/profile/ads"),
    APPEAL_APPROVED("Appeal approved", "Your appeal was approved and your ad was restored. View its current status in My Ads.", "/profile/ads"),
    APPEAL_REJECTED("Appeal not approved", "Your appeal was reviewed and the moderation decision was upheld. View the reason in My Ads.", "/profile/ads"),
    LISTING_APPROVED("Ad approved", "Your ad was approved. View its current status in My Ads.", "/profile/ads"),
    LISTING_REJECTED("Ad review update", "Your ad was rejected. View the review reason and your options in My Ads.", "/profile/ads"),
    LISTING_REMOVED("Ad removed", "Your ad was removed. View the review reason and appeal options in My Ads.", "/profile/ads"),
    LISTING_EXPIRING("Ad expiring soon", "Your ad expires within 24 hours. View its details in My Ads.", "/profile/ads"),
    LISTING_SAVED_AGGREGATE("Your ad received saves", "Your ad received saves. View its latest activity in My Ads.", "/profile/ads"),
    SUPPORT_REPLY("Support update", "There is an update from support. Visit Support to review your tickets.", "/support"),
    PAYMENT_EVENT("Payment update", "There is an update to your payment activity.", "/profile/notifications"),
    SECURITY_EVENT("Account security update", "Your account password was changed. If this was not you, secure your account and contact support.", "/profile/settings");

    private final String title;
    private final String message;
    private final String href;
    NotificationType(String title, String message, String href) {
        this.title = title; this.message = message; this.href = href;
    }
    public String title() { return title; }
    public String message() { return message; }
    public String href() { return href; }
}
