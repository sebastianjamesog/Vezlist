package cc.vezlist.shared.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRepository;

/** Admin and public logins must not overwrite each other's CSRF cookies. */
public final class AudienceCsrfTokenRepository implements CsrfTokenRepository {
    private final CookieCsrfTokenRepository publicTokens = tokens("XSRF-TOKEN");
    private final CookieCsrfTokenRepository adminTokens = tokens("ADMIN-XSRF-TOKEN");

    private static CookieCsrfTokenRepository tokens(String name) {
        CookieCsrfTokenRepository repository = new CookieCsrfTokenRepository();
        repository.setCookieName(name);
        repository.setCookiePath("/");
        // Clients obtain the masked token from /auth/csrf; JS need not read the cookie.
        repository.setCookieCustomizer(cookie -> cookie.httpOnly(true).sameSite("Lax"));
        return repository;
    }

    private CookieCsrfTokenRepository repository(HttpServletRequest request) {
        return SessionAudience.isAdmin(request) ? adminTokens : publicTokens;
    }

    @Override
    public CsrfToken generateToken(HttpServletRequest request) {
        return repository(request).generateToken(request);
    }

    @Override
    public void saveToken(CsrfToken token, HttpServletRequest request, HttpServletResponse response) {
        repository(request).saveToken(token, request, response);
    }

    @Override
    public CsrfToken loadToken(HttpServletRequest request) {
        return repository(request).loadToken(request);
    }
}
