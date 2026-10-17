package cc.vezlist.live.realtime;

import java.io.Reader;
import java.io.StringReader;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class LiveEncoderDiagnosticsTest {
    @Test void identifiesTransportAndMediaFailuresWithoutExposingCredentials() throws Exception {
        String secret = "private-stream-token";
        String output = "Error opening output rtmps://push.gvideo.io/in/123?" + secret
                + "\nConnection refused\nEBML header parsing failed\n";
        var result = LiveEncoderDiagnostics.read(new StringReader(output));
        assertThat(result).contains("OUTPUT_OPEN_FAILED", "CONNECTION_REFUSED", "INVALID_WEBM_HEADER");
        assertThat(result.toString()).doesNotContain(secret, "rtmps", "gvideo", "123");
    }

    @Test void detectsErrorsSplitAcrossReadsAndDrainsLongOutput() throws Exception {
        StringReader source = new StringReader("x".repeat(100_000) + "Connection timed out");
        Reader smallChunks = new Reader() {
            @Override public int read(char[] buffer, int offset, int length) throws java.io.IOException {
                return source.read(buffer, offset, Math.min(length, 3));
            }
            @Override public void close() { source.close(); }
        };
        assertThat(LiveEncoderDiagnostics.read(smallChunks)).containsExactly("CONNECTION_TIMEOUT");
        assertThat(source.read()).isEqualTo(-1);
    }

    @Test void unknownMessagesAndEmptyOutputNeverLeakRawText() throws Exception {
        assertThat(LiveEncoderDiagnostics.read(new StringReader("secret-token unknown error")))
                .containsExactly("UNCLASSIFIED_ENCODER_ERROR");
        assertThat(LiveEncoderDiagnostics.read(new StringReader(""))).containsExactly("NO_ERROR_OUTPUT");
    }
}
