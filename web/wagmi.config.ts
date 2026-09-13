import { defineConfig } from "@wagmi/cli";
import { foundry, react } from "@wagmi/cli/plugins";
import { erc20Abi } from "viem";

const stagedFoundryProject = process.env.BBF_WAGMI_FOUNDRY_PROJECT;
const stagedOutput = process.env.BBF_WAGMI_OUTPUT;

if (Boolean(stagedFoundryProject) !== Boolean(stagedOutput)) {
  throw new Error(
    "BBF_WAGMI_FOUNDRY_PROJECT and BBF_WAGMI_OUTPUT must be provided together",
  );
}

const foundryProject = stagedFoundryProject ?? "../contracts";
const output = stagedOutput ?? "src/contracts.ts";

export default defineConfig({
  out: output,
  contracts: [
    {
      name: "USDG",
      abi: erc20Abi,
    },
  ],
  plugins: [
    foundry({
      project: foundryProject,
      // generate-contracts.sh owns the independent leaf build and deterministic
      // consumer linking. A plain plugin rebuild would discard that mapping.
      forge: { build: false, clean: false, rebuild: false },
      // Factories using the previous membership lifecycle have no active pointer; their
      // timestamped historical receipts remain. Only the release wrapper may
      // promote a new run-latest after current runtime/dependency verification.
      // Independent, still-valid renderer registry broadcasts remain discoverable.
      includeBroadcasts: true,
      // Use the consumer build, excluding the separately preserved ledger build
      // and OpenZeppelin's import-only IERC165 alias (which has no ABI). The
      // canonical introspection interface remains included for capability reads.
      exclude: ["vesting-leaf/**", "interfaces/IERC165.sol/**"],
      include: [
        "MembershipTier.sol/**",
        "OnchainMediaStoreFactory.sol/**",
        "OnchainMetadataRenderer.sol/**",
        "RendererPreviewHarness.sol/**",
        "RendererRegistry.sol/**",
        "MembershipFactory.sol/**",
        "ProtocolBuybackVault.sol/**",
        "ProtocolBurnRouter.sol/**",
        "PonsBuybackExecutor.sol/**",
        "IPons.sol/**",
        "ISafe.sol/**",
        "IWrappedNative.sol/**",
        "IV4Quoter.sol/**",
        "IPoolManager.sol/**",
        "IERC8056.sol/IScaled*.json",
        "IERC165.sol/**",
      ],
    }),
    react(),
  ],
});
