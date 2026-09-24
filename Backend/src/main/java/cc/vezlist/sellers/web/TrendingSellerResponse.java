package cc.vezlist.sellers.web;

import java.util.UUID;

/**
 * One creator on the trending board. {@code coverUrl} is a short-lived signed
 * URL for the cover of their best-performing live post, or null when none of
 * their posts has a READY image.
 */
public record TrendingSellerResponse(UUID id, String displayName, String avatarUrl, boolean verified,
                                     long postCount, long viewCount, long likeCount, String coverUrl) { }
