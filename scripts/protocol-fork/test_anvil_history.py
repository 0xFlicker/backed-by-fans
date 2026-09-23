"""Real local Anvil regression for bounded history without persisted chainstate."""
import importlib.util
import json
from pathlib import Path
import socket
import subprocess
import tempfile
import time

spec = importlib.util.spec_from_file_location("lifecycle", Path(__file__).with_name("lifecycle.py"))
lifecycle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lifecycle)

with tempfile.TemporaryDirectory(prefix="bbf-anvil-history-") as directory:
    cache = Path(directory) / "chainstate"
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    url = f"http://127.0.0.1:{port}"
    node = subprocess.Popen(["anvil", *lifecycle.ANVIL_HISTORY_ARGS, "--host", "127.0.0.1", "--port", str(port), "--cache-path", str(cache), "--silent"], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        for _ in range(100):
            if node.poll() is not None:
                raise RuntimeError(node.stderr.read().decode())
            try:
                lifecycle.rpc(url, "eth_chainId")
                break
            except OSError:
                time.sleep(0.05)
        else:
            raise RuntimeError("Anvil readiness timeout")
        owner = lifecycle.rpc(url, "eth_accounts")[0]
        lifecycle.rpc(url, "anvil_setAutomine", [False])
        tx = lifecycle.rpc(url, "eth_sendTransaction", [{"from": owner, "to": "0x000000000000000000000000000000000000dEaD", "value": "0x1"}])
        lifecycle.rpc(url, "evm_mine")
        receipt = lifecycle.rpc(url, "eth_getTransactionReceipt", [tx])
        assert receipt and receipt["status"] == "0x1"
        saved = lifecycle.rpc(url, "evm_snapshot")
        before = lifecycle.rpc(url, "eth_getBalance", [owner, "latest"])
        lifecycle.rpc(url, "anvil_setBalance", [owner, "0x7"])
        assert lifecycle.rpc(url, "evm_revert", [saved])
        assert lifecycle.rpc(url, "eth_getBalance", [owner, "latest"]) == before
        lifecycle.rpc(url, "anvil_mine", ["0x200"])
        assert lifecycle.rpc(url, "eth_getTransactionReceipt", [tx])["transactionHash"] == tx
        latest = lifecycle.rpc(url, "eth_getBlockByNumber", ["latest", False])
        assert lifecycle.rpc(url, "eth_getBalance", [owner, latest["number"]]) == before
        try:
            lifecycle.rpc(url, "eth_getBalance", [owner, receipt["blockNumber"]])
        except RuntimeError:
            pass
        else:
            raise AssertionError("Old historical state was not pruned")
        assert not cache.exists() or not any(cache.rglob("*")), "Persisted chainstate was written"
        print(json.dumps({"status": "passed", "historyStates": 256, "blocksMined": 512, "snapshotRevert": True, "oldReceiptAvailable": True, "oldStatePruned": True, "persistedStateFiles": 0}))
    finally:
        node.terminate()
        node.wait(timeout=10)
        node.stderr.close()
