package cc.vezlist.sellers.web;

import java.util.List;
import cc.vezlist.discovery.web.DiscoveryListingResponse;

/** {@code viewCount}/{@code likeCount} total the engagement on the seller's live posts on this site. */
public record SellerPageResponse(SellerResponse seller, long activeListingCount, long viewCount, long likeCount,
                                 List<DiscoveryListingResponse> items, boolean hasMore) { }
