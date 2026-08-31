import { defineConfig } from "@wagmi/cli";
import { foundry, react } from "@wagmi/cli/plugins";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
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
const resolvedFoundryProject = resolve(process.cwd(), foundryProject);
const hasPromotedProtocolDeployment = [4663, 46630].some((chainId) =>
  existsSync(
    resolve(
      resolvedFoundryProject,
      `broadcast/DeployDirectProtocol.s.sol/${chainId}/run-latest.json`,
    ),
  ),
);

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
      // The raw CREATE2 release wrapper writes this pointer only after complete
      // runtime/dependency checks and source verification. Until then generation
      // intentionally emits ABI-only bindings for the replacement protocol.
      includeBroadcasts: hasPromotedProtocolDeployment,
      include: [
        "MembershipTier.sol/**",
        "OnchainMediaStoreFactory.sol/**",
        "OnchainMetadataRenderer.sol/**",
        "RendererPreviewHarness.sol/**",
        "MembershipFactory.sol/**",
        "TestnetUSDG.sol/**",
      ],
    }),
    react(),
  ],
});
