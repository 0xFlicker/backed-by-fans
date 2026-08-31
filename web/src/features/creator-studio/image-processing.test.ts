import { describe, expect, it, vi } from "vitest";

import {
  computeSquareCrop,
  imageSourceLimits,
  inspectImageBytes,
  MediaCandidateOwner,
  parseImageHeader,
  processImageSource,
  sourceOrientationMatrix,
  type CanvasContextLike,
  type CanvasLike,
  type ImageProcessingPlatform,
  type OutputDimension,
} from "@/features/creator-studio/image-processing";

function png(width: number, height: number, colorType = 6) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = colorType;
  return bytes;
}

function jpeg(width: number, height: number, orientation = 1) {
  const tiff = new Uint8Array(26);
  tiff.set([0x49, 0x49, 0x2a, 0x00]);
  new DataView(tiff.buffer).setUint32(4, 8, true);
  new DataView(tiff.buffer).setUint16(8, 1, true);
  new DataView(tiff.buffer).setUint16(10, 0x0112, true);
  new DataView(tiff.buffer).setUint16(12, 3, true);
  new DataView(tiff.buffer).setUint32(14, 1, true);
  new DataView(tiff.buffer).setUint16(18, orientation, true);
  const exif = new Uint8Array(6 + tiff.length);
  exif.set([0x45, 0x78, 0x69, 0x66, 0, 0]);
  exif.set(tiff, 6);

  const appLength = exif.length + 2;
  const app = new Uint8Array(4 + exif.length);
  app.set([0xff, 0xe1, appLength >> 8, appLength & 0xff]);
  app.set(exif, 4);
  const sof = new Uint8Array([
    0xff,
    0xc0,
    0,
    11,
    8,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    1,
    1,
    0x11,
    0,
  ]);
  const bytes = new Uint8Array(2 + app.length + sof.length);
  bytes.set([0xff, 0xd8]);
  bytes.set(app, 2);
  bytes.set(sof, 2 + app.length);
  return bytes;
}

function fakePlatform(input: {
  sourceWidth: number;
  sourceHeight: number;
  encodedBytes?: Uint8Array<ArrayBuffer>;
}) {
  const close = vi.fn();
  const setTransform = vi.fn();
  const drawImage = vi.fn();
  const fillRect = vi.fn();
  const revokeObjectURL = vi.fn();
  const context: CanvasContextLike = {
    fillStyle: "",
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
    fillRect,
    setTransform,
    drawImage,
  };
  const canvases: CanvasLike[] = [];
  const platform: ImageProcessingPlatform = {
    createBitmap: vi.fn().mockResolvedValue({
      width: input.sourceWidth,
      height: input.sourceHeight,
      close,
    }),
    createCanvas(dimension: OutputDimension) {
      const canvas: CanvasLike = {
        width: dimension,
        height: dimension,
        getContext: () => context,
        toBlob(callback, mime) {
          const defaultBytes =
            mime === "image/png"
              ? new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
              : new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
          callback(
            new Blob([input.encodedBytes ?? defaultBytes], {
              type: mime,
            }),
          );
        },
      };
      canvases.push(canvas);
      return canvas;
    },
    createObjectURL: vi.fn(() => "blob:creator-candidate"),
    revokeObjectURL,
  };
  return {
    platform,
    close,
    setTransform,
    drawImage,
    fillRect,
    revokeObjectURL,
    canvases,
  };
}

