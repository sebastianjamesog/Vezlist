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
 * <p><strong>This must be disabled outside local development.</strong> It is
 * gated behind {@code vezlist.seed-admin} (default {@code true}, overridable
 * via the {@code VEZLIST_SEED_ADMIN} environment variable). There is
 * currently no separate "prod" Spring profile in this project — ops must set
 * {@code VEZLIST_SEED_ADMIN=false} in every deployed environment's
 * configuration until one exists, otherwise this runner will (idempotently)
 * ensure the well-known {@code admin@vezlist.cc} account exists there too.</p>
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
            @Value("${vezlist.seed-admin:true}") boolean seedEnabled,
            @Value("${vezlist.seed-admin-password:Vezlist#Admin2026}") String seedPassword) {
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
            admin.grantRole(Role.ADMIN);
            users.saveAndFlush(admin);
            log.info("Granted ADMIN role to existing account '{}'.", email);
        }
    }
}
