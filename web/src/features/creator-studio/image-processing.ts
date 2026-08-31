export const imageSourceLimits = {
  maxBytes: 20 * 1024 * 1024,
  maxSide: 12_000,
  maxPixels: 40_000_000,
} as const;

export const outputDimensions = [256, 384, 512] as const;
export type OutputDimension = (typeof outputDimensions)[number];
export const defaultOutputDimension: OutputDimension = 512;
export const jpegQualityBounds = { min: 0.55, max: 0.95, step: 0.01 } as const;
export const defaultJpegQuality = 0.84;
export const maxRenderableMediaBytes = 90 * 1024;

export const estimatedWorstCaseWorkingSetBytes =
  imageSourceLimits.maxBytes +
  imageSourceLimits.maxPixels * 4 +
  outputDimensions.at(-1)! ** 2 * 4 +
  maxRenderableMediaBytes;

export type SupportedImageMIME = "image/jpeg" | "image/png";
export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type ImageHeader = {
  mime: SupportedImageMIME;
  width: number;
  height: number;
  orientedWidth: number;
  orientedHeight: number;
  orientation: ExifOrientation;
  transparency: "none" | "present" | "possible";
};

export type ImageProcessingErrorCode =
  | "empty-source"
  | "source-too-large"
  | "unsupported-type"
  | "truncated-header"
  | "invalid-header"
  | "invalid-exif"
  | "dimensions-too-large"
  | "pixels-too-large"
  | "invalid-output"
  | "png-not-beneficial"
  | "unsupported-browser"
  | "source-read-failed"
  | "decode-failed"
  | "decoded-dimensions-mismatch"
  | "canvas-unavailable"
  | "encode-failed"
  | "candidate-too-large";

export class ImageProcessingError extends Error {
  readonly code: ImageProcessingErrorCode;

  constructor(code: ImageProcessingErrorCode, message: string) {
    super(message);
    this.name = "ImageProcessingError";
    this.code = code;
  }
}

export type SquareCrop = {
  x: number;
  y: number;
  size: number;
};

export type OrientationMatrix = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

export type BitmapLike = {
  width: number;
  height: number;
  close(): void;
};

export type CanvasContextLike = {
  fillStyle: string | CanvasGradient | CanvasPattern;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
  fillRect(x: number, y: number, width: number, height: number): void;
  setTransform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ): void;
  drawImage(image: unknown, dx: number, dy: number): void;
};

export type CanvasLike = {
  width: number;
  height: number;
  getContext(
    contextId: "2d",
    options?: CanvasRenderingContext2DSettings,
  ): CanvasContextLike | null;
  toBlob(callback: BlobCallback, type?: string, quality?: number): void;
};

export type ImageProcessingPlatform = {
  createBitmap(source: Blob, options: ImageBitmapOptions): Promise<BitmapLike>;
  createCanvas(dimension: OutputDimension): CanvasLike;
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
};

export type ImageOutputOptions =
  | { mime: "image/jpeg"; quality: number; background?: string }
  | {
      mime: "image/png";
      purpose: "transparency" | "flat-art";
    };

export type ProcessImageOptions = {
  dimension?: OutputDimension;
  focalX?: number;
  focalY?: number;
  output: ImageOutputOptions;
  maxCandidateBytes?: number;
};

export type ExactMediaCandidate = {
  readonly mime: SupportedImageMIME;
  readonly dimension: OutputDimension;
  readonly quality: number | null;
  readonly byteLength: number;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly previewBytes: Uint8Array<ArrayBuffer>;
  readonly rendererCallBytes: Uint8Array<ArrayBuffer>;
  readonly gasEstimateBytes: Uint8Array<ArrayBuffer>;
  readonly writeBytes: Uint8Array<ArrayBuffer>;
  readonly objectURL: string;
  dispose(): void;
};

function processingError(
  code: ImageProcessingErrorCode,
  message: string,
): never {
  throw new ImageProcessingError(code, message);
}

function readUint16(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function pngHeader(bytes: Uint8Array): ImageHeader {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33) {
    return processingError(
      "truncated-header",
      "The PNG ends before its complete IHDR header.",
    );
  }
  if (!signature.every((value, index) => bytes[index] === value)) {
    return processingError("invalid-header", "The PNG signature is invalid.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ihdrLength = view.getUint32(8);
  const ihdrType = String.fromCharCode(...bytes.slice(12, 16));
  if (ihdrLength !== 13 || ihdrType !== "IHDR") {
    return processingError(
      "invalid-header",
      "The PNG must begin with one 13-byte IHDR chunk.",
    );
  }
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  const validBitDepth =
    (colorType === 0 && [1, 2, 4, 8, 16].includes(bitDepth)) ||
    (colorType === 2 && [8, 16].includes(bitDepth)) ||
    (colorType === 3 && [1, 2, 4, 8].includes(bitDepth)) ||
    ((colorType === 4 || colorType === 6) && [8, 16].includes(bitDepth));
  if (
    width === 0 ||
    height === 0 ||
    !validBitDepth ||
    bytes[26] !== 0 ||
    bytes[27] !== 0 ||
    (bytes[28] !== 0 && bytes[28] !== 1)
  ) {
    return processingError(
      "invalid-header",
      "The PNG IHDR values are invalid.",
    );
  }
  let transparency: ImageHeader["transparency"] =
    colorType === 4 || colorType === 6 ? "present" : "none";
  if (transparency === "none") {
    let chunkOffset = 33;
    while (chunkOffset + 12 <= bytes.length) {
      const chunkLength = view.getUint32(chunkOffset);
      const chunkEnd = chunkOffset + 12 + chunkLength;
      if (chunkEnd > bytes.length) break;
      const chunkType = String.fromCharCode(
        ...bytes.slice(chunkOffset + 4, chunkOffset + 8),
      );
      if (chunkType === "tRNS") {
        transparency = "present";
        break;
      }
      if (chunkType === "IDAT" || chunkType === "IEND") break;
      chunkOffset = chunkEnd;
    }
  }
  return {
    mime: "image/png",
    width,
    height,
    orientedWidth: width,
    orientedHeight: height,
    orientation: 1,
    transparency,
  };
}

type ExifOrientationField = {
  orientation: ExifOrientation;
  valueOffset?: number;
  littleEndian?: boolean;
};

function exifOrientationField(
  bytes: Uint8Array,
  start: number,
  end: number,
): ExifOrientationField | undefined {
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0];
  if (end - start < exif.length) return undefined;
  if (!exif.every((value, index) => bytes[start + index] === value)) {
    return undefined;
  }
  const tiffStart = start + 6;
  if (end - tiffStart < 8) {
    return processingError(
      "invalid-exif",
      "The JPEG EXIF header is truncated.",
    );
  }
  const byteOrder = String.fromCharCode(bytes[tiffStart], bytes[tiffStart + 1]);
  if (byteOrder !== "II" && byteOrder !== "MM") {
    return processingError(
      "invalid-exif",
      "The JPEG EXIF byte order is invalid.",
    );
  }
  const littleEndian = byteOrder === "II";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(tiffStart + 2, littleEndian) !== 42) {
    return processingError("invalid-exif", "The JPEG EXIF marker is invalid.");
  }
  const ifdOffset = view.getUint32(tiffStart + 4, littleEndian);
  const ifdStart = tiffStart + ifdOffset;
  if (ifdStart < tiffStart || ifdStart + 2 > end) {
    return processingError(
      "invalid-exif",
      "The JPEG EXIF directory is out of bounds.",
    );
  }
  const entryCount = view.getUint16(ifdStart, littleEndian);
  const entriesEnd = ifdStart + 2 + entryCount * 12;
  if (entriesEnd + 4 > end) {
    return processingError(
      "invalid-exif",
      "The JPEG EXIF directory is truncated.",
    );
  }
  for (let index = 0; index < entryCount; index += 1) {
    const entry = ifdStart + 2 + index * 12;
    if (view.getUint16(entry, littleEndian) !== 0x0112) continue;
    if (
      view.getUint16(entry + 2, littleEndian) !== 3 ||
      view.getUint32(entry + 4, littleEndian) !== 1
    ) {
      return processingError(
        "invalid-exif",
        "The JPEG EXIF orientation field is invalid.",
      );
    }
    const orientation = view.getUint16(entry + 8, littleEndian);
    if (orientation < 1 || orientation > 8) {
      return processingError(
        "invalid-exif",
        "The JPEG EXIF orientation must be between 1 and 8.",
      );
    }
    return {
      orientation: orientation as ExifOrientation,
      valueOffset: entry + 8,
      littleEndian,
    };
  }
  return { orientation: 1 };
}

