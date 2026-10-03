package cc.vezlist.live.web;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
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
        registry.add("vezlist.seed-admin",()->false);registry.add("vezlist.live.recording-policy",()->"DELETE_AFTER_LIVE");
        registry.add("vezlist.live.mux-webhook-secret",()->"live-test-secret");registry.add("vezlist.live.demo-purchases-enabled",()->true);
        registry.add("vezlist.live.maintenance-initial-delay-ms",()->3600000);
    }
    @Autowired LiveSessionService live;@Autowired JdbcTemplate jdbc;@Autowired MockMvc mvc;@Autowired ObjectMapper json;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactions;
    @Autowired cc.vezlist.admin.application.AdminAuditService audit;
    @Autowired org.springframework.context.ApplicationEventPublisher events;
    @MockitoBean MuxLiveProvider mux;@MockitoBean ObjectStorage storage;@MockitoBean LiveEncoder encoder;
    @BeforeEach void setup(){
        for(String table:List.of("live_cleanup_jobs","live_provider_assets","live_broadcast_tickets","live_webhook_events","live_sessions"))jdbc.update("DELETE FROM "+table);
        when(mux.configured()).thenReturn(true);
        when(encoder.available()).thenReturn(true);
        when(mux.create(any())).thenAnswer(invocation->{String id=invocation.getArgument(0).toString();return new MuxLiveProvider.Stream("mux"+id.replace("-",""),"private-stream-key","signed-playback","idle",List.of());});
        when(mux.playbackUrl(anyString(),any())).thenReturn("https://stream.mux.com/signed.m3u8?token=test");
    }
    @Test void creatorIsRequiredButNoAdIsNeeded()throws Exception{
        var owner=account(Role.USER);UUID plan=plan(10,"15");
        jdbc.update("UPDATE app_users SET account_type='BROWSING' WHERE id=?",owner.id());
        assertCode(()->live.create(owner.id(),null,"Live",plan,0,true,null),"LIVE_CREATOR_REQUIRED");
        verify(mux,never()).create(any());
        jdbc.update("UPDATE app_users SET account_type='CREATOR' WHERE id=?",owner.id());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM listings WHERE owner_id=?",Integer.class,owner.id())).isZero();
        String body=json.writeValueAsString(Map.of("title","Independent live","planId",plan,"planVersion",0,"demoPurchase",true));
        String response=mvc.perform(post("/api/v1/live/sessions").with(user(owner)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.title").value("Independent live")).andReturn().getResponse().getContentAsString();
        UUID id=UUID.fromString(json.readTree(response).path("id").asText());
        assertThat(live.publicSession(id).listingId()).isNull();assertThat(live.mine(owner.id()).session().id()).isEqualTo(id);
        assertThat(live.isBroadcastAllowed(id,owner.id())).isTrue();
        send("video.live_stream.active",provider(id),id,UUID.randomUUID().toString());
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
        send("video.live_stream.active",provider(session.id()),session.id(),UUID.randomUUID().toString());
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
        assertThat(retry.id()).isEqualTo(first.id());verify(mux,times(1)).create(any());
        assertCode(()->live.create(owner.id(),listing,"Changed",plan,0,true,key),"LIVE_REQUEST_CONFLICT");
        assertCode(()->live.create(owner.id(),listing,"Other",plan,0,true,null),"LIVE_SESSION_EXISTS");
    }
    @Test void broadcastTicketsAreOpaqueSingleUseOwnedAndRevokedOnEnd(){
        var owner=account(Role.USER);var other=account(Role.USER);var session=start(owner);
        assertCode(()->live.ticket(other.id(),session.id()),"LIVE_SESSION_NOT_FOUND");
        var ticket=live.ticket(owner.id(),session.id());
        assertThat(ticket.ticket()).doesNotContain("private-stream-key");
        assertThat(jdbc.queryForObject("SELECT token_hash FROM live_broadcast_tickets WHERE session_id=?",String.class,session.id())).isNotEqualTo(ticket.ticket());
        assertThat(live.consumeBroadcastTicket(ticket.ticket()).streamKey()).isEqualTo("private-stream-key");
        assertCode(()->live.consumeBroadcastTicket(ticket.ticket()),"LIVE_TICKET_INVALID");
        var second=live.ticket(owner.id(),session.id());live.end(owner.id(),session.id(),false);
        assertCode(()->live.consumeBroadcastTicket(second.ticket()),"LIVE_TICKET_INVALID");assertThat(live.isBroadcastAllowed(session.id(),owner.id())).isFalse();
    }
    @Test void onlySignedProviderActiveStartsTimerAndWebhookReplayCannotExtendIt()throws Exception{
        var owner=account(Role.USER);var session=start(owner);String provider=provider(session.id());
        send("video.live_stream.idle",provider,session.id(),UUID.randomUUID().toString());assertThat(live.publicSession(session.id()).status()).isEqualTo("PREPARING");
        String event=UUID.randomUUID().toString();send("video.live_stream.active",provider,session.id(),event);
        var active=live.publicSession(session.id());assertThat(active.status()).isEqualTo("LIVE");assertThat(active.playbackUrl()).contains("token=");
        assertThat(active.endsAt()).isEqualTo(active.startedAt().plusSeconds(active.durationMinutes()*60L));
        send("video.live_stream.active",provider,session.id(),event);assertThat(live.publicSession(session.id()).endsAt()).isEqualTo(active.endsAt());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM live_webhook_events WHERE id=?",Integer.class,event)).isEqualTo(1);
        assertCode(()->live.webhook("t=1,v1=deadbeef","{}"),"LIVE_WEBHOOK_INVALID");
        send("video.live_stream.disconnected",provider,session.id(),UUID.randomUUID().toString());assertThat(live.publicSession(session.id()).status()).isEqualTo("RECONNECTING");
        send("video.live_stream.active",provider,session.id(),UUID.randomUUID().toString());assertThat(live.publicSession(session.id()).endsAt()).isEqualTo(active.endsAt());
    }
    @Test void paymentDetailsAreSnapshotsAndVisibleOnlyDuringLive()throws Exception{
        var owner=account(Role.USER);live.savePayments(owner.id(),List.of(new LiveSessionService.PaymentDetail("INTERAC","original@example.test",true),new LiveSessionService.PaymentDetail("PAYPAL","hidden@example.test",false)));
        var session=start(owner);assertThat(live.publicSession(session.id()).paymentDetails()).isEmpty();
        live.savePayments(owner.id(),List.of(new LiveSessionService.PaymentDetail("INTERAC","changed@example.test",true)));
        send("video.live_stream.active",provider(session.id()),session.id(),UUID.randomUUID().toString());
        assertThat(live.publicSession(session.id()).paymentDetails()).hasSize(1);assertThat(live.publicSession(session.id()).paymentDetails().getFirst().details()).isEqualTo("original@example.test");
        var moderator=account(Role.MODERATOR);assertThat(live.directory(50,true,moderator.id()).items().stream().filter(s->s.id().equals(session.id())).findFirst().orElseThrow().paymentDetails()).isEmpty();
        live.end(owner.id(),session.id(),false);assertThat(live.publicSession(session.id()).paymentDetails()).isEmpty();
    }
    @Test void authoritativeExpiryStopsProviderAndDurablyRetriesAssetDeletion()throws Exception{
        var owner=account(Role.USER);var session=start(owner);String provider=provider(session.id());
        send("video.live_stream.active",provider,session.id(),UUID.randomUUID().toString());
        when(mux.get(provider)).thenReturn(new MuxLiveProvider.Stream(provider,"private","signed","active",List.of("asset-test")));
        jdbc.update("UPDATE live_sessions SET ends_at=now()-interval '1 second' WHERE id=?",session.id());
        doThrow(new IllegalStateException("temporary provider error")).doNothing().when(mux).deleteAsset("asset-test");
        live.maintain();live.processCleanup();assertThat(live.publicSession(session.id()).status()).isEqualTo("ENDED");verify(mux).disable(provider);verify(mux).deleteStream(provider);
        live.processCleanup();assertThat(jdbc.queryForObject("SELECT attempts FROM live_cleanup_jobs WHERE kind='ASSET' AND provider_id='asset-test'",Integer.class)).isEqualTo(1);
        jdbc.update("UPDATE live_cleanup_jobs SET next_attempt_at=now() WHERE provider_id='asset-test'");live.processCleanup();
        assertThat(jdbc.queryForObject("SELECT completed_at IS NOT NULL FROM live_cleanup_jobs WHERE provider_id='asset-test'",Boolean.class)).isTrue();
        assertThat(live.isSessionOpen(session.id())).isFalse();assertCode(()->live.requireChatAccess(session.id(),owner.id()),"LIVE_CHAT_UNAVAILABLE");
    }
    @Test void signedAssetWebhookAfterSessionEndsStillQueuesPrivateRecordingForDeletion()throws Exception{
        var owner=account(Role.USER);var session=start(owner);live.end(owner.id(),session.id(),false);
        String body=json.writeValueAsString(Map.of("id",UUID.randomUUID().toString(),"type","video.asset.ready","created_at",Instant.now().toString(),"data",Map.of("id","late-asset","passthrough",session.id().toString())));
        live.webhook(signature(body),body);live.processCleanup();verify(mux).deleteAsset("late-asset");
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
    @Test void webhookEndpointAcceptsOnlySignedPayloadWithoutSessionOrCsrf()throws Exception{
        String body=json.writeValueAsString(Map.of("id",UUID.randomUUID().toString(),"type","unknown.event","data",Map.of()));
        mvc.perform(post("/api/v1/live/webhooks/mux").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/live/webhooks/mux").header("Mux-Signature",signature(body)).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isNoContent());
    }
    @Test void configurationAndEncoderReadinessFailClosedBeforeCreatingProviderResources(){
        var owner=account(Role.USER);UUID listing=listing(owner.id()),plan=plan(10,"0");
        when(mux.configured()).thenReturn(false);assertThat(live.plans(false,null).streamingAvailable()).isFalse();
        assertCode(()->live.create(owner.id(),listing,"Live",plan,0,false,null),"LIVE_STREAMING_UNAVAILABLE");
        when(mux.configured()).thenReturn(true);when(encoder.available()).thenReturn(false);
        assertThat(live.plans(false,null).unavailableReason()).contains("encoder");verify(mux,never()).create(any());
    }
    @Test void suspendedHostLosesBroadcastAndChatAccessImmediatelyThenMaintenanceEndsSession()throws Exception{
        var owner=account(Role.USER);var session=start(owner);send("video.live_stream.active",provider(session.id()),session.id(),UUID.randomUUID().toString());
        jdbc.update("UPDATE app_users SET enabled=false WHERE id=?",owner.id());
        assertThat(live.isBroadcastAllowed(session.id(),owner.id())).isFalse();assertThat(live.isSessionOpen(session.id())).isFalse();
        assertThat(live.publicSession(session.id()).status()).isEqualTo("ENDED");assertThat(live.publicSession(session.id()).playbackUrl()).isNull();assertThat(live.publicSession(session.id()).paymentDetails()).isEmpty();
        live.maintain();assertThat(jdbc.queryForObject("SELECT status FROM live_sessions WHERE id=?",String.class,session.id())).isEqualTo("ENDED");
    }
    @Test void partialProviderResponseStillSchedulesKnownStreamForCleanup(){
        var owner=account(Role.USER);doReturn(new MuxLiveProvider.Stream("incomplete-provider",null,null,"idle",List.of())).when(mux).create(any());
        assertCode(()->start(owner),"LIVE_PROVIDER_UNAVAILABLE");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM live_cleanup_jobs WHERE provider_id='incomplete-provider' AND kind='STREAM'",Integer.class)).isEqualTo(1);
        live.processCleanup();verify(mux).deleteStream("incomplete-provider");
    }
    @Test void providerReconciliationRecoversActiveStateAfterMissedWebhookWithoutResettingDeadline(){
        var owner=account(Role.USER);var session=start(owner);String provider=provider(session.id());
        when(mux.get(provider)).thenReturn(new MuxLiveProvider.Stream(provider,"private","signed","active",List.of("recovered-asset")));
        live.reconcileProvider();var active=live.publicSession(session.id());assertThat(active.status()).isEqualTo("LIVE");
        live.reconcileProvider();assertThat(live.publicSession(session.id()).endsAt()).isEqualTo(active.endsAt());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM live_provider_assets WHERE session_id=?",Integer.class,session.id())).isEqualTo(1);
    }
    @Test void recordingPolicyMustBeExplicitlyConfirmedBeforeProviderCreation(){
        var gated=new LiveSessionService(jdbc,json,mux,encoder,transactions,audit,events,true,"test-secret","UNCONFIRMED","ws://localhost/test");
        assertThat(gated.plans(false,null).streamingAvailable()).isFalse();assertThat(gated.plans(false,null).unavailableReason()).contains("recording");
        var owner=account(Role.USER);UUID listing=listing(owner.id()),plan=plan(10,"0");
        assertCode(()->gated.create(owner.id(),listing,"Live",plan,0,false,null),"LIVE_STREAMING_UNAVAILABLE");verify(mux,never()).create(any());
    }
    private LiveSessionService.SessionDTO start(VezlistUserPrincipal owner){return live.create(owner.id(),null,"Test live",plan(10,"15"),0,true,null);}
    private String provider(UUID id){return jdbc.queryForObject("SELECT provider_id FROM live_sessions WHERE id=?",String.class,id);}
    private void send(String type,String provider,UUID session,String event)throws Exception{
        String body=json.writeValueAsString(Map.of("id",event,"type",type,"created_at",Instant.now().toString(),"data",Map.of("id",provider,"passthrough",session.toString())));live.webhook(signature(body),body);
    }
    private String signature(String body)throws Exception{String time=Long.toString(Instant.now().getEpochSecond());Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec("live-test-secret".getBytes(StandardCharsets.UTF_8),"HmacSHA256"));return "t="+time+",v1="+HexFormat.of().formatHex(mac.doFinal((time+"."+body).getBytes(StandardCharsets.UTF_8)));}
    private void assertCode(Runnable call,String code){assertThatThrownBy(call::run).isInstanceOfSatisfying(LiveException.class,error->assertThat(error.code()).isEqualTo(code));}
    private UUID plan(int minutes,String price){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO live_plans(id,name,duration_minutes,price) VALUES (?,'Test plan',?,?)",id,minutes,new BigDecimal(price));return id;}
    private UUID listing(UUID owner){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO listings(id,owner_id,site_scope,status,title,business_name,description,category_id,province_id,location_id,contact_email,contact_phone,submitted_at) VALUES (?,?,'PERSONALS','ACTIVE','Live test','Test','Description','personals','bc','bc-1','test@example.test','+12505550100',now())",id,owner);return id;}
    private VezlistUserPrincipal account(Role role){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO app_users(id,display_name,email,password_hash,enabled) VALUES (?,'Live creator',?,'hash',true)",id,id+"@example.test");jdbc.update("INSERT INTO user_roles(user_id,role) VALUES (?,?)",id,role.name());return new VezlistUserPrincipal(id,"Live creator",id+"@example.test","hash",true,false,Set.of(role),Instant.now());}
}
