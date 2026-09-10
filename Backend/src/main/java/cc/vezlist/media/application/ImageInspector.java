package cc.vezlist.media.application;

import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

import org.springframework.stereotype.Component;

@Component
public class ImageInspector {

    public Inspection inspect(InputStream input, long maximumBytes) throws IOException {
        try (input) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] first = new byte[12];
            int firstLength = 0;
            long size = 0;
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                size += read;
                if (size > maximumBytes) {
                    throw new MediaValidationException("The uploaded image is larger than allowed.");
                }
                if (firstLength < first.length) {
                    int copy = Math.min(read, first.length - firstLength);
                    System.arraycopy(buffer, 0, first, firstLength, copy);
                    firstLength += copy;
                }
                digest.update(buffer, 0, read);
            }
            return new Inspection(size, HexFormat.of().formatHex(digest.digest()), detectedType(first, firstLength));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable.", exception);
        }
    }

    private String detectedType(byte[] bytes, int length) {
        if (length >= 3
                && unsigned(bytes[0]) == 0xff
                && unsigned(bytes[1]) == 0xd8
                && unsigned(bytes[2]) == 0xff) {
            return "image/jpeg";
        }
        if (length >= 8
                && unsigned(bytes[0]) == 0x89
                && bytes[1] == 'P'
                && bytes[2] == 'N'
                && bytes[3] == 'G'
                && unsigned(bytes[4]) == 0x0d
                && unsigned(bytes[5]) == 0x0a
                && unsigned(bytes[6]) == 0x1a
                && unsigned(bytes[7]) == 0x0a) {
            return "image/png";
        }
        if (length >= 12
                && bytes[0] == 'R'
                && bytes[1] == 'I'
                && bytes[2] == 'F'
                && bytes[3] == 'F'
                && bytes[8] == 'W'
                && bytes[9] == 'E'
                && bytes[10] == 'B'
                && bytes[11] == 'P') {
            return "image/webp";
        }
        return null;
    }

    private int unsigned(byte value) {
        return value & 0xff;
    }

    public record Inspection(long sizeBytes, String checksumSha256, String contentType) {
    }
}
