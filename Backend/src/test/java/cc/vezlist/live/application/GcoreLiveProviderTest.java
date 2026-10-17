package cc.vezlist.live.application;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class GcoreLiveProviderTest {
    private final ObjectMapper json=new ObjectMapper();
    private HttpClient client;
    private GcoreLiveProvider provider;
    private static final String RESPONSE="""
            {"id":12345,"active":true,"live":false,"backup_live":false,
             "auto_record":false,"dvr_enabled":false,"recording":false,
             "push_url":"rtmp://vp-push-ix1.gvideo.co/in/12345?private-ingest-token",
             "hls_cmaf_url":"https://delivery.gvideo.io/cmaf/12345/master.m3u8",
             "hls_mpegts_url":"https://delivery.gvideo.io/12345/master.m3u8"}
            """;
    @BeforeEach void setup() { client=mock(HttpClient.class); provider=new GcoreLiveProvider(json,"test-token",client); }

    @Test void createsPushStreamWithoutRecordingOrDvrAndUsesApiKeyAuthorization() throws Exception {
        response(201,RESPONSE); UUID session=UUID.randomUUID(); var stream=provider.create(session);
        HttpRequest request=request(); JsonNode body=body(request);
        assertThat(request.uri().toString()).isEqualTo("https://api.gcore.com/streaming/streams");
        assertThat(request.method()).isEqualTo("POST");
        assertThat(request.headers().firstValue("Authorization")).contains("APIKey test-token");
        assertThat(body.has("stream")).isFalse();
        assertThat(body.path("name").asText()).contains(session.toString());
        assertThat(body.path("client_entity_data").asText()).isEqualTo(session.toString());
        assertThat(body.path("auto_record").booleanValue()).isFalse();
        assertThat(body.path("dvr_enabled").booleanValue()).isFalse();
        assertThat(body.path("pull").booleanValue()).isFalse();
        assertThat(body.path("active").booleanValue()).isTrue();
        assertThat(stream.id()).isEqualTo("12345");
        assertThat(stream.streamKey()).isEqualTo("rtmps://vp-push-ix1.gvideo.co:443/in/12345?private-ingest-token");
        assertThat(stream.playbackId()).isEqualTo("https://delivery.gvideo.io/cmaf/12345/master.m3u8");
        assertThat(stream.status()).isEqualTo("idle"); assertThat(stream.assetIds()).isEmpty();
        assertThat(stream.toString()).doesNotContain("private-ingest-token","rtmps://");
    }
    @Test void disablesWithWrappedPatchPayloadAndDeletesIdempotently() throws Exception {
        response(200,RESPONSE); provider.disable("12345"); HttpRequest patch=request();
        assertThat(patch.method()).isEqualTo("PATCH");
        assertThat(body(patch)).isEqualTo(json.readTree("{\"stream\":{\"active\":false,\"auto_record\":false,\"dvr_enabled\":false}}"));
        reset(client); response(404, ""); provider.deleteStream("12345"); assertThat(request().method()).isEqualTo("DELETE");
    }
    @Test void mapsIngestSignalRatherThanEnabledFlagAndFailsClosedOnRecording() throws Exception {
        response(200,RESPONSE.replace("\"live\":false", "\"live\":true")); assertThat(provider.get("12345").status()).isEqualTo("active");
        response(200,RESPONSE.replace("\"backup_live\":false", "\"backup_live\":true")); assertThat(provider.get("12345").status()).isEqualTo("active");
        response(200,RESPONSE.replace("\"active\":true", "\"active\":false")); assertThat(provider.get("12345").status()).isEqualTo("disabled");
        response(200,RESPONSE.replace("\"auto_record\":false", "\"auto_record\":\"false\"")); assertThat(provider.get("12345").status()).isEqualTo("unsafe");
        for(String field:new String[]{"auto_record","dvr_enabled","recording"}) {
            response(200,RESPONSE.replace("\""+field+"\":false", "\""+field+"\":true")); assertThat(provider.get("12345").status()).isEqualTo("unsafe");
        }
    }
    @Test void retainsKnownIdForCleanupWhenProviderUrlsAreMissingOrUntrusted() throws Exception {
        response(201,"{\"id\":12345,\"active\":true,\"push_url\":\"rtmps://127.0.0.1/in/123?private\",\"hls_cmaf_url\":\"https://evil.example/master.m3u8\"}");
        var stream=provider.create(UUID.randomUUID()); assertThat(stream.id()).isEqualTo("12345");
        assertThat(stream.streamKey()).isNull(); assertThat(stream.playbackId()).isNull();
        assertThat(stream.status()).isEqualTo("unsafe");
    }
    @Test void returnsPublicHlsOnlyBeforeDeadlineAndSupportsLegacyHlsFallback() throws Exception {
        response(200,RESPONSE.replace("hls_cmaf_url", "ignored"));
        assertThat(provider.get("12345").playbackId()).isEqualTo("https://delivery.gvideo.io/12345/master.m3u8");
        String playback="https://delivery.gvideo.io/cmaf/12345/master.m3u8";
        assertThat(provider.playbackUrl(playback,Instant.now().plusSeconds(30))).isEqualTo(playback);
        assertThatThrownBy(()->provider.playbackUrl(playback,Instant.now().minusSeconds(1))).isInstanceOf(IllegalStateException.class);
    }
    @Test void missingStreamIsNullAndInvalidIdsNeverReachProvider() throws Exception {
        response(404,""); assertThat(provider.get("12345")).isNull(); clearInvocations(client);
        for(String id:new String[]{"../videos/1","mux-id","0","1?private"})
            assertThatThrownBy(()->provider.get(id)).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(client);
    }
    @Test void providerErrorsDoNotExposeApiTokenOrIngestSecrets() throws Exception {
        response(500,"{\"message\":\"test-token private-ingest-token\"}");
        assertThatThrownBy(()->provider.create(UUID.randomUUID())).isInstanceOf(IllegalStateException.class)
                .hasMessageNotContaining("test-token").hasMessageNotContaining("private-ingest-token").hasNoCause();
        when(client.send(any(HttpRequest.class), org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<String>>any()))
                .thenThrow(new IOException("private-ingest-token"));
        assertThatThrownBy(()->provider.get("12345")).hasMessageNotContaining("private-ingest-token").hasNoCause();
    }
    @Test void rejectsMissingCredentialsAndUnsafeStreamDestinations() {
        assertThat(new GcoreLiveProvider(json,"",client).configured()).isFalse();
        assertThat(new GcoreLiveProvider(json,"token\nheader",client).configured()).isFalse();
        assertThatThrownBy(()->new GcoreLiveProvider(json,"",client).create(UUID.randomUUID())).isInstanceOf(IllegalStateException.class);
        for(String url:new String[]{"rtmps://127.0.0.1/in/1?secret", "rtmps://vp.gvideo.co.attacker.com/in/1?secret",
                "rtmps://user:pass@vp.gvideo.co/in/1?secret", "file:///tmp/video", "rtmps://vp.gvideo.co:22/in/1?secret",
                "rtmps://vp.gvideo.co/in/1", "rtmps://vp.gvideo.co/in/1?secret#fragment"})
            assertThatThrownBy(()->GcoreStreamUrls.ingest(url)).isInstanceOf(IllegalArgumentException.class).hasMessage("Invalid Gcore stream URL.");
        for(String url:new String[]{"http://delivery.gvideo.io/master.m3u8", "https://evil.example/master.m3u8",
                "https://delivery.gvideo.io/video.mp4", "https://delivery.gvideo.io:8443/master.m3u8"})
            assertThatThrownBy(()->GcoreStreamUrls.playback(url)).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(client);
    }
    @SuppressWarnings("unchecked") private void response(int status,String body) throws Exception {
        HttpResponse<String> response=mock(HttpResponse.class); when(response.statusCode()).thenReturn(status); when(response.body()).thenReturn(body);
        when(client.send(any(HttpRequest.class), org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<String>>any())).thenReturn(response);
    }
    private HttpRequest request() throws Exception {
        ArgumentCaptor<HttpRequest> captured=ArgumentCaptor.forClass(HttpRequest.class);
        verify(client).send(captured.capture(),org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<String>>any()); return captured.getValue();
    }
    private JsonNode body(HttpRequest request) throws Exception {
        var subscriber=HttpResponse.BodySubscribers.ofString(StandardCharsets.UTF_8);
        request.bodyPublisher().orElseThrow().subscribe(new java.util.concurrent.Flow.Subscriber<java.nio.ByteBuffer>() {
            public void onSubscribe(java.util.concurrent.Flow.Subscription subscription) { subscriber.onSubscribe(subscription); }
            public void onNext(java.nio.ByteBuffer value) { subscriber.onNext(java.util.List.of(value)); }
            public void onError(Throwable error) { subscriber.onError(error); }
            public void onComplete() { subscriber.onComplete(); }
        });
        return json.readTree(subscriber.getBody().toCompletableFuture().get());
    }
}