function isStartOfFrame(marker: number) {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function jpegHeader(bytes: Uint8Array): ImageHeader {
  if (bytes.length < 4) {
    return processingError(
      "truncated-header",
      "The JPEG ends before its first marker segment.",
    );
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return processingError("invalid-header", "The JPEG signature is invalid.");
  }
  let orientation: ExifOrientation = 1;
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      return processingError(
        "invalid-header",
        "The JPEG marker stream is invalid.",
      );
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) {
      return processingError(
        "truncated-header",
        "The JPEG ends inside a marker.",
      );
    }
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0 || marker === 0xd8) {
      return processingError(
        "invalid-header",
        "The JPEG contains an invalid marker.",
      );
    }
    if (marker === 0xd9 || marker === 0xda) {
      return processingError(
        "invalid-header",
        "The JPEG has no supported start-of-frame dimensions.",
      );
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) {
      return processingError(
        "truncated-header",
        "The JPEG marker length is truncated.",
      );
    }
    const segmentLength = readUint16(bytes, offset);
    if (segmentLength < 2) {
      return processingError(
        "invalid-header",
        "The JPEG contains an invalid marker length.",
      );
    }
    const dataStart = offset + 2;
    const segmentEnd = offset + segmentLength;
    if (segmentEnd > bytes.length) {
      return processingError(
        "truncated-header",
        "The JPEG ends inside a marker segment.",
      );
    }
    if (marker === 0xe1) {
      orientation =
        exifOrientationField(bytes, dataStart, segmentEnd)?.orientation ??
        orientation;
    }
    if (isStartOfFrame(marker)) {
      if (segmentLength < 8) {
        return processingError(
          "invalid-header",
          "The JPEG start-of-frame segment is invalid.",
        );
      }
      const height = readUint16(bytes, dataStart + 1);
      const width = readUint16(bytes, dataStart + 3);
      if (width === 0 || height === 0) {
        return processingError(
          "invalid-header",
          "The JPEG dimensions must be non-zero.",
        );
      }
      const swapsAxes = orientation >= 5;
      return {
        mime: "image/jpeg",
        width,
        height,
        orientedWidth: swapsAxes ? height : width,
        orientedHeight: swapsAxes ? width : height,
        orientation,
        transparency: "none",
      };
    }
    offset = segmentEnd;
  }
  return processingError(
    "truncated-header",
    "The JPEG ends before its dimensions are declared.",
  );
}

function normalizedJpegBytesForDecode(
  bytes: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
  let normalized: Uint8Array<ArrayBuffer> | undefined;
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0 || marker === 0xd8 || offset + 2 > bytes.length) break;
    const segmentLength = readUint16(bytes, offset);
    if (segmentLength < 2) break;
    const dataStart = offset + 2;
    const segmentEnd = offset + segmentLength;
    if (segmentEnd > bytes.length) break;
    if (marker === 0xe1) {
      const field = exifOrientationField(bytes, dataStart, segmentEnd);
      if (
        field?.valueOffset !== undefined &&
        field.littleEndian !== undefined &&
        field.orientation !== 1
      ) {
        normalized ??= new Uint8Array(bytes);
        new DataView(
          normalized.buffer,
          normalized.byteOffset,
          normalized.byteLength,
        ).setUint16(field.valueOffset, 1, field.littleEndian);
      }
    }
    offset = segmentEnd;
  }
  return normalized ?? bytes;
}

