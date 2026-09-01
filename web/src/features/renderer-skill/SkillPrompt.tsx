"use client";

import { useState } from "react";

import styles from "./SkillPrompt.module.css";

type CopyState = "idle" | "copied" | "unavailable";

export function SkillPrompt({ skillUrl }: { skillUrl: string }) {
  const [prompt, setPrompt] = useState(
    `Go to ${skillUrl} and help me create an onchain membership design. Show me the representative previews before deployment, then give me the renderer contract address.`,
  );
  const [copyState, setCopyState] = useState<CopyState>("idle");

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState("copied");
    } catch {
      setCopyState("unavailable");
    }
  }

  return (
    <section
      aria-labelledby="agent-prompt-heading"
      className={styles.prompt}
      id="agent-prompt"
    >
      <div className={styles.heading}>
        <h2 id="agent-prompt-heading">Give this to your agent.</h2>
        <p>Start here. The agent asks the rest.</p>
      </div>
      <label className={styles.label} htmlFor="renderer-agent-prompt">
        Your agent prompt
      </label>
      <textarea
        aria-describedby="renderer-agent-prompt-hint"
        id="renderer-agent-prompt"
        onChange={(event) => {
          setPrompt(event.target.value);
          setCopyState("idle");
        }}
        rows={7}
        value={prompt}
      />
      <p className={styles.hint} id="renderer-agent-prompt-hint">
        The agent checks its tools, builds the contract, and brings the artwork
        back for your decision.
      </p>
      <div className={styles.actionRow}>
        <button
          className="button button-dark"
          onClick={() => void copyPrompt()}
          type="button"
        >
          {copyState === "copied" ? "Prompt copied" : "Copy agent prompt"}
        </button>
        <p aria-live="polite" className={styles.copyStatus}>
          {copyState === "unavailable"
            ? "Copy was unavailable. Select the prompt and copy it manually."
            : copyState === "copied"
              ? "Paste it into your agent and keep working there."
              : ""}
        </p>
      </div>
    </section>
  );
}
