package cc.vezlist.live.application;

import java.net.URI;
import java.util.Locale;

/** Validates provider URLs before giving them to FFmpeg or a browser. */
public final class GcoreStreamUrls {
    private GcoreStreamUrls() {}

    public static String ingest(String value) {
        URI uri=parse(value);
        String scheme=uri.getScheme();
        if(!("rtmp".equalsIgnoreCase(scheme) || "rtmps".equalsIgnoreCase(scheme))
                || (uri.getPort()!=-1 && uri.getPort()!=443 && uri.getPort()!=1935)
                || !uri.getRawPath().matches("/in/[1-9][0-9]*b?")
                || uri.getRawQuery()==null || uri.getRawQuery().isBlank()) throw invalid();
        // Gcore documents replacing rtmp:// with rtmps:// and using port 443 for TLS.
        return "rtmps://"+uri.getHost().toLowerCase(Locale.ROOT)+":443"+uri.getRawPath()+"?"+uri.getRawQuery();
    }

    public static String playback(String value) {
        URI uri=parse(value);
        if(!"https".equalsIgnoreCase(uri.getScheme()) || (uri.getPort()!=-1 && uri.getPort()!=443)
                || !uri.getPath().endsWith(".m3u8")) throw invalid();
        return uri.toASCIIString();
    }

    private static URI parse(String value) {
        try {
            if(value==null || value.length()>4096 || value.chars().anyMatch(c->c<=32 || c==127)) throw invalid();
            URI uri=URI.create(value);
            String host=uri.getHost()==null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            if(!(host.endsWith(".gvideo.co") || host.endsWith(".gvideo.io"))
                    || uri.getRawUserInfo()!=null || uri.getRawFragment()!=null || uri.getRawPath()==null) throw invalid();
            return uri;
        } catch(IllegalArgumentException exception) { throw invalid(); }
    }

    private static IllegalArgumentException invalid() { return new IllegalArgumentException("Invalid Gcore stream URL."); }
}
