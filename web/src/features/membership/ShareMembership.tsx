"use client";

import { useRef, useState } from "react";
import {
  CheckIcon,
  CopyIcon,
  ShareNetworkIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { Address } from "viem";

import { membershipShareUrl } from "@/features/membership/referral";

type CopyState = "idle" | "copied" | "unavailable";

export function ShareMembership({
  chainId,
  name,
  referrer,
  tier,
}: {
  chainId: number;
  name: string;
  referrer?: Address;
  tier: Address;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const linkRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [canShareNatively, setCanShareNatively] = useState(false);
  const [shareError, setShareError] = useState("");

  function openDialog() {
    const url = referrer
      ? membershipShareUrl({
          origin: window.location.origin,
          chainId,
          tier,
          referrer,
        })
      : new URL(
          `/chains/${chainId}/tiers/${tier}`,
          window.location.origin,
        ).toString();

    setShareUrl(url);
    setCopyState("idle");
    setShareError("");
    setCanShareNatively(typeof navigator.share === "function");
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState("copied");
      setShareError("");
    } catch {
      const selection = window.getSelection();
      if (selection && linkRef.current) {
        const range = document.createRange();
        range.selectNodeContents(linkRef.current);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setCopyState("unavailable");
    }
  }

  async function openNativeShare() {
    try {
      await navigator.share({
        title: name,
        text: `Join ${name} on Backed By Fans.`,
        url: shareUrl,
      });
      closeDialog();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareError(
        "The share sheet could not open. You can copy the link instead.",
      );
    }
  }

  return (
    <>
      <button
        aria-haspopup="dialog"
        className="button button-outline button-small membership-share-trigger"
        onClick={openDialog}
        ref={triggerRef}
        type="button"
      >
        <ShareNetworkIcon aria-hidden="true" size={18} weight="regular" />
        Share
      </button>

      <dialog
        aria-labelledby="share-membership-title"
        className="share-dialog"
        onClose={() => triggerRef.current?.focus()}
        onClick={(event) => {
          if (event.currentTarget === event.target) closeDialog();
        }}
        ref={dialogRef}
      >
        <div className="share-dialog-panel">
          <header className="share-dialog-heading">
            <div>
              <p className="eyebrow">Share membership</p>
              <h2 className="font-display" id="share-membership-title">
                {name}
              </h2>
            </div>
            <button
              aria-label="Close share dialog"
              className="share-dialog-close"
              onClick={closeDialog}
              type="button"
            >
              <XIcon aria-hidden="true" size={20} weight="bold" />
            </button>
          </header>

          <p className="share-dialog-copy">
            {referrer
              ? "This link includes your wallet for referrals."
              : "Anyone with this link can open this membership."}
          </p>

          <div className="share-dialog-link">
            <code ref={linkRef} title={shareUrl}>
              {shareUrl}
            </code>
            <button
              aria-label={
                copyState === "copied" ? "Share link copied" : "Copy share link"
              }
              className="share-dialog-copy-button"
              onClick={() => void copyLink()}
              title={copyState === "copied" ? "Copied" : "Copy share link"}
              type="button"
            >
              {copyState === "copied" ? (
                <CheckIcon aria-hidden="true" size={18} weight="bold" />
              ) : (
                <CopyIcon aria-hidden="true" size={18} weight="regular" />
              )}
            </button>
          </div>

          <p aria-live="polite" className="share-dialog-status">
            {copyState === "copied"
              ? "Link copied."
              : copyState === "unavailable"
                ? "Link selected. Copy it manually."
                : shareError}
          </p>

          {canShareNatively && (
            <button
              className="button button-dark share-dialog-native"
              onClick={() => void openNativeShare()}
              type="button"
            >
              <ShareNetworkIcon aria-hidden="true" size={18} weight="regular" />
              Share with another app
            </button>
          )}
        </div>
      </dialog>
    </>
  );
}
