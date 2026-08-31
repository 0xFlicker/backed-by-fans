import { useState } from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Address, Hex } from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  createDefaultArtConfig,
  type AnyStudioArtConfig,
} from "@/features/creator-studio/art-config";
import {
  defaultNativeMediaSettings,
  MediaEditor,
  type NativeMediaLibraryModel,
  type NativeMediaSettings,
  type NativeMediaState,
} from "@/features/creator-studio/MediaEditor";
import type { StudioMediaDraft } from "@/features/creator-studio/studio-draft";

function MediaHarness({
  initialMedia = { mode: "none" },
  nativeState,
  onNativeSourceSelected,
  nativeLibrary,
  onNextNativeLibraryPage,
  onPreviousNativeLibraryPage,
  onRetryNativeLibrary,
  onSelectNativeStore,
}: {
  initialMedia?: StudioMediaDraft;
  nativeState?: NativeMediaState;
  onNativeSourceSelected?: (
    source: Blob,
    settings: NativeMediaSettings,
  ) => void;
  nativeLibrary?: NativeMediaLibraryModel;
  onNextNativeLibraryPage?: () => void;
  onPreviousNativeLibraryPage?: () => void;
  onRetryNativeLibrary?: () => void;
  onSelectNativeStore?: (store: Address) => void;
}) {
  const [art, setArt] = useState<AnyStudioArtConfig>(
    createDefaultArtConfig("stack", 11n),
  );
  const [media, setMedia] = useState<StudioMediaDraft>(initialMedia);
  const [nativeSettings, setNativeSettings] = useState(
    defaultNativeMediaSettings,
  );
  return (
    <MediaEditor
      art={art}
      locks={new Set()}
      media={media}
      nativeLibrary={nativeLibrary}
      nativeSettings={nativeSettings}
      nativeState={nativeState}
      onArtChange={setArt}
      onMediaChange={setMedia}
      onNextNativeLibraryPage={onNextNativeLibraryPage}
      onNativeSettingsChange={setNativeSettings}
      onNativeSourceSelected={onNativeSourceSelected}
      onPreviousNativeLibraryPage={onPreviousNativeLibraryPage}
      onRetryNativeLibrary={onRetryNativeLibrary}
      onSelectNativeStore={onSelectNativeStore}
      onToggleLock={vi.fn()}
    />
  );
}

async function openMediaControls(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText("Add an image").closest("summary")!);
}

