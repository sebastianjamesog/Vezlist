package cc.vezlist.media.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.security.MessageDigest;
import java.util.HexFormat;

import org.junit.jupiter.api.Test;

class ImageInspectorTest {
    private final ImageInspector inspector = new ImageInspector();

    @Test
    void identifiesJpegPngAndWebpFromBytes() throws Exception {
        byte[] jpeg = {(byte) 0xff, (byte) 0xd8, (byte) 0xff, 1, 2, 3};
        byte[] png = {(byte) 0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a, 1};
        byte[] webp = {'R', 'I', 'F', 'F', 1, 2, 3, 4, 'W', 'E', 'B', 'P', 1};

        assertThat(inspector.inspect(new ByteArrayInputStream(jpeg), 100).contentType())
                .isEqualTo("image/jpeg");
        assertThat(inspector.inspect(new ByteArrayInputStream(png), 100).contentType())
                .isEqualTo("image/png");
        assertThat(inspector.inspect(new ByteArrayInputStream(webp), 100).contentType())
                .isEqualTo("image/webp");
    }

    @Test
    void calculatesExactSizeAndSha256() throws Exception {
        byte[] image = {(byte) 0xff, (byte) 0xd8, (byte) 0xff, 1, 2, 3};
        ImageInspector.Inspection result = inspector.inspect(new ByteArrayInputStream(image), image.length);

        assertThat(result.sizeBytes()).isEqualTo(image.length);
        assertThat(result.checksumSha256()).isEqualTo(
                HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(image)));
    }

    @Test
    void rejectsStreamsLargerThanTheConfiguredLimit() {
        assertThatThrownBy(() -> inspector.inspect(new ByteArrayInputStream(new byte[11]), 10))
                .isInstanceOf(MediaValidationException.class)
                .hasMessageContaining("larger");
    }
}
