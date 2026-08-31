'use client';

// Logomarks for the setup flow — LLM providers and connections alike —
// rendered monochrome so the cards stay inside the design system. Path data
// comes from simple-icons where it carries the mark; OpenAI's knot, Slack's
// pinwheel and the Azure DevOps mark are embedded (simple-icons dropped
// them); AWS Bedrock — no usable mark ships in any icon set we bundle — gets
// a cloud glyph. Unknown names fall back to a two-letter monogram. All marks
// identify their owners' services.

import { Cloud, Sunrise, Video } from 'lucide-react';
import {
  siClaude,
  siCloudflare,
  siElevenlabs,
  siGithub,
  siGooglegemini,
  siJira,
  siNotion,
  siOllama,
} from 'simple-icons';

// The OpenAI knot, as previously published by simple-icons (CC0 path data).
const OPENAI_PATH =
  'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.073zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z';

// Slack's pinwheel, as previously published by simple-icons (CC0 path data).
const SLACK_PATH =
  'M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z';

// The Azure DevOps mark, as previously published by simple-icons (CC0 path data).
const AZURE_DEVOPS_PATH =
  'M0 8.877L2.247 5.91l8.405-3.416V.022l7.37 5.393L2.966 8.338v8.225L0 15.707zm24-4.45v14.651l-5.753 4.9-9.303-3.057v3.056l-5.978-7.416 15.057 1.798V5.415z';

const ICON_PATHS: Record<string, string> = {
  anthropic: siClaude.path,
  openai: OPENAI_PATH,
  google: siGooglegemini.path,
  ollama: siOllama.path,
  github: siGithub.path,
  jira: siJira.path,
  azure: AZURE_DEVOPS_PATH,
  notion: siNotion.path,
  slack: SLACK_PATH,
  cloudflare: siCloudflare.path,
  elevenlabs: siElevenlabs.path,
};

const FALLBACK_GLYPHS: Record<
  string,
  React.ComponentType<{ size?: number; strokeWidth?: number }>
> = {
  bedrock: Cloud,
  tavus: Video,
  standup: Sunrise,
};

export function ProviderIcon({ provider, size = 40 }: { provider: string; size?: number }) {
  const path = ICON_PATHS[provider];
  const Glyph = FALLBACK_GLYPHS[provider];
  const glyph = Math.round(size * 0.52);
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-xl bg-secondary/60 ring-1 ring-border/40 text-foreground/85"
      style={{ width: size, height: size }}
    >
      {path ? (
        <svg width={glyph} height={glyph} viewBox="0 0 24 24">
          <path d={path} fill="currentColor" />
        </svg>
      ) : Glyph ? (
        <Glyph size={glyph} strokeWidth={1.8} />
      ) : (
        <span
          className="font-mono font-semibold tracking-tight"
          style={{ fontSize: Math.max(9, Math.round(size * 0.26)) }}
        >
          {provider.slice(0, 2).toUpperCase()}
        </span>
      )}
    </span>
  );
}
