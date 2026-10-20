package cc.vezlist.sellers.application;

import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import cc.vezlist.discovery.web.DiscoveryListingResponse;
import cc.vezlist.media.storage.ObjectStorage;
import cc.vezlist.sellers.persistence.SellerRepository;
import cc.vezlist.sellers.web.SellerPageResponse;
import cc.vezlist.sellers.web.SellerResponse;
import cc.vezlist.sellers.web.TrendingSellerResponse;
import cc.vezlist.shared.domain.SiteScope;

@Service
public class SellerService {
    private static final int DEFAULT_LIMIT = 24;
    private static final int MAX_LIMIT = 50;
    private final SellerRepository sellers;
    private final ObjectStorage storage;
    public SellerService(SellerRepository sellers, ObjectStorage storage) {
        this.sellers = sellers;
        this.storage = storage;
    }
    @Transactional(readOnly = true)
    public SellerPageResponse publicProfile(UUID sellerId, SiteScope site, Integer requestedLimit) {
        int limit = requestedLimit == null ? DEFAULT_LIMIT : requestedLimit;
        if (limit < 1 || limit > MAX_LIMIT) throw new IllegalArgumentException("Limit must be between 1 and 50.");
        SellerRepository.SellerRow seller = sellers.findPublicSeller(sellerId, site);
        if (seller == null) throw new SellerNotFoundException();
        List<SellerRepository.ListingRow> fetched = sellers.findActiveListings(sellerId, site, limit + 1);
        boolean hasMore = fetched.size() > limit;
        List<DiscoveryListingResponse> items = fetched.stream().limit(limit).map(this::listing).toList();
        return new SellerPageResponse(new SellerResponse(seller.id(), seller.displayName(), seller.avatarUrl(),
                seller.memberSince(), seller.verified(), null), seller.activeListingCount(), seller.viewCount(),
                seller.likeCount(), items, hasMore);
    }
    @Transactional(readOnly = true)
    public List<TrendingSellerResponse> trending(SiteScope site, Integer requestedLimit) {
        int limit = requestedLimit == null ? DEFAULT_LIMIT : requestedLimit;
        if (limit < 1 || limit > MAX_LIMIT) throw new IllegalArgumentException("Limit must be between 1 and 50.");
        return sellers.findTrending(site, limit).stream().map(row -> new TrendingSellerResponse(row.id(),
                row.displayName(), row.avatarUrl(), row.verified(), row.postCount(), row.viewCount(), row.likeCount(),
                row.coverObjectKey() == null ? null : storage.authorizeDownload(row.coverObjectKey()).toString(), row.coverListingId()))
                .toList();
    }
    private DiscoveryListingResponse listing(SellerRepository.ListingRow row) {
        String imageUrl = row.coverObjectKey() == null ? null : storage.authorizeDownload(row.coverObjectKey()).toString();
        return new DiscoveryListingResponse(row.id(), row.site(), row.title(), row.businessName(), row.price(),
                row.categoryId(), row.categoryLabel(), row.provinceId(), row.provinceLabel(), row.locationId(),
                row.locationLabel(), null, null, null, row.verified(), imageUrl, row.photoCount(),
                row.publishedAt(), row.viewCount());
    }
}
