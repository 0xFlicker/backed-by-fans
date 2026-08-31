import { useState } from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { RendererRegistryEntry } from "@/contracts/types";
import {
  createDefaultArtConfig,
  type AnyStudioArtConfig,
} from "@/features/creator-studio/art-config";
import {
  CreatorStudio,
  type CreatorStudioProps,
} from "@/features/creator-studio/CreatorStudio";
import type { PreviewGalleryModel } from "@/features/creator-studio/PreviewGallery";
import { foundingSixRendererName } from "@/features/creator-studio/RendererPicker";
import { foundingSixEngineNames } from "@/features/creator-studio/RendererPicker";
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
  version: 1,
  implementation: "0x1111111111111111111111111111111111111111",
  runtimeCodehash: `0x${"11".repeat(32)}`,
  enabled: true,
  name: foundingSixRendererName,
  engineCount: 6,
  engineNames: foundingSixEngineNames,
} satisfies RendererRegistryEntry;

function StudioHarness({
  onKeepComposition,
  renderers = [foundingRenderer],
  initialRendererVersion = 1,
}: Pick<CreatorStudioProps, "onKeepComposition"> & {
  renderers?: readonly RendererRegistryEntry[];
  initialRendererVersion?: number;
} = {}) {
  const [art, setArt] = useState<AnyStudioArtConfig>(
    createDefaultArtConfig("stack", 1n),
  );
  const [media, setMedia] = useState<StudioMediaDraft>({ mode: "none" });
  const [selection, setSelection] = useState<CreatorStudioProps["selection"]>({
    tokenId: 1,
    state: "active",
  });
  const [rendererVersion, setRendererVersion] = useState(
    initialRendererVersion,
  );

  return (
    <CreatorStudio
      art={art}
      media={media}
      onArtChange={setArt}
      onKeepComposition={onKeepComposition}
      onMediaChange={setMedia}
      onRendererChange={setRendererVersion}
      onSelectionChange={setSelection}
      preview={preview}
      renderers={renderers}
      selectedRendererVersion={rendererVersion || undefined}
      selection={selection}
    />
  );
}

describe("CreatorStudio", () => {
  it("presents the rendered artwork as the dominant stage with six descriptive engines", () => {
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
      screen.getAllByRole("radio", {
        name: /Planes|Lights|Ribbon|Petals|Type|Media/i,
      }),
    ).toHaveLength(6);
    expect(screen.getByText(/three identities, one direction/i)).toBeVisible();
    expect(screen.queryByText(/Arweave|IPFS|HTTPS reference/i)).toBeNull();
    expect(
      screen.getByRole("radio", { name: /Add an onchain image/i }),
    ).toBeVisible();
  });

  it("switches engines without losing media and provides a one-step undo", async () => {
    const user = userEvent.setup();
    render(<StudioHarness />);

    await user.click(
      screen.getByRole("radio", { name: /Add an onchain image/i }),
    );
    const stack = screen.getByRole("radio", { name: /STACK/i });
    stack.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByText("CHORUS controls")).toBeVisible();
    expect(screen.getByRole("radio", { name: /CHORUS/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.getByRole("radio", { name: /Add an onchain image/i }),
    ).toBeChecked();

    await user.click(
      screen.getByRole("button", { name: /Undo engine change/i }),
    );
    expect(screen.getByText("STACK controls")).toBeVisible();
    expect(screen.getByRole("radio", { name: /STACK/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.getByRole("radio", { name: /Add an onchain image/i }),
    ).toBeChecked();
  });

  it("requires an explicit compatible renderer choice when multiple are enabled", async () => {
    const user = userEvent.setup();
    render(
      <StudioHarness
        initialRendererVersion={0}
        renderers={[
          foundingRenderer,
          {
            ...foundingRenderer,
            version: 2,
            implementation: "0x2222222222222222222222222222222222222222",
          },
        ]}
      />,
    );

    expect(
      screen.getByText(/Choose a compatible artwork collection/i),
    ).toBeVisible();
    expect(screen.getByRole("radio", { name: /STACK/i })).toBeDisabled();
    const choices = screen.getAllByRole("radio", {
      name: new RegExp(foundingSixRendererName, "i"),
    });
    expect(choices).toHaveLength(2);
    expect(choices[1]).toBeDisabled();
    await user.click(choices[0]);
    expect(screen.getByRole("radio", { name: /STACK/i })).toBeEnabled();
    expect(screen.getByText(/registry edition 1 is pinned/i)).toBeVisible();
  });

  it("honors per-control locks while generating a fresh direction", async () => {
    const user = userEvent.setup();
    render(<StudioHarness />);

    const palette = screen.getByLabelText("Palette numeric value");
    const seedLine = screen.getByText((_, node) =>
      Boolean(node?.tagName === "P" && node.textContent?.startsWith("Seed ")),
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

  it("hands the exact controlled art and media values to final review", async () => {
    const user = userEvent.setup();
    const onKeepComposition = vi.fn();
    render(<StudioHarness onKeepComposition={onKeepComposition} />);

    await user.click(
      screen.getByRole("button", { name: /Keep this direction/i }),
    );
    expect(onKeepComposition).toHaveBeenCalledOnce();
    expect(onKeepComposition).toHaveBeenCalledWith(
      expect.objectContaining({ engine: "stack", collectionSeed: 1n }),
      { mode: "none" },
    );
  });
});
