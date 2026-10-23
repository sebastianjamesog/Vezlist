package cc.vezlist.identity.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

/** The staff console has its own authentication endpoints and session cookie. */
@RestController
@RequestMapping("/api/v1/admin/auth")
public class AdminAuthController {
    private final AuthController authentication;

    public AdminAuthController(AuthController authentication) {
        this.authentication = authentication;
    }

    @GetMapping("/csrf")
    CsrfTokenResponse csrf(CsrfToken token) {
        return authentication.csrf(token);
    }

    @PostMapping("/login")
    CurrentUserResponse login(@Valid @RequestBody LoginRequest body,
            HttpServletRequest request, HttpServletResponse response) {
        return authentication.login(body, request, response);
    }

    @GetMapping("/me")
    CurrentUserResponse me(Authentication principal) {
        return authentication.me(principal);
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(Authentication principal, HttpServletRequest request, HttpServletResponse response) {
        return authentication.logout(principal, request, response);
    }
}