export function parseImageHeader(bytes: Uint8Array): ImageHeader {
  if (bytes.length === 0) {
    return processingError("empty-source", "Choose a non-empty JPEG or PNG.");
  }
  if (bytes[0] === 0x89) return pngHeader(bytes);
  if (bytes[0] === 0xff) return jpegHeader(bytes);
  return processingError(
    "unsupported-type",
    "Choose a JPEG or PNG image. Other formats are not supported.",
  );
}

export function inspectImageBytes(bytes: Uint8Array): ImageHeader {
  if (bytes.length > imageSourceLimits.maxBytes) {
    return processingError(
      "source-too-large",
      "The source image exceeds the 20 MiB browser processing limit.",
    );
  }
  const header = parseImageHeader(bytes);
  if (
    header.width > imageSourceLimits.maxSide ||
    header.height > imageSourceLimits.maxSide
  ) {
    return processingError(
      "dimensions-too-large",
      `Source width and height must each be at most ${imageSourceLimits.maxSide.toLocaleString("en-US")} pixels.`,
    );
  }
  if (header.width * header.height > imageSourceLimits.maxPixels) {
    return processingError(
      "pixels-too-large",
      "The source image exceeds the 40 megapixel browser processing limit.",
    );
  }
  return header;
}

export function computeSquareCrop(
  width: number,
  height: number,
  focalX: number,
  focalY: number,
): SquareCrop {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(focalX) ||
    !Number.isFinite(focalY) ||
    focalX < 0 ||
    focalX > 100 ||
    focalY < 0 ||
    focalY > 100
  ) {
    return processingError(
      "invalid-output",
      "Crop dimensions and focal points must stay within their bounds.",
    );
  }
  const size = Math.min(width, height);
  const x = Math.min(
    width - size,
    Math.max(0, (focalX / 100) * width - size / 2),
  );
  const y = Math.min(
    height - size,
    Math.max(0, (focalY / 100) * height - size / 2),
  );
  return { x, y, size };
}

export function sourceOrientationMatrix(
  orientation: ExifOrientation,
  width: number,
  height: number,
): OrientationMatrix {
  if (orientation === 1) return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  if (orientation === 2) return { a: -1, b: 0, c: 0, d: 1, e: width, f: 0 };
  if (orientation === 3)
    return { a: -1, b: 0, c: 0, d: -1, e: width, f: height };
  if (orientation === 4) return { a: 1, b: 0, c: 0, d: -1, e: 0, f: height };
  if (orientation === 5) return { a: 0, b: 1, c: 1, d: 0, e: 0, f: 0 };
  if (orientation === 6) return { a: 0, b: 1, c: -1, d: 0, e: height, f: 0 };
  if (orientation === 7)
    return { a: 0, b: -1, c: -1, d: 0, e: height, f: width };
  return { a: 0, b: -1, c: 1, d: 0, e: 0, f: width };
}

export function cropTransform(
  header: ImageHeader,
  crop: SquareCrop,
  outputDimension: OutputDimension,
  orientation = header.orientation,
): OrientationMatrix {
  const source = sourceOrientationMatrix(
    orientation,
    header.width,
    header.height,
  );
  const scale = outputDimension / crop.size;
  return {
    a: source.a * scale,
    b: source.b * scale,
    c: source.c * scale,
    d: source.d * scale,
    e: (source.e - crop.x) * scale,
    f: (source.f - crop.y) * scale,
  };
}

function browserPlatform(): ImageProcessingPlatform {
  if (
    typeof globalThis.createImageBitmap !== "function" ||
    typeof document === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return processingError(
      "unsupported-browser",
      "This browser cannot decode and re-encode images locally.",
    );
  }
  return {
    createBitmap: (source, options) =>
      globalThis.createImageBitmap(source, options),
    createCanvas(dimension) {
      const canvas = document.createElement("canvas");
      canvas.width = dimension;
      canvas.height = dimension;
      return canvas as unknown as CanvasLike;
    },
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
  };
}

