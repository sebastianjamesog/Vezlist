package cc.vezlist.admin.application;

import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import cc.vezlist.admin.domain.SecurityEventType;
import cc.vezlist.admin.persistence.SecurityEventRepository;

/**
 * Public API the identity/users modules call into to record an auth event
 * (login, logout, register, password change) -- the explicit interface
 * pattern this codebase already uses for {@link AdminAuditService} and
 * {@code ListingEventPublisher}, rather than those modules writing to
 * {@code security_events} directly.
 */
@Service
public class SecurityEventService {
    private static final int MAX_UA_LENGTH = 255;
    private static final int MAX_EMAIL_LENGTH = 320;
    private static final int MAX_DETAILS_LENGTH = 500;

    private final SecurityEventRepository events;

    public SecurityEventService(SecurityEventRepository events) {
        this.events = events;
    }

    @Transactional
    public void record(
            SecurityEventType type, UUID userId, String attemptedEmail, HttpServletRequest request, String details) {
        events.record(
                type.name(),
                userId,
                truncate(attemptedEmail, MAX_EMAIL_LENGTH),
                clientIp(request),
                truncate(request.getHeader("User-Agent"), MAX_UA_LENGTH),
                truncate(details, MAX_DETAILS_LENGTH));
    }

    /**
     * The first hop of X-Forwarded-For when present (this app sits behind a
     * reverse proxy/load balancer in any real deployment; Tomcat's own
     * {@code getRemoteAddr()} would otherwise always report the proxy's
     * address, not the client's), falling back to the direct connection
     * address for local/unproxied requests. Not validated as a real IP --
     * this is an audit trail, not an access-control decision, so a spoofed
     * header only pollutes the trail's accuracy, never a security boundary.
     */
    private String clientIp(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            String first = forwardedFor.split(",")[0].trim();
            if (!first.isEmpty()) return truncate(first, 64);
        }
        return truncate(request.getRemoteAddr(), 64);
    }

    private String truncate(String value, int maxLength) {
        if (value == null) return null;
        return value.length() > maxLength ? value.substring(0, maxLength) : value;
    }
}
