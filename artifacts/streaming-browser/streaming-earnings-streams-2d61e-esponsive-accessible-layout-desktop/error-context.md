# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: streaming-earnings.spec.ts >> streams account earnings and preserves responsive accessible layout
- Location: tests/e2e/streaming-earnings.spec.ts:4:1

# Error details

```
Error: page.goto: net::ERR_ABORTED at http://127.0.0.1:3114/chains/31337/tiers/0xD1704610ee7a2276A59273ED8eAC747cA8bB8bAE
Call log:
  - navigating to "http://127.0.0.1:3114/chains/31337/tiers/0xD1704610ee7a2276A59273ED8eAC747cA8bB8bAE", waiting until "load"

```

# Page snapshot

```yaml
- generic [active] [ref=f2e1]:
  - generic [ref=f2e2]:
    - link "Skip to content" [ref=f2e3] [cursor=pointer]:
      - /url: "#main-content"
    - banner [ref=f2e4]:
      - link "Backed By Fans home" [ref=f2e5] [cursor=pointer]:
        - /url: /
        - img "Backed By Fans" [ref=f2e6]
        - generic [ref=f2e10]: Backed By Fans
      - navigation "Primary navigation" [ref=f2e11]:
        - link "About" [ref=f2e12] [cursor=pointer]:
          - /url: /about
        - link "Protocol" [ref=f2e13] [cursor=pointer]:
          - /url: /chains/31337/protocol
        - link "My account" [ref=f2e14] [cursor=pointer]:
          - /url: /account
        - link "For creators" [ref=f2e15] [cursor=pointer]:
          - /url: /create
        - link "Make art" [ref=f2e16] [cursor=pointer]:
          - /url: /skill
      - generic [ref=f2e17]:
        - generic [ref=f2e18]:
          - generic [ref=f2e19]: Membership network
          - combobox "Membership network" [ref=f2e20]:
            - option "Robinhood Chain Testnet"
            - option "Robinhood Chain"
            - option "Backed By Fans Anvil" [selected]
        - button "0xbE…9027" [ref=f2e22] [cursor=pointer]
    - main [ref=f2e23]:
      - generic [ref=f2e25]:
        - generic [ref=f2e26]:
          - generic [ref=f2e27]:
            - paragraph [ref=f2e28]: Backed by you
            - heading "Your account." [level=1] [ref=f2e29]
          - paragraph [ref=f2e30]: Your memberships, creations and earnings.
        - generic [ref=f2e31]:
          - region "Rewards" [ref=f2e32]:
            - generic [ref=f2e33]:
              - paragraph [ref=f2e34]: Ready to collect
              - heading "Your rewards" [level=2] [ref=f2e35]
            - generic [ref=f2e36]:
              - generic [ref=f2e37]:
                - paragraph [ref=f2e38]:
                  - generic [ref=f2e39]:
                    - generic [ref=f2e40]: 0.188 WETH
                    - generic [ref=f2e41]:
                      - generic [ref=f2e42]: "0"
                      - text: .
                      - generic [ref=f2e44]: "1"
                      - generic [ref=f2e46]: "8"
                      - generic [ref=f2e48]: "8"
                      - text: WETH
                - paragraph [ref=f2e50]:
                  - generic [ref=f2e51]:
                    - generic [ref=f2e52]: ≈ $465.60
                    - generic [ref=f2e53]:
                      - text: ≈ $
                      - generic [ref=f2e54]: "4"
                      - generic [ref=f2e56]: "6"
                      - generic [ref=f2e58]: "5"
                      - text: .
                      - generic [ref=f2e60]: "6"
                      - generic [ref=f2e62]: "0"
              - generic [ref=f2e64]:
                - paragraph [ref=f2e65]:
                  - generic [ref=f2e66]:
                    - generic [ref=f2e67]: 18.751 USDG
                    - generic [ref=f2e68]:
                      - generic [ref=f2e69]: "1"
                      - generic [ref=f2e71]: "8"
                      - text: .
                      - generic [ref=f2e73]: "7"
                      - generic [ref=f2e75]: "5"
                      - generic [ref=f2e77]: "1"
                      - text: USDG
                - paragraph [ref=f2e79]:
                  - generic [ref=f2e80]:
                    - generic [ref=f2e81]: ≈ $18.75
                    - generic [ref=f2e82]:
                      - text: ≈ $
                      - generic [ref=f2e83]: "1"
                      - generic [ref=f2e85]: "8"
                      - text: .
                      - generic [ref=f2e87]: "7"
                      - generic [ref=f2e89]: "5"
              - generic [ref=f2e91]:
                - paragraph [ref=f2e92]:
                  - generic [ref=f2e93]:
                    - generic [ref=f2e94]: 0.00375 AMD
                    - generic [ref=f2e95]:
                      - generic [ref=f2e96]: "0"
                      - text: .
                      - generic [ref=f2e98]: "0"
                      - generic [ref=f2e100]: "0"
                      - generic [ref=f2e102]: "3"
                      - generic [ref=f2e104]: "7"
                      - generic [ref=f2e106]: "5"
                      - text: AMD
                - paragraph [ref=f2e108]:
                  - generic [ref=f2e109]:
                    - generic [ref=f2e110]: ≈ $1.89
                    - generic [ref=f2e111]:
                      - text: ≈ $
                      - generic [ref=f2e112]: "1"
                      - text: .
                      - generic [ref=f2e114]: "8"
                      - generic [ref=f2e116]: "9"
            - group [ref=f2e118]:
              - generic "Reward details" [ref=f2e119] [cursor=pointer]
            - generic [ref=f2e120]:
              - button "Claim everything" [ref=f2e121] [cursor=pointer]
              - button "Refresh" [ref=f2e122] [cursor=pointer]
          - generic [ref=f2e123]:
            - generic [ref=f2e124]:
              - heading "Your memberships" [level=2] [ref=f2e125]
              - paragraph [ref=f2e126]: The memberships connected to this wallet, including the ones you support and the ones you run.
            - button "Refresh memberships" [ref=f2e127] [cursor=pointer]:
              - generic [ref=f2e130]: Refresh
          - list [ref=f2e131]:
            - listitem [ref=f2e132]:
              - article [ref=f2e133]:
                - link "View WETH Fans" [ref=f2e134] [cursor=pointer]:
                  - /url: /chains/31337/tiers/0xD1704610ee7a2276A59273ED8eAC747cA8bB8bAE
                  - img "WETH Fans collection artwork" [ref=f2e136]
                - generic [ref=f2e137]:
                  - generic [ref=f2e138]:
                    - strong [ref=f2e139]: WETH Fans
                    - generic [ref=f2e140]: Member and creator
                  - generic [ref=f2e141]:
                    - generic [ref=f2e142]:
                      - term [ref=f2e143]: Rewards ready
                      - definition [ref=f2e144]:
                        - generic [ref=f2e145]:
                          - generic [ref=f2e146]: 0.0625 WETH
                          - generic [ref=f2e147]:
                            - generic [ref=f2e148]: "0"
                            - text: .
                            - generic [ref=f2e150]: "0"
                            - generic [ref=f2e152]: "6"
                            - generic [ref=f2e154]: "2"
                            - generic [ref=f2e156]: "5"
                            - text: WETH
                    - generic [ref=f2e158]:
                      - term [ref=f2e159]: Creator earnings
                      - definition [ref=f2e160]:
                        - generic [ref=f2e161]:
                          - generic [ref=f2e162]: 0.125 WETH
                          - generic [ref=f2e163]:
                            - generic [ref=f2e164]: "0"
                            - text: .
                            - generic [ref=f2e166]: "1"
                            - generic [ref=f2e168]: "2"
                            - generic [ref=f2e170]: "5"
                            - text: WETH
                  - generic [ref=f2e172]:
                    - link "View membership" [ref=f2e173] [cursor=pointer]:
                      - /url: /chains/31337/tiers/0xD1704610ee7a2276A59273ED8eAC747cA8bB8bAE
                    - link "Manage membership" [ref=f2e174] [cursor=pointer]:
                      - /url: /chains/31337/tiers/0xD1704610ee7a2276A59273ED8eAC747cA8bB8bAE/manage
            - listitem [ref=f2e175]:
              - article [ref=f2e176]:
                - link "View USDG Fans" [ref=f2e177] [cursor=pointer]:
                  - /url: /chains/31337/tiers/0x6996dc0297A0dd21Bb6d384E593c18cd8Ea3ed9b
                  - img "USDG Fans collection artwork" [ref=f2e179]
                - generic [ref=f2e180]:
                  - generic [ref=f2e181]:
                    - strong [ref=f2e182]: USDG Fans
                    - generic [ref=f2e183]: Member and creator
                  - generic [ref=f2e184]:
                    - generic [ref=f2e185]:
                      - term [ref=f2e186]: Rewards ready
                      - definition [ref=f2e187]:
                        - generic [ref=f2e188]:
                          - generic [ref=f2e189]: 6.25 USDG
                          - generic [ref=f2e190]:
                            - generic [ref=f2e191]: "6"
                            - text: .
                            - generic [ref=f2e193]: "2"
                            - generic [ref=f2e195]: "5"
                            - text: USDG
                    - generic [ref=f2e197]:
                      - term [ref=f2e198]: Creator earnings
                      - definition [ref=f2e199]:
                        - generic [ref=f2e200]:
                          - generic [ref=f2e201]: 12.501 USDG
                          - generic [ref=f2e202]:
                            - generic [ref=f2e203]: "1"
                            - generic [ref=f2e205]: "2"
                            - text: .
                            - generic [ref=f2e207]: "5"
                            - generic [ref=f2e209]: "0"
                            - generic [ref=f2e211]: "1"
                            - text: USDG
                  - generic [ref=f2e213]:
                    - link "View membership" [ref=f2e214] [cursor=pointer]:
                      - /url: /chains/31337/tiers/0x6996dc0297A0dd21Bb6d384E593c18cd8Ea3ed9b
                    - link "Manage membership" [ref=f2e215] [cursor=pointer]:
                      - /url: /chains/31337/tiers/0x6996dc0297A0dd21Bb6d384E593c18cd8Ea3ed9b/manage
            - listitem [ref=f2e216]:
              - article [ref=f2e217]:
                - link "View AMD Fans" [ref=f2e218] [cursor=pointer]:
                  - /url: /chains/31337/tiers/0x7A77B9D55f5b62A9319E6853b8e03C9a9d5D9aAa
                  - img "AMD Fans collection artwork" [ref=f2e220]
                - generic [ref=f2e221]:
                  - generic [ref=f2e222]:
                    - strong [ref=f2e223]: AMD Fans
                    - generic [ref=f2e224]: Member and creator
                  - generic [ref=f2e225]:
                    - generic [ref=f2e226]:
                      - term [ref=f2e227]: Rewards ready
                      - definition [ref=f2e228]:
                        - generic [ref=f2e229]:
                          - generic [ref=f2e230]: 0.00125 AMD
                          - generic [ref=f2e231]:
                            - generic [ref=f2e232]: "0"
                            - text: .
                            - generic [ref=f2e234]: "0"
                            - generic [ref=f2e236]: "0"
                            - generic [ref=f2e238]: "1"
                            - generic [ref=f2e240]: "2"
                            - generic [ref=f2e242]: "5"
                            - text: AMD
                    - generic [ref=f2e244]:
                      - term [ref=f2e245]: Creator earnings
                      - definition [ref=f2e246]:
                        - generic [ref=f2e247]:
                          - generic [ref=f2e248]: 0.0025 AMD
                          - generic [ref=f2e249]:
                            - generic [ref=f2e250]: "0"
                            - text: .
                            - generic [ref=f2e252]: "0"
                            - generic [ref=f2e254]: "0"
                            - generic [ref=f2e256]: "2"
                            - generic [ref=f2e258]: "5"
                            - text: AMD
                  - generic [ref=f2e260]:
                    - link "View membership" [ref=f2e261] [cursor=pointer]:
                      - /url: /chains/31337/tiers/0x7A77B9D55f5b62A9319E6853b8e03C9a9d5D9aAa
                    - link "Manage membership" [ref=f2e262] [cursor=pointer]:
                      - /url: /chains/31337/tiers/0x7A77B9D55f5b62A9319E6853b8e03C9a9d5D9aAa/manage
    - contentinfo [ref=f2e263]:
      - generic [ref=f2e264]:
        - img "Backed By Fans" [ref=f2e265]
        - paragraph [ref=f2e269]: Creator-owned. Backed By Fans.
  - button "Open Next.js Dev Tools" [ref=f2e275] [cursor=pointer]
  - alert [ref=f2e279]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import { installAnvilWallet, connectAnvilWallet } from "./helpers/anvil";
  3  | 
  4  | test("streams account earnings and preserves responsive accessible layout", async ({
  5  |   page,
  6  | }, info) => {
  7  |   test.skip(
  8  |     !process.env.BBF_STREAMING_REVIEW,
  9  |     "Requires the isolated streaming fork",
  10 |   );
  11 |   test.setTimeout(90000);
  12 |   const errors: string[] = [];
  13 |   page.on("pageerror", (error) => errors.push(error.message));
  14 |   const wallet = "0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027";
  15 |   await installAnvilWallet(page, wallet);
  16 |   await page.goto("/account");
  17 |   await connectAnvilWallet(page, wallet);
  18 |   const rewards = page.getByRole("region", { name: "Rewards", exact: true });
  19 |   await expect(rewards.locator(".streaming-amount").first()).toBeVisible();
  20 |   await expect(rewards.locator(".account-reward-usd").first()).toContainText(
  21 |     "$",
  22 |   );
  23 |   const initial = await rewards
  24 |     .locator(".account-reward-usd [aria-hidden=true]")
  25 |     .first()
  26 |     .textContent();
  27 |   await expect
  28 |     .poll(
  29 |       () =>
  30 |         rewards
  31 |           .locator(".account-reward-usd [aria-hidden=true]")
  32 |           .first()
  33 |           .textContent(),
  34 |       { timeout: 35000 },
  35 |     )
  36 |     .not.toBe(initial);
  37 |   await page.screenshot({
  38 |     path: info.outputPath("account-desktop.png"),
  39 |     fullPage: true,
  40 |   });
  41 |   await page.setViewportSize({ width: 390, height: 844 });
  42 |   expect(
  43 |     await page.evaluate(
  44 |       () => document.documentElement.scrollWidth <= innerWidth,
  45 |     ),
  46 |   ).toBe(true);
  47 |   await rewards.screenshot({ path: info.outputPath("account-phone.png") });
  48 |   await page.emulateMedia({ reducedMotion: "reduce" });
  49 |   expect(
  50 |     await rewards
  51 |       .locator(".streaming-digit > span")
  52 |       .first()
  53 |       .evaluate((el) => getComputedStyle(el).animationName),
  54 |   ).toBe("none");
  55 |   await page.emulateMedia({ forcedColors: "active" });
  56 |   await expect(
  57 |     rewards.getByRole("button", { name: "Claim everything" }),
  58 |   ).toBeEnabled();
> 59 |   await page.goto(
     |              ^ Error: page.goto: net::ERR_ABORTED at http://127.0.0.1:3114/chains/31337/tiers/0xD1704610ee7a2276A59273ED8eAC747cA8bB8bAE
  60 |     "/chains/31337/tiers/0xD1704610ee7a2276A59273ED8eAC747cA8bB8bAE",
  61 |   );
  62 |   await expect(
  63 |     page.locator(".claim-groups .streaming-amount").first(),
  64 |   ).toBeVisible();
  65 |   await page.emulateMedia({
  66 |     forcedColors: "none",
  67 |     reducedMotion: "no-preference",
  68 |   });
  69 |   await page
  70 |     .locator(".claim-groups")
  71 |     .screenshot({ path: info.outputPath("membership-phone.png") });
  72 |   await page.goto("/chains/31337/protocol");
  73 |   await expect(
  74 |     page.locator(".asset-highlights .streaming-amount").first(),
  75 |   ).toBeVisible();
  76 |   await page
  77 |     .locator(".protocol-burn")
  78 |     .getByText("Accounting details", { exact: true })
  79 |     .click();
  80 |   await expect(
  81 |     page.locator(".protocol-funding-preview .streaming-amount").first(),
  82 |   ).toBeVisible();
  83 |   await page.screenshot({
  84 |     path: info.outputPath("protocol-phone.png"),
  85 |     fullPage: true,
  86 |   });
  87 |   expect(errors).toEqual([]);
  88 | });
  89 | 
```