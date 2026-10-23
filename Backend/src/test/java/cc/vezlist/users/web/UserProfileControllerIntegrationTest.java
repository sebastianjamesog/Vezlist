package cc.vezlist.users.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.annotation.DirtiesContext;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
@Tag("integration")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class UserProfileControllerIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"));

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    private TestRestTemplate rest;

    @LocalServerPort
    private int port;

    @Test
    void profilePreferencesPasswordAndDeletionPersistEndToEnd() {
        String originalEmail = "profile-" + UUID.randomUUID() + "@example.test";
        String updatedEmail = "updated-" + UUID.randomUUID() + "@example.test";
        Session session = register(originalEmail, "SafeTestPass123!");

        ResponseEntity<Map> initialProfile = exchange(
                "/api/v1/me/profile", HttpMethod.GET, null, session, Map.class);
        assertThat(initialProfile.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(initialProfile.getBody()).containsEntry("name", "Profile Test User");

        ResponseEntity<Map> updatedProfile = exchange(
                "/api/v1/me/profile",
                HttpMethod.PATCH,
                Map.of(
                        "name", "Updated User",
                        "email", updatedEmail,
                        "phone", "+1 250 555 0134",
                        "location", "Victoria, BC",
                        "bio", "A persisted profile."),
                session,
                Map.class);
        assertThat(updatedProfile.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(updatedProfile.getBody())
                .containsEntry("email", updatedEmail)
                .containsEntry("location", "Victoria, BC");

        ResponseEntity<Map> initialPreferences = exchange(
                "/api/v1/me/preferences", HttpMethod.GET, null, session, Map.class);
        assertThat(initialPreferences.getBody())
                .containsEntry("pushNotifications", true)
                .containsEntry("preciseLocation", false);

        ResponseEntity<Map> updatedPreferences = exchange(
                "/api/v1/me/preferences",
                HttpMethod.PATCH,
                Map.of(
                        "pushNotifications", false,
                        "emailUpdates", true,
                        "showPhoneOnAds", false,
                        "preciseLocation", true),
                session,
                Map.class);
        assertThat(updatedPreferences.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(updatedPreferences.getBody())
                .containsEntry("emailUpdates", true)
                .containsEntry("showPhoneOnAds", false);

        ResponseEntity<Map> badPassword = exchange(
                "/api/v1/me/password",
                HttpMethod.PATCH,
                Map.of("currentPassword", "wrong-password", "newPassword", "NewSafePass456!"),
                session,
                Map.class);
        assertThat(badPassword.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(badPassword.getBody()).containsEntry("code", "CURRENT_PASSWORD_INVALID");

        ResponseEntity<Void> passwordChanged = exchange(
                "/api/v1/me/password",
                HttpMethod.PATCH,
                Map.of("currentPassword", "SafeTestPass123!", "newPassword", "NewSafePass456!"),
                session,
                Void.class);
        assertThat(passwordChanged.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        ResponseEntity<Map> deletion = exchange("/api/v1/me", HttpMethod.DELETE, null, session, Map.class);
        assertThat(deletion.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
        assertThat(deletion.getBody()).containsEntry("status", "PENDING");
    }

    private Session register(String email, String password) {
        ResponseEntity<Map> csrf = rest.getForEntity(url("/api/v1/auth/csrf"), Map.class);
        String token = (String) csrf.getBody().get("token");
        String header = (String) csrf.getBody().get("headerName");
        String csrfCookies = cookies(csrf.getHeaders());
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(Map.of(
                "name", "Profile Test User",
                "email", email,
                "password", password,
                "acceptedTerms", true), headers(header, token, csrfCookies));
        ResponseEntity<Map> registration = rest.postForEntity(url("/api/v1/auth/register"), request, Map.class);
        assertThat(registration.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        Session session = new Session(header, token, mergeCookies(csrfCookies, cookies(registration.getHeaders())));
        refreshCsrf(session);
        return session;
    }

    private <T> ResponseEntity<T> exchange(
            String path, HttpMethod method, Object body, Session session, Class<T> responseType) {
        if (method != HttpMethod.GET) refreshCsrf(session);
        HttpHeaders headers = headers(session.csrfHeader(), session.csrfToken(), session.cookies());
        ResponseEntity<T> response = rest.exchange(url(path), method, new HttpEntity<>(body, headers), responseType);
        session.cookies = mergeCookies(session.cookies, cookies(response.getHeaders()));
        return response;
    }

    private void refreshCsrf(Session session) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.COOKIE, session.cookies);
        ResponseEntity<Map> response = rest.exchange(url("/api/v1/auth/csrf"), HttpMethod.GET,
                new HttpEntity<>(headers), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        session.csrfHeader = (String) response.getBody().get("headerName");
        session.csrfToken = (String) response.getBody().get("token");
        session.cookies = mergeCookies(session.cookies, cookies(response.getHeaders()));
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }

    private HttpHeaders headers(String csrfHeader, String csrfToken, String cookies) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.COOKIE, cookies);
        headers.set(csrfHeader, csrfToken);
        return headers;
    }

    private String cookies(HttpHeaders headers) {
        return headers.getOrEmpty(HttpHeaders.SET_COOKIE).stream()
                .map(cookie -> cookie.substring(0, cookie.indexOf(';')))
                .collect(Collectors.joining("; "));
    }

    private String mergeCookies(String... cookieHeaders) {
        Map<String, String> jar = new java.util.LinkedHashMap<>();
        for (String header : cookieHeaders) {
            if (header == null || header.isBlank()) continue;
            for (String pair : header.split("; ")) {
                int equals = pair.indexOf('=');
                String name = pair.substring(0, equals);
                String value = pair.substring(equals + 1);
                if (value.isBlank()) jar.remove(name);
                else jar.put(name, value);
            }
        }
        return jar.entrySet().stream().map(entry -> entry.getKey() + "=" + entry.getValue())
                .collect(Collectors.joining("; "));
    }

    private static final class Session {
        private String csrfHeader;
        private String csrfToken;
        private String cookies;

        private Session(String csrfHeader, String csrfToken, String cookies) {
            this.csrfHeader = csrfHeader;
            this.csrfToken = csrfToken;
            this.cookies = cookies;
        }

        private String csrfHeader() { return csrfHeader; }
        private String csrfToken() { return csrfToken; }
        private String cookies() { return cookies; }
    }
}
