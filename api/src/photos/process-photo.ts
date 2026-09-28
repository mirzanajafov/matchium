import sharp from 'sharp';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const MAX_WIDTH = 1080;
const MAX_HEIGHT = 1350;

export interface ProcessedPhoto {
  data: Buffer;
  width: number;
  height: number;
}

export async function processPhoto(input: Buffer): Promise<ProcessedPhoto | null> {
  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width: MAX_WIDTH, height: MAX_HEIGHT, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    return null;
  }
}
