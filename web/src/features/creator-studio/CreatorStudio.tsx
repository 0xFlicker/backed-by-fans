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
  onKeepComposition?: (
    art: AnyStudioArtConfig,
    media: StudioMediaDraft,
  ) => void;
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
  onKeepComposition,
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
  const [studioAnnouncement, setStudioAnnouncement] = useState(
    "STACK is ready to shape.",
  );
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
    setStudioAnnouncement(
      `${engineDetails[engine].label} selected. Global direction and media are preserved.`,
    );
  }

  function undoEngine() {
    if (!engineUndo) return;
    const restored = undoEngineSwitch({ art, media }, engineUndo);
    onArtChange(restored.art);
    setEngineUndo(undefined);
    setStudioAnnouncement(
      `${engineDetails[restored.art.engine].label} composition restored.`,
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
    setStudioAnnouncement(
      `A new ${engineDetails[next.engine].label} direction is ready. Locked values stayed in place.`,
    );
  }

  function changeRenderer(version: number) {
    const renderer = renderers.find((entry) => entry.version === version);
    if (!renderer) return;
    onRendererChange(version);
    setEngineUndo(undefined);
    setStudioAnnouncement(
      `${renderer.name ?? "Onchain artwork collection"} selected and pinned to this membership.`,
    );
  }

  function keepComposition() {
    onKeepComposition?.(art, media);
    setEngineUndo(undefined);
    setStudioAnnouncement(
      `${engineDetails[art.engine].label} kept for the final membership review.`,
    );
  }

  return (
    <section aria-labelledby="creator-studio-heading" className={styles.studio}>
      <header className={styles.studioHeader}>
        <div>
          <p className={styles.kicker}>Immutable art direction</p>
          <h1 className="font-display" id="creator-studio-heading">
            Make the membership unmistakably yours.
          </h1>
        </div>
        <p>
          Choose a renderer, tune its character, and inspect the exact onchain
          result before anything becomes permanent.
        </p>
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
              <p className={styles.kicker}>Find the one</p>
              <strong>Reroll freely. Publish only what you keep.</strong>
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
              <button
                className={styles.keepButton}
                disabled={toolsDisabled}
                onClick={keepComposition}
                type="button"
              >
                Keep this direction
              </button>
              {engineUndo ? (
                <button
                  className={styles.undoButton}
                  disabled={toolsDisabled}
                  onClick={undoEngine}
                  type="button"
                >
                  Undo engine change
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
        </aside>
      </div>

      <p aria-live="polite" className={styles.studioAnnouncement} role="status">
        {studioAnnouncement}
      </p>
    </section>
  );
}
