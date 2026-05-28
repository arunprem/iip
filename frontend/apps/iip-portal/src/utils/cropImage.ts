import type { Area } from 'react-easy-crop';

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => reject(new Error('Failed to load image')));
    if (url.startsWith('http://') || url.startsWith('https://')) {
      image.crossOrigin = 'anonymous';
    }
    image.src = url;
  });
}

/** Read a file as a data URL (reliable for cropper preview). */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read image file.'));
    };
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

export type CroppedImageOutput = {
  width?: number;
  height?: number;
};

/** Render a JPEG blob from the cropped region. */
export async function getCroppedImageBlob(
  imageSrc: string,
  pixelCrop: Area,
  output: number | CroppedImageOutput = 400
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const opts = typeof output === 'number' ? { width: output, height: output } : output;
  const outW = opts.width ?? 400;
  const outH = opts.height ?? opts.width ?? 400;
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not prepare image canvas.');
  }

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outW,
    outH
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not encode image.'));
      },
      'image/jpeg',
      0.92
    );
  });
}
