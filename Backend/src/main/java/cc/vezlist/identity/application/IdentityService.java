package cc.vezlist.identity.application;

import java.util.Locale;
import java.util.UUID;

import cc.vezlist.identity.domain.User;
import cc.vezlist.identity.persistence.UserRepository;
import cc.vezlist.identity.web.CurrentUserResponse;
import cc.vezlist.identity.web.RegisterRequest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Service
public class IdentityService implements UserDetailsService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JdbcTemplate jdbc;

    public IdentityService(UserRepository users, PasswordEncoder passwordEncoder, JdbcTemplate jdbc) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.jdbc = jdbc;
    }

    @Transactional
    public VezlistUserPrincipal register(RegisterRequest request) {
        String email = normalizeEmail(request.email());
        if (users.existsByEmail(email)) {
            throw new EmailAlreadyRegisteredException();
        }

        User user = new User(request.name().trim(), email, passwordEncoder.encode(request.password()));
        try {
            return VezlistUserPrincipal.from(users.saveAndFlush(user));
        } catch (DataIntegrityViolationException exception) {
            throw new EmailAlreadyRegisteredException();
        }
    }

    @Override
    @Transactional(readOnly = true)
    public VezlistUserPrincipal loadUserByUsername(String email) throws UsernameNotFoundException {
        return users.findByEmail(normalizeEmail(email))
                .map(VezlistUserPrincipal::from)
                .orElseThrow(() -> new UsernameNotFoundException("Invalid email or password."));
    }

    public CurrentUserResponse toResponse(VezlistUserPrincipal principal) {
        return new CurrentUserResponse(
                principal.id(),
                principal.displayName(),
                principal.email(),
                principal.emailVerified(),
                principal.roles().stream().map(Enum::name).collect(java.util.stream.Collectors.toUnmodifiableSet()),
                principal.createdAt(),
                jdbc.queryForObject("SELECT account_type FROM app_users WHERE id = ?", String.class, principal.id()));
    }

    @Transactional
    public CurrentUserResponse changeAccountType(VezlistUserPrincipal principal, String accountType) {
        if (!java.util.Set.of("CREATOR", "BROWSING").contains(accountType))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid account type.");
        if (jdbc.update("UPDATE app_users SET account_type = ?, updated_at = now() WHERE id = ? AND enabled = true",
                accountType, principal.id()) != 1) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Account unavailable.");
        return toResponse(principal);
    }

    @Transactional(readOnly = true)
    public VezlistUserPrincipal loadUserById(UUID id) {
        return users.findById(id)
                .map(VezlistUserPrincipal::from)
                .orElseThrow(() -> new UsernameNotFoundException("User account was not found."));
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
