package cc.vezlist.saved.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import cc.vezlist.saved.application.SavedListingCursorCodec.CursorAnchor;
import cc.vezlist.shared.domain.SiteScope;
import org.junit.jupiter.api.Test;

class SavedListingCursorCodecTest {
    private final SavedListingCursorCodec codec = new SavedListingCursorCodec(
            new ObjectMapper().registerModule(new JavaTimeModule()));

    @Test
    void cursorRoundTripsAndIsBoundToTheUserAndSite() {
        UUID userId = UUID.randomUUID();
        Instant asOf = Instant.parse("2026-09-10T12:00:00Z");
        CursorAnchor anchor = new CursorAnchor(
                Instant.parse("2026-09-10T11:00:00Z"),
                UUID.fromString("00000000-0000-0000-0000-000000000123"));

        String encoded = codec.encode(userId, SiteScope.MARKETPLACE, asOf, anchor);
        SavedListingCursorCodec.DecodedCursor decoded = codec.decode(
                encoded, userId, SiteScope.MARKETPLACE);

        assertThat(decoded.asOf()).isEqualTo(asOf);
        assertThat(decoded.anchor()).isEqualTo(anchor);
        assertThatThrownBy(() -> codec.decode(encoded, UUID.randomUUID(), SiteScope.MARKETPLACE))
                .isInstanceOf(SavedListingCursorInvalidException.class);
        assertThatThrownBy(() -> codec.decode(encoded, userId, SiteScope.PERSONALS))
                .isInstanceOf(SavedListingCursorInvalidException.class);
    }

    @Test
    void malformedCursorIsRejected() {
        assertThatThrownBy(() -> codec.decode(
                "not-a-cursor", UUID.randomUUID(), SiteScope.MARKETPLACE))
                .isInstanceOf(SavedListingCursorInvalidException.class);
    }
}
