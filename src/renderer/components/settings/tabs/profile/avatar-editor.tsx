"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MeProfile } from "@/components/settings/types";
import { AvatarPickerDialog } from "./avatar-picker-dialog";

type AvatarEditorProps = {
  avatarUrl: string | null;
  fallbackInitial: string;
  name: string;
  subline: string | null;
  onChange: (profile: MeProfile) => void;
  onError: (message: string) => void;
};

export function AvatarEditor({
  avatarUrl,
  fallbackInitial,
  name,
  subline,
  onChange,
  onError,
}: AvatarEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const resp = await fetch("/api/me/avatar", { method: "DELETE" });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        throw new Error(body?.error || `Remove failed: ${resp.status}`);
      }
      const data: MeProfile = await resp.json();
      onChange(data);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to remove avatar");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-label="Change avatar"
          className={cn(
            "relative group w-14 h-14 rounded-full overflow-hidden shrink-0 outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring/50",
          )}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center">
              <span className="text-xl font-body font-semibold text-primary">{fallbackInitial}</span>
            </div>
          )}
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center bg-black/55 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
            aria-hidden="true"
          >
            <Camera className="size-4 text-white" />
          </div>
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-body font-medium text-foreground truncate">{name}</p>
          {subline && (
            <p className="text-[11px] font-body text-muted-foreground truncate">{subline}</p>
          )}
          <p className="text-[10px] font-body text-muted-foreground/60 mt-1">
            Pick a preset or upload your own
          </p>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-0.5">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="text-xs font-body font-medium text-foreground hover:underline"
          >
            {avatarUrl ? "Change" : "Choose"}
          </button>
          {avatarUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={removing}
              className="text-[11px] font-body text-muted-foreground hover:text-destructive disabled:opacity-50 transition-colors"
            >
              {removing ? "Removing…" : "Remove"}
            </button>
          )}
        </div>
      </div>

      <AvatarPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        fallbackInitial={fallbackInitial}
        currentAvatarUrl={avatarUrl}
        onSaved={onChange}
        onError={onError}
      />
    </>
  );
}
