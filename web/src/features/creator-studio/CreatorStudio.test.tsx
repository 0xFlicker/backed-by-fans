import { useState } from "react";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  createDefaultArtConfig,
  type AnyStudioArtConfig,
} from "@/features/creator-studio/art-config";
import {
  CreatorStudio,
  type CreatorStudioProps,
  type StudioRenderer,
} from "@/features/creator-studio/CreatorStudio";
import type { PreviewGalleryModel } from "@/features/creator-studio/PreviewGallery";
import type { RendererAddressResolution } from "@/features/creator-studio/renderer-address";
import type { StudioMediaDraft } from "@/features/creator-studio/studio-draft";

const preview: PreviewGalleryModel = {
  focusedSVG: {
    status: "ready",
    value: {
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#625bff"/></svg>',
      title: "Membership token 1",
      description: "Exact contract artwork",
    },
  },
  thumbnails: {
    1: { status: "idle" },
    7: { status: "idle" },
    42: { status: "idle" },
  },
};

const foundingRenderer = {
  chainId: 46_630,
  address: "0x1111111111111111111111111111111111111111",
  capturedBlock: 123n,
  runtimeCodeHash: `0x${"11".repeat(32)}`,
  schema: `0x${"22".repeat(32)}`,
  name: "BACKED BY FANS / FOUNDING SIX",
  engines: ["STACK", "CHORUS", "LOOM", "BLOOM", "MARQUEE", "AFTERIMAGE"],
} satisfies RendererAddressResolution;

const customRenderer = {
  ...foundingRenderer,
  address: "0x2222222222222222222222222222222222222222",
  name: "MOONLIT MEMBERSHIPS",
  engines: ["AURORA", "TIDELINE"],
} satisfies RendererAddressResolution;

function StudioHarness({
  renderer = foundingRenderer,
  rendererLibrary = [],
  initialEngine = 0,
  initialRendererChoice = "original",
}: {
  renderer?: RendererAddressResolution | null;
  rendererLibrary?: readonly StudioRenderer[];
  initialEngine?: number;
  initialRendererChoice?: CreatorStudioProps["rendererChoice"];
} = {}) {
  const [art, setArt] = useState<AnyStudioArtConfig>(
    createDefaultArtConfig("stack", 1n),
  );
  const [media, setMedia] = useState<StudioMediaDraft>({ mode: "none" });
  const [selection, setSelection] = useState<CreatorStudioProps["selection"]>({
    tokenId: 1,
    state: "active",
  });
  const [engine, setEngine] = useState(initialEngine);
  const [rendererChoice, setRendererChoice] = useState(initialRendererChoice);
  const [activeRenderer, setActiveRenderer] = useState<
    StudioRenderer | undefined
  >(renderer ?? undefined);
  const [customAddress, setCustomAddress] = useState("");

  return (
    <CreatorStudio
      art={art}
      rendererLibrary={rendererLibrary}
      customRendererAddress={customAddress}
      customRendererState={{ status: "idle" }}
      media={media}
      onArtChange={setArt}
      onCustomRendererAddressChange={setCustomAddress}
      onCreatedRendererChange={setActiveRenderer}
      onEngineChange={setEngine}
      onMediaChange={setMedia}
      onRendererChoiceChange={setRendererChoice}
      onSelectionChange={setSelection}
      preview={preview}
      renderer={activeRenderer}
      rendererChoice={rendererChoice}
      selectedEngine={engine}
      selection={selection}
      styleEngines={foundingRenderer.engines}
    />
  );
}

