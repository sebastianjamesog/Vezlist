package cc.vezlist.notifications.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import cc.vezlist.notifications.application.NotificationProcessor;
import cc.vezlist.notifications.application.NotificationPublisher;
import cc.vezlist.notifications.domain.NotificationType;
import cc.vezlist.shared.domain.SiteScope;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

/** Opt-in: mvn -Pintegration -Dtest=NotificationBrowserIT test (requires Frontend npm install and Chromium). */
@Tag("integration")
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "vezlist.notifications.worker-enabled=false",
        "vezlist.cors.allowed-origins=http://127.0.0.1:3200,http://127.0.0.1:3201"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class NotificationBrowserIT {
    @Container static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder passwords;
    @Autowired NotificationPublisher publisher;
    @Autowired NotificationProcessor processor;
    @Autowired PlatformTransactionManager manager;

    @Test
    @Timeout(value = 240, unit = TimeUnit.SECONDS)
    void browserUsesRealSessionsCsrfAndDatabaseForBothSites() throws Exception {
        UUID userId = UUID.randomUUID();
        String email = userId + "@example.test";
        String password = "Test-only-" + UUID.randomUUID() + "!";
        jdbc.update("INSERT INTO app_users(id, display_name, email, password_hash) VALUES (?, 'Browser member', ?, ?)",
                userId, email, passwords.encode(password));
        jdbc.update("INSERT INTO user_roles(user_id, role) VALUES (?, 'USER')", userId);
        new TransactionTemplate(manager).executeWithoutResult(tx -> {
            for (SiteScope site : SiteScope.values()) {
                publisher.publish(UUID.randomUUID(), userId, site, NotificationType.LISTING_APPROVED, null);
                publisher.publish(UUID.randomUUID(), userId, site, NotificationType.SECURITY_EVENT, userId);
            }
        });
        while (processor.processNextEvent()) { }

        boolean windows = System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("win");
        ProcessBuilder builder = windows
                ? new ProcessBuilder("cmd.exe", "/d", "/c", "npm run test:browser:live")
                : new ProcessBuilder("npm", "run", "test:browser:live");
        builder.directory(Path.of("..", "Frontend").toAbsolutePath().normalize().toFile());
        builder.environment().put("VEZLIST_LIVE_API_BASE_URL", "http://127.0.0.1:" + port + "/api/v1");
        builder.environment().put("VEZLIST_LIVE_EMAIL", email);
        builder.environment().put("VEZLIST_LIVE_PASSWORD", password);
        builder.redirectErrorStream(true);
        Process browser = builder.start();
        Thread output = Thread.ofVirtual().start(() -> {
            try (var reader = browser.inputReader()) {
                reader.lines().forEach(System.out::println);
            } catch (java.io.IOException closed) {
                // The owned child may be terminated by the test timeout.
            }
        });
        try {
            assertThat(browser.waitFor(210, TimeUnit.SECONDS)).as("Live browser suite must finish").isTrue();
            assertThat(browser.exitValue()).as("Live browser suite exit code").isZero();
            output.join(2000);
        } finally {
            if (browser.isAlive()) {
                browser.descendants().forEach(ProcessHandle::destroy);
                browser.destroyForcibly();
            }
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notifications WHERE recipient_id = ? AND read_at IS NULL", Long.class, userId)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notifications WHERE recipient_id = ?", Long.class, userId)).isEqualTo(4);
    }
}
