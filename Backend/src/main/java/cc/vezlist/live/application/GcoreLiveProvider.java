package cc.vezlist.live.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Gcore credentials and ingest URLs stay server-side and must never enter public DTOs. */
@Component
public class GcoreLiveProvider {
    // Internal legacy accessors: streamKey contains the full ingest URL; playbackId the HLS URL.
    public record Stream(String id, String streamKey, String playbackId, String status, List<String> assetIds) {
        @Override public String toString() { return "GcoreStream[id="+id+", status="+status+"]"; }
    }
    private final ObjectMapper json;
    private final String apiToken;
    private final HttpClient client;

    @Autowired
    public GcoreLiveProvider(ObjectMapper json, @Value("${vezlist.live.gcore-api-token:}") String apiToken) {
        this(json, apiToken, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8))
                .followRedirects(HttpClient.Redirect.NEVER).build());
    }

    GcoreLiveProvider(ObjectMapper json, String apiToken, HttpClient client) {
        this.json=json; this.apiToken=apiToken == null ? "" : apiToken.strip(); this.client=client;
    }

    public boolean configured() { return !apiToken.isBlank() && apiToken.chars().noneMatch(Character::isWhitespace); }

    public Stream create(UUID sessionId) {
        // Gcore create uses a flat payload; PATCH uses the stream wrapper (official streaming API).
        return stream(request("POST", "/streaming/streams", Map.of(
                "name", "Vezlist live "+sessionId, "client_entity_data", sessionId.toString(),
                "pull", false, "active", true, "auto_record", false, "dvr_enabled", false)));
    }

    public Stream get(String id) {
        JsonNode data=request("GET", "/streaming/streams/"+safeId(id), null);
        return data.isMissingNode() ? null : stream(data);
    }

    public void disable(String id) {
        request("PATCH", "/streaming/streams/"+safeId(id), Map.of("stream", Map.of(
                "active", false, "auto_record", false, "dvr_enabled", false)));
    }

    public void deleteStream(String id) { request("DELETE", "/streaming/streams/"+safeId(id), null); }

    /** Viewing is free. The session API and provider disable/delete control the live lifetime. */
    public String playbackUrl(String playbackId, Instant expiry) {
        if(expiry == null || !expiry.isAfter(Instant.now())) throw new IllegalStateException("This live session has ended.");
        return GcoreStreamUrls.playback(playbackId);
    }

    private Stream stream(JsonNode node) {
        String id=safeId(node.path("id").asText());
        // Preserve a created ID even with absent/invalid URLs, so durable cleanup can delete it.
        String ingest=null, playback=null;
        try { ingest=GcoreStreamUrls.ingest(node.path("push_url").asText()); } catch(IllegalArgumentException ignored) {}
        for(String field: List.of("hls_cmaf_url", "hls_mpegts_url", "hls_playlist_url")) {
            try { playback=GcoreStreamUrls.playback(node.path(field).asText()); break; }
            catch(IllegalArgumentException ignored) {}
        }
        boolean unsafe=!explicitlyFalse(node, "auto_record") || !explicitlyFalse(node, "dvr_enabled")
                || node.path("recording").asBoolean();
        String status=unsafe ? "unsafe" : !node.path("active").asBoolean() ? "disabled"
                : node.path("live").asBoolean() || node.path("backup_live").asBoolean() ? "active" : "idle";
        return new Stream(id, ingest, playback, status, List.of());
    }

    private JsonNode request(String method, String path, Object body) {
        if(!configured()) throw new IllegalStateException("Gcore streaming is not configured.");
        try {
            HttpRequest.Builder builder=HttpRequest.newBuilder(URI.create("https://api.gcore.com"+path))
                    .timeout(Duration.ofSeconds(12)).header("Authorization", "APIKey "+apiToken)
                    .header("Content-Type", "application/json").header("Accept", "application/json");
            builder.method(method, body==null ? HttpRequest.BodyPublishers.noBody()
                    : HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
            HttpResponse<String> response=client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()==404 && !"POST".equals(method)) return json.missingNode();
            if(response.statusCode()<200 || response.statusCode()>299)
                throw new IllegalStateException("Gcore request failed (HTTP "+response.statusCode()+").");
            return response.body().isBlank() ? json.missingNode() : json.readTree(response.body());
        } catch(InterruptedException exception) {
            Thread.currentThread().interrupt(); throw new IllegalStateException("Gcore request interrupted.");
        }
        catch(Exception exception) {
            // Transport errors can contain credentials. Never attach their text/cause.
            throw new IllegalStateException("Gcore request could not complete.");
        }
    }

    private static boolean explicitlyFalse(JsonNode node, String field) {
        return node.path(field).isBoolean() && !node.path(field).booleanValue();
    }

    private static String safeId(String id) {
        if(id==null || !id.matches("[1-9][0-9]{0,18}")) throw new IllegalArgumentException("Invalid provider identifier.");
        return id;
    }
}
