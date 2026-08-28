import { defineConfig } from "@wagmi/cli";
import { foundry, react } from "@wagmi/cli/plugins";
import { erc20Abi } from "viem";

export default defineConfig({
  out: "src/contracts.ts",
  contracts: [
    {
      name: "USDG",
      abi: erc20Abi,
    },
  ],
  plugins: [
    foundry({
      project: "../contracts",
      includeBroadcasts: true,
      include: [
        "MembershipFactory.sol/MembershipFactory.json",
        "MembershipTier.sol/**",
        "OnchainMetadataRenderer.sol/**",
      ],
    }),
    react(),
  ],
});
