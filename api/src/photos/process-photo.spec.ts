import sharp from 'sharp';
import { processPhoto } from './process-photo.js';

function jpeg(width: number, height: number, exif?: Record<string, Record<string, string>>) {
  const image = sharp({ create: { width, height, channels: 3, background: '#c86' } });
  return (exif ? image.withExif(exif) : image).jpeg().toBuffer();
}

describe('processPhoto', () => {
  it('drops camera and location metadata', async () => {
    const input = await jpeg(400, 300, { IFD0: { Make: 'PhoneCo', Model: 'X1' }, IFD3: { GPSLatitudeRef: 'N' } });
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const out = await processPhoto(input);

    const meta = await sharp(out!.data).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(out!.data.includes(Buffer.from('PhoneCo'))).toBe(false);
  });

  it('applies the camera rotation before stripping it', async () => {
    const input = await sharp(await jpeg(400, 200)).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const out = await processPhoto(input);
    expect([out!.width, out!.height]).toEqual([200, 400]);
  });

  it('shrinks large photos and leaves small ones alone', async () => {
    const big = await processPhoto(await jpeg(4000, 3000));
    expect([big!.width, big!.height]).toEqual([1080, 810]);
    const small = await processPhoto(await jpeg(300, 300));
    expect([small!.width, small!.height]).toEqual([300, 300]);
  });

  it('rejects things that are not images', async () => {
    expect(await processPhoto(Buffer.from('not an image at all'))).toBeNull();
    expect(await processPhoto(Buffer.alloc(0))).toBeNull();
  });
});
