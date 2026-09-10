package cc.vezlist.media.storage;

import java.net.URI;
import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("vezlist.storage")
public record StorageProperties(
        URI endpoint,
        String region,
        String bucket,
        String accessKey,
        String secretKey,
        Duration uploadUrlTtl,
        Duration downloadUrlTtl,
        long maxImageBytes) {
}
