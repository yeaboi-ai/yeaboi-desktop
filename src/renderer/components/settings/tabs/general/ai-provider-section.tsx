"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, KeyRound, Cloud, Server, CheckCircle2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthFetch, getStoredOrgId } from "@/hooks/use-auth-fetch";
import { SettingsInlineError } from "@/components/settings/primitives";
import { cn } from "@/lib/utils";

type AIProvider = "platform" | "byok" | "bedrock" | "self_hosted";

const PROVIDERS: {
  id: AIProvider;
  name: string;
  icon: typeof Sparkles;
  tag: string;
  pricing: string;
  recommended?: boolean;
}[] = [
  {
    id: "platform",
    name: "Platform-hosted",
    icon: Sparkles,
    tag: "Included in subscription",
    pricing: "No extra cost · uses our Anthropic key",
    recommended: true,
  },
  {
    id: "byok",
    name: "Bring your own key",
    icon: KeyRound,
    tag: "Anthropic, OpenAI, Google",
    pricing: "Pay per token via your provider account",
  },
  {
    id: "bedrock",
    name: "AWS Bedrock",
    icon: Cloud,
    tag: "Your AWS account",
    pricing: "Pay your AWS account",
  },
  {
    id: "self_hosted",
    name: "Self-hosted",
    icon: Server,
    tag: "Your endpoint",
    pricing: "Free — runs on your infra",
  },
];

const BYOK_LABEL: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
};

// Keep in sync with the tier dicts in
// backend/src/app/services/ai_provider.py:37-53
const BYOK_MODELS: Record<
  string,
  { id: string; label: string; tier: "fast" | "default" | "capable" }[]
> = {
  anthropic: [
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", tier: "fast" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", tier: "default" },
    { id: "claude-opus-4-7", label: "Claude Opus 4.7", tier: "capable" },
  ],
  openai: [
    { id: "gpt-4o-mini", label: "GPT-4o mini", tier: "fast" },
    { id: "gpt-4o", label: "GPT-4o", tier: "default" },
  ],
  google: [
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", tier: "fast" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "default" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "capable" },
  ],
};

const BEDROCK_MODELS: { id: string; label: string }[] = [
  { id: "anthropic.claude-3-5-sonnet-20241022-v2:0", label: "Claude 3.5 Sonnet" },
  { id: "anthropic.claude-3-5-haiku-20241022-v1:0", label: "Claude 3.5 Haiku" },
  { id: "anthropic.claude-3-opus-20240229-v1:0", label: "Claude 3 Opus" },
];

// Models offered for per-task overrides. The backend derives the provider from
// the id (claude-→anthropic, gpt-/o…→openai, gemini-→google) and routes to that
// platform key, so an override may switch provider as well as model.
const TASK_MODEL_OPTIONS: { id: string; label: string }[] = [
  { id: "", label: "Auto (role default)" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 — fast, cheap" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 — balanced" },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7 — highest quality" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash — fast" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
];

// The heavy generation tasks an org can retarget. Mirrors the flow / arch /
// wireframe / wireframe_critic roles in backend/src/app/services/ai_provider.py.
const TASK_MODELS: {
  key: "flow_model" | "arch_model" | "wireframe_model" | "wireframe_critic_model";
  label: string;
  hint: string;
}[] = [
  { key: "flow_model", label: "User-flow diagrams", hint: "Step-by-step product flow generation" },
  { key: "arch_model", label: "Cloud architecture diagrams", hint: "Infrastructure / system diagrams" },
  { key: "wireframe_model", label: "UI / mockups (drafter)", hint: "Drafts each hero screen — a cheap model works well here" },
  {
    key: "wireframe_critic_model",
    label: "UI critic (refinement)",
    hint: "Reviews & enriches the hero — use a strong model (Opus) for best results",
  },
];

type AIConfig = {
  provider: AIProvider;
  byok_provider: string | null;
  byok_api_key_masked: string | null;
  byok_default_model: string | null;
  byok_fast_model: string | null;
  bedrock_role_arn: string | null;
  bedrock_region: string | null;
  bedrock_model: string | null;
  bedrock_fast_model: string | null;
  self_hosted_url: string | null;
  self_hosted_model: string | null;
  self_hosted_fast_model: string | null;
  flow_model: string | null;
  arch_model: string | null;
  wireframe_model: string | null;
  wireframe_critic_model: string | null;
};

