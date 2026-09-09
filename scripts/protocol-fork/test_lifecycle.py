"""Offline guard/ownership tests; authentic execution is a separate retained gate."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("lifecycle", Path(__file__).with_name("lifecycle.py"))
lifecycle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lifecycle)


class Guards(unittest.TestCase):
    def test_no_token_entrypoint_rejects_saved_state_before_starting_services(self):
        for env in [
            {"BBF_FORK_RESTORE_STATE": "/tmp/state"},
            {"BBF_FORK_RESTORE_EVIDENCE": "/tmp/evidence"},
            {"BBF_FORK_RESTORE_STATE": "/tmp/state", "BBF_FORK_RESTORE_EVIDENCE": "/tmp/evidence"},
        ]:
            with self.subTest(env=env), patch.dict(os.environ, env, clear=True), patch.object(subprocess, "Popen") as spawn:
                with self.assertRaisesRegex(ValueError, "No-token deployment requires fresh state"):
                    lifecycle.Run(argparse.Namespace(mode="serve", run_id="no-token", without_token=True))
                spawn.assert_not_called()

    def test_no_token_mode_cannot_claim_full_acceptance(self):
        with patch.object(subprocess, "Popen") as spawn:
            with self.assertRaisesRegex(ValueError, "manual serve workflow"):
                lifecycle.Run(argparse.Namespace(mode="run", run_id="no-token", without_token=True))
            spawn.assert_not_called()

    def test_restore_cannot_replace_fresh_acceptance_or_use_half_a_snapshot(self):
        for mode, env in [
            ("run", {"BBF_FORK_RESTORE_STATE": "/tmp/state", "BBF_FORK_RESTORE_EVIDENCE": "/tmp/evidence"}),
            ("serve", {"BBF_FORK_RESTORE_STATE": "/tmp/state"}),
            ("serve", {"BBF_FORK_RESTORE_EVIDENCE": "/tmp/evidence"}),
        ]:
            with self.subTest(mode=mode, env=env), patch.dict(os.environ, env, clear=True), patch.object(subprocess, "Popen") as spawn:
                with self.assertRaisesRegex(ValueError, "restoration requires serve"):
                    lifecycle.Run(argparse.Namespace(mode=mode, run_id="restore"))
                spawn.assert_not_called()

    def test_restore_rejects_a_different_origin_before_starting_services(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            state = root / "state.json"; state.write_text("{}")
            (root / "browser-environment.json").write_text("{}")
            (root / "lifecycle.json").write_text(json.dumps({"origin": {**lifecycle.PIN, "blockNumber": "1"}}))
            env = {"BBF_FORK_RESTORE_STATE": str(state), "BBF_FORK_RESTORE_EVIDENCE": directory}
            with patch.dict(os.environ, env, clear=True), patch.object(subprocess, "Popen") as spawn:
                with self.assertRaisesRegex(ValueError, "Saved state origin"):
                    lifecycle.Run(argparse.Namespace(mode="serve", run_id="stale"))
                spawn.assert_not_called()

    def test_rejects_public_credentialed_and_ambiguous_write_endpoints(self):
        for url in ["https://127.0.0.1:8547", "http://example.com:8547", "http://user:secret@localhost:8547", "http://127.0.0.1:8547/path", "http://localhost:8547?token=secret", "http://localhost"]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                lifecycle.endpoint(url)
        for url in ["http://localhost:8547", "http://127.0.0.1:8547", "http://[::1]:8547/"]:
            self.assertEqual(lifecycle.endpoint(url).port, 8547)

    def test_run_ids_cannot_escape_owned_state(self):
        for value in ["", "../foreign", "a/b", "-flags", "x" * 65]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                lifecycle.validate_run_id(value)
        self.assertEqual(lifecycle.validate_run_id("run_2-a"), "run_2-a")

    def test_retained_evidence_cannot_be_disposable_or_its_parent(self):
        for evidence in ["/tmp/run", "/tmp/run/evidence", "/tmp"]:
            with self.assertRaises(ValueError):
                lifecycle.independent_evidence(Path(evidence), Path("/tmp/run"))
        self.assertEqual(lifecycle.independent_evidence(Path("/tmp/evidence"), Path("/tmp/run")), Path("/tmp/evidence").resolve())

    def test_origin_pin_is_checked_before_any_process_or_write(self):
        env = {"BBF_FORK_RPC_URL": "https://private.invalid/key", "BBF_FORK_BLOCK_NUMBER": str(int(lifecycle.PIN["blockNumber"]) - 1), "BBF_FORK_BLOCK_HASH": lifecycle.PIN["blockHash"]}
        with patch.dict(os.environ, env, clear=True), patch.object(subprocess, "Popen") as spawn:
            with self.assertRaisesRegex(ValueError, "verified origin"):
                lifecycle.Run(argparse.Namespace(mode="serve", run_id="wrong-pin"))
            spawn.assert_not_called()

    def test_stop_refuses_stale_or_another_run_even_with_similar_name(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(lifecycle, "STATE_ROOT", Path(directory)), patch.object(os, "kill") as kill:
            path = Path(directory) / "run1.json"
            for identity in ["", f"python3 {lifecycle.__file__} serve --run-id run10"]:
                path.write_text(json.dumps({"runId": "run1", "pid": 1234, "processIdentity": identity, "evidenceDir": "/tmp/evidence"}))
                with patch.object(lifecycle, "process_identity", return_value=identity), self.assertRaises(ValueError):
                    lifecycle.stop("run1")
            kill.assert_not_called()

    def test_stop_signals_only_the_exact_owned_supervisor(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(lifecycle, "STATE_ROOT", Path(directory)), patch.object(os, "kill") as kill:
            identity = f"python3 {lifecycle.__file__} serve --run-id owned"
            (Path(directory) / "owned.json").write_text(json.dumps({"runId":"owned", "pid":1234, "processIdentity":identity, "evidenceDir":"/tmp/retained"}))
            with patch.object(lifecycle, "process_identity", return_value=identity):
                lifecycle.stop("owned")
            kill.assert_called_once_with(1234, signal.SIGTERM)

    def test_failure_and_signal_export_before_cleanup_and_preserve_unrelated_process(self):
        for failure, expected in [(RuntimeError("injected fixture failure"), "failed"), (lifecycle.Stopped(), "terminated")]:
            with self.subTest(status=expected), tempfile.TemporaryDirectory() as directory:
                root = Path(directory); run = lifecycle.Run.__new__(lifecycle.Run)
                run.args = argparse.Namespace(mode="run",run_id="cleanup")
                run.temp=root/"disposable";run.temp.mkdir();run.evidence=root/"evidence";run.evidence.mkdir()
                run.state_path=root/"state.json";run.state_path.write_text("{}")
                run.archive="https://private.invalid/key";run.status="running";run.steps=[];run.handles=[]
                (run.temp/"anvil.log").write_text(run.archive)
                broadcast=run.temp/"broadcast/Script/31337/run-latest.json";broadcast.parent.mkdir(parents=True);broadcast.write_text('{"receipts":[]}')
                owned=subprocess.Popen(["python3","-c","import time; time.sleep(30)"],start_new_session=True)
                unrelated=subprocess.Popen(["python3","-c","import time; time.sleep(30)"],start_new_session=True)
                run.children=[owned]
                try:
                    with patch.object(run,"bootstrap",side_effect=failure):
                        if expected=="failed":
                            with self.assertRaises(RuntimeError):run.execute()
                        else:run.execute()
                    self.assertIsNotNone(owned.poll());self.assertIsNone(unrelated.poll())
                    self.assertFalse(run.temp.exists());self.assertFalse(run.state_path.exists())
                    self.assertEqual(json.loads((run.evidence/"lifecycle.json").read_text())["status"],expected)
                    self.assertTrue((run.evidence/"broadcast/Script/31337/run-latest.json").exists())
                    self.assertNotIn("private.invalid",(run.evidence/"anvil.log").read_text())
                finally:
                    unrelated.terminate();unrelated.wait()
                    if owned.poll() is None:owned.terminate();owned.wait()

    def test_export_failure_still_stops_services_and_preserves_recoverable_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);run=lifecycle.Run.__new__(lifecycle.Run)
            run.args=argparse.Namespace(mode="run",run_id="export-failed")
            run.temp=root/"disposable";run.temp.mkdir();run.evidence=root/"evidence";run.evidence.mkdir()
            run.state_path=root/"state";run.state_path.write_text("{}")
            run.archive="private";run.steps=[];run.handles=[];run.status="failed"
            process=subprocess.Popen(["python3","-c","import time; time.sleep(30)"],start_new_session=True)
            run.children=[process]
            try:
                with patch.object(run,"export_public",side_effect=OSError("injected export failure")),self.assertRaises(OSError):
                    run.cleanup()
                self.assertIsNotNone(process.poll())
                self.assertTrue(run.temp.exists())
                self.assertFalse(run.state_path.exists())
            finally:
                if process.poll() is None:process.terminate();process.wait()


if __name__ == "__main__":
    unittest.main()
