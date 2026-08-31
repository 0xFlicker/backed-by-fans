"use client";

import { useState } from "react";
import type { Address } from "viem";

import type { RendererRegistryEntry } from "@/contracts/types";

import {
  switchCompositionEngine,
  undoEngineSwitch,
  type AnyStudioArtConfig,
  type ArtEngine,
  type EngineSwitchUndo,
} from "@/features/creator-studio/art-config";
import { ArtControls } from "@/features/creator-studio/ArtControls";
import styles from "@/features/creator-studio/CreatorStudio.module.css";
import {
  EnginePicker,
  engineDetails,
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
import { RendererPicker } from "@/features/creator-studio/RendererPicker";
import type { StudioMediaDraft } from "@/features/creator-studio/studio-draft";
import {
  surpriseArtConfig,
  type RandomValuesSource,
  type SurpriseLock,
} from "@/features/creator-studio/surprise";

export type CreatorStudioProps = {
  art: AnyStudioArtConfig;
  media: StudioMediaDraft;
  selection: PreviewSelection;
  preview: PreviewGalleryModel;
  renderers: readonly RendererRegistryEntry[];
  selectedRendererVersion?: number;
  onArtChange: (art: AnyStudioArtConfig) => void;
  onMediaChange: (media: StudioMediaDraft) => void;
  onSelectionChange: (selection: PreviewSelection) => void;
  onRendererChange: (version: number) => void;
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
  renderers,
  selectedRendererVersion,
  onArtChange,
  onMediaChange,
  onSelectionChange,
  onRendererChange,
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
  const [engineUndo, setEngineUndo] = useState<EngineSwitchUndo | undefined>();
  const [studioAnnouncement, setStudioAnnouncement] =
    useState("STACK selected.");
  const toolsDisabled = disabled || selectedRendererVersion === undefined;

  function toggleLock(control: SurpriseLock) {
    setLocks((current) => {
      const next = new Set(current);
      if (next.has(control)) next.delete(control);
      else next.add(control);
      return next;
    });
  }

  function changeEngine(engine: ArtEngine) {
    if (engine === art.engine) return;
    const switched = switchCompositionEngine({ art, media }, engine);
    setEngineUndo(switched.undo);
    onArtChange(switched.composition.art);
    setStudioAnnouncement(`${engineDetails[engine].label} selected.`);
  }

  function undoEngine() {
    if (!engineUndo) return;
    const restored = undoEngineSwitch({ art, media }, engineUndo);
    onArtChange(restored.art);
    setEngineUndo(undefined);
    setStudioAnnouncement(
      `${engineDetails[restored.art.engine].label} restored.`,
    );
  }

  function surprise() {
    const next = surpriseArtConfig(
      art,
      locks,
      randomSource,
    ) as AnyStudioArtConfig;
    onArtChange(next);
    setEngineUndo(undefined);
    setStudioAnnouncement(`New ${engineDetails[next.engine].label} direction.`);
  }

  function changeRenderer(version: number) {
    const renderer = renderers.find((entry) => entry.version === version);
    if (!renderer) return;
    onRendererChange(version);
    setEngineUndo(undefined);
    setStudioAnnouncement(`${renderer.name ?? "Artwork collection"} selected.`);
  }

  return (
    <section
      aria-labelledby="creator-studio-heading"
      className={styles.studio}
      data-creator-studio
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
            disabled={toolsDisabled}
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
                disabled={toolsDisabled}
                onClick={surprise}
                type="button"
              >
                <span aria-hidden="true">✦</span> Surprise me
              </button>
              {engineUndo ? (
                <button
                  className={styles.undoButton}
                  disabled={toolsDisabled}
                  onClick={undoEngine}
                  type="button"
                >
                  Undo style change
                </button>
              ) : null}
            </div>
          </div>

          <RendererPicker
            disabled={disabled}
            onChange={changeRenderer}
            renderers={renderers}
            selectedVersion={selectedRendererVersion}
          />
          <EnginePicker
            disabled={toolsDisabled}
            onChange={changeEngine}
            value={art.engine}
          />
        </aside>

        <div className={styles.customizationGrid}>
          <ArtControls
            art={art}
            disabled={toolsDisabled}
            locks={locks}
            onChange={onArtChange}
            onToggleLock={toggleLock}
          />
          <MediaEditor
            art={art}
            disabled={toolsDisabled}
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
