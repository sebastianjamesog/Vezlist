package cc.vezlist.shared.paging;
import java.time.Instant;
import java.util.UUID;
import java.util.Base64;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
class OpaqueCursorTest {
    @Test void preservesMicroseconds() {
        var anchor = new OpaqueCursor.Anchor(Instant.parse("2026-10-20T00:00:00.123456Z"), UUID.randomUUID());
        assertThat(OpaqueCursor.decode(OpaqueCursor.encode(anchor))).isEqualTo(anchor);
    }
    @Test void acceptsPreviouslyIssuedMillisecondCursors() {
        var anchor = new OpaqueCursor.Anchor(Instant.ofEpochMilli(123456), UUID.randomUUID());
        String old = Base64.getUrlEncoder().withoutPadding().encodeToString(("123456:" + anchor.id()).getBytes(StandardCharsets.UTF_8));
        assertThat(OpaqueCursor.decode(old)).isEqualTo(anchor);
    }
    @Test void rejectsMalformedCursor() {
        assertThatThrownBy(() -> OpaqueCursor.decode("bad")).isInstanceOf(IllegalArgumentException.class);
    }
}