function validateOutputOptions(options: ProcessImageOptions) {
  const dimension = options.dimension ?? defaultOutputDimension;
  if (!outputDimensions.includes(dimension)) {
    return processingError(
      "invalid-output",
      "Choose a 256, 384, or 512 pixel square output.",
    );
  }
  const focalX = options.focalX ?? 50;
  const focalY = options.focalY ?? 50;
  if (
    focalX < 0 ||
    focalX > 100 ||
    focalY < 0 ||
    focalY > 100 ||
    !Number.isFinite(focalX) ||
    !Number.isFinite(focalY)
  ) {
    return processingError(
      "invalid-output",
      "Focal points must be between 0 and 100.",
    );
  }
  if (
    options.output.mime === "image/jpeg" &&
    (!Number.isFinite(options.output.quality) ||
      options.output.quality < jpegQualityBounds.min ||
      options.output.quality > jpegQualityBounds.max)
  ) {
    return processingError(
      "invalid-output",
      `JPEG quality must be between ${jpegQualityBounds.min} and ${jpegQualityBounds.max}.`,
    );
  }
  const maxCandidateBytes =
    options.maxCandidateBytes ?? maxRenderableMediaBytes;
  if (
    !Number.isSafeInteger(maxCandidateBytes) ||
    maxCandidateBytes <= 0 ||
    maxCandidateBytes > maxRenderableMediaBytes
  ) {
    return processingError(
      "invalid-output",
      "The candidate byte limit exceeds the renderer-safe maximum.",
    );
  }
  return { dimension, focalX, focalY, maxCandidateBytes };
}

function canvasBlob(
  canvas: CanvasLike,
  output: ImageOutputOptions,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else
            reject(
              new ImageProcessingError(
                "encode-failed",
                "The browser could not encode this image.",
              ),
            );
        },
        output.mime,
        output.mime === "image/jpeg" ? output.quality : undefined,
      );
    } catch {
      reject(
        new ImageProcessingError(
          "encode-failed",
          "The browser could not encode this image.",
        ),
      );
    }
  });
}

function exactCandidate(
  bytes: Uint8Array<ArrayBuffer>,
  mime: SupportedImageMIME,
  dimension: OutputDimension,
  quality: number | null,
  platform: ImageProcessingPlatform,
): ExactMediaCandidate {
  const objectURL = platform.createObjectURL(new Blob([bytes], { type: mime }));
  let disposed = false;
  return {
    mime,
    dimension,
    quality,
    byteLength: bytes.byteLength,
    bytes,
    previewBytes: bytes,
    rendererCallBytes: bytes,
    gasEstimateBytes: bytes,
    writeBytes: bytes,
    objectURL,
    dispose() {
      if (disposed) return;
      disposed = true;
      platform.revokeObjectURL(objectURL);
    },
  };
}

