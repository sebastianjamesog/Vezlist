package cc.vezlist.shared.security;

import java.io.IOException;

import cc.vezlist.identity.application.IdentityService;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.web.filter.OncePerRequestFilter;

/** Cached sessions cannot outlive suspension, password/email changes, or role removal. */
public final class CurrentAccountFilter extends OncePerRequestFilter {
    private final IdentityService identity;

    public CurrentAccountFilter(IdentityService identity) {
        this.identity = identity;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof VezlistUserPrincipal cached) {
            boolean valid;
            try {
                VezlistUserPrincipal current = identity.loadUserById(cached.id());
                valid = current.enabled() && current.email().equals(cached.email())
                        && current.passwordHash().equals(cached.passwordHash())
                        && current.roles().equals(cached.roles());
            } catch (UsernameNotFoundException exception) {
                valid = false;
            }
            if (!valid) {
                if (request.getSession(false) != null) request.getSession(false).invalidate();
                SecurityContextHolder.clearContext();
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                return;
            }
        }
        chain.doFilter(request, response);
    }
}
