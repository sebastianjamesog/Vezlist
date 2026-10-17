package cc.vezlist.live.realtime;

import java.io.IOException;
import java.io.Reader;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Drain stderr without retaining media metadata or logging credential-bearing URLs. */
final class LiveEncoderDiagnostics {
    private record Signature(String text, String code) {}
    private static final List<Signature> SIGNATURES = List.of(
            new Signature("connection refused", "CONNECTION_REFUSED"),
            new Signature("connection timed out", "CONNECTION_TIMEOUT"),
            new Signature("connection reset", "CONNECTION_RESET"),
            new Signature("failed to resolve", "DNS_FAILURE"),
            new Signature("name or service not known", "DNS_FAILURE"),
            new Signature("network is unreachable", "NETWORK_UNREACHABLE"),
            new Signature("input/output error", "IO_ERROR"),
            new Signature("tls handshake", "TLS_ERROR"),
            new Signature("error in the pull function", "TLS_ERROR"),
            new Signature("certificate verify failed", "TLS_ERROR"),
            new Signature("403 forbidden", "PROVIDER_FORBIDDEN"),
            new Signature("401 unauthorized", "PROVIDER_UNAUTHORIZED"),
            new Signature("server error", "PROVIDER_ERROR"),
            new Signature("broken pipe", "BROKEN_PIPE"),
            new Signature("ebml header parsing failed", "INVALID_WEBM_HEADER"),
            new Signature("moov atom not found", "INVALID_MP4_HEADER"),
            new Signature("invalid data found", "INVALID_MEDIA_DATA"),
            new Signature("could not find codec parameters", "MISSING_CODEC_PARAMETERS"),
            new Signature("unknown encoder", "ENCODER_MISSING"),
            new Signature("error while opening encoder", "ENCODER_INITIALIZATION_FAILED"),
            new Signature("error initializing output stream", "OUTPUT_INITIALIZATION_FAILED"),
            new Signature("error opening output", "OUTPUT_OPEN_FAILED"),
            new Signature("not on whitelist", "PROTOCOL_REJECTED"),
            new Signature("cannot allocate memory", "MEMORY_ALLOCATION_FAILED"),
            new Signature("resource temporarily unavailable", "RESOURCE_UNAVAILABLE")
    );

    private LiveEncoderDiagnostics() {}

    static Set<String> read(Reader reader) throws IOException {
        Set<String> codes = new LinkedHashSet<>();
        char[] buffer = new char[1024];
        String tail = "";
        int count;
        boolean receivedOutput = false;
        while ((count = reader.read(buffer)) != -1) {
            receivedOutput |= count > 0;
            String window = tail + new String(buffer, 0, count).toLowerCase(Locale.ROOT);
            for (Signature signature : SIGNATURES) {
                if (window.contains(signature.text())) codes.add(signature.code());
            }
            // Keep only enough overlap for a signature split across reads, even
            // if FFmpeg emits a huge line without a newline. Always drain the pipe.
            tail = window.substring(Math.max(0, window.length() - 128));
        }
        if (codes.isEmpty()) codes.add(receivedOutput ? "UNCLASSIFIED_ENCODER_ERROR" : "NO_ERROR_OUTPUT");
        return codes;
    }
}
