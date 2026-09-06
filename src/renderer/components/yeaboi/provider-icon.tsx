'use client';

// Logomarks for the setup flow — LLM providers and connections alike —
// rendered monochrome so the cards stay inside the design system. Path data
// comes from simple-icons where it carries the mark; OpenAI's knot, Slack's
// pinwheel, the Azure DevOps mark and Grok's swirl are embedded (simple-icons
// carries none of them), as are the AWS and Azure marks it used to publish and
// later dropped. incident.io — which has never shipped in any icon set we
// bundle — writes itself in letters instead, because a mark reconstructed from
// memory would be a wrong logo rather than an absent one. AWS Bedrock gets a
// family glyph. Unknown names fall back to a two-letter monogram. Every
// vendored mark is CC0 path data and is credited in THIRD_PARTY_NOTICES.md.
// All marks identify their owners' services.
//
// A connector may also pass its accent, which tints the tile rather than the
// glyph: the mark stays monochrome and inside the design system, and a vendor
// we ship no logo for still reads as itself in a list of several.

import { Activity, Bug, Cloud, Music, Siren, Sunrise, Video } from 'lucide-react';
import {
  siApplemusic,
  siAtlassian,
  siBitbucket,
  siCircleci,
  siClaude,
  siCloudflare,
  siConfluence,
  siDatadog,
  siDeepseek,
  siElevenlabs,
  siGithub,
  siGitlab,
  siGooglecloud,
  siGooglegemini,
  siGrafana,
  siJenkins,
  siJira,
  siKimi,
  siLinear,
  siMistralai,
  siNotion,
  siOllama,
  siPagerduty,
  siQwen,
  siSentry,
  siSpotify,
  siStatuspage,
  siTrello,
  siYoutubemusic,
  siZdotai,
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

// Grok's swirl. simple-icons ships no xAI or Grok mark, so the path is
// embedded like OpenAI's and Slack's above.
const GROK_PATH =
  'M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815';

// The incident.io mark, from SVG Logos (gilbarbara/logos, CC0). simple-icons
// has never published one, at any version.
const INCIDENTIO_PATH =
  'M96.73 344.737V298.16h60.969v46.99C214.062 331.68 256 280.686 256 219.843c0-49.516-35.14-119.19-75.886-140.748c5.48 19.333-2.749 44.528-13.71 42.32c-4.13-.826-4.56-7.355-5.226-17.903C159.78 81.43 157.27 41.716 117.015 0c-3.209 29.135-49.405 88.484-79.46 127.118a3238 3238 0 0 0-11.28 14.536A129.25 129.25 0 0 0 0 219.844c-.12 58.859 39.713 110.296 96.73 124.91zm65.147-98.952a34.09 34.09 0 0 1-33.996 34.202a34.09 34.09 0 0 1-33.996-34.202c0-7.8 2.685-15.14 6.99-20.763l2.987-3.86c7.99-10.262 20.254-26.021 21.112-33.757c25.306 17.093 36.903 45.226 36.903 58.38';

// The AWS wordmark, as previously published by simple-icons (CC0 path data,
// v14.15.0 — the last release to carry it).
const AWS_PATH =
  'M6.763 10.036c0 .296.032.535.088.71.064.176.144.368.256.576.04.063.056.127.056.183 0 .08-.048.16-.152.24l-.503.335a.383.383 0 0 1-.208.072c-.08 0-.16-.04-.239-.112a2.47 2.47 0 0 1-.287-.375 6.18 6.18 0 0 1-.248-.471c-.622.734-1.405 1.101-2.347 1.101-.67 0-1.205-.191-1.596-.574-.391-.384-.59-.894-.59-1.533 0-.678.239-1.23.726-1.644.487-.415 1.133-.623 1.955-.623.272 0 .551.024.846.064.296.04.6.104.918.176v-.583c0-.607-.127-1.03-.375-1.277-.255-.248-.686-.367-1.3-.367-.28 0-.568.031-.863.103-.295.072-.583.16-.862.272a2.287 2.287 0 0 1-.28.104.488.488 0 0 1-.127.023c-.112 0-.168-.08-.168-.247v-.391c0-.128.016-.224.056-.28a.597.597 0 0 1 .224-.167c.279-.144.614-.264 1.005-.36a4.84 4.84 0 0 1 1.246-.151c.95 0 1.644.216 2.091.647.439.43.662 1.085.662 1.963v2.586zm-3.24 1.214c.263 0 .534-.048.822-.144.287-.096.543-.271.758-.51.128-.152.224-.32.272-.512.047-.191.08-.423.08-.694v-.335a6.66 6.66 0 0 0-.735-.136 6.02 6.02 0 0 0-.75-.048c-.535 0-.926.104-1.19.32-.263.215-.39.518-.39.917 0 .375.095.655.295.846.191.2.47.296.838.296zm6.41.862c-.144 0-.24-.024-.304-.08-.064-.048-.12-.16-.168-.311L7.586 5.55a1.398 1.398 0 0 1-.072-.32c0-.128.064-.2.191-.2h.783c.151 0 .255.025.31.08.065.048.113.16.16.312l1.342 5.284 1.245-5.284c.04-.16.088-.264.151-.312a.549.549 0 0 1 .32-.08h.638c.152 0 .256.025.32.08.063.048.12.16.151.312l1.261 5.348 1.381-5.348c.048-.16.104-.264.16-.312a.52.52 0 0 1 .311-.08h.743c.127 0 .2.065.2.2 0 .04-.009.08-.017.128a1.137 1.137 0 0 1-.056.2l-1.923 6.17c-.048.16-.104.263-.168.311a.51.51 0 0 1-.303.08h-.687c-.151 0-.255-.024-.32-.08-.063-.056-.119-.16-.15-.32l-1.238-5.148-1.23 5.14c-.04.16-.087.264-.15.32-.065.056-.177.08-.32.08zm10.256.215c-.415 0-.83-.048-1.229-.143-.399-.096-.71-.2-.918-.32-.128-.071-.215-.151-.247-.223a.563.563 0 0 1-.048-.224v-.407c0-.167.064-.247.183-.247.048 0 .096.008.144.024.048.016.12.048.2.08.271.12.566.215.878.279.319.064.63.096.95.096.502 0 .894-.088 1.165-.264a.86.86 0 0 0 .415-.758.777.777 0 0 0-.215-.559c-.144-.151-.416-.287-.807-.415l-1.157-.36c-.583-.183-1.014-.454-1.277-.813a1.902 1.902 0 0 1-.4-1.158c0-.335.073-.63.216-.886.144-.255.335-.479.575-.654.24-.184.51-.32.83-.415.32-.096.655-.136 1.006-.136.175 0 .359.008.535.032.183.024.35.056.518.088.16.04.312.08.455.127.144.048.256.096.336.144a.69.69 0 0 1 .24.2.43.43 0 0 1 .071.263v.375c0 .168-.064.256-.184.256a.83.83 0 0 1-.303-.096 3.652 3.652 0 0 0-1.532-.311c-.455 0-.815.071-1.062.223-.248.152-.375.383-.375.71 0 .224.08.416.24.567.159.152.454.304.877.44l1.134.358c.574.184.99.44 1.237.767.247.327.367.702.367 1.117 0 .343-.072.655-.207.926-.144.272-.336.511-.583.703-.248.2-.543.343-.886.447-.36.111-.734.167-1.142.167zM21.698 16.207c-2.626 1.94-6.442 2.969-9.722 2.969-4.598 0-8.74-1.7-11.87-4.526-.247-.223-.024-.527.272-.351 3.384 1.963 7.559 3.153 11.877 3.153 2.914 0 6.114-.607 9.06-1.852.439-.2.814.287.383.607zM22.792 14.961c-.336-.43-2.22-.207-3.074-.103-.255.032-.295-.192-.063-.36 1.5-1.053 3.967-.75 4.254-.399.287.36-.08 2.826-1.485 4.007-.215.184-.423.088-.327-.151.32-.79 1.03-2.57.695-2.994z';

// The Microsoft Azure mark, as previously published by simple-icons (CC0 path
// data, v12.4.0 — the last release to carry it).
const AZURE_PATH =
  'M22.379 23.343a1.62 1.62 0 0 0 1.536-2.14v.002L17.35 1.76A1.62 1.62 0 0 0 15.816.657H8.184A1.62 1.62 0 0 0 6.65 1.76L.086 21.204a1.62 1.62 0 0 0 1.536 2.139h4.741a1.62 1.62 0 0 0 1.535-1.103l.977-2.892 4.947 3.675c.28.208.618.32.966.32m-3.084-12.531 3.624 10.739a.54.54 0 0 1-.51.713v-.001h-.03a.54.54 0 0 1-.322-.106l-9.287-6.9h4.853m6.313 7.006c.116-.326.13-.694.007-1.058L9.79 1.76a1.722 1.722 0 0 0-.007-.02h6.034a.54.54 0 0 1 .512.366l6.562 19.445a.54.54 0 0 1-.338.684';

export const ICON_PATHS: Record<string, string> = {
  anthropic: siClaude.path,
  openai: OPENAI_PATH,
  google: siGooglegemini.path,
  ollama: siOllama.path,
  // The OpenAI-wire vendors — see src/yeaboi/llm_providers.py in yeaboi.ai.
  xai: GROK_PATH,
  deepseek: siDeepseek.path,
  moonshot: siKimi.path,
  mistral: siMistralai.path,
  qwen: siQwen.path,
  zai: siZdotai.path,
  github: siGithub.path,
  jira: siJira.path,
  azure: AZURE_DEVOPS_PATH,
  notion: siNotion.path,
  slack: SLACK_PATH,
  cloudflare: siCloudflare.path,
  elevenlabs: siElevenlabs.path,
  confluence: siConfluence.path,
  // The connector layer (contracts/v1/connectors.json keys).
  datadog: siDatadog.path,
  grafana: siGrafana.path,
  pagerduty: siPagerduty.path,
  sentry: siSentry.path,
  gcp: siGooglecloud.path,
  gitlab: siGitlab.path,
  bitbucket: siBitbucket.path,
  linear: siLinear.path,
  trello: siTrello.path,
  aws: AWS_PATH,
  azure_cloud: AZURE_PATH,
  incidentio: INCIDENTIO_PATH,
  circleci: siCircleci.path,
  jenkins: siJenkins.path,
  statuspage: siStatuspage.path,
  // JSM Ops is Atlassian-branded (Opsgenie is a retired brand, so its old
  // mark would be the wrong logo, not a nostalgic one).
  jsm_ops: siAtlassian.path,
  // The music services (keyless connectors; the desktop's Music page plays them).
  spotify: siSpotify.path,
  apple_music: siApplemusic.path,
  youtube_music: siYoutubemusic.path,
  // launchdarkly ships in no icon set we bundle — it renders its wire glyph.
};

/** Marks whose source does not normalise to a 24-square. Anything absent here
 *  is drawn in simple-icons' own 0 0 24 24 box; the browser fits and centres
 *  whatever box is named. */
export const ICON_VIEWBOXES: Record<string, string> = {
  incidentio: '0 0 256 346',
};

export const FALLBACK_GLYPHS: Record<
  string,
  React.ComponentType<{ size?: number; strokeWidth?: number }>
> = {
  bedrock: Cloud,
  tavus: Video,
  standup: Sunrise,
};

/** The neutral mark a connector family wears when we ship no logo for the
 *  vendor itself — so a connector always renders as something, never as a
 *  blank, and never has to wait on a licensed asset to look finished. */
const FAMILY_GLYPHS: Record<
  string,
  React.ComponentType<{ size?: number; strokeWidth?: number }>
> = {
  observability: Activity,
  incidents: Siren,
  errors: Bug,
  cloud: Cloud,
  music: Music,
};

/** `rgb(r,g,b)` from the connector catalog → the same colour at `alpha`. */
function tint(accent: string, alpha: number): string | undefined {
  const m = /^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/.exec(accent.trim());
  return m ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})` : undefined;
}

export function ProviderIcon({
  provider,
  size = 40,
  family = '',
  accent = '',
  glyph: emoji = '',
}: {
  provider: string;
  size?: number;
  /** Connector family, used to pick a fallback mark before the monogram. */
  family?: string;
  /** Connector accent, `rgb(r,g,b)`. Tints the tile, never the mark. */
  accent?: string;
  /** The wire's per-vendor emoji (contracts/v1/connectors.json since schema
   *  3). A deliberate identity, so it beats the generic family mark — used
   *  only when no logomark or per-key glyph ships here. */
  glyph?: string;
}) {
  const path = ICON_PATHS[provider];
  const Glyph = FALLBACK_GLYPHS[provider];
  const FamilyGlyph = FAMILY_GLYPHS[family];
  const lettering = provider.slice(0, 2).toUpperCase();
  const glyph = Math.round(size * 0.52);
  const wash = tint(accent, 0.14);
  const edge = tint(accent, 0.35);
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-xl bg-secondary/60 ring-1 ring-border/40 text-foreground/85"
      style={{
        width: size,
        height: size,
        ...(wash ? { background: wash } : {}),
        ...(edge ? { boxShadow: `inset 0 0 0 1px ${edge}` } : {}),
      }}
    >
      {path ? (
        <svg width={glyph} height={glyph} viewBox={ICON_VIEWBOXES[provider] ?? '0 0 24 24'}>
          <path d={path} fill="currentColor" />
        </svg>
      ) : Glyph ? (
        <Glyph size={glyph} strokeWidth={1.8} />
      ) : emoji.trim() ? (
        <span style={{ fontSize: Math.round(size * 0.5) }}>{emoji}</span>
      ) : FamilyGlyph ? (
        <FamilyGlyph size={glyph} strokeWidth={1.8} />
      ) : (
        <span
          className="font-mono font-semibold tracking-tight"
          // Three letters need to fit the same tile two do.
          style={{ fontSize: Math.max(9, Math.round((size * 0.72) / lettering.length)) }}
        >
          {lettering}
        </span>
      )}
    </span>
  );
}
