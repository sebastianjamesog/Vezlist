package cc.vezlist.media.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

@Testcontainers
@Tag("integration")
class S3ObjectStorageIntegrationTest {
    private static final String ACCESS_KEY = "vezlist-test";
    private static final String SECRET_KEY = "vezlist-test-secret";

    @Container
    static final GenericContainer<?> MINIO = new GenericContainer<>(
            DockerImageName.parse("minio/minio:RELEASE.2025-04-22T22-12-26Z"))
            .withEnv("MINIO_ROOT_USER", ACCESS_KEY)
            .withEnv("MINIO_ROOT_PASSWORD", SECRET_KEY)
            .withCommand("server", "/data")
            .withExposedPorts(9000)
            .waitingFor(Wait.forHttp("/minio/health/ready").forPort(9000));

    @Test
    void signedUploadInspectionDownloadAndDeletionWorkAgainstMinio() throws Exception {
        URI endpoint = URI.create("http://" + MINIO.getHost() + ":" + MINIO.getMappedPort(9000));
        StorageProperties properties = new StorageProperties(
                endpoint,
                "us-east-1",
                "vezlist-media-test",
                ACCESS_KEY,
                SECRET_KEY,
                Duration.ofMinutes(2),
                Duration.ofMinutes(2),
                10 * 1024 * 1024);
        StorageConfiguration configuration = new StorageConfiguration();

        try (S3Client client = configuration.s3Client(properties);
                S3Presigner presigner = configuration.s3Presigner(properties)) {
            S3ObjectStorage storage = new S3ObjectStorage(client, presigner, properties);
            byte[] content = "vezlist-media".getBytes(StandardCharsets.UTF_8);
            String checksum = HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(content));
            String key = "marketplace/listings/test/photo.jpg";

            ObjectStorage.UploadTarget upload = storage.authorizeUpload(
                    key, "image/jpeg", content.length, checksum);
            HttpRequest.Builder request = HttpRequest.newBuilder(upload.url())
                    .PUT(HttpRequest.BodyPublishers.ofByteArray(content));
            upload.headers().forEach(request::header);
            HttpResponse<Void> uploaded = HttpClient.newHttpClient().send(
                    request.build(), HttpResponse.BodyHandlers.discarding());

            assertThat(uploaded.statusCode()).isEqualTo(200);
            ObjectStorage.StoredObject stored = storage.describe(key);
            assertThat(stored.sizeBytes()).isEqualTo(content.length);
            assertThat(stored.contentType()).isEqualTo("image/jpeg");
            assertThat(stored.metadata()).containsEntry("sha256", checksum);
            try (var input = storage.open(key)) {
                assertThat(input.readAllBytes()).isEqualTo(content);
            }

            HttpResponse<byte[]> downloaded = HttpClient.newHttpClient().send(
                    HttpRequest.newBuilder(storage.authorizeDownload(key)).GET().build(),
                    HttpResponse.BodyHandlers.ofByteArray());
            assertThat(downloaded.statusCode()).isEqualTo(200);
            assertThat(downloaded.body()).isEqualTo(content);

            storage.delete(key);
            assertThatThrownBy(() -> storage.describe(key))
                    .isInstanceOf(StorageException.class);
        }
    }
}
