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
        assertThatThrownBy(()->new LiveEncoder("ffmpeg").start("rtmps://localhost/in/1?secret","video/webm")).isInstanceOf(IllegalArgumentException.class);
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
        assertThatThrownBy(()->new LiveEncoder("ffmpeg").start("rtmps://localhost/in/1?secret","video/webm")).isInstanceOf(IllegalArgumentException.class);
        var live=mock(LiveSessionService.class);var encoder=mock(LiveEncoder.class);var redis=mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked") org.springframework.data.redis.core.ValueOperations<String,String> values=mock(org.springframework.data.redis.core.ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);when(values.setIfAbsent(anyString(),anyString(),any(java.time.Duration.class))).thenReturn(true);
        java.util.UUID room=java.util.UUID.randomUUID(),owner=java.util.UUID.randomUUID();
        when(live.consumeBroadcastTicket("ticket")).thenReturn(new LiveSessionService.BroadcastGrant(room,owner,"rtmps://vp-push-ix1.gvideo.co:443/in/12345?private-ingest-token",java.time.Instant.now().plusSeconds(60)));
        when(live.isBroadcastAllowed(room,owner)).thenReturn(true);when(encoder.available()).thenReturn(true);
        Process process=mock(Process.class);var input=new java.io.ByteArrayOutputStream();var exited=new java.util.concurrent.CompletableFuture<Process>();
        when(process.getOutputStream()).thenReturn(input);when(process.onExit()).thenReturn(exited);
        doAnswer(call->{exited.complete(process);return null;}).when(process).destroy();when(process.waitFor(anyLong(),any())).thenReturn(true);
        when(encoder.start("rtmps://vp-push-ix1.gvideo.co:443/in/12345?private-ingest-token","video/webm")).thenReturn(process);
        var bridge=new LiveBroadcastWebSocket(live,encoder,redis,new ObjectMapper(),1);
        var socket=mock(WebSocketSession.class);when(socket.getId()).thenReturn("valid");when(socket.isOpen()).thenReturn(true);
        bridge.afterConnectionEstablished(socket);bridge.handleMessage(socket,new TextMessage("{\"type\":\"authenticate\",\"ticket\":\"ticket\",\"mimeType\":\"video/webm\"}"));
        verify(socket).sendMessage(argThat(frame->frame instanceof TextMessage text && text.getPayload().equals("{\"type\":\"ready\"}")));
        bridge.handleMessage(socket,new BinaryMessage(new byte[]{1,2,3}));await().atMost(java.time.Duration.ofSeconds(2)).untilAsserted(()->assertThat(input.toByteArray()).containsExactly((byte)1,(byte)2,(byte)3));
        bridge.ended(new cc.vezlist.live.application.LiveSessionClosed(room));verify(process).destroy();verify(socket).close(CloseStatus.NORMAL);
    }
    @Test void acceptsSmallStartupBurstBeyondEightFramesAndDrainsWhenEncoderResumes() throws Exception {
        try(var fixture=new BlockedEncoder()) {
            fixture.frame(1024); fixture.awaitBlocked();
            for(int i=0;i<31;i++) fixture.frame(1024);
            verify(fixture.socket,never()).close(any());
            fixture.input.release.countDown();
            await().atMost(java.time.Duration.ofSeconds(2)).untilAsserted(()->assertThat(fixture.input.written.get()).isEqualTo(32*1024));
        }
    }
    @Test void capsTotalBytesIncludingCurrentlyBlockedWriteAndStopsEncoder() throws Exception {
        try(var fixture=new BlockedEncoder()) {
            fixture.frame(512*1024); fixture.awaitBlocked();
            for(int i=0;i<7;i++) fixture.frame(512*1024);
            verify(fixture.socket,never()).close(any());
            fixture.frame(1);
            verify(fixture.socket).sendMessage(argThat(frame->frame instanceof TextMessage text && text.getPayload().contains("BROADCAST_TOO_SLOW") && !text.getPayload().contains("Your connection")));
            verify(fixture.process).destroy(); verify(fixture.socket).close(CloseStatus.NORMAL);
            fixture.bridge.afterConnectionClosed(fixture.socket,CloseStatus.NORMAL);
            verify(fixture.process,times(1)).destroy();
        }
    }
    @Test void capsTinyFrameCountSeparatelyAndRejectsEmptyFrames() throws Exception {
        try(var fixture=new BlockedEncoder()) {
            fixture.frame(1); fixture.awaitBlocked();
            for(int i=0;i<LiveBroadcastWebSocket.MAX_BUFFERED_FRAMES;i++) fixture.frame(1);
            verify(fixture.socket,never()).close(any()); fixture.frame(1);
            verify(fixture.socket).close(CloseStatus.NORMAL);
        }
        try(var fixture=new BlockedEncoder()) {
            fixture.frame(0);
            verify(fixture.socket).sendMessage(argThat(frame->frame instanceof TextMessage text && text.getPayload().contains("INVALID_BROADCAST")));
            verify(fixture.socket).close(CloseStatus.NORMAL);
        }
    }
    @Test void watchdogStopsBlockedEncoderEvenBelowByteAndFrameCaps() throws Exception {
        try(var fixture=new BlockedEncoder()) {
            fixture.frame(1024); fixture.awaitBlocked();
            fixture.now.addAndGet(java.util.concurrent.TimeUnit.SECONDS.toNanos(16));
            fixture.bridge.maintain();
            verify(fixture.socket).sendMessage(argThat(frame->frame instanceof TextMessage text && text.getPayload().contains("BROADCAST_STALLED")));
            verify(fixture.process).destroy(); verify(fixture.socket).close(CloseStatus.NORMAL);
        }
    }
    private static final class BlockingInput extends java.io.OutputStream {
        final java.util.concurrent.CountDownLatch entered=new java.util.concurrent.CountDownLatch(1), release=new java.util.concurrent.CountDownLatch(1);
        final java.util.concurrent.atomic.AtomicInteger written=new java.util.concurrent.atomic.AtomicInteger();
        @Override public void write(int value) throws java.io.IOException { write(new byte[]{(byte)value},0,1); }
        @Override public void write(byte[] bytes,int offset,int length) throws java.io.IOException {
            entered.countDown();
            try { if(!release.await(5,java.util.concurrent.TimeUnit.SECONDS)) throw new java.io.IOException("Test encoder did not resume"); }
            catch(InterruptedException exception) { Thread.currentThread().interrupt(); throw new java.io.IOException(exception); }
            written.addAndGet(length);
        }
    }
    private static final class BlockedEncoder implements AutoCloseable {
        final BlockingInput input=new BlockingInput(); final Process process=mock(Process.class);
        final WebSocketSession socket=mock(WebSocketSession.class);
        final java.util.concurrent.atomic.AtomicLong now=new java.util.concurrent.atomic.AtomicLong(1);
        final LiveBroadcastWebSocket bridge;
        @SuppressWarnings("unchecked") BlockedEncoder() throws Exception {
            var live=mock(LiveSessionService.class); var encoder=mock(LiveEncoder.class); var redis=mock(StringRedisTemplate.class);
            org.springframework.data.redis.core.ValueOperations<String,String> values=mock(org.springframework.data.redis.core.ValueOperations.class);
            when(redis.opsForValue()).thenReturn(values); when(values.setIfAbsent(anyString(),anyString(),any(java.time.Duration.class))).thenReturn(true);
            var room=java.util.UUID.randomUUID(); var owner=java.util.UUID.randomUUID();
            when(live.consumeBroadcastTicket("ticket")).thenReturn(new LiveSessionService.BroadcastGrant(room,owner,"rtmps://vp-push-ix1.gvideo.co:443/in/12345?private-ingest-token",java.time.Instant.now().plusSeconds(60)));
            when(live.isBroadcastAllowed(room,owner)).thenReturn(true); when(encoder.available()).thenReturn(true);
            var exited=new java.util.concurrent.CompletableFuture<Process>();
            when(process.getOutputStream()).thenReturn(input); when(process.onExit()).thenReturn(exited);
            doAnswer(call->{input.release.countDown(); exited.complete(process); return null;}).when(process).destroy();
            when(process.waitFor(anyLong(),any())).thenReturn(true); when(encoder.start(anyString(),anyString())).thenReturn(process);
            bridge=new LiveBroadcastWebSocket(live,encoder,redis,new ObjectMapper(),1,now::get);
            when(socket.getId()).thenReturn("bounded-test"); when(socket.isOpen()).thenReturn(true);
            bridge.afterConnectionEstablished(socket);
            bridge.handleMessage(socket,new TextMessage("{\"type\":\"authenticate\",\"ticket\":\"ticket\",\"mimeType\":\"video/webm\"}"));
        }
        void frame(int size) throws Exception { bridge.handleMessage(socket,new BinaryMessage(new byte[size])); }
        void awaitBlocked() throws Exception { assertThat(input.entered.await(2,java.util.concurrent.TimeUnit.SECONDS)).isTrue(); }
        @Override public void close() { bridge.shutdown(); input.release.countDown(); }
    }
}
