import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  encodeAbiParameters,
  encodeFunctionResult,
  getAddress,
  getCreate2Address,
  keccak256,
  type Hex,
} from "viem";

import {
  onchainMetadataRendererAbi,
  rendererPreviewHarnessAbi,
} from "../../src/contracts";
import {
  createDefaultArtConfig,
  toContractArtConfig,
} from "../../src/features/creator-studio/art-config";
import {
  emptyMediaConfig,
  makeRendererPreviewContext,
} from "../../src/features/creator-studio/studio-protocol";

const create2Deployer = getAddress(
  "0x4e59b44847b379578588920cA78FbF26c0B4956C",
);
const interfaceSchema = `0x${"12".repeat(32)}` as Hex;
const salt = `0x${"34".repeat(32)}` as Hex;
const transformedSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect data-transform="creator-image" width="100" height="100" fill="#625bff"/></svg>';
const imageFixture = fileURLToPath(
  new URL(
    "../../public/brand/backstage-membership-hero-v1.png",
    import.meta.url,
  ),
);

function byteLength(value: Hex) {
  return (value.length - 2) / 2;
}

function rendererPackage() {
  const creationBytecode = "0x6000600055" as Hex;
  const runtimeBytecode = "0x6000" as Hex;
  const compiler = {
    solidity: "0.8.36",
    evmVersion: "cancun",
    optimizerEnabled: true,
    optimizerRuns: 200,
  } as const;
  const artifactFingerprint = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes" },
        { type: "bytes" },
        { type: "string" },
        { type: "string" },
        { type: "bool" },
        { type: "uint256" },
        { type: "bytes32" },
      ],
      [
        creationBytecode,
        runtimeBytecode,
        compiler.solidity,
        compiler.evmVersion,
        compiler.optimizerEnabled,
        BigInt(compiler.optimizerRuns),
        interfaceSchema,
      ],
    ),
  );
  const initCodeHash = keccak256(creationBytecode);
  const predictedAddress = getCreate2Address({
    from: create2Deployer,
    salt,
    bytecodeHash: initCodeHash,
  });

  return {
    formatVersion: 1 as const,
    rendererName: "Moonlit Memberships",
    interfaceSchema,
    compiler,
    artifacts: {
      sourceRoot: "/local/moonlit",
      abi: "[]",
      creationBytecode,
      runtimeBytecode,
      artifactFingerprint,
      creationByteLength: byteLength(creationBytecode),
      runtimeByteLength: byteLength(runtimeBytecode),
    },
    deployment: {
      chainId: 46_630,
      create2Deployer,
      salt,
      initCodeHash,
      predictedAddress,
      rawByteLength: byteLength(salt) + byteLength(creationBytecode),
    },
    examples: (
      [
        [1, "active", "none"],
        [1, "expired", "browser-slot"],
        [7, "active", "browser-slot"],
        [7, "expired", "none"],
        [42, "active", "none"],
        [42, "expired", "browser-slot"],
      ] as const
    ).map(([tokenId, state, imageMode], index) => {
      const context = makeRendererPreviewContext({
        tierName: "Moonlit Memberships",
        description: "Representative renderer preview",
        externalURI: "",
        tierIdentity: `0x${"56".repeat(32)}`,
        art: toContractArtConfig(createDefaultArtConfig("stack", 1n)),
        media: emptyMediaConfig,
        tokenId,
        state: state === "active" ? "active" : "afterglow",
        referenceTimestamp: 1_800_000_000n,
      });
      const contextWithoutMedia = JSON.parse(
        JSON.stringify(context, (key, value) => {
          if (key === "nativeMedia") return undefined;
          return typeof value === "bigint" ? value.toString() : value;
        }),
      ) as Record<string, unknown>;
      return {
        requestId: `example-${index + 1}`,
        tokenId,
        state,
        imageMode,
        method: "previewSVG" as const,
        contextWithoutMedia,
        localImageSlot: imageMode === "browser-slot",
      };
    }),
    skill: ".agents/skills/backed-by-fans-renderer/SKILL.md",
    llms: ".agents/skills/backed-by-fans-renderer/llms.txt",
  };
}

async function installPreviewRpc(page: Page) {
  const rendererResult = encodeFunctionResult({
    abi: onchainMetadataRendererAbi,
    functionName: "previewSVG",
    result: transformedSvg,
  });
  const harnessResult = encodeFunctionResult({
    abi: rendererPreviewHarnessAbi,
    functionName: "preview",
    result: rendererResult,
  });

  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    let body: { id?: number; method?: string } | undefined;
    try {
      body = request.postDataJSON() as { id?: number; method?: string };
    } catch {
      return route.continue();
    }
    if (body.method !== "eth_call") return route.continue();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: harnessResult,
      }),
    });
  });
}

async function importPackage(page: Page) {
  await page.getByLabel("Renderer package", { exact: true }).setInputFiles({
    name: "moonlit.renderer.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(rendererPackage())),
  });
}

test("imports, previews, approves, and invalidates browser-held renderer work", async ({
  page,
}) => {
  await installPreviewRpc(page);
  await page.goto("/renderer");
  await importPackage(page);

  await expect(page.getByText("Ready to preview 6 examples.")).toBeVisible();
  await expect(page.getByText("Connect wallet")).not.toBeVisible();
  await page.getByRole("button", { name: "Preview 6 examples" }).click();
  await expect(
    page.getByRole("img", { name: /Membership example/i }),
  ).toHaveCount(6);
  await page.getByRole("button", { name: "Approve renderer" }).click();
  await expect(
    page.getByRole("region", { name: "Deployment summary" }),
  ).toBeVisible();

  await page.getByLabel("Choose JPEG or PNG").setInputFiles({
    name: "creator.jpg",
    mimeType: "image/jpeg",
    buffer: await readFile(imageFixture),
  });
  await expect(page.getByText("creator.jpg")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Deployment summary" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Preview 6 examples" }).click();
  const transformed = page.getByRole("img", { name: /Membership example/i });
  await expect(transformed).toHaveCount(6);
  expect(await transformed.first().getAttribute("src")).toContain(
    "creator-image",
  );
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
      salt: value.deployment.salt,
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

  await page.goto(`/renderer#${fragment}`);
  await expect(
    page.getByText("Connected to local helper.", { exact: true }),
  ).toBeVisible();
  await installPreviewRpc(page);
  await expect(page).toHaveURL(/\/renderer$/);
  await expect(page.getByText("Moonlit Memberships")).toBeVisible();
  await page.getByRole("button", { name: "Preview 6 examples" }).click();
  await expect(
    page.getByRole("img", { name: /Membership example/i }),
  ).toHaveCount(6);
  await expect(page.getByText("Connect wallet")).not.toBeVisible();
});

test("falls back to manual import when loopback is unavailable", async ({
  page,
}) => {
  const fragment = new URLSearchParams({
    helper: "http://127.0.0.1:65534",
    capability: "c".repeat(43),
    sessionId: "unavailable-helper",
  });
  await page.goto(`/renderer#${fragment}`);
  await expect(page).toHaveURL(/\/renderer$/);
  await expect(page.getByRole("status")).toContainText(
    /local renderer helper/i,
  );
  await importPackage(page);
  await expect(page.getByText("Moonlit Memberships")).toBeVisible();
  await expect(page.getByText("Ready to preview 6 examples.")).toBeVisible();
});
