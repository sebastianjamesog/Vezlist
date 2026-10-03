package cc.vezlist.live.realtime;

import cc.vezlist.live.application.LiveSessionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.web.socket.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;

class LiveChatWebSocketTest {
    final UUID room=UUID.randomUUID();
    final ObjectMapper json=new ObjectMapper();
    final LiveChatStore store=mock(LiveChatStore.class);
    final LiveSessionService live=mock(LiveSessionService.class);
    @SuppressWarnings("unchecked") final ObjectProvider<RedisMessageListenerContainer> containers=mock(ObjectProvider.class);
    final List<String> frames=new ArrayList<>();
    WebSocketSession socket(UUID user,boolean muted) throws Exception {
        when(store.consume("ticket")).thenReturn(new LiveChatStore.Viewer(room,user,"identity","Stored name",false));
        when(live.isSessionOpen(room)).thenReturn(true);
        when(store.history(room)).thenReturn(List.of());when(store.muted(room)).thenReturn(muted?Set.of(user.toString()):Set.of());
        when(containers.getObject()).thenReturn(mock(RedisMessageListenerContainer.class));
        when(store.encode(any())).thenAnswer(call->json.writeValueAsString(call.getArgument(0)));
        var socket=mock(WebSocketSession.class);when(socket.getId()).thenReturn("socket");when(socket.isOpen()).thenReturn(true);
        doAnswer(call->{frames.add(((TextMessage)call.getArgument(0)).getPayload());return null;}).when(socket).sendMessage(any());return socket;
    }
    @Test void guestCanReadButCannotSendChat() throws Exception {
        var ws=socket(null,false);var handler=new LiveChatWebSocket(store,live,json,containers,10);
        handler.afterConnectionEstablished(ws);handler.handleMessage(ws,new TextMessage("{\"type\":\"authenticate\",\"ticket\":\"ticket\"}"));
        assertThat(json.readTree(frames.getFirst()).path("canChat").asBoolean()).isFalse();
        handler.handleMessage(ws,new TextMessage("{\"type\":\"message\",\"clientId\":\""+UUID.randomUUID()+"\",\"text\":\"hello\",\"userId\":\"spoofed\"}"));
        assertThat(json.readTree(frames.getLast()).path("code").asText()).isEqualTo("LOGIN_REQUIRED");verify(store,never()).message(any(),any(),any(),any());
    }
    @Test void authenticatedMessagesUseDatabaseNameAndTicketIdentity() throws Exception {
        UUID user=UUID.randomUUID();var ws=socket(user,false);when(live.requireChatAccess(room,user)).thenReturn("Database name");
        when(store.message(any(),any(),any(),any())).thenReturn("{\"id\":\"message-id\"}");var handler=new LiveChatWebSocket(store,live,json,containers,10);
        handler.afterConnectionEstablished(ws);handler.handleMessage(ws,new TextMessage("{\"type\":\"authenticate\",\"ticket\":\"ticket\"}"));
        String client=UUID.randomUUID().toString();handler.handleMessage(ws,new TextMessage("{\"type\":\"message\",\"clientId\":\""+client+"\",\"text\":\"hello\",\"name\":\"Administrator\"}"));
        verify(store).message(argThat(viewer->viewer.userId().equals(user)),eq(client),eq("Database name"),eq("hello"));
        assertThat(json.readTree(frames.getLast()).path("type").asText()).isEqualTo("ack");
    }
    @Test void mutedReconnectCannotRestoreSendPermissionAndInvalidTicketsClose() throws Exception {
        UUID user=UUID.randomUUID();var ws=socket(user,true);var handler=new LiveChatWebSocket(store,live,json,containers,10);
        handler.afterConnectionEstablished(ws);handler.handleMessage(ws,new TextMessage("{\"type\":\"authenticate\",\"ticket\":\"ticket\"}"));
        assertThat(json.readTree(frames.getFirst()).path("canChat").asBoolean()).isFalse();
        handler.afterConnectionClosed(ws,CloseStatus.NORMAL);when(store.consume("ticket")).thenThrow(new IllegalArgumentException("Expired"));
        handler.afterConnectionEstablished(ws);handler.handleMessage(ws,new TextMessage("{\"type\":\"authenticate\",\"ticket\":\"ticket\"}"));verify(ws).close(CloseStatus.NORMAL);
    }
}
