import { publicConfig } from "@/lib/config";

export const dynamic = "force-static";

export function GET() {
  const site = publicConfig.siteUrl;
  const body = `# Backed By Fans

> Creator-owned onchain memberships and public tools for building custom membership artwork.

## Onchain renderer skill

- [Create onchain membership art](${site}/skill): Give an agent an art brief and learn the creator workflow.
- [Complete renderer skill](${site}/skill/SKILL.md): Agent instructions for dependencies, implementation, local testing, preview, and deployment.
- [Renderer interface](${site}/skill/references/interface.md): Contract inputs, outputs, media behavior, and fixed compatibility surface.
- [Local renderer testing](${site}/skill/references/local-testing.md): Foundry tests and representative local gallery workflow.
- [Browser deployment](${site}/skill/references/deployment.md): Browser preview and creator-wallet deployment.
- [Download the toolkit](${site}/skill/onchain-render-skill.tar.gz): Self-contained skill, scripts, Foundry template, references, and tests.
- [Preview a renderer](${site}/render): Public browser tool for representative previews and deployment preparation.

## Product boundaries

- Public wallet memberships and rewards: \`/chains/{chainId}/wallets/{walletAddress}\`. The server renders membership ownership, reward previews, creator/referral earnings, and current accrual rates without a wallet connection. Amounts continue at those rates until their accounting boundary. Connected viewers with memberships can refresh the server snapshot; disconnected viewers do not poll chain data in the browser. Claim and management controls appear only for the connected wallet's own address; claims require the matching network. Use chain 46630 for Robinhood testnet or 4663 for Robinhood mainnet.

- Robinhood testnet, chain ID 46630, is the supported public chain for custom renderers.
- Browser deployments are recorded in the creator's onchain renderer list for later rediscovery. The list is not an approval gate; compatible renderers can still be shared and used directly by contract address.
- There is no cross-chain lookup. Mechanical checks establish interface behavior for tested inputs, and the creator decides whether to use the design.
- Renderer deployment uses the creator's browser wallet. Agents never need a private key export.
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
