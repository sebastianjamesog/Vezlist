package cc.vezlist.support.web;

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
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
@Tag("integration")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SupportTicketIntegrationTest {
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
    void ticketsArePrivateToTheirOwnerAndStaffRoutesRejectMembers() {
        Session owner = register();
        Session stranger = register();

        ResponseEntity<Map> created = exchange("/api/v1/me/tickets", HttpMethod.POST,
                Map.of("site", "MARKETPLACE", "subject", "Account question", "body", "Please help."), owner);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        String id = created.getBody().get("id").toString();

        ResponseEntity<Map> ownDetail = exchange("/api/v1/me/tickets/" + id, HttpMethod.GET, null, owner);
        assertThat(ownDetail.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(ownDetail.getBody()).containsEntry("subject", "Account question");

        ResponseEntity<Map> strangerDetail = exchange("/api/v1/me/tickets/" + id, HttpMethod.GET, null, stranger);
        assertThat(strangerDetail.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        ResponseEntity<Map> strangerReply = exchange("/api/v1/me/tickets/" + id + "/messages", HttpMethod.POST,
                Map.of("body", "Not my ticket"), stranger);
        assertThat(strangerReply.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

        ResponseEntity<Map> strangerList = exchange("/api/v1/me/tickets?site=MARKETPLACE", HttpMethod.GET, null, stranger);
        assertThat(strangerList.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(strangerList.getBody().get("total")).isEqualTo(0);

        ResponseEntity<Map> staffList = exchange("/api/v1/admin/tickets?site=MARKETPLACE", HttpMethod.GET, null, owner);
        // Public authentication is not a console session, even in the same browser.
        assertThat(staffList.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);

        ResponseEntity<Map> anonymous = rest.getForEntity(url("/api/v1/me/tickets?site=MARKETPLACE"), Map.class);
        assertThat(anonymous.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    private Session register() {
        ResponseEntity<Map> csrf = rest.getForEntity(url("/api/v1/auth/csrf"), Map.class);
        String token = csrf.getBody().get("token").toString();
        String header = csrf.getBody().get("headerName").toString();
        String cookies = cookies(csrf.getHeaders());
        HttpHeaders requestHeaders = new HttpHeaders();
        requestHeaders.set(HttpHeaders.COOKIE, cookies);
        requestHeaders.set(header, token);
        ResponseEntity<Map> registration = rest.postForEntity(url("/api/v1/auth/register"), new HttpEntity<>(Map.of(
                "name", "Ticket Test User", "email", "ticket-" + UUID.randomUUID() + "@example.test",
                "password", "SafeTestPass123!", "acceptedTerms", true), requestHeaders), Map.class);
        assertThat(registration.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        String authenticatedCookies = mergeCookies(cookies, cookies(registration.getHeaders()));
        HttpHeaders csrfHeaders = new HttpHeaders();
        csrfHeaders.set(HttpHeaders.COOKIE, authenticatedCookies);
        ResponseEntity<Map> authenticatedCsrf = rest.exchange(url("/api/v1/auth/csrf"), HttpMethod.GET,
                new HttpEntity<>(csrfHeaders), Map.class);
        assertThat(authenticatedCsrf.getStatusCode()).isEqualTo(HttpStatus.OK);
        header = (String) authenticatedCsrf.getBody().get("headerName");
        token = (String) authenticatedCsrf.getBody().get("token");
        authenticatedCookies = mergeCookies(authenticatedCookies, cookies(authenticatedCsrf.getHeaders()));
        return new Session(header, token, authenticatedCookies);
    }

    private ResponseEntity<Map> exchange(String path, HttpMethod method, Object body, Session session) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.COOKIE, session.cookies());
        headers.set(session.csrfHeader(), session.csrfToken());
        return rest.exchange(url(path), method, new HttpEntity<>(body, headers), Map.class);
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

    private String url(String path) {
        return "http://localhost:" + port + path;
    }

    private record Session(String csrfHeader, String csrfToken, String cookies) {}
}