describe("MediaEditor", () => {
  it("starts collapsed and offers generated artwork or an uploaded image", () => {
    render(<MediaHarness />);

    expect(
      screen.getByText("Add an image").closest("details"),
    ).not.toHaveAttribute("open");
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(
      screen.getByRole("radio", { name: /Generated artwork/i }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: /Add your image/i }),
    ).not.toBeVisible();
    expect(screen.queryByText(/Arweave|IPFS|HTTPS reference/i)).toBeNull();
  });

  it("passes a local file and exact settings to the one processing boundary", async () => {
    const user = userEvent.setup();
    const onNativeSourceSelected = vi.fn();
    render(<MediaHarness onNativeSourceSelected={onNativeSourceSelected} />);

    await openMediaControls(user);
    await user.click(screen.getByRole("radio", { name: /Add your image/i }));
    await user.selectOptions(screen.getByLabelText("Image size"), "384");
    await user.click(screen.getByRole("radio", { name: "PNG" }));
    const file = new File([new Uint8Array([137, 80, 78, 71])], "stage.png", {
      type: "image/png",
    });
    await user.upload(screen.getByLabelText("Choose image"), file);

    expect(onNativeSourceSelected).toHaveBeenCalledWith(file, {
      dimension: 384,
      mime: "image/png",
      jpegQuality: defaultNativeMediaSettings.jpegQuality,
      pngPurpose: "transparency",
    });
    expect(screen.getByText(/Image placement/i)).toBeVisible();
  });

  it("offers byte-conscious square output sizes capped at 512 pixels", async () => {
    const user = userEvent.setup();
    render(<MediaHarness />);

    await openMediaControls(user);
    await user.click(screen.getByRole("radio", { name: /Add your image/i }));

    const outputSize = screen.getByLabelText("Image size");
    expect(outputSize).toHaveValue("512");
    expect(
      Array.from(
        outputSize.querySelectorAll("option"),
        (option) => option.textContent,
      ),
    ).toEqual(["256 × 256", "384 × 384", "512 × 512"]);
  });

  it("accepts clipboard image bytes without turning them into a reference", async () => {
    const user = userEvent.setup();
    const onNativeSourceSelected = vi.fn();
    render(<MediaHarness onNativeSourceSelected={onNativeSourceSelected} />);
    await openMediaControls(user);
    await user.click(screen.getByRole("radio", { name: /Add your image/i }));
    const file = new File([new Uint8Array([137, 80, 78, 71])], "paste.png", {
      type: "image/png",
    });

    fireEvent.paste(screen.getByLabelText("Paste an image from clipboard"), {
      clipboardData: {
        getData: () => "",
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => file,
          },
        ],
      },
    });

    expect(onNativeSourceSelected).toHaveBeenCalledWith(
      file,
      defaultNativeMediaSettings,
    );
    expect(screen.getByText(/Image received/i)).toBeVisible();
  });

  it("rejects clipboard text instead of treating a pasted URL as an image", async () => {
    const user = userEvent.setup();
    const onNativeSourceSelected = vi.fn();
    render(<MediaHarness onNativeSourceSelected={onNativeSourceSelected} />);
    await openMediaControls(user);
    await user.click(screen.getByRole("radio", { name: /Add your image/i }));
    const pasteTarget = screen.getByLabelText("Paste an image from clipboard");
    fireEvent.paste(pasteTarget, {
      clipboardData: {
        getData: () => "https://media.example.com/member.png?edition=7",
        items: [],
      },
    });

    expect(onNativeSourceSelected).not.toHaveBeenCalled();
    expect(
      screen.getByText("Paste the image itself, not text or a link."),
    ).toBeVisible();
  });

  it("does not require another approval after preparing an image", async () => {
    const user = userEvent.setup();
    render(
      <MediaHarness
        initialMedia={{ mode: "native", confirmedStore: null }}
        nativeState={{
          status: "ready",
          candidate: {
            objectURL: "blob:creator-image",
            byteLength: 1_024,
            mime: "image/jpeg",
            dimension: 512,
            quality: 0.82,
          },
        }}
      />,
    );
    await openMediaControls(user);

    expect(
      screen.getByAltText("Processed creator media candidate"),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /Allow/i })).toBeNull();
  });

  it("renders, selects, and pages the connected creator's bounded onchain media", async () => {
    const user = userEvent.setup();
    const onSelectNativeStore = vi.fn();
    const onNextNativeLibraryPage = vi.fn();
    const store = "0x1111111111111111111111111111111111111111";
    render(
      <MediaHarness
        initialMedia={{ mode: "native", confirmedStore: null }}
        nativeLibrary={{
          status: "ready",
          records: [
            {
              store,
              creator: "0x2222222222222222222222222222222222222222",
              mime: 2,
              length: 12_500,
              digest: ("0x" + "03".repeat(32)) as Hex,
              runtimeCodehash: ("0x" + "04".repeat(32)) as Hex,
              payload: "0x89504e47",
            },
          ],
          total: 8n,
          offset: 0n,
          limit: 6,
        }}
        onNextNativeLibraryPage={onNextNativeLibraryPage}
        onSelectNativeStore={onSelectNativeStore}
      />,
    );
    await openMediaControls(user);

    expect(
      screen.getByRole("heading", {
        name: /saved images/i,
      }),
    ).toBeVisible();
    expect(screen.queryByText("8 saved")).toBeNull();
    expect(screen.queryByText(store)).toBeNull();
    const savedImage = screen.getByRole("button", {
      name: "Select saved image 1",
    });
    expect(savedImage.querySelector("img")).toBeVisible();
    await user.click(savedImage);
    expect(onSelectNativeStore).toHaveBeenCalledWith(store);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onNextNativeLibraryPage).toHaveBeenCalledOnce();
  });

  it("makes a failed onchain library read explicitly retryable", async () => {
    const user = userEvent.setup();
    const onRetryNativeLibrary = vi.fn();
    render(
      <MediaHarness
        initialMedia={{ mode: "native", confirmedStore: null }}
        nativeLibrary={{
          status: "error",
          records: [],
          total: 0n,
          offset: 0n,
          limit: 6,
          message: "The registry RPC is unavailable.",
        }}
        onRetryNativeLibrary={onRetryNativeLibrary}
      />,
    );
    await openMediaControls(user);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The registry RPC is unavailable.",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetryNativeLibrary).toHaveBeenCalledOnce();
  });
});
