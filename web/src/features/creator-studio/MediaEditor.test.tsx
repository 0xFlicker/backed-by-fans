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
  const presentedNativeLibrary = nativeLibrary
    ? {
        ...nativeLibrary,
        selectedStore:
          media.mode === "native" ? nativeLibrary.selectedStore : undefined,
      }
    : undefined;
  return (
    <MediaEditor
      art={art}
      locks={new Set()}
      media={media}
      nativeLibrary={presentedNativeLibrary}
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
  it("starts collapsed and shows the image tray without a mode chooser", async () => {
    const user = userEvent.setup();
    render(<MediaHarness />);

    expect(
      screen.getByText("Add an image").closest("details"),
    ).not.toHaveAttribute("open");
    expect(
      screen.queryByRole("radio", { name: /Generated artwork/i }),
    ).toBeNull();
    expect(screen.queryByRole("radio", { name: /Add your image/i })).toBeNull();

    await openMediaControls(user);

    expect(screen.getByRole("heading", { name: "Images" })).toBeVisible();
    expect(screen.getByLabelText("Add new image")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Using generated artwork" }),
    ).toBeDisabled();
    expect(screen.queryByText(/Arweave|IPFS|HTTPS reference/i)).toBeNull();
  });

  it("passes an explicitly selected file to the processing boundary", async () => {
    const user = userEvent.setup();
    const onNativeSourceSelected = vi.fn();
    render(<MediaHarness onNativeSourceSelected={onNativeSourceSelected} />);

    await openMediaControls(user);
    const file = new File([new Uint8Array([137, 80, 78, 71])], "stage.png", {
      type: "image/png",
    });
    await user.upload(screen.getByLabelText("Add new image"), file);

    expect(onNativeSourceSelected).toHaveBeenCalledWith(
      file,
      defaultNativeMediaSettings,
    );
    expect(screen.queryByLabelText("Image size")).not.toBeInTheDocument();
  });

  it("shows output settings only after a new image is prepared", async () => {
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

    const outputSize = screen.getByLabelText("Image size");
    expect(outputSize).toHaveValue("512");
    expect(
      Array.from(
        outputSize.querySelectorAll("option"),
        (option) => option.textContent,
      ),
    ).toEqual(["256 × 256", "384 × 384", "512 × 512"]);
    expect(screen.getByAltText("New image")).toBeVisible();
    expect(screen.getByText(/Image placement/i)).toBeVisible();
  });

  it("accepts an explicit drag and drop on the add tile", async () => {
    const user = userEvent.setup();
    const onNativeSourceSelected = vi.fn();
    render(<MediaHarness onNativeSourceSelected={onNativeSourceSelected} />);
    await openMediaControls(user);
    const file = new File([new Uint8Array([137, 80, 78, 71])], "drop.png", {
      type: "image/png",
    });
    const addTile = screen.getByLabelText("Add new image").closest("label")!;
    fireEvent.drop(addTile, {
      dataTransfer: { files: [file] },
    });

    expect(onNativeSourceSelected).toHaveBeenCalledWith(
      file,
      defaultNativeMediaSettings,
    );
  });

  it("does not expose a paste target", async () => {
    const user = userEvent.setup();
    render(<MediaHarness />);
    await openMediaControls(user);

    expect(
      screen.queryByLabelText("Paste an image from clipboard"),
    ).not.toBeInTheDocument();
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

    expect(screen.getByAltText("New image")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Allow/i })).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Use generated artwork" }),
    );
    expect(screen.queryByAltText("New image")).not.toBeInTheDocument();
    expect(screen.queryByText(/Image placement/i)).not.toBeInTheDocument();
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
          selectedStore: store,
        }}
        onNextNativeLibraryPage={onNextNativeLibraryPage}
        onSelectNativeStore={onSelectNativeStore}
      />,
    );
    await openMediaControls(user);

    expect(
      screen.getByRole("heading", {
        name: /^images$/i,
      }),
    ).toBeVisible();
    expect(screen.queryByText("8 saved")).toBeNull();
    expect(screen.queryByText(store)).toBeNull();
    const savedImage = screen.getByRole("button", {
      name: "Selected saved image 1",
    });
    expect(savedImage.querySelector("img")).toBeVisible();
    expect(screen.queryByLabelText("Image size")).not.toBeInTheDocument();
    expect(screen.getByText(/Image placement/i)).toBeVisible();
    await user.click(savedImage);
    expect(onSelectNativeStore).not.toHaveBeenCalled();
    const availableImage = screen.getByRole("button", {
      name: "Select saved image 1",
    });
    expect(availableImage).toHaveAttribute("aria-pressed", "false");
    await user.click(availableImage);
    expect(onSelectNativeStore).toHaveBeenCalledWith(store);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onNextNativeLibraryPage).toHaveBeenCalledOnce();
  });

  it("shows saved images while generated artwork is active", async () => {
    const user = userEvent.setup();
    const store = "0x1111111111111111111111111111111111111111";
    render(
      <MediaHarness
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
          total: 1n,
          offset: 0n,
          limit: 6,
        }}
      />,
    );

    await openMediaControls(user);

    expect(
      screen.getByRole("button", { name: "Select saved image 1" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Using generated artwork" }),
    ).toBeDisabled();
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
