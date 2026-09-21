package cc.vezlist.identity.web;

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

    public AuthController(IdentityService identityService, AuthenticationManager authenticationManager) {
        this.identityService = identityService;
        this.authenticationManager = authenticationManager;
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
            return identityService.toResponse(principal);
        } catch (BadCredentialsException exception) {
            throw new InvalidCredentialsException();
        } catch (AccountStatusException exception) {
            // Covers DisabledException (suspended accounts) and the other
            // AccountStatusException subtypes DaoAuthenticationProvider's
            // pre-auth checks can throw - none of these are "unexpected", so
            // they must not reach the generic 500 handler.
            throw new AccountSuspendedException();
        }
    }

    @GetMapping("/me")
    CurrentUserResponse me(Authentication authentication) {
        return identityService.toResponse((VezlistUserPrincipal) authentication.getPrincipal());
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
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
