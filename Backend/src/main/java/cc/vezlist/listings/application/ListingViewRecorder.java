package cc.vezlist.listings.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import cc.vezlist.listings.persistence.ListingViewRepository;

/**
 * Counts a listing view for everyone but the owner. Signed-in viewers are
 * keyed by account; anonymous ones by a SHA-256 of client address and user
 * agent, so no raw IP is stored. A failure here is logged and swallowed — a
 * view counter must never be the reason an ad fails to open.
 */
@Service
public class ListingViewRecorder {
    private static final Logger log = LoggerFactory.getLogger(ListingViewRecorder.class);
    private final ListingViewRepository views;

    public ListingViewRecorder(ListingViewRepository views) { this.views = views; }

    public void record(UUID listingId, UUID ownerId, UUID viewerId, String clientAddress, String userAgent) {
        if (viewerId != null && viewerId.equals(ownerId)) return;
        try {
            if (viewerId != null) {
                views.recordIfNew(listingId, viewerId, null);
            } else {
                views.recordIfNew(listingId, null, anonymousHash(clientAddress, userAgent));
            }
        } catch (RuntimeException exception) {
            log.warn("Could not record a view for listing {}", listingId, exception);
        }
    }

    static String anonymousHash(String clientAddress, String userAgent) {
        String source = (clientAddress == null ? "" : clientAddress) + "|" + (userAgent == null ? "" : userAgent);
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(source.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
