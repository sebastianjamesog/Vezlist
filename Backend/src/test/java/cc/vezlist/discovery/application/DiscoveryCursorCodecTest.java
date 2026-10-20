package cc.vezlist.discovery.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import cc.vezlist.discovery.application.DiscoveryCursorCodec.CursorAnchor;
import cc.vezlist.discovery.domain.DiscoverySort;
import org.junit.jupiter.api.Test;

class DiscoveryCursorCodecTest {
    private final DiscoveryCursorCodec codec = new DiscoveryCursorCodec(
            new ObjectMapper().registerModule(new JavaTimeModule()));

    @Test
    void cursorRoundTripsEveryPaginationAnchor() {
        Instant asOf = Instant.parse("2026-09-10T10:00:00Z");
        CursorAnchor anchor = new CursorAnchor(
                Instant.parse("2026-09-09T10:00:00Z"),
                new BigDecimal("42.50"),
                3.25,
                UUID.fromString("00000000-0000-0000-0000-000000000123"), true);

        String encoded = codec.encode(DiscoverySort.NEAREST, "fingerprint", asOf, anchor);
        DiscoveryCursorCodec.DecodedCursor decoded = codec.decode(
                encoded, DiscoverySort.NEAREST, "fingerprint");

        assertThat(decoded.asOf()).isEqualTo(asOf);
        assertThat(decoded.anchor()).isEqualTo(anchor);
    }

    @Test
    void cursorCannotBeReusedWithDifferentFiltersOrSort() {
        CursorAnchor anchor = new CursorAnchor(
                Instant.parse("2026-09-09T10:00:00Z"),
                BigDecimal.TEN,
                null,
                UUID.randomUUID(), null);
        String encoded = codec.encode(
                DiscoverySort.NEWEST,
                "original",
                Instant.parse("2026-09-10T10:00:00Z"),
                anchor);

        assertThatThrownBy(() -> codec.decode(encoded, DiscoverySort.NEWEST, "changed"))
                .isInstanceOf(DiscoveryCursorInvalidException.class);
        assertThatThrownBy(() -> codec.decode(encoded, DiscoverySort.PRICE_ASC, "original"))
                .isInstanceOf(DiscoveryCursorInvalidException.class);
        assertThatThrownBy(() -> codec.decode("not-a-cursor", DiscoverySort.NEWEST, "original"))
                .isInstanceOf(DiscoveryCursorInvalidException.class);
    }
    @Test
    void verifiedSortRequiresVerificationAnchorButOlderSortsAcceptMissingField() {
        Instant now = Instant.parse("2026-09-10T10:00:00Z");
        for (boolean verified : new boolean[] {true, false}) {
            CursorAnchor anchor = new CursorAnchor(now, BigDecimal.TEN, null, UUID.randomUUID(), verified);
            String encoded = codec.encode(DiscoverySort.VERIFIED_FIRST, "query", now, anchor);
            assertThat(codec.decode(encoded, DiscoverySort.VERIFIED_FIRST, "query").anchor()).isEqualTo(anchor);
        }
        CursorAnchor oldAnchor = new CursorAnchor(now, BigDecimal.TEN, null, UUID.randomUUID(), null);
        String invalid = codec.encode(DiscoverySort.VERIFIED_FIRST, "query", now, oldAnchor);
        assertThatThrownBy(() -> codec.decode(invalid, DiscoverySort.VERIFIED_FIRST, "query"))
                .isInstanceOf(DiscoveryCursorInvalidException.class);
        String encoded = codec.encode(DiscoverySort.NEWEST, "query", now, oldAnchor);
        String oldJson = new String(java.util.Base64.getUrlDecoder().decode(encoded), java.nio.charset.StandardCharsets.UTF_8)
                .replace(",\"verified\":null", "");
        String legacy = java.util.Base64.getUrlEncoder().withoutPadding()
                .encodeToString(oldJson.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(codec.decode(legacy, DiscoverySort.NEWEST, "query").anchor()).isEqualTo(oldAnchor);
    }

}
