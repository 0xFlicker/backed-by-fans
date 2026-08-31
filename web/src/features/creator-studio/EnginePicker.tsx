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
    short: "Planes / depth",
    description:
      "Monumental offset planes with apertures, edge rhythm, and supporter echoes.",
  },
  chorus: {
    label: "CHORUS",
    short: "Lights / orbit",
    description:
      "Supporter lights gather into orbits, clusters, trails, and moments of convergence.",
  },
  loom: {
    label: "LOOM",
    short: "Ribbon / tension",
    description:
      "Woven signal ribbons cross under tension, revealing media through selected openings.",
  },
  bloom: {
    label: "BLOOM",
    short: "Petals / halo",
    description:
      "Recursive radial growth moves between petals, halos, and live-room stage light.",
  },
  marquee: {
    label: "MARQUEE",
    short: "Type / poster",
    description:
      "Oversized membership language, registration marks, grain, and backstage-poster energy.",
  },
  afterimage: {
    label: "AFTERIMAGE",
    short: "Media / echo",
    description:
      "Duotone masks, repeats, and layered silhouettes give creator media a lasting echo.",
  },
};

export function EnginePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: ArtEngine;
  onChange: (engine: ArtEngine) => void;
  disabled?: boolean;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (index + 1) % artEngineNames.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (index - 1 + artEngineNames.length) % artEngineNames.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = artEngineNames.length - 1;
    }
    if (next === undefined) return;
    event.preventDefault();
    buttons.current[next]?.focus();
    onChange(artEngineNames[next]);
  }

  return (
    <fieldset className={styles.enginePicker} disabled={disabled}>
      <legend>Choose a visual grammar</legend>
      <p className={styles.sectionHint}>
        One renderer, six distinct ways to shape the same membership identity.
      </p>
      <div
        aria-label="Art engines"
        className={styles.engineList}
        role="radiogroup"
      >
        {artEngineNames.map((engine, index) => {
          const detail = engineDetails[engine];
          const selected = engine === value;
          return (
            <button
              aria-checked={selected}
              className={styles.engineChoice}
              data-engine={engine}
              key={engine}
              onClick={() => onChange(engine)}
              onKeyDown={(event) => moveFocus(event, index)}
              ref={(button) => {
                buttons.current[index] = button;
              }}
              role="radio"
              tabIndex={selected ? 0 : -1}
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

export { engineDetails };
