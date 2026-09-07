package cc.vezlist.identity.application;

import java.time.Instant;
import java.util.Collection;
import java.util.Set;
import java.util.UUID;

import cc.vezlist.identity.domain.Role;
import cc.vezlist.identity.domain.User;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

public record VezlistUserPrincipal(
        UUID id,
        String displayName,
        String email,
        String passwordHash,
        boolean enabled,
        boolean emailVerified,
        Set<Role> roles,
        Instant createdAt) implements UserDetails {

    public static VezlistUserPrincipal from(User user) {
        return new VezlistUserPrincipal(
                user.getId(),
                user.getDisplayName(),
                user.getEmail(),
                user.getPasswordHash(),
                user.isEnabled(),
                user.isEmailVerified(),
                user.getRoles(),
                user.getCreatedAt());
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return roles.stream().map(role -> new SimpleGrantedAuthority("ROLE_" + role.name())).toList();
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public boolean isEnabled() {
        return enabled;
    }
}
