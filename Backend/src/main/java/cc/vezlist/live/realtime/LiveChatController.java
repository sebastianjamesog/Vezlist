package cc.vezlist.live.realtime;

import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.live.application.LiveException;
import cc.vezlist.live.application.LiveSessionService;
import cc.vezlist.shared.security.SessionAudience;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class LiveChatController {
    private final LiveChatStore store; private final LiveSessionService live; private final JdbcTemplate jdbc; private final String socketUrl;
    public LiveChatController(LiveChatStore store,LiveSessionService live,JdbcTemplate jdbc,@Value("${vezlist.live.chat-ws-url}") String socketUrl) { this.store=store; this.live=live; this.jdbc=jdbc; this.socketUrl=socketUrl; }
    @PostMapping("/live/sessions/{sessionId}/viewer-ticket")
    public Map<String,Object> ticket(@PathVariable UUID sessionId,@AuthenticationPrincipal VezlistUserPrincipal actor,HttpServletRequest request,HttpServletResponse response) {
        if(!live.isSessionOpen(sessionId)) throw new LiveException(HttpStatus.GONE,"LIVE_ENDED","This live session has ended.");
        UUID user=actor==null?null:actor.id();
        if(!store.ticketRateAllowed(user==null?request.getRemoteAddr():user.toString())) throw new LiveException(HttpStatus.TOO_MANY_REQUESTS,"RATE_LIMIT","Please wait before reconnecting.");
        String name=user==null?"Guest":live.requireChatAccess(sessionId,user);
        String identity=user==null?"guest:"+guestId(request,response):"user:"+user;
        UUID owner=jdbc.queryForObject("SELECT owner_id FROM live_sessions WHERE id=?",UUID.class,sessionId);
        String token=store.ticket(new LiveChatStore.Viewer(sessionId,user,identity,name,Objects.equals(owner,user)));
        return Map.of("ticket",token,"webSocketUrl",socketUrl,"expiresAt",java.time.Instant.now().plusSeconds(60));
    }
    public record Mute(boolean muted) {}
    @DeleteMapping({"/live/sessions/{sessionId}/chat/{messageId}",
            "/admin/live/sessions/{sessionId}/chat/{messageId}"})
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID sessionId, @PathVariable UUID messageId,
            @AuthenticationPrincipal VezlistUserPrincipal actor, HttpServletRequest request) {
        moderate(sessionId, actor.id(), SessionAudience.isAdmin(request));
        store.delete(sessionId, messageId.toString());
    }

    @PutMapping({"/live/sessions/{sessionId}/chat/mutes/{userId}",
            "/admin/live/sessions/{sessionId}/chat/mutes/{userId}"})
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void mute(@PathVariable UUID sessionId, @PathVariable UUID userId, @RequestBody Mute body,
            @AuthenticationPrincipal VezlistUserPrincipal actor, HttpServletRequest request) {
        moderate(sessionId, actor.id(), SessionAudience.isAdmin(request));
        store.mute(sessionId, userId, body.muted());
    }

    private void moderate(UUID room, UUID actor, boolean adminRoute) {
        // Public sessions can moderate only their own broadcast. Staff authority
        // is available exclusively through the console's audience-bound route.
        String permission = adminRoute
                ? "EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('ADMIN','MODERATOR'))"
                : "s.owner_id=u.id";
        Boolean allowed = jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM live_sessions s"
                + " JOIN app_users u ON u.id=? AND u.enabled=true WHERE s.id=? AND " + permission + ")",
                Boolean.class, actor, room);
        if (!Boolean.TRUE.equals(allowed)) throw new LiveException(HttpStatus.FORBIDDEN, "FORBIDDEN",
                adminRoute ? "Only console staff can moderate this chat." : "Only the creator can moderate this chat.");
        if (!live.isSessionOpen(room)) throw new LiveException(HttpStatus.GONE, "LIVE_ENDED", "This live session has ended.");
    }
    private String guestId(HttpServletRequest request,HttpServletResponse response) {
        if(request.getCookies()!=null) for(var cookie:request.getCookies()) if(cookie.getName().equals("vezlist_live_viewer")) {
            try { return UUID.fromString(cookie.getValue()).toString(); } catch(IllegalArgumentException ignored) {}
        }
        String id=UUID.randomUUID().toString();
        response.addHeader(HttpHeaders.SET_COOKIE,ResponseCookie.from("vezlist_live_viewer",id).httpOnly(true).secure(request.isSecure()).sameSite("Lax").path("/api/v1/live").maxAge(Duration.ofDays(7)).build().toString());
        return id;
    }
}
