package cc.vezlist.identity.web;

import cc.vezlist.admin.application.SecurityEventService;
import cc.vezlist.admin.domain.SecurityEventType;
import cc.vezlist.identity.application.IdentityService;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AccountStatusException;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final IdentityService identityService;
    private final AuthenticationManager authenticationManager;
    private final SecurityEventService securityEvents;

    public AuthController(
            IdentityService identityService,
            AuthenticationManager authenticationManager,
            SecurityEventService securityEvents) {
        this.identityService = identityService;
        this.authenticationManager = authenticationManager;
        this.securityEvents = securityEvents;
    }

    @GetMapping("/csrf")
    CsrfTokenResponse csrf(CsrfToken token) {
        return new CsrfTokenResponse(token.getHeaderName(), token.getToken());
    }

    @PostMapping("/register")
    ResponseEntity<CurrentUserResponse> register(
            @Valid @RequestBody RegisterRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {
        VezlistUserPrincipal principal = identityService.register(request);
        authenticateSession(principal, httpRequest, httpResponse);
        securityEvents.record(SecurityEventType.REGISTER, principal.id(), request.email(), httpRequest, null);
        return ResponseEntity.status(HttpStatus.CREATED).body(identityService.toResponse(principal));
    }

    @PostMapping("/login")
    CurrentUserResponse login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {
        try {
            Authentication authentication = authenticationManager.authenticate(
                    UsernamePasswordAuthenticationToken.unauthenticated(request.email(), request.password()));
            VezlistUserPrincipal principal = (VezlistUserPrincipal) authentication.getPrincipal();
            authenticateSession(principal, httpRequest, httpResponse);
            securityEvents.record(SecurityEventType.LOGIN_SUCCESS, principal.id(), request.email(), httpRequest, null);
            return identityService.toResponse(principal);
        } catch (BadCredentialsException exception) {
            securityEvents.record(SecurityEventType.LOGIN_FAILURE, null, request.email(), httpRequest, null);
            throw new InvalidCredentialsException();
        } catch (AccountStatusException exception) {
            // Covers DisabledException (suspended accounts) and the other
            // AccountStatusException subtypes DaoAuthenticationProvider's
            // pre-auth checks can throw - none of these are "unexpected", so
            // they must not reach the generic 500 handler. Thrown by the
            // provider's pre-authentication checks, which run before the
            // password is even verified, so there's no principal here to
            // attribute this to beyond the email that was typed.
            securityEvents.record(SecurityEventType.LOGIN_BLOCKED_SUSPENDED, null, request.email(), httpRequest, null);
            throw new AccountSuspendedException();
        }
    }

    @GetMapping("/me")
    CurrentUserResponse me(Authentication authentication) {
        return identityService.toResponse((VezlistUserPrincipal) authentication.getPrincipal());
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(Authentication authentication, HttpServletRequest request, HttpServletResponse response) {
        if (authentication != null && authentication.getPrincipal() instanceof VezlistUserPrincipal principal) {
            securityEvents.record(SecurityEventType.LOGOUT, principal.id(), principal.email(), request, null);
        }
        if (request.getSession(false) != null) {
            request.getSession(false).invalidate();
        }
        SecurityContextHolder.clearContext();
        return ResponseEntity.noContent().build();
    }

    private void authenticateSession(
            VezlistUserPrincipal principal,
            HttpServletRequest request,
            HttpServletResponse response) {
        Authentication authentication = UsernamePasswordAuthenticationToken.authenticated(
                principal, null, principal.getAuthorities());
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        request.getSession(true).setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);
    }
}
