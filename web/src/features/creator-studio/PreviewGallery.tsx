import styles from "@/features/creator-studio/CreatorStudio.module.css";

export const representativeTokenIds = [1, 7, 42] as const;
export type RepresentativeTokenId = (typeof representativeTokenIds)[number];
export type MembershipArtState = "active" | "afterglow";

export type PreviewSelection = {
  tokenId: RepresentativeTokenId;
  state: MembershipArtState;
};

export type ContractSVGPreview = {
  svg: string;
  title: string;
  description: string;
};

export type PreviewResource<Value> =
  | { status: "idle" }
  | { status: "loading"; message?: string }
  | { status: "ready"; value: Value }
  | { status: "error"; message: string };

export type PreviewGalleryModel = {
  focusedSVG: PreviewResource<ContractSVGPreview>;
  retainedSVG?: ContractSVGPreview;
  thumbnails: Record<
    RepresentativeTokenId,
    PreviewResource<ContractSVGPreview>
  >;
  announcement?: string;
};

export function svgPreviewDataURI(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function PreviewImage({
  preview,
  className,
}: {
  preview: ContractSVGPreview;
  className: string;
}) {
  return (
    // The contract data URI must not pass through an image optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={`${preview.title}. ${preview.description}`}
      className={className}
      src={svgPreviewDataURI(preview.svg)}
    />
  );
}

export function PreviewGallery({
  model,
  selection,
  onSelectionChange,
  onRefreshSet,
  onRetryFocused,
  disabled = false,
}: {
  model: PreviewGalleryModel;
  selection: PreviewSelection;
  onSelectionChange: (selection: PreviewSelection) => void;
  onRefreshSet?: () => void;
  onRetryFocused?: () => void;
  disabled?: boolean;
}) {
  const focused =
    model.focusedSVG.status === "ready"
      ? model.focusedSVG.value
      : model.retainedSVG;
  const previewLabel = `Token ${selection.tokenId}, ${selection.state === "active" ? "active" : "afterglow"}`;

  function select(partial: Partial<PreviewSelection>) {
    onSelectionChange({ ...selection, ...partial });
  }

  return (
    <section
      aria-labelledby="art-preview-heading"
      className={styles.previewGallery}
    >
      <div className={styles.previewHeading}>
        <div>
          <p className={styles.stageKicker}>Contract-rendered proof</p>
          <h2 id="art-preview-heading">Your membership artwork</h2>
        </div>
        <button
          className={styles.stageAction}
          disabled={disabled || !onRefreshSet}
          onClick={onRefreshSet}
          type="button"
        >
          Refresh set
        </button>
      </div>

      <div className={styles.previewSelectors}>
        <fieldset disabled={disabled}>
          <legend>Membership state</legend>
          <div className={styles.segmentedControl}>
            {(["active", "afterglow"] as const).map((state) => (
              <button
                aria-pressed={selection.state === state}
                key={state}
                onClick={() => select({ state })}
                type="button"
              >
                {state === "active" ? "Active" : "Afterglow"}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div
        aria-busy={model.focusedSVG.status === "loading"}
        aria-label={`${previewLabel} artwork preview`}
        className={styles.artStage}
        data-state={selection.state}
      >
        <div aria-hidden="true" className={styles.stageIndex}>
          #{String(selection.tokenId).padStart(2, "0")}
        </div>
        {focused ? (
          <PreviewImage className={styles.focusedImage} preview={focused} />
        ) : (
          <div className={styles.previewEmpty}>
            <span aria-hidden="true">
              BBF / {String(selection.tokenId).padStart(2, "0")}
            </span>
            <p>The exact contract preview will appear here.</p>
          </div>
        )}

        {model.focusedSVG.status === "loading" ? (
          <p className={styles.stageStatus} role="status">
            {model.focusedSVG.message ?? "Rendering the exact SVG…"}
          </p>
        ) : null}
        {model.focusedSVG.status === "error" ? (
          <div className={styles.stageError} role="alert">
            <p>{model.focusedSVG.message}</p>
            {onRetryFocused ? (
              <button onClick={onRetryFocused} type="button">
                Retry preview
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={styles.sampleHeading}>
        <div>
          <p className={styles.kicker}>Collection check</p>
          <h3>Three identities, one direction</h3>
        </div>
        <span>{selection.state === "active" ? "Active" : "Afterglow"} set</span>
      </div>
      <div
        aria-label="Representative membership tokens"
        className={styles.tokenStrip}
      >
        {representativeTokenIds.map((tokenId) => {
          const thumbnail = model.thumbnails[tokenId];
          return (
            <button
              aria-pressed={selection.tokenId === tokenId}
              className={styles.tokenSample}
              disabled={disabled}
              key={tokenId}
              onClick={() => select({ tokenId })}
              type="button"
            >
              <span className={styles.tokenLabel}>Token {tokenId}</span>
              {thumbnail.status === "ready" ? (
                <PreviewImage
                  className={styles.thumbnailImage}
                  preview={thumbnail.value}
                />
              ) : (
                <span className={styles.thumbnailEmpty}>
                  {thumbnail.status === "error" ? "Unavailable" : "Rendering…"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p aria-live="polite" className={styles.liveRegion} role="status">
        {model.announcement ?? `${previewLabel} selected.`}
      </p>
    </section>
  );
}
