"use client";

import { useState } from "react";
import type { Address } from "viem";

import {
  switchCompositionEngine,
  undoEngineSwitch,
  type AnyStudioArtConfig,
  type EngineSwitchUndo,
} from "@/features/creator-studio/art-config";
import { ArtControls } from "@/features/creator-studio/ArtControls";
import styles from "@/features/creator-studio/CreatorStudio.module.css";
import {
  artEngineForManifestName,
  EnginePicker,
  type ArtStyleSelection,
  type CustomRendererState,
} from "@/features/creator-studio/EnginePicker";
import {
  MediaEditor,
  type NativeMediaLibraryModel,
  type NativeMediaSettings,
  type NativeMediaState,
} from "@/features/creator-studio/MediaEditor";
import {
  PreviewGallery,
  type PreviewGalleryModel,
  type PreviewSelection,
} from "@/features/creator-studio/PreviewGallery";
import type { RendererAddressResolution } from "@/features/creator-studio/renderer-address";
import type { StudioMediaDraft } from "@/features/creator-studio/studio-draft";
import {
  surpriseArtConfig,
  type RandomValuesSource,
  type SurpriseLock,
} from "@/features/creator-studio/surprise";
import { isSameAddress } from "@/lib/address";

export type StudioRenderer = Pick<
  RendererAddressResolution,
  "address" | "name" | "engines"
>;

export type RendererChoice = "original" | "created" | "custom";

export type CreatorStudioProps = {
  art: AnyStudioArtConfig;
  media: StudioMediaDraft;
  selection: PreviewSelection;
  preview: PreviewGalleryModel;
  renderer?: StudioRenderer;
  rendererChoice: RendererChoice;
  createdRenderers: readonly StudioRenderer[];
  styleEngines: readonly string[];
  customRendererAddress: string;
  customRendererState: CustomRendererState;
  selectedEngine: number;
  onArtChange: (art: AnyStudioArtConfig) => void;
  onEngineChange: (engine: number) => void;
  onRendererChoiceChange: (choice: RendererChoice) => void;
  onCreatedRendererChange: (renderer: StudioRenderer) => void;
  onCustomRendererAddressChange: (address: string) => void;
  onMediaChange: (media: StudioMediaDraft) => void;
  onSelectionChange: (selection: PreviewSelection) => void;
  onRefreshPreviews?: () => void;
  onRetryPreview?: () => void;
  nativeSettings?: NativeMediaSettings;
  nativeState?: NativeMediaState;
  nativeLibrary?: NativeMediaLibraryModel;
  onNativeSettingsChange?: (settings: NativeMediaSettings) => void;
  onNativeSourceSelected?: (
    source: Blob,
    settings: NativeMediaSettings,
  ) => void;
  onNextNativeLibraryPage?: () => void;
  onPreviousNativeLibraryPage?: () => void;
  onRetryNativeLibrary?: () => void;
  onSelectNativeStore?: (store: Address) => void;
  disabled?: boolean;
  randomSource?: RandomValuesSource;
};

