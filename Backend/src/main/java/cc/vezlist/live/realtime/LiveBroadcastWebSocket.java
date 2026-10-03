package cc.vezlist.live.realtime;

import cc.vezlist.live.application.LiveSessionService;
import cc.vezlist.live.application.LiveSessionClosed;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.BinaryWebSocketHandler;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;

@Component
public class LiveBroadcastWebSocket extends BinaryWebSocketHandler {
    private final LiveSessionService live; private final LiveEncoder encoder; private final StringRedisTemplate redis; private final ObjectMapper json;
    private final Semaphore slots; private final int maximum;
    private final Map<String,Broadcast> sockets=new ConcurrentHashMap<>();
    private static final class Broadcast {
        final WebSocketSession socket; final long connected=System.currentTimeMillis(); final String lock=UUID.randomUUID().toString();
        final BlockingQueue<byte[]> queue=new ArrayBlockingQueue<>(8); final AtomicBoolean closed=new AtomicBoolean();
        volatile LiveSessionService.BroadcastGrant grant; volatile Process process; volatile boolean slot; volatile long chunkAt=System.currentTimeMillis();
        Broadcast(WebSocketSession socket) { this.socket=new ConcurrentWebSocketSessionDecorator(socket,2000,16384); }
    }
    public LiveBroadcastWebSocket(LiveSessionService live,LiveEncoder encoder,StringRedisTemplate redis,ObjectMapper json,@Value("${vezlist.live.max-broadcasts-per-node:4}") int maximum) { this.live=live; this.encoder=encoder; this.redis=redis; this.json=json; this.maximum=Math.max(1,maximum); this.slots=new Semaphore(this.maximum); }
    @Override public synchronized void afterConnectionEstablished(WebSocketSession socket) throws Exception {
        socket.setBinaryMessageSizeLimit(512*1024); socket.setTextMessageSizeLimit(2048);
        if(sockets.size()>=maximum+8) { socket.close(CloseStatus.SERVICE_OVERLOAD); return; }
        sockets.put(socket.getId(),new Broadcast(socket));
    }
    @Override protected void handleTextMessage(WebSocketSession socket,TextMessage message) {
        Broadcast b=sockets.get(socket.getId()); if(b==null) return;
        synchronized(b) {
        if(b.closed.get()) return;
        try {
            var body=json.readTree(message.getPayload());
            if(body.path("type").asText().equals("stop")) { stop(b); return; }
            if(b.grant!=null || !body.path("type").asText().equals("authenticate")) throw new IllegalArgumentException("Invalid broadcast authentication");
            String mime=body.path("mimeType").asText(); LiveEncoder.demuxer(mime);
            if(!encoder.available()) { fail(b,"ENCODER_UNAVAILABLE","Live broadcasting is not configured yet."); return; }
            var grant=live.consumeBroadcastTicket(body.path("ticket").asText());
            if(!live.isBroadcastAllowed(grant.sessionId(),grant.ownerId())) { fail(b,"LIVE_ENDED","This live session is no longer available."); return; }
            if(!slots.tryAcquire()) { fail(b,"BROADCAST_BUSY","Broadcast capacity is full. Please try again shortly."); return; }
            b.slot=true; b.grant=grant;
            if(!Boolean.TRUE.equals(redis.opsForValue().setIfAbsent(lockKey(b),b.lock,Duration.ofSeconds(30)))) { fail(b,"ALREADY_BROADCASTING","This session is broadcasting from another connection."); return; }
            b.process=encoder.start(grant.streamKey(),mime);
            Thread.ofVirtual().name("live-encoder-input").start(()->write(b));
            b.process.onExit().thenRun(()-> { if(!b.closed.get()) fail(b,"BROADCAST_INTERRUPTED","The broadcast connection stopped. Reconnect your camera to continue."); });
            send(b,Map.of("type","ready"));
        } catch(IllegalArgumentException ex) { fail(b,"INVALID_BROADCAST",ex.getMessage()); }
        catch(Exception ex) { fail(b,"BROADCAST_UNAVAILABLE","Unable to connect the broadcast. Please try again."); }
        }
    }
    @Override protected void handleBinaryMessage(WebSocketSession socket,BinaryMessage message) {
        Broadcast b=sockets.get(socket.getId()); if(b==null) return;
        if(b.grant==null||b.process==null||b.closed.get()) { fail(b,"NOT_READY","Authenticate before sending video."); return; }
        if(!message.isLast()||message.getPayloadLength()>512*1024) { fail(b,"CHUNK_TOO_LARGE","Video chunks are too large. Reconnect your camera."); return; }
        byte[] bytes=new byte[message.getPayloadLength()]; message.getPayload().get(bytes);
        b.chunkAt=System.currentTimeMillis();
        if(!b.queue.offer(bytes)) fail(b,"BROADCAST_TOO_SLOW","Your connection cannot keep up. Reconnect to try again.");
    }
    private void write(Broadcast b) {
        try(var input=b.process.getOutputStream()) {
            while(!b.closed.get()) { byte[] data=b.queue.poll(1,TimeUnit.SECONDS); if(data!=null) { input.write(data); input.flush(); } }
        } catch(Exception ex) { if(ex instanceof InterruptedException) Thread.currentThread().interrupt(); if(!b.closed.get()) fail(b,"BROADCAST_INTERRUPTED","The video connection was interrupted. Please reconnect."); }
    }
    @Scheduled(fixedDelay=5000) public void maintain() {
        for(Broadcast b:sockets.values()) try {
            if(b.grant==null) { if(System.currentTimeMillis()-b.connected>10000) stop(b); continue; }
            if(System.currentTimeMillis()-b.chunkAt>20000 || !live.isBroadcastAllowed(b.grant.sessionId(),b.grant.ownerId())) { fail(b,"LIVE_ENDED","The live session has ended or the camera disconnected."); continue; }
            Long kept=redis.execute(new DefaultRedisScript<>("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('EXPIRE',KEYS[1],30) else return 0 end",Long.class),List.of(lockKey(b)),b.lock);
            if(!Long.valueOf(1).equals(kept)) fail(b,"BROADCAST_INTERRUPTED","Broadcast ownership expired. Please reconnect.");
        } catch(Exception ex) { fail(b,"BROADCAST_INTERRUPTED","The broadcast connection was interrupted. Please reconnect."); }
    }
    @EventListener public void ended(LiveSessionClosed event) { for(Broadcast b:sockets.values()) if(b.grant!=null&&b.grant.sessionId().equals(event.sessionId())) stop(b); }
    @Override public void afterConnectionClosed(WebSocketSession socket,CloseStatus status) { Broadcast b=sockets.get(socket.getId()); if(b!=null) stop(b); }
    @Override public void handleTransportError(WebSocketSession socket,Throwable error) { Broadcast b=sockets.get(socket.getId()); if(b!=null) stop(b); }
    private void send(Broadcast b,Object data) { try { if(b.socket.isOpen()) b.socket.sendMessage(new TextMessage(json.writeValueAsString(data))); } catch(Exception ex) { stop(b); } }
    private void fail(Broadcast b,String code,String message) { send(b,Map.of("type","error","code",code,"message",message)); stop(b); }
    private String lockKey(Broadcast b) { return LiveChatStore.prefix(b.grant.sessionId())+"broadcast"; }
    private void stop(Broadcast b) {
        synchronized(b) {
        if(!b.closed.compareAndSet(false,true)) return;
        sockets.remove(b.socket.getId()); b.queue.clear();
        if(b.process!=null) {
            if(b.slot) b.process.onExit().thenRun(slots::release);
            b.process.destroy();
            Thread.ofVirtual().start(()-> { try { if(!b.process.waitFor(2,TimeUnit.SECONDS)) b.process.destroyForcibly(); } catch(InterruptedException ex) { Thread.currentThread().interrupt(); b.process.destroyForcibly(); } });
        } else if(b.slot) slots.release();
        if(b.grant!=null) try { redis.execute(new DefaultRedisScript<>("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",Long.class),List.of(lockKey(b)),b.lock); } catch(Exception ignored) {}
        try { b.socket.close(CloseStatus.NORMAL); } catch(Exception ignored) {}
        }
    }
    @PreDestroy public void shutdown() { sockets.values().forEach(this::stop); }
}
