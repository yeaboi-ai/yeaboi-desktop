"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type PersonaThumbnailProps = {
  videoPreviewUrl?: string | null;
  slug?: string | null;
  alt?: string;
  className?: string;
  /** When true, clicking the thumbnail opens a fullscreen lightbox showing the
   * larger profile picture (WhatsApp-style). Off by default so callers wrapping
   * the thumbnail in their own <button> aren't broken. */
  expandable?: boolean;
};

export function PersonaThumbnail({
  videoPreviewUrl,
  slug,
  alt = "",
  className,
  expandable = false,
}: PersonaThumbnailProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const pin = () => {
      try {
        v.pause();
        v.currentTime = 0;
      } catch {
        // ignored — some browsers reject seek before metadata
      }
    };
    if (v.readyState >= 1) pin();
    else v.addEventListener("loadedmetadata", pin, { once: true });
    return () => v.removeEventListener("loadedmetadata", pin);
  }, [videoPreviewUrl]);

  const fallback = `/personas/${slug || "default"}.svg`;

  const handleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen(true);
  }, []);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    }
  }, []);

  const interactiveProps = expandable
    ? {
        onClick: handleOpen,
        onKeyDown: handleKey,
        role: "button" as const,
        tabIndex: 0,
        "aria-label": alt || "View profile picture",
      }
    : {};

  // Tavus videos frame the speaker's head near the top, so center-cover would
  // hide the face. Bias the crop upward so the face is the focal point.
  const thumb = videoPreviewUrl ? (
    <video
      ref={videoRef}
      src={videoPreviewUrl}
      className={className}
      muted
      playsInline
      preload="metadata"
      aria-label={alt}
      style={{
        objectFit: "cover",
        objectPosition: "center 18%",
        cursor: expandable ? "zoom-in" : undefined,
      }}
      {...interactiveProps}
    />
  ) : (
    <img
      src={fallback}
      alt={alt}
      className={className}
      style={{ cursor: expandable ? "zoom-in" : undefined }}
      {...interactiveProps}
    />
  );

  return (
    <>
      {thumb}
      {open && (
        <PersonaLightbox
          videoPreviewUrl={videoPreviewUrl}
          fallbackSrc={fallback}
          alt={alt}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function PersonaLightbox({
  videoPreviewUrl,
  fallbackSrc,
  alt,
  onClose,
}: {
  videoPreviewUrl?: string | null;
  fallbackSrc: string;
  alt: string;
  onClose: () => void;
}) {
  const lightboxVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Pin the lightbox video to its first frame so it reads as a profile photo,
  // not a looping clip. Same trick the thumbnail uses.
  useEffect(() => {
    const v = lightboxVideoRef.current;
    if (!v) return;
    const pin = () => {
      try {
        v.pause();
        v.currentTime = 0;
      } catch {
        // ignored — some browsers reject seek before metadata
      }
    };
    if (v.readyState >= 1) pin();
    else v.addEventListener("loadedmetadata", pin, { once: true });
    return () => v.removeEventListener("loadedmetadata", pin);
  }, [videoPreviewUrl]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Profile picture"}
      onClick={onClose}
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-background/90 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div onClick={(e) => e.stopPropagation()} className="relative max-w-[90vw] max-h-[90vh]">
        {videoPreviewUrl ? (
          <video
            ref={lightboxVideoRef}
            src={videoPreviewUrl}
            muted
            playsInline
            preload="metadata"
            className="w-[min(480px,90vw)] h-[min(480px,90vw)] rounded-2xl shadow-2xl ring-1 ring-white/10"
            style={{ objectFit: "cover", objectPosition: "center 18%", pointerEvents: "none" }}
          />
        ) : (
          <img
            src={fallbackSrc}
            alt={alt}
            className="w-[min(480px,90vw)] h-[min(480px,90vw)] rounded-2xl object-cover bg-muted/20 shadow-2xl ring-1 ring-white/10"
          />
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-foreground/[0.10] hover:bg-foreground/[0.20] backdrop-blur-md text-foreground/90 hover:text-foreground flex items-center justify-center text-base ring-1 ring-white/15"
        >
          ×
        </button>
      </div>
    </div>,
    document.body,
  );
}
