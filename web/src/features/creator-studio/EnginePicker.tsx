import { useRef, type KeyboardEvent } from "react";

import {
  artEngineNames,
  type ArtEngine,
} from "@/features/creator-studio/art-config";
import styles from "@/features/creator-studio/CreatorStudio.module.css";

const engineDetails: Record<
  ArtEngine,
  { label: string; short: string; description: string }
> = {
  stack: {
    label: "STACK",
    short: "Planes and depth",
    description: "Offset planes, openings, and depth.",
  },
  chorus: {
    label: "CHORUS",
    short: "Lights and orbit",
    description: "Lights gather in orbits and trails.",
  },
  loom: {
    label: "LOOM",
    short: "Ribbon and tension",
    description: "Woven ribbons reveal the image beneath.",
  },
  bloom: {
    label: "BLOOM",
    short: "Petals and halo",
    description: "Petals and halos build outward.",
  },
  marquee: {
    label: "MARQUEE",
    short: "Type and poster",
    description: "Oversized type with poster energy.",
  },
  afterimage: {
    label: "AFTERIMAGE",
    short: "Image and echo",
    description: "Layered silhouettes leave a lasting echo.",
  },
};

export function artEngineForManifestName(
  engineName: string | undefined,
): ArtEngine | undefined {
  const normalized = engineName?.trim().toUpperCase();
  return artEngineNames.find(
    (engine) => engineDetails[engine].label === normalized,
  );
}

export function EnginePicker({
  engines,
  value,
  onChange,
  disabled = false,
}: {
  engines: readonly string[];
  value: number;
  onChange: (engine: number) => void;
  disabled?: boolean;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const hasSelectedEngine =
    Number.isInteger(value) && value >= 0 && value < engines.length;

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (index + 1) % engines.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (index - 1 + engines.length) % engines.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = engines.length - 1;
    }
    if (next === undefined) return;
    event.preventDefault();
    buttons.current[next]?.focus();
    onChange(next);
  }

  return (
    <fieldset className={styles.enginePicker} disabled={disabled}>
      <legend>Art style</legend>
      <p className={styles.sectionHint}>Pick a style. Fine-tune it below.</p>
      <div
        aria-label="Art styles"
        className={styles.engineList}
        role="radiogroup"
      >
        {engines.map((engineName, index) => {
          const artEngine = artEngineForManifestName(engineName);
          const detail = artEngine
            ? engineDetails[artEngine]
            : {
                label: engineName,
                short: "Renderer style",
                description: "Defined by this renderer.",
              };
          const selected = index === value;
          return (
            <button
              aria-checked={selected}
              className={styles.engineChoice}
              data-engine={artEngine ?? "custom"}
              key={`${index}:${engineName}`}
              onClick={() => onChange(index)}
              onKeyDown={(event) => moveFocus(event, index)}
              ref={(button) => {
                buttons.current[index] = button;
              }}
              role="radio"
              tabIndex={
                selected || (!hasSelectedEngine && index === 0) ? 0 : -1
              }
              type="button"
            >
              <span aria-hidden="true" className={styles.engineNumber}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className={styles.engineCopy}>
                <strong>{detail.label}</strong>
                <span>{detail.short}</span>
                <small>{detail.description}</small>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
