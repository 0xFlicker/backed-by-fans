import type { ChangeEvent } from "react";

import {
  engineControlDefinitions,
  globalControlDefinitions,
  type AnyStudioArtConfig,
  type NumericControlDefinition,
} from "@/features/creator-studio/art-config";
import type { SurpriseLock } from "@/features/creator-studio/surprise";
import { useWideStudioDisclosure } from "@/features/creator-studio/use-wide-studio-disclosure";
import styles from "@/features/creator-studio/CreatorStudio.module.css";

export function normalizeNumericControlValue(
  value: number,
  definition: Pick<NumericControlDefinition, "min" | "max" | "step">,
) {
  if (!Number.isFinite(value)) return definition.min;
  const bounded = Math.min(definition.max, Math.max(definition.min, value));
  const stepped =
    definition.min +
    Math.round((bounded - definition.min) / definition.step) * definition.step;
  const precision = Math.max(
    0,
    (definition.step.toString().split(".")[1] ?? "").length,
  );
  return Number(
    Math.min(definition.max, Math.max(definition.min, stepped)).toFixed(
      precision,
    ),
  );
}

function LockButton({
  control,
  label,
  locked,
  onToggle,
  disabled,
}: {
  control: SurpriseLock;
  label: string;
  locked: boolean;
  onToggle: (control: SurpriseLock) => void;
  disabled: boolean;
}) {
  return (
    <button
      aria-label={`${locked ? "Unlock" : "Lock"} ${label}`}
      aria-pressed={locked}
      className={styles.lockButton}
      disabled={disabled}
      onClick={() => onToggle(control)}
      title={`${locked ? "Unlock" : "Lock"} ${label} for Surprise Me`}
      type="button"
    >
      <span aria-hidden="true">{locked ? "◆" : "◇"}</span>
      <span>{locked ? "Locked" : "Lock"}</span>
    </button>
  );
}

function NumericControl({
  id,
  definition,
  value,
  lock,
  locked,
  disabled,
  onChange,
  onToggleLock,
}: {
  id: string;
  definition: NumericControlDefinition;
  value: number;
  lock: SurpriseLock;
  locked: boolean;
  disabled: boolean;
  onChange: (value: number) => void;
  onToggleLock: (control: SurpriseLock) => void;
}) {
  function update(event: ChangeEvent<HTMLInputElement>) {
    onChange(
      normalizeNumericControlValue(Number(event.target.value), definition),
    );
  }

  const booleanControl =
    definition.min === 0 && definition.max === 1 && definition.step === 1;

  if (booleanControl) {
    return (
      <div className={`${styles.controlRow} ${styles.booleanControl}`}>
        <div className={styles.controlHeading}>
          <label className={styles.checkboxControl} htmlFor={`${id}-checkbox`}>
            <input
              checked={value === 1}
              disabled={disabled}
              id={`${id}-checkbox`}
              onChange={(event) => onChange(event.target.checked ? 1 : 0)}
              type="checkbox"
            />
            <span>{definition.label}</span>
          </label>
          <LockButton
            control={lock}
            disabled={disabled}
            label={definition.label}
            locked={locked}
            onToggle={onToggleLock}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.controlRow}>
      <div className={styles.controlHeading}>
        <label htmlFor={`${id}-range`}>{definition.label}</label>
        <LockButton
          control={lock}
          disabled={disabled}
          label={definition.label}
          locked={locked}
          onToggle={onToggleLock}
        />
      </div>
      <div className={styles.rangePair}>
        <input
          aria-describedby={`${id}-bounds`}
          disabled={disabled}
          id={`${id}-range`}
          max={definition.max}
          min={definition.min}
          onChange={update}
          step={definition.step}
          type="range"
          value={value}
        />
        <input
          aria-label={`${definition.label} numeric value`}
          disabled={disabled}
          inputMode="numeric"
          max={definition.max}
          min={definition.min}
          onChange={update}
          step={definition.step}
          type="number"
          value={value}
        />
      </div>
      <span className={styles.controlBounds} id={`${id}-bounds`}>
        {definition.min}-{definition.max}
      </span>
    </div>
  );
}

export function ArtControls({
  art,
  locks,
  onChange,
  onToggleLock,
  disabled = false,
}: {
  art: AnyStudioArtConfig;
  locks: ReadonlySet<SurpriseLock>;
  onChange: (art: AnyStudioArtConfig) => void;
  onToggleLock: (control: SurpriseLock) => void;
  disabled?: boolean;
}) {
  const { detailsRef, isWide } = useWideStudioDisclosure();
  const globalDefinitions = Object.entries(globalControlDefinitions).filter(
    ([, definition]) => definition.dependency.kind === "always",
  ) as [keyof typeof globalControlDefinitions, NumericControlDefinition][];
  const specificDefinitions = engineControlDefinitions[art.engine] as Record<
    string,
    NumericControlDefinition
  >;

  function updateGlobal(
    key: keyof typeof globalControlDefinitions,
    value: number,
  ) {
    onChange({
      ...art,
      global: { ...art.global, [key]: value },
      engineControls: { ...art.engineControls },
    } as AnyStudioArtConfig);
  }

  function updateEngine(key: string, value: number) {
    onChange({
      ...art,
      global: { ...art.global },
      engineControls: { ...art.engineControls, [key]: value },
    } as AnyStudioArtConfig);
  }

  return (
    <details className={styles.controlsSection} ref={detailsRef}>
      <summary
        className={styles.customizationSummary}
        onClick={isWide ? (event) => event.preventDefault() : undefined}
        tabIndex={isWide ? -1 : undefined}
      >
        <span>
          <span className={styles.kicker}>Artwork</span>
          <h3 id="studio-controls-heading">Customize artwork</h3>
        </span>
        <span className={styles.summaryHint}>Palette, type, and texture</span>
      </summary>
      <div className={styles.customizationBody}>
        <div className={styles.seedRow}>
          <p className={styles.seedLine}>
            Direction{" "}
            <code>{art.collectionSeed.toString(16).padStart(32, "0")}</code>
          </p>
          <LockButton
            control="collectionSeed"
            disabled={disabled}
            label="direction"
            locked={locks.has("collectionSeed")}
            onToggle={onToggleLock}
          />
        </div>

        <div className={styles.controlStack}>
          {globalDefinitions.map(([key, definition]) => (
            <NumericControl
              definition={definition}
              disabled={disabled}
              id={`studio-global-${key}`}
              key={key}
              lock={`global.${key}`}
              locked={locks.has(`global.${key}`)}
              onChange={(value) => updateGlobal(key, value)}
              onToggleLock={onToggleLock}
              value={art.global[key]}
            />
          ))}
        </div>

        <details className={styles.engineControls}>
          <summary>Style controls</summary>
          <div className={styles.controlStack}>
            {Object.entries(specificDefinitions).map(([key, definition]) => (
              <NumericControl
                definition={definition}
                disabled={disabled}
                id={`studio-engine-${key}`}
                key={`${art.engine}-${key}`}
                lock={`engine.${key}`}
                locked={locks.has(`engine.${key}`)}
                onChange={(value) => updateEngine(key, value)}
                onToggleLock={onToggleLock}
                value={(art.engineControls as Record<string, number>)[key]}
              />
            ))}
          </div>
        </details>
      </div>
    </details>
  );
}

export { LockButton, NumericControl };
