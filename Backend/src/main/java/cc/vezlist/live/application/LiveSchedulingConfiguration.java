package cc.vezlist.live.application;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
@Configuration
@EnableScheduling
public class LiveSchedulingConfiguration {
    @Bean public ThreadPoolTaskScheduler taskScheduler() {
        ThreadPoolTaskScheduler scheduler=new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(4);scheduler.setThreadNamePrefix("live-maintenance-");return scheduler;
    }
}
