package cc.vezlist.live.realtime;

import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.web.socket.config.annotation.*;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import java.util.concurrent.ThreadPoolExecutor;

@Configuration
@EnableWebSocket
public class LiveWebSocketConfiguration implements WebSocketConfigurer {
    private final LiveChatWebSocket chat; private final LiveBroadcastWebSocket broadcast; private final List<String> origins;
    public LiveWebSocketConfiguration(LiveChatWebSocket chat,LiveBroadcastWebSocket broadcast,@Value("${vezlist.cors.allowed-origins}") List<String> origins,@Value("${vezlist.cors.allow-local-patterns:false}") boolean local) {
        this.chat=chat; this.broadcast=broadcast; this.origins=new ArrayList<>(origins);
        if(local) this.origins.addAll(List.of("http://localhost:*","http://127.0.0.1:*","http://192.168.*.*:*","http://10.*.*.*:*"));
    }
    @Override public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(chat,"/api/v1/live/chat").setAllowedOriginPatterns(origins.toArray(String[]::new));
        registry.addHandler(broadcast,"/api/v1/live/broadcast").setAllowedOriginPatterns(origins.toArray(String[]::new));
    }
    @Bean static ThreadPoolTaskExecutor liveChatEventsExecutor() {
        var executor=new ThreadPoolTaskExecutor(); executor.setCorePoolSize(2); executor.setMaxPoolSize(4);
        executor.setQueueCapacity(1000); executor.setThreadNamePrefix("live-chat-events-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy()); return executor;
    }
    @Bean static RedisMessageListenerContainer liveRedisMessages(RedisConnectionFactory factory,ThreadPoolTaskExecutor liveChatEventsExecutor) {
        var container=new RedisMessageListenerContainer() { @Override public boolean isAutoStartup() { return false; } };
        container.setConnectionFactory(factory); container.setTaskExecutor(liveChatEventsExecutor); return container;
    }
}