describe("bounded browser image processing", () => {
  it("parses PNG dimensions and transparency from a complete IHDR", () => {
    expect(parseImageHeader(png(800, 1_200))).toEqual({
      mime: "image/png",
      width: 800,
      height: 1_200,
      orientedWidth: 800,
      orientedHeight: 1_200,
      orientation: 1,
      transparency: "present",
    });
    expect(parseImageHeader(png(800, 800, 2)).transparency).toBe("none");
  });

  it("parses JPEG SOF dimensions and all EXIF axis orientations", () => {
    expect(parseImageHeader(jpeg(1_200, 800, 1))).toMatchObject({
      width: 1_200,
      height: 800,
      orientedWidth: 1_200,
      orientedHeight: 800,
      orientation: 1,
    });
    expect(parseImageHeader(jpeg(1_200, 800, 6))).toMatchObject({
      orientedWidth: 800,
      orientedHeight: 1_200,
      orientation: 6,
    });
    expect(sourceOrientationMatrix(8, 1_200, 800)).toEqual({
      a: 0,
      b: -1,
      c: 1,
      d: 0,
      e: 0,
      f: 1_200,
    });
  });

  it("maps every EXIF orientation into its declared oriented bounds", () => {
    const width = 1_200;
    const height = 800;
    for (let value = 1; value <= 8; value += 1) {
      const orientation = value as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
      const matrix = sourceOrientationMatrix(orientation, width, height);
      const corners = [
        [0, 0],
        [width, 0],
        [0, height],
        [width, height],
      ].map(([x, y]) => ({
        x: matrix.a * x + matrix.c * y + matrix.e,
        y: matrix.b * x + matrix.d * y + matrix.f,
      }));
      const orientedWidth = orientation >= 5 ? height : width;
      const orientedHeight = orientation >= 5 ? width : height;
      expect(corners.map((point) => point.x).sort((a, b) => a - b)).toEqual([
        0,
        0,
        orientedWidth,
        orientedWidth,
      ]);
      expect(corners.map((point) => point.y).sort((a, b) => a - b)).toEqual([
        0,
        0,
        orientedHeight,
        orientedHeight,
      ]);
    }
  });

  it.each([
    [new Uint8Array(), "empty-source"],
    [new Uint8Array([1, 2, 3]), "unsupported-type"],
    [png(1, 1).slice(0, 24), "truncated-header"],
    [jpeg(10, 10).slice(0, -3), "truncated-header"],
    [jpeg(10, 10, 9), "invalid-exif"],
  ])("rejects malformed or truncated headers before decode", (bytes, code) => {
    expect(() => inspectImageBytes(bytes)).toThrow(
      expect.objectContaining({ code }),
    );
  });

  it("rejects decompression bombs before invoking a browser decoder", async () => {
    const platform = fakePlatform({
      sourceWidth: 20_000,
      sourceHeight: 20_000,
    });
    const bomb = new Blob([png(20_000, 20_000)]);
    await expect(
      processImageSource(
        bomb,
        { output: { mime: "image/jpeg", quality: 0.8 } },
        platform.platform,
      ),
    ).rejects.toMatchObject({ code: "dimensions-too-large" });
    expect(platform.platform.createBitmap).not.toHaveBeenCalled();

    const oversized = {
      size: imageSourceLimits.maxBytes + 1,
      arrayBuffer: vi.fn(),
    } as unknown as Blob;
    await expect(
      processImageSource(
        oversized,
        { output: { mime: "image/jpeg", quality: 0.8 } },
        platform.platform,
      ),
    ).rejects.toMatchObject({ code: "source-too-large" });
    expect(oversized.arrayBuffer).not.toHaveBeenCalled();
  });

  it("keeps portrait, landscape, square, and edge focal crops in bounds", () => {
    expect(computeSquareCrop(1_200, 800, 0, 50)).toEqual({
      x: 0,
      y: 0,
      size: 800,
    });
    expect(computeSquareCrop(1_200, 800, 100, 50)).toEqual({
      x: 400,
      y: 0,
      size: 800,
    });
    expect(computeSquareCrop(800, 1_200, 50, 100)).toEqual({
      x: 0,
      y: 400,
      size: 800,
    });
    expect(computeSquareCrop(800, 800, 0, 100)).toEqual({
      x: 0,
      y: 0,
      size: 800,
    });
  });

  it("applies EXIF orientation, focal crop, resize, and canvas cleanup", async () => {
    const fake = fakePlatform({ sourceWidth: 1_200, sourceHeight: 800 });
    const candidate = await processImageSource(
      new Blob([jpeg(1_200, 800, 6)]),
      {
        dimension: 768,
        focalX: 50,
        focalY: 100,
        output: { mime: "image/jpeg", quality: 0.82 },
      },
      fake.platform,
    );

    expect(fake.setTransform).toHaveBeenLastCalledWith(
      0,
      0.96,
      -0.96,
      0,
      768,
      -384,
    );
    expect(fake.drawImage).toHaveBeenCalledOnce();
    expect(fake.fillRect).toHaveBeenCalledWith(0, 0, 768, 768);
    expect(fake.close).toHaveBeenCalledOnce();
    expect(fake.canvases[0]).toMatchObject({ width: 0, height: 0 });
    expect(candidate).toMatchObject({
      mime: "image/jpeg",
      dimension: 768,
      quality: 0.82,
      byteLength: 4,
    });
  });

  it.each([
    [2, [-0.96, 0, 0, 0.96, 960, 0]],
    [3, [-0.96, 0, 0, -0.96, 960, 768]],
    [4, [0.96, 0, 0, -0.96, -192, 768]],
    [5, [0, 0.96, 0.96, 0, 0, -192]],
    [6, [0, 0.96, -0.96, 0, 768, -192]],
    [7, [0, -0.96, -0.96, 0, 768, 960]],
    [8, [0, -0.96, 0.96, 0, 0, 960]],
  ] as const)(
    "normalizes EXIF orientation %i before decode and applies its original transform",
    async (orientation, expectedTransform) => {
      const sourceBytes = jpeg(1_200, 800, orientation);
      const fake = fakePlatform({ sourceWidth: 1_200, sourceHeight: 800 });
      const candidate = await processImageSource(
        new Blob([sourceBytes]),
        {
          dimension: 768,
          focalX: 50,
          focalY: 50,
          output: { mime: "image/jpeg", quality: 0.82 },
        },
        fake.platform,
      );

      const [decodeSource, decodeOptions] = vi.mocked(
        fake.platform.createBitmap,
      ).mock.calls[0];
      const decodeBytes = new Uint8Array(await decodeSource.arrayBuffer());
      expect(parseImageHeader(decodeBytes).orientation).toBe(1);
      expect(parseImageHeader(sourceBytes).orientation).toBe(orientation);
      expect(decodeOptions).toEqual({ imageOrientation: "none" });
      expect(fake.setTransform).toHaveBeenLastCalledWith(...expectedTransform);

      candidate.dispose();
    },
  );

  it("owns one exact byte array for preview, quote, and write, then revokes it", async () => {
    const firstPlatform = fakePlatform({ sourceWidth: 800, sourceHeight: 800 });
    const first = await processImageSource(
      new Blob([png(800, 800)]),
      {
        dimension: 1_024,
        output: { mime: "image/png", purpose: "transparency" },
      },
      firstPlatform.platform,
    );
    expect(first.previewBytes).toBe(first.bytes);
    expect(first.rendererCallBytes).toBe(first.bytes);
    expect(first.gasEstimateBytes).toBe(first.bytes);
    expect(first.writeBytes).toBe(first.bytes);

    const secondPlatform = fakePlatform({
      sourceWidth: 800,
      sourceHeight: 800,
    });
    const second = await processImageSource(
      new Blob([png(800, 800)]),
      {
        dimension: 1_280,
        output: { mime: "image/jpeg", quality: 0.7 },
      },
      secondPlatform.platform,
    );
    const owner = new MediaCandidateOwner();
    owner.replace(first);
    owner.replace(second);
    expect(firstPlatform.revokeObjectURL).toHaveBeenCalledWith(
      "blob:creator-candidate",
    );
    owner.dispose();
    expect(secondPlatform.revokeObjectURL).toHaveBeenCalledWith(
      "blob:creator-candidate",
    );
  });

  it("keeps PNG only for transparency or declared flat artwork and within budget", async () => {
    const noAlpha = fakePlatform({ sourceWidth: 800, sourceHeight: 800 });
    await expect(
      processImageSource(
        new Blob([png(800, 800, 2)]),
        { output: { mime: "image/png", purpose: "transparency" } },
        noAlpha.platform,
      ),
    ).rejects.toMatchObject({ code: "png-not-beneficial" });
    expect(noAlpha.platform.createBitmap).not.toHaveBeenCalled();

    const tooLarge = fakePlatform({
      sourceWidth: 800,
      sourceHeight: 800,
      encodedBytes: new Uint8Array([
        137,
        80,
        78,
        71,
        13,
        10,
        26,
        10,
        ...new Uint8Array(93),
      ]),
    });
    await expect(
      processImageSource(
        new Blob([png(800, 800, 2)]),
        {
          output: { mime: "image/png", purpose: "flat-art" },
          maxCandidateBytes: 100,
        },
        tooLarge.platform,
      ),
    ).rejects.toMatchObject({ code: "candidate-too-large" });
  });

  it("fails inline when decode and encode capabilities fail", async () => {
    const decodeFailure = fakePlatform({ sourceWidth: 800, sourceHeight: 800 });
    vi.mocked(decodeFailure.platform.createBitmap).mockRejectedValue(
      new Error("decoder refused"),
    );
    await expect(
      processImageSource(
        new Blob([png(800, 800)]),
        { output: { mime: "image/jpeg", quality: 0.8 } },
        decodeFailure.platform,
      ),
    ).rejects.toMatchObject({ code: "decode-failed" });

    const encodeFailure = fakePlatform({ sourceWidth: 800, sourceHeight: 800 });
    encodeFailure.platform.createCanvas = (dimension) => ({
      width: dimension,
      height: dimension,
      getContext: () => ({
        fillStyle: "",
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
        fillRect: vi.fn(),
        setTransform: vi.fn(),
        drawImage: vi.fn(),
      }),
      toBlob: (callback) => callback(null),
    });
    await expect(
      processImageSource(
        new Blob([png(800, 800)]),
        { output: { mime: "image/jpeg", quality: 0.8 } },
        encodeFailure.platform,
      ),
    ).rejects.toMatchObject({ code: "encode-failed" });
    expect(encodeFailure.close).toHaveBeenCalledOnce();

    const wrongSignature = fakePlatform({
      sourceWidth: 800,
      sourceHeight: 800,
      encodedBytes: new Uint8Array([1, 2, 3]),
    });
    await expect(
      processImageSource(
        new Blob([png(800, 800)]),
        { output: { mime: "image/jpeg", quality: 0.8 } },
        wrongSignature.platform,
      ),
    ).rejects.toMatchObject({ code: "encode-failed" });

    const noCanvas = fakePlatform({ sourceWidth: 800, sourceHeight: 800 });
    noCanvas.platform.createCanvas = () => {
      throw new Error("no canvas");
    };
    await expect(
      processImageSource(
        new Blob([png(800, 800)]),
        { output: { mime: "image/jpeg", quality: 0.8 } },
        noCanvas.platform,
      ),
    ).rejects.toMatchObject({ code: "canvas-unavailable" });
    expect(noCanvas.close).toHaveBeenCalledOnce();
  });
});
