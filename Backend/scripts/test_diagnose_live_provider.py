"""Offline tests: never connect to Docker, Gcore, or a live broadcast."""
import contextlib
import importlib.util
import io
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "diagnose_live_provider", Path(__file__).with_name("diagnose-live-provider.py")
)
diagnose = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diagnose)


class DiagnosticTests(unittest.TestCase):
    def test_redaction_covers_urls_and_decoded_secrets(self):
        output = diagnose.redact_output(
            "rtmps://example.gvideo.co/in/1?secret abc%2Fdef abc/def private-token",
            ["abc%2Fdef", "private-token"],
        )
        for secret in ("example.gvideo.co", "secret", "abc%2Fdef", "abc/def", "private-token"):
            self.assertNotIn(secret, output)

    def test_truncation_keeps_handshake_and_failure_after_redaction(self):
        output = diagnose.redact_output("Handshake secret\n" + "x" * 500 + "\nEOF secret", ["secret"], limit=100)
        self.assertTrue(output.startswith("Handshake [REDACTED]"))
        self.assertTrue(output.endswith("EOF [REDACTED]"))
        self.assertNotIn("secret", output)

    def test_debug_probe_is_bounded_and_hides_key_in_protocol_logs(self):
        key = "token=private-key&signature=private-signature"
        stderr = (
            "[rtmps] Handshaking...\n"
            f"[rtmps] Sending publish command for '123?{key}'\n"
            "[rtmps] Server error: denied token private-key\n"
            "[flv] End of file\n[libx264] irrelevant frame details\n"
        )
        captured = io.StringIO()
        with patch.object(diagnose.subprocess, "run", return_value=subprocess.CompletedProcess([], 187, "", stderr)) as run:
            with contextlib.redirect_stdout(captured):
                result = diagnose.publish_test(("push.gvideo.co", "/in/123", key), "/usr/bin/ffmpeg", "api-secret", debug=True)
        command = run.call_args.args[0]
        self.assertEqual(command[command.index("-loglevel") + 1], "debug")
        self.assertIn("20s", command)
        self.assertEqual(run.call_args.kwargs["timeout"], 30)
        self.assertEqual(result, 1)
        output = captured.getvalue()
        self.assertIn("Handshaking", output)
        self.assertIn("Server error: denied", output)
        self.assertIn("End of file", output)
        self.assertNotIn("private-key", output)
        self.assertNotIn("private-signature", output)
        self.assertNotIn("irrelevant frame", output)


if __name__ == "__main__":
    unittest.main()
