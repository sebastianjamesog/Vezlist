package cc.vezlist.live.realtime;

import cc.vezlist.live.application.LiveException;
import cc.vezlist.live.application.LiveSessionClosed;
import cc.vezlist.live.application.LiveSessionService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.listener.PatternTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;

@Component
public class LiveChatWebSocket extends TextWebSocketHandler implements MessageListener {
    private final LiveChatStore store; private final LiveSessionService live; private final ObjectMapper json;
    private final ObjectProvider<RedisMessageListenerContainer> containers; private final int maxConnections;
    private final Map<String,Connection> connections=new ConcurrentHashMap<>();
    private final Map<UUID,Long> counts=new ConcurrentHashMap<>();
    private boolean listening;
    private static final class Connection {
        final WebSocketSession socket; final long created=System.currentTimeMillis(); volatile long ping=created;
        volatile LiveChatStore.Viewer viewer;
        long window=created; int frames;
        Connection(WebSocketSession socket) { this.socket=new ConcurrentWebSocketSessionDecorator(socket,2000,128*1024); }
    }
    public LiveChatWebSocket(LiveChatStore store,LiveSessionService live,ObjectMapper json,ObjectProvider<RedisMessageListenerContainer> containers,@Value("${vezlist.live.max-chat-connections-per-node:2000}") int maxConnections) { this.store=store; this.live=live; this.json=json; this.containers=containers; this.maxConnections=maxConnections; }
    private synchronized void listen() {
        if(listening) return;
        var container=containers.getObject(); container.addMessageListener(this,new PatternTopic(LiveChatStore.CHANNEL+"*")); container.start(); listening=true;
    }
    @Override public synchronized void afterConnectionEstablished(WebSocketSession socket) throws Exception {
        socket.setTextMessageSizeLimit(4096);
        if(connections.size()>=maxConnections) { socket.close(CloseStatus.SERVICE_OVERLOAD); return; }
        connections.put(socket.getId(),new Connection(socket));
    }
    @Override protected void handleTextMessage(WebSocketSession socket,TextMessage frame) {
        Connection c=connections.get(socket.getId()); if(c==null) return;
        String clientId="";
        try {
            if(System.currentTimeMillis()-c.window>10000) { c.window=System.currentTimeMillis();c.frames=0; }
            if(++c.frames>40) { error(c,"RATE_LIMIT","Too many chat events. Reconnect shortly.","");close(c);return; }
            JsonNode body=json.readTree(frame.getPayload()); String type=body.path("type").asText();
            if(c.viewer==null) {
                if(!type.equals("authenticate")) throw new IllegalArgumentException("Authenticate first");
                var viewer=store.consume(body.path("ticket").asText());
                if(!live.isSessionOpen(viewer.sessionId())) { send(c,Map.of("type","ended")); close(c); return; }
                if(viewer.userId()!=null) live.requireChatAccess(viewer.sessionId(),viewer.userId());
                listen();
                synchronized(c) {
                    c.viewer=viewer; store.heartbeat(viewer,socket.getId());
                    Set<String> muted=store.muted(viewer.sessionId());
                    send(c,Map.of("type","ready","canChat",viewer.userId()!=null&&!muted.contains(viewer.userId().toString()),"viewerCount",store.count(viewer.sessionId()),"messages",store.history(viewer.sessionId()),"mutedUserIds",muted));
                }
                return;
            }
            if(type.equals("ping")) { c.ping=System.currentTimeMillis(); store.heartbeat(c.viewer,socket.getId()); send(c,Map.of("type","pong")); return; }
            if(!type.equals("message")) throw new IllegalArgumentException("Unknown chat event");
            clientId=UUID.fromString(body.path("clientId").asText()).toString();
            if(c.viewer.userId()==null) { error(c,"LOGIN_REQUIRED","Log in to chat.",clientId); return; }
            String content=body.path("text").asText().strip();
            if(content.isBlank() || content.length()>500 || content.codePoints().anyMatch(ch->Character.isISOControl(ch)&&ch!='\n'&&ch!='\t')) throw new IllegalArgumentException("Messages must contain 1–500 characters.");
            String name=live.requireChatAccess(c.viewer.sessionId(),c.viewer.userId());
            String result=store.message(c.viewer,clientId,name,content);
            if("MUTED".equals(result)) { error(c,"MUTED","The creator or a moderator has muted you.",clientId); return; }
            if("RATE_LIMIT".equals(result)) { error(c,"RATE_LIMIT","Please slow down. Try again in a few seconds.",clientId); return; }
            if("ENDED".equals(result)) { send(c,Map.of("type","ended")); close(c); return; }
            send(c,Map.of("type","ack","clientId",clientId,"messageId",json.readTree(result).path("id").asText()));
        } catch(LiveException ex) { error(c,ex.code(),ex.getMessage(),clientId); }
        catch(IllegalArgumentException ex) { error(c,"INVALID_MESSAGE",ex.getMessage(),clientId); if(c.viewer==null) close(c); }
        catch(Exception ex) { error(c,"CHAT_UNAVAILABLE","Chat is temporarily unavailable. Please reconnect.",clientId); close(c); }
    }
    @Override public void onMessage(Message message,byte[] pattern) {
        try {
            UUID room=UUID.fromString(new String(message.getChannel(),StandardCharsets.UTF_8).substring(LiveChatStore.CHANNEL.length()));
            String payload=new String(message.getBody(),StandardCharsets.UTF_8);
            boolean ended=json.readTree(payload).path("type").asText().equals("ended");
            for(Connection c:connections.values()) synchronized(c) { if(c.viewer!=null&&c.viewer.sessionId().equals(room)) { sendRaw(c,payload); if(ended) close(c); } }
        } catch(Exception ignored) { /* Malformed internal event cannot take down the subscriber. */ }
    }
    @Scheduled(fixedDelay=5000) public void maintain() {
        long now=System.currentTimeMillis(); Set<UUID> rooms=new HashSet<>();
        for(Connection c:connections.values()) {
            if((c.viewer==null && now-c.created>10000) || now-c.ping>45000) { close(c); continue; }
            if(c.viewer!=null) rooms.add(c.viewer.sessionId());
        }
        counts.keySet().retainAll(rooms);
        for(UUID room:rooms) try {
            if(!live.isSessionOpen(room)) { store.end(room); continue; }
            long count=store.count(room); Long previous=counts.put(room,count);
            if(previous==null || previous!=count) for(Connection c:connections.values()) if(c.viewer!=null&&c.viewer.sessionId().equals(room)) send(c,Map.of("type","viewers","viewerCount",count));
        } catch(Exception ex) { for(Connection c:connections.values()) if(c.viewer!=null&&c.viewer.sessionId().equals(room)) { error(c,"CHAT_UNAVAILABLE","Chat connection interrupted. Please reconnect.",""); close(c); } }
    }
    @EventListener public void ended(LiveSessionClosed event) { try { store.end(event.sessionId()); } catch(Exception ignored) { /* TTL bounds retention if Redis is unavailable; maintenance retries for connected rooms. */ } }
    @Override public void afterConnectionClosed(WebSocketSession socket,CloseStatus status) { remove(socket.getId()); }
    @Override public void handleTransportError(WebSocketSession socket,Throwable exception) { Connection c=connections.get(socket.getId()); if(c!=null) close(c); }
    private void remove(String id) { Connection c=connections.remove(id); if(c!=null&&c.viewer!=null) try { store.leave(c.viewer,id); } catch(Exception ignored) {} }
    private void close(Connection c) { remove(c.socket.getId()); try { c.socket.close(CloseStatus.NORMAL); } catch(Exception ignored) {} }
    private void send(Connection c,Object message) { sendRaw(c,store.encode(message)); }
    private void sendRaw(Connection c,String message) { try { if(c.socket.isOpen()) c.socket.sendMessage(new TextMessage(message)); } catch(Exception ex) { close(c); } }
    private void error(Connection c,String code,String message,String clientId) { send(c,Map.of("type","error","code",code,"message",message,"clientId",clientId)); }
    @PreDestroy public void shutdown() { connections.values().forEach(this::close); }
}