export async function processImageSource(
  source: Blob,
  options: ProcessImageOptions,
  suppliedPlatform?: ImageProcessingPlatform,
): Promise<ExactMediaCandidate> {
  if (source.size === 0) {
    return processingError("empty-source", "Choose a non-empty JPEG or PNG.");
  }
  if (source.size > imageSourceLimits.maxBytes) {
    return processingError(
      "source-too-large",
      "The source image exceeds the 20 MiB browser processing limit.",
    );
  }
  const normalized = validateOutputOptions(options);
  let sourceBuffer: ArrayBuffer;
  try {
    sourceBuffer = await source.arrayBuffer();
  } catch {
    return processingError(
      "source-read-failed",
      "The browser could not read the selected local image.",
    );
  }
  const sourceBytes = new Uint8Array(sourceBuffer);
  const header = inspectImageBytes(sourceBytes);
  if (
    options.output.mime === "image/png" &&
    options.output.purpose === "transparency" &&
    header.transparency === "none"
  ) {
    return processingError(
      "png-not-beneficial",
      "This source has no transparency. Use JPEG, or mark it as flat artwork to keep PNG.",
    );
  }
  const platform = suppliedPlatform ?? browserPlatform();
  const decodeBytes =
    header.mime === "image/jpeg"
      ? normalizedJpegBytesForDecode(sourceBytes)
      : sourceBytes;

  let bitmap: BitmapLike;
  try {
    bitmap = await platform.createBitmap(
      new Blob([decodeBytes], { type: header.mime }),
      { imageOrientation: "none" },
    );
  } catch {
    return processingError(
      "decode-failed",
      "The browser could not decode this JPEG or PNG.",
    );
  }

  let canvas: CanvasLike | undefined;
  try {
    try {
      canvas = platform.createCanvas(normalized.dimension);
    } catch {
      return processingError(
        "canvas-unavailable",
        "The browser could not create an image canvas.",
      );
    }
    canvas.width = normalized.dimension;
    canvas.height = normalized.dimension;
    if (bitmap.width !== header.width || bitmap.height !== header.height) {
      return processingError(
        "decoded-dimensions-mismatch",
        "Decoded dimensions do not match the validated image header.",
      );
    }
    const crop = computeSquareCrop(
      header.orientedWidth,
      header.orientedHeight,
      normalized.focalX,
      normalized.focalY,
    );
    const context = canvas.getContext("2d", {
      alpha: options.output.mime === "image/png",
      colorSpace: "srgb",
    });
    if (!context) {
      return processingError(
        "canvas-unavailable",
        "The browser could not create an image canvas.",
      );
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    if (options.output.mime === "image/jpeg") {
      context.fillStyle = options.output.background ?? "#120b0a";
      context.fillRect(0, 0, normalized.dimension, normalized.dimension);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    const transform = cropTransform(
      header,
      crop,
      normalized.dimension,
      header.orientation,
    );
    context.setTransform(
      transform.a,
      transform.b,
      transform.c,
      transform.d,
      transform.e,
      transform.f,
    );
    context.drawImage(bitmap, 0, 0);

    const encoded = await canvasBlob(canvas, options.output);
    if (encoded.type !== options.output.mime) {
      return processingError(
        "encode-failed",
        `The browser encoded ${encoded.type || "an unknown format"} instead of ${options.output.mime}.`,
      );
    }
    const bytes = new Uint8Array(await encoded.arrayBuffer());
    const validSignature =
      options.output.mime === "image/jpeg"
        ? bytes.length >= 3 &&
          bytes[0] === 0xff &&
          bytes[1] === 0xd8 &&
          bytes[2] === 0xff
        : bytes.length >= 8 &&
          [137, 80, 78, 71, 13, 10, 26, 10].every(
            (value, index) => bytes[index] === value,
          );
    if (!validSignature) {
      return processingError(
        "encode-failed",
        "The browser returned bytes that do not match the selected image format.",
      );
    }
    if (bytes.byteLength > normalized.maxCandidateBytes) {
      return processingError(
        "candidate-too-large",
        `The encoded image is ${bytes.byteLength.toLocaleString("en-US")} bytes; reduce quality or dimensions to fit ${normalized.maxCandidateBytes.toLocaleString("en-US")} bytes.`,
      );
    }
    return exactCandidate(
      bytes,
      options.output.mime,
      normalized.dimension,
      options.output.mime === "image/jpeg" ? options.output.quality : null,
      platform,
    );
  } finally {
    bitmap.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

export class MediaCandidateOwner {
  #current: ExactMediaCandidate | undefined;

  get current() {
    return this.#current;
  }

  replace(candidate: ExactMediaCandidate | undefined) {
    if (candidate === this.#current) return;
    this.#current?.dispose();
    this.#current = candidate;
  }

  dispose() {
    this.replace(undefined);
  }
}
