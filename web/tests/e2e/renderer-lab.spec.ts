import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getDeployment, publicConfig } from "../../src/lib/config";
import {
  importPackage,
  installPreviewRpc,
  rendererPackage,
} from "./helpers/renderer";

const imageFixture = fileURLToPath(
  new URL(
    "../../public/brand/backstage-membership-hero-v1.png",
    import.meta.url,
  ),
);
const hasPublicPreviewHarness =
  getDeployment(publicConfig, 46_630).status === "ready";

async function expectPreviewState(page: Page) {
  const images = page.getByRole("img", { name: /Membership example/i });
  if (hasPublicPreviewHarness) {
    // This suite supplies a synthetic RPC result; authentic artwork is tested
    // against the freshly deployed fork in the @anvil membership suite.
    await expect(images).toHaveCount(6);
  } else {
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "The canonical preview harness" }),
    ).toHaveText(
      "The canonical preview harness is not configured for this public build.",
    );
    await expect(images).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^Deploy renderer/ }),
    ).toBeDisabled();
  }
}

test("imports, previews, and updates browser-held renderer work", async ({
  page,
}) => {
  await installPreviewRpc(page);
  await page.goto("/render");
  await importPackage(page);

  await expect(page.getByText("Ready to preview 6 examples.")).toBeVisible();
  const deploymentSummary = page.getByRole("region", {
    name: "Deployment summary",
  });
  await expect(deploymentSummary).toBeVisible();
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Connect wallet" }),
  ).toBeHidden();
  await expect(
    deploymentSummary.getByRole("button", { name: "Connect wallet" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve renderer" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Reject renderer" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Preview 6 examples" }).click();
  await expectPreviewState(page);

  await page.getByLabel("Choose JPEG or PNG").setInputFiles({
    name: "creator.jpg",
    mimeType: "image/jpeg",
    buffer: await readFile(imageFixture),
  });
  await expect(page.getByText("creator.jpg")).toBeVisible();
  await expect(deploymentSummary).toBeVisible();
  await expect(
    deploymentSummary.getByText("Image size estimate"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Preview 6 examples" }).click();
  await expectPreviewState(page);
  if (hasPublicPreviewHarness) {
    const transformed = page.getByRole("img", { name: /Membership example/i });
    expect(await transformed.first().getAttribute("src")).toContain(
      "creator-image",
    );
  }
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => /renderer|image/i.test(key)),
    ),
  ).toEqual([]);

  await page.reload();
  await expect(
    page.getByText("Your representative gallery will appear here."),
  ).toBeVisible();
});

test("uses the optional loopback handoff without an account or source-image transfer", async ({
  context,
  page,
}, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL);
  if (testInfo.project.name !== "webkit") {
    await context.grantPermissions(["local-network-access"], {
      origin: baseURL,
    });
  }
  const value = rendererPackage();
  const helperOrigin = "http://127.0.0.1:54321";
  const sessionId = "renderer-browser-session";
  const requestSetFingerprint = `0x${"78".repeat(32)}`;
  const helperResponses = {
    "/v1/session": {
      chainId: 46_630,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      sessionId,
    },
    "/v1/candidate": {
      artifactFingerprint: value.artifacts.artifactFingerprint,
      candidateId: "candidate-1",
      creationBytecode: value.artifacts.creationBytecode,
      manifest: {
        ...value,
        artifacts: {
          ...value.artifacts,
          creationBytecode: undefined,
          runtimeBytecode: undefined,
        },
        examples: undefined,
      },
      runtimeBytecode: value.artifacts.runtimeBytecode,
    },
    "/v1/example-requests": {
      candidateFingerprint: value.artifacts.artifactFingerprint,
      requestSetFingerprint,
      requests: value.examples.map((example) => ({
        contextWithoutMedia: example.contextWithoutMedia,
        localImageSlot: example.localImageSlot,
        method: example.method,
        mode: "undeployed-initcode",
        requestId: example.requestId,
      })),
    },
  };
  await page.addInitScript(
    ({ origin, responses }) => {
      const browserFetch = window.fetch.bind(window);
      window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (!url.startsWith(origin)) return browserFetch(input, init);
        const body = responses[
          new URL(url).pathname as keyof typeof responses
        ] ?? {
          accepted: true,
        };
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        );
      }) as typeof window.fetch;
    },
    { origin: helperOrigin, responses: helperResponses },
  );
  const fragment = new URLSearchParams({
    capability: "c".repeat(43),
    helper: helperOrigin,
    sessionId,
  });

  await page.goto(`/render#${fragment}`);
  await expect(
    page.getByText("Connected to local helper.", { exact: true }),
  ).toBeVisible();
  await installPreviewRpc(page);
  await expect(page).toHaveURL(/\/render$/);
  await expect(page.getByText("Moonlit Memberships")).toBeVisible();
  await page.getByRole("button", { name: "Preview 6 examples" }).click();
  await expectPreviewState(page);
  await expect(
    page.getByRole("region", { name: "Deployment summary" }),
  ).toBeVisible();
});

test("falls back to manual import when loopback is unavailable", async ({
  page,
}) => {
  const fragment = new URLSearchParams({
    helper: "http://127.0.0.1:65534",
    capability: "c".repeat(43),
    sessionId: "unavailable-helper",
  });
  await page.goto(`/render#${fragment}`);
  await expect(page).toHaveURL(/\/render$/);
  await expect(page.getByRole("status")).toContainText(
    /local renderer helper/i,
  );
  await importPackage(page);
  await expect(page.getByText("Moonlit Memberships")).toBeVisible();
  await expect(page.getByText("Ready to preview 6 examples.")).toBeVisible();
});
