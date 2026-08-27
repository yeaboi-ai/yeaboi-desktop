// Brand icons for analytics action menus and dialogs.
// Each icon takes standard SVG props plus a `monochrome` toggle:
//   monochrome=true  → renders in `currentColor` (use inside menu rows so
//                       the icon picks up text color and hover state)
//   monochrome=false → renders in brand colors (use as a delight detail in
//                       dialog headers)
// Sized 1em so they scale with the surrounding text by default.

import type { SVGProps } from "react";

export type BrandIconProps = SVGProps<SVGSVGElement> & { monochrome?: boolean };

// ─── Slack ───────────────────────────────────────────────────────────────
// Official Slack four-paddle hash mark — paths sourced from the Slack
// brand kit / SimpleIcons. Brand palette:
//   azure (bottom-left) #36C5F0 · emerald (top-right) #2EB67D
//   yellow (top-left)   #ECB22E · crimson (bottom-right) #E01E5A
export function SlackIcon({ monochrome = true, ...props }: BrandIconProps) {
  const c = monochrome
    ? { azure: "currentColor", yellow: "currentColor", emerald: "currentColor", crimson: "currentColor" }
    : { azure: "#36C5F0", yellow: "#ECB22E", emerald: "#2EB67D", crimson: "#E01E5A" };
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      {/* Bottom-left bar (azure) */}
      <path
        d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52z"
        fill={c.azure}
      />
      <path
        d="M6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"
        fill={c.azure}
      />
      {/* Top-left bar (yellow) */}
      <path
        d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834z"
        fill={c.yellow}
      />
      <path
        d="M8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"
        fill={c.yellow}
      />
      {/* Top-right bar (emerald) */}
      <path
        d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834z"
        fill={c.emerald}
      />
      <path
        d="M17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"
        fill={c.emerald}
      />
      {/* Bottom-right bar (crimson) */}
      <path
        d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52z"
        fill={c.crimson}
      />
      <path
        d="M15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"
        fill={c.crimson}
      />
    </svg>
  );
}

// ─── PDF ─────────────────────────────────────────────────────────────────
// Page outline with a red "PDF" plate; the plate switches off in monochrome.
export function PdfIcon({ monochrome = true, ...props }: BrandIconProps) {
  const stroke = "currentColor";
  const plateFill = monochrome ? "currentColor" : "#E94335";
  const plateText = monochrome ? "var(--background, #0a0a0a)" : "#ffffff";
  const plateOpacity = monochrome ? 0.85 : 1;
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M7 3h7l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M14 3v4h4" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
      <rect
        x="6.5"
        y="13"
        width="11"
        height="6"
        rx="1.2"
        fill={plateFill}
        opacity={plateOpacity}
      />
      <text
        x="12"
        y="17.6"
        textAnchor="middle"
        fontSize="4.2"
        fontWeight="700"
        fontFamily="-apple-system, system-ui, sans-serif"
        fill={plateText}
        letterSpacing="0.08em"
      >
        PDF
      </text>
    </svg>
  );
}

// ─── Markdown ────────────────────────────────────────────────────────────
// Official CommonMark M-down mark, simplified: rounded box + M with a small
// down-arrow tail. We render the inner glyph in currentColor; the box
// stroke matches.
export function MarkdownIcon({ monochrome = true, ...props }: BrandIconProps) {
  const stroke = "currentColor";
  const glyph = monochrome ? "currentColor" : "#ffffff";
  const fill = monochrome ? "transparent" : "#000000";
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <rect
        x="2.5"
        y="5"
        width="19"
        height="14"
        rx="2"
        stroke={stroke}
        strokeWidth="1.6"
        fill={fill}
      />
      {/* M */}
      <path
        d="M5.5 15.5V9h2l1.6 2.4L10.7 9h2v6.5h-1.6v-4l-1.4 2H9.1l-1.4-2v4H5.5z"
        fill={glyph}
      />
      {/* down arrow */}
      <path d="M16 9.5v4m0 0l-1.5-1.5M16 13.5l1.5-1.5" stroke={glyph} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Email ───────────────────────────────────────────────────────────────
// Envelope. Lucide has Mail; we ship our own so the four-icon set looks
// cohesive (same stroke weight, same corner radius).
export function EmailIcon({ monochrome = true, ...props }: BrandIconProps) {
  const stroke = "currentColor";
  const fill = monochrome ? "transparent" : "#1a73e8";
  const flapStroke = monochrome ? "currentColor" : "#ffffff";
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <rect
        x="2.5"
        y="5"
        width="19"
        height="14"
        rx="2"
        stroke={stroke}
        strokeWidth="1.6"
        fill={fill}
      />
      <path
        d="M3 7l9 6 9-6"
        stroke={flapStroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
