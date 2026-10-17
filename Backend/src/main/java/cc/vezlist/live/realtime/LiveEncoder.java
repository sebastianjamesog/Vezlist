package cc.vezlist.live.realtime;

import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import cc.vezlist.live.application.GcoreStreamUrls;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Transcodes transient browser chunks directly to RTMPS. Never writes media to disk. */
@Component
public class LiveEncoder {
    private final String executable;
    private volatile long checkedAt; private volatile boolean available;
    public LiveEncoder(@Value("${vezlist.live.ffmpeg-path:ffmpeg}") String executable) { this.executable=executable; }
    public synchronized boolean available() {
        if(System.currentTimeMillis()-checkedAt<30000) return available;
        Process process=null;
        try {
            process=new ProcessBuilder(executable,"-version").redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();
            available=process.waitFor(2,TimeUnit.SECONDS)&&process.exitValue()==0;
        } catch(Exception ex) { available=false; if(ex instanceof InterruptedException) Thread.currentThread().interrupt(); }
        finally { if(process!=null&&process.isAlive()) process.destroyForcibly(); checkedAt=System.currentTimeMillis(); }
        return available;
    }
    public Process start(String streamKey,String mimeType) throws IOException {
        String ingestUrl=GcoreStreamUrls.ingest(streamKey);
        String format=demuxer(mimeType);
        Process process = new ProcessBuilder(List.of(executable,"-hide_banner","-loglevel","error","-nostdin",
            // Browser containers declare their codecs up front; avoid the default multi-second probe.
            "-protocol_whitelist","pipe","-analyzeduration","1000000","-probesize","1048576",
            "-f",format,"-i","pipe:0","-map","0:v:0","-map","0:a:0?",
            "-vf","scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
            "-c:v","libx264","-preset","veryfast","-tune","zerolatency","-threads","2","-pix_fmt","yuv420p",
            "-r","30","-g","60","-keyint_min","60","-b:v","2000k","-maxrate","2500k","-bufsize","4000k",
            "-c:a","aac","-b:a","128k","-ar","48000","-flvflags","no_duration_filesize","-f","flv",
            ingestUrl))
            .redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
        Thread.ofVirtual().name("live-encoder-diagnostics").start(() -> {
            String diagnostics;
            try (var reader = new InputStreamReader(process.getErrorStream(), StandardCharsets.UTF_8)) {
                diagnostics = LiveEncoderDiagnostics.read(reader).toString();
            } catch (IOException exception) {
                diagnostics = "STDERR_READ_FAILED";
            }
            try {
                int exitCode = process.waitFor();
                // Only fixed diagnostic labels are logged, never FFmpeg text:
                // it can contain the private ingest URL and its stream key.
                org.slf4j.LoggerFactory.getLogger(getClass()).info(
                        "Live encoder pid={} exited: exitCode={}, diagnostics={}",
                        process.pid(), exitCode, diagnostics);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
        });
        return process;
    }
    static String demuxer(String mimeType) {
        if(mimeType==null) throw new IllegalArgumentException("Unsupported browser recording format");
        String mime=mimeType.toLowerCase(java.util.Locale.ROOT).replace(" ","");
        if(List.of("video/webm","video/webm;codecs=vp8,opus","video/webm;codecs=vp9,opus").contains(mime)) return "matroska";
        if(mime.equals("video/mp4")||mime.matches("video/mp4;codecs=avc1[.0-9a-f]*,mp4a[.0-9]*")) return "mov";
        throw new IllegalArgumentException("This browser cannot broadcast in a supported format.");
    }
}
