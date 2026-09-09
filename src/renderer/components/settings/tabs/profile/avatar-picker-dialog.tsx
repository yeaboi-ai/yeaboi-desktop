'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { MeProfile } from '@/components/settings/types';
import {
  PRESETS,
  presetKey,
  presetLabel,
  presetToBlob,
  presetToDataUri,
  type Preset,
} from './avatar-presets';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,image/gif';

type Staged =
  { kind: 'preset'; preset: Preset } | { kind: 'upload'; file: File; objectUrl: string } | null;

type AvatarPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fallbackInitial: string;
  currentAvatarUrl: string | null;
  onSaved: (profile: MeProfile) => void;
  onError: (message: string) => void;
};

export function AvatarPickerDialog({
  open,
  onOpenChange,
  fallbackInitial,
  currentAvatarUrl,
  onSaved,
  onError,
}: AvatarPickerDialogProps) {
  const { authFetch } = useAuthFetch();
  const [staged, setStaged] = useState<Staged>(null);
  const [saving, setSaving] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Reset staged state whenever the dialog opens
  useEffect(() => {
    if (open) {
      setStaged(null);
      setSaving(false);
    }
  }, [open]);

  // Revoke uploaded object URLs on staged change / unmount
  useEffect(() => {
    return () => {
      if (staged?.kind === 'upload') {
        URL.revokeObjectURL(staged.objectUrl);
      }
    };
  }, [staged]);

  const stagePreset = useCallback((preset: Preset) => {
    setStaged((prev) => {
      if (prev?.kind === 'upload') URL.revokeObjectURL(prev.objectUrl);
      return { kind: 'preset', preset };
    });
  }, []);

  const stageUpload = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        onError('Please choose an image file.');
        return;
      }
      if (file.size > MAX_BYTES) {
        onError(`Image is too large (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB).`);
        return;
      }
      setStaged((prev) => {
        if (prev?.kind === 'upload') URL.revokeObjectURL(prev.objectUrl);
        return { kind: 'upload', file, objectUrl: URL.createObjectURL(file) };
      });
    },
    [onError],
  );

  const handleSave = async () => {
    if (!staged) return;
    setSaving(true);
    try {
      let blob: Blob;
      let filename: string;
      if (staged.kind === 'preset') {
        blob = await presetToBlob(staged.preset, 256);
        filename = `avatar-${staged.preset.id}.png`;
      } else {
        blob = staged.file;
        filename = staged.file.name || 'avatar';
      }
      const formData = new FormData();
      formData.append('file', blob, filename);
      const resp = await authFetch('/api/me/avatar', { method: 'POST', body: formData });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        throw new Error(body?.error || `Upload failed: ${resp.status}`);
      }
      const data: MeProfile = await resp.json();
      onSaved(data);
      onOpenChange(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save avatar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Choose your avatar</DialogTitle>
          <DialogDescription>Pick a character theme or upload your own photo.</DialogDescription>
        </DialogHeader>

        <div className="flex justify-center pt-2">
          <BigPreview
            staged={staged}
            fallbackInitial={fallbackInitial}
            currentAvatarUrl={currentAvatarUrl}
          />
        </div>

        <div>
          <p className="text-[10px] font-body font-medium tracking-[0.1em] uppercase text-muted-foreground mb-2">
            Themes
          </p>
          <PresetGrid presets={PRESETS} staged={staged} onSelect={stagePreset} />
        </div>

        <div>
          <p className="text-[10px] font-body font-medium tracking-[0.1em] uppercase text-muted-foreground mb-2">
            Upload your own
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => uploadInputRef.current?.click()}
            className="w-full justify-center text-xs"
          >
            <Upload className="size-3.5" aria-hidden="true" />
            {staged?.kind === 'upload'
              ? staged.file.name
              : 'Choose image (PNG, JPG, WebP, GIF · max 5 MB)'}
          </Button>
          <input
            ref={uploadInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) stageUpload(file);
              e.target.value = '';
            }}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!staged || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BigPreview({
  staged,
  fallbackInitial,
  currentAvatarUrl,
}: {
  staged: Staged;
  fallbackInitial: string;
  currentAvatarUrl: string | null;
}) {
  if (staged?.kind === 'preset') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={presetToDataUri(staged.preset)}
        alt={`Avatar preview: ${presetLabel(staged.preset)}`}
        className="w-24 h-24 rounded-full bg-card"
      />
    );
  }
  if (staged?.kind === 'upload') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={staged.objectUrl} alt="" className="w-24 h-24 rounded-full object-cover" />;
  }
  if (currentAvatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={currentAvatarUrl} alt="" className="w-24 h-24 rounded-full object-cover" />;
  }
  return (
    <div className="w-24 h-24 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center">
      <span className="text-3xl font-body font-semibold text-primary">{fallbackInitial}</span>
    </div>
  );
}

function PresetGrid({
  presets,
  staged,
  onSelect,
}: {
  presets: Preset[];
  staged: Staged;
  onSelect: (preset: Preset) => void;
}) {
  const selectedKey = staged?.kind === 'preset' ? presetKey(staged.preset) : null;
  return (
    <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label="Avatar themes">
      {presets.map((preset) => {
        const key = presetKey(preset);
        const selected = selectedKey === key;
        return (
          <PresetThumb
            key={key}
            preset={preset}
            selected={selected}
            onClick={() => onSelect(preset)}
          />
        );
      })}
    </div>
  );
}

function PresetThumb({
  preset,
  selected,
  onClick,
}: {
  preset: Preset;
  selected: boolean;
  onClick: () => void;
}) {
  const dataUri = useMemo(() => presetToDataUri(preset), [preset]);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`Avatar theme: ${presetLabel(preset)}`}
      title={presetLabel(preset)}
      onClick={onClick}
      className={cn(
        'relative w-full aspect-square rounded-full overflow-hidden outline-none transition-all bg-card',
        'focus-visible:ring-2 focus-visible:ring-ring/50',
        selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'hover:scale-105',
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUri} alt="" className="w-full h-full" />
    </button>
  );
}
