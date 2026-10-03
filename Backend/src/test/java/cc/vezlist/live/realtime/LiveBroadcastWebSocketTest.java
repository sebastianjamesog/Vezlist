package cc.vezlist.live.realtime;

import cc.vezlist.live.application.LiveSessionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.socket.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;

class LiveBroadcastWebSocketTest {
    @Test void rejectsUnsupportedFormatsAndMissingEncoder() throws Exception {
        assertThat(LiveEncoder.demuxer("video/webm;codecs=vp8,opus")).isEqualTo("matroska");
        assertThat(LiveEncoder.demuxer("video/mp4;codecs=avc1.42E01E,mp4a.40.2")).isEqualTo("mov");
        assertThatThrownBy(()->LiveEncoder.demuxer("http://attacker/video")).isInstanceOf(IllegalArgumentException.class);
        var live=mock(LiveSessionService.class);var encoder=mock(LiveEncoder.class);
        var bridge=new LiveBroadcastWebSocket(live,encoder,mock(StringRedisTemplate.class),new ObjectMapper(),1);
        var socket=mock(WebSocketSession.class);when(socket.getId()).thenReturn("first");when(socket.isOpen()).thenReturn(true);
        bridge.afterConnectionEstablished(socket);
        bridge.handleMessage(socket,new TextMessage("{\"type\":\"authenticate\",\"ticket\":\"private\",\"mimeType\":\"video/webm\"}"));
        verifyNoInteractions(live);verify(socket).close(CloseStatus.NORMAL);verify(encoder,never()).start(anyString(),anyString());
    }
    @Test void videoBeforeAuthenticationClosesWithoutStartingProcess() throws Exception {
        var encoder=mock(LiveEncoder.class);var bridge=new LiveBroadcastWebSocket(mock(LiveSessionService.class),encoder,mock(StringRedisTemplate.class),new ObjectMapper(),1);
        var socket=mock(WebSocketSession.class);when(socket.getId()).thenReturn("first");when(socket.isOpen()).thenReturn(true);
        bridge.afterConnectionEstablished(socket);bridge.handleMessage(socket,new BinaryMessage(new byte[]{1,2}));
        verifyNoInteractions(encoder);verify(socket).close(CloseStatus.NORMAL);
    }
    @Test void authenticatedVideoIsPipedToEncoderAndEndingKillsProcess() throws Exception {
        var live=mock(LiveSessionService.class);var encoder=mock(LiveEncoder.class);var redis=mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked") org.springframework.data.redis.core.ValueOperations<String,String> values=mock(org.springframework.data.redis.core.ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);when(values.setIfAbsent(anyString(),anyString(),any(java.time.Duration.class))).thenReturn(true);
        java.util.UUID room=java.util.UUID.randomUUID(),owner=java.util.UUID.randomUUID();
        when(live.consumeBroadcastTicket("ticket")).thenReturn(new LiveSessionService.BroadcastGrant(room,owner,"secret-key",java.time.Instant.now().plusSeconds(60)));
        when(live.isBroadcastAllowed(room,owner)).thenReturn(true);when(encoder.available()).thenReturn(true);
        Process process=mock(Process.class);var input=new java.io.ByteArrayOutputStream();var exited=new java.util.concurrent.CompletableFuture<Process>();
        when(process.getOutputStream()).thenReturn(input);when(process.onExit()).thenReturn(exited);
        doAnswer(call->{exited.complete(process);return null;}).when(process).destroy();when(process.waitFor(anyLong(),any())).thenReturn(true);
        when(encoder.start("secret-key","video/webm")).thenReturn(process);
        var bridge=new LiveBroadcastWebSocket(live,encoder,redis,new ObjectMapper(),1);
        var socket=mock(WebSocketSession.class);when(socket.getId()).thenReturn("valid");when(socket.isOpen()).thenReturn(true);
        bridge.afterConnectionEstablished(socket);bridge.handleMessage(socket,new TextMessage("{\"type\":\"authenticate\",\"ticket\":\"ticket\",\"mimeType\":\"video/webm\"}"));
        verify(socket).sendMessage(argThat(frame->frame instanceof TextMessage text && text.getPayload().equals("{\"type\":\"ready\"}")));
        bridge.handleMessage(socket,new BinaryMessage(new byte[]{1,2,3}));await().atMost(java.time.Duration.ofSeconds(2)).untilAsserted(()->assertThat(input.toByteArray()).containsExactly((byte)1,(byte)2,(byte)3));
        bridge.ended(new cc.vezlist.live.application.LiveSessionClosed(room));verify(process).destroy();verify(socket).close(CloseStatus.NORMAL);
    }
}
