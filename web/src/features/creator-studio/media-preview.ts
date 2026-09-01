import { hexToBytes } from "viem";

import type { CreatorMediaRecord } from "@/features/protocol/registry-reconciliation";

export function creatorMediaMime(record: Pick<CreatorMediaRecord, "mime">) {
  return record.mime === 2 ? ("image/png" as const) : ("image/jpeg" as const);
}

export function creatorMediaBlob(
  record: Pick<CreatorMediaRecord, "mime" | "payload">,
) {
  return new Blob([Uint8Array.from(hexToBytes(record.payload))], {
    type: creatorMediaMime(record),
  });
}

export function creatorMediaDataUrl(
  record: Pick<CreatorMediaRecord, "mime" | "payload">,
) {
  const bytes = Uint8Array.from(hexToBytes(record.payload));
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let base64 = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    base64 += alphabet.charAt(first >> 2);
    base64 += alphabet.charAt(((first & 3) << 4) | (second >> 4));
    base64 +=
      index + 1 < bytes.length
        ? alphabet.charAt(((second & 15) << 2) | (third >> 6))
        : "=";
    base64 += index + 2 < bytes.length ? alphabet.charAt(third & 63) : "=";
  }
  return `data:${creatorMediaMime(record)};base64,${base64}`;
}
