package cc.vezlist.support.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import cc.vezlist.shared.domain.SiteScope;
import cc.vezlist.support.application.SupportTicketService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
@Tag("integration")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SupportRealtimeIntegrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("vezlist.seed-admin", () -> false);
        registry.add("vezlist.support.events-lifetime-ms", () -> 4000);
    }
    @Autowired TestRestTemplate rest;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder passwords;
    @Autowired ObjectMapper json;
    @Autowired SupportTicketService service;
    @Autowired TransactionTemplate transaction;
    @LocalServerPort int port;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    @Test void unreadCountsAreDurablePerActorAndOldReceiptsCannotConsumeNewMessages() {
        Actor owner = actor(false);
        Actor admin = actor(true);
        Actor colleague = actor(true, "MODERATOR");
        JsonNode created = create(owner, "MARKETPLACE");
        String id = created.get("id").asText();
        String first = lastMessage(created);
        assertThat(created.get("unreadCount").asLong()).isZero();
        assertUnread(admin, id, 1);
        JsonNode second = reply(owner, id, "Another detail");
        assertUnread(admin, id, 2);
        assertUnread(colleague, id, 2);
        read(admin, id, first);
        assertUnread(admin, id, 1);
        read(admin, id, lastMessage(second));
        assertUnread(admin, id, 0);
        assertUnread(colleague, id, 2);
        JsonNode answer = reply(admin, id, "First answer");
        assertUnread(owner, id, 1);
        JsonNode newer = reply(admin, id, "Second answer");
        read(owner, id, lastMessage(answer));
        assertUnread(owner, id, 1);
        read(owner, id, first); // A delayed browser request must never move the marker backwards.
        assertUnread(owner, id, 1);
        read(owner, id, lastMessage(newer));
        assertUnread(owner, id, 0);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM support_ticket_reads WHERE ticket_id=?", Long.class, UUID.fromString(id))).isEqualTo(2);
        assertThat(body(owner, HttpMethod.GET, owner.base + "?site=MARKETPLACE", null, 200)
                .get("items").get(0).get("unreadCount").asLong()).isZero();
        assertThat(body(admin, HttpMethod.GET, admin.base + "/" + id, null, 200).get("messages").size()).isEqualTo(4);
    }

    @Test void readMarkersRequireOwnershipARealMessageInThisTicketAndCsrf() {
        Actor owner = actor(false);
        Actor stranger = actor(false);
        Actor admin = actor(true);
        JsonNode ticket = create(owner, "PERSONALS");
        JsonNode other = create(owner, "MARKETPLACE");
        String id = ticket.get("id").asText();
        body(stranger, HttpMethod.POST, stranger.base + "/" + id + "/read", Map.of("messageId", lastMessage(ticket)), 404);
        body(owner, HttpMethod.POST, owner.base + "/" + id + "/read", Map.of("messageId", lastMessage(other)), 404);
        body(admin, HttpMethod.POST, admin.base + "/" + id + "/read", Map.of("messageId", UUID.randomUUID()), 404);
        body(owner, HttpMethod.POST, owner.base + "/" + id + "/read", Map.of(), 400);
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.COOKIE, owner.cookies);
        assertThat(rest.exchange(url(owner.base + "/" + id + "/read"), HttpMethod.POST,
                new HttpEntity<>(Map.of("messageId", lastMessage(ticket)), headers), JsonNode.class).getStatusCode().value()).isEqualTo(403);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM support_ticket_reads WHERE ticket_id=?", Long.class, UUID.fromString(id))).isZero();
    }

    @Test void streamsAreAuthenticatedAndRejectTheOtherSessionAudience() throws Exception {
        Actor owner = actor(false);
        Actor admin = actor(true);
        assertThat(rawStreamStatus(null, "/api/v1/me/tickets/events?site=MARKETPLACE")).isEqualTo(401);
        assertThat(rawStreamStatus(owner, "/api/v1/admin/tickets/events?site=MARKETPLACE")).isEqualTo(401);
        assertThat(rawStreamStatus(admin, "/api/v1/me/tickets/events?site=MARKETPLACE")).isEqualTo(401);
        try (Probe probe = stream(owner, "MARKETPLACE")) {
            assertThat(probe.next().get("ticketId").isNull()).isTrue();
            assertThat(probe.response.headers().firstValue("X-Accel-Buffering")).contains("no");
            assertThat(probe.response.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        }
    }

    @Test void committedMessagesNotifyOnlyTheOwnerAndStaffWithinTheSelectedBoard() throws Exception {
        Actor owner = actor(false);
        Actor stranger = actor(false);
        Actor admin = actor(true);
        try (Probe own = stream(owner, "MARKETPLACE"); Probe other = stream(stranger, "MARKETPLACE");
             Probe wrongBoard = stream(owner, "PERSONALS"); Probe staff = stream(admin, "MARKETPLACE");
             Probe wrongStaffBoard = stream(admin, "PERSONALS")) {
            for (Probe probe : List.of(own, other, wrongBoard, staff, wrongStaffBoard)) probe.next();
            JsonNode ticket = create(owner, "MARKETPLACE");
            String id = ticket.get("id").asText();
            assertInvalidation(own.next(), id);
            assertInvalidation(staff.next(), id);
            assertThat(other.poll()).isNull();
            assertThat(wrongBoard.poll()).isNull();
            assertThat(wrongStaffBoard.poll()).isNull();
            reply(admin, id, "Private support response");
            assertInvalidation(own.next(), id);
            assertInvalidation(staff.next(), id);
            body(admin, HttpMethod.PATCH, admin.base + "/" + id + "/status", Map.of("status", "RESOLVED"), 200);
            assertInvalidation(own.next(), id);
            assertInvalidation(staff.next(), id);
        }
    }

    @Test void readAcknowledgementsNotifyOnlyTheSameActorAndDoNotLoopOnRepeatedMarkers() throws Exception {
        Actor owner = actor(false);
        Actor admin = actor(true);
        JsonNode ticket = create(owner, "MARKETPLACE");
        String id = ticket.get("id").asText();
        JsonNode answer = reply(admin, id, "Support answer");
        try (Probe one = stream(owner, "MARKETPLACE"); Probe two = stream(owner, "MARKETPLACE");
             Probe staff = stream(admin, "MARKETPLACE")) {
            one.next(); two.next(); staff.next();
            read(owner, id, lastMessage(answer));
            assertInvalidation(one.next(), id);
            assertInvalidation(two.next(), id);
            assertThat(staff.poll()).isNull();
            read(owner, id, lastMessage(answer));
            assertThat(one.poll()).isNull();
            assertThat(two.poll()).isNull();
        }
    }

    @Test void rolledBackConversationChangesNeverProduceInvalidations() throws Exception {
        Actor owner = actor(false);
        try (Probe probe = stream(owner, "MARKETPLACE")) {
            probe.next();
            UUID id = transaction.execute(status -> {
                var ticket = service.create(owner.id, new SupportTicketRequests.Create(SiteScope.MARKETPLACE, "Rollback", "Not committed"));
                status.setRollbackOnly();
                return ticket.id();
            });
            assertThat(jdbc.queryForObject("SELECT count(*) FROM support_tickets WHERE id=?", Long.class, id)).isZero();
            assertThat(probe.poll()).isNull();
        }
    }

    @Test void streamsExpireAndReconnectRefreshesDurableStateWhileRevokedSessionsAreDenied() throws Exception {
        Actor owner = actor(false);
        try (Probe first = stream(owner, "MARKETPLACE")) {
            first.next();
            assertThat(first.finished.await(6, TimeUnit.SECONDS)).isTrue();
        }
        JsonNode ticket = create(owner, "MARKETPLACE");
        try (Probe reconnected = stream(owner, "MARKETPLACE")) {
            assertThat(reconnected.next().get("ticketId").isNull()).isTrue();
            assertThat(body(owner, HttpMethod.GET, owner.base + "/" + ticket.get("id").asText(), null, 200).get("subject").asText()).isEqualTo("Account question");
        }
        jdbc.update("UPDATE app_users SET enabled=false WHERE id=?", owner.id);
        assertThat(rawStreamStatus(owner, owner.base + "/events?site=MARKETPLACE")).isEqualTo(401);
    }

    @Test void streamConnectionsAreBoundedPerActor() throws Exception {
        Actor owner = actor(false);
        List<Probe> probes = new ArrayList<>();
        try {
            for (int i=0; i<5; i++) { Probe probe = stream(owner, "MARKETPLACE"); probes.add(probe); probe.next(); }
            assertThat(rawStreamStatus(owner, owner.base + "/events?site=PERSONALS")).isEqualTo(429);
        } finally {
            for (Probe probe : probes) probe.close();
        }
    }

    private void assertInvalidation(JsonNode data, String id) {
        assertThat(data.size()).isEqualTo(1);
        assertThat(data.get("ticketId").asText()).isEqualTo(id);
    }
    private void assertUnread(Actor actor, String id, long count) {
        assertThat(body(actor, HttpMethod.GET, actor.base + "/" + id, null, 200).get("unreadCount").asLong()).isEqualTo(count);
    }
    private JsonNode create(Actor owner, String site) {
        return body(owner, HttpMethod.POST, owner.base, Map.of("site", site, "subject", "Account question", "body", "Please help."), 201);
    }
    private JsonNode reply(Actor actor, String id, String text) {
        return body(actor, HttpMethod.POST, actor.base + "/" + id + "/messages", Map.of("body", text), 200);
    }
    private void read(Actor actor, String id, String message) {
        body(actor, HttpMethod.POST, actor.base + "/" + id + "/read", Map.of("messageId", message), 200);
    }
    private String lastMessage(JsonNode ticket) {
        JsonNode messages = ticket.get("messages");
        return messages.get(messages.size()-1).get("id").asText();
    }
    private Actor actor(boolean staff) { return actor(staff, staff ? "ADMIN" : "USER"); }
    private Actor actor(boolean staff, String role) {
        UUID id = UUID.randomUUID();
        String email = id + "@example.test";
        String password = "SafeTicketTest123!";
        jdbc.update("INSERT INTO app_users(id,display_name,email,password_hash,enabled) VALUES (?,'Ticket user',?,?,true)", id,email,passwords.encode(password));
        jdbc.update("INSERT INTO user_roles(user_id,role) VALUES (?,?)", id, role);
        String auth = staff ? "/api/v1/admin/auth" : "/api/v1/auth";
        ResponseEntity<JsonNode> csrf = rest.getForEntity(url(auth + "/csrf"), JsonNode.class);
        String cookies = merge("", csrf.getHeaders());
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.COOKIE, cookies);
        headers.set(csrf.getBody().get("headerName").asText(), csrf.getBody().get("token").asText());
        ResponseEntity<JsonNode> login = rest.postForEntity(url(auth + "/login"), new HttpEntity<>(Map.of("email",email,"password",password),headers),JsonNode.class);
        assertThat(login.getStatusCode().value()).isEqualTo(200);
        cookies = merge(cookies, login.getHeaders());
        headers = new HttpHeaders(); headers.set(HttpHeaders.COOKIE,cookies);
        csrf = rest.exchange(url(auth + "/csrf"),HttpMethod.GET,new HttpEntity<>(headers),JsonNode.class);
        return new Actor(id,staff ? "/api/v1/admin/tickets" : "/api/v1/me/tickets",merge(cookies,csrf.getHeaders()),
                csrf.getBody().get("headerName").asText(),csrf.getBody().get("token").asText());
    }
    private JsonNode body(Actor actor,HttpMethod method,String path,Object body,int expected) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.COOKIE,actor.cookies); headers.set(actor.csrfHeader,actor.csrf);
        ResponseEntity<JsonNode> response = rest.exchange(url(path),method,new HttpEntity<>(body,headers),JsonNode.class);
        assertThat(response.getStatusCode().value()).withFailMessage("%s %s: %s",method,path,response.getBody()).isEqualTo(expected);
        return response.getBody();
    }
    private String merge(String prior,HttpHeaders headers) {
        Map<String,String> jar = new LinkedHashMap<>();
        for (String pair : prior.split("; ")) if (!pair.isBlank()) jar.put(pair.substring(0,pair.indexOf('=')),pair.substring(pair.indexOf('=')+1));
        for (String cookie : headers.getOrEmpty(HttpHeaders.SET_COOKIE)) {
            String pair = cookie.substring(0,cookie.indexOf(';')); int separator=pair.indexOf('=');
            if (separator==pair.length()-1) jar.remove(pair.substring(0,separator));
            else jar.put(pair.substring(0,separator),pair.substring(separator+1));
        }
        return jar.entrySet().stream().map(e->e.getKey()+"="+e.getValue()).collect(java.util.stream.Collectors.joining("; "));
    }
    private String url(String path) { return "http://localhost:"+port+path; }
    private Probe stream(Actor actor,String site) throws Exception {
        HttpResponse<InputStream> response = http.send(HttpRequest.newBuilder(URI.create(url(actor.base+"/events?site="+site)))
                .header("Cookie",actor.cookies).timeout(Duration.ofSeconds(8)).GET().build(),HttpResponse.BodyHandlers.ofInputStream());
        assertThat(response.statusCode()).isEqualTo(200);
        return new Probe(response);
    }
    private int rawStreamStatus(Actor actor,String path) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(url(path))).timeout(Duration.ofSeconds(8));
        if(actor!=null) request.header("Cookie",actor.cookies);
        var response=http.send(request.GET().build(),HttpResponse.BodyHandlers.ofInputStream());
        response.body().close(); return response.statusCode();
    }
    private record Actor(UUID id,String base,String cookies,String csrfHeader,String csrf) {}
    private final class Probe implements AutoCloseable {
        final HttpResponse<InputStream> response;
        final LinkedBlockingQueue<JsonNode> data = new LinkedBlockingQueue<>();
        final CountDownLatch finished = new CountDownLatch(1);
        Probe(HttpResponse<InputStream> response) {
            this.response=response;
            Thread.ofVirtual().start(()->{
                try(var reader=new BufferedReader(new InputStreamReader(response.body(),StandardCharsets.UTF_8))) {
                    String line; String event="";
                    while((line=reader.readLine())!=null) {
                        if(line.startsWith("event:")) event=line.substring(6).strip();
                        if(line.startsWith("data:") && event.equals("tickets-changed")) data.add(json.readTree(line.substring(5).strip()));
                    }
                } catch(Exception ignored) { } finally { finished.countDown(); }
            });
        }
        JsonNode next() throws Exception { JsonNode result=data.poll(3,TimeUnit.SECONDS); assertThat(result).isNotNull(); return result; }
        JsonNode poll() throws Exception { return data.poll(200,TimeUnit.MILLISECONDS); }
        public void close() throws Exception { response.body().close(); }
    }
}
