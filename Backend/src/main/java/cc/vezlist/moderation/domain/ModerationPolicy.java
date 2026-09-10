package cc.vezlist.moderation.domain;

import cc.vezlist.shared.domain.SiteScope;

/** Versioned conservative baseline for every enabled category; no category bypasses review. */
public record ModerationPolicy(String version, int approvalsRequired, boolean eligibilityRequired) {
    public static ModerationPolicy forListing(SiteScope site, String categoryId) {
        if (categoryId == null || categoryId.isBlank()) throw new IllegalArgumentException("Category is required.");
        return site == SiteScope.PERSONALS
                ? new ModerationPolicy("personals-v1", 2, true)
                : new ModerationPolicy("marketplace-v1", 1, false);
    }

    public enum ReportReason { SPAM, FRAUD, PROHIBITED, SAFETY, OTHER }
    public enum Decision { APPROVE, REJECT, REMOVE, DISMISS }
    public enum Verdict { PASS, BLOCK }
    public enum PublicReason {
        MISLEADING_CONTENT("Please correct misleading or inaccurate information."),
        PROHIBITED_CONTENT("This listing contains content that is not allowed."),
        UNSAFE_CONTENT("This listing does not meet our safety requirements."),
        MEDIA_REQUIRES_CHANGES("Please replace the images that do not meet our requirements."),
        ELIGIBILITY_NOT_CONFIRMED("We could not confirm eligibility for this listing."),
        DUPLICATE_OR_SPAM("This listing was identified as duplicate content or spam.");

        private final String message;
        PublicReason(String message) { this.message = message; }
        public String message() { return message; }
    }
}
