package cc.vezlist.shared.security;

import jakarta.servlet.http.HttpServletRequest;

/** The server route, never a caller-supplied role/header, chooses the session. */
public final class SessionAudience {
    public static final String ATTRIBUTE = SessionAudience.class.getName();
    public static final String ADMIN = "ADMIN";
    public static final String PUBLIC = "PUBLIC";

    private SessionAudience() { }

    public static boolean isAdmin(HttpServletRequest request) {
        // Servlet paths are decoded by the container, like MVC route matching.
        // Matching raw requestURI would let /%61dmin use a public cookie.
        String path = request.getServletPath();
        if (request.getPathInfo() != null) path += request.getPathInfo();
        if (path.isEmpty()) {
            path = org.springframework.web.util.UriUtils.decode(
                    request.getRequestURI().substring(request.getContextPath().length()),
                    java.nio.charset.StandardCharsets.UTF_8);
        }
        return path.equals("/api/v1/admin") || path.startsWith("/api/v1/admin/")
                || path.equals("/api/v1/moderation") || path.startsWith("/api/v1/moderation/")
                || path.equals("/api/v1/support/articles/admin")
                || path.startsWith("/api/v1/support/articles/admin/");
    }

    public static String of(HttpServletRequest request) {
        return isAdmin(request) ? ADMIN : PUBLIC;
    }
}
