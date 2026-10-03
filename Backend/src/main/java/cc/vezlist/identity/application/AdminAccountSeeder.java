package cc.vezlist.identity.application;

import cc.vezlist.identity.domain.Role;
import cc.vezlist.identity.domain.User;
import cc.vezlist.identity.persistence.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ensures a single local-development admin account exists so the admin
 * console has a real, working login before any real staff accounts are
 * promoted by hand.
 *
 * <p>Disabled by default. Local developers must explicitly enable it and
 * provide a unique password. An existing non-admin account is never promoted.</p>
 */
@Component
public class AdminAccountSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminAccountSeeder.class);

    private static final String SEED_ADMIN_EMAIL = "admin@vezlist.cc";
    private static final String SEED_ADMIN_NAME = "Vezlist Admin";

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final boolean seedEnabled;
    private final String seedPassword;

    public AdminAccountSeeder(
            UserRepository users,
            PasswordEncoder passwordEncoder,
            @Value("${vezlist.seed-admin:false}") boolean seedEnabled,
            @Value("${vezlist.seed-admin-password:}") String seedPassword) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.seedEnabled = seedEnabled;
        this.seedPassword = seedPassword;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!seedEnabled) {
            log.info("vezlist.seed-admin is disabled; skipping admin account seeding.");
            return;
        }

        if (seedPassword == null || seedPassword.length() < 12) {
            throw new IllegalStateException("Admin seeding requires a unique password of at least 12 characters.");
        }

        String email = SEED_ADMIN_EMAIL;
        User admin = users.findByEmail(email).orElse(null);
        if (admin == null) {
            admin = new User(SEED_ADMIN_NAME, email, passwordEncoder.encode(seedPassword));
            admin.grantRole(Role.ADMIN);
            users.saveAndFlush(admin);
            log.warn("Seeded local-development admin account '{}'. Disable via vezlist.seed-admin=false "
                    + "(VEZLIST_SEED_ADMIN=false) outside local development.", email);
            return;
        }

        if (!admin.getRoles().contains(Role.ADMIN)) {
            throw new IllegalStateException("The admin seed email already belongs to a non-admin account.");
        }
    }
}
