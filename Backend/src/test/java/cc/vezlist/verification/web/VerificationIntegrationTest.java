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
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO listings(id, owner_id, site_scope, status, title, business_name, description,
                    category_id, province_id, location_id, contact_email, contact_phone, submitted_at, published_at)
                VALUES (?, ?, 'MARKETPLACE', ?, 'Verification test listing', 'Business', 'Listing description',
                    'services', 'bc', 'bc-1', 'seller@example.test', '+12505550100',
                    CASE WHEN ? IN ('PENDING_REVIEW','ACTIVE') THEN now() ELSE NULL END,
                    CASE WHEN ? = 'ACTIVE' THEN now() ELSE NULL END)
                """, id, owner.id(), status, status, status);
        return id;
    }

    private ResultActions post(VezlistUserPrincipal actor, String path, Object body) throws Exception {
        var request = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path)
                .with(user(actor)).with(csrf()).contentType(MediaType.APPLICATION_JSON);
        return mvc.perform(body == null ? request.content("") : request.content(json.writeValueAsBytes(body)));
    }
}
