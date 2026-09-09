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
      forge: stagedFoundryProject
        ? { build: false, clean: false, rebuild: false }
        : undefined,
      // The old fee-recipient factory's active pointer has been retired; its
      // timestamped historical receipt remains. Only the release wrapper may
      // promote a new run-latest after current runtime/dependency verification.
      // Independent, still-valid renderer registry broadcasts remain discoverable.
      includeBroadcasts: true,
      // The explicit include list below is the complete application surface;
      // retain IERC165 for authenticated payment-token capability reads.
      exclude: [],
      include: [
        "MembershipTier.sol/**",
        "OnchainMediaStoreFactory.sol/**",
        "OnchainMetadataRenderer.sol/**",
        "RendererPreviewHarness.sol/**",
        "RendererRegistry.sol/**",
        "MembershipFactory.sol/**",
        "ProtocolBuybackVault.sol/**",
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
