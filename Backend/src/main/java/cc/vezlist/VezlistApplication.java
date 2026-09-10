package cc.vezlist;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class VezlistApplication {

    public static void main(String[] args) {
        SpringApplication.run(VezlistApplication.class, args);
    }
}
