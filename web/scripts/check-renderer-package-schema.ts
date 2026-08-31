import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }

  return value;
}

async function readSchema(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

const webRoot = process.cwd();
const specificationPath = resolve(
  webRoot,
  "../specs/001-onchain-renderer-ecosystem/contracts/renderer-package.schema.json",
);
const runtimePath = resolve(
  webRoot,
  "src/features/renderer-lab/renderer-package.schema.json",
);

const [specificationSchema, runtimeSchema] = await Promise.all([
  readSchema(specificationPath),
  readSchema(runtimePath),
]);

const specification = JSON.stringify(canonicalize(specificationSchema));
const runtime = JSON.stringify(canonicalize(runtimeSchema));

if (specification !== runtime) {
  console.error(
    "Renderer package schema drift detected. Copy the specification schema into the renderer lab before continuing.",
  );
  process.exitCode = 1;
} else {
  console.log("Renderer package schemas match.");
}
