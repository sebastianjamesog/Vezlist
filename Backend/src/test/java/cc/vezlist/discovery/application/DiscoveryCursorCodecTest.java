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
                UUID.fromString("00000000-0000-0000-0000-000000000123"));

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
                UUID.randomUUID());
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
}