export function AIProviderSection() {
  const { authFetch, ready } = useAuthFetch();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [provider, setProvider] = useState<AIProvider>("platform");
  const [byokProvider, setByokProvider] = useState("anthropic");
  const [byokKey, setByokKey] = useState("");
  const [byokKeyMasked, setByokKeyMasked] = useState<string | null>(null);
  const [byokDefaultModel, setByokDefaultModel] = useState("");
  const [byokFastModel, setByokFastModel] = useState("");
  const [bedrockArn, setBedrockArn] = useState("");
  const [bedrockRegion, setBedrockRegion] = useState("us-east-1");
  const [bedrockModel, setBedrockModel] = useState("anthropic.claude-3-5-sonnet-20241022-v2:0");
  const [bedrockFastModel, setBedrockFastModel] = useState("");
  const [selfHostedUrl, setSelfHostedUrl] = useState("");
  const [selfHostedModel, setSelfHostedModel] = useState("");
  const [selfHostedFastModel, setSelfHostedFastModel] = useState("");
  const [showByokFast, setShowByokFast] = useState(false);
  const [showBedrockFast, setShowBedrockFast] = useState(false);
  const [showSelfHostedFast, setShowSelfHostedFast] = useState(false);
  const [taskModels, setTaskModels] = useState<Record<string, string>>({
    flow_model: "",
    arch_model: "",
    wireframe_model: "",
    wireframe_critic_model: "",
  });
  const [showTaskModels, setShowTaskModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; latencyMs?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    const oid = getStoredOrgId();
    setOrgId(oid);
    if (!oid) return;
    authFetch(`/api/orgs/${oid}/ai-config`).then(async (r) => {
      if (!r.ok) return;
      const data: AIConfig = await r.json();
      setProvider(data.provider || "platform");
      setByokProvider(data.byok_provider || "anthropic");
      setByokKeyMasked(data.byok_api_key_masked || null);
      setByokDefaultModel(data.byok_default_model || "");
      setByokFastModel(data.byok_fast_model || "");
      setBedrockArn(data.bedrock_role_arn || "");
      setBedrockRegion(data.bedrock_region || "us-east-1");
      setBedrockModel(data.bedrock_model || "anthropic.claude-3-5-sonnet-20241022-v2:0");
      setBedrockFastModel(data.bedrock_fast_model || "");
      setSelfHostedUrl(data.self_hosted_url || "");
      setSelfHostedModel(data.self_hosted_model || "");
      setSelfHostedFastModel(data.self_hosted_fast_model || "");
      if (data.byok_fast_model) setShowByokFast(true);
      if (data.bedrock_fast_model) setShowBedrockFast(true);
      if (data.self_hosted_fast_model) setShowSelfHostedFast(true);
      const tm = {
        flow_model: data.flow_model || "",
        arch_model: data.arch_model || "",
        wireframe_model: data.wireframe_model || "",
        wireframe_critic_model: data.wireframe_critic_model || "",
      };
      setTaskModels(tm);
      if (tm.flow_model || tm.arch_model || tm.wireframe_model || tm.wireframe_critic_model)
        setShowTaskModels(true);
    });
  }, [ready, authFetch]);

  const summary = useMemo(() => {
    switch (provider) {
      case "platform":
        return "Anthropic Claude · platform default";
      case "byok": {
        const modelLabel =
          BYOK_MODELS[byokProvider]?.find((m) => m.id === byokDefaultModel)?.label ?? "tier defaults";
        return `${BYOK_LABEL[byokProvider] ?? byokProvider} · ${modelLabel}${byokKeyMasked ? "" : " · key not set"}`;
      }
      case "bedrock": {
        const modelLabel = BEDROCK_MODELS.find((m) => m.id === bedrockModel)?.label ?? bedrockModel;
        return `AWS Bedrock · ${modelLabel} · ${bedrockRegion}`;
      }
      case "self_hosted":
        return `Self-hosted · ${selfHostedModel || "no model set"}`;
    }
  }, [provider, byokProvider, byokKeyMasked, byokDefaultModel, bedrockModel, bedrockRegion, selfHostedModel]);

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const body: Record<string, string | null> = { provider };
      if (provider === "byok") {
        body.byok_provider = byokProvider;
        if (byokKey) body.byok_api_key = byokKey;
        body.byok_default_model = byokDefaultModel;
        body.byok_fast_model = showByokFast ? byokFastModel : "";
      }
      if (provider === "bedrock") {
        body.bedrock_role_arn = bedrockArn;
        body.bedrock_region = bedrockRegion;
        body.bedrock_model = bedrockModel;
        body.bedrock_fast_model = showBedrockFast ? bedrockFastModel : "";
      }
      if (provider === "self_hosted") {
        body.self_hosted_url = selfHostedUrl;
        body.self_hosted_model = selfHostedModel;
        body.self_hosted_fast_model = showSelfHostedFast ? selfHostedFastModel : "";
      }
      // Per-task model overrides apply to the platform pipeline regardless of
      // the provider above, so they're always sent ("" clears to role default).
      body.flow_model = taskModels.flow_model;
      body.arch_model = taskModels.arch_model;
      body.wireframe_model = taskModels.wireframe_model;
      body.wireframe_critic_model = taskModels.wireframe_critic_model;
      const r = await authFetch(`/api/orgs/${orgId}/ai-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`Failed: ${r.status}`);
      const data: AIConfig = await r.json();
      setByokKeyMasked(data.byok_api_key_masked || null);
      setByokKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!orgId) return;
    setTesting(true);
    setTestResult(null);
    const started = performance.now();
    try {
      const r = await authFetch(`/api/orgs/${orgId}/ai-config/test`, { method: "POST" });
      const data = await r.json();
      setTestResult({ ...data, latencyMs: Math.round(performance.now() - started) });
    } catch {
      setTestResult({ ok: false, message: "Connection failed" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-body font-semibold text-foreground tracking-wide">AI provider</h3>
        <p className="text-[11px] text-muted-foreground font-body mt-0.5">{summary}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {PROVIDERS.map((p) => {
          const Icon = p.icon;
          const active = provider === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setProvider(p.id)}
              aria-pressed={active}
              className={cn(
                "group relative flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring/50",
                active
                  ? "border-primary bg-primary/5"
                  : "border-border/50 hover:border-border bg-background",
              )}
            >
              <div className="flex w-full items-center gap-2">
                <Icon className={cn("size-3.5", active ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
                <span className="text-xs font-body font-medium text-foreground">{p.name}</span>
                {p.recommended && (
                  <span className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-body font-medium tracking-wide uppercase bg-success/15 text-success">
                    Recommended
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground font-body">{p.tag}</p>
              <p className="text-[10px] text-muted-foreground/60 font-body">{p.pricing}</p>
            </button>
          );
        })}
      </div>

      {provider === "byok" && (
        <div className="rounded-lg border border-border/40 bg-card/40 px-4 py-3 space-y-3">
          <div className="space-y-2">
            <Label className="text-[10px] font-body font-medium tracking-[0.1em] uppercase text-muted-foreground">
              API key
            </Label>
            <div className="flex gap-2">
              <select
                value={byokProvider}
                onChange={(e) => {
                  setByokProvider(e.target.value);
                  setByokDefaultModel("");
                  setByokFastModel("");
                }}
                className="h-8 text-xs font-body bg-background border border-input rounded-lg px-2 text-foreground"
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="google">Google</option>
              </select>
              <Input
                placeholder={byokKeyMasked || "sk-..."}
                value={byokKey}
                onChange={(e) => setByokKey(e.target.value)}
                className="flex-1"
                type="password"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-body font-medium tracking-[0.1em] uppercase text-muted-foreground">
              Model
            </Label>
            <select
              value={byokDefaultModel}
              onChange={(e) => setByokDefaultModel(e.target.value)}
              className="w-full h-8 text-xs font-body bg-background border border-input rounded-lg px-2 text-foreground"
            >
              <option value="">Auto (use tier defaults)</option>
              {BYOK_MODELS[byokProvider]?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <FastModelDisclosure
            open={showByokFast}
            onToggle={() => setShowByokFast((s) => !s)}
            label="Use a cheaper model for quick tasks"
          >
            <p className="text-[10px] text-muted-foreground font-body">
              Saves tokens on auto-suggestions, fast extractions, and short summaries.
            </p>
            <select
              value={byokFastModel}
              onChange={(e) => setByokFastModel(e.target.value)}
              className="w-full h-8 text-xs font-body bg-background border border-input rounded-lg px-2 text-foreground"
            >
              <option value="">Use the model above</option>
              {BYOK_MODELS[byokProvider]?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </FastModelDisclosure>
        </div>
      )}

      {provider === "bedrock" && (
        <div className="rounded-lg border border-border/40 bg-card/40 px-4 py-3 space-y-2.5">
          <div>
            <Label className="text-[10px] font-body font-medium tracking-[0.1em] uppercase text-muted-foreground">Role ARN</Label>
            <Input
              placeholder="arn:aws:iam::123456:role/planr-bedrock-access"
              value={bedrockArn}
              onChange={(e) => setBedrockArn(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] font-body font-medium tracking-[0.1em] uppercase text-muted-foreground">Region</Label>
              <select
                value={bedrockRegion}
                onChange={(e) => setBedrockRegion(e.target.value)}
                className="mt-1 w-full h-8 text-xs font-body bg-background border border-input rounded-lg px-2 text-foreground"
              >
                <option value="us-east-1">us-east-1</option>
                <option value="us-west-2">us-west-2</option>
                <option value="eu-west-1">eu-west-1</option>
                <option value="eu-central-1">eu-central-1</option>
                <option value="ap-northeast-1">ap-northeast-1</option>
              </select>
            </div>
            <div>
              <Label className="text-[10px] font-body font-medium tracking-[0.1em] uppercase text-muted-foreground">Model</Label>
              <select
                value={bedrockModel}
                onChange={(e) => setBedrockModel(e.target.value)}
                className="mt-1 w-full h-8 text-xs font-body bg-background border border-input rounded-lg px-2 text-foreground"
              >
                {BEDROCK_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <FastModelDisclosure
            open={showBedrockFast}
            onToggle={() => setShowBedrockFast((s) => !s)}
            label="Use a cheaper model for quick tasks"
          >
            <select
              value={bedrockFastModel}
              onChange={(e) => setBedrockFastModel(e.target.value)}
              className="w-full h-8 text-xs font-body bg-background border border-input rounded-lg px-2 text-foreground"
            >
              <option value="">Use the model above</option>
              {BEDROCK_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </FastModelDisclosure>
        </div>
      )}

      {provider === "self_hosted" && (
        <div className="rounded-lg border border-border/40 bg-card/40 px-4 py-3 space-y-2.5">
          <div>
            <Label className="text-[10px] font-body font-medium tracking-[0.1em] uppercase text-muted-foreground">URL (OpenAI-compatible)</Label>
            <Input
              placeholder="https://llm.internal.company.com/v1"
              value={selfHostedUrl}
              onChange={(e) => setSelfHostedUrl(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-[10px] font-body font-medium tracking-[0.1em] uppercase text-muted-foreground">Model</Label>
            <Input
              placeholder="llama-3.1-70b"
              value={selfHostedModel}
              onChange={(e) => setSelfHostedModel(e.target.value)}
              className="mt-1"
            />
          </div>

          <FastModelDisclosure
            open={showSelfHostedFast}
            onToggle={() => setShowSelfHostedFast((s) => !s)}
            label="Use a cheaper model for quick tasks"
          >
            <Input
              placeholder="llama-3.1-8b"
              value={selfHostedFastModel}
              onChange={(e) => setSelfHostedFastModel(e.target.value)}
            />
          </FastModelDisclosure>
        </div>
      )}

      <div className="rounded-lg border border-border/40 bg-card/40 px-4 py-3">
        <FastModelDisclosure
          open={showTaskModels}
          onToggle={() => setShowTaskModels((s) => !s)}
          label="Models per generation task"
        >
          <p className="text-[10px] text-muted-foreground font-body">
            Choose which model powers each heavy task. Auto uses the platform default. Applies to all providers above.
          </p>
          {TASK_MODELS.map((t) => (
            <div key={t.key} className="space-y-1">
              <Label className="text-[10px] font-body font-medium tracking-[0.1em] uppercase text-muted-foreground">
                {t.label}
              </Label>
              <select
                value={taskModels[t.key]}
                onChange={(e) => setTaskModels((prev) => ({ ...prev, [t.key]: e.target.value }))}
                className="w-full h-8 text-xs font-body bg-background border border-input rounded-lg px-2 text-foreground"
              >
                {TASK_MODEL_OPTIONS.map((m) => (
                  <option key={m.id || "auto"} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground/60 font-body">{t.hint}</p>
            </div>
          ))}
        </FastModelDisclosure>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button onClick={handleSave} disabled={saving} size="sm" className="text-xs">
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </Button>
        {provider !== "platform" && (
          <Button onClick={handleTest} disabled={testing} size="sm" variant="outline" className="text-xs">
            {testing ? "Testing…" : "Test connection"}
          </Button>
        )}
      </div>

      {error && <SettingsInlineError message={error} />}

      {testResult && (
        testResult.ok ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success font-body"
          >
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            <span>
              Connected.{testResult.latencyMs ? ` ${testResult.latencyMs}ms.` : ""} {testResult.message}
            </span>
          </div>
        ) : (
          <SettingsInlineError message={testResult.message || "Connection failed"} />
        )
      )}
    </div>
  );
}

function FastModelDisclosure({
  open,
  onToggle,
  label,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border/40 pt-2.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-[11px] font-body font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown
          className={cn("size-3 transition-transform", open ? "rotate-0" : "-rotate-90")}
          aria-hidden="true"
        />
        {label}
      </button>
      {open && <div className="mt-2 space-y-2">{children}</div>}
    </div>
  );
}
