package cc.vezlist.saved.application;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import cc.vezlist.shared.domain.SiteScope;
import org.springframework.stereotype.Component;

@Component
public class SavedListingCursorCodec {
    private static final int VERSION = 1;

    private final ObjectMapper objectMapper;

    public SavedListingCursorCodec(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public String encode(UUID userId, SiteScope site, Instant asOf, CursorAnchor anchor) {
        CursorPayload payload = new CursorPayload(
                VERSION,
                binding(userId, site),
                asOf,
                anchor.savedAt(),
                anchor.listingId());
        try {
            byte[] json = objectMapper.writeValueAsBytes(payload);
            return Base64.getUrlEncoder().withoutPadding().encodeToString(json);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not encode a saved-listing cursor.", exception);
        }
    }

    public DecodedCursor decode(String encoded, UUID expectedUserId, SiteScope expectedSite) {
        try {
            byte[] json = Base64.getUrlDecoder().decode(encoded);
            CursorPayload payload = objectMapper.readValue(json, CursorPayload.class);
            String expectedBinding = binding(expectedUserId, expectedSite);
            if (payload.version() != VERSION
                    || payload.binding() == null
                    || !MessageDigest.isEqual(
                            payload.binding().getBytes(StandardCharsets.UTF_8),
                            expectedBinding.getBytes(StandardCharsets.UTF_8))
                    || payload.asOf() == null
                    || payload.savedAt() == null
                    || payload.savedAt().isAfter(payload.asOf())
                    || payload.listingId() == null) {
                throw new SavedListingCursorInvalidException();
            }
            return new DecodedCursor(
                    payload.asOf(),
                    new CursorAnchor(payload.savedAt(), payload.listingId()));
        } catch (SavedListingCursorInvalidException exception) {
            throw exception;
        } catch (RuntimeException | IOException exception) {
            throw new SavedListingCursorInvalidException();
        }
    }

    private String binding(UUID userId, SiteScope site) {
        try {
            String value = userId + "|" + site.name();
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable.", exception);
        }
    }

    public record CursorAnchor(Instant savedAt, UUID listingId) {
    }

    public record DecodedCursor(Instant asOf, CursorAnchor anchor) {
    }

    private record CursorPayload(
            int version,
            String binding,
            Instant asOf,
            Instant savedAt,
            UUID listingId) {
    }
}
