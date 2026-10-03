package cc.vezlist.live.realtime;

import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import static org.assertj.core.api.Assertions.*;

@Tag("integration")
@Testcontainers(disabledWithoutDocker=true)
class LiveChatStoreIntegrationTest {
    @Container static GenericContainer<?> redisContainer=new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);
    static LettuceConnectionFactory factory; static StringRedisTemplate redis; static LiveChatStore store;
    UUID room; LiveChatStore.Viewer viewer;
    @BeforeAll static void connect() {
        factory=new LettuceConnectionFactory(redisContainer.getHost(),redisContainer.getMappedPort(6379));factory.afterPropertiesSet();factory.start();
        redis=new StringRedisTemplate(factory);store=new LiveChatStore(redis,new ObjectMapper());
    }
    @AfterAll static void disconnect() { if(factory!=null)factory.destroy(); }
    @BeforeEach void setup() { room=UUID.randomUUID();UUID user=UUID.randomUUID();viewer=new LiveChatStore.Viewer(room,user,"user:"+user,"Viewer",false); }
    @Test void ticketsAreSingleUseAndInvalidTokensRejected() {
        String ticket=store.ticket(viewer);assertThat(store.consume(ticket)).isEqualTo(viewer);
        assertThatThrownBy(()->store.consume(ticket)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->store.consume("bogus")).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void viewersDeduplicateTabsExcludeHostAndExpire() {
        store.heartbeat(viewer,"tab1");store.heartbeat(viewer,"tab2");assertThat(store.count(room)).isEqualTo(1);
        store.heartbeat(new LiveChatStore.Viewer(room,UUID.randomUUID(),"host","Host",true),"host-tab");assertThat(store.count(room)).isEqualTo(1);
        store.leave(viewer,"tab1");assertThat(store.count(room)).isEqualTo(1);
        store.leave(viewer,"tab2");assertThat(store.count(room)).isZero();
        redis.opsForZSet().add(LiveChatStore.prefix(room)+"presence","stale",System.currentTimeMillis()-1);
        assertThat(store.count(room)).isZero();
    }
    @Test void retriesDeduplicateAndRateLimitCannotBeBypassedByNewClientIds() {
        String client=UUID.randomUUID().toString();String first=store.message(viewer,client,"Viewer","hello");
        String second=store.message(viewer,client,"Viewer","hello");
        assertThat(((Map<?,?>)store.decode(first)).get("id")).isEqualTo(((Map<?,?>)store.decode(second)).get("id"));assertThat(store.history(room)).hasSize(1);
        for(int i=0;i<4;i++)store.message(viewer,UUID.randomUUID().toString(),"Viewer","hello");
        assertThat(store.message(viewer,UUID.randomUUID().toString(),"Viewer","overflow")).isEqualTo("RATE_LIMIT");assertThat(store.history(room)).hasSize(5);
    }
    @Test void muteDeleteAndSessionEndRemoveHistoryAndPreventLateMessages() {
        String saved=store.message(viewer,UUID.randomUUID().toString(),"Viewer","hello");String id=(String)((Map<?,?>)store.decode(saved)).get("id");
        store.delete(room,id);assertThat(store.history(room)).isEmpty();
        store.mute(room,viewer.userId(),true);assertThat(store.message(viewer,UUID.randomUUID().toString(),"Viewer","blocked")).isEqualTo("MUTED");
        store.mute(room,viewer.userId(),false);store.message(viewer,UUID.randomUUID().toString(),"Viewer","restored");assertThat(store.history(room)).hasSize(1);
        store.end(room);assertThat(store.history(room)).isEmpty();assertThat(store.message(viewer,UUID.randomUUID().toString(),"Viewer","late")).isEqualTo("ENDED");
    }
    @Test void historyIsBoundedAndContainsOnlyLatestHundredMessages() {
        for(int i=0;i<105;i++) {UUID user=UUID.randomUUID();store.message(new LiveChatStore.Viewer(room,user,"user:"+user,"Person",false),UUID.randomUUID().toString(),"Person","message"+i);}
        assertThat(store.history(room)).hasSize(100);assertThat(((Map<?,?>)store.history(room).getFirst()).get("text")).isEqualTo("message5");
        assertThat(redis.getExpire(LiveChatStore.prefix(room)+"messages")).isPositive();
    }
}
