package cc.vezlist.live.application;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** All provider calls stay server-side; stream keys must never be serialized into API DTOs. */
@Component
public class MuxLiveProvider {
    public record Stream(String id, String streamKey, String playbackId, String status, List<String> assetIds) {}
    private final ObjectMapper json;
    private final String tokenId, tokenSecret, signingId, signingKey;
    private volatile PrivateKey cachedKey;
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    public MuxLiveProvider(ObjectMapper json,
            @Value("${vezlist.live.mux-token-id:}") String tokenId,
            @Value("${vezlist.live.mux-token-secret:}") String tokenSecret,
            @Value("${vezlist.live.mux-signing-key-id:}") String signingId,
            @Value("${vezlist.live.mux-signing-private-key:}") String signingKey) {
        this.json=json; this.tokenId=tokenId; this.tokenSecret=tokenSecret; this.signingId=signingId; this.signingKey=signingKey;
    }
    public boolean configured() {
        if(tokenId.isBlank() || tokenSecret.isBlank() || signingId.isBlank() || signingKey.isBlank())return false;
        try {privateKey();return true;}catch(Exception exception){return false;}
    }
    public Stream create(UUID sessionId) {
        return stream(request("POST","/video/v1/live-streams", Map.of("playback_policies", List.of("signed"),
                "latency_mode","low","reconnect_window",20,"passthrough",sessionId.toString(),
                "new_asset_settings",Map.of("playback_policies",List.of(),"passthrough",sessionId.toString()))));
    }
    public Stream get(String id) {
        JsonNode data=request("GET","/video/v1/live-streams/"+safeId(id),null);
        return data.isMissingNode() ? null : stream(data);
    }
    public void disable(String id) { request("PUT","/video/v1/live-streams/"+safeId(id)+"/disable",Map.of()); }
    public void deleteStream(String id) { request("DELETE","/video/v1/live-streams/"+safeId(id),null); }
    public void deleteAsset(String id) { request("DELETE","/video/v1/assets/"+safeId(id),null); }
    public String playbackUrl(String playbackId, Instant expiry) {
        try {
            String header=url64(json.writeValueAsBytes(Map.of("alg","RS256","typ","JWT","kid",signingId)));
            String payload=url64(json.writeValueAsBytes(Map.of("sub",playbackId,"aud","v","exp",expiry.getEpochSecond(),"kid",signingId)));
            Signature signature=Signature.getInstance("SHA256withRSA"); signature.initSign(privateKey());
            String unsigned=header+"."+payload; signature.update(unsigned.getBytes(StandardCharsets.US_ASCII));
            return "https://stream.mux.com/"+safeId(playbackId)+".m3u8?token="+unsigned+"."+url64(signature.sign());
        } catch(Exception exception) { throw new IllegalStateException("Mux playback signing is unavailable."); }
    }
    private PrivateKey privateKey() throws Exception {
        if(cachedKey!=null)return cachedKey;
        String pem=signingKey.replace("\\n","\n").strip();
        if (!pem.startsWith("-----")) pem=new String(Base64.getDecoder().decode(pem),StandardCharsets.US_ASCII);
        boolean pkcs1=pem.contains("BEGIN RSA PRIVATE KEY");
        if (!pkcs1 && !pem.contains("BEGIN PRIVATE KEY")) throw new IllegalArgumentException("Use an RSA private key for Mux signing.");
        byte[] der=Base64.getMimeDecoder().decode(pem.replace("-----BEGIN PRIVATE KEY-----","").replace("-----END PRIVATE KEY-----","")
                .replace("-----BEGIN RSA PRIVATE KEY-----","").replace("-----END RSA PRIVATE KEY-----",""));
        if(pkcs1) {
            byte[] prefix=java.util.HexFormat.of().parseHex("020100300d06092a864886f70d0101010500");
            byte[] octets=der(4,der);byte[] sequence=new byte[prefix.length+octets.length];
            System.arraycopy(prefix,0,sequence,0,prefix.length);System.arraycopy(octets,0,sequence,prefix.length,octets.length);der=der(48,sequence);
        }
        cachedKey=KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(der));return cachedKey;
    }
    private static byte[] der(int tag,byte[] value) {
        java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();out.write(tag);
        if(value.length<128)out.write(value.length);else {int count=0,size=value.length;while(size>0){count++;size>>>=8;}out.write(128|count);for(int i=count-1;i>=0;i--)out.write(value.length>>>(8*i));}
        out.writeBytes(value);return out.toByteArray();
    }
    private Stream stream(JsonNode node) {
        java.util.ArrayList<String> assets=new java.util.ArrayList<>();
        node.path("recent_asset_ids").forEach(value -> assets.add(value.asText()));
        if (!node.path("active_asset_id").asText().isBlank()) assets.add(node.path("active_asset_id").asText());
        String playback=null;
        for(JsonNode item:node.path("playback_ids")) if("signed".equals(item.path("policy").asText())) { playback=item.path("id").asText(); break; }
        return new Stream(node.path("id").asText(),node.path("stream_key").asText(),playback,node.path("status").asText(),List.copyOf(assets));
    }
    private JsonNode request(String method,String path,Object body) {
        try {
            HttpRequest.Builder builder=HttpRequest.newBuilder(URI.create("https://api.mux.com"+path)).timeout(Duration.ofSeconds(12))
                    .header("Authorization","Basic "+Base64.getEncoder().encodeToString((tokenId+":"+tokenSecret).getBytes(StandardCharsets.UTF_8)))
                    .header("Content-Type","application/json");
            builder.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
            HttpResponse<String> response=client.send(builder.build(),HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()==404 && !"POST".equals(method)) return json.missingNode();
            if(response.statusCode()<200 || response.statusCode()>299) throw new IllegalStateException("Mux request failed (HTTP "+response.statusCode()+").");
            return response.body().isBlank()?json.missingNode():json.readTree(response.body()).path("data");
        } catch(InterruptedException exception) { Thread.currentThread().interrupt(); throw new IllegalStateException("Mux request interrupted."); }
        catch(Exception exception) { throw new IllegalStateException("Mux request could not complete."); }
    }
    private static String safeId(String id) { if(id==null || !id.matches("[a-zA-Z0-9_-]{1,200}")) throw new IllegalArgumentException("Invalid provider identifier."); return id; }
    private static String url64(byte[] value) { return Base64.getUrlEncoder().withoutPadding().encodeToString(value); }
}
