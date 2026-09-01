import { useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { type Address } from "viem";

import {
  globalControlDefinitions,
  imageFitIndex,
  type AnyStudioArtConfig,
  type ImageFit,
} from "@/features/creator-studio/art-config";
import {
  normalizeNumericControlValue,
  NumericControl,
} from "@/features/creator-studio/ArtControls";
import styles from "@/features/creator-studio/CreatorStudio.module.css";
import {
  defaultJpegQuality,
  defaultOutputDimension,
  jpegQualityBounds,
  outputDimensions,
  type OutputDimension,
  type SupportedImageMIME,
} from "@/features/creator-studio/image-processing";
import { creatorMediaDataUrl } from "@/features/creator-studio/media-preview";
import type { StudioMediaDraft } from "@/features/creator-studio/studio-draft";
import type { SurpriseLock } from "@/features/creator-studio/surprise";
import { useWideStudioDisclosure } from "@/features/creator-studio/use-wide-studio-disclosure";
import type { CreatorMediaRecord } from "@/features/protocol/registry-reconciliation";
import { isSameAddress } from "@/lib/address";

export type NativeMediaSettings = {
  dimension: OutputDimension;
  mime: SupportedImageMIME;
  jpegQuality: number;
  pngPurpose: "transparency" | "flat-art";
};

export const defaultNativeMediaSettings: NativeMediaSettings = {
  dimension: defaultOutputDimension,
  mime: "image/jpeg",
  jpegQuality: defaultJpegQuality,
  pngPurpose: "transparency",
};

export type NativeCandidateSummary = {
  objectURL: string;
  byteLength: number;
  mime: SupportedImageMIME;
  dimension: OutputDimension;
  quality: number | null;
};

export type NativeMediaState =
  | { status: "empty" }
  | { status: "processing"; message?: string }
  | { status: "ready"; candidate: NativeCandidateSummary }
  | {
      status: "stored";
      candidate?: NativeCandidateSummary;
      confirmedStore: Address;
    }
  | { status: "error"; message: string };

export type NativeMediaLibraryModel = {
  status: "loading" | "ready" | "error";
  records: readonly CreatorMediaRecord[];
  total: bigint;
  offset: bigint;
  limit: number;
  selectedStore?: Address;
  selectingStore?: Address;
  message?: string;
};

const mediaModes = [
  {
    mode: "none",
    label: "Generated artwork",
    description: "Use the selected art style on its own.",
  },
  {
    mode: "native",
    label: "Add your image",
    description: "Upload a JPEG or PNG.",
  },
] as const;

function StoredMediaImage({
  record,
  alt,
}: {
  record: CreatorMediaRecord;
  alt: string;
}) {
  const source = useMemo(() => creatorMediaDataUrl(record), [record]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={source} />
  );
}

export function MediaEditor({
  media,
  art,
  locks,
  nativeSettings = defaultNativeMediaSettings,
  nativeState = { status: "empty" },
  nativeLibrary,
  onMediaChange,
  onArtChange,
  onToggleLock,
  onNativeSettingsChange,
  onNativeSourceSelected,
  onNextNativeLibraryPage,
  onPreviousNativeLibraryPage,
  onRetryNativeLibrary,
  onSelectNativeStore,
  disabled = false,
}: {
  media: StudioMediaDraft;
  art: AnyStudioArtConfig;
  locks: ReadonlySet<SurpriseLock>;
  nativeSettings?: NativeMediaSettings;
  nativeState?: NativeMediaState;
  nativeLibrary?: NativeMediaLibraryModel;
  onMediaChange: (media: StudioMediaDraft) => void;
  onArtChange: (art: AnyStudioArtConfig) => void;
  onToggleLock: (control: SurpriseLock) => void;
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
}) {
  const { detailsRef, isWide } = useWideStudioDisclosure();
  const [dropActive, setDropActive] = useState(false);
  const selectedStore = nativeLibrary?.selectedStore;
  const localCandidate =
    nativeState.status === "ready" ||
    (nativeState.status === "stored" && nativeState.candidate)
      ? nativeState.candidate
      : undefined;
  const localTileSelected =
    Boolean(localCandidate) || nativeState.status === "processing";
  const hasSelectedImage = Boolean(localCandidate || selectedStore);

  function chooseMode(mode: (typeof mediaModes)[number]["mode"]) {
    if (mode === media.mode) return;
    if (mode === "none") onMediaChange({ mode: "none" });
    if (mode === "native") {
      onMediaChange({ mode: "native", confirmedStore: null });
    }
  }

  function updateMediaControl(
    key: "focalX" | "focalY" | "mediaMix",
    value: number,
  ) {
    onArtChange({
      ...art,
      global: { ...art.global, [key]: value },
      engineControls: { ...art.engineControls },
    } as AnyStudioArtConfig);
  }

  function updateImageFit(event: ChangeEvent<HTMLSelectElement>) {
    onArtChange({
      ...art,
      global: {
        ...art.global,
        imageFit: event.target.value as ImageFit,
      },
      engineControls: { ...art.engineControls },
    } as AnyStudioArtConfig);
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onNativeSourceSelected?.(file, nativeSettings);
    event.target.value = "";
  }

  function dropFile(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDropActive(false);
    if (disabled || nativeState.status === "processing") return;
    const file = event.dataTransfer.files[0];
    if (file) onNativeSourceSelected?.(file, nativeSettings);
  }

  return (
    <details className={styles.mediaSection} ref={detailsRef}>
      <summary
        className={styles.customizationSummary}
        onClick={isWide ? (event) => event.preventDefault() : undefined}
        tabIndex={isWide ? -1 : undefined}
      >
        <span>
          <span className={styles.kicker}>Image</span>
          <h3 id="studio-media-heading">Add an image</h3>
        </span>
        <span className={styles.summaryHint}>
          {media.mode === "native" ? "Image selected" : "Optional"}
        </span>
      </summary>
      <div className={styles.customizationBody}>
        <p className={styles.sectionHint}>
          Generated artwork works on its own. Add an image if you want.
        </p>

        <fieldset className={styles.mediaModeFieldset} disabled={disabled}>
          <legend className="sr-only">Media source</legend>
          <div className={styles.mediaModeGrid}>
            {mediaModes.map((option) => (
              <label
                className={styles.mediaModeChoice}
                data-selected={media.mode === option.mode}
                key={option.mode}
              >
                <input
                  checked={media.mode === option.mode}
                  name="studio-media-mode"
                  onChange={() => chooseMode(option.mode)}
                  type="radio"
                  value={option.mode}
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {media.mode === "native" ? (
          <div className={styles.mediaDetail}>
            <section
              aria-labelledby="studio-native-images-heading"
              className={styles.nativeLibrary}
            >
              <h4 id="studio-native-images-heading">Images</h4>
              <ul className={styles.nativeLibraryList}>
                <li>
                  <label
                    aria-label={
                      localCandidate ? "Replace new image" : "Add new image"
                    }
                    className={styles.nativeAddItem}
                    data-drop-active={dropActive}
                    data-selected={localTileSelected}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      if (!disabled) setDropActive(true);
                    }}
                    onDragLeave={() => setDropActive(false)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={dropFile}
                  >
                    <input
                      accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                      disabled={disabled || nativeState.status === "processing"}
                      onChange={chooseFile}
                      type="file"
                    />
                    {localCandidate ? (
                      // The object URL represents the locally processed image.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt="New image" src={localCandidate.objectURL} />
                    ) : (
                      <span aria-hidden="true" className={styles.addImageMark}>
                        {nativeState.status === "processing" ? "…" : "+"}
                      </span>
                    )}
                    {localCandidate ? (
                      <span
                        aria-hidden="true"
                        className={styles.librarySelected}
                      >
                        ✓
                      </span>
                    ) : null}
                  </label>
                </li>
                {nativeLibrary?.status === "ready"
                  ? nativeLibrary.records.map((record, index) => {
                      const selected =
                        nativeLibrary.selectedStore !== undefined &&
                        isSameAddress(
                          nativeLibrary.selectedStore,
                          record.store,
                        );
                      const selecting =
                        nativeLibrary.selectingStore !== undefined &&
                        isSameAddress(
                          nativeLibrary.selectingStore,
                          record.store,
                        );
                      const itemNumber =
                        nativeLibrary.offset + BigInt(index) + 1n;
                      return (
                        <li key={record.store}>
                          <button
                            aria-label={
                              (selected ? "Selected" : "Select") +
                              " saved image " +
                              itemNumber
                            }
                            aria-pressed={selected}
                            className={styles.nativeLibraryItem}
                            data-selected={selected}
                            disabled={
                              disabled ||
                              Boolean(nativeLibrary.selectingStore) ||
                              !onSelectNativeStore
                            }
                            onClick={() => onSelectNativeStore?.(record.store)}
                            type="button"
                          >
                            <StoredMediaImage alt="" record={record} />
                            {selected ? (
                              <span
                                aria-hidden="true"
                                className={styles.librarySelected}
                              >
                                ✓
                              </span>
                            ) : null}
                            {selecting ? (
                              <span className={styles.libraryLoading}>
                                Loading…
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })
                  : null}
              </ul>

              {nativeLibrary?.status === "loading" ? (
                <p className={styles.libraryStatus} role="status">
                  Loading saved images…
                </p>
              ) : null}
              {nativeLibrary?.status === "error" ? (
                <div className={styles.libraryStatus}>
                  <p className={styles.errorText} role="alert">
                    {nativeLibrary.message ??
                      "Saved images could not be loaded."}
                  </p>
                  <button
                    className={styles.secondaryButton}
                    disabled={disabled || !onRetryNativeLibrary}
                    onClick={onRetryNativeLibrary}
                    type="button"
                  >
                    Try again
                  </button>
                </div>
              ) : null}
              {nativeLibrary?.message && nativeLibrary.status === "ready" ? (
                <p className={styles.errorText} role="alert">
                  {nativeLibrary.message}
                </p>
              ) : null}
              {nativeLibrary?.status === "ready" &&
              nativeLibrary.total > BigInt(nativeLibrary.limit) ? (
                <div
                  aria-label="Saved image pages"
                  className={styles.libraryPagination}
                >
                  <button
                    className={styles.textButton}
                    disabled={
                      disabled ||
                      nativeLibrary.offset === 0n ||
                      !onPreviousNativeLibraryPage
                    }
                    onClick={onPreviousNativeLibraryPage}
                    type="button"
                  >
                    Previous
                  </button>
                  <span>
                    {(nativeLibrary.offset + 1n).toLocaleString("en-US")}-
                    {(
                      nativeLibrary.offset +
                      BigInt(nativeLibrary.records.length)
                    ).toLocaleString("en-US")}{" "}
                    of {nativeLibrary.total.toLocaleString("en-US")}
                  </span>
                  <button
                    className={styles.textButton}
                    disabled={
                      disabled ||
                      nativeLibrary.offset +
                        BigInt(nativeLibrary.records.length) >=
                        nativeLibrary.total ||
                      !onNextNativeLibraryPage
                    }
                    onClick={onNextNativeLibraryPage}
                    type="button"
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </section>

            {localCandidate ? (
              <div className={styles.nativeSettings}>
                <label>
                  Image size
                  <select
                    disabled={disabled}
                    onChange={(event) =>
                      onNativeSettingsChange?.({
                        ...nativeSettings,
                        dimension: Number(
                          event.target.value,
                        ) as OutputDimension,
                      })
                    }
                    value={nativeSettings.dimension}
                  >
                    {outputDimensions.map((dimension) => (
                      <option key={dimension} value={dimension}>
                        {dimension.toLocaleString("en-US")} ×{" "}
                        {dimension.toLocaleString("en-US")}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className={styles.inlineChoices} disabled={disabled}>
                  <legend>File type</legend>
                  <label>
                    <input
                      checked={nativeSettings.mime === "image/jpeg"}
                      name="studio-output-format"
                      onChange={() =>
                        onNativeSettingsChange?.({
                          ...nativeSettings,
                          mime: "image/jpeg",
                        })
                      }
                      type="radio"
                    />
                    JPEG
                  </label>
                  <label>
                    <input
                      checked={nativeSettings.mime === "image/png"}
                      name="studio-output-format"
                      onChange={() =>
                        onNativeSettingsChange?.({
                          ...nativeSettings,
                          mime: "image/png",
                        })
                      }
                      type="radio"
                    />
                    PNG
                  </label>
                </fieldset>
                {nativeSettings.mime === "image/jpeg" ? (
                  <label>
                    JPEG quality
                    <span className={styles.rangePair}>
                      <input
                        disabled={disabled}
                        max={jpegQualityBounds.max}
                        min={jpegQualityBounds.min}
                        onChange={(event) =>
                          onNativeSettingsChange?.({
                            ...nativeSettings,
                            jpegQuality: normalizeNumericControlValue(
                              Number(event.target.value),
                              jpegQualityBounds,
                            ),
                          })
                        }
                        step={jpegQualityBounds.step}
                        type="range"
                        value={nativeSettings.jpegQuality}
                      />
                      <input
                        aria-label="JPEG quality numeric value"
                        disabled={disabled}
                        max={jpegQualityBounds.max}
                        min={jpegQualityBounds.min}
                        onChange={(event) =>
                          onNativeSettingsChange?.({
                            ...nativeSettings,
                            jpegQuality: normalizeNumericControlValue(
                              Number(event.target.value),
                              jpegQualityBounds,
                            ),
                          })
                        }
                        step={jpegQualityBounds.step}
                        type="number"
                        value={nativeSettings.jpegQuality}
                      />
                    </span>
                  </label>
                ) : (
                  <label>
                    Keep PNG for
                    <select
                      disabled={disabled}
                      onChange={(event) =>
                        onNativeSettingsChange?.({
                          ...nativeSettings,
                          pngPurpose: event.target.value as
                            "transparency" | "flat-art",
                        })
                      }
                      value={nativeSettings.pngPurpose}
                    >
                      <option value="transparency">Transparency</option>
                      <option value="flat-art">Flat artwork</option>
                    </select>
                  </label>
                )}
              </div>
            ) : null}

            <div aria-live="polite" className={styles.mediaStatus}>
              {nativeState.status === "processing" ? (
                <p>{nativeState.message ?? "Preparing image..."}</p>
              ) : null}
              {nativeState.status === "error" ? (
                <p className={styles.errorText} role="alert">
                  {nativeState.message}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {hasSelectedImage ? (
          <details className={styles.mediaDirection} open>
            <summary>Image placement</summary>
            <div className={styles.controlStack}>
              <label className={styles.selectControl}>
                Image fit
                <select
                  disabled={disabled}
                  onChange={updateImageFit}
                  value={art.global.imageFit}
                >
                  {Object.keys(imageFitIndex).map((fit) => (
                    <option key={fit} value={fit}>
                      {fit[0].toUpperCase() + fit.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              {(["focalX", "focalY", "mediaMix"] as const).map((key) => {
                const definition = globalControlDefinitions[key];
                return (
                  <NumericControl
                    definition={definition}
                    disabled={disabled}
                    id={`studio-media-${key}`}
                    key={key}
                    lock={`global.${key}`}
                    locked={locks.has(`global.${key}`)}
                    onChange={(value) => updateMediaControl(key, value)}
                    onToggleLock={onToggleLock}
                    value={art.global[key]}
                  />
                );
              })}
            </div>
          </details>
        ) : null}
      </div>
    </details>
  );
}
