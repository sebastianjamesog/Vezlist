package cc.vezlist.sellers.web;

import java.util.List;
import cc.vezlist.discovery.web.DiscoveryListingResponse;

public record SellerPageResponse(SellerResponse seller, long activeListingCount,
                                 List<DiscoveryListingResponse> items, boolean hasMore) { }
