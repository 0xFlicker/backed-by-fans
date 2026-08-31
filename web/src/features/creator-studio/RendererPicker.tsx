import type { RendererRegistryEntry } from "@/contracts/types";
import styles from "@/features/creator-studio/CreatorStudio.module.css";

export const foundingSixRendererName = "BACKED BY FANS / FOUNDING SIX";
export const foundingSixEngineNames = [
  "STACK",
  "CHORUS",
  "LOOM",
  "BLOOM",
  "MARQUEE",
  "AFTERIMAGE",
] as const;

export function supportsFoundingSixStudio(entry: RendererRegistryEntry) {
  return (
    entry.enabled &&
    entry.version === 1 &&
    entry.name === foundingSixRendererName &&
    entry.engineCount === foundingSixEngineNames.length &&
    entry.engineNames?.length === foundingSixEngineNames.length &&
    entry.engineNames.every(
      (engineName, index) => engineName === foundingSixEngineNames[index],
    )
  );
}

export function RendererPicker({
  renderers,
  selectedVersion,
  onChange,
  disabled = false,
}: {
  renderers: readonly RendererRegistryEntry[];
  selectedVersion?: number;
  onChange: (version: number) => void;
  disabled?: boolean;
}) {
  const enabled = renderers.filter((renderer) => renderer.enabled);
  const selected = enabled.find(
    (renderer) => renderer.version === selectedVersion,
  );

  return (
    <fieldset className={styles.rendererPicker} disabled={disabled}>
      <legend>Artwork collection</legend>
      <p className={styles.sectionHint}>This choice is permanent.</p>
      <div
        aria-label="Artwork collections"
        className={styles.rendererList}
        role="radiogroup"
      >
        {enabled.map((renderer) => {
          const supported = supportsFoundingSixStudio(renderer);
          const checked = renderer.version === selectedVersion;
          return (
            <button
              aria-checked={checked}
              aria-disabled={!supported || disabled}
              className={styles.rendererChoice}
              disabled={!supported || disabled}
              key={renderer.version}
              onClick={() => onChange(renderer.version)}
              role="radio"
              type="button"
            >
              <span className={styles.rendererEdition}>
                Edition {renderer.version}
              </span>
              <span>
                <strong>{renderer.name ?? "Unnamed artwork collection"}</strong>
                <small>
                  {supported
                    ? "Six creator-controlled art styles."
                    : "This collection is not available in this version of Art Studio."}
                </small>
              </span>
            </button>
          );
        })}
      </div>
      {enabled.length === 0 ? (
        <p className={styles.rendererAlert} role="alert">
          No artwork collection is available on this network.
        </p>
      ) : !selected ? (
        <p className={styles.rendererAlert} role="alert">
          Choose an artwork collection to continue.
        </p>
      ) : (
        <p className={styles.rendererStatus} role="status">
          {selected.name} selected.
        </p>
      )}
    </fieldset>
  );
}
