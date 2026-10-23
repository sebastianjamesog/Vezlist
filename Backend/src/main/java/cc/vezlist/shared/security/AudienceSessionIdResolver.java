package cc.vezlist.shared.security;

import java.util.List;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.session.Session;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;
import org.springframework.session.web.http.CookieHttpSessionIdResolver;
import org.springframework.session.web.http.HttpSessionIdResolver;

/** Separate cookies and server-side audience binding prevent cross-console identity reuse. */
public final class AudienceSessionIdResolver implements HttpSessionIdResolver {
    private final CookieHttpSessionIdResolver publicSessions;
    private final CookieHttpSessionIdResolver adminSessions;
    private final ObjectProvider<JdbcIndexedSessionRepository> repository;

    public AudienceSessionIdResolver(CookieHttpSessionIdResolver publicSessions,
            CookieHttpSessionIdResolver adminSessions, ObjectProvider<JdbcIndexedSessionRepository> repository) {
        this.publicSessions = publicSessions;
        this.adminSessions = adminSessions;
        this.repository = repository;
    }

    private CookieHttpSessionIdResolver resolver(HttpServletRequest request) {
        return SessionAudience.isAdmin(request) ? adminSessions : publicSessions;
    }

    @Override
    public List<String> resolveSessionIds(HttpServletRequest request) {
        boolean admin = SessionAudience.isAdmin(request);
        return resolver(request).resolveSessionIds(request).stream().filter(id -> {
            Session session = repository.getObject().findById(id);
            if (session == null) return false;
            String audience = session.getAttribute(SessionAudience.ATTRIBUTE);
            // Legacy sessions remain usable on public boards only. Console re-login is required.
            return admin ? SessionAudience.ADMIN.equals(audience) : !SessionAudience.ADMIN.equals(audience);
        }).toList();
    }

    @Override
    public void setSessionId(HttpServletRequest request, HttpServletResponse response, String sessionId) {
        resolver(request).setSessionId(request, response, sessionId);
    }

    @Override
    public void expireSession(HttpServletRequest request, HttpServletResponse response) {
        resolver(request).expireSession(request, response);
    }
}
