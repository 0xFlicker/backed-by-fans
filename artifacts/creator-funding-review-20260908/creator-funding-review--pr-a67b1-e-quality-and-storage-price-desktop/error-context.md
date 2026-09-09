# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: creator-funding-review.spec.ts >> @protocol-fork creator funding review >> keeps image controls focused while updating size, quality and storage price
- Location: tests/e2e/creator-funding-review.spec.ts:11:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByLabel('Image size', { exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByLabel('Image size', { exact: true })

```

```yaml
- link "Skip to content":
  - /url: "#main-content"
- banner:
  - link "Backed By Fans home":
    - /url: /
    - img "Backed By Fans"
    - text: Backed By Fans
  - navigation "Primary navigation":
    - link "About":
      - /url: /about
    - link "Protocol":
      - /url: /chains/31337/protocol
    - link "My account":
      - /url: /account
    - link "For creators":
      - /url: /create
    - link "Make art":
      - /url: /skill
  - text: Membership network
  - combobox "Membership network":
    - option "Robinhood Chain Testnet"
    - option "Robinhood Chain"
    - option "Backed By Fans Anvil" [selected]
  - button "0xf3…2266"
- main:
  - paragraph: For creators
  - heading "Your work. Your membership. Your people." [level=1]
  - paragraph: Set the terms, preview the artwork, and see what becomes permanent before you publish.
  - link "Manage memberships":
    - /url: /account
  - link "Make custom onchain artwork":
    - /url: /skill
  - complementary "Creator setup steps":
    - paragraph: Create membership
    - list:
      - listitem:
        - button "Identity": 1 Identity
      - listitem:
        - button "Art Studio": 2 Art Studio
      - listitem:
        - button "Price & period": 3 Price & period
      - listitem:
        - button "Support split": 4 Support split
      - listitem:
        - button "Capacity": 5 Capacity
      - listitem:
        - button "Risks": 6 Risks
      - listitem:
        - button "Review": 7 Review
    - paragraph: Your progress stays here if the wallet reconnects.
  - region "Art Studio":
    - text: Art Studio
    - region "Make the membership unmistakably yours.":
      - heading "Make the membership unmistakably yours." [level=1]
      - paragraph: Choose a style, preview it, and fine-tune only what matters.
      - region "Your membership artwork":
        - paragraph: Preview
        - heading "Your membership artwork" [level=2]
        - button "New preview"
        - group "State":
          - text: State
          - button "Active" [pressed]
          - button "Afterglow"
        - img "Creator Membership, token 7. Active membership artwork, token 7."
        - heading "One style, three memberships" [level=3]
        - text: Active set
        - button "Token 1 Creator Membership, token 1. Active membership artwork, token 1.":
          - text: Token 1
          - img "Creator Membership, token 1. Active membership artwork, token 1."
        - button "Token 7 Creator Membership, token 7. Active membership artwork, token 7." [pressed]:
          - text: Token 7
          - img "Creator Membership, token 7. Active membership artwork, token 7."
        - button "Token 42 Creator Membership, token 42. Active membership artwork, token 42.":
          - text: Token 42
          - img "Creator Membership, token 42. Active membership artwork, token 42."
        - status: Token 7 active preview is ready.
      - complementary "Art direction tools":
        - strong: Find a direction
        - button "Surprise me"
        - group "Art style":
          - text: Art style
          - paragraph: Pick a style. Fine-tune it below.
          - radiogroup "Art styles":
            - radio "STACK Planes and depth Offset planes, openings, and depth." [checked]:
              - strong: STACK
              - text: Planes and depth Offset planes, openings, and depth.
            - radio "CHORUS Lights and orbit Lights gather in orbits and trails.":
              - strong: CHORUS
              - text: Lights and orbit Lights gather in orbits and trails.
            - radio "LOOM Ribbon and tension Woven ribbons reveal the image beneath.":
              - strong: LOOM
              - text: Ribbon and tension Woven ribbons reveal the image beneath.
            - radio "BLOOM Petals and halo Petals and halos build outward.":
              - strong: BLOOM
              - text: Petals and halo Petals and halos build outward.
            - radio "MARQUEE Type and poster Oversized type with poster energy.":
              - strong: MARQUEE
              - text: Type and poster Oversized type with poster energy.
            - radio "AFTERIMAGE Image and echo Layered silhouettes leave a lasting echo.":
              - strong: AFTERIMAGE
              - text: Image and echo Layered silhouettes leave a lasting echo.
            - radio "CUSTOM Contract renderer Use a renderer contract address.":
              - strong: CUSTOM
              - text: Contract renderer Use a renderer contract address.
      - group:
        - text: Artwork
        - heading "Customize artwork" [level=3]
        - text: Palette, type, and texture
        - paragraph:
          - text: Direction
          - code: 8e3cbf4160841785cafe7ece2cb57070
        - button "Lock direction": Lock
        - text: Palette
        - button "Lock Palette": Lock
        - slider "Palette": "0"
        - spinbutton "Palette numeric value": "0"
        - text: 0-4 Intensity
        - button "Lock Intensity": Lock
        - slider "Intensity": "72"
        - spinbutton "Intensity numeric value": "72"
        - text: 0-100 Density
        - button "Lock Density": Lock
        - slider "Density": "58"
        - spinbutton "Density numeric value": "58"
        - text: 0-100 Symmetry
        - button "Lock Symmetry": Lock
        - slider "Symmetry": "42"
        - spinbutton "Symmetry numeric value": "42"
        - text: 0-100 Type scale
        - button "Lock Type scale": Lock
        - slider "Type scale": "60"
        - spinbutton "Type scale numeric value": "60"
        - text: 0-100 Type treatment
        - button "Lock Type treatment": Lock
        - slider "Type treatment": "0"
        - spinbutton "Type treatment numeric value": "0"
        - text: 0-3
        - checkbox "Show tier text" [checked]
        - text: Show tier text
        - button "Lock Show tier text": Lock
        - text: Grain
        - button "Lock Grain": Lock
        - slider "Grain": "38"
        - spinbutton "Grain numeric value": "38"
        - text: 0-100
        - group: Style controls
      - group:
        - text: Image
        - heading "Add an image" [level=3]
        - text: Image selected
        - paragraph: Choose an image below, or leave this unselected to use generated artwork.
        - region "Images":
          - heading "Images" [level=4]
          - button "Use generated artwork"
          - list:
            - listitem:
              - button "Replace new image"
              - img "New image"
            - listitem:
              - button "Select saved image 1"
        - text: Image size
        - combobox "Image size":
          - option "64 × 64"
          - option "128 × 128"
          - option "256 × 256"
          - option "384 × 384"
          - option "512 × 512" [selected]
        - group "File type":
          - text: File type
          - radio "JPEG" [checked]
          - text: JPEG
          - radio "PNG"
          - text: PNG
        - text: JPEG quality
        - slider "JPEG quality 0.84": "0.84"
        - spinbutton "JPEG quality numeric value": "0.84"
        - status:
          - strong: Image storage estimate
          - paragraph: 26,108 bytes · 12,708,142 gas · approximately 0.012708142088956994 ETH
          - paragraph: Adjust image size and quality to compare costs. Storage only; creating the membership costs extra. The final wallet fee may change.
        - group:
          - text: Image placement Image fit
          - combobox "Image fit":
            - option "Cover" [selected]
            - option "Contain"
            - option "Tile"
          - text: Horizontal focal point
          - button "Lock Horizontal focal point": Lock
          - slider "Horizontal focal point": "50"
          - spinbutton "Horizontal focal point numeric value": "50"
          - text: 0-100 Vertical focal point
          - button "Lock Vertical focal point": Lock
          - slider "Vertical focal point": "50"
          - spinbutton "Vertical focal point numeric value": "50"
          - text: 0-100 Media mix
          - button "Lock Media mix": Lock
          - slider "Media mix": "58"
          - spinbutton "Media mix numeric value": "58"
          - text: 0-100
      - status: Art Studio ready.
    - navigation "Setup step controls":
      - button "Back"
      - button "Next step"
- contentinfo:
  - img "Backed By Fans"
  - paragraph: Creator-owned. Backed By Fans.
- alert
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | import { resolve } from "node:path";
  3  | import { erc20Abi, getAddress, parseEther } from "viem";
  4  | import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
  5  | import sources from "../../../contracts/external/verification/4663/sources.json" with { type: "json" };
  6  | import { forkContext } from "./helpers/protocol-fork";
  7  | import { connectAnvilWallet, installAnvilWallet, requiredAnvilAddress, rpcRequest, expectReconciled } from "./helpers/anvil";
  8  | 
  9  | test.describe("@protocol-fork creator funding review", () => {
  10 |   test.skip(process.env.BBF_PROTOCOL_FORK_AUTHENTIC !== "1", "Requires an authentic local fork.");
  11 |   test("keeps image controls focused while updating size, quality and storage price", async ({ page }) => {
  12 |     test.setTimeout(120000);
  13 |     const creator = requiredAnvilAddress("creator");
  14 |     await installAnvilWallet(page, creator);
  15 |     await page.goto("/create");
  16 |     await connectAnvilWallet(page, creator);
  17 |     await page.getByRole("button", { name: /^art studio$/i }).click();
  18 |     await page.getByText("Add an image", { exact: true }).click();
  19 |     await page.getByLabel("Add new image").setInputFiles(resolve("public/brand/backstage-membership-hero-v1.png"));
  20 |     const size = page.getByLabel("Image size", { exact: true });
> 21 |     await expect(size).toBeVisible();
     |                        ^ Error: expect(locator).toBeVisible() failed
  22 |     await size.selectOption("64");
  23 |     await expect(page.getByText(/gas · approximately/)).toBeVisible();
  24 |     const cost64 = await page.getByText(/gas · approximately/).textContent();
  25 |     await size.selectOption("128");
  26 |     await expect(page.getByText(/gas · approximately/)).toBeVisible();
  27 |     await expect(page.getByText(/gas · approximately/)).not.toHaveText(cost64!);
  28 |     const slider = page.getByRole("slider", { name: "JPEG quality" });
  29 |     await slider.focus();
  30 |     for (let i = 0; i < 3; i++) {
  31 |       await slider.press("ArrowLeft");
  32 |       await expect(slider).toBeFocused();
  33 |       await expect(size).toBeVisible();
  34 |     }
  35 |     await expect(page.getByText(/gas · approximately/)).toBeVisible();
  36 |   });
  37 | 
  38 |   test("wraps the exact shortfall through the wallet before purchasing", async ({ page }, info) => {
  39 |     test.skip(info.project.name !== "desktop", "One wallet mutation is sufficient.");
  40 |     test.setTimeout(120000);
  41 |     const f = await forkContext();
  42 |     const payer = privateKeyToAccount(generatePrivateKey()).address;
  43 |     const weth = getAddress(sources.records.weth.address);
  44 |     const price = parseEther("0.001");
  45 |     // Own a new local wallet and tier; never rewind the user's running fork.
  46 |     await rpcRequest("anvil_setBalance", [payer, `0x${parseEther("1").toString(16)}`]);
  47 |     await rpcRequest("anvil_impersonateAccount", [payer]);
  48 |     try {
  49 |       const tier = await f.tier(`Wrapping review ${Date.now()}`, weth, 100, price);
  50 |       await installAnvilWallet(page, payer);
  51 |       await page.goto(`/chains/31337/tiers/${tier}`);
  52 |       await connectAnvilWallet(page, payer);
  53 |       await expect(page.getByRole("button", { name: "Join this membership" })).toBeDisabled();
  54 |       await page.getByRole("button", { name: "Wrap 0.001 ETH", exact: true }).click();
  55 |       await expectReconciled(page, "Wrap ETH");
  56 |       expect(await f.client.readContract({ address: weth, abi: erc20Abi, functionName: "balanceOf", args: [payer] })).toBe(price);
  57 |       await page.getByRole("button", { name: "Join this membership" }).click();
  58 |       await expectReconciled(page, "Join this membership");
  59 |       expect(await f.client.readContract({ address: weth, abi: erc20Abi, functionName: "balanceOf", args: [payer] })).toBe(0n);
  60 |     } finally {
  61 |       await rpcRequest("anvil_stopImpersonatingAccount", [payer]);
  62 |     }
  63 |   });
  64 | });
  65 | 
```