package cc.vezlist.verification.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.identity.domain.Role;
import cc.vezlist.media.storage.ObjectStorage;
import cc.vezlist.verification.application.VerificationPhotoProcessor;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Tag("integration")
@Testcontainers
@SpringBootTest
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class VerificationIntegrationTest {
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
    @Autowired VerificationPhotoProcessor processor;
    @MockitoBean ObjectStorage storage;

    private static final byte[] PHOTO = {(byte) 0xff, (byte) 0xd8, (byte) 0xff, 1, 2, 3};

    @Test void ownerCannotVerifySomeoneElsesListing() throws Exception {
        var owner = account(Role.USER);
        var other = account(Role.USER);
        UUID listing = listing(owner, "ACTIVE");
        post(other, "/api/v1/listings/" + listing + "/verification", null).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/listings/" + listing + "/verification")).andExpect(status().isUnauthorized());
    }

    @Test void cannotRequestVerificationTwiceWhileOneIsOpen() throws Exception {
        var owner = account(Role.USER);
        UUID listing = listing(owner, "ACTIVE");
        post(owner, "/api/v1/listings/" + listing + "/verification", null).andExpect(status().isCreated());
        post(owner, "/api/v1/listings/" + listing + "/verification", null).andExpect(status().isConflict());
    }

    @Test void draftListingCannotRequestVerification() throws Exception {
        var owner = account(Role.USER);
        UUID listing = listing(owner, "DRAFT");
        post(owner, "/api/v1/listings/" + listing + "/verification", null).andExpect(status().isConflict());
    }

    @Test void nonStaffCannotReachStaffEndpoints() throws Exception {
        var owner = account(Role.USER);
        UUID listing = listing(owner, "ACTIVE");
        UUID requestId = requestVerification(owner, listing);
        mvc.perform(get("/api/v1/moderation/verification-requests?site=MARKETPLACE").with(user(owner)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/moderation/verification-requests?site=MARKETPLACE"))
                .andExpect(status().isUnauthorized());
        post(owner, "/api/v1/moderation/verification-requests/" + requestId + "/decisions",
                Map.of("decision", "APPROVE")).andExpect(status().isForbidden());
    }

    @Test void happyPathApprovalFlipsOnlyThatListingsVerifiedFlag() throws Exception {
        given(storage.authorizeUpload(anyString(), anyString(), org.mockito.ArgumentMatchers.anyLong(), anyString()))
                .willAnswer(inv -> new ObjectStorage.UploadTarget(
                        URI.create("https://storage.test/" + inv.getArgument(0)),
                        Map.of("content-type", inv.getArgument(1)), Instant.now().plusSeconds(600)));
        given(storage.authorizeDownload(anyString())).willAnswer(i -> URI.create("https://cdn.test/" + i.getArgument(0)));
        String checksum = sha256(PHOTO);
        given(storage.describe(anyString())).willReturn(new ObjectStorage.StoredObject(
                PHOTO.length, "image/jpeg", Map.of("sha256", checksum)));
        given(storage.open(anyString())).willAnswer(i -> new ByteArrayInputStream(PHOTO));

        var owner = account(Role.USER);
        var moderator = account(Role.MODERATOR);
        UUID listingA = listing(owner, "ACTIVE");
        UUID listingB = listing(owner, "ACTIVE");
        Instant publishedBefore = jdbc.queryForObject("SELECT published_at FROM listings WHERE id = ?", java.sql.Timestamp.class, listingA).toInstant();
        Instant expiresBefore = jdbc.queryForObject("SELECT expires_at FROM listings WHERE id = ?", java.sql.Timestamp.class, listingA).toInstant();
        UUID requestId = requestVerification(owner, listingA);
        String code = json.readTree(getBody(owner, "/api/v1/listings/" + listingA + "/verification"))
                .get("code").asText();
        assertThat(code).matches("\\d{6}");

        post(owner, "/api/v1/listings/" + listingA + "/verification/" + requestId + "/photo/upload-url",
                Map.of("fileName", "proof.jpg", "contentType", "image/jpeg", "sizeBytes", PHOTO.length,
                        "checksumSha256", checksum))
                .andExpect(status().isOk());
        post(owner, "/api/v1/listings/" + listingA + "/verification/" + requestId + "/photo/complete", null)
                .andExpect(status().isOk());
        processor.process(requestId);

        mvc.perform(get("/api/v1/listings/" + listingA + "/verification").with(user(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING_REVIEW"))
                .andExpect(jsonPath("$.photoStatus").value("READY"));

        var queue = json.readTree(getBody(moderator, "/api/v1/moderation/verification-requests?site=MARKETPLACE"));
        assertThat(queue.toString()).contains(requestId.toString()).contains(code);

        mvc.perform(get("/api/v1/moderation/verification-requests/" + requestId).with(user(moderator)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.photoUrl").isNotEmpty());

        post(owner, "/api/v1/moderation/verification-requests/" + requestId + "/decisions",
                Map.of("decision", "APPROVE")).andExpect(status().isForbidden());
        post(moderator, "/api/v1/moderation/verification-requests/" + requestId + "/decisions",
                Map.of("decision", "APPROVE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"));

        mvc.perform(get("/api/v1/listings/" + listingA + "?site=MARKETPLACE"))
                .andExpect(jsonPath("$.verified").value(true));
        mvc.perform(get("/api/v1/listings/" + listingB + "?site=MARKETPLACE"))
                .andExpect(jsonPath("$.verified").value(false));
        var search = json.readTree(mvc.perform(get("/api/v1/listings?site=MARKETPLACE"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        boolean aVerified = false;
        boolean bVerified = true;
        for (var item : search.get("items")) {
            if (item.get("id").asText().equals(listingA.toString())) aVerified = item.get("verified").asBoolean();
            if (item.get("id").asText().equals(listingB.toString())) bVerified = item.get("verified").asBoolean();
        }
        assertThat(aVerified).isTrue();
        assertThat(bVerified).isFalse();
        assertThat(jdbc.queryForObject("SELECT published_at FROM listings WHERE id = ?", java.sql.Timestamp.class, listingA).toInstant()).isEqualTo(publishedBefore);
        assertThat(jdbc.queryForObject("SELECT expires_at FROM listings WHERE id = ?", java.sql.Timestamp.class, listingA).toInstant()).isEqualTo(expiresBefore);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM listing_events WHERE listing_id = ?", Long.class, listingA)).isZero();

        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM admin_audit_log WHERE action = 'VERIFICATION_APPROVED' AND target_id = ?",
                Long.class, listingA.toString())).isEqualTo(1);

        // Re-requesting after approval starts a fresh (open) request; the old one is terminal.
        post(owner, "/api/v1/listings/" + listingA + "/verification", null).andExpect(status().isCreated());
    }

    @Test void rejectionKeepsListingUnverifiedAndRecordsReason() throws Exception {
        given(storage.authorizeUpload(anyString(), anyString(), org.mockito.ArgumentMatchers.anyLong(), anyString()))
                .willAnswer(inv -> new ObjectStorage.UploadTarget(
                        URI.create("https://storage.test/" + inv.getArgument(0)),
                        Map.of("content-type", inv.getArgument(1)), Instant.now().plusSeconds(600)));
        String checksum = sha256(PHOTO);
        given(storage.describe(anyString())).willReturn(new ObjectStorage.StoredObject(
                PHOTO.length, "image/jpeg", Map.of("sha256", checksum)));
        given(storage.open(anyString())).willAnswer(i -> new ByteArrayInputStream(PHOTO));
        given(storage.authorizeDownload(anyString())).willAnswer(i -> URI.create("https://cdn.test/" + i.getArgument(0)));

        var owner = account(Role.USER);
        var moderator = account(Role.MODERATOR);
        UUID listing = listing(owner, "ACTIVE");
        UUID requestId = requestVerification(owner, listing);
        post(owner, "/api/v1/listings/" + listing + "/verification/" + requestId + "/photo/upload-url",
                Map.of("fileName", "proof.jpg", "contentType", "image/jpeg", "sizeBytes", PHOTO.length,
                        "checksumSha256", checksum))
                .andExpect(status().isOk());
        post(owner, "/api/v1/listings/" + listing + "/verification/" + requestId + "/photo/complete", null)
                .andExpect(status().isOk());
        processor.process(requestId);

        post(moderator, "/api/v1/moderation/verification-requests/" + requestId + "/decisions",
                Map.of("decision", "REJECT")).andExpect(status().isBadRequest());
        post(moderator, "/api/v1/moderation/verification-requests/" + requestId + "/decisions",
                Map.of("decision", "REJECT", "reason", "Code in photo does not match."))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.rejectionReason").value("Code in photo does not match."));

        mvc.perform(get("/api/v1/listings/" + listing + "?site=MARKETPLACE"))
                .andExpect(jsonPath("$.verified").value(false));
        // Terminal state frees the listing to retry.
        post(owner, "/api/v1/listings/" + listing + "/verification", null).andExpect(status().isCreated());
    }

    @ParameterizedTest
    @ValueSource(strings = {"MARKETPLACE", "PERSONALS"})
    void verificationApprovalPublishesOnlyThePrivateRequestedListing(String site) throws Exception {
        var owner = account(Role.USER);
        var moderator = account(Role.MODERATOR);
        UUID listing = listing(owner, "PENDING_REVIEW", site, true);
        readyMedia(listing, "READY", 0);
        UUID requestId = readyRequest(owner, listing);
        given(storage.authorizeDownload(anyString())).willAnswer(i -> URI.create("https://cdn.test/" + i.getArgument(0)));

        mvc.perform(get("/api/v1/listings/" + listing + "?site=" + site)).andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM moderation_cases WHERE listing_id = ?", Long.class, listing)).isZero();
        post(moderator, decisionPath(requestId), Map.of("decision", "APPROVE"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("APPROVED"));

        mvc.perform(get("/api/v1/listings/" + listing + "?site=" + site))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.verified").value(true));
        Instant published = jdbc.queryForObject("SELECT published_at FROM listings WHERE id = ?", java.sql.Timestamp.class, listing).toInstant();
        Instant expires = jdbc.queryForObject("SELECT expires_at FROM listings WHERE id = ?", java.sql.Timestamp.class, listing).toInstant();
        assertThat(expires).isEqualTo(published.plus(30, ChronoUnit.DAYS));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM listing_events WHERE listing_id = ? AND event_type = 'LISTING_APPROVED'", Long.class, listing)).isEqualTo(1);
        post(moderator, decisionPath(requestId), Map.of("decision", "APPROVE")).andExpect(status().isConflict());
    }

    @ParameterizedTest
    @ValueSource(strings = {"MARKETPLACE", "PERSONALS"})
    void rejectedVerificationStaysPrivateAndCanBeResubmittedWithFreshProof(String site) throws Exception {
        var owner = account(Role.USER);
        var moderator = account(Role.MODERATOR);
        UUID listing = listing(owner, "PENDING_REVIEW", site, true);
        readyMedia(listing, "READY", 0);
        UUID requestId = readyRequest(owner, listing);
        given(storage.authorizeDownload(anyString())).willAnswer(i -> URI.create("https://cdn.test/" + i.getArgument(0)));

        post(moderator, decisionPath(requestId), Map.of("decision", "REJECT", "reason", "The proof code is unreadable."))
                .andExpect(status().isOk()).andExpect(jsonPath("$.rejectionReason").value("The proof code is unreadable."));
        var row = jdbc.queryForMap("SELECT status, verified, published_at, expires_at, moderation_reason FROM listings WHERE id = ?", listing);
        assertThat(row.get("status")).isEqualTo("REJECTED");
        assertThat(row.get("verified")).isEqualTo(false);
        assertThat(row.get("published_at")).isNull();
        assertThat(row.get("expires_at")).isNull();
        assertThat(row.get("moderation_reason")).isEqualTo("ELIGIBILITY_NOT_CONFIRMED");
        mvc.perform(get("/api/v1/listings/" + listing + "?site=" + site)).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/me/listings/" + listing + "/moderation?site=" + site).with(user(owner)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.publicReason").isNotEmpty())
                .andExpect(jsonPath("$.appealAllowed").value(false));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM listing_events WHERE listing_id = ? AND event_type = 'LISTING_REJECTED'", Long.class, listing)).isEqualTo(1);

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/listings/" + listing + "/submit")
                .with(user(owner)).with(csrf()).header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(Map.of("requestVerification", true))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING_REVIEW"));
        UUID fresh = requestVerification(owner, listing);
        assertThat(fresh).isNotEqualTo(requestId);
        assertThat(jdbc.queryForObject("SELECT status FROM listing_verification_requests WHERE id = ?", String.class, requestId)).isEqualTo("REJECTED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM moderation_cases WHERE listing_id = ? AND status = 'OPEN'", Long.class, listing)).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"REMOVED", "REJECTED", "EXPIRED", "DELETED", "PAST_EXPIRY", "RESUBMITTED"})
    void staleVerificationDecisionsCannotChangeOrRepublishListings(String change) throws Exception {
        var owner = account(Role.USER);
        var moderator = account(Role.MODERATOR);
        UUID listing = listing(owner, "ACTIVE");
        UUID requestId = readyRequest(owner, listing);
        if (change.equals("PAST_EXPIRY")) {
            jdbc.update("UPDATE listings SET expires_at = now() - interval '1 minute' WHERE id = ?", listing);
        } else if (change.equals("RESUBMITTED")) {
            jdbc.update("UPDATE listings SET submitted_at = now() + interval '1 second' WHERE id = ?", listing);
        } else {
            jdbc.update("UPDATE listings SET status = ? WHERE id = ?", change, listing);
        }
        for (String decision : new String[]{"APPROVE", "REJECT"}) {
            post(moderator, decisionPath(requestId), Map.of("decision", decision, "reason", "Stale review"))
                    .andExpect(change.equals("DELETED") ? status().isNotFound() : status().isConflict());
        }
        assertThat(jdbc.queryForObject("SELECT verified FROM listings WHERE id = ?", Boolean.class, listing)).isFalse();
        assertThat(getBody(moderator, "/api/v1/moderation/verification-requests?site=MARKETPLACE")).doesNotContain(requestId.toString());
    }

    @ParameterizedTest
    @ValueSource(strings = {"AWAITING_PHOTO", "PROCESSING", "PENDING_REVIEW", "APPROVED", "REJECTED"})
    void resubmittingLegacyListingRequiresNewProofAndPreservesItsHistory(String oldStatus) throws Exception {
        given(storage.authorizeDownload(anyString())).willAnswer(i -> URI.create("https://cdn.test/" + i.getArgument(0)));
        var owner = account(Role.USER);
        var moderator = account(Role.MODERATOR);
        UUID listing = listing(owner, "PENDING_REVIEW");
        readyMedia(listing, "READY", 0);
        UUID oldRequest = oldStatus.equals("AWAITING_PHOTO") || oldStatus.equals("PROCESSING")
                ? requestVerification(owner, listing) : readyRequest(owner, listing);
        if (oldStatus.equals("PROCESSING")) {
            jdbc.update("UPDATE listing_verification_requests SET photo_status = 'PROCESSING', photo_object_key = ? WHERE id = ?",
                    "verification/" + oldRequest + ".jpg", oldRequest);
        }
        if (oldStatus.equals("APPROVED") || oldStatus.equals("REJECTED")) {
            post(moderator, decisionPath(oldRequest), Map.of(
                    "decision", oldStatus.equals("APPROVED") ? "APPROVE" : "REJECT", "reason", "Historical decision"))
                    .andExpect(status().isOk());
        }
        Object oldPhotoKey = jdbc.queryForMap("SELECT photo_object_key FROM listing_verification_requests WHERE id = ?", oldRequest).get("photo_object_key");
        jdbc.update("UPDATE listings SET status = 'REJECTED' WHERE id = ?", listing);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/listings/" + listing + "/submit")
                .with(user(owner)).with(csrf()).header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(Map.of("requestVerification", true))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING_REVIEW"))
                .andExpect(jsonPath("$.verified").value(false));

        mvc.perform(get("/api/v1/listings/" + listing + "/verification").with(user(owner)))
                .andExpect(status().isNotFound());
        assertThat(getBody(moderator, "/api/v1/moderation/verification-requests?site=MARKETPLACE"))
                .doesNotContain(oldRequest.toString());
        post(moderator, decisionPath(oldRequest), Map.of("decision", "APPROVE")).andExpect(status().isConflict());

        UUID fresh = requestVerification(owner, listing);
        assertThat(fresh).isNotEqualTo(oldRequest);
        processor.process(oldRequest);
        mvc.perform(get("/api/v1/listings/" + listing + "/verification").with(user(owner)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(fresh.toString()))
                .andExpect(jsonPath("$.status").value("AWAITING_PHOTO"));
        var historical = jdbc.queryForMap("SELECT status, decided_at, decided_by, rejection_reason, photo_object_key FROM listing_verification_requests WHERE id = ?", oldRequest);
        if (oldStatus.equals("AWAITING_PHOTO") || oldStatus.equals("PROCESSING") || oldStatus.equals("PENDING_REVIEW")) {
            assertThat(historical.get("status")).isEqualTo("REJECTED");
            assertThat(historical.get("decided_by")).isNull();
            assertThat(historical.get("rejection_reason").toString()).contains("Superseded", "resubmitted");
        } else {
            assertThat(historical.get("status")).isEqualTo(oldStatus);
            assertThat(historical.get("decided_by")).isEqualTo(moderator.id());
        }
        assertThat(historical.get("decided_at")).isNotNull();
        assertThat(historical.get("photo_object_key")).isEqualTo(oldPhotoKey);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM listing_verification_requests WHERE listing_id = ?", Long.class, listing)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM listing_verification_requests WHERE listing_id = ? AND status IN ('AWAITING_PHOTO', 'PENDING_REVIEW')", Long.class, listing)).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"CATEGORY", "LOCATION", "PROVINCE", "NO_IMAGES", "UNREADY_IMAGE", "OWNER"})
    void publicationRechecksEligibilityAndAllImages(String invalid) throws Exception {
        var owner = account(Role.USER);
        var moderator = account(Role.MODERATOR);
        UUID listing = listing(owner, "PENDING_REVIEW", "MARKETPLACE", true);
        if (!invalid.equals("NO_IMAGES")) readyMedia(listing, "READY", 0);
        if (invalid.equals("UNREADY_IMAGE")) readyMedia(listing, "PROCESSING", 1);
        UUID requestId = readyRequest(owner, listing);
        String disabledTable = invalid.equals("CATEGORY") ? "categories"
                : (invalid.equals("LOCATION") || invalid.equals("PROVINCE")) ? "locations" : "app_users";
        Object disabledId = switch (invalid) {
            case "CATEGORY" -> "services";
            case "LOCATION" -> "bc-1";
            case "PROVINCE" -> "bc";
            default -> owner.id();
        };
        boolean disableRecord = !invalid.equals("NO_IMAGES") && !invalid.equals("UNREADY_IMAGE");
        try {
            if (disableRecord) jdbc.update("UPDATE " + disabledTable + " SET enabled = false WHERE id = ?", disabledId);
            post(moderator, decisionPath(requestId), Map.of("decision", "APPROVE"))
                    .andExpect(invalid.equals("OWNER") ? status().isConflict() : status().isBadRequest());
            assertThat(jdbc.queryForObject("SELECT status FROM listings WHERE id = ?", String.class, listing)).isEqualTo("PENDING_REVIEW");
            assertThat(jdbc.queryForObject("SELECT status FROM listing_verification_requests WHERE id = ?", String.class, requestId)).isEqualTo("PENDING_REVIEW");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM listing_events WHERE listing_id = ?", Long.class, listing)).isZero();
        } finally {
            if (disableRecord) jdbc.update("UPDATE " + disabledTable + " SET enabled = true WHERE id = ?", disabledId);
        }
    }

    @Test void verificationCannotSelfApproveOrUseRevokedStaffPrivileges() throws Exception {
        var owner = account(Role.ADMIN);
        var moderator = account(Role.MODERATOR);
        UUID listing = listing(owner, "PENDING_REVIEW", "MARKETPLACE", true);
        readyMedia(listing, "READY", 0);
        UUID requestId = readyRequest(owner, listing);
        post(owner, decisionPath(requestId), Map.of("decision", "APPROVE")).andExpect(status().isForbidden());
        jdbc.update("DELETE FROM user_roles WHERE user_id = ?", moderator.id());
        // Revoked roles invalidate the session; self-approval remains forbidden above.
        post(moderator, decisionPath(requestId), Map.of("decision", "APPROVE")).andExpect(status().isUnauthorized());
        assertThat(jdbc.queryForObject("SELECT status FROM listings WHERE id = ?", String.class, listing)).isEqualTo("PENDING_REVIEW");
    }

    @Test void verifyingLegacyPendingListingDoesNotSkipItsOriginalModeration() throws Exception {
        var owner = account(Role.USER);
        var moderator = account(Role.MODERATOR);
        UUID listing = listing(owner, "PENDING_REVIEW");
        UUID requestId = readyRequest(owner, listing);
        post(moderator, decisionPath(requestId), Map.of("decision", "APPROVE")).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("SELECT status FROM listings WHERE id = ?", String.class, listing)).isEqualTo("PENDING_REVIEW");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM moderation_cases WHERE listing_id = ? AND status = 'OPEN'", Long.class, listing)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM listing_events WHERE listing_id = ?", Long.class, listing)).isZero();
    }

    @Test void onlyExplicitlySelectedPhotosAreVerifiedAndForeignOrChangedPhotosAreNot() throws Exception {
        given(storage.authorizeDownload(anyString())).willAnswer(i -> URI.create("https://cdn.test/" + i.getArgument(0)));
        var owner = account(Role.USER);
        var moderator = account(Role.MODERATOR);
        UUID listing = listing(owner, "ACTIVE");
        UUID other = listing(owner, "ACTIVE");
        readyMedia(listing, "READY", 0);
        readyMedia(listing, "READY", 1);
        readyMedia(other, "READY", 0);
        var photoIds = jdbc.queryForList("SELECT id FROM listing_media WHERE listing_id = ? ORDER BY position", UUID.class, listing);
        UUID foreignId = jdbc.queryForObject("SELECT id FROM listing_media WHERE listing_id = ?", UUID.class, other);
        UUID requestId = readyRequest(owner, listing);

        // A legacy listing badge is not evidence that any particular picture was checked.
        jdbc.update("UPDATE listings SET verified = true WHERE id = ?", listing);
        mvc.perform(get("/api/v1/listings/" + listing + "?site=MARKETPLACE"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.media[0].verified").value(false));
        mvc.perform(get("/api/v1/moderation/verification-requests/" + requestId).with(user(moderator)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.media.length()").value(2));
        post(moderator, decisionPath(requestId), Map.of("decision", "APPROVE", "verifiedMediaIds", java.util.List.of(foreignId)))
                .andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("SELECT status FROM listing_verification_requests WHERE id = ?", String.class, requestId))
                .isEqualTo("PENDING_REVIEW");
        post(moderator, decisionPath(requestId), Map.of("decision", "APPROVE", "verifiedMediaIds", java.util.List.of(photoIds.getFirst())))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/listings/" + listing + "?site=MARKETPLACE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.media[0].verified").value(true))
                .andExpect(jsonPath("$.media[1].verified").value(false));
        jdbc.update("UPDATE listing_media SET checksum_sha256 = ? WHERE id = ?", "b".repeat(64), photoIds.getFirst());
        mvc.perform(get("/api/v1/listings/" + listing + "?site=MARKETPLACE"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.media[0].verified").value(false));
    }

    @ParameterizedTest
    @CsvSource({"MARKETPLACE,PENDING_REVIEW", "PERSONALS,PENDING_REVIEW", "MARKETPLACE,ACTIVE", "PERSONALS,ACTIVE"})
    void adminRemovalClearsActionableVerificationQueuesAndBlocksStaleDecisions(String site, String initialStatus) throws Exception {
        given(storage.authorizeDownload(anyString())).willAnswer(i -> URI.create("https://cdn.test/" + i.getArgument(0)));
        var owner = account(Role.USER);
        var admin = account(Role.ADMIN);
        var moderator = account(Role.MODERATOR);
        UUID listing = listing(owner, initialStatus, site, true);
        readyMedia(listing, "READY", 0);
        UUID request = readyRequest(owner, listing);
        var dates = jdbc.queryForMap("SELECT published_at, expires_at FROM listings WHERE id=?", listing);
        String queue = "/api/v1/moderation/verification-requests?site=" + site;
        String scopedCounts = "/api/v1/admin/analytics/queues?site=" + site;
        String globalCounts = "/api/v1/admin/analytics/queues";
        assertThat(getBody(moderator, queue)).contains(request.toString());
        int scopedBefore = json.readTree(getBody(admin, scopedCounts)).get("openVerifications").asInt();
        int globalBefore = json.readTree(getBody(admin, globalCounts)).get("openVerifications").asInt();
        post(admin, "/api/v1/admin/listings/" + listing + "/remove", Map.of("reason", "Policy violation"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.listing.status").value("REMOVED"));
        assertThat(getBody(moderator, queue)).doesNotContain(request.toString());
        assertThat(json.readTree(getBody(admin, scopedCounts)).get("openVerifications").asInt()).isEqualTo(scopedBefore - 1);
        assertThat(json.readTree(getBody(admin, globalCounts)).get("openVerifications").asInt()).isEqualTo(globalBefore - 1);
        // Retain verification evidence/history; it is no longer an actionable queue item.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM listing_verification_requests WHERE id=?", Long.class, request)).isEqualTo(1L);
        for (String decision : new String[]{"APPROVE", "REJECT"}) {
            post(moderator, decisionPath(request), Map.of("decision", decision, "reason", "Stale review",
                            "verifiedMediaIds", jdbc.queryForList("SELECT id FROM listing_media WHERE listing_id=?", UUID.class, listing)))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.message").value("This listing is no longer available for verification."));
        }
        assertThat(jdbc.queryForObject("SELECT status FROM listings WHERE id=?", String.class, listing)).isEqualTo("REMOVED");
        assertThat(jdbc.queryForObject("SELECT verified FROM listings WHERE id=?", Boolean.class, listing)).isFalse();
        assertThat(jdbc.queryForMap("SELECT published_at, expires_at FROM listings WHERE id=?", listing)).isEqualTo(dates);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM listing_events WHERE listing_id=? AND event_type='LISTING_APPROVED'", Long.class, listing)).isZero();
    }

    private String decisionPath(UUID request) {
        return "/api/v1/moderation/verification-requests/" + request + "/decisions";
    }

    private UUID readyRequest(VezlistUserPrincipal owner, UUID listing) throws Exception {
        UUID request = requestVerification(owner, listing);
        jdbc.update("UPDATE listing_verification_requests SET status = 'PENDING_REVIEW', photo_status = 'READY', photo_object_key = ?, submitted_at = now() WHERE id = ?",
                "verification/" + request + ".jpg", request);
        return request;
    }

    private void readyMedia(UUID listing, String status, int position) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO listing_media(id, listing_id, object_key, original_filename, content_type, size_bytes,
                    checksum_sha256, status, position, upload_expires_at, ready_at)
                VALUES (?, ?, ?, 'photo.jpg', 'image/jpeg', 3, ?, ?, ?, now(), now())
                """, id, listing, "test/" + id + ".jpg", "a".repeat(64), status, position);
    }

    private UUID requestVerification(VezlistUserPrincipal owner, UUID listing) throws Exception {
        var response = post(owner, "/api/v1/listings/" + listing + "/verification", null)
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(json.readTree(response).get("id").asText());
    }

    private String getBody(VezlistUserPrincipal actor, String path) throws Exception {
        return mvc.perform(get(path).with(user(actor))).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    private String sha256(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private VezlistUserPrincipal account(Role role) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO app_users(id, display_name, email, password_hash, enabled) VALUES (?, 'Test member', ?, 'hash', true)", id, id + "@example.test");
        jdbc.update("INSERT INTO user_roles(user_id, role) VALUES (?, ?)", id, role.name());
        return new VezlistUserPrincipal(id, "Test member", id + "@example.test", "hash", true, false, Set.of(role), Instant.now());
    }

    private UUID listing(VezlistUserPrincipal owner, String status) {
        return listing(owner, status, "MARKETPLACE", false);
    }

    private UUID listing(VezlistUserPrincipal owner, String status, String site, boolean verificationRequested) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO listings(id, owner_id, site_scope, status, title, business_name, description,
                    category_id, province_id, location_id, contact_email, contact_phone, submitted_at, published_at,
                    expires_at, verification_requested)
                VALUES (?, ?, ?, ?, 'Verification test listing', 'Business', 'Listing description',
                    ?, 'bc', 'bc-1', 'seller@example.test', '+12505550100',
                    CASE WHEN ? IN ('PENDING_REVIEW','ACTIVE') THEN now() ELSE NULL END,
                    CASE WHEN ? = 'ACTIVE' THEN now() ELSE NULL END,
                    CASE WHEN ? = 'ACTIVE' THEN now() + interval '30 days' ELSE NULL END, ?)
                """, id, owner.id(), site, status, site.equals("PERSONALS") ? "personals" : "services",
                status, status, status, verificationRequested);
        return id;
    }

    private ResultActions post(VezlistUserPrincipal actor, String path, Object body) throws Exception {
        var request = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path)
                .with(user(actor)).with(csrf()).contentType(MediaType.APPLICATION_JSON);
        return mvc.perform(body == null ? request.content("") : request.content(json.writeValueAsBytes(body)));
    }
}