export function CreatorStudio({
  art,
  media,
  selection,
  preview,
  renderer,
  rendererChoice,
  createdRenderers,
  styleEngines,
  customRendererAddress,
  customRendererState,
  selectedEngine,
  onArtChange,
  onEngineChange,
  onRendererChoiceChange,
  onCreatedRendererChange,
  onCustomRendererAddressChange,
  onMediaChange,
  onSelectionChange,
  onRefreshPreviews,
  onRetryPreview,
  nativeSettings,
  nativeState,
  nativeLibrary,
  onNativeSettingsChange,
  onNativeSourceSelected,
  onNextNativeLibraryPage,
  onPreviousNativeLibraryPage,
  onRetryNativeLibrary,
  onSelectNativeStore,
  disabled = false,
  randomSource,
}: CreatorStudioProps) {
  const [locks, setLocks] = useState<ReadonlySet<SurpriseLock>>(new Set());
  const [engineUndo, setEngineUndo] = useState<
    | {
        rendererAddress: Address;
        previousEngine: number;
        art?: EngineSwitchUndo;
      }
    | undefined
  >();
  const [studioAnnouncement, setStudioAnnouncement] =
    useState("Art Studio ready.");
  const previewDisabled = disabled || renderer === undefined;
  const selectedEngineName =
    rendererChoice === "original" ? styleEngines[selectedEngine] : undefined;
  const selectedArtEngine = artEngineForManifestName(selectedEngineName);
  const artToolsAvailable =
    rendererChoice === "custom" || selectedArtEngine === art.engine;
  const canUndoEngine = Boolean(
    engineUndo &&
    renderer &&
    rendererChoice === "original" &&
    isSameAddress(engineUndo.rendererAddress, renderer.address),
  );

  function toggleLock(control: SurpriseLock) {
    setLocks((current) => {
      const next = new Set(current);
      if (next.has(control)) next.delete(control);
      else next.add(control);
      return next;
    });
  }

  function changeStyle(selection: ArtStyleSelection) {
    if (selection === "custom") {
      setEngineUndo(undefined);
      onRendererChoiceChange("custom");
      setStudioAnnouncement("Custom renderer selected.");
      return;
    }

    if (typeof selection === "string") {
      const address = selection.slice("created:".length) as Address;
      const nextRenderer = createdRenderers.find((candidate) =>
        isSameAddress(candidate.address, address),
      );
      if (!nextRenderer) return;
      setEngineUndo(undefined);
      onRendererChoiceChange("created");
      onCreatedRendererChange(nextRenderer);
      onEngineChange(0);
      setStudioAnnouncement(`${nextRenderer.name} selected.`);
      return;
    }

    const engineName = styleEngines[selection];
    if (!engineName) return;
    if (rendererChoice === "original" && selection === selectedEngine) return;
    const nextArtEngine = artEngineForManifestName(engineName);
    let artUndo: EngineSwitchUndo | undefined;
    if (nextArtEngine && nextArtEngine !== art.engine) {
      const switched = switchCompositionEngine({ art, media }, nextArtEngine);
      artUndo = switched.undo;
      onArtChange(switched.composition.art);
    }
    setEngineUndo(
      renderer
        ? {
            rendererAddress: renderer.address,
            previousEngine: selectedEngine,
            art: artUndo,
          }
        : undefined,
    );
    onRendererChoiceChange("original");
    onEngineChange(selection);
    setStudioAnnouncement(`${engineName} selected.`);
  }

  function undoEngine() {
    if (
      !engineUndo ||
      !renderer ||
      !isSameAddress(engineUndo.rendererAddress, renderer.address)
    ) {
      return;
    }
    if (engineUndo.art) {
      const restored = undoEngineSwitch({ art, media }, engineUndo.art);
      onArtChange(restored.art);
    }
    onEngineChange(engineUndo.previousEngine);
    const restoredName = styleEngines[engineUndo.previousEngine];
    setEngineUndo(undefined);
    setStudioAnnouncement(`${restoredName ?? "Previous style"} restored.`);
  }

  function surprise() {
    const next = surpriseArtConfig(
      art,
      locks,
      randomSource,
    ) as AnyStudioArtConfig;
    onArtChange(next);
    setEngineUndo(undefined);
    setStudioAnnouncement(
      rendererChoice === "custom"
        ? "New custom direction."
        : `New ${selectedEngineName} direction.`,
    );
  }

  return (
    <section
      aria-labelledby="creator-studio-heading"
      className={styles.studio}
      data-creator-studio
      data-renderer-address={renderer?.address}
    >
      <header className={styles.studioHeader}>
        <div>
          <h1 className="font-display" id="creator-studio-heading">
            Make the membership unmistakably yours.
          </h1>
        </div>
        <p>Choose a style, preview it, and fine-tune only what matters.</p>
      </header>

      <div className={styles.workbench}>
        <div className={styles.previewColumn}>
          <PreviewGallery
            disabled={previewDisabled}
            model={{
              ...preview,
              announcement: preview.announcement ?? studioAnnouncement,
            }}
            onRefreshSet={onRefreshPreviews}
            onRetryFocused={onRetryPreview}
            onSelectionChange={onSelectionChange}
            selection={selection}
          />
        </div>

        <aside aria-label="Art direction tools" className={styles.toolColumn}>
          <div className={styles.surpriseBar}>
            <div>
              <strong>Find a direction</strong>
            </div>
            <div className={styles.surpriseActions}>
              <button
                className={styles.surpriseButton}
                disabled={disabled || !artToolsAvailable}
                onClick={surprise}
                type="button"
              >
                <span aria-hidden="true">✦</span> Surprise me
              </button>
              {canUndoEngine ? (
                <button
                  className={styles.undoButton}
                  disabled={disabled}
                  onClick={undoEngine}
                  type="button"
                >
                  Undo style change
                </button>
              ) : null}
            </div>
          </div>

          <EnginePicker
            customAddress={customRendererAddress}
            customState={customRendererState}
            createdRenderers={createdRenderers}
            disabled={disabled}
            engines={styleEngines}
            onChange={changeStyle}
            onCustomAddressChange={onCustomRendererAddressChange}
            value={
              rendererChoice === "custom"
                ? "custom"
                : rendererChoice === "created" && renderer
                  ? `created:${renderer.address}`
                  : selectedEngine
            }
          />
        </aside>

        <div className={styles.customizationGrid}>
          {artToolsAvailable ? (
            <ArtControls
              art={art}
              disabled={disabled}
              locks={locks}
              onChange={onArtChange}
              onToggleLock={toggleLock}
            />
          ) : null}
          <MediaEditor
            art={art}
            disabled={disabled}
            locks={locks}
            media={media}
            nativeLibrary={nativeLibrary}
            nativeSettings={nativeSettings}
            nativeState={nativeState}
            onArtChange={onArtChange}
            onMediaChange={onMediaChange}
            onNextNativeLibraryPage={onNextNativeLibraryPage}
            onNativeSourceSelected={onNativeSourceSelected}
            onNativeSettingsChange={onNativeSettingsChange}
            onPreviousNativeLibraryPage={onPreviousNativeLibraryPage}
            onRetryNativeLibrary={onRetryNativeLibrary}
            onSelectNativeStore={onSelectNativeStore}
            onToggleLock={toggleLock}
          />
        </div>
      </div>

      <p aria-live="polite" className={styles.studioAnnouncement} role="status">
        {studioAnnouncement}
      </p>
    </section>
  );
}
