"""Own one disposable fork and its web process; retain evidence before teardown."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
FORK_START_GAS_PRICE = 100_000_000  # 0.1 gwei; Anvil fees may evolve as blocks are mined.
STATE_ROOT = Path(tempfile.gettempdir()) / "bbf-protocol-fork-runs"
ORIGIN_CONFIG = json.loads((ROOT / "scripts/protocol-fork/origin.json").read_text())
PIN = {key: ORIGIN_CONFIG[key] for key in ("chainId", "blockNumber", "blockHash")}


def validate_run_id(value):
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}", value):
        raise ValueError("Run ID must contain 1–64 letters, digits, hyphens or underscores")
    return value


def endpoint(value):
    url = urlsplit(value)
    if (url.scheme != "http" or url.hostname not in ("127.0.0.1", "localhost", "::1")
            or not url.port or url.username or url.password or url.query or url.fragment or url.path not in ("", "/")):
        raise ValueError("Execution writes require uncredentialed loopback HTTP with an explicit port")
    return url


def independent_evidence(evidence, temporary):
    evidence, temporary = evidence.resolve(), temporary.resolve()
    if evidence == temporary or temporary in evidence.parents or evidence in temporary.parents:
        raise ValueError("Retained evidence and disposable state must use independent directories")
    return evidence


def rpc(url, method, params=()):
    endpoint(url)
    request = urllib.request.Request(url, json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=15) as response:
        result = json.load(response)
    if "error" in result:
        raise RuntimeError(f"Local {method} failed: {result['error'].get('message', 'RPC error')}")
    return result["result"]


def process_identity(pid):
    try:
        return subprocess.check_output(["ps", "-p", str(pid), "-o", "lstart=", "-o", "command="], text=True).strip()
    except subprocess.CalledProcessError:
        return ""


def restore_clock(url, state_path):
    try:
        saved = int(json.loads(state_path.read_text())["block"]["timestamp"], 16)
        if saved < 0:
            raise ValueError("Negative timestamp")
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError("Saved Anvil state must include a valid block timestamp") from error
    current = int(rpc(url, "eth_getBlockByNumber", ["latest", False])["timestamp"], 16)
    timestamp = max(saved, current) + 1
    rpc(url, "evm_setNextBlockTimestamp", [timestamp])
    rpc(url, "evm_mine")
    return timestamp


def stop(run_id):
    path = STATE_ROOT / f"{run_id}.json"
    state = json.loads(path.read_text())
    if state["runId"] != run_id or state["pid"] == os.getpid():
        raise ValueError("Run ownership mismatch")
    identity = process_identity(state["pid"])
    if not identity or identity != state["processIdentity"] or str(Path(__file__).resolve()) not in identity or not re.search(r"--run-id\s+" + re.escape(run_id) + r"(?:\s|$)", identity):
        raise ValueError("Refusing to stop a stale or unrelated process")
    os.kill(state["pid"], signal.SIGTERM)
    print(f"Requested scoped teardown of {run_id}; evidence remains at {state['evidenceDir']}", flush=True)


class Stopped(Exception):
    pass


class Run:
    def __init__(self, args):
        self.args = args
        self.without_token = getattr(args, "without_token", False)
        if self.without_token and args.mode != "serve":
            raise ValueError("No-token deployment is a manual serve workflow")
        self.env = os.environ.copy()
        self.restore_state = self.env.get("BBF_FORK_RESTORE_STATE")
        self.restore_evidence = self.env.get("BBF_FORK_RESTORE_EVIDENCE")
        if self.without_token and (self.restore_state or self.restore_evidence):
            raise ValueError("No-token deployment requires fresh state; use the standard serve command to restore a saved fork")
        if self.restore_state or self.restore_evidence:
            if args.mode != "serve" or not self.restore_state or not self.restore_evidence:
                raise ValueError("State restoration requires serve mode, a state file and its evidence directory; it cannot produce fresh acceptance evidence")
            if not Path(self.restore_state).is_file() or not (Path(self.restore_evidence) / "browser-environment.json").is_file():
                raise ValueError("Saved state or browser environment is missing")
            record = Path(self.restore_evidence) / "lifecycle.json"
            saved_origin = json.loads(record.read_text()).get("origin") if record.is_file() else None
            if saved_origin != PIN:
                raise ValueError("Saved state origin does not match origin.json; deploy a fresh fork after repinning")
        self.rpc_url = self.env.get("BBF_FORK_EXECUTION_RPC_URL", "http://127.0.0.1:8547")
        self.web_url = self.env.get("BBF_FORK_WEB_URL", "http://127.0.0.1:3110")
        self.rpc_parts, self.web_parts = endpoint(self.rpc_url), endpoint(self.web_url)
        if self.rpc_parts.port == self.web_parts.port:
            raise ValueError("RPC and web ports must differ")
        if not self.env.get("BBF_FORK_RPC_URL"):
            raise ValueError("Set BBF_FORK_RPC_URL privately to the origin archive endpoint")
        if self.env.get("BBF_FORK_BLOCK_NUMBER", PIN["blockNumber"]) != PIN["blockNumber"] or self.env.get("BBF_FORK_BLOCK_HASH", PIN["blockHash"]).lower() != PIN["blockHash"].lower():
            raise ValueError("The execution harness requires the verified origin in scripts/protocol-fork/origin.json")
        self.env.update(BBF_FORK_BLOCK_NUMBER=PIN["blockNumber"], BBF_FORK_BLOCK_HASH=PIN["blockHash"])
        self.env.setdefault("BBF_FORK_INPUTS", str(ROOT / ORIGIN_CONFIG["inputsPath"]))
        raw_evidence = self.env.get("BBF_FORK_EVIDENCE_DIR", "")
        if not raw_evidence or not Path(raw_evidence).is_absolute():
            raise ValueError("BBF_FORK_EVIDENCE_DIR must be an absolute, fresh retained directory")
        self.evidence = Path(raw_evidence).resolve()
        if self.evidence.exists():
            raise ValueError("Evidence directory already exists; use a fresh run directory")
        for url in (self.rpc_parts, self.web_parts):
            with socket.socket(socket.AF_INET6 if url.hostname == "::1" else socket.AF_INET) as sock:
                if sock.connect_ex((url.hostname, url.port)) == 0:
                    raise ValueError("A requested port is occupied; refusing to reuse it")
        STATE_ROOT.mkdir(mode=0o700, exist_ok=True)
        self.state_path = STATE_ROOT / f"{args.run_id}.json"
        self.state_fd = os.open(self.state_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        self.temp = Path(tempfile.mkdtemp(prefix=f"bbf-{args.run_id}-"))
        try:
            independent_evidence(self.evidence, self.temp)
            self.evidence.mkdir(parents=True)
        except Exception:
            os.close(self.state_fd)
            self.state_path.unlink()
            shutil.rmtree(self.temp)
            raise
        self.children = []
        self.services = []
        self.handles = []
        self.status = "running"
        self.steps = []
        self.archive = self.env["BBF_FORK_RPC_URL"]
        self.workspace_lock = STATE_ROOT / ("workspace-" + hashlib.sha256(str(ROOT).encode()).hexdigest()[:16] + ".lock")
        try:
            # Next's production output is shared by this checkout. Distinct ports
            # alone cannot isolate simultaneous builds and served bundles.
            lock_fd = os.open(self.workspace_lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            os.write(lock_fd, json.dumps({"runId": args.run_id, "pid": os.getpid()}).encode())
            os.close(lock_fd)
        except Exception:
            os.close(self.state_fd)
            self.state_path.unlink()
            shutil.rmtree(self.temp)
            self.evidence.rmdir()
            raise
        self.env.update(BBF_FORK_TEMP_DIR=str(self.temp), BBF_FORK_RUN_ID=args.run_id,
                        FOUNDRY_PROFILE="robinhood", FOUNDRY_BROADCAST=str(self.temp / "broadcast"),
                        BBF_ADMIN_RPC_URL=self.rpc_url, BBF_ANVIL_RPC_URL=self.rpc_url,
                        BBF_FORK_DEVELOPER_KEY="20817", BBF_FORK_SAFE_KEY_A="40961", BBF_FORK_SAFE_KEY_B="40962", BBF_FORK_SAFE_KEY_C="40963",
                        BBF_FORK_INITIAL_BUY_WEI="10000000000000000")
        self.env["RUN_PROTOCOL_FORK_TESTS"] = "true"
        self.env["BBF_FORK_SINGLE_OWNER"] = "true" if args.mode == "serve" else "false"
        for name, value in {"DEVELOPER": 20817, "SAFE_KEY_A": 40961, "SAFE_KEY_B": 40962, "RELAYER": 49153}.items():
            key = f"BBF_CHECKPOINT_{name}" if name.startswith("SAFE") else f"BBF_CHECKPOINT_{name}_KEY"
            self.env[key] = "0x" + format(value, "064x")
        self.env["BBF_FORK_BOOTSTRAP"] = str(self.evidence / "bootstrap.json")
        self.env["BBF_FORK_BROWSER_EVIDENCE"] = str(self.evidence / "browser")
        self.env["PLAYWRIGHT_BASE_URL"] = self.web_url
        os.write(self.state_fd, json.dumps({"runId": args.run_id, "pid": os.getpid(), "processIdentity": process_identity(os.getpid()), "evidenceDir": str(self.evidence), "rpcUrl": self.rpc_url, "webUrl": self.web_url}).encode())
        os.close(self.state_fd)

    def write(self, name, value):
        (self.evidence / name).write_text(json.dumps(value, indent=2) + "\n")

    def command(self, name, command, cwd=ROOT):
        print(f"{self.args.run_id}: {name}", flush=True)
        output = self.temp / f"{name}.log"
        with output.open("w") as stream:
            process = subprocess.Popen(command, cwd=cwd, env=self.env, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
            self.children.append(process)
            code = process.wait()
        (self.evidence / f"{name}.log").write_text(output.read_text(errors="replace").replace(self.archive, "[PRIVATE_ORIGIN_RPC]"))
        self.steps.append({"name": name, "exitCode": code})
        if code:
            raise RuntimeError(f"{name} failed; see retained {name}.log")

    def service(self, name, command, cwd=ROOT):
        stream = (self.temp / f"{name}.log").open("w")
        self.handles.append(stream)
        process = subprocess.Popen(command, cwd=cwd, env=self.env, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
        self.children.append(process)
        self.services.append(process)
        return process

    def bootstrap(self):
        if self.restore_state:
            return self.restore_for_review()
        self.command("preflight", ["bun", str(ROOT / "scripts/protocol-fork/preflight.ts")])
        self.command("linked-build", ["bash", "scripts/build-linked-protocol.sh"], ROOT / "contracts")
        link_path = ROOT / "contracts/out/vesting-leaf/link-manifest.json"
        link = json.loads(link_path.read_text())
        if link.get("schemaVersion") != 1 or not link.get("mapping"):
            raise RuntimeError("Missing deterministic library build mapping")
        link_args = ["--libraries", link["mapping"]]
        shutil.copy2(link_path, self.evidence / "link-manifest.json")
        if self.args.mode == "run":
            self.command("curve-calibration", ["python3", str(ROOT / "scripts/calibrate-membership-lifecycle.py")])
            self.command("contracts", ["forge", "test", *link_args, "--json", "--code-size-limit", "1000000", "--gas-limit", "1000000000"], ROOT / "contracts")
        node = self.service("anvil", ["anvil", "--host", self.rpc_parts.hostname, "--port", str(self.rpc_parts.port), "--chain-id", "31337", "--hardfork", "cancun", "--code-size-limit", "98304", "--gas-limit", "100000000", "--block-time", "1", "--gas-price", str(FORK_START_GAS_PRICE), "--base-fee", str(FORK_START_GAS_PRICE), "--disable-min-priority-fee", "--fork-url", self.archive, "--fork-block-number", PIN["blockNumber"], "--silent"])
        for _ in range(200):
            if node.poll() is not None:
                raise RuntimeError("Anvil exited before readiness")
            try:
                if rpc(self.rpc_url, "eth_chainId") == "0x7a69":
                    break
            except (urllib.error.URLError, TimeoutError):
                pass
            time.sleep(0.1)
        else:
            raise RuntimeError("Anvil readiness timed out")
        origin = rpc(self.rpc_url, "eth_getBlockByNumber", [hex(int(PIN["blockNumber"])), False])
        if origin["hash"] != PIN["blockHash"]:
            raise RuntimeError("Fork origin header mismatch")
        self.write("origin-header.json", origin)
        developer = subprocess.check_output(["cast", "wallet", "address", "--private-key", self.env["BBF_CHECKPOINT_DEVELOPER_KEY"]], text=True).strip()
        rpc(self.rpc_url, "anvil_setBalance", [developer, hex(20 * 10**18)])
        deployment = "DeployForkProtocolNoToken" if self.without_token else "DeployForkProtocol"
        self.command("bootstrap", ["forge", "script", f"script/{deployment}.s.sol:{deployment}", *link_args, "--rpc-url", self.rpc_url, "--broadcast", "--slow", "--code-size-limit", "300000", "--legacy", "--with-gas-price", str(FORK_START_GAS_PRICE)], ROOT / "contracts")
        source = ROOT / "contracts/deployments/protocol-fork" / self.args.run_id / "bootstrap.json"
        shutil.copy2(source, self.evidence / "bootstrap.json")
        if not self.without_token:
            self.command("launch-safe-checkpoint", ["bun", str(ROOT / "scripts/protocol-fork/launch-safe-checkpoint.ts"), str(self.evidence / "bootstrap.json"), str(self.evidence)], ROOT / "web")
        self.command("browser-fixture", ["bun", "scripts/protocol-fork-fixture.ts", str(self.evidence)], ROOT / "web")
        if self.args.mode == "serve" and self.env.get("BBF_FORK_OWNER_ADDRESS"):
            owner = self.env["BBF_FORK_OWNER_ADDRESS"]
            self.command("owner-handoff", ["bun", "scripts/handoff-fork-safe.ts", str(self.evidence), owner], ROOT / "web")
            self.command("owner-funding", ["bun", "scripts/fund-fork-wallet.ts", owner, str(self.evidence)], ROOT / "web")
            self.command("buyback-demo", ["bun", "scripts/seed-buyback-demo.ts", str(self.evidence), owner], ROOT / "web")
        self.env.update(json.loads((self.evidence / "browser-environment.json").read_text()))
        self.env["NEXT_PUBLIC_SITE_URL"] = self.web_url
        if self.args.mode == "run":
            self.command("web-unit", ["bun", "run", "test", "--reporter=json", "--outputFile", str(self.evidence / "web-unit.json")], ROOT / "web")
        if self.args.mode == "run":
            self.command("web-build", ["bun", "run", "build"], ROOT / "web")
        web = self.service("web", ["bun", "run", "dev" if self.args.mode == "serve" else "start", "--", "--hostname", self.web_parts.hostname, "--port", str(self.web_parts.port)], ROOT / "web")
        for _ in range(200):
            if web.poll() is not None:
                raise RuntimeError("Web exited before readiness")
            try:
                with urllib.request.urlopen(self.web_url, timeout=2) as response:
                    if response.status == 200:
                        break
            except (urllib.error.URLError, TimeoutError):
                pass
            time.sleep(0.1)
        else:
            raise RuntimeError("Web readiness timed out")
        self.write("lifecycle.json", {"runId": self.args.run_id, "mode": self.args.mode, "status": "running", "origin": PIN, "executionChainId": 31337, "rpcUrl": self.rpc_url, "webUrl": self.web_url, "steps": self.steps})
        print(f"Ready: {self.web_url}/chains/31337/protocol | evidence: {self.evidence}", flush=True)

    def restore_for_review(self):
        """Resume local manual review without discarding wallet balances or deployments."""
        node = self.service("anvil", ["anvil", "--host", self.rpc_parts.hostname, "--port", str(self.rpc_parts.port), "--chain-id", "31337", "--hardfork", "cancun", "--code-size-limit", "98304", "--gas-limit", "100000000", "--block-time", "1", "--gas-price", str(FORK_START_GAS_PRICE), "--base-fee", str(FORK_START_GAS_PRICE), "--disable-min-priority-fee", "--fork-url", self.archive, "--fork-block-number", PIN["blockNumber"], "--load-state", self.restore_state, "--silent"])
        for _ in range(200):
            if node.poll() is not None:
                raise RuntimeError("Restored Anvil exited before readiness")
            try:
                if rpc(self.rpc_url, "eth_chainId") == "0x7a69":
                    break
            except (urllib.error.URLError, TimeoutError):
                pass
            time.sleep(0.1)
        else:
            raise RuntimeError("Restored Anvil readiness timed out")
        if rpc(self.rpc_url, "eth_getBlockByNumber", [hex(int(PIN["blockNumber"])), False])["hash"] != PIN["blockHash"]:
            raise RuntimeError("Restored fork origin mismatch")
        # load-state restores storage, but interval mining starts at wall time.
        # A saved vesting cursor must never observe an earlier block timestamp.
        restore_clock(self.rpc_url, Path(self.restore_state))
        source = Path(self.restore_evidence)
        for name in ("bootstrap.json", "browser-environment.json"):
            shutil.copy2(source / name, self.evidence / name)
        bootstrap = json.loads((self.evidence / "bootstrap.json").read_text())
        if rpc(self.rpc_url, "eth_getCode", [bootstrap["factory"], "latest"]) == "0x":
            raise RuntimeError("Saved factory is missing from restored state")
        self.env.update(json.loads((self.evidence / "browser-environment.json").read_text()))
        self.env["NEXT_PUBLIC_SITE_URL"] = self.web_url
        self.service("web", ["bun", "run", "dev", "--", "--hostname", self.web_parts.hostname, "--port", str(self.web_parts.port)], ROOT / "web")
        self.write("lifecycle.json", {"runId": self.args.run_id, "mode": "serve", "status": "running", "scope": "restored-manual-review-not-fresh-acceptance", "origin": PIN, "restoredFrom": str(source), "executionChainId": 31337, "rpcUrl": self.rpc_url, "webUrl": self.web_url})
        print(f"Restored manual review: {self.web_url}/chains/31337/protocol", flush=True)

    def execute(self):
        try:
            self.bootstrap()
            if self.args.mode == "serve":
                while True:
                    if any(child.poll() is not None for child in self.services):
                        raise RuntimeError("A served process exited")
                    time.sleep(0.5)
            self.command("browser", ["bun", "run", "test:e2e", "--grep", "@anvil|@protocol-fork", "--workers", "1", "--output", str(self.evidence / "browser" / "test-results")], ROOT / "web")
            self.export_public()
            self.command("export-evidence", ["bun", str(ROOT / "scripts/protocol-fork/export-evidence.ts"), str(self.evidence)])
            self.command("verify-evidence", ["bun", str(ROOT / "scripts/protocol-fork/verify-evidence.ts"), str(self.evidence)])
            self.status = "passed"
        except Stopped:
            self.status = "terminated"
        except Exception:
            self.status = "failed"
            raise
        finally:
            self.cleanup()

    def export_public(self):
        # Export receipts and logs while all disposable paths still exist. State
        # and snapshots contain test keys, so only public broadcast records move.
        broadcast = self.temp / "broadcast"
        if broadcast.exists():
            for path in broadcast.rglob("run-latest.json"):
                destination = self.evidence / "broadcast" / path.relative_to(broadcast)
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_text(path.read_text().replace(self.archive, "[PRIVATE_ORIGIN_RPC]"))
    def cleanup(self):
        exported = False
        try:
            self.export_public()
            self.write("lifecycle.json", {"runId": self.args.run_id, "mode": self.args.mode, "status": self.status, "origin": PIN, "executionChainId": 31337, "steps": self.steps})
        finally:
            # Export errors must never leave funded services running. Preserve
            # disposable files if export cannot finish so evidence is recoverable.
            try:
                for child in reversed(self.children):
                    if child.poll() is None:
                        try:
                            os.killpg(child.pid, signal.SIGTERM)
                        except ProcessLookupError:
                            continue
                        try:
                            child.wait(timeout=5)
                        except subprocess.TimeoutExpired:
                            os.killpg(child.pid, signal.SIGKILL)
                            child.wait()
                for handle in self.handles:
                    handle.close()
                self.export_public()
                for path in self.temp.glob("*.log"):
                    (self.evidence / path.name).write_text(path.read_text(errors="replace").replace(self.archive, "[PRIVATE_ORIGIN_RPC]"))
                exported = True
            finally:
                if exported:
                    shutil.rmtree(self.temp)
                self.state_path.unlink(missing_ok=True)
                if getattr(self, "workspace_lock", None):
                    self.workspace_lock.unlink(missing_ok=True)
        print(f"{self.args.run_id}: {self.status}; retained {self.evidence}", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("run", "serve", "stop"))
    parser.add_argument("--run-id", required=True, type=validate_run_id)
    parser.add_argument("--without-token", action="store_true")
    args = parser.parse_args()
    if args.mode == "stop":
        stop(args.run_id)
        return
    run = Run(args)
    def interrupted(_signal, _frame):
        raise Stopped()
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    run.execute()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Private upstream transport details must never reach the UI or artifacts.
        message = str(error).replace(os.environ.get("BBF_FORK_RPC_URL", "<unset>"), "[PRIVATE_ORIGIN_RPC]")
        print(message, file=sys.stderr)
        sys.exit(1)
