#!/usr/bin/env python3
"""VPS checks; optional --publish-test sends eight seconds of synthetic video."""
import argparse
import json
import re
import socket
import ssl
import subprocess
import urllib.error
import urllib.parse
import urllib.request
import uuid


def docker(*args):
    result = subprocess.run(
        ["docker", *args], capture_output=True, text=True, timeout=30
    )
    if result.returncode:
        raise RuntimeError("Docker/database read failed; check that the containers are running.")
    return result.stdout


def ingest_parts(value):
    parsed = urllib.parse.urlsplit(value or "")
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in ("rtmp", "rtmps") or not host.endswith((".gvideo.co", ".gvideo.io")):
        raise RuntimeError("Provider returned an unexpected ingest address.")
    if not parsed.path.startswith("/in/") or not parsed.query or parsed.username or parsed.fragment:
        raise RuntimeError("Provider returned an unexpected ingest address.")
    # Match the backend's documented RTMP -> RTMPS normalization.
    return host, parsed.path, parsed.query


def redact_output(text, secrets):
    for secret in sorted(set(secrets), key=len, reverse=True):
        if secret:
            text = text.replace(secret, "[REDACTED]")
            text = text.replace(urllib.parse.unquote(secret), "[REDACTED]")
    text = re.sub(r"(?:rtmps?|https?)://[^\s\"'<>]+", "[REDACTED_URL]", text)
    return "".join(c for c in text if c in "\n\t" or c.isprintable())[-12000:]


def publish_test(current, executable, token):
    host, path, key = current
    destination = f"rtmps://{host}:443{path}?{key}"
    print("Publishing an 8-second test pattern with silent audio. It may appear in Live Now.", flush=True)
    # The in-container timeout also kills FFmpeg if the Docker client disconnects.
    command = [
        "docker", "exec", "vezlist-api-1", "timeout", "--kill-after=3s", "20s",
        executable, "-hide_banner", "-loglevel", "info", "-nostdin", "-nostats",
        "-re", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30",
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
        "-t", "8", "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-threads", "2",
        "-pix_fmt", "yuv420p", "-r", "30", "-g", "60", "-keyint_min", "60",
        "-b:v", "2000k", "-maxrate", "2500k", "-bufsize", "4000k",
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
        "-flvflags", "no_duration_filesize", "-f", "flv", destination,
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=30)
    secrets = [destination, key, token]
    secrets.extend(value for _, value in urllib.parse.parse_qsl(key) if len(value) >= 4)
    print("Publish-test exit code:", result.returncode)
    print(redact_output(result.stderr + result.stdout, secrets))
    print("Publish test completed." if result.returncode == 0 else "Publish test failed; share the redacted output above.")
    return 0 if result.returncode == 0 else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("session_id", type=uuid.UUID)
    parser.add_argument("--latest-for-owner", action="store_true", help="Check the latest open session belonging to the supplied session's creator")
    parser.add_argument("--publish-test", action="store_true", help="Publish an 8-second test pattern to an idle PREPARING stream; do not reconnect the browser during this test")
    args = parser.parse_args()
    environment = dict(
        item.split("=", 1)
        for item in json.loads(docker("inspect", "--format", "{{json .Config.Env}}", "vezlist-api-1"))
        if "=" in item
    )
    token = environment.get("VEZLIST_GCORE_API_TOKEN", "").strip()
    if not token:
        raise RuntimeError("The running API container has no Gcore token.")
    # session_id is parsed as UUID before entering this fixed SQL statement.
    selection = f"id='{args.session_id}' AND provider_name='GCORE'"
    if args.latest_for_owner:
        selection = (
            f"owner_id=(SELECT owner_id FROM live_sessions WHERE id='{args.session_id}') "
            "AND provider_name='GCORE' AND status IN ('PREPARING','LIVE','RECONNECTING') "
            "ORDER BY created_at DESC LIMIT 1"
        )
    query = (
        "SELECT json_build_object('id',id,'status',status,'providerId',provider_id,"
        "'storedIngest',stream_key,'createdAt',created_at,"
        "'setupExpiresAt',setup_expires_at,'endsAt',ends_at)::text "
        "FROM live_sessions WHERE " + selection
    )
    output = docker(
        "exec", "vezlist-postgres-1", "sh", "-c",
        'exec psql -XAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"',
        "sh", query,
    ).strip()
    if not output:
        raise RuntimeError("No matching session found. Start a new live with the same creator account.")
    session = json.loads(output)
    print("Session:", session["id"])
    print("Local status:", session["status"])
    print("Created:", session["createdAt"])
    print("Setup deadline:", session["setupExpiresAt"])
    print("Live deadline:", session["endsAt"])
    provider_id = str(session.get("providerId") or "")
    if not provider_id.isascii() or not provider_id.isdigit():
        raise RuntimeError("Session has no valid provider stream ID.")
    print("Gcore stream ID:", provider_id)
    request = urllib.request.Request(
        "https://api.gcore.com/streaming/streams/" + provider_id,
        headers={"Authorization": "APIKey " + token, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            stream = json.load(response)
    except urllib.error.HTTPError as error:
        print("Gcore API HTTP status:", error.code)
        return 1
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError("Could not reach the Gcore API from this VPS.") from None
    # Output only known boolean flags, never provider response objects or URLs.
    for field in ("active", "live", "backup_live", "pull", "auto_record", "dvr_enabled", "recording"):
        value = stream.get(field)
        print("Gcore " + field + ":", value if isinstance(value, bool) else "not supplied as a boolean")
    current = ingest_parts(stream.get("push_url"))
    print("Ingest hostname:", current[0])
    if session.get("storedIngest"):
        print("Stored ingest matches current Gcore address/key:", ingest_parts(session["storedIngest"]) == current)
    else:
        print("Stored ingest: absent (normal for an ended session)")
    if session["status"] not in ("PREPARING", "LIVE", "RECONNECTING"):
        print("NOTE: session has ended; current provider state may differ from the failure time.")
    try:
        with socket.create_connection((current[0], 443), timeout=10) as connection:
            with ssl.create_default_context().wrap_socket(connection, server_hostname=current[0]) as secured:
                print("VPS TCP/TLS connection to ingest port 443: OK", secured.version())
    except OSError:
        print("VPS TCP/TLS connection to ingest port 443: FAILED")
        return 1
    print("Checks finished. TLS success does not test RTMP publishing or stream-key acceptance.")
    if args.publish_test:
        if session["status"] != "PREPARING" or stream.get("active") is not True:
            raise RuntimeError("Publish test requires an active provider stream with a PREPARING local session.")
        if stream.get("live") is not False or stream.get("backup_live") is not False:
            raise RuntimeError("Refusing to test while Gcore reports a broadcast in progress.")
        if any(stream.get(field) is not False for field in ("auto_record", "dvr_enabled", "recording")):
            raise RuntimeError("Publish test requires recording and DVR to be disabled.")
        return publish_test(current, environment.get("VEZLIST_FFMPEG_PATH", "/usr/bin/ffmpeg"), token)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired) as error:
        # Unexpected data can carry private URLs; never print exception bodies.
        if isinstance(error, RuntimeError):
            print("Check stopped:", error)
        else:
            print("Check stopped: unexpected response or command timeout. No credentials printed.")
        raise SystemExit(1)
