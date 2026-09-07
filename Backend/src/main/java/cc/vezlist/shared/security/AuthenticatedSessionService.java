package cc.vezlist.shared.security;

import java.util.Map;

import cc.vezlist.identity.application.VezlistUserPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.session.Session;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;
import org.springframework.stereotype.Service;

@Service
public class AuthenticatedSessionService {

    private final JdbcIndexedSessionRepository sessions;

    public AuthenticatedSessionService(JdbcIndexedSessionRepository sessions) {
        this.sessions = sessions;
    }

    public void replacePrincipal(VezlistUserPrincipal principal, HttpServletRequest request) {
        Authentication authentication = UsernamePasswordAuthenticationToken.authenticated(
                principal, null, principal.getAuthorities());
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        request.getSession(true).setAttribute(
                HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);
    }

    public void revokeOtherSessions(String principalName, String currentSessionId) {
        Map<String, ? extends Session> matching = sessions.findByPrincipalName(principalName);
        matching.values().stream()
                .map(Session::getId)
                .filter(id -> !id.equals(currentSessionId))
                .forEach(sessions::deleteById);
    }
}
