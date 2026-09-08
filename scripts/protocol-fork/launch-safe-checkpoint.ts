import { main } from "../../web/scripts/protocol-launch-safe-checkpoint";
export { main };
if (import.meta.main) main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message.replaceAll(process.env.BBF_FORK_RPC_URL ?? "\0", "[PRIVATE_RPC]") : "Local checkpoint failed");
  process.exitCode = 1;
});
