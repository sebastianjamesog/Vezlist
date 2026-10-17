package cc.vezlist.live.web;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.identity.domain.Role;
import cc.vezlist.live.application.*;
import cc.vezlist.media.storage.ObjectStorage;
import cc.vezlist.live.realtime.LiveEncoder;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
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
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Tag("integration") @Testcontainers @SpringBootTest @AutoConfigureMockMvc
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class LiveSessionIntegrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES=new PostgreSQLContainer<>(DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry){
        registry.add("spring.datasource.url",POSTGRES::getJdbcUrl);registry.add("spring.datasource.username",POSTGRES::getUsername);registry.add("spring.datasource.password",POSTGRES::getPassword);
        registry.add("vezlist.seed-admin",()->false);
        registry.add("vezlist.live.demo-purchases-enabled",()->true);
        registry.add("vezlist.live.maintenance-initial-delay-ms",()->3600000);
    }
    @Autowired LiveSessionService live;@Autowired JdbcTemplate jdbc;@Autowired MockMvc mvc;@Autowired ObjectMapper json;
    private static final String INGEST="rtmps://ingest.gvideo.io/live/private-stream-key";
    private static final String PLAYBACK="https://play.gvideo.io/cmaf/test/master.m3u8";
    private static final java.util.concurrent.atomic.AtomicLong PROVIDER_IDS=new java.util.concurrent.atomic.AtomicLong(1000);
    @MockitoBean GcoreLiveProvider gcore;@MockitoBean ObjectStorage storage;@MockitoBean LiveEncoder encoder;
    @BeforeEach void setup(){
        for(String table:List.of("live_cleanup_jobs","live_provider_assets","live_broadcast_tickets","live_webhook_events","live_sessions"))jdbc.update("DELETE FROM "+table);
        when(gcore.configured()).thenReturn(true);
        when(encoder.available()).thenReturn(true);
        when(gcore.create(any())).thenAnswer(invocation->new GcoreLiveProvider.Stream(Long.toString(PROVIDER_IDS.incrementAndGet()),INGEST,PLAYBACK,"idle",List.of()));
        when(gcore.playbackUrl(anyString(),any())).thenReturn(PLAYBACK);
    }
    @Test void creatorIsRequiredButNoAdIsNeeded()throws Exception{
        var owner=account(Role.USER);UUID plan=plan(10,"15");
        jdbc.update("UPDATE app_users SET account_type='BROWSING' WHERE id=?",owner.id());
        assertCode(()->live.create(owner.id(),null,"Live",plan,0,true,null),"LIVE_CREATOR_REQUIRED");
        verify(gcore,never()).create(any());
        jdbc.update("UPDATE app_users SET account_type='CREATOR' WHERE id=?",owner.id());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM listings WHERE owner_id=?",Integer.class,owner.id())).isZero();
        String body=json.writeValueAsString(Map.of("title","Independent live","planId",plan,"planVersion",0,"demoPurchase",true));
        String response=mvc.perform(post("/api/v1/live/sessions").with(user(owner)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.title").value("Independent live")).andReturn().getResponse().getContentAsString();
        UUID id=UUID.fromString(json.readTree(response).path("id").asText());
        assertThat(live.publicSession(id).listingId()).isNull();assertThat(live.mine(owner.id()).session().id()).isEqualTo(id);
        assertThat(live.isBroadcastAllowed(id,owner.id())).isTrue();
        providerStatus(id,"active");
        assertThat(live.directory(30,false,null).items()).extracting(LiveSessionService.SessionDTO::id).contains(id);
        assertThat(live.isSessionOpen(id)).isTrue();assertThat(live.requireChatAccess(id,owner.id())).isEqualTo("Live creator");
        live.maintain();assertThat(live.publicSession(id).status()).isEqualTo("LIVE");
        jdbc.update("UPDATE live_sessions SET ends_at=now()-interval '1 second' WHERE id=?",id);
        live.maintain();assertThat(jdbc.queryForObject("SELECT status FROM live_sessions WHERE id=?",String.class,id)).isEqualTo("ENDED");
    }
    @Test void legacyAdAssociationDoesNotControlBroadcastEligibility()throws Exception{
        var owner=account(Role.USER);UUID ad=listing(owner.id());var session=start(owner);
        jdbc.update("UPDATE live_sessions SET listing_id=? WHERE id=?",ad,session.id());
        jdbc.update("UPDATE listings SET status='DRAFT' WHERE id=?",ad);
        providerStatus(session.id(),"active");
        live.maintain();assertThat(live.isBroadcastAllowed(session.id(),owner.id())).isTrue();
        assertThat(live.publicSession(session.id()).status()).isEqualTo("LIVE");
        assertThat(live.directory(30,false,null).items()).extracting(LiveSessionService.SessionDTO::id).contains(session.id());
    }
    @Test void priceChangesAreReviewedPaidGatewayIsBlockedAndDemoNeverCharges(){
        var owner=account(Role.USER);UUID plan=plan(10,"15"),listing=listing(owner.id());
        assertCode(()->live.create(owner.id(),listing,"Live",plan,0,false,null),"PAYMENT_UNAVAILABLE");
        jdbc.update("UPDATE live_plans SET version=1,price=25 WHERE id=?",plan);
        assertCode(()->live.create(owner.id(),listing,"Live",plan,0,true,null),"LIVE_PLAN_CHANGED");
        var session=live.create(owner.id(),listing,"Live",plan,1,true,null);
        assertThat(session.demoPurchase()).isTrue();assertThat(session.price()).isEqualByComparingTo("25");assertThat(session.status()).isEqualTo("PREPARING");
        assertThat(session.startedAt()).isNull();assertThat(session.playbackUrl()).isNull();
        jdbc.update("UPDATE live_plans SET price=50,duration_minutes=60 WHERE id=?",plan);
        assertThat(live.publicSession(session.id()).durationMinutes()).isEqualTo(10);assertThat(live.publicSession(session.id()).price()).isEqualByComparingTo("25");
    }
    @Test void idempotencyAndOneOpenSessionAvoidDuplicateProviderPurchases(){
        var owner=account(Role.USER);UUID plan=plan(10,"15"),listing=listing(owner.id()),key=UUID.randomUUID();
        var first=live.create(owner.id(),listing,"Live",plan,0,true,key);var retry=live.create(owner.id(),listing,"Live",plan,0,true,key);
        assertThat(retry.id()).isEqualTo(first.id());verify(gcore,times(1)).create(any());
        assertCode(()->live.create(owner.id(),listing,"Changed",plan,0,true,key),"LIVE_REQUEST_CONFLICT");
        assertCode(()->live.create(owner.id(),listing,"Other",plan,0,true,null),"LIVE_SESSION_EXISTS");
    }
    @Test void broadcastTicketsAreOpaqueSingleUseOwnedAndRevokedOnEnd(){
        var owner=account(Role.USER);var other=account(Role.USER);var session=start(owner);
        assertCode(()->live.ticket(other.id(),session.id()),"LIVE_SESSION_NOT_FOUND");
        var ticket=live.ticket(owner.id(),session.id());
        assertThat(ticket.ticket()).doesNotContain("private-stream-key");
        assertThat(jdbc.queryForObject("SELECT token_hash FROM live_broadcast_tickets WHERE session_id=?",String.class,session.id())).isNotEqualTo(ticket.ticket());
        assertThat(live.consumeBroadcastTicket(ticket.ticket()).streamKey()).isEqualTo(INGEST);
        assertCode(()->live.consumeBroadcastTicket(ticket.ticket()),"LIVE_TICKET_INVALID");
        var second=live.ticket(owner.id(),session.id());live.end(owner.id(),session.id(),false);
        assertCode(()->live.consumeBroadcastTicket(second.ticket()),"LIVE_TICKET_INVALID");assertThat(live.isBroadcastAllowed(session.id(),owner.id())).isFalse();
    }
    @Test void authoritativeProviderStateStartsTimerAndReconnectCannotExtendIt(){
        var session=start(account(Role.USER));
        providerStatus(session.id(),"idle");assertThat(live.publicSession(session.id()).status()).isEqualTo("PREPARING");
        providerStatus(session.id(),"active");
        var active=live.publicSession(session.id());assertThat(active.status()).isEqualTo("LIVE");assertThat(active.playbackUrl()).isEqualTo(PLAYBACK);
        assertThat(active.endsAt()).isEqualTo(active.startedAt().plusSeconds(active.durationMinutes()*60L));
        providerStatus(session.id(),"active");assertThat(live.publicSession(session.id()).endsAt()).isEqualTo(active.endsAt());
        providerStatus(session.id(),"idle");assertThat(live.publicSession(session.id()).status()).isEqualTo("RECONNECTING");
        var disconnectedAt=jdbc.queryForObject("SELECT provider_disconnected_at FROM live_sessions WHERE id=?",java.sql.Timestamp.class,session.id());
        providerStatus(session.id(),"idle");
        assertThat(jdbc.queryForObject("SELECT provider_disconnected_at FROM live_sessions WHERE id=?",java.sql.Timestamp.class,session.id())).isEqualTo(disconnectedAt);
        providerStatus(session.id(),"active");assertThat(live.publicSession(session.id()).endsAt()).isEqualTo(active.endsAt());
        assertThat(live.publicSession(session.id()).status()).isEqualTo("LIVE");
        assertThat(jdbc.queryForObject("SELECT provider_disconnected_at FROM live_sessions WHERE id=?",java.sql.Timestamp.class,session.id())).isNull();
    }
    @Test void idleBeyondReconnectGraceEndsSession(){
        var session=start(account(Role.USER));providerStatus(session.id(),"active");providerStatus(session.id(),"idle");
        jdbc.update("UPDATE live_sessions SET provider_disconnected_at=now()-interval '31 seconds' WHERE id=?",session.id());
        providerStatus(session.id(),"idle");
        assertThat(live.publicSession(session.id()).status()).isEqualTo("ENDED");
        assertThat(live.publicSession(session.id()).playbackUrl()).isNull();
    }
    @Test void paymentDetailsAreSnapshotsAndVisibleOnlyDuringLive()throws Exception{
        var owner=account(Role.USER);live.savePayments(owner.id(),List.of(new LiveSessionService.PaymentDetail("INTERAC","original@example.test",true),new LiveSessionService.PaymentDetail("PAYPAL","hidden@example.test",false)));
        var session=start(owner);assertThat(live.publicSession(session.id()).paymentDetails()).isEmpty();
        live.savePayments(owner.id(),List.of(new LiveSessionService.PaymentDetail("INTERAC","changed@example.test",true)));
        providerStatus(session.id(),"active");
        assertThat(live.publicSession(session.id()).paymentDetails()).hasSize(1);assertThat(live.publicSession(session.id()).paymentDetails().getFirst().details()).isEqualTo("original@example.test");
        var moderator=account(Role.MODERATOR);assertThat(live.directory(50,true,moderator.id()).items().stream().filter(s->s.id().equals(session.id())).findFirst().orElseThrow().paymentDetails()).isEmpty();
        live.end(owner.id(),session.id(),false);assertThat(live.publicSession(session.id()).paymentDetails()).isEmpty();
    }
    @Test void authoritativeExpiryStopsProviderAndDurablyRetriesStreamDeletion(){
        var owner=account(Role.USER);var session=start(owner);String provider=provider(session.id());
        providerStatus(session.id(),"active");
        jdbc.update("UPDATE live_sessions SET ends_at=now()-interval '1 second' WHERE id=?",session.id());
        doThrow(new IllegalStateException("temporary provider error")).doNothing().when(gcore).deleteStream(provider);
        live.maintain();live.processCleanup();assertThat(live.publicSession(session.id()).status()).isEqualTo("ENDED");
        var order=inOrder(gcore);order.verify(gcore).disable(provider);order.verify(gcore).deleteStream(provider);
        assertThat(jdbc.queryForObject("SELECT attempts FROM live_cleanup_jobs WHERE kind='STREAM' AND provider_id=?",Integer.class,provider)).isEqualTo(1);
        live.processCleanup();verify(gcore,times(1)).deleteStream(provider);
        jdbc.update("UPDATE live_cleanup_jobs SET next_attempt_at=now() WHERE provider_id=?",provider);live.processCleanup();
        verify(gcore,times(2)).disable(provider);verify(gcore,times(2)).deleteStream(provider);
        assertThat(jdbc.queryForObject("SELECT completed_at IS NOT NULL FROM live_cleanup_jobs WHERE provider_id=?",Boolean.class,provider)).isTrue();
        assertThat(live.isSessionOpen(session.id())).isFalse();assertCode(()->live.requireChatAccess(session.id(),owner.id()),"LIVE_CHAT_UNAVAILABLE");
    }
    @Test void legacyMuxSessionsAndCleanupNeverUseGcoreCredentials(){
        var owner=account(Role.USER);var session=start(owner);String provider=provider(session.id());
        jdbc.update("UPDATE live_sessions SET provider_name='MUX' WHERE id=?",session.id());
        jdbc.update("INSERT INTO live_cleanup_jobs(kind,provider_id,session_id) VALUES ('STREAM',?,?)",provider,session.id());
        jdbc.update("INSERT INTO live_cleanup_jobs(kind,provider_id,session_id) VALUES ('ASSET','legacy-recording',?)",session.id());
        clearInvocations(gcore);
        live.reconcileProvider();live.processCleanup();
        assertThat(live.isBroadcastAllowed(session.id(),owner.id())).isFalse();assertThat(live.isSessionOpen(session.id())).isFalse();
        assertThat(live.publicSession(session.id()).status()).isEqualTo("ENDED");assertThat(live.publicSession(session.id()).playbackUrl()).isNull();
        assertThat(live.mine(owner.id()).session()).isNull();
        assertThat(live.directory(30,false,null).items()).extracting(LiveSessionService.SessionDTO::id).doesNotContain(session.id());
        assertCode(()->live.ticket(owner.id(),session.id()),"LIVE_BROADCAST_UNAVAILABLE");
        verify(gcore,never()).get(anyString());verify(gcore,never()).disable(anyString());verify(gcore,never()).deleteStream(anyString());
        var replacement=start(owner);
        assertThat(replacement.id()).isNotEqualTo(session.id());
        assertThat(live.mine(owner.id()).session().id()).isEqualTo(replacement.id());
    }
    @Test void adminPlanVersionsAndModeratorSessionEndHaveDistinctPermissions()throws Exception{
        var admin=account(Role.ADMIN);var moderator=account(Role.MODERATOR);var owner=account(Role.USER);
        mvc.perform(get("/api/v1/admin/live-plans").with(user(moderator))).andExpect(status().isForbidden());
        var plan=live.savePlan(admin.id(),null,"Special",20,new BigDecimal("12"),"CAD","",true,5,null);
        live.savePlan(admin.id(),plan.id(),"Edited",30,new BigDecimal("14"),"CAD","",true,5,0L);
        assertCode(()->live.savePlan(admin.id(),plan.id(),"Stale",30,new BigDecimal("14"),"CAD","",true,5,0L),"LIVE_PLAN_CHANGED");
        var session=start(owner);
        mvc.perform(post("/api/v1/admin/live/"+session.id()+"/end").with(user(moderator)).with(csrf())).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ENDED"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM admin_audit_log WHERE action='LIVE_SESSION_ENDED' AND target_id=?",Integer.class,session.id().toString())).isEqualTo(1);
    }
    @Test void guestsCanWatchForFreeWithoutExposingBroadcastCredentials()throws Exception{
        var owner=account(Role.USER);var session=start(owner);providerStatus(session.id(),"active");
        String response=mvc.perform(get("/api/v1/live/sessions/"+session.id()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.playbackUrl").value(PLAYBACK))
            .andExpect(jsonPath("$.streamKey").doesNotExist()).andExpect(jsonPath("$.providerId").doesNotExist())
            .andReturn().getResponse().getContentAsString();
        assertThat(response).doesNotContain("private-stream-key","rtmps://");
        mvc.perform(get("/api/v1/live")).andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(session.id().toString()));
        mvc.perform(post("/api/v1/live/sessions/"+session.id()+"/broadcast-ticket").with(csrf())).andExpect(status().isUnauthorized());
        var viewer=account(Role.USER);jdbc.update("UPDATE app_users SET account_type='BROWSING' WHERE id=?",viewer.id());
        assertThat(live.requireChatAccess(session.id(),viewer.id())).isEqualTo("Live creator");
        live.end(owner.id(),session.id(),false);
        mvc.perform(get("/api/v1/live/sessions/"+session.id())).andExpect(status().isOk()).andExpect(jsonPath("$.playbackUrl").doesNotExist());
    }
    @Test void configurationAndEncoderReadinessFailClosedBeforeCreatingProviderResources(){
        var owner=account(Role.USER);UUID listing=listing(owner.id()),plan=plan(10,"0");
        when(gcore.configured()).thenReturn(false);assertThat(live.plans(false,null).streamingAvailable()).isFalse();
        assertCode(()->live.create(owner.id(),listing,"Live",plan,0,false,null),"LIVE_STREAMING_UNAVAILABLE");
        when(gcore.configured()).thenReturn(true);when(encoder.available()).thenReturn(false);
        assertThat(live.plans(false,null).unavailableReason()).contains("encoder");verify(gcore,never()).create(any());
    }
    @Test void suspendedHostLosesBroadcastAndChatAccessImmediatelyThenMaintenanceEndsSession()throws Exception{
        var owner=account(Role.USER);var session=start(owner);providerStatus(session.id(),"active");
        jdbc.update("UPDATE app_users SET enabled=false WHERE id=?",owner.id());
        assertThat(live.isBroadcastAllowed(session.id(),owner.id())).isFalse();assertThat(live.isSessionOpen(session.id())).isFalse();
        assertThat(live.publicSession(session.id()).status()).isEqualTo("ENDED");assertThat(live.publicSession(session.id()).playbackUrl()).isNull();assertThat(live.publicSession(session.id()).paymentDetails()).isEmpty();
        live.maintain();assertThat(jdbc.queryForObject("SELECT status FROM live_sessions WHERE id=?",String.class,session.id())).isEqualTo("ENDED");
    }
    @Test void partialProviderResponseStillSchedulesKnownStreamForCleanup(){
        var owner=account(Role.USER);doReturn(new GcoreLiveProvider.Stream("9000001",null,null,"idle",List.of())).when(gcore).create(any());
        assertCode(()->start(owner),"LIVE_PROVIDER_UNAVAILABLE");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM live_cleanup_jobs WHERE provider_id='9000001' AND kind='STREAM'",Integer.class)).isEqualTo(1);
        live.processCleanup();verify(gcore).deleteStream("9000001");
    }
    @Test void unsafeRecordingConfigurationAtCreationFailsAndQueuesCleanup(){
        doReturn(new GcoreLiveProvider.Stream("9000002",INGEST,PLAYBACK,"unsafe",List.of())).when(gcore).create(any());
        var owner=account(Role.USER);assertCode(()->start(owner),"LIVE_PROVIDER_UNAVAILABLE");
        assertThat(live.mine(owner.id()).session()).isNull();
        assertThat(jdbc.queryForObject("SELECT status FROM live_sessions WHERE provider_id='9000002'",String.class)).isEqualTo("FAILED");
        live.processCleanup();verify(gcore).disable("9000002");verify(gcore).deleteStream("9000002");
    }
    @Test void disabledProviderAtCreationFailsAndQueuesCleanup(){
        doReturn(new GcoreLiveProvider.Stream("9000003",INGEST,PLAYBACK,"disabled",List.of())).when(gcore).create(any());
        var owner=account(Role.USER);assertCode(()->start(owner),"LIVE_PROVIDER_UNAVAILABLE");
        assertThat(live.mine(owner.id()).session()).isNull();
        live.processCleanup();verify(gcore).disable("9000003");verify(gcore).deleteStream("9000003");
    }
    @Test void recordingEnabledExternallyStopsPlaybackAndQueuesCleanup(){
        var session=start(account(Role.USER));providerStatus(session.id(),"active");providerStatus(session.id(),"unsafe");
        assertThat(live.publicSession(session.id()).status()).isEqualTo("ENDED");
        assertThat(live.publicSession(session.id()).playbackUrl()).isNull();
        assertThat(live.isSessionOpen(session.id())).isFalse();
        live.processCleanup();verify(gcore).disable(provider(session.id()));verify(gcore).deleteStream(provider(session.id()));
    }
    @Test void providerOutageDoesNotExtendOrBypassTheSessionDeadline(){
        var session=start(account(Role.USER));providerStatus(session.id(),"active");
        var deadline=live.publicSession(session.id()).endsAt();
        when(gcore.get(provider(session.id()))).thenThrow(new IllegalStateException("provider unavailable"));
        live.reconcileProvider();assertThat(live.publicSession(session.id()).endsAt()).isEqualTo(deadline);
        jdbc.update("UPDATE live_sessions SET ends_at=now()-interval '1 second' WHERE id=?",session.id());
        live.maintain();assertThat(live.publicSession(session.id()).status()).isEqualTo("ENDED");
    }
    @Test void missingOrDisabledProviderStopsTheSession(){
        var first=start(account(Role.USER));when(gcore.get(provider(first.id()))).thenReturn(null);live.reconcileProvider();
        assertThat(live.publicSession(first.id()).status()).isEqualTo("FAILED");
        var second=start(account(Role.USER));providerStatus(second.id(),"disabled");
        assertThat(live.publicSession(second.id()).status()).isEqualTo("ENDED");
    }
    @Test void noRecordingIsAvailableWithoutLegacyPolicyConfirmation(){
        assertThat(live.plans(false,null).recordingPolicy()).isEqualTo("NO_RECORDING");
        assertThat(live.plans(false,null).streamingAvailable()).isTrue();
        var session=start(account(Role.USER));
        assertThat(jdbc.queryForObject("SELECT provider_name FROM live_sessions WHERE id=?",String.class,session.id())).isEqualTo("GCORE");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM live_provider_assets WHERE session_id=?",Integer.class,session.id())).isZero();
    }
    private LiveSessionService.SessionDTO start(VezlistUserPrincipal owner){return live.create(owner.id(),null,"Test live",plan(10,"15"),0,true,null);}
    private String provider(UUID id){return jdbc.queryForObject("SELECT provider_id FROM live_sessions WHERE id=?",String.class,id);}
    private void providerStatus(UUID session,String status){
        String provider=provider(session);
        when(gcore.get(provider)).thenReturn(new GcoreLiveProvider.Stream(provider,INGEST,PLAYBACK,status,List.of()));
        live.reconcileProvider();
    }
    private void assertCode(Runnable call,String code){assertThatThrownBy(call::run).isInstanceOfSatisfying(LiveException.class,error->assertThat(error.code()).isEqualTo(code));}
    private UUID plan(int minutes,String price){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO live_plans(id,name,duration_minutes,price) VALUES (?,'Test plan',?,?)",id,minutes,new BigDecimal(price));return id;}
    private UUID listing(UUID owner){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO listings(id,owner_id,site_scope,status,title,business_name,description,category_id,province_id,location_id,contact_email,contact_phone,submitted_at) VALUES (?,?,'PERSONALS','ACTIVE','Live test','Test','Description','personals','bc','bc-1','test@example.test','+12505550100',now())",id,owner);return id;}
    private VezlistUserPrincipal account(Role role){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO app_users(id,display_name,email,password_hash,enabled) VALUES (?,'Live creator',?,'hash',true)",id,id+"@example.test");jdbc.update("INSERT INTO user_roles(user_id,role) VALUES (?,?)",id,role.name());return new VezlistUserPrincipal(id,"Live creator",id+"@example.test","hash",true,false,Set.of(role),Instant.now());}
}
