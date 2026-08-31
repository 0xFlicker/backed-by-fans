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
  type RpcMediaConsent,
} from "@/features/creator-studio/MediaEditor";
import type { StudioMediaDraft } from "@/features/creator-studio/studio-draft";

function MediaHarness({
  initialMedia = { mode: "none" },
  rpcConsent = "not-required",
  nativeState,
  onNativeSourceSelected,
  onGrantRpcConsent,
  nativeLibrary,
  onNextNativeLibraryPage,
  onPreviousNativeLibraryPage,
  onRetryNativeLibrary,
  onSelectNativeStore,
}: {
  initialMedia?: StudioMediaDraft;
  rpcConsent?: RpcMediaConsent;
  nativeState?: NativeMediaState;
  onNativeSourceSelected?: (
    source: Blob,
    settings: NativeMediaSettings,
  ) => void;
  onGrantRpcConsent?: () => void;
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
      onGrantRpcConsent={onGrantRpcConsent}
      onMediaChange={setMedia}
      onNextNativeLibraryPage={onNextNativeLibraryPage}
      onNativeSettingsChange={setNativeSettings}
      onNativeSourceSelected={onNativeSourceSelected}
      onPreviousNativeLibraryPage={onPreviousNativeLibraryPage}
      onRetryNativeLibrary={onRetryNativeLibrary}
      onSelectNativeStore={onSelectNativeStore}
      onToggleLock={vi.fn()}
      rpcConsent={rpcConsent}
    />
  );
}

describe("MediaEditor", () => {
  it("offers only generated art or exact Robinhood-onchain image bytes", () => {
    render(<MediaHarness />);

    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(
      screen.getByRole("radio", { name: /Generated onchain art/i }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: /Add an onchain image/i }),
    ).toBeVisible();
    expect(screen.queryByText(/Arweave|IPFS|HTTPS reference/i)).toBeNull();
  });

  it("passes a local file and exact settings to the one processing boundary", async () => {
    const user = userEvent.setup();
    const onNativeSourceSelected = vi.fn();
    render(<MediaHarness onNativeSourceSelected={onNativeSourceSelected} />);

    await user.click(
      screen.getByRole("radio", { name: /Add an onchain image/i }),
    );
    await user.selectOptions(screen.getByLabelText("Output size"), "1024");
    await user.click(screen.getByRole("radio", { name: "PNG" }));
    const file = new File([new Uint8Array([137, 80, 78, 71])], "stage.png", {
      type: "image/png",
    });
    await user.upload(
      screen.getByLabelText("Choose JPEG or PNG from your device"),
      file,
    );

    expect(onNativeSourceSelected).toHaveBeenCalledWith(file, {
      dimension: 1024,
      mime: "image/png",
      jpegQuality: defaultNativeMediaSettings.jpegQuality,
      pngPurpose: "transparency",
    });
    expect(screen.getByText(/Image placement/i)).toBeVisible();
  });

  it("accepts clipboard image bytes without turning them into a reference", async () => {
    const user = userEvent.setup();
    const onNativeSourceSelected = vi.fn();
    render(<MediaHarness onNativeSourceSelected={onNativeSourceSelected} />);
    await user.click(
      screen.getByRole("radio", { name: /Add an onchain image/i }),
    );
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
    expect(screen.getByText(/Clipboard image received/i)).toBeVisible();
  });

  it("rejects clipboard text instead of treating a pasted URL as an image", async () => {
    const user = userEvent.setup();
    const onNativeSourceSelected = vi.fn();
    render(<MediaHarness onNativeSourceSelected={onNativeSourceSelected} />);
    await user.click(
      screen.getByRole("radio", { name: /Add an onchain image/i }),
    );
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

  it("requires honest RPC consent before exact candidate bytes leave the browser", async () => {
    const user = userEvent.setup();
    const onGrantRpcConsent = vi.fn();
    render(
      <MediaHarness
        initialMedia={{ mode: "native", confirmedStore: null }}
        onGrantRpcConsent={onGrantRpcConsent}
        rpcConsent="required"
      />,
    );

    expect(screen.getByText(/Preview privacy checkpoint/i)).toBeVisible();
    expect(screen.getByText(/may be logged by that provider/i)).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: /Allow this candidate/i }),
    );
    expect(onGrantRpcConsent).toHaveBeenCalledOnce();
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

    expect(
      screen.getByRole("heading", {
        name: /reuse an image you already stored/i,
      }),
    ).toBeVisible();
    expect(screen.getByText("8 onchain")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Use 13 kB image/i }));
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

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The registry RPC is unavailable.",
    );
    await user.click(
      screen.getByRole("button", { name: "Retry library read" }),
    );
    expect(onRetryNativeLibrary).toHaveBeenCalledOnce();
  });
});
