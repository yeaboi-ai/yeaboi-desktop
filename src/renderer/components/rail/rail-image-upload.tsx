'use client';

// Your own image on a rail square: any raster the browser can read,
// downscaled to a 96px square (the square draws at 48) and stored as a data
// URI, so it needs no file of its own. Kept under the cap the normaliser
// enforces, or refused with a sentence.

import { useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { RAIL_LIMITS } from '@shared/rail';
import { Button } from '@/components/ui/button';

const EDGE = 96;

/** A webp where the browser can write one, else a png; either way a square. */
function encode(image: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = EDGE;
  canvas.height = EDGE;
  const ctx = canvas.getContext('2d');
  if (!ctx || image.width === 0 || image.height === 0) return '';
  const scale = Math.max(EDGE / image.width, EDGE / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  ctx.drawImage(image, (EDGE - width) / 2, (EDGE - height) / 2, width, height);
  const webp = canvas.toDataURL('image/webp', 0.85);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
}

export function RailImageUpload({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (dataUrl: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const readFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const dataUrl = encode(image);
      if (!dataUrl) {
        setError('That file could not be read as an image.');
      } else if (dataUrl.length > RAIL_LIMITS.imageChars) {
        setError('Too detailed to keep at this size. Try a simpler image.');
      } else {
        setError(null);
        onChange(dataUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setError('That file could not be read as an image.');
    };
    image.src = url;
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) readFile(file);
          event.target.value = '';
        }}
      />
      <div className="flex items-center gap-3">
        {value ? (
          <img
            src={value}
            alt="Icon preview"
            className="size-12 rounded-2xl object-cover ring-1 ring-border/40"
          />
        ) : (
          <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary/50 text-muted-foreground ring-1 ring-border/40">
            <ImagePlus aria-hidden className="size-4" />
          </span>
        )}
        <Button size="xs" variant="secondary" onClick={() => inputRef.current?.click()}>
          {value ? 'Choose another image' : 'Choose an image'}
        </Button>
      </div>
      <p className="text-[11px] font-body text-muted-foreground">
        {error ?? 'A png, jpeg or webp. It is squared off and kept small.'}
      </p>
    </div>
  );
}
