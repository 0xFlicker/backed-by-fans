import {
  getAddress,
  isAddress,
  maxUint256,
  zeroAddress,
  type Address,
} from "viem";

export const airdropCollection = getAddress(
  "0x11F4eF611DC2689e0fdB1a9A090822Ad5dEd0747",
);
export const airdropBatchSize = 200;
export type AirdropRow = { recipient: Address; tokenId: bigint };

function tokenId(value: string, line: number) {
  if (!/^\d+$/.test(value))
    throw new Error(
      `Line ${line}: token ID must be a whole nonnegative number.`,
    );
  const id = BigInt(value);
  if (id > maxUint256)
    throw new Error(`Line ${line}: token ID exceeds uint256.`);
  return id;
}

/** Strict CSV/TSV/plain text. Never silently omit a malformed recipient. */
export function parseAirdropList(
  text: string,
  mode: "pairs" | "addresses",
  firstTokenId: string,
): AirdropRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((value, index) => ({ value: value.trim(), line: index + 1 }))
    .filter(({ value }) => value.length > 0);
  if (lines.length === 0) return [];
  if (lines.length > 10_001)
    throw new Error("Use at most 10,000 recipients per list.");
  if (
    /^"?(address|recipient)"?(?:[,\t ]+"?token_?id"?)?$/i.test(lines[0].value)
  )
    lines.shift();
  if (lines.length > 10_000)
    throw new Error("Use at most 10,000 recipients per list.");
  const first = mode === "addresses" ? tokenId(firstTokenId.trim(), 1) : 0n;
  const seen = new Set<string>();
  return lines.map(({ value, line }, index) => {
    const fields = value
      .split(value.includes(",") ? "," : value.includes("\t") ? "\t" : /\s+/)
      .map((field) => field.trim().replace(/^"([^"\n]*)"$/, "$1"));
    if (fields.length !== (mode === "pairs" ? 2 : 1))
      throw new Error(
        `Line ${line}: expected ${mode === "pairs" ? "address,tokenId" : "one address"}.`,
      );
    if (!isAddress(fields[0]))
      throw new Error(`Line ${line}: invalid wallet address or checksum.`);
    const recipient = getAddress(fields[0]);
    if (recipient === zeroAddress)
      throw new Error(`Line ${line}: the zero address cannot receive an NFT.`);
    const id =
      mode === "pairs" ? tokenId(fields[1], line) : first + BigInt(index);
    if (id > maxUint256)
      throw new Error(`Line ${line}: token ID exceeds uint256.`);
    if (seen.has(id.toString()))
      throw new Error(`Line ${line}: token ID ${id} appears more than once.`);
    seen.add(id.toString());
    return { recipient, tokenId: id };
  });
}
