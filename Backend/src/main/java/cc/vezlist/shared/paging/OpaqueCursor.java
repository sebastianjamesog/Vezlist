package cc.vezlist.shared.paging;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

/**
 * A tiny keyset-pagination cursor for internal, staff-facing admin listings.
 *
 * <p>The admin console lists (users, listings, audit feed) are all ordered by
 * {@code created_at DESC, id DESC} and paginate with a simple opaque cursor
 * encoding that anchor, following the same keyset-pagination idea already
 * used by {@code SavedListingCursorCodec} and {@code DiscoveryCursorCodec}.
 * Unlike those cursors this one is not bound to a caller identity or scoped
 * query, because every caller of an admin endpoint is already required to
 * hold the MODERATOR/ADMIN role by {@code SecurityConfig} and
 * {@code @PreAuthorize} — there is nothing user-scoped to bind to, and the
 * cursor carries no sensitive data, only a timestamp and an id.</p>
 */
public final class OpaqueCursor {

    private OpaqueCursor() {
    }

    public record Anchor(Instant createdAt, UUID id) {
    }

    public static String encode(Anchor anchor) {
        String raw = anchor.createdAt() + "|" + anchor.id();
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * Returns the decoded anchor, or {@code null} when no cursor was supplied.
     *
     * @throws IllegalArgumentException if a non-blank cursor cannot be decoded
     */
    public static Anchor decode(String encoded) {
        if (encoded == null || encoded.isBlank()) {
            return null;
        }
        try {
            String raw = new String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8);
            boolean precise = raw.indexOf('|') >= 0;
            int separator = raw.indexOf(precise ? '|' : ':');
            if (separator < 0) {
                throw new IllegalArgumentException("Malformed cursor.");
            }
            Instant createdAt = precise ? Instant.parse(raw.substring(0, separator))
                    : Instant.ofEpochMilli(Long.parseLong(raw.substring(0, separator)));
            UUID id = UUID.fromString(raw.substring(separator + 1));
            return new Anchor(createdAt, id);
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("Invalid or expired cursor.", exception);
        }
    }
}
