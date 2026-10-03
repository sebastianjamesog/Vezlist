package cc.vezlist.live.application;
import static org.assertj.core.api.Assertions.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.time.Instant;
import java.util.Base64;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
class MuxLiveProviderTest {
    @Test void signsPlaybackWithVerifiableRsaSignatureAndSessionDeadline() throws Exception {
        KeyPairGenerator generator=KeyPairGenerator.getInstance("RSA");generator.initialize(2048);KeyPair pair=generator.generateKeyPair();
        String pem="-----BEGIN PRIVATE KEY-----\n"+Base64.getMimeEncoder().encodeToString(pair.getPrivate().getEncoded())+"\n-----END PRIVATE KEY-----";
        MuxLiveProvider provider=new MuxLiveProvider(new ObjectMapper(),"test-id","test-secret","signing-id",Base64.getEncoder().encodeToString(pem.getBytes(StandardCharsets.US_ASCII)));
        assertThat(provider.configured()).isTrue();Instant expiry=Instant.now().plusSeconds(123);
        String url=provider.playbackUrl("playback-id",expiry),token=url.substring(url.indexOf("token=")+6);String[] parts=token.split("\\.");
        var claims=new ObjectMapper().readTree(Base64.getUrlDecoder().decode(parts[1]));
        assertThat(claims.get("sub").asText()).isEqualTo("playback-id");assertThat(claims.get("aud").asText()).isEqualTo("v");
        assertThat(claims.get("kid").asText()).isEqualTo("signing-id");assertThat(claims.get("exp").asLong()).isEqualTo(expiry.getEpochSecond());
        Signature signature=Signature.getInstance("SHA256withRSA");signature.initVerify(pair.getPublic());signature.update((parts[0]+"."+parts[1]).getBytes(StandardCharsets.US_ASCII));
        assertThat(signature.verify(Base64.getUrlDecoder().decode(parts[2]))).isTrue();
    }
    @Test void malformedSigningKeysDoNotAdvertiseStreamingAvailability() {
        MuxLiveProvider provider=new MuxLiveProvider(new ObjectMapper(),"test-id","test-secret","signing-id","invalid-key");assertThat(provider.configured()).isFalse();
        assertThatThrownBy(()->provider.playbackUrl("id",Instant.now().plusSeconds(60))).isInstanceOf(IllegalStateException.class);
    }
}
