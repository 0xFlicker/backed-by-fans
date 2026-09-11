"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ProtocolFlow.module.css";

const destinations = [
  {
    name: "Creator",
    share: 70,
    label: "Creator proceeds",
    title: "Support becomes creator income.",
    detail:
      "The creator’s allocation is earned over paid membership time. Earned proceeds can be claimed; paying for a period does not release the whole amount immediately.",
  },
  {
    name: "Fans",
    share: 20,
    label: "Member rewards",
    title: "Support flows back to members.",
    detail:
      "Member rewards accrue over the same paid time. Eligible memberships share those rewards according to their reward shares. The amount below is the total member allocation, not a payout to each fan.",
  },
  {
    name: "Referrer",
    share: 5,
    label: "Referral rewards",
    title: "An introduction can keep giving.",
    detail:
      "Where a referral is recorded, its allocation is earned over the referred membership’s paid time. Without a referrer, that allocation remains with the creator.",
  },
  {
    name: "Protocol",
    share: 5,
    label: "Protocol fees",
    title: "Earned fees fund buyback and burn.",
    detail:
      "Protocol fees accrue over paid membership time too. Earned fees can be collected and processed separately to buy the protocol token and burn it. Accrual is not an automatic market trade.",
  },
] as const;

export function ProtocolFlow() {
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const elapsed = useRef(0);

  function paint(value: number) {
    elapsed.current = value;
    const element = root.current;
    if (!element) return;
    const slider = element.querySelector<HTMLInputElement>("input");
    if (slider) {
      slider.value = String(value);
      slider.setAttribute(
        "aria-valuetext",
        `Day ${(value * 30).toFixed(1)} of 30`,
      );
    }
    element.querySelectorAll<HTMLElement>("[data-earned]").forEach((node) => {
      node.textContent = `$${(Number(node.dataset.earned) * value).toFixed(2)}`;
    });
    const day = element.querySelector<HTMLElement>("[data-day]");
    if (day) day.textContent = (value * 30).toFixed(1);
    const remaining = element.querySelector<HTMLElement>("[data-remaining]");
    if (remaining) remaining.textContent = `$${(100 * (1 - value)).toFixed(2)}`;
  }

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let last = 0;
    let visible = false;
    function tick(now: number) {
      if (last) paint(Math.min(1, elapsed.current + (now - last) / 30_000));
      last = now;
      if (elapsed.current < 1) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    }
    function sync() {
      cancelAnimationFrame(frame);
      last = 0;
      const run = playing && visible && !document.hidden && !reduced.matches;
      element!.dataset.running = String(run);
      if (run) frame = requestAnimationFrame(tick);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        sync();
      },
      { threshold: 0.15 },
    );
    observer.observe(element);
    reduced.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      reduced.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [playing]);

  return (
    <div className={styles.flow} ref={root} data-running="false">
      <div className={styles.example}>
        <span>One membership, over time</span>
        <span>Illustrative tier: $100 for 30 days</span>
      </div>
      <div className={styles.inputs}>
        <div>
          <strong>Creator</strong>
          <span>Creates the tier & sets its terms</span>
        </div>
        <div>
          <strong>Fan</strong>
          <span>Pays to join or renew</span>
        </div>
      </div>
      <div className={styles.inputConnections} aria-hidden="true">
        <svg viewBox="0 0 1000 60" preserveAspectRatio="none">
          <path d="M250 0 V20 Q250 30 260 30 H490 Q500 30 500 40 V60 M750 0 V20 Q750 30 740 30 H510 Q500 30 500 40" />
        </svg>
      </div>
      <div className={styles.tier}>
        <span className={styles.tierLabel}>Membership tier</span>
        <strong>
          <span data-remaining>$100.00</span> <small>still to accrue</small>
        </strong>
        <p>All four allocations are earned as paid time is used.</p>
      </div>
      <div className={styles.branches} aria-hidden="true">
        <svg viewBox="0 0 1000 80" preserveAspectRatio="none">
          <path d="M500 0 V25 M125 80 V35 Q125 25 135 25 H865 Q875 25 875 35 V80 M375 25 V80 M625 25 V80" />
          <g className={styles.branchStreams}>
            <path d="M500 0 V25" />
            <path d="M500 25 H135 Q125 25 125 35 V80" />
            <path d="M375 25 V80" />
            <path d="M500 25 H865 Q875 25 875 35 V80" />
            <path d="M625 25 V80" />
          </g>
        </svg>
      </div>
      <div className={styles.destinations}>
        {destinations.map((destination, index) => (
          <div className={styles.destination} key={destination.name}>
            <div className={styles.stream} aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <button
              type="button"
              aria-pressed={selected === index}
              aria-controls="flow-explanation"
              onClick={() => setSelected(index)}
              className={styles.destinationButton}
            >
              <span className={styles.destinationName}>
                {destination.name}
                <span>{destination.share}%</span>
              </span>
              <span className={styles.amount} data-earned={destination.share}>
                $0.00
              </span>
              <span className={styles.caption}>{destination.label} earned</span>
            </button>
          </div>
        ))}
      </div>
      <div className={styles.buyback}>
        <span aria-hidden="true">↓</span>
        <span>Buyback → Burn</span>
        <small>Separate execution using earned fees</small>
      </div>
      <div className={styles.timeline}>
        <div className={styles.timeHeading}>
          <label htmlFor="membership-time">
            Paid membership time{" "}
            <span>
              Day <span data-day>0.0</span> of 30
            </span>
          </label>
          <button
            className={styles.play}
            type="button"
            onClick={() => {
              if (elapsed.current >= 1) paint(0);
              setPlaying(!playing);
            }}
            aria-label={playing ? "Pause payment flow" : "Play payment flow"}
          >
            {playing ? "Pause" : "Play"}
          </button>
        </div>
        <input
          id="membership-time"
          aria-label="Paid membership time"
          aria-valuetext="Day 0.0 of 30"
          type="range"
          min="0"
          max="1"
          step="0.001"
          defaultValue="0"
          onChange={(event) => {
            setPlaying(false);
            paint(Number(event.target.value));
          }}
        />
        <div className={styles.timeEnds}>
          <span>Payment received</span>
          <span>Period fully earned</span>
        </div>
      </div>
      <div
        className={styles.explanation}
        id="flow-explanation"
        aria-live="polite"
      >
        <h3>{destinations[selected].title}</h3>
        <p>{destinations[selected].detail}</p>
      </div>
      <p className={styles.note}>
        Actual splits and membership periods depend on the tier. Earned amounts
        become claimable; the animation does not represent continuous wallet
        transfers.
      </p>
    </div>
  );
}
