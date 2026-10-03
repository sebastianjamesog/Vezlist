package cc.vezlist.live.realtime;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

/** Ephemeral room state. All keys expire, including after an unclean application shutdown. */
@Service
public class LiveChatStore {
    static final String CHANNEL = "vezlist:live:events:";
    private final StringRedisTemplate redis;
    private final ObjectMapper json;
    public record Viewer(UUID sessionId, UUID userId, String identity, String name, boolean host) {}
    public LiveChatStore(StringRedisTemplate redis, ObjectMapper json) { this.redis=redis; this.json=json; }
    static String prefix(UUID id) { return "vezlist:live:{"+id+"}:"; }
    public String ticket(Viewer viewer) {
        String token=UUID.randomUUID().toString()+UUID.randomUUID();
        redis.opsForValue().set("vezlist:live:ticket:"+hash(token), encode(viewer), Duration.ofSeconds(60));
        return token;
    }
    public Viewer consume(String token) {
        if(token==null || token.length()>100) throw new IllegalArgumentException("Invalid viewer ticket");
        String value=redis.opsForValue().getAndDelete("vezlist:live:ticket:"+hash(token));
        if(value==null) throw new IllegalArgumentException("Viewer ticket expired");
        try { return json.readValue(value,Viewer.class); } catch(Exception ex) { throw new IllegalArgumentException("Invalid viewer ticket"); }
    }
    public boolean ticketRateAllowed(String identity) {
        return runLong("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n", List.of("vezlist:live:ticket-rate:"+hash(identity)))<=40;
    }
    public void heartbeat(Viewer viewer, String connection) {
        if(viewer.host()) return;
        String p=prefix(viewer.sessionId()); long until=System.currentTimeMillis()+45000;
        runLong("redis.call('ZADD',KEYS[1],ARGV[1],ARGV[2]); redis.call('EXPIRE',KEYS[1],50); redis.call('ZADD',KEYS[2],ARGV[1],ARGV[3]); redis.call('EXPIRE',KEYS[2],50); return 1",
            List.of(p+"presence",p+"tabs:"+viewer.identity()),""+until,viewer.identity(),connection);
    }
    public void leave(Viewer viewer,String connection) {
        if(viewer.host()) return;
        String p=prefix(viewer.sessionId());
        runLong("redis.call('ZREM',KEYS[2],ARGV[1]); redis.call('ZREMRANGEBYSCORE',KEYS[2],'-inf',ARGV[2]); if redis.call('ZCARD',KEYS[2])==0 then redis.call('ZREM',KEYS[1],ARGV[3]) end; return 1",
            List.of(p+"presence",p+"tabs:"+viewer.identity()),connection,""+System.currentTimeMillis(),viewer.identity());
    }
    public long count(UUID room) {
        return runLong("redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',ARGV[1]); return redis.call('ZCARD',KEYS[1])",List.of(prefix(room)+"presence"),""+System.currentTimeMillis());
    }
    public List<Object> history(UUID room) {
        List<String> list=redis.opsForList().range(prefix(room)+"messages",0,-1);
        if(list==null) return List.of();
        return list.stream().map(this::decode).toList();
    }
    public Set<String> muted(UUID room) { Set<String> users=redis.opsForSet().members(prefix(room)+"muted");return users==null?Set.of():users; }
    public String message(Viewer viewer,String clientId,String name,String text) {
        String p=prefix(viewer.sessionId()); String id=UUID.randomUUID().toString();
        String script="""
            if redis.call('EXISTS',KEYS[6])==1 then return 'ENDED' end
            if redis.call('SISMEMBER',KEYS[3],ARGV[1])==1 then return 'MUTED' end
            local prior=redis.call('GET',KEYS[5]); if prior then return cjson.encode({id=prior}) end
            local n=redis.call('INCR',KEYS[4]); if n==1 then redis.call('EXPIRE',KEYS[4],5) end
            if n>5 then return 'RATE_LIMIT' end
            local seq=redis.call('INCR',KEYS[2]); redis.call('EXPIRE',KEYS[2],14400)
            local message=cjson.encode({id=ARGV[2],sequence=seq,userId=ARGV[1],name=ARGV[3],text=ARGV[4],sentAt=ARGV[5]})
            redis.call('RPUSH',KEYS[1],message); redis.call('LTRIM',KEYS[1],-100,-1); redis.call('EXPIRE',KEYS[1],14400)
            redis.call('SET',KEYS[5],ARGV[2],'EX',60)
            redis.call('PUBLISH',ARGV[6],cjson.encode({type='message',message=cjson.decode(message)}))
            return message
            """;
        return redis.execute(new DefaultRedisScript<>(script,String.class),List.of(p+"messages",p+"sequence",p+"muted",p+"rate:"+viewer.userId(),p+"dedup:"+viewer.userId()+":"+clientId,p+"closed"),viewer.userId().toString(),id,name,text,Instant.now().toString(),CHANNEL+viewer.sessionId());
    }
    public void delete(UUID room,String messageId) {
        String script="""
            local values=redis.call('LRANGE',KEYS[1],0,-1)
            for _,v in ipairs(values) do if cjson.decode(v).id==ARGV[1] then redis.call('LREM',KEYS[1],1,v) end end
            redis.call('PUBLISH',ARGV[2],cjson.encode({type='message_deleted',id=ARGV[1]})); return 1
            """;
        runLong(script,List.of(prefix(room)+"messages"),messageId,CHANNEL+room);
    }
    public void mute(UUID room,UUID user,boolean muted) {
        String key=prefix(room)+"muted";
        if(muted) { redis.opsForSet().add(key,user.toString()); redis.expire(key,Duration.ofHours(4)); }
        else redis.opsForSet().remove(key,user.toString());
        publish(room,Map.of("type","muted","userId",user,"muted",muted));
    }
    public void end(UUID room) {
        String p=prefix(room);
        runLong("redis.call('SET',KEYS[5],'1','EX',14400); redis.call('DEL',KEYS[1],KEYS[2],KEYS[3],KEYS[4]); redis.call('PUBLISH',ARGV[1],'{\"type\":\"ended\"}'); return 1",List.of(p+"messages",p+"sequence",p+"muted",p+"presence",p+"closed"),CHANNEL+room);
    }
    public void publish(UUID room,Object value) { redis.convertAndSend(CHANNEL+room,encode(value)); }
    public String encode(Object value) { try { return json.writeValueAsString(value); } catch(Exception e) { throw new IllegalArgumentException("Invalid live data",e); } }
    public Object decode(String value) { try { return json.readValue(value,Object.class); } catch(Exception e) { throw new IllegalArgumentException("Invalid live data",e); } }
    private long runLong(String script,List<String> keys,String... args) { Long n=redis.execute(new DefaultRedisScript<>(script,Long.class),keys,(Object[])args); return n==null?0:n; }
    private static String hash(String value) { try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); } catch(Exception e) { throw new IllegalStateException(e); } }
}
