package cc.vezlist.notifications.web;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.identity.domain.Role;
import cc.vezlist.notifications.application.*;
import cc.vezlist.notifications.application.NotificationChannelProvider.*;
import cc.vezlist.notifications.domain.NotificationType;
import cc.vezlist.shared.domain.SiteScope;
import cc.vezlist.users.application.UserProfileService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Tag("integration")
@Testcontainers
@SpringBootTest(properties = "vezlist.notifications.worker-enabled=false")
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class NotificationIntegrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @Autowired NotificationProcessor processor;
    @Autowired NotificationPublisher publisher;
    @Autowired NotificationService service;
    @Autowired PlatformTransactionManager manager;
    @Autowired UserProfileService profiles;
    @Autowired PasswordEncoder passwords;
    @BeforeEach void cleanIsolatedQueue() {
        // This database is owned by this Testcontainers class, never a developer/live database.
        jdbc.update("DELETE FROM notification_events");
    }

    @Test void listingEventsProducePrivateScopedInboxAndDisabledExternalDelivery() throws Exception {
        var owner = account();
        UUID listing = listing(owner, "PERSONALS");
        event(listing, "LISTING_REJECTED", "{\"private_note\":\"Never expose this\"}");
        drain();
        var page = service.list(owner.id(), SiteScope.PERSONALS, 24, null);
        assertThat(page.items()).hasSize(1);
        assertThat(page.items().getFirst().type()).isEqualTo("LISTING_REJECTED");
        assertThat(page.items().getFirst().message()).doesNotContain("Never expose", "Secret listing");
        assertThat(service.list(owner.id(), SiteScope.MARKETPLACE, 24, null).items()).isEmpty();
        mvc.perform(get("/api/v1/me/notifications?site=PERSONALS").with(user(owner)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].readAt").isEmpty())
                .andExpect(jsonPath("$.items[0].type").value("LISTING_REJECTED"));
        assertThat(count("SELECT count(*) FROM notification_deliveries WHERE status = 'DELIVERED' AND channel = 'IN_APP'")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM notification_deliveries WHERE status = 'SKIPPED'")).isEqualTo(2);
        assertThat(count("SELECT count(*) FROM notification_deliveries WHERE error_code = 'PREFERENCE_DISABLED'")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM notification_deliveries WHERE error_code = 'PROVIDER_NOT_CONFIGURED'")).isEqualTo(1);
    }

    @Test void readsPersistAreIdempotentAndEnforceOwnershipSiteAndCsrf() throws Exception {
        var owner = account(); var stranger = account();
        publish(owner, SiteScope.MARKETPLACE); publish(owner, SiteScope.PERSONALS); drain();
        UUID id = service.list(owner.id(), SiteScope.MARKETPLACE, 24, null).items().getFirst().id();
        String path = "/api/v1/me/notifications/" + id + "/read?site=MARKETPLACE";
        mvc.perform(get("/api/v1/me/notifications?site=MARKETPLACE")).andExpect(status().isUnauthorized());
        mvc.perform(post(path).with(user(owner))).andExpect(status().isForbidden());
        mvc.perform(post(path).with(user(stranger)).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(post(path.replace("MARKETPLACE", "PERSONALS")).with(user(owner)).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(post(path).with(user(owner)).with(csrf())).andExpect(status().isOk()).andExpect(jsonPath("$.count").value(0));
        Instant firstRead = service.list(owner.id(), SiteScope.MARKETPLACE, 24, null).items().getFirst().readAt();
        mvc.perform(post(path).with(user(owner)).with(csrf())).andExpect(status().isOk());
        assertThat(service.list(owner.id(), SiteScope.MARKETPLACE, 24, null).items().getFirst().readAt()).isEqualTo(firstRead);
        assertThat(service.unread(owner.id(), SiteScope.PERSONALS).count()).isEqualTo(1);
        publish(owner, SiteScope.MARKETPLACE); drain();
        mvc.perform(post("/api/v1/me/notifications/read-all?site=MARKETPLACE").with(user(owner)).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.count").value(0));
        assertThat(service.unread(owner.id(), SiteScope.PERSONALS).count()).isEqualTo(1);
        publish(owner, SiteScope.MARKETPLACE); drain();
        assertThat(service.unread(owner.id(), SiteScope.MARKETPLACE).count()).isEqualTo(1);
    }

    @Test void paginationIsBoundedAndStableAcrossNewArrivals() throws Exception {
        var owner = account();
        for (int i = 0; i < 5; i++) publish(owner, SiteScope.MARKETPLACE);
        drain();
        var first = service.list(owner.id(), SiteScope.MARKETPLACE, 2, null);
        assertThat(first.items()).hasSize(2); assertThat(first.nextCursor()).isNotNull();
        publish(owner, SiteScope.MARKETPLACE); drain();
        var second = service.list(owner.id(), SiteScope.MARKETPLACE, 2, first.nextCursor());
        var third = service.list(owner.id(), SiteScope.MARKETPLACE, 2, second.nextCursor());
        assertThat(second.items()).hasSize(2); assertThat(third.items()).hasSize(1); assertThat(third.nextCursor()).isNull();
        assertThat(second.items()).doesNotContainAnyElementsOf(first.items());
        for (String query : List.of("limit=0", "limit=51", "limit=x", "cursor=0", "cursor=-1", "cursor=9999999999999999999", "cursor=x", "cursor=")) {
            mvc.perform(get("/api/v1/me/notifications?site=MARKETPLACE&" + query).with(user(owner))).andExpect(status().isBadRequest());
        }
        mvc.perform(get("/api/v1/me/notifications?site=INVALID").with(user(owner))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/me/notifications").with(user(owner))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/me/notifications/not-a-uuid/read?site=MARKETPLACE").with(user(owner)).with(csrf())).andExpect(status().isBadRequest());
    }

    @Test void duplicatePublishAndConcurrentWorkersCreateExactlyOneInboxItem() throws Exception {
        var owner = account(); UUID source = UUID.randomUUID();
        try (var pool = Executors.newFixedThreadPool(4)) {
            List<Callable<Void>> jobs = java.util.stream.IntStream.range(0, 12).mapToObj(i -> (Callable<Void>) () -> {
                new TransactionTemplate(manager).executeWithoutResult(tx -> publisher.publish(source, owner.id(), SiteScope.PERSONALS, NotificationType.SUPPORT_REPLY, null));
                return null;
            }).toList();
            for (var result : pool.invokeAll(jobs)) result.get(10, TimeUnit.SECONDS);
            assertThat(count("SELECT count(*) FROM notification_events")).isEqualTo(1);
            var workerJobs = java.util.stream.IntStream.range(0, 8).mapToObj(i -> (Callable<Boolean>) processor::processNextEvent).toList();
            for (var result : pool.invokeAll(workerJobs)) result.get(10, TimeUnit.SECONDS);
        }
        assertThat(count("SELECT count(*) FROM notifications")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM notification_deliveries")).isEqualTo(3);
        // Operator replay of an already materialized event is also idempotent.
        jdbc.update("UPDATE notification_events SET status = 'PENDING'");
        drain();
        assertThat(count("SELECT count(*) FROM notifications")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM notification_deliveries")).isEqualTo(3);
    }

    @Test void originatingTransactionRollbackDoesNotLeakNotifications() {
        var owner = account(); UUID listing = listing(owner, "MARKETPLACE");
        new TransactionTemplate(manager).executeWithoutResult(tx -> {
            event(listing, "LISTING_APPROVED", "{}");
            publisher.publish(UUID.randomUUID(), owner.id(), SiteScope.MARKETPLACE, NotificationType.PAYMENT_EVENT, null);
            tx.setRollbackOnly();
        });
        assertThat(count("SELECT count(*) FROM notification_events")).isZero();
        assertThat(count("SELECT count(*) FROM listing_events WHERE listing_id = ?", listing)).isZero();
        assertThat(processor.processNextEvent()).isFalse();
        assertThatThrownBy(() -> publisher.publish(UUID.randomUUID(), owner.id(), SiteScope.MARKETPLACE, NotificationType.PAYMENT_EVENT, null))
                .isInstanceOf(org.springframework.transaction.IllegalTransactionStateException.class);
    }

    @Test void inboxFailureRollsBackAndRetriesWithoutPartialDelivery() {
        var owner = account(); publish(owner, SiteScope.MARKETPLACE);
        jdbc.execute("ALTER TABLE notification_deliveries ADD CONSTRAINT test_block_notifications CHECK (channel <> 'IN_APP')");
        try {
            assertThat(processor.processNextEvent()).isTrue();
            assertThat(count("SELECT count(*) FROM notifications")).isZero();
            assertThat(count("SELECT count(*) FROM notification_deliveries")).isZero();
            assertThat(count("SELECT count(*) FROM notification_events WHERE status = 'PENDING' AND attempts = 1 AND available_at > now() AND error_code = 'PROCESSING_FAILED'")).isEqualTo(1);
            assertThat(processor.processNextEvent()).isFalse();
        } finally {
            jdbc.execute("ALTER TABLE notification_deliveries DROP CONSTRAINT test_block_notifications");
        }
        jdbc.update("UPDATE notification_events SET available_at = now()");
        drain();
        assertThat(count("SELECT count(*) FROM notifications")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM notification_events WHERE status = 'COMPLETED'")).isEqualTo(1);
    }

    @Test void optionalDeliveryRetriesHaveStableIdempotencyKeysAndStopAtLimit() {
        var owner = account(); publish(owner, SiteScope.PERSONALS);
        processor.processNextEvent();
        jdbc.update("UPDATE notification_deliveries SET status = 'SKIPPED' WHERE channel = 'EMAIL'");
        AtomicInteger calls = new AtomicInteger(); AtomicReference<UUID> key = new AtomicReference<>();
        var failing = withPush(delivery -> {
            calls.incrementAndGet();
            if (key.get() == null) key.set(delivery.idempotencyKey());
            assertThat(delivery.idempotencyKey()).isEqualTo(key.get());
            assertThat(delivery.message()).doesNotContain("Personals", "password", "payment", "Secret listing");
            throw new IllegalStateException("provider secret must not be persisted");
        });
        for (int i = 0; i < 8; i++) {
            jdbc.update("UPDATE notification_deliveries SET available_at = now() WHERE channel = 'PUSH'");
            assertThat(failing.processNextDelivery()).isTrue();
        }
        assertThat(calls.get()).isEqualTo(8);
        assertThat(failing.processNextDelivery()).isFalse();
        assertThat(count("SELECT count(*) FROM notification_deliveries WHERE channel = 'PUSH' AND status = 'FAILED' AND attempts = 8 AND error_code = 'PROCESSING_FAILED'")).isEqualTo(1);
        assertThat(service.unread(owner.id(), SiteScope.PERSONALS).count()).isEqualTo(1);
    }

    @Test void preferenceChangesDuringRetryPreventExternalSendButNotInbox() {
        var owner = account(); publish(owner, SiteScope.MARKETPLACE); processor.processNextEvent();
        jdbc.update("UPDATE notification_deliveries SET status = 'SKIPPED' WHERE channel = 'EMAIL'");
        AtomicInteger calls = new AtomicInteger();
        var deliveryProcessor = withPush(delivery -> { calls.incrementAndGet(); throw new IllegalStateException("retry"); });
        deliveryProcessor.processNextDelivery();
        jdbc.update("INSERT INTO user_preferences(user_id, push_notifications, email_updates) VALUES (?, false, false)", owner.id());
        jdbc.update("UPDATE notification_deliveries SET available_at = now() WHERE channel = 'PUSH'");
        deliveryProcessor.processNextDelivery();
        assertThat(calls.get()).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM notification_deliveries WHERE channel = 'PUSH' AND status = 'SKIPPED' AND error_code = 'PREFERENCE_DISABLED'")).isEqualTo(1);
        assertThat(service.unread(owner.id(), SiteScope.MARKETPLACE).count()).isEqualTo(1);
    }

    @Test void successfulProviderDeliveryIsNotRepeated() {
        var owner = account(); publish(owner, SiteScope.PERSONALS); processor.processNextEvent();
        AtomicInteger calls = new AtomicInteger(); var deliveryProcessor = withPush(delivery -> calls.incrementAndGet());
        while (deliveryProcessor.processNextDelivery()) { }
        assertThat(calls.get()).isEqualTo(1);
        assertThat(deliveryProcessor.processNextDelivery()).isFalse();
        assertThat(count("SELECT count(*) FROM notification_deliveries WHERE channel = 'PUSH' AND status = 'DELIVERED'")).isEqualTo(1);
    }

    @Test void disabledAccountsCannotAccessInboxAndAreNotNotified() throws Exception {
        var owner = account(); publish(owner, SiteScope.MARKETPLACE);
        jdbc.update("UPDATE app_users SET enabled = false WHERE id = ?", owner.id());
        drain();
        assertThat(count("SELECT count(*) FROM notifications")).isZero();
        assertThat(count("SELECT count(*) FROM notification_events WHERE error_code = 'ACCOUNT_DISABLED'")).isEqualTo(1);
        // Suspension invalidates the cached principal before inbox authorization.
        mvc.perform(get("/api/v1/me/notifications?site=MARKETPLACE").with(user(owner))).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/me/notifications/unread-count?site=MARKETPLACE").with(user(owner))).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/me/notifications/read-all?site=MARKETPLACE").with(user(owner)).with(csrf())).andExpect(status().isUnauthorized());
    }

    @Test void saveEventsAreAggregatedWithoutUnsaveOrSaverIdentityNoise() {
        var owner = account(); UUID listing = listing(owner, "MARKETPLACE");
        for (int i = 0; i < 4; i++) event(listing, "LISTING_SAVE_COUNT_CHANGED", "{\"delta\":1}");
        event(listing, "LISTING_SAVE_COUNT_CHANGED", "{\"delta\":-1}");
        assertThat(count("SELECT count(*) FROM notification_events")).isEqualTo(1);
        assertThat(processor.processNextEvent()).isFalse();
        jdbc.update("UPDATE notification_events SET available_at = now()");
        drain();
        event(listing, "LISTING_SAVE_COUNT_CHANGED", "{\"delta\":1}");
        drain();
        assertThat(count("SELECT count(*) FROM notifications")).isEqualTo(1);
        assertThat(service.list(owner.id(), SiteScope.MARKETPLACE, 24, null).items().getFirst().type()).isEqualTo("LISTING_SAVED_AGGREGATE");
        UUID other = listing(owner, "MARKETPLACE"); event(other, "LISTING_SAVE_COUNT_CHANGED", "{\"delta\":-1}");
        assertThat(count("SELECT count(*) FROM notification_events WHERE subject_id = ?", other)).isZero();
    }

    @Test void expiryRemindersAreDeduplicatedAndRenewedOrExpiredAdsAreSkipped() {
        var owner = account(); UUID listing = listing(owner, "MARKETPLACE");
        jdbc.update("UPDATE listings SET expires_at = now() + interval '2 hours' WHERE id = ?", listing);
        assertThat(processor.queueExpiringListings()).isEqualTo(1);
        assertThat(processor.queueExpiringListings()).isZero();
        jdbc.update("UPDATE listings SET expires_at = now() + interval '10 days' WHERE id = ?", listing);
        drain();
        assertThat(count("SELECT count(*) FROM notifications")).isZero();
        jdbc.update("UPDATE listings SET expires_at = now() + interval '3 hours' WHERE id = ?", listing);
        processor.queueExpiringListings(); drain();
        assertThat(service.list(owner.id(), SiteScope.MARKETPLACE, 24, null).items()).hasSize(1);
        jdbc.update("UPDATE listings SET expires_at = now() - interval '1 hour' WHERE id = ?", listing);
        assertThat(processor.queueExpiringListings()).isZero();
    }

    @Test void passwordChangesQueueSafeSecurityEventsOnlyAfterSuccess() {
        var owner = account();
        jdbc.update("UPDATE app_users SET password_hash = ? WHERE id = ?", passwords.encode("Old-test-password1!"), owner.id());
        assertThatThrownBy(() -> profiles.changePassword(owner.id(), "incorrect", "New-test-password1!")).isInstanceOf(RuntimeException.class);
        assertThat(count("SELECT count(*) FROM notification_events")).isZero();
        profiles.changePassword(owner.id(), "Old-test-password1!", "New-test-password1!");
        drain();
        assertThat(service.unread(owner.id(), SiteScope.MARKETPLACE).count()).isEqualTo(1);
        assertThat(service.unread(owner.id(), SiteScope.PERSONALS).count()).isEqualTo(1);
        assertThat(service.list(owner.id(), SiteScope.PERSONALS, 24, null).items().getFirst().message()).doesNotContain("New-test-password1!");
    }

    @Test void upgradePreservesExistingModerationAndDoesNotReplayHistoricalEvents() throws Exception {
        jdbc.execute("CREATE DATABASE notification_upgrade");
        String url = "jdbc:postgresql://" + POSTGRES.getHost() + ":" + POSTGRES.getMappedPort(5432) + "/notification_upgrade";
        org.flywaydb.core.Flyway.configure().dataSource(url, POSTGRES.getUsername(), POSTGRES.getPassword()).target("11").load().migrate();
        UUID owner = UUID.randomUUID(); UUID listing = UUID.randomUUID();
        var upgrade = new JdbcTemplate(new org.springframework.jdbc.datasource.DriverManagerDataSource(url, POSTGRES.getUsername(), POSTGRES.getPassword()));
        upgrade.update("INSERT INTO app_users(id, display_name, email, password_hash) VALUES (?, 'Existing owner', 'upgrade@example.test', 'hash')", owner);
        upgrade.update("""
                INSERT INTO listings(id, owner_id, site_scope, status, title, business_name, description,
                    category_id, province_id, location_id, contact_email, contact_phone)
                VALUES (?, ?, 'MARKETPLACE', 'PENDING_REVIEW', 'Existing ad', 'Business', 'Description',
                    'services', 'bc', 'bc-1', 'upgrade@example.test', '+12505550100')
                """, listing, owner);
        upgrade.update("INSERT INTO listing_events(id, listing_id, event_type) VALUES (?, ?, 'LISTING_REJECTED')", UUID.randomUUID(), listing);
        UUID review = upgrade.queryForObject("SELECT id FROM moderation_cases WHERE listing_id = ?", UUID.class, listing);
        upgrade.update("INSERT INTO moderation_actions(id, case_id, listing_id, actor_id, action) VALUES (?, ?, ?, ?, 'NOTE')", UUID.randomUUID(), review, listing, owner);
        org.flywaydb.core.Flyway.configure().dataSource(url, POSTGRES.getUsername(), POSTGRES.getPassword()).load().migrate();
        assertThat(upgrade.queryForObject("SELECT count(*) FROM notification_events", Long.class)).isZero();
        assertThat(upgrade.queryForObject("SELECT title FROM listings WHERE id = ?", String.class, listing)).isEqualTo("Existing ad");
        assertThat(upgrade.queryForObject("SELECT count(*) FROM moderation_actions WHERE case_id = ?", Long.class, review)).isEqualTo(1);
        upgrade.update("INSERT INTO listing_events(id, listing_id, event_type) VALUES (?, ?, 'LISTING_APPROVED')", UUID.randomUUID(), listing);
        assertThat(upgrade.queryForObject("SELECT count(*) FROM notification_events WHERE recipient_id = ? AND site_scope = 'MARKETPLACE'", Long.class, owner)).isEqualTo(1);
    }

    private NotificationProcessor withPush(java.util.function.Consumer<Delivery> action) {
        return new NotificationProcessor(jdbc, manager, List.of(new NotificationChannelProvider() {
            public Channel channel() { return Channel.PUSH; }
            public void deliver(Delivery delivery) { action.accept(delivery); }
        }));
    }
    private void publish(VezlistUserPrincipal owner, SiteScope site) {
        new TransactionTemplate(manager).executeWithoutResult(tx -> publisher.publish(UUID.randomUUID(), owner.id(), site, NotificationType.SECURITY_EVENT, null));
    }
    private void event(UUID listing, String type, String payload) {
        jdbc.update("INSERT INTO listing_events(id, listing_id, event_type, payload) VALUES (?, ?, ?, ?::jsonb)", UUID.randomUUID(), listing, type, payload);
    }
    private void drain() {
        for (int i = 0; i < 200 && processor.processNextEvent(); i++) { }
        for (int i = 0; i < 500 && processor.processNextDelivery(); i++) { }
    }
    private long count(String sql, Object... args) { return jdbc.queryForObject(sql, Long.class, args); }
    private VezlistUserPrincipal account() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO app_users(id, display_name, email, password_hash) VALUES (?, 'Member', ?, 'hash')", id, id + "@example.test");
        jdbc.update("INSERT INTO user_roles(user_id, role) VALUES (?, 'USER')", id);
        return new VezlistUserPrincipal(id, "Member", id + "@example.test", "hash", true, false, Set.of(Role.USER), Instant.now());
    }
    private UUID listing(VezlistUserPrincipal owner, String site) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO listings(id, owner_id, site_scope, status, title, business_name, description,
                    category_id, province_id, location_id, contact_email, contact_phone)
                VALUES (?, ?, ?, 'ACTIVE', 'Secret listing', 'Business', 'Description', ?, 'bc', 'bc-1', 'owner@example.test', '+12505550100')
                """, id, owner.id(), site, site.equals("PERSONALS") ? "personals" : "services");
        return id;
    }
}
