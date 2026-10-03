package cc.vezlist.live.realtime;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Durable retry marker lives with the session; Redis outages cannot lose the cleanup request. */
@Component
public class LiveChatCleanup {
    private final JdbcTemplate jdbc; private final LiveChatStore store;
    public LiveChatCleanup(JdbcTemplate jdbc,LiveChatStore store) { this.jdbc=jdbc;this.store=store; }
    @Scheduled(fixedDelay=10000,initialDelay=20000) public void purgeEnded() {
        try {
            var ids=jdbc.query("SELECT id FROM live_sessions WHERE status IN ('ENDED','FAILED') AND chat_purged_at IS NULL ORDER BY ended_at LIMIT 100",(rs,n)->rs.getObject(1,UUID.class));
            for(UUID id:ids) { store.end(id);jdbc.update("UPDATE live_sessions SET chat_purged_at=now() WHERE id=?",id); }
        } catch(RuntimeException ex) { org.slf4j.LoggerFactory.getLogger(getClass()).warn("Live chat cleanup will retry after an unavailable dependency."); }
    }
}
