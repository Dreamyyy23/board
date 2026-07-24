"use client";

import { useEffect, useRef, useState } from "react";
import {
  SUPPORT_ETH_ADDRESS,
  SUPPORT_EXPLORER_URL,
} from "../support-config.mjs";

export function SupportPortal({ onClose }: { onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const addressRef = useRef<HTMLElement | null>(null);
  const [copyState, setCopyState] = useState<
    "idle" | "copied" | "failed"
  >("idle");

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    closeButtonRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(SUPPORT_ETH_ADDRESS);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
      const selection = window.getSelection();
      const address = addressRef.current;
      if (selection && address) {
        const range = document.createRange();
        range.selectNodeContents(address);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }

  return (
    <div className="rules-backdrop support-backdrop" role="presentation">
      <section
        aria-describedby="support-description"
        aria-labelledby="support-title"
        aria-modal="true"
        className="rules-modal support-modal"
        role="dialog"
      >
        <button
          aria-label="Close support portal"
          className="rules-close"
          onClick={onClose}
          ref={closeButtonRef}
          type="button"
        >
          &times;
        </button>

        <div className="support-sigil" aria-hidden="true">
          <span>Ξ</span>
          {Array.from({ length: 6 }, (_, index) => <i key={index} />)}
        </div>
        <span className="brand-kicker">SUPPORT PORTAL · ETHEREUM</span>
        <h2 id="support-title">Keep the signal open.</h2>
        <p className="support-lead" id="support-description">
          If you want to support the Foxyverse table, send an Ethereum tribute
          to the original Legend Nexus address.
        </p>

        <div className="support-address-panel">
          <span>Legend Nexus address</span>
          <code ref={addressRef} tabIndex={0}>
            {SUPPORT_ETH_ADDRESS}
          </code>
          <button className="support-copy" onClick={copyAddress} type="button">
            <b aria-hidden="true">Ξ</b>
            <span>
              {copyState === "copied"
                ? "ADDRESS COPIED"
                : copyState === "failed"
                  ? "ADDRESS SELECTED"
                  : "COPY ETH ADDRESS"}
            </span>
          </button>
        </div>

        <p className="support-feedback" aria-live="polite" role="status">
          {copyState === "copied"
            ? "The full address is now in your clipboard."
            : copyState === "failed"
              ? "Clipboard access was blocked. The address is selected for manual copying."
              : "Ethereum Mainnet · ETH only"}
        </p>
        <p className="support-warning">
          Verify every character in your wallet before sending. Blockchain
          transfers are irreversible.
        </p>
        <p className="support-neutral">
          Donations never change seats, rolls, rewards, odds, or victory.
        </p>

        <a
          className="support-explorer"
          href={SUPPORT_EXPLORER_URL}
          rel="noreferrer"
          target="_blank"
        >
          Inspect address on Etherscan <span aria-hidden="true">↗</span>
        </a>
      </section>
    </div>
  );
}
