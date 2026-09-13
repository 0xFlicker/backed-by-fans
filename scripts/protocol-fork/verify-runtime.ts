/** Compare independently compiled Solidity code, allowing only compiler-reported
 * immutable slots and recognized final metadata. Metadata differences remain explicit. */
export type ImmutableReferences = Record<
  string,
  Array<{ start: number; length: number }>
>;

/** Code stores are data, not Solidity runtimes: compare every byte, including metadata. */
export function exactLibraryRuntime(template: string, address: string) {
  const code = bytes(template);
  if (
    !/^0x[0-9a-fA-F]{40}$/.test(address) ||
    !code.startsWith(`73${"00".repeat(20)}`)
  )
    throw new Error("Invalid library self-address template");
  return `0x73${address.slice(2).toLowerCase()}${code.slice(42)}`;
}

function bytes(hex: string) {
  const value = hex.replace(/^0x/, "").toLowerCase();
  if (!value.length || value.length % 2 || !/^[0-9a-f]+$/.test(value))
    throw new Error("Invalid bytecode");
  return value;
}

function splitMetadata(code: string) {
  const length = Number.parseInt(code.slice(-4), 16) * 2 + 4;
  if (length >= code.length) return { code, metadata: "" };
  const metadata = code.slice(-length);
  // Solidity's IPFS or compiler-only CBOR maps, including their encoded length.
  // Unsupported layouts are compared in full, never silently masked.
  if (
    !/^(?:a2646970667358221220[0-9a-f]{64}64736f6c6343[0-9a-f]{6}0033|a164736f6c6343[0-9a-f]{6}000a)$/.test(
      metadata,
    )
  )
    return { code, metadata: "" };
  return { code: code.slice(0, -length), metadata };
}

export function compareRuntime(
  compiled: string,
  onchain: string,
  references: ImmutableReferences,
) {
  const source = splitMetadata(bytes(compiled));
  const target = splitMetadata(bytes(onchain));
  if (source.code.length !== target.code.length)
    throw new Error("Executable bytecode length differs");
  let patched = source.code;
  const immutables: Record<string, string> = {};
  const occupied = new Set<number>();
  for (const [id, slots] of Object.entries(references)) {
    if (!slots.length) throw new Error("Empty immutable references");
    for (const { start, length } of slots) {
      if (
        !Number.isSafeInteger(start) ||
        start < 0 ||
        length !== 32 ||
        (start + length) * 2 > source.code.length
      )
        throw new Error("Invalid immutable range");
      for (let offset = start; offset < start + length; offset++) {
        if (occupied.has(offset))
          throw new Error("Overlapping immutable ranges");
        occupied.add(offset);
      }
      if (
        source.code.slice(start * 2, (start + length) * 2) !==
        "00".repeat(length)
      )
        throw new Error("Compiler immutable placeholder is not zero");
      const value = target.code.slice(start * 2, (start + length) * 2);
      if (immutables[id] && immutables[id] !== `0x${value}`)
        throw new Error("Inconsistent immutable values");
      immutables[id] = `0x${value}`;
      patched =
        patched.slice(0, start * 2) +
        value +
        patched.slice((start + length) * 2);
    }
  }
  if (patched !== target.code) throw new Error("Executable bytecode differs");
  if (
    source.metadata &&
    target.metadata &&
    source.metadata.slice(-10, -4) !== target.metadata.slice(-10, -4)
  )
    throw new Error("Metadata compiler versions differ");
  return {
    exact: source.metadata === target.metadata,
    immutables,
    compiledMetadata: source.metadata,
    onchainMetadata: target.metadata,
  };
}
