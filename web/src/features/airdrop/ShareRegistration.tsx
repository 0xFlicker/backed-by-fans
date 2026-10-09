"use client";
import { useState } from "react";
import type { Address } from "viem";
import { registrationPath } from "./collection";
import styles from "./ERC721AirdropPage.module.css";

export function ShareRegistration({
  chainId,
  collection,
  owner,
}: {
  chainId: number;
  collection: Address;
  owner?: Address;
}) {
  const [message, setMessage] = useState("");
  const path = registrationPath(chainId, collection);
  async function share() {
    const url = new URL(path, window.location.origin).href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Register GasliteDrop",
          text: "Authorize GasliteDrop for your NFT collection.",
          url,
        });
        setMessage("Registration link shared.");
        return;
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "name" in error &&
          error.name === "AbortError"
        ) {
          setMessage("Sharing cancelled.");
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Registration link copied.");
    } catch {
      setMessage("Could not copy the link. Copy the registration link below.");
    }
  }
  return (
    <div className={styles.notice}>
      <p>
        This collection&apos;s transfer registry blocks GasliteDrop. Ask the
        collection owner
        {owner ? (
          <>
            {" "}
            at <span className={styles.address}>{owner}</span>
          </>
        ) : null}{" "}
        to register it before you approve or send NFTs.
      </p>
      <div className={styles.actions}>
        <a className="button button-small" href={path}>
          Owner registration
        </a>
        <button type="button" className="button button-small" onClick={share}>
          Share registration link
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
