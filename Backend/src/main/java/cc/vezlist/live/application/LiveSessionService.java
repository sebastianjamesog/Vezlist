package cc.vezlist.live.application;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import cc.vezlist.admin.application.AdminAuditService;
import cc.vezlist.live.realtime.LiveEncoder;
import cc.vezlist.live.realtime.LiveChatStore;
import org.springframework.dao.DataAccessException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class LiveSessionService {
    public record Plan(UUID id,String name,int durationMinutes,BigDecimal price,String currency,String badge,boolean enabled,int sortOrder,long version) {}
    public record Plans(List<Plan> items,boolean demoPurchaseAvailable,boolean streamingAvailable,String unavailableReason,String recordingPolicy) {}
    public record PaymentDetail(String method,String details,boolean enabled) {}
    public record PaymentDetails(List<PaymentDetail> items) {}
    public record SessionDTO(UUID id,UUID ownerId,UUID listingId,String creatorName,String title,String location,String imageUrl,
            String avatarUrl,String status,int durationMinutes,BigDecimal price,String currency,boolean demoPurchase,
            Instant createdAt,Instant startedAt,Instant endsAt,Instant endedAt,String playbackUrl,List<PaymentDetail> paymentDetails,Long viewerCount,Instant serverTime) {}
    public record Mine(SessionDTO session) {}
    public record Directory(List<SessionDTO> items,long total) {}
    public record BroadcastTicket(String ticket,Instant expiresAt,String webSocketUrl) {}
    public record BroadcastGrant(UUID sessionId,UUID ownerId,String streamKey,Instant expiresAt) {}
    private record SessionRow(UUID id,UUID ownerId,String status,String providerId,String streamKey,Instant setupExpiresAt,Instant endsAt) {}
    private record Reserved(UUID id,boolean fresh) {}
    private record Cleanup(String kind,String providerId,UUID sessionId,int attempts) {}
    private static final Set<String> OPEN=Set.of("PREPARING","LIVE","RECONNECTING");
    private static final String SELECT="SELECT s.*,u.display_name,up.avatar_url,"
            +"(u.enabled AND u.account_type='CREATOR') AS eligible"
            +" FROM live_sessions s JOIN app_users u ON u.id=s.owner_id"
            +" LEFT JOIN user_profiles up ON up.user_id=s.owner_id";
    private static final String VALID="s.provider_name='GCORE' AND u.enabled=true AND u.account_type='CREATOR'";
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final GcoreLiveProvider provider;
    private final LiveEncoder encoder;
    private final LiveChatStore chats;
    private final TransactionTemplate tx;
    private final AdminAuditService audit;
    private final ApplicationEventPublisher events;
    private final boolean demoEnabled;
    private final String wsUrl;
    private final SecureRandom random=new SecureRandom();
    public LiveSessionService(JdbcTemplate jdbc,ObjectMapper json,GcoreLiveProvider provider,LiveEncoder encoder,PlatformTransactionManager transactions,
            AdminAuditService audit,ApplicationEventPublisher events,LiveChatStore chats,
            @Value("${vezlist.live.demo-purchases-enabled:false}") boolean demoEnabled,
            @Value("${vezlist.live.broadcast-ws-url:ws://localhost:8080/api/v1/live/broadcast}") String wsUrl) {
        this.jdbc=jdbc;this.json=json;this.provider=provider;this.encoder=encoder;this.tx=new TransactionTemplate(transactions);
        this.audit=audit;this.events=events;this.chats=chats;this.demoEnabled=demoEnabled;this.wsUrl=wsUrl;
    }
    public Plans plans(boolean admin,UUID actor) {
        if(admin) requireStaff(actor,true);
        String reason=unavailableReason();
        return new Plans(jdbc.query("SELECT * FROM live_plans"+(admin?"":" WHERE enabled=true")+" ORDER BY sort_order,name,id",this::plan),
                demoEnabled,reason==null,reason,"NO_RECORDING");
    }
    public Plan savePlan(UUID actor,UUID id,String name,int duration,BigDecimal price,String currency,String badge,boolean enabled,int sort,Long version) {
        return tx.execute(state -> {
            requireStaff(actor,true);UUID saved=id==null?UUID.randomUUID():id;
            if(id==null) jdbc.update("INSERT INTO live_plans(id,name,duration_minutes,price,currency,badge,enabled,sort_order) VALUES (?,?,?,?,?,?,?,?)",saved,name.strip(),duration,price,currency,badge,enabled,sort);
            else if(version==null || jdbc.update("UPDATE live_plans SET name=?,duration_minutes=?,price=?,currency=?,badge=?,enabled=?,sort_order=?,version=version+1,updated_at=now() WHERE id=? AND version=?",
                    name.strip(),duration,price,currency,badge,enabled,sort,id,version)!=1) fail(HttpStatus.CONFLICT,"LIVE_PLAN_CHANGED","This live plan changed. Reload it before saving.");
            audit.record(actor,id==null?"LIVE_PLAN_CREATED":"LIVE_PLAN_UPDATED","LIVE_PLAN",saved.toString(),name+"; "+duration+" minutes; "+price+" "+currency+"; enabled="+enabled);
            return jdbc.queryForObject("SELECT * FROM live_plans WHERE id=?",this::plan,saved);
        });
    }
    public PaymentDetails paymentDetails(UUID owner) { requireCreator(owner,false);return readPayments(owner); }
    public PaymentDetails savePayments(UUID owner,List<PaymentDetail> items) {
        if(items==null || items.size()>3 || items.stream().anyMatch(Objects::isNull) || items.stream().map(PaymentDetail::method).distinct().count()!=items.size())
            fail(HttpStatus.BAD_REQUEST,"LIVE_PAYMENT_DETAILS_INVALID","Choose each payment method at most once.");
        for(PaymentDetail item:items) if(item.method()==null || !Set.of("INTERAC","PAYPAL","GPAY").contains(item.method()) || item.details()==null || item.details().length()>200 || (item.enabled() && item.details().isBlank()))
            fail(HttpStatus.BAD_REQUEST,"LIVE_PAYMENT_DETAILS_INVALID","Enabled payment methods need valid account details.");
        return tx.execute(state -> {
            requireCreator(owner,true);jdbc.update("DELETE FROM live_payment_details WHERE owner_id=?",owner);
            for(PaymentDetail item:items) jdbc.update("INSERT INTO live_payment_details(owner_id,method,details,enabled) VALUES (?,?,?,?)",owner,item.method(),item.details().strip(),item.enabled());
            return readPayments(owner);
        });
    }
    private PaymentDetails readPayments(UUID owner) {
        return new PaymentDetails(jdbc.query("SELECT * FROM live_payment_details WHERE owner_id=? ORDER BY method",(rs,n)->new PaymentDetail(rs.getString("method"),rs.getString("details"),rs.getBoolean("enabled")),owner));
    }
    // Accept the legacy listing argument without linking new sessions to an ad.
    public SessionDTO create(UUID owner,UUID ignoredListing,String title,UUID planId,long version,boolean demoPurchase,UUID requestKey) {
        requireCreator(owner,false);
        String reason=unavailableReason();if(reason!=null) fail(HttpStatus.SERVICE_UNAVAILABLE,"LIVE_STREAMING_UNAVAILABLE",reason);
        UUID key=requestKey==null?UUID.randomUUID():requestKey;
        String requestHash=hash(title.strip()+"|"+planId+"|"+version+"|"+demoPurchase);
        Reserved reserved=tx.execute(state -> {
            requireCreator(owner,true);
            List<Map<String,Object>> prior=jdbc.queryForList("SELECT id,request_hash FROM live_sessions WHERE provider_name='GCORE' AND owner_id=? AND request_key=?",owner,key);
            if(!prior.isEmpty()) {
                if(!requestHash.equals(prior.getFirst().get("request_hash"))) fail(HttpStatus.CONFLICT,"LIVE_REQUEST_CONFLICT","This request was already used for another session.");
                return new Reserved((UUID)prior.getFirst().get("id"),false);
            }
            if(jdbc.queryForObject("SELECT count(*) FROM live_sessions WHERE provider_name='GCORE' AND owner_id=? AND status IN ('PREPARING','LIVE','RECONNECTING')",Integer.class,owner)>0)
                fail(HttpStatus.CONFLICT,"LIVE_SESSION_EXISTS","End your existing live session before starting another.");
            List<Plan> rows=jdbc.query("SELECT * FROM live_plans WHERE id=? FOR SHARE",this::plan,planId);
            if(rows.isEmpty() || !rows.getFirst().enabled()) fail(HttpStatus.CONFLICT,"LIVE_PLAN_UNAVAILABLE","Choose an available live plan.");
            Plan chosen=rows.getFirst();if(chosen.version()!=version) fail(HttpStatus.CONFLICT,"LIVE_PLAN_CHANGED","This live plan changed. Review the current price.");
            if(demoPurchase && !demoEnabled) fail(HttpStatus.CONFLICT,"LIVE_DEMO_UNAVAILABLE","Demo purchases are disabled.");
            if(chosen.price().signum()>0 && !(demoPurchase && demoEnabled)) fail(HttpStatus.CONFLICT,"PAYMENT_UNAVAILABLE","Live payments are not connected yet.");
            UUID id=UUID.randomUUID();List<PaymentDetail> details=readPayments(owner).items().stream().filter(item->item.enabled()&&!item.details().isBlank()).toList();
            jdbc.update("INSERT INTO live_sessions(id,owner_id,listing_id,title,plan_id,plan_version,duration_minutes,price,currency,demo_purchase,payment_details,status,request_key,request_hash)"
                    +" VALUES (?,?,?,?,?,?,?,?,?,?,?::jsonb,'PREPARING',?,?)",id,owner,null,title.strip(),planId,version,chosen.durationMinutes(),chosen.price(),chosen.currency(),demoPurchase,writeJson(details),key,requestHash);
            return new Reserved(id,true);
        });
        if(!reserved.fresh()) return ownerSession(reserved.id(),owner);
        try {
            GcoreLiveProvider.Stream stream=provider.create(reserved.id());
            if(stream.id()==null || stream.id().isBlank())
                throw new IllegalStateException("Provider returned an incomplete live stream.");
            tx.executeWithoutResult(state->{
                jdbc.update("UPDATE live_sessions SET provider_id=?,playback_id=?,stream_key=CASE WHEN status IN ('PREPARING','LIVE','RECONNECTING') THEN ? ELSE NULL END WHERE id=?",stream.id(),stream.playbackId(),stream.streamKey(),reserved.id());
                if(!OPEN.contains(row(reserved.id(),true).status())) enqueue("STREAM",stream.id(),reserved.id());
            });
            if(stream.streamKey()==null || stream.streamKey().isBlank() || stream.playbackId()==null || !Set.of("idle","active").contains(stream.status()))
                throw new IllegalStateException("Provider returned an incomplete live stream.");
        } catch(RuntimeException exception) {
            terminal(reserved.id(),"FAILED");
            fail(HttpStatus.BAD_GATEWAY,"LIVE_PROVIDER_UNAVAILABLE","The streaming service could not prepare your session. No payment was taken.");
        }
        return ownerSession(reserved.id(),owner);
    }
    public Mine mine(UUID owner) {
        requireCreator(owner,false);
        List<SessionDTO> sessions=jdbc.query(SELECT+" WHERE s.provider_name='GCORE' AND s.owner_id=? AND s.status IN ('PREPARING','LIVE','RECONNECTING') ORDER BY s.created_at DESC LIMIT 1",(rs,n)->dto(rs,true),owner);
        return new Mine(sessions.isEmpty()?null:presence(sessions).getFirst());
    }
    public Directory directory(int limit,boolean admin,UUID actor) {
        if(limit<1 || limit>100) fail(HttpStatus.BAD_REQUEST,"LIVE_LIMIT_INVALID","Limit must be between 1 and 100.");
        if(admin) requireStaff(actor,false);
        String where=admin?"s.provider_name='GCORE' AND s.status IN ('PREPARING','LIVE','RECONNECTING')":"s.status IN ('LIVE','RECONNECTING') AND s.ends_at>now() AND "+VALID;
        long total=jdbc.queryForObject("SELECT count(*) FROM live_sessions s JOIN app_users u ON u.id=s.owner_id WHERE "+where,Long.class);
        return new Directory(presence(jdbc.query(SELECT+" WHERE "+where+" ORDER BY s.created_at DESC,s.id LIMIT ?",(rs,n)->dto(rs,!admin),limit)),total);
    }
    public SessionDTO publicSession(UUID id) {
        List<SessionDTO> result=jdbc.query(SELECT+" WHERE s.id=?",(rs,n)->dto(rs,true),id);
        if(result.isEmpty()) notFound();return presence(result).getFirst();
    }
    private SessionDTO ownerSession(UUID id,UUID owner) { SessionRow row=row(id,false);if(!row.ownerId().equals(owner)) notFound();return publicSession(id); }
    public SessionDTO end(UUID actor,UUID id,boolean adminRoute) {
        SessionRow session=row(id,false);
        if(adminRoute) requireStaff(actor,false);
        else {
            if(!session.ownerId().equals(actor)) notFound();
            requireCreator(actor,false);
        }
        terminal(id,"ENDED");
        if(adminRoute) audit.record(actor,"LIVE_SESSION_ENDED","LIVE_SESSION",id.toString(),"Live session ended by moderation.");
        return publicSession(id);
    }
    public BroadcastTicket ticket(UUID owner,UUID id) {
        return tx.execute(state->{
            requireCreator(owner,false);SessionRow session=row(id,true);
            if(!session.ownerId().equals(owner)) notFound();
            if(!isBroadcastAllowed(id,owner) || session.streamKey()==null) fail(HttpStatus.CONFLICT,"LIVE_BROADCAST_UNAVAILABLE","This session is not ready to broadcast.");
            byte[] bytes=new byte[32];random.nextBytes(bytes);String token=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);Instant expiry=Instant.now().plusSeconds(60);
            jdbc.update("INSERT INTO live_broadcast_tickets(token_hash,session_id,owner_id,expires_at) VALUES (?,?,?,?)",hash(token),id,owner,Timestamp.from(expiry));
            return new BroadcastTicket(token,expiry,wsUrl);
        });
    }
    public BroadcastGrant consumeBroadcastTicket(String ticket) {
        if(ticket==null || ticket.length()>200) fail(HttpStatus.FORBIDDEN,"LIVE_TICKET_INVALID","The broadcast ticket is invalid or expired.");
        return tx.execute(state->{
            List<Map<String,Object>> tokens=jdbc.queryForList("UPDATE live_broadcast_tickets SET used_at=now() WHERE token_hash=? AND used_at IS NULL AND expires_at>now() RETURNING session_id,owner_id",hash(ticket));
            if(tokens.isEmpty()) fail(HttpStatus.FORBIDDEN,"LIVE_TICKET_INVALID","The broadcast ticket is invalid or expired.");
            UUID id=(UUID)tokens.getFirst().get("session_id"),owner=(UUID)tokens.getFirst().get("owner_id");
            SessionRow session=row(id,true);if(!isBroadcastAllowed(id,owner) || session.streamKey()==null) fail(HttpStatus.FORBIDDEN,"LIVE_BROADCAST_UNAVAILABLE","This session cannot broadcast.");
            return new BroadcastGrant(id,owner,session.streamKey(),session.endsAt()==null?session.setupExpiresAt():session.endsAt());
        });
    }
    public boolean isBroadcastAllowed(UUID id,UUID owner) {
        return jdbc.queryForObject("SELECT count(*) FROM live_sessions s JOIN app_users u ON u.id=s.owner_id"
                +" WHERE s.id=? AND s.owner_id=? AND u.account_type='CREATOR' AND "+VALID+" AND s.status IN ('PREPARING','LIVE','RECONNECTING')"
                +" AND COALESCE(s.ends_at,s.setup_expires_at)>now()",Integer.class,id,owner)>0;
    }
    public boolean isSessionOpen(UUID id) {
        return jdbc.queryForObject("SELECT count(*) FROM live_sessions s JOIN app_users u ON u.id=s.owner_id WHERE s.id=?"
                +" AND s.status IN ('LIVE','RECONNECTING') AND s.ends_at>now() AND u.account_type='CREATOR' AND "+VALID,Integer.class,id)>0;
    }
    public String requireChatAccess(UUID session,UUID actor) {
        List<String> names=jdbc.query("SELECT display_name FROM app_users WHERE id=? AND enabled=true",(rs,n)->rs.getString(1),actor);
        if(names.isEmpty() || !isSessionOpen(session)) fail(HttpStatus.FORBIDDEN,"LIVE_CHAT_UNAVAILABLE","This live chat is unavailable.");return names.getFirst();
    }
    @Scheduled(fixedDelayString="${vezlist.live.maintenance-interval-ms:10000}",initialDelayString="${vezlist.live.maintenance-initial-delay-ms:15000}")
    public void maintain() {
        try {
            List<UUID> expired=jdbc.query("SELECT s.id FROM live_sessions s JOIN app_users u ON u.id=s.owner_id WHERE s.provider_name='GCORE' AND s.status IN ('PREPARING','LIVE','RECONNECTING')"
                    +" AND (COALESCE(s.ends_at,s.setup_expires_at)<=now() OR NOT ("+VALID+")"
                    +" OR s.provider_disconnected_at<now()-interval '30 seconds')",(rs,n)->rs.getObject(1,UUID.class));
            expired.forEach(id->terminal(id,"ENDED"));
            jdbc.update("DELETE FROM live_broadcast_tickets WHERE expires_at<now()-interval '1 day' AND session_id IN (SELECT id FROM live_sessions WHERE provider_name='GCORE')");
        }catch(RuntimeException exception){org.slf4j.LoggerFactory.getLogger(getClass()).warn("Live maintenance will retry after an unavailable dependency.");}
    }
    @Scheduled(fixedDelayString="${vezlist.live.reconcile-interval-ms:5000}",initialDelayString="${vezlist.live.maintenance-initial-delay-ms:15000}")
    public void reconcileProvider() {
        if(!provider.configured())return;
        try {
                long deadline=System.nanoTime()+java.time.Duration.ofSeconds(15).toNanos();
                for(SessionRow session:jdbc.query("SELECT * FROM live_sessions WHERE provider_name='GCORE' AND status IN ('PREPARING','LIVE','RECONNECTING') AND provider_id IS NOT NULL ORDER BY provider_checked_at NULLS FIRST,created_at LIMIT 5",this::sessionRow)) {
                    if(System.nanoTime()>deadline)break;
                    jdbc.update("UPDATE live_sessions SET provider_checked_at=now() WHERE id=?",session.id());
                    try {
                        GcoreLiveProvider.Stream current=provider.get(session.providerId());
                        if(current==null){terminal(session.id(),"FAILED");continue;}
                        tx.executeWithoutResult(state->{
                            SessionRow latest=row(session.id(),true);
                            if(!OPEN.contains(latest.status()))return;
                            if("active".equals(current.status()))transition(session.id(),"LIVE",Instant.now());
                            else if("disabled".equals(current.status()) || "unsafe".equals(current.status()))transition(session.id(),"ENDED",Instant.now());
                            else if("idle".equals(current.status()) && !"PREPARING".equals(latest.status())) {
                                Instant disconnected=jdbc.queryForObject("SELECT provider_disconnected_at FROM live_sessions WHERE id=?",(rs,n)->instant(rs,"provider_disconnected_at"),session.id());
                                transition(session.id(),disconnected!=null && disconnected.isBefore(Instant.now().minusSeconds(30))?"ENDED":"RECONNECTING",Instant.now());
                            }
                        });
                    }catch(RuntimeException ignored){/* Existing deadlines remain authoritative during provider outages. */}
                }
        }catch(RuntimeException exception){org.slf4j.LoggerFactory.getLogger(getClass()).warn("Live provider reconciliation will retry after an unavailable dependency.");}
    }
    @Scheduled(fixedDelayString="${vezlist.live.cleanup-interval-ms:5000}",initialDelayString="${vezlist.live.maintenance-initial-delay-ms:15000}")
    public void processCleanup() {
        if(!provider.configured())return;
        List<Cleanup> jobs=jdbc.query("SELECT j.* FROM live_cleanup_jobs j JOIN live_sessions s ON s.id=j.session_id WHERE s.provider_name='GCORE' AND j.kind='STREAM' AND j.completed_at IS NULL AND j.next_attempt_at<=now() ORDER BY j.next_attempt_at LIMIT 5",
                (rs,n)->new Cleanup(rs.getString("kind"),rs.getString("provider_id"),rs.getObject("session_id",UUID.class),rs.getInt("attempts")));
        for(Cleanup job:jobs) {
            try {
                provider.disable(job.providerId());
                provider.deleteStream(job.providerId());
                jdbc.update("UPDATE live_cleanup_jobs SET completed_at=now() WHERE kind=? AND provider_id=? AND session_id=?",job.kind(),job.providerId(),job.sessionId());
            }catch(RuntimeException exception){jdbc.update("UPDATE live_cleanup_jobs SET attempts=attempts+1,next_attempt_at=now()+(? * interval '1 second') WHERE kind=? AND provider_id=? AND session_id=?",
                    Math.min(300,5*(job.attempts()+1)),job.kind(),job.providerId(),job.sessionId());}
        }
    }
    private void transition(UUID id,String status,Instant eventTime) {
        SessionRow current=row(id,true);if(!OPEN.contains(current.status()))return;
        List<Instant> timestamps=jdbc.query("SELECT last_provider_event_at FROM live_sessions WHERE id=?",(rs,n)->instant(rs,"last_provider_event_at"),id);
        if(timestamps.getFirst()!=null && eventTime.isBefore(timestamps.getFirst()))return;
        if(!isBroadcastAllowed(id,current.ownerId())) {terminalInternal(id,"ENDED");return;}
        if("ENDED".equals(status)) {terminalInternal(id,"ENDED");return;}
        if("RECONNECTING".equals(status) && "PREPARING".equals(current.status()))return;
        if("LIVE".equals(status)) jdbc.update("UPDATE live_sessions SET status='LIVE',started_at=COALESCE(started_at,LEAST(now(),GREATEST(created_at,?))),"
                +"ends_at=COALESCE(ends_at,LEAST(now(),GREATEST(created_at,?))+(duration_minutes*interval '1 minute')),provider_disconnected_at=NULL,last_provider_event_at=? WHERE id=?",
                Timestamp.from(eventTime),Timestamp.from(eventTime),Timestamp.from(eventTime),id);
        else jdbc.update("UPDATE live_sessions SET status='RECONNECTING',provider_disconnected_at=COALESCE(provider_disconnected_at,now()),last_provider_event_at=? WHERE id=?",Timestamp.from(eventTime),id);
    }
    private void terminal(UUID id,String status) {tx.executeWithoutResult(state->terminalInternal(id,status));}
    private void terminalInternal(UUID id,String status) {
        SessionRow current=row(id,true);
        if(OPEN.contains(current.status())) {
            jdbc.update("UPDATE live_sessions SET status=?,ended_at=now(),stream_key=NULL WHERE id=?",status,id);
            jdbc.update("DELETE FROM live_broadcast_tickets WHERE session_id=?",id);
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){@Override public void afterCommit(){events.publishEvent(new LiveSessionClosed(id));}});
        }
        if(current.providerId()!=null)enqueue("STREAM",current.providerId(),id);
    }
    private void enqueue(String kind,String provider,UUID id) {
        if(provider!=null && !provider.isBlank())jdbc.update("INSERT INTO live_cleanup_jobs(kind,provider_id,session_id) VALUES (?,?,?) ON CONFLICT DO NOTHING",kind,provider,id);
    }
    private SessionRow row(UUID id,boolean lock) {List<SessionRow> rows=jdbc.query("SELECT * FROM live_sessions WHERE id=?"+(lock?" FOR UPDATE":""),this::sessionRow,id);if(rows.isEmpty())notFound();return rows.getFirst();}
    private SessionRow sessionRow(ResultSet rs,int n)throws SQLException{return new SessionRow(rs.getObject("id",UUID.class),rs.getObject("owner_id",UUID.class),rs.getString("status"),rs.getString("provider_id"),rs.getString("stream_key"),instant(rs,"setup_expires_at"),instant(rs,"ends_at"));}
    private SessionDTO dto(ResultSet rs,boolean details)throws SQLException {
        UUID id=rs.getObject("id",UUID.class);String status=rs.getString("status");Instant ends=instant(rs,"ends_at");
        Instant deadline=ends==null?instant(rs,"setup_expires_at"):ends;
        boolean eligible=rs.getBoolean("eligible") && "GCORE".equals(rs.getString("provider_name"));
        if(OPEN.contains(status) && (!eligible || !deadline.isAfter(Instant.now())))status="ENDED";
        boolean open=Set.of("LIVE","RECONNECTING").contains(status) && ends!=null && ends.isAfter(Instant.now()) && eligible;
        String playback=null;if(details && open && rs.getString("playback_id")!=null)try{playback=provider.playbackUrl(rs.getString("playback_id"),ends);}catch(RuntimeException ignored){}
        String avatar=rs.getString("avatar_url");
        return new SessionDTO(id,rs.getObject("owner_id",UUID.class),rs.getObject("listing_id",UUID.class),rs.getString("display_name"),rs.getString("title"),null,avatar,avatar,status,
                rs.getInt("duration_minutes"),rs.getBigDecimal("price"),rs.getString("currency"),rs.getBoolean("demo_purchase"),instant(rs,"created_at"),instant(rs,"started_at"),ends,instant(rs,"ended_at"),playback,
                details&&open?readSnapshot(rs.getString("payment_details")):List.of(),null,Instant.now());
    }
    private List<SessionDTO> presence(List<SessionDTO> sessions) {
        List<UUID> rooms=sessions.stream().filter(s->Set.of("LIVE","RECONNECTING").contains(s.status())).map(SessionDTO::id).toList();
        Map<UUID,Long> counts;
        try { counts=rooms.isEmpty()?Map.of():chats.counts(rooms); }
        catch(DataAccessException unavailable) { counts=Map.of(); }
        Map<UUID,Long> snapshot=counts;
        Instant serverTime=Instant.now();
        return sessions.stream().map(s->new SessionDTO(s.id(),s.ownerId(),s.listingId(),s.creatorName(),s.title(),s.location(),s.imageUrl(),s.avatarUrl(),s.status(),
                s.durationMinutes(),s.price(),s.currency(),s.demoPurchase(),s.createdAt(),s.startedAt(),s.endsAt(),s.endedAt(),s.playbackUrl(),s.paymentDetails(),snapshot.get(s.id()),serverTime)).toList();
    }
    private Plan plan(ResultSet rs,int n)throws SQLException{return new Plan(rs.getObject("id",UUID.class),rs.getString("name"),rs.getInt("duration_minutes"),rs.getBigDecimal("price"),rs.getString("currency"),rs.getString("badge"),rs.getBoolean("enabled"),rs.getInt("sort_order"),rs.getLong("version"));}
    private void requireCreator(UUID owner,boolean lock) {List<String> types=jdbc.query("SELECT account_type FROM app_users WHERE id=? AND enabled=true"+(lock?" FOR UPDATE":""),(rs,n)->rs.getString(1),owner);if(types.isEmpty()||!"CREATOR".equals(types.getFirst()))fail(HttpStatus.FORBIDDEN,"LIVE_CREATOR_REQUIRED","Only ad creators can start live sessions.");}
    private void requireStaff(UUID actor,boolean adminOnly) {if(jdbc.queryForObject("SELECT count(*) FROM app_users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.enabled=true AND r.role "+(adminOnly?"='ADMIN'":"IN ('ADMIN','MODERATOR')"),Integer.class,actor)==0)fail(HttpStatus.FORBIDDEN,"FORBIDDEN","You cannot perform this live administration action.");}
    private String unavailableReason() {if(!provider.configured())return "Live streaming is waiting for the Gcore configuration.";if(!encoder.available())return "Live streaming is waiting for the video encoder setup.";return null;}
    private String writeJson(Object value){try{return json.writeValueAsString(value);}catch(Exception exception){throw new IllegalStateException(exception);}}
    private List<PaymentDetail> readSnapshot(String value){try{return json.readValue(value,new TypeReference<List<PaymentDetail>>(){});}catch(Exception exception){return List.of();}}
    private static Instant instant(ResultSet rs,String key)throws SQLException{Timestamp value=rs.getTimestamp(key);return value==null?null:value.toInstant();}

    private static String hash(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(Exception exception){throw new IllegalStateException(exception);}}
    private static void notFound(){fail(HttpStatus.NOT_FOUND,"LIVE_SESSION_NOT_FOUND","Live session not found.");}
    private static void fail(HttpStatus status,String code,String message){throw new LiveException(status,code,message);}
}
