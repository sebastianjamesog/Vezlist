package cc.vezlist.identity.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Tag;
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
import org.testcontainers.utility.DockerImageName;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
@Tag("integration")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthControllerIntegrationTest {

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
    void registrationLoginSessionAndLogoutWorkEndToEnd() {
        String email = "api-test-" + UUID.randomUUID() + "@example.test";
        String password = "SafeTestPass123!";

        ResponseEntity<Map> csrfResponse = rest.getForEntity(url("/api/v1/auth/csrf"), Map.class);
        assertThat(csrfResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        String csrfToken = (String) csrfResponse.getBody().get("token");
        String csrfHeader = (String) csrfResponse.getBody().get("headerName");
        String csrfCookie = cookies(csrfResponse.getHeaders());
        assertThat(csrfToken).isNotBlank();
        assertThat(csrfCookie).contains("XSRF-TOKEN=");

        HttpHeaders registerHeaders = csrfHeaders(csrfHeader, csrfToken, csrfCookie);
        HttpEntity<Map<String, Object>> registerRequest = new HttpEntity<>(Map.of(
                "name", "API Test User",
                "email", email,
                "password", password,
                "acceptedTerms", true), registerHeaders);
        ResponseEntity<Map> registerResponse = rest.postForEntity(url("/api/v1/auth/register"), registerRequest, Map.class);

        assertThat(registerResponse.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(registerResponse.getBody()).containsEntry("email", email);
        assertThat(registerResponse.getBody()).doesNotContainKey("password");
        assertThat(registerResponse.getHeaders().get(HttpHeaders.SET_COOKIE))
                .anySatisfy(cookie -> assertThat(cookie).contains("SESSION=", "Max-Age=2592000", "HttpOnly", "SameSite=Lax"));
        String authenticatedCookies = mergeCookies(csrfCookie, cookies(registerResponse.getHeaders()));
        ResponseEntity<Map> authenticatedCsrf = rest.exchange(url("/api/v1/auth/csrf"), HttpMethod.GET,
                new HttpEntity<>(cookieHeaders(authenticatedCookies)), Map.class);
        assertThat(authenticatedCsrf.getStatusCode()).isEqualTo(HttpStatus.OK);
        csrfToken = (String) authenticatedCsrf.getBody().get("token");
        csrfHeader = (String) authenticatedCsrf.getBody().get("headerName");
        authenticatedCookies = mergeCookies(authenticatedCookies, cookies(authenticatedCsrf.getHeaders()));

        ResponseEntity<Map> meResponse = rest.exchange(
                url("/api/v1/auth/me"), HttpMethod.GET, new HttpEntity<>(cookieHeaders(authenticatedCookies)), Map.class);
        assertThat(meResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(meResponse.getBody()).containsEntry("email", email);

        ResponseEntity<Void> logoutResponse = rest.exchange(
                url("/api/v1/auth/logout"),
                HttpMethod.POST,
                new HttpEntity<>(csrfHeaders(csrfHeader, csrfToken, authenticatedCookies)),
                Void.class);
        assertThat(logoutResponse.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        ResponseEntity<Map> afterLogoutResponse = rest.exchange(
                url("/api/v1/auth/me"), HttpMethod.GET, new HttpEntity<>(cookieHeaders(authenticatedCookies)), Map.class);
        assertThat(afterLogoutResponse.getStatusCode().is4xxClientError()).isTrue();

        ResponseEntity<Map> loginCsrfResponse = rest.getForEntity(url("/api/v1/auth/csrf"), Map.class);
        String loginCsrfToken = (String) loginCsrfResponse.getBody().get("token");
        String loginCsrfHeader = (String) loginCsrfResponse.getBody().get("headerName");
        String loginCsrfCookie = cookies(loginCsrfResponse.getHeaders());
        HttpEntity<Map<String, String>> loginRequest = new HttpEntity<>(Map.of(
                "email", email,
                "password", password), csrfHeaders(loginCsrfHeader, loginCsrfToken, loginCsrfCookie));
        ResponseEntity<Map> loginResponse = rest.postForEntity(url("/api/v1/auth/login"), loginRequest, Map.class);

        assertThat(loginResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(loginResponse.getBody()).containsEntry("email", email);
    }

    @Test
    void registrationRejectsInvalidInput() {
        ResponseEntity<Map> csrfResponse = rest.getForEntity(url("/api/v1/auth/csrf"), Map.class);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(Map.of(
                "name", "",
                "email", "not-an-email",
                "password", "short",
                "acceptedTerms", false), csrfHeaders(
                (String) csrfResponse.getBody().get("headerName"),
                (String) csrfResponse.getBody().get("token"),
                cookies(csrfResponse.getHeaders())));

        ResponseEntity<Map> response = rest.postForEntity(url("/api/v1/auth/register"), request, Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).containsEntry("code", "VALIDATION_ERROR");
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }

    private HttpHeaders csrfHeaders(String headerName, String token, String cookies) {
        HttpHeaders headers = cookieHeaders(cookies);
        headers.set(headerName, token);
        return headers;
    }

    private HttpHeaders cookieHeaders(String cookies) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.COOKIE, cookies);
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
}
