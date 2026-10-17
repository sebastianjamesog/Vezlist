#!/usr/bin/env python3
"""Read-only VPS checks. Never print API tokens, stream keys or raw API bodies."""
import argparse
import json
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("session_id", type=uuid.UUID)
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
    query = (
        "SELECT json_build_object('status',status,'providerId',provider_id,"
        "'storedIngest',stream_key,'createdAt',created_at,"
        "'setupExpiresAt',setup_expires_at,'endsAt',ends_at)::text "
        f"FROM live_sessions WHERE id='{args.session_id}' AND provider_name='GCORE'"
    )
    output = docker(
        "exec", "vezlist-postgres-1", "sh", "-c",
        'exec psql -XAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"',
        "sh", query,
    ).strip()
    if not output:
        raise RuntimeError("No Gcore session found with that ID.")
    session = json.loads(output)
    print("Session:", args.session_id)
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
