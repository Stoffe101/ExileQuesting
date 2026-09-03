export interface PassiveTreeScreenSignature {
  schemaVersion: 1;
  sampleWidth: number;
  sampleHeight: number;
  values: number[];
}

export interface PassiveTreeScreenMatch {
  matched: boolean;
  meanAbsoluteError: number;
  closePixelRatio: number;
}

export interface PassiveTreeScreenMatchOptions {
  maximumMeanAbsoluteError?: number;
  closePixelDifference?: number;
  minimumClosePixelRatio?: number;
}

interface Rect { x: number; y: number; width: number; height: number }

const DEFAULT_SAMPLE_WIDTH = 20;
const DEFAULT_SAMPLE_HEIGHT = 6;
const MAX_CAPTURE_PIXELS = 4_000_000;
const MAX_MEAN_ABSOLUTE_ERROR = 18;
const CLOSE_PIXEL_DIFFERENCE = 28;
const MINIMUM_CLOSE_PIXEL_RATIO = 0.86;

function finitePositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * PoE 1 exposes a small static passive-tree header around the horizontal centre
 * of the client. These normalized coordinates intentionally mirror Exile-UI's
 * proven `skilltree` screen check instead of trying to recognize passive nodes.
 */
export function passiveTreeScreenCheckRegion(width: number, height: number): Rect | undefined {
  if (!finitePositiveInteger(width) || !finitePositiveInteger(height)) return undefined;
  const regionWidth = Math.max(8, Math.round(height / 16));
  const regionHeight = Math.max(4, Math.round(height * 0.02));
  const x = Math.round(width / 2 - regionWidth / 2);
  const y = Math.round(height * 0.054);
  if (x < 0 || y < 0 || x + regionWidth > width || y + regionHeight > height) return undefined;
  return { x, y, width: regionWidth, height: regionHeight };
}

function gray(bitmap: Uint8Array, width: number, x: number, y: number): number {
  const offset = (y * width + x) * 4;
  // NativeImage bitmaps are platform-native channel order. Averaging the three
  // colour channels keeps the signature channel-order agnostic.
  return Math.round((bitmap[offset] + bitmap[offset + 1] + bitmap[offset + 2]) / 3);
}

function samples(
  bitmap: Uint8Array,
  width: number,
  height: number,
  sampleWidth: number,
  sampleHeight: number,
): number[] | undefined {
  if (!finitePositiveInteger(width) || !finitePositiveInteger(height) || width * height > MAX_CAPTURE_PIXELS) return undefined;
  if (bitmap.length < width * height * 4) return undefined;
  if (!finitePositiveInteger(sampleWidth) || !finitePositiveInteger(sampleHeight) || sampleWidth > 64 || sampleHeight > 32) return undefined;
  const region = passiveTreeScreenCheckRegion(width, height);
  if (!region) return undefined;
  const result: number[] = [];
  for (let sy = 0; sy < sampleHeight; sy += 1) {
    const py = Math.min(region.y + region.height - 1, region.y + Math.floor((sy + 0.5) * region.height / sampleHeight));
    for (let sx = 0; sx < sampleWidth; sx += 1) {
      const px = Math.min(region.x + region.width - 1, region.x + Math.floor((sx + 0.5) * region.width / sampleWidth));
      result.push(gray(bitmap, width, px, py));
    }
  }
  return result;
}

export function createPassiveTreeScreenSignature(
  bitmap: Uint8Array,
  width: number,
  height: number,
  sampleWidth = DEFAULT_SAMPLE_WIDTH,
  sampleHeight = DEFAULT_SAMPLE_HEIGHT,
): PassiveTreeScreenSignature | undefined {
  const values = samples(bitmap, width, height, sampleWidth, sampleHeight);
  if (!values) return undefined;
  return { schemaVersion: 1, sampleWidth, sampleHeight, values };
}

export function validatePassiveTreeScreenSignature(value: unknown): PassiveTreeScreenSignature | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (item.schemaVersion !== 1 || !Number.isInteger(item.sampleWidth) || !Number.isInteger(item.sampleHeight)) return undefined;
  const sampleWidth = Number(item.sampleWidth);
  const sampleHeight = Number(item.sampleHeight);
  if (sampleWidth <= 0 || sampleWidth > 64 || sampleHeight <= 0 || sampleHeight > 32 || !Array.isArray(item.values)) return undefined;
  if (item.values.length !== sampleWidth * sampleHeight) return undefined;
  const values: number[] = [];
  for (const candidate of item.values) {
    if (!Number.isInteger(candidate) || Number(candidate) < 0 || Number(candidate) > 255) return undefined;
    values.push(Number(candidate));
  }
  return { schemaVersion: 1, sampleWidth, sampleHeight, values };
}

export function matchPassiveTreeScreenSignature(
  signature: PassiveTreeScreenSignature,
  bitmap: Uint8Array,
  width: number,
  height: number,
  options: PassiveTreeScreenMatchOptions = {},
): PassiveTreeScreenMatch {
  const validated = validatePassiveTreeScreenSignature(signature);
  if (!validated) return { matched: false, meanAbsoluteError: Number.POSITIVE_INFINITY, closePixelRatio: 0 };
  const current = samples(bitmap, width, height, validated.sampleWidth, validated.sampleHeight);
  if (!current || current.length !== validated.values.length) return { matched: false, meanAbsoluteError: Number.POSITIVE_INFINITY, closePixelRatio: 0 };

  const maximumMeanAbsoluteError = Math.max(0, Math.min(255, options.maximumMeanAbsoluteError ?? MAX_MEAN_ABSOLUTE_ERROR));
  const closePixelDifference = Math.max(0, Math.min(255, options.closePixelDifference ?? CLOSE_PIXEL_DIFFERENCE));
  const minimumClosePixelRatio = Math.max(0, Math.min(1, options.minimumClosePixelRatio ?? MINIMUM_CLOSE_PIXEL_RATIO));
  let absoluteError = 0;
  let closePixels = 0;
  for (let index = 0; index < current.length; index += 1) {
    const difference = Math.abs(current[index] - validated.values[index]);
    absoluteError += difference;
    if (difference <= closePixelDifference) closePixels += 1;
  }
  const meanAbsoluteError = absoluteError / current.length;
  const closePixelRatio = closePixels / current.length;
  return {
    matched: meanAbsoluteError <= maximumMeanAbsoluteError && closePixelRatio >= minimumClosePixelRatio,
    meanAbsoluteError,
    closePixelRatio,
  };
}
