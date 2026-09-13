"""Exercise the release gate without RPC, signing, or explorer submissions."""
import json
from pathlib import Path
import subprocess
import unittest

SCRIPT = Path(__file__).with_name("deploy-protocol.sh").read_text()
GATE = SCRIPT.split("require_explorer_source() {", 1)[1].split("\nverify_sources()", 1)[0]


class VerificationGateTest(unittest.TestCase):
    def check_gate(self, metadata, accepted, curl_exit=0):
        result = subprocess.run(
            ["bash", "-c", """
set -euo pipefail
verifier_url=https://explorer.example/api/
fail() { echo "$*" >&2; exit 1; }
curl() { printf '%s' "$1" >/dev/null; printf '%s' "$RESPONSE"; return "$CURL_EXIT"; }
require_explorer_source() {""" + GATE + "\nrequire_explorer_source 0x1234\n"],
            env={"PATH": "/opt/homebrew/bin:/usr/bin:/bin", "RESPONSE": json.dumps(metadata), "CURL_EXIT": str(curl_exit)},
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode == 0, accepted, result.stderr)

    def test_full_source_is_required(self):
        self.check_gate({"is_verified": True, "is_fully_verified": True, "source_code": "contract C {}", "abi": []}, True)

    def test_unknown_uid_is_not_success(self):
        self.check_gate({"message": "OK", "result": "Unknown UID", "status": "1"}, False)

    def test_unverified_and_partial_are_rejected(self):
        self.check_gate({"is_verified": False}, False)
        self.check_gate({"is_verified": True, "is_fully_verified": False, "source_code": "contract C {}", "abi": []}, False)

    def test_missing_source_is_rejected(self):
        self.check_gate({"is_verified": True, "is_fully_verified": True, "abi": []}, False)

    def test_transport_failure_is_rejected(self):
        self.check_gate({}, False, 22)


if __name__ == "__main__":
    unittest.main()
