"use client";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { projectedAmount, type EarningsStream } from "@/lib/streaming-amount";

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let now = 0;
function tick() {
  now = performance.now();
  listeners.forEach((listener) => listener());
}
function visibility() {
  if (timer) clearInterval(timer);
  timer = undefined;
  if (!document.hidden && listeners.size) {
    tick();
    timer = setInterval(tick, 100);
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", visibility);
    visibility();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      if (timer) clearInterval(timer);
      timer = undefined;
      document.removeEventListener("visibilitychange", visibility);
    }
  };
}

function RollingDigit({ digit }: { digit: string }) {
  const [frame, setFrame] = useState({ digit, previous: digit });
  if (frame.digit !== digit) setFrame({ digit, previous: frame.digit });
  return (
    <span className="streaming-digit">
      <span
        key={frame.digit}
        className={
          frame.previous !== frame.digit ? "streaming-digit-roll" : undefined
        }
        data-previous={frame.previous}
      >
        {frame.digit}
      </span>
    </span>
  );
}

/** Estimates between onchain updates; callers retain authoritative amounts for every write. */
export function StreamingAmount({
  identity,
  streams,
  base = 0n,
  format,
  refresh,
  active = true,
}: {
  identity: string;
  streams: readonly EarningsStream[];
  base?: bigint;
  format: (raw: bigint) => string;
  refresh: () => unknown;
  active?: boolean;
}) {
  const version = `${identity}:${streams.map((s) => s.asOf).join(":")}`;
  const anchor = useMemo(
    () => ({ version, at: undefined as number | undefined }),
    [version],
  );
  const listen = useCallback(
    (listener: () => void) => {
      anchor.at ??= performance.now();
      return subscribe(listener);
    },
    [anchor],
  );
  const authoritative = format(
    base + streams.reduce((sum, stream) => sum + stream.raw, 0n),
  );
  const read = useCallback(
    () =>
      format(
        base +
          streams.reduce(
            (sum, stream) =>
              sum +
              projectedAmount(
                stream,
                active && anchor.at !== undefined
                  ? Math.max(0, now - anchor.at)
                  : 0,
              ),
            0n,
          ),
      ),
    [streams, base, format, active, anchor],
  );
  const value = useSyncExternalStore(listen, read, () => authoritative);
  const requestRefresh = useEffectEvent(() => {
    void refresh();
  });
  const boundaryAfterMs = Math.min(
    ...streams
      .filter((s) => s.complete && s.nextBoundary > 0n)
      .map((s) => Number(s.nextBoundary - s.asOf) * 1000),
  );
  useEffect(() => {
    let refreshed = false;
    const check = () => {
      const boundary =
        anchor.at !== undefined && now - anchor.at >= boundaryAfterMs;
      if (boundary && !refreshed && active) {
        refreshed = true;
        requestRefresh();
      }
    };
    const shown = () => {
      if (!document.hidden) requestRefresh();
    };
    const remove = subscribe(check);
    document.addEventListener("visibilitychange", shown);
    return () => {
      remove();
      document.removeEventListener("visibilitychange", shown);
    };
  }, [boundaryAfterMs, anchor, active]);
  const decimal =
    new Intl.NumberFormat(
      typeof navigator === "undefined" ? "en-US" : navigator.language,
    )
      .formatToParts(1.1)
      .find((part) => part.type === "decimal")?.value ?? ".";
  const rawChars = Array.from(value);
  const point = rawChars.indexOf(decimal);
  const lastDigit = rawChars.findLastIndex((char) => /\p{Nd}/u.test(char));
  const precision = point < 0 ? 0 : lastDigit - point;
  const [places, setPlaces] = useState({ identity, count: precision });
  const zero = new Intl.NumberFormat(
    typeof navigator === "undefined" ? "en-US" : navigator.language,
  ).format(0);
  const fractionalDigits =
    point < 0 ? [] : rawChars.slice(point + 1, lastDigit + 1);
  const firstMeaningful = fractionalDigits.findIndex((char) => char !== zero);
  // Drop places that have fallen beyond the formatter's three meaningful
  // fractional digits; those digits can no longer accrue visibly.
  const maximumPlaces = firstMeaningful < 0 ? 3 : firstMeaningful + 3;
  const count = Math.min(
    maximumPlaces,
    places.identity === identity
      ? Math.max(places.count, precision)
      : precision,
  );
  if (places.identity !== identity || places.count !== count)
    setPlaces({ identity, count });
  // Retain displayed decimal places across formatter cutoffs; padding adds no
  // estimated precision, but prevents trailing zeros and the decimal from shifting.
  const padding =
    lastDigit >= 0 && count > precision
      ? `${point < 0 ? decimal : ""}${zero.repeat(count - precision)}`
      : "";
  const chars = [
    ...rawChars.slice(0, lastDigit + 1),
    ...Array.from(padding),
    ...rawChars.slice(lastDigit + 1),
  ];
  const decimalIndex = chars.indexOf(decimal);
  // Key by decimal place, not total string length: precision changes must not
  // remount the leading zero, separators, or unchanged fractional digits.
  const integerEnd = decimalIndex < 0 ? chars.length : decimalIndex;
  const placeKey = (index: number) =>
    decimalIndex >= 0 && index > decimalIndex
      ? `fraction-${index - decimalIndex}`
      : `integer-${chars.slice(index, integerEnd).filter((c) => /\p{Nd}/u.test(c)).length}`;
  return (
    <span className="streaming-amount">
      <span className="sr-only">{authoritative}</span>
      <span aria-hidden="true">
        {chars.map((char, index) =>
          /\p{Nd}/u.test(char) ? (
            <RollingDigit key={`${identity}:${placeKey(index)}`} digit={char} />
          ) : (
            <span key={`text-${index}`}>{char}</span>
          ),
        )}
      </span>
    </span>
  );
}
