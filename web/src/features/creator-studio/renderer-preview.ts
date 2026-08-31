export const maxRendererPreviewDataUriBytes = 8 * 1024 * 1024;

export type RendererSurface = "svg";

export type DecodedDataURI = {
  mime: string;
  bytes: Uint8Array<ArrayBuffer>;
  text: string;
};

export type RendererTokenMetadata = {
  name: string;
  description: string;
  image: string;
  external_url: string;
  attributes: unknown[];
  [key: string]: unknown;
};

export type DecodedRendererTokenURI = {
  metadata: RendererTokenMetadata;
  metadataBytes: Uint8Array<ArrayBuffer>;
  svg: string;
  svgBytes: Uint8Array<ArrayBuffer>;
};

const base64Pattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function parseDataURI(value: string) {
  if (new TextEncoder().encode(value).length > maxRendererPreviewDataUriBytes) {
    throw new Error(
      "The renderer preview exceeds the supported response size.",
    );
  }
  if (!value.startsWith("data:")) {
    throw new Error("The renderer response is not a data URI.");
  }
  const separator = value.indexOf(",");
  if (separator === -1) {
    throw new Error("The renderer data URI is missing its payload separator.");
  }
  const header = value.slice(5, separator);
  if (!header.endsWith(";base64")) {
    throw new Error("The renderer data URI must use Base64 encoding.");
  }
  const mime = header.slice(0, -7);
  if (!mime || mime.includes(";")) {
    throw new Error("The renderer data URI has an unsupported media type.");
  }
  return { mime, base64: value.slice(separator + 1) };
}

function decodeBase64(base64: string): Uint8Array<ArrayBuffer> {
  if (!base64 || base64.length % 4 !== 0 || !base64Pattern.test(base64)) {
    throw new Error("The renderer returned malformed Base64 data.");
  }
  let binary: string;
  try {
    binary = globalThis.atob(base64);
  } catch {
    throw new Error("The renderer returned malformed Base64 data.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeUTF8(bytes: Uint8Array<ArrayBuffer>) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("The renderer returned invalid UTF-8 text.");
  }
}

export function decodeRendererDataURI(
  value: string,
  expectedMime: string,
): DecodedDataURI {
  const parsed = parseDataURI(value);
  if (parsed.mime !== expectedMime) {
    throw new Error(
      `Expected renderer media type ${expectedMime}, received ${parsed.mime}.`,
    );
  }
  const bytes = decodeBase64(parsed.base64);
  return { mime: parsed.mime, bytes, text: decodeUTF8(bytes) };
}

export function decodeRendererSurface(
  value: string,
  surface: RendererSurface,
): DecodedDataURI {
  const mime = "image/svg+xml";
  if (value.startsWith("data:")) {
    return decodeRendererDataURI(value, mime);
  }
  const looksValid = /^\s*<svg(?:\s|>)/.test(value);
  if (!looksValid) {
    throw new Error(
      `The renderer returned malformed ${surface.toUpperCase()}.`,
    );
  }
  const bytes = new TextEncoder().encode(value);
  return { mime, bytes, text: value };
}

function isRendererMetadata(value: unknown): value is RendererTokenMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.name === "string" &&
    typeof record.description === "string" &&
    typeof record.image === "string" &&
    typeof record.external_url === "string" &&
    Array.isArray(record.attributes)
  );
}

export function decodeRendererTokenURI(
  tokenURI: string,
): DecodedRendererTokenURI {
  const decodedMetadata = decodeRendererDataURI(tokenURI, "application/json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodedMetadata.text);
  } catch {
    throw new Error("The renderer returned malformed token metadata JSON.");
  }
  if (!isRendererMetadata(parsed)) {
    throw new Error(
      "The renderer returned an incomplete token metadata object.",
    );
  }

  const decodedSVG = decodeRendererDataURI(parsed.image, "image/svg+xml");
  if (!/^\s*<svg(?:\s|>)/.test(decodedSVG.text)) {
    throw new Error("The token image does not contain an SVG document.");
  }

  return {
    metadata: parsed,
    metadataBytes: decodedMetadata.bytes,
    svg: decodedSVG.text,
    svgBytes: decodedSVG.bytes,
  };
}
