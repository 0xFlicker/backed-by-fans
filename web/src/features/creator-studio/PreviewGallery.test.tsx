import { useState } from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  PreviewGallery,
  type ContractSVGPreview,
  type PreviewGalleryModel,
  type PreviewSelection,
} from "@/features/creator-studio/PreviewGallery";

function svgPreview(tokenId: 1 | 7 | 42): ContractSVGPreview {
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#11131a"/><text x="10" y="50">${tokenId}</text></svg>`,
    title: `Membership token ${tokenId}`,
    description: `Exact contract artwork for token ${tokenId}`,
  };
}

function readyModel(): PreviewGalleryModel {
  return {
    focusedSVG: { status: "ready", value: svgPreview(1) },
    thumbnails: {
      1: { status: "ready", value: svgPreview(1) },
      7: { status: "ready", value: svgPreview(7) },
      42: { status: "ready", value: svgPreview(42) },
    },
  };
}

function PreviewHarness({
  model = readyModel(),
}: {
  model?: PreviewGalleryModel;
}) {
  const [selection, setSelection] = useState<PreviewSelection>({
    tokenId: 1,
    state: "active",
  });
  return (
    <PreviewGallery
      model={model}
      onSelectionChange={setSelection}
      selection={selection}
    />
  );
}

describe("PreviewGallery", () => {
  it("shows one canonical contract surface and the representative token set", () => {
    render(<PreviewHarness />);

    expect(
      screen
        .getByLabelText(/Token 1, active artwork preview/i)
        .querySelector("img"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /Token 7/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /Token 42/i })).toBeVisible();
    expect(screen.getAllByRole("img")).toHaveLength(4);
    expect(screen.queryByRole("group", { name: /Surface/i })).toBeNull();
    expect(screen.queryByTitle(/interactive artwork/i)).toBeNull();
  });

  it("selects active or afterglow and token identity independently", async () => {
    const user = userEvent.setup();
    render(<PreviewHarness />);

    await user.click(screen.getByRole("button", { name: "Afterglow" }));
    await user.click(screen.getByRole("button", { name: /Token 42/i }));

    expect(screen.getByRole("button", { name: "Afterglow" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Token 42/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps the retained SVG visible while the exact contract read refreshes", () => {
    const retained = svgPreview(7);
    render(
      <PreviewHarness
        model={{
          focusedSVG: { status: "loading" },
          retainedSVG: retained,
          thumbnails: {
            1: { status: "idle" },
            7: { status: "idle" },
            42: { status: "idle" },
          },
        }}
      />,
    );

    expect(screen.getByAltText(/Membership token 7/i)).toBeVisible();
    expect(screen.getByText(/Rendering artwork/i)).toBeVisible();
  });
});