describe("CreatorStudio", () => {
  it("presents the rendered artwork with six canonical styles and Custom", () => {
    render(<StudioHarness />);

    expect(
      screen.getByRole("heading", {
        name: /Make the membership unmistakably yours/i,
      }),
    ).toBeVisible();
    expect(
      screen.getByLabelText(/Token 1, active artwork preview/i),
    ).toBeVisible();
    expect(
      within(
        screen.getByRole("radiogroup", { name: "Art styles" }),
      ).getAllByRole("radio"),
    ).toHaveLength(7);
    expect(screen.getByRole("radio", { name: /CUSTOM/i })).toBeVisible();
    expect(screen.getByText(/one style, three memberships/i)).toBeVisible();
    expect(screen.queryByText(/Arweave|IPFS|HTTPS reference/i)).toBeNull();
    expect(screen.queryByRole("radio", { name: /Add your image/i })).toBeNull();
  });

  it("puts the connected creator's renderers before the six defaults and Custom", async () => {
    const user = userEvent.setup();
    render(<StudioHarness rendererLibrary={[customRenderer]} />);

    const choices = within(
      screen.getByRole("radiogroup", { name: "Art styles" }),
    ).getAllByRole("radio");
    expect(choices).toHaveLength(8);
    expect(choices[0]).toHaveAccessibleName(/MOONLIT MEMBERSHIPS/i);
    expect(choices[1]).toHaveAccessibleName(/STACK/i);
    expect(choices[7]).toHaveAccessibleName(/CUSTOM/i);

    await user.click(choices[0]);
    expect(choices[0]).toHaveAttribute("aria-checked", "true");
    expect(document.querySelector("[data-creator-studio]")).toHaveAttribute(
      "data-renderer-address",
      customRenderer.address,
    );
    expect(screen.getByText("Customize artwork")).toBeInTheDocument();
    expect(screen.getByText("Add an image")).toBeInTheDocument();
  });

  it("places collapsed artwork and image controls together below the preview", () => {
    render(<StudioHarness />);

    const artwork = screen.getByText("Customize artwork").closest("details");
    const image = screen.getByText("Add an image").closest("details");

    expect(artwork).not.toHaveAttribute("open");
    expect(image).not.toHaveAttribute("open");
    expect(artwork?.parentElement).toBe(image?.parentElement);
  });

  it("keeps the image tray available while switching styles and undoing", async () => {
    const user = userEvent.setup();
    render(<StudioHarness />);

    await user.click(screen.getByText("Add an image").closest("summary")!);
    expect(screen.getByRole("heading", { name: "Images" })).toBeVisible();
    const stack = screen.getByRole("radio", { name: /STACK/i });
    stack.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByText("Style controls")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /CHORUS/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByLabelText("Add new image")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: /Undo style change/i }),
    );
    expect(screen.getByRole("radio", { name: /STACK/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByLabelText("Add new image")).toBeVisible();
  });

  it("keeps Custom inside the canonical style list", async () => {
    const user = userEvent.setup();
    render(
      <StudioHarness
        initialRendererChoice="custom"
        renderer={customRenderer}
      />,
    );

    expect(document.querySelector("[data-creator-studio]")).toHaveAttribute(
      "data-renderer-address",
      customRenderer.address,
    );
    expect(
      within(
        screen.getByRole("radiogroup", { name: "Art styles" }),
      ).getAllByRole("radio"),
    ).toHaveLength(7);
    expect(screen.getByRole("radio", { name: /CUSTOM/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByLabelText("Renderer contract address")).toBeVisible();
    expect(screen.getByText("Customize artwork")).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Renderer contract address"),
      customRenderer.address,
    );
    await user.click(screen.getByRole("radio", { name: /STACK/i }));

    expect(screen.getByRole("radio", { name: /STACK/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.queryByLabelText("Renderer contract address"),
    ).not.toBeInTheDocument();
  });

  it("keeps the canonical style set available while the renderer is unavailable", () => {
    render(<StudioHarness renderer={null} />);

    expect(
      within(
        screen.getByRole("radiogroup", { name: "Art styles" }),
      ).getAllByRole("radio"),
    ).toHaveLength(7);
    expect(screen.getByRole("button", { name: /Surprise me/i })).toBeEnabled();
    expect(screen.getByText("Customize artwork")).toBeInTheDocument();
  });

  it("honors per-control locks while generating a fresh direction", async () => {
    const user = userEvent.setup();
    render(<StudioHarness />);

    await user.click(screen.getByText("Customize artwork").closest("summary")!);
    const palette = screen.getByLabelText("Palette numeric value");
    const seedLine = screen.getByText((_, node) =>
      Boolean(
        node?.tagName === "P" && node.textContent?.startsWith("Direction "),
      ),
    );
    const seedBefore = seedLine.textContent;
    expect(palette).toHaveValue(0);
    await user.click(screen.getByRole("button", { name: "Lock Palette" }));
    await user.click(screen.getByRole("button", { name: /Surprise me/i }));

    expect(palette).toHaveValue(0);
    expect(
      screen.getByRole("button", { name: "Unlock Palette" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(seedLine.textContent).not.toBe(seedBefore);
  });

  it("uses a checkbox for binary artwork controls", async () => {
    const user = userEvent.setup();
    render(<StudioHarness />);

    await user.click(screen.getByText("Customize artwork").closest("summary")!);
    const tierText = screen.getByRole("checkbox", {
      name: "Show tier text",
    });
    expect(tierText).toBeChecked();
    expect(
      screen.queryByLabelText("Show tier text numeric value"),
    ).not.toBeInTheDocument();
    await user.click(tierText);
    expect(tierText).not.toBeChecked();
  });

  it("does not require a separate art-direction confirmation", () => {
    render(<StudioHarness />);

    expect(
      screen.queryByRole("button", { name: /Keep this direction/i }),
    ).not.toBeInTheDocument();
  });
});
