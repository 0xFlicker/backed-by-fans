"use client";

import { useId, useState } from "react";

import styles from "@/features/creator-studio/CreatorStudio.module.css";

export type RendererAddressPreview =
  | { status: "idle" }
  | { status: "loading"; message?: string }
  | {
      status: "ready";
      completed: number;
      total: number;
      rendererName?: string;
    }
  | { status: "error"; message: string; detail?: string };

export type RendererDecision = "pending" | "approved" | "rejected";

export type RendererAddressInputProps = {
  address: string;
  preview: RendererAddressPreview;
  decision: RendererDecision;
  onAddressChange: (address: string) => void;
  onPreview: () => void;
  onApprove: () => void;
  onReject: () => void;
  disabled?: boolean;
};

type CopyFeedback = {
  address: string;
  status: "copied" | "failed";
};

export function RendererAddressInput({
  address,
  preview,
  decision,
  onAddressChange,
  onPreview,
  onApprove,
  onReject,
  disabled = false,
}: RendererAddressInputProps) {
  const inputId = useId();
  const hintId = useId();
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback>();
  const trimmedAddress = address.trim();
  const isLoading = preview.status === "loading";
  const currentCopyFeedback =
    copyFeedback?.address === trimmedAddress ? copyFeedback.status : undefined;

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(trimmedAddress);
      setCopyFeedback({ address: trimmedAddress, status: "copied" });
    } catch {
      setCopyFeedback({ address: trimmedAddress, status: "failed" });
    }
  }

  return (
    <section
      aria-labelledby={`${inputId}-heading`}
      className={styles.rendererAddressInput}
    >
      <div className={styles.rendererAddressHeading}>
        <h2 id={`${inputId}-heading`}>Choose the artwork renderer</h2>
        <p>Paste its contract address, then review every example before use.</p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onPreview();
        }}
      >
        <label className={styles.rendererAddressLabel} htmlFor={inputId}>
          Renderer address
        </label>
        <p className={styles.rendererAddressHint} id={hintId}>
          Use the address shared by the renderer artist or another membership.
        </p>
        <div className={styles.rendererAddressField}>
          <input
            aria-describedby={hintId}
            aria-invalid={preview.status === "error" || undefined}
            autoCapitalize="none"
            autoComplete="off"
            disabled={disabled}
            id={inputId}
            onChange={(event) => onAddressChange(event.target.value)}
            placeholder="0x…"
            spellCheck={false}
            type="text"
            value={address}
          />
          <button
            className={styles.secondaryButton}
            disabled={disabled || trimmedAddress.length === 0}
            onClick={() => void copyAddress()}
            type="button"
          >
            Copy address
          </button>
        </div>
        {currentCopyFeedback ? (
          <p aria-live="polite" className={styles.rendererCopyFeedback}>
            {currentCopyFeedback === "copied"
              ? "Address copied."
              : "Could not copy the address. Select it and copy it manually."}
          </p>
        ) : null}

        <div className={styles.rendererAddressActions}>
          <button
            className={styles.primaryButton}
            disabled={disabled || isLoading || trimmedAddress.length === 0}
            type="submit"
          >
            {isLoading ? "Previewing…" : "Preview renderer"}
          </button>
        </div>
      </form>

      <div
        aria-busy={isLoading}
        className={styles.rendererPreviewStatus}
        data-state={preview.status}
      >
        {preview.status === "idle" ? (
          <p>
            Representative previews are required before this renderer can be
            used.
          </p>
        ) : null}

        {preview.status === "loading" ? (
          <p aria-live="polite" role="status">
            {preview.message ?? "Making representative previews…"}
          </p>
        ) : null}

        {preview.status === "error" ? (
          <div role="alert">
            <strong>Preview failed</strong>
            <p>{preview.message}</p>
            {preview.detail ? (
              <details className={styles.rendererFailureDetails}>
                <summary>Technical details</summary>
                <p>{preview.detail}</p>
              </details>
            ) : null}
          </div>
        ) : null}

        {preview.status === "ready" ? (
          <div>
            {preview.rendererName ? (
              <strong className={styles.rendererResolvedName}>
                {preview.rendererName}
              </strong>
            ) : null}
            <p aria-live="polite" role="status">
              {preview.completed} of {preview.total} representative previews are
              ready. Review the artwork itself before deciding.
            </p>
            <div className={styles.rendererDecisionActions}>
              <button
                aria-pressed={decision === "approved"}
                className={styles.primaryButton}
                disabled={disabled || decision === "approved"}
                onClick={onApprove}
                type="button"
              >
                Use this renderer
              </button>
              <button
                aria-pressed={decision === "rejected"}
                className={styles.secondaryButton}
                disabled={disabled || decision === "rejected"}
                onClick={onReject}
                type="button"
              >
                Reject renderer
              </button>
            </div>
            {decision !== "pending" ? (
              <p aria-live="polite" className={styles.rendererDecisionStatus}>
                {decision === "approved"
                  ? "Renderer approved."
                  : "Renderer rejected."}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
