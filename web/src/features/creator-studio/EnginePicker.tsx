import { useRef, type KeyboardEvent } from "react";
import type { Address } from "viem";

import {
  artEngineNames,
  type ArtEngine,
} from "@/features/creator-studio/art-config";
import styles from "@/features/creator-studio/CreatorStudio.module.css";

export type ArtStyleSelection = number | `created:${Address}` | "custom";

export type CreatedRendererOption = {
  address: Address;
  name: string;
};

export type CustomRendererState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; rendererName: string }
  | { status: "error"; message: string };

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
  createdRenderers,
  value,
  onChange,
  customAddress,
  customState,
  onCustomAddressChange,
  disabled = false,
}: {
  engines: readonly string[];
  createdRenderers: readonly CreatedRendererOption[];
  value: ArtStyleSelection;
  onChange: (selection: ArtStyleSelection) => void;
  customAddress: string;
  customState: CustomRendererState;
  onCustomAddressChange: (address: string) => void;
  disabled?: boolean;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const optionCount = createdRenderers.length + engines.length + 1;
  const hasSelectedEngine =
    value === "custom" ||
    (typeof value === "string" && value.startsWith("created:")) ||
    (typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value < engines.length);

  function selectionAt(index: number): ArtStyleSelection {
    const created = createdRenderers[index];
    if (created) return `created:${created.address}`;
    const engineIndex = index - createdRenderers.length;
    return engineIndex === engines.length ? "custom" : engineIndex;
  }

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (index + 1) % optionCount;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (index - 1 + optionCount) % optionCount;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = optionCount - 1;
    }
    if (next === undefined) return;
    event.preventDefault();
    buttons.current[next]?.focus();
    onChange(selectionAt(next));
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
        {createdRenderers.map((renderer, index) => {
          const selection = `created:${renderer.address}` as const;
          const selected = value === selection;
          return (
            <button
              aria-checked={selected}
              className={styles.engineChoice}
              data-engine="created"
              key={renderer.address}
              onClick={() => onChange(selection)}
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
                <strong>{renderer.name}</strong>
                <span>Your renderer</span>
                <small>
                  {renderer.address.slice(0, 8)}…{renderer.address.slice(-6)}
                </small>
              </span>
            </button>
          );
        })}
        {engines.map((engineName, index) => {
          const artEngine = artEngineForManifestName(engineName);
          const detail = artEngine
            ? engineDetails[artEngine]
            : {
                label: engineName,
                short: "Renderer style",
                description: "Defined by this renderer.",
              };
          const optionIndex = createdRenderers.length + index;
          const selected = index === value;
          return (
            <button
              aria-checked={selected}
              className={styles.engineChoice}
              data-engine={artEngine ?? "custom"}
              key={`${index}:${engineName}`}
              onClick={() => onChange(index)}
              onKeyDown={(event) => moveFocus(event, optionIndex)}
              ref={(button) => {
                buttons.current[optionIndex] = button;
              }}
              role="radio"
              tabIndex={
                selected || (!hasSelectedEngine && index === 0) ? 0 : -1
              }
              type="button"
            >
              <span aria-hidden="true" className={styles.engineNumber}>
                {String(optionIndex + 1).padStart(2, "0")}
              </span>
              <span className={styles.engineCopy}>
                <strong>{detail.label}</strong>
                <span>{detail.short}</span>
                <small>{detail.description}</small>
              </span>
            </button>
          );
        })}
        <button
          aria-checked={value === "custom"}
          className={styles.engineChoice}
          data-engine="custom"
          onClick={() => onChange("custom")}
          onKeyDown={(event) => moveFocus(event, optionCount - 1)}
          ref={(button) => {
            buttons.current[optionCount - 1] = button;
          }}
          role="radio"
          tabIndex={value === "custom" ? 0 : -1}
          type="button"
        >
          <span aria-hidden="true" className={styles.engineNumber}>
            {String(optionCount).padStart(2, "0")}
          </span>
          <span className={styles.engineCopy}>
            <strong>CUSTOM</strong>
            <span>Contract renderer</span>
            <small>Use a renderer contract address.</small>
          </span>
        </button>
      </div>
      {value === "custom" ? (
        <div className={styles.customRendererField}>
          <label htmlFor="custom-renderer-address">
            Renderer contract address
          </label>
          <input
            aria-describedby="custom-renderer-status"
            aria-invalid={customState.status === "error" || undefined}
            autoCapitalize="none"
            autoComplete="off"
            disabled={disabled}
            id="custom-renderer-address"
            onChange={(event) => onCustomAddressChange(event.target.value)}
            placeholder="0x…"
            spellCheck={false}
            type="text"
            value={customAddress}
          />
          <p
            aria-live="polite"
            id="custom-renderer-status"
            role={customState.status === "error" ? "alert" : "status"}
          >
            {customState.status === "loading"
              ? "Loading renderer..."
              : customState.status === "ready"
                ? customState.rendererName
                : customState.status === "error"
                  ? customState.message
                  : ""}
          </p>
        </div>
      ) : null}
    </fieldset>
  );
}
