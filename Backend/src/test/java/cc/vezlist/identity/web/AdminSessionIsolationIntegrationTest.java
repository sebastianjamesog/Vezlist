package cc.vezlist.identity.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import cc.vezlist.identity.domain.Role;
import cc.vezlist.identity.domain.User;
import cc.vezlist.identity.persistence.UserRepository;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

/** Uses real cookies and HTTP: mocked authentication cannot verify browser session isolation. */
@Testcontainers
@Tag("integration")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminSessionIsolationIntegrationTest {
    private static final String PUBLIC = "/api/v1/auth";
    private static final String ADMIN = "/api/v1/admin/auth";
    private static final String PASSWORD = "SessionTestPassword123!";

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"));

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("vezlist.seed-admin", () -> "false");
    }

    @Autowired TestRestTemplate rest;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder passwords;
    @Autowired JdbcTemplate jdbc;
    @LocalServerPort int port;
    private CloseableHttpClient httpClient;

    @BeforeEach
    void explicitCookieJarAndNoAutomaticRetries() {
        // Observe the first 429 response; the default Apache client would wait
        // Retry-After and repeat it. Browser cookies are managed explicitly below.
        httpClient = HttpClients.custom().disableAutomaticRetries().disableCookieManagement().build();
        rest.getRestTemplate().setRequestFactory(new HttpComponentsClientHttpRequestFactory(httpClient));
    }

    @AfterEach
    void closeHttpClient() throws java.io.IOException {
        httpClient.close();
    }

    @Test
    void adminLoginAndLogoutLeaveMarketplaceIdentityAndSessionUntouched() {
        User customer = user(false);
        User staff = user(true);
        Browser browser = new Browser();
        login(browser, PUBLIC, customer);
        String customerSession = browser.cookies.get("SESSION");
        login(browser, ADMIN, staff);

        assertThat(browser.cookies.get("SESSION")).isEqualTo(customerSession);
        assertIdentity(browser, PUBLIC, customer);
        assertIdentity(browser, ADMIN, staff);
        assertThat(browser.get("/api/v1/admin/users?limit=1").getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(browser.get("/api/v1/support/articles/admin?limit=1").getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(browser.getText("/api/v1/moderation/verification-requests?site=MARKETPLACE&limit=1").getStatusCode())
                .isEqualTo(HttpStatus.OK);

        assertThat(browser.post(ADMIN + "/logout", null, ADMIN).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertIdentity(browser, PUBLIC, customer);
        assertThat(browser.get(ADMIN + "/me").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(browser.cookies.get("SESSION")).isEqualTo(customerSession);
    }

    @Test
    void publicLogoutAndAnotherPublicLoginDoNotReplaceTheAdminSession() {
        User firstCustomer = user(false);
        User secondCustomer = user(false);
        User staff = user(true);
        Browser browser = new Browser();
        login(browser, ADMIN, staff);
        String adminSession = browser.cookies.get("ADMIN_SESSION");
        login(browser, PUBLIC, firstCustomer);
        assertThat(browser.post(PUBLIC + "/logout", null, PUBLIC).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertIdentity(browser, ADMIN, staff);
        assertThat(browser.get(PUBLIC + "/me").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        login(browser, PUBLIC, secondCustomer);
        assertIdentity(browser, PUBLIC, secondCustomer);
        assertIdentity(browser, ADMIN, staff);
        assertThat(browser.cookies.get("ADMIN_SESSION")).isEqualTo(adminSession);
    }

    @Test
    void publicSessionCannotAuthorizeStaffRoutesEvenWhenItsOwnerIsAnAdmin() {
        for (boolean staff : new boolean[] {false, true}) {
            Browser browser = new Browser();
            login(browser, PUBLIC, user(staff));
            assertThat(browser.get(ADMIN + "/me").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
            assertThat(browser.get("/api/v1/admin/users?limit=1").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
            assertThat(browser.get("/api/v1/support/articles/admin?limit=1").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
            assertThat(browser.getText("/api/v1/moderation/verification-requests?site=MARKETPLACE&limit=1").getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }
    }

    @Test
    void ordinaryAccountCannotCreateConsoleSessionOrReplaceExistingPublicLogin() {
        User customer = user(false);
        Browser browser = new Browser();
        login(browser, PUBLIC, customer);
        String publicSession = browser.cookies.get("SESSION");
        ResponseEntity<Map> rejected = browser.post(ADMIN + "/login", credentials(customer), ADMIN);
        assertThat(rejected.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertIdentity(browser, PUBLIC, customer);
        assertThat(browser.cookies.get("SESSION")).isEqualTo(publicSession);
        assertThat(browser.get(ADMIN + "/me").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void copyingSessionCookieValuesAcrossScopesDoesNotTransferAuthentication() {
        User staff = user(true);
        Browser original = new Browser();
        login(original, PUBLIC, staff);
        login(original, ADMIN, staff);

        Browser forgedAdmin = new Browser();
        forgedAdmin.cookies.put("ADMIN_SESSION", original.cookies.get("SESSION"));
        assertThat(forgedAdmin.get(ADMIN + "/me").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        Browser forgedPublic = new Browser();
        forgedPublic.cookies.put("SESSION", original.cookies.get("ADMIN_SESSION"));
        assertThat(forgedPublic.get(PUBLIC + "/me").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertIdentity(original, PUBLIC, staff);
        assertIdentity(original, ADMIN, staff);
    }

    @Test
    void bothLoginScopesRejectMissingAndIncorrectCsrfTokens() {
        User staff = user(true);
        for (String scope : new String[] {PUBLIC, ADMIN}) {
            Browser browser = new Browser();
            ResponseEntity<Map> missing = browser.request(HttpMethod.POST, scope + "/login", credentials(staff), new HttpHeaders());
            assertCsrfDenied(missing);
            browser.csrf(scope);
            HttpHeaders invalid = new HttpHeaders();
            invalid.set("X-XSRF-TOKEN", "incorrect-token");
            assertCsrfDenied(browser.request(HttpMethod.POST, scope + "/login", credentials(staff), invalid));
            assertThat(browser.get(scope + "/me").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        }
    }

    @Test
    void csrfTokenFromOneScopeCannotLogOutTheOtherScope() {
        Browser browser = new Browser();
        User customer = user(false);
        User staff = user(true);
        login(browser, PUBLIC, customer);
        login(browser, ADMIN, staff);
        String publicToken = browser.csrf(PUBLIC);
        String adminToken = browser.csrf(ADMIN);
        HttpHeaders publicCsrf = new HttpHeaders();
        publicCsrf.set("X-XSRF-TOKEN", publicToken);
        assertCsrfDenied(browser.request(HttpMethod.POST, ADMIN + "/logout", null, publicCsrf));
        HttpHeaders adminCsrf = new HttpHeaders();
        adminCsrf.set("X-XSRF-TOKEN", adminToken);
        assertCsrfDenied(browser.request(HttpMethod.POST, PUBLIC + "/logout", null, adminCsrf));
        assertIdentity(browser, PUBLIC, customer);
        assertIdentity(browser, ADMIN, staff);
    }

    @Test
    void successfulLoginRotatesSessionIdAndCsrfCookieInEachScope() {
        User staff = user(true);
        for (String scope : new String[] {PUBLIC, ADMIN}) {
            Browser browser = new Browser();
            login(browser, scope, staff);
            browser.csrf(scope);
            String sessionName = scope.equals(ADMIN) ? "ADMIN_SESSION" : "SESSION";
            String csrfName = scope.equals(ADMIN) ? "ADMIN-XSRF-TOKEN" : "XSRF-TOKEN";
            String firstSession = browser.cookies.get(sessionName);
            String firstCsrf = browser.cookies.get(csrfName);
            Browser oldSession = browser.copy();
            login(browser, scope, staff);
            browser.csrf(scope);
            assertThat(browser.cookies.get(sessionName)).isNotBlank().isNotEqualTo(firstSession);
            assertThat(browser.cookies.get(csrfName)).isNotBlank().isNotEqualTo(firstCsrf);
            assertThat(oldSession.get(scope + "/me").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
            assertIdentity(browser, scope, staff);
        }
    }

    @Test
    void staffCorsRejectsPublicSiteOriginsIncludingPreflight() {
        HttpHeaders publicOrigin = new HttpHeaders();
        publicOrigin.setOrigin("http://localhost:3000");
        ResponseEntity<String> rejected = textRequest(HttpMethod.GET, ADMIN + "/csrf", publicOrigin);
        assertThat(rejected.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(rejected.getHeaders().getAccessControlAllowOrigin()).isNull();
        assertThat(textRequest(HttpMethod.GET, PUBLIC + "/csrf", publicOrigin).getStatusCode()).isEqualTo(HttpStatus.OK);

        publicOrigin.setAccessControlRequestMethod(HttpMethod.POST);
        publicOrigin.setAccessControlRequestHeaders(java.util.List.of("content-type", "x-xsrf-token"));
        assertThat(textRequest(HttpMethod.OPTIONS, ADMIN + "/login", publicOrigin).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);

        HttpHeaders adminOrigin = new HttpHeaders();
        adminOrigin.setOrigin("http://localhost:3002");
        ResponseEntity<String> allowed = textRequest(HttpMethod.GET, ADMIN + "/csrf", adminOrigin);
        assertThat(allowed.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(allowed.getHeaders().getAccessControlAllowOrigin()).isEqualTo("http://localhost:3002");
        assertThat(allowed.getHeaders().getAccessControlAllowCredentials()).isTrue();
        adminOrigin.setAccessControlRequestMethod(HttpMethod.POST);
        adminOrigin.setAccessControlRequestHeaders(java.util.List.of("content-type", "x-xsrf-token"));
        assertThat(textRequest(HttpMethod.OPTIONS, ADMIN + "/login", adminOrigin).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void staleConsoleTabsCannotCallPublicAuthenticationEndpoints() {
        HttpHeaders adminOrigin = new HttpHeaders();
        adminOrigin.setOrigin("http://localhost:3002");
        for (String path : new String[] {PUBLIC + "/csrf", "/api/v1/%61uth/csrf", "/%61pi/v1/auth/csrf"}) {
            ResponseEntity<String> response = textRequest(HttpMethod.GET, path, adminOrigin);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
            assertThat(response.getHeaders().getAccessControlAllowOrigin()).isNull();
        }
        Browser browser = new Browser();
        User customer = user(false);
        login(browser, PUBLIC, customer);
        adminOrigin.set("X-XSRF-TOKEN", browser.csrf(PUBLIC));
        for (String path : new String[] {PUBLIC + "/logout", "/api/v1/%61uth/logout"}) {
            adminOrigin.set(HttpHeaders.COOKIE, browser.cookies.entrySet().stream()
                    .map(entry -> entry.getKey() + "=" + entry.getValue()).collect(Collectors.joining("; ")));
            ResponseEntity<String> response = textRequest(HttpMethod.POST, path, adminOrigin);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
            assertIdentity(browser, PUBLIC, customer);
        }
    }

    @Test
    void sessionCookiesAreHostOnlyHttpOnlySameSiteAndSecureBehindHttpsProxy() {
        User staff = user(true);
        for (String scope : new String[] {PUBLIC, ADMIN}) {
            Browser browser = new Browser();
            String token = browser.csrf(scope);
            HttpHeaders headers = new HttpHeaders();
            headers.set("X-XSRF-TOKEN", token);
            headers.set("X-Forwarded-Proto", "https");
            headers.set("X-Forwarded-Host", "api.vezlist.cc");
            ResponseEntity<Map> loggedIn = browser.request(HttpMethod.POST, scope + "/login", credentials(staff), headers);
            assertThat(loggedIn.getStatusCode()).isEqualTo(HttpStatus.OK);
            String sessionName = scope.equals(ADMIN) ? "ADMIN_SESSION=" : "SESSION=";
            assertThat(loggedIn.getHeaders().getOrEmpty(HttpHeaders.SET_COOKIE))
                    .anySatisfy(cookie -> assertThat(cookie).startsWith(sessionName)
                            .contains("Path=/", "HttpOnly", "SameSite=Lax", "Secure")
                            .doesNotContain("Domain="));
        }
    }

    @Test
    void suspendedAccountLosesBothExistingSessionsEvenIfLaterReinstated() {
        User staff = user(true);
        Browser browser = new Browser();
        login(browser, PUBLIC, staff);
        login(browser, ADMIN, staff);
        Browser oldCookies = browser.copy();
        jdbc.update("UPDATE app_users SET enabled = false WHERE id = ?", staff.getId());
        assertThat(browser.get(PUBLIC + "/me").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(browser.get(ADMIN + "/me").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        jdbc.update("UPDATE app_users SET enabled = true WHERE id = ?", staff.getId());
        assertThat(oldCookies.get(PUBLIC + "/me").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(oldCookies.get(ADMIN + "/me").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void roleRemovalImmediatelyStopsExistingConsoleSession() {
        User staff = user(true);
        Browser browser = new Browser();
        login(browser, ADMIN, staff);
        jdbc.update("DELETE FROM user_roles WHERE user_id = ? AND role = 'ADMIN'", staff.getId());
        assertThat(browser.get(ADMIN + "/me").getStatusCode().is4xxClientError()).isTrue();
        assertThat(browser.get("/api/v1/admin/users?limit=1").getStatusCode().is4xxClientError()).isTrue();
    }

    @Test
    void changingEmailRevokesOtherSessionsAndKeepsCurrentSessionUsable() {
        User staff = user(true);
        Browser current = new Browser();
        Browser elsewhere = new Browser();
        login(current, PUBLIC, staff);
        login(elsewhere, PUBLIC, staff);
        login(elsewhere, ADMIN, staff);
        Browser oldCurrentCookie = current.copy();
        String nextEmail = "updated-" + UUID.randomUUID() + "@example.test";
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-XSRF-TOKEN", current.csrf(PUBLIC));
        ResponseEntity<Map> updated = current.request(HttpMethod.PATCH, "/api/v1/me/profile",
                Map.of("name", "Renamed account", "email", nextEmail), headers);
        assertThat(updated.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(current.get(PUBLIC + "/me").getBody()).containsEntry("email", nextEmail);
        assertThat(elsewhere.get(PUBLIC + "/me").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(elsewhere.get(ADMIN + "/me").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(oldCurrentCookie.get(PUBLIC + "/me").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void changedPasswordInvalidatesExistingPublicAndConsoleCredentials() {
        User staff = user(true);
        Browser browser = new Browser();
        login(browser, PUBLIC, staff);
        login(browser, ADMIN, staff);
        jdbc.update("UPDATE app_users SET password_hash = ? WHERE id = ?",
                passwords.encode("AChangedPassword456!"), staff.getId());
        assertThat(browser.get(PUBLIC + "/me").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(browser.get(ADMIN + "/me").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void encodedRouteAliasesUseTheSameStaffCookieAndCsrfBoundary() {
        User customer = user(false);
        User staff = user(true);
        Browser browser = new Browser();
        login(browser, PUBLIC, customer);
        for (String prefix : new String[] {"/api/v1/%61dmin/auth", "/api/v1/admin/%61uth", "/%61pi/v1/admin/auth"}) {
            ResponseEntity<Map> denied = browser.post(prefix + "/login", credentials(customer), ADMIN);
            assertThat(denied.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
            assertThat(denied.getBody()).containsEntry("code", "CONSOLE_ACCESS_DENIED");
            ResponseEntity<Map> allowed = browser.post(prefix + "/login", credentials(staff), ADMIN);
            assertThat(allowed.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertIdentity(browser, PUBLIC, customer);
            assertIdentity(browser, ADMIN, staff);
        }
        for (String path : new String[] {"/api/v1/%61dmin/users?limit=1",
                "/api/v1/%6doderation/verification-requests?site=MARKETPLACE&limit=1",
                "/api/v1/support/articles/%61dmin?limit=1"}) {
            assertThat(browser.getText(path).getStatusCode()).isEqualTo(HttpStatus.OK);
            Browser publicOnly = new Browser();
            publicOnly.cookies.put("SESSION", browser.cookies.get("SESSION"));
            assertThat(publicOnly.getText(path).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
            HttpHeaders publicOrigin = new HttpHeaders();
            publicOrigin.setOrigin("http://localhost:3000");
            assertThat(textRequest(HttpMethod.GET, path, publicOrigin).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        }
    }

    @Test
    void publicAndAdminLoginShareAccountAttemptBudgetBeforePasswordVerification() {
        User staff = user(true);
        Browser browser = new Browser();
        for (int attempt = 0; attempt < 10; attempt++) {
            String scope = attempt % 2 == 0 ? PUBLIC : ADMIN;
            ResponseEntity<Map> failed = browser.post(scope + "/login",
                    Map.of("email", staff.getEmail(), "password", "IncorrectPassword123!"), scope);
            assertThat(failed.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
            assertThat(failed.getBody()).containsEntry("code", "INVALID_CREDENTIALS");
        }
        ResponseEntity<Map> limited = browser.post(ADMIN + "/login", credentials(staff), ADMIN);
        assertThat(limited.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(limited.getBody()).containsEntry("code", "LOGIN_RATE_LIMITED");
        assertThat(Integer.parseInt(limited.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)))
                .isBetween(1, 300);
        assertThat(browser.get(ADMIN + "/me").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        login(new Browser(), PUBLIC, user(false));
    }

    @Test
    void suspendedLoginDoesNotRevealAccountStatusBeforePasswordVerification() {
        User staff = user(true);
        jdbc.update("UPDATE app_users SET enabled = false WHERE id = ?", staff.getId());
        for (String scope : new String[] {PUBLIC, ADMIN}) {
            Browser browser = new Browser();
            ResponseEntity<Map> suspended = browser.post(scope + "/login", credentials(staff), scope);
            ResponseEntity<Map> wrongPassword = browser.post(scope + "/login",
                    Map.of("email", staff.getEmail(), "password", "IncorrectPassword123!"), scope);
            ResponseEntity<Map> unknown = browser.post(scope + "/login",
                    Map.of("email", "unknown-" + UUID.randomUUID() + "@example.test", "password", PASSWORD), scope);
            for (ResponseEntity<Map> response : java.util.List.of(suspended, wrongPassword, unknown)) {
                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
                assertThat(response.getBody()).containsEntry("code", "INVALID_CREDENTIALS")
                        .containsEntry("message", unknown.getBody().get("message"));
            }
        }
    }

    private User user(boolean staff) {
        User user = new User(staff ? "Console security test" : "Marketplace security test",
                "isolation-" + UUID.randomUUID() + "@example.test", passwords.encode(PASSWORD));
        if (staff) user.grantRole(Role.ADMIN);
        return users.saveAndFlush(user);
    }

    private Map<String, String> credentials(User user) {
        return Map.of("email", user.getEmail(), "password", PASSWORD);
    }

    private void login(Browser browser, String scope, User user) {
        ResponseEntity<Map> response = browser.post(scope + "/login", credentials(user), scope);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).containsEntry("email", user.getEmail());
    }

    private void assertIdentity(Browser browser, String scope, User user) {
        ResponseEntity<Map> response = browser.get(scope + "/me");
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).containsEntry("email", user.getEmail()).containsEntry("id", user.getId().toString());
    }

    private void assertCsrfDenied(ResponseEntity<Map> response) {
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(response.getBody()).containsEntry("code", "CSRF_INVALID");
    }

    private ResponseEntity<String> textRequest(HttpMethod method, String path, HttpHeaders headers) {
        return rest.exchange(java.net.URI.create("http://localhost:" + port + path), method, new HttpEntity<>(headers), String.class);
    }

    /** One browser cookie jar, shared by both app tabs, without RestTemplate's implicit cookie handling. */
    private final class Browser {
        private final Map<String, String> cookies = new LinkedHashMap<>();

        private Browser copy() {
            Browser copy = new Browser();
            copy.cookies.putAll(cookies);
            return copy;
        }

        private ResponseEntity<String> getText(String path) {
            HttpHeaders headers = new HttpHeaders();
            headers.set(HttpHeaders.COOKIE, cookies.entrySet().stream()
                    .map(entry -> entry.getKey() + "=" + entry.getValue()).collect(Collectors.joining("; ")));
            return textRequest(HttpMethod.GET, path, headers);
        }

        private ResponseEntity<Map> get(String path) {
            return request(HttpMethod.GET, path, null, new HttpHeaders());
        }

        private String csrf(String scope) {
            ResponseEntity<Map> response = get(scope + "/csrf");
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            String token = (String) response.getBody().get("token");
            assertThat(token).isNotBlank();
            return token;
        }

        private ResponseEntity<Map> post(String path, Object body, String csrfScope) {
            HttpHeaders headers = new HttpHeaders();
            headers.set("X-XSRF-TOKEN", csrf(csrfScope));
            return request(HttpMethod.POST, path, body, headers);
        }

        private ResponseEntity<Map> request(HttpMethod method, String path, Object body, HttpHeaders supplied) {
            HttpHeaders headers = new HttpHeaders();
            headers.putAll(supplied);
            if (!cookies.isEmpty()) headers.set(HttpHeaders.COOKIE, cookies.entrySet().stream()
                    .map(entry -> entry.getKey() + "=" + entry.getValue()).collect(Collectors.joining("; ")));
            ResponseEntity<Map> response = rest.exchange(java.net.URI.create("http://localhost:" + port + path),
                    method, new HttpEntity<>(body, headers), Map.class);
            for (String cookie : response.getHeaders().getOrEmpty(HttpHeaders.SET_COOKIE)) {
                String pair = cookie.split(";", 2)[0];
                int separator = pair.indexOf('=');
                String name = pair.substring(0, separator);
                String value = pair.substring(separator + 1);
                if (value.isBlank() || cookie.contains("Max-Age=0")) cookies.remove(name);
                else cookies.put(name, value);
            }
            return response;
        }
    }
}
