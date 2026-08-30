'use client';

// Setup — the provider wizard, four steps like the TUI's: pick a provider,
// enter (and live-verify) its credential, pick a model (live-discovered,
// merged with the curated presets), save. Anthropic offers the subscription
// sign-in as an alternative to pasting a key; the token then lives on the
// backend and never passes through this renderer.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DuckMark } from '@/components/brand/duck';
import {
  type ProviderCard,
  type ProviderCatalog,
  discoverModels,
  loadProviders,
  saveSetting,
  verifyProvider,
} from '@/lib/yeaboi/settings';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { SignInPanel } from '@/components/yeaboi/sign-in-panel';
import { Button } from '@/components/ui/button';

const STEPS = ['Provider', 'Credential', 'Model', 'Done'] as const;

const chip = (active: boolean) =>
  `rounded-full px-3 py-1 text-[11px] font-body transition-colors ${
    active
      ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
      : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
  }`;

function Pane({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
      <h2 className="text-[13px] font-body font-medium text-foreground mb-3">{title}</h2>
      {children}
    </section>
  );
}

function SetupBody() {
  const [catalog, setCatalog] = useState<ProviderCatalog | null>(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState<ProviderCard | null>(null);

  // Credential step state. For the subscription path the credential stays '',
  // the backend already holds the token.
  const [authMode, setAuthMode] = useState<'api_key' | 'subscription'>('api_key');
  const [credential, setCredential] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verdict, setVerdict] = useState<{ ok: boolean; message: string } | null>(null);

  // Model step state.
  const [models, setModels] = useState<string[]>([]);
  const [hints, setHints] = useState<Record<string, string>>({});
  const [discovering, setDiscovering] = useState(false);
  const [model, setModel] = useState('');
  const [custom, setCustom] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    loadProviders().then(setCatalog, (e: Error) => setError(e.message));
  }, []);

  if (error)
    return (
      <p className="text-[13px] text-muted-foreground">
        Could not load the provider catalog: {error}
      </p>
    );
  if (!catalog) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const pickProvider = (card: ProviderCard) => {
    setProvider(card);
    setCredential(card.is_base_url_input ? (card.default_input ?? '') : '');
    setAuthMode('api_key');
    setSignedIn(false);
    setVerdict(null);
    setStep(1);
  };

  const enterModelStep = () => {
    if (!provider) return;
    setStep(2);
    setModel(provider.models.default);
    setModels(provider.models.presets);
    setHints(provider.model_hints ?? {});
    setDiscovering(true);
    discoverModels(provider.provider_val, credential).then(
      (result) => {
        setModels(result.models.length ? result.models : provider.models.presets);
        setHints(result.hints);
        setDiscovering(false);
      },
      () => setDiscovering(false),
    );
  };

  const verify = () => {
    if (!provider) return;
    setVerifying(true);
    setVerdict(null);
    verifyProvider(provider.provider_val, credential).then(
      (result) => {
        setVerdict(result);
        setVerifying(false);
        if (result.ok) enterModelStep();
      },
      (e: Error) => {
        setVerdict({ ok: false, message: e.message });
        setVerifying(false);
      },
    );
  };

  const finish = async () => {
    if (!provider) return;
    const chosen = model === '__custom__' ? custom.trim() : model;
    if (!chosen) return;
    try {
      await saveSetting('LLM_PROVIDER', provider.provider_val);
      if (provider.provider_val === 'anthropic') {
        // The subscription sign-in already persisted its token + auth mode.
        if (authMode === 'api_key') {
          await saveSetting('ANTHROPIC_AUTH_MODE', 'api_key');
          if (credential) await saveSetting('ANTHROPIC_API_KEY', credential);
        }
      } else if (credential) {
        await saveSetting(provider.env_var, credential);
      }
      await saveSetting('LLM_MODEL', chosen);
      setStep(3);
    } catch (e) {
      setSaveError((e as Error).message);
    }
  };

  const subscription = provider?.provider_val === 'anthropic' && authMode === 'subscription';
  const credentialReady = subscription ? signedIn : credential.trim().length > 0;

  return (
    <div>
      <h1 className="font-display text-2xl text-foreground mb-4">Setup</h1>
      <nav className="flex items-center gap-1.5 mb-6">
        {STEPS.map((name, i) => (
          <span
            key={name}
            className={`rounded-full px-3 py-1 text-[11px] font-body ${
              i === step
                ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                : i < step
                  ? 'bg-success/10 text-success'
                  : 'bg-secondary/60 text-muted-foreground/60'
            }`}
          >
            {i + 1}. {name}
          </span>
        ))}
      </nav>

      {step === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {catalog.providers.map((card) => (
            <button
              key={card.provider_val}
              type="button"
              onClick={() => pickProvider(card)}
              className="rounded-2xl bg-card ring-1 ring-border/60 px-5 py-4 text-left transition-colors hover:ring-primary/40 hover:bg-secondary/40"
            >
              <h3 className="text-[13px] font-body font-medium text-foreground">
                {card.full_name}
              </h3>
              <p className="mt-1 text-[12px] text-muted-foreground">{card.tagline}</p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">{card.instructions}</p>
            </button>
          ))}
        </div>
      )}

      {step === 1 && provider && (
        <Pane title={provider.full_name}>
          <p className="text-[12px] text-muted-foreground mb-3">{provider.instructions}</p>

          {provider.provider_val === 'anthropic' && (
            <div className="flex items-center gap-2 mb-3">
              <span className="w-24 shrink-0 text-[11px] font-body text-muted-foreground uppercase tracking-wide">
                Auth
              </span>
              <button
                type="button"
                className={chip(authMode === 'api_key')}
                onClick={() => setAuthMode('api_key')}
              >
                api key
              </button>
              <button
                type="button"
                className={chip(authMode === 'subscription')}
                onClick={() => setAuthMode('subscription')}
              >
                subscription
              </button>
            </div>
          )}

          {subscription ? (
            <div>
              {signingIn ? (
                <SignInPanel
                  onClose={(saved, message) => {
                    setSigningIn(false);
                    setSignedIn(saved);
                    setVerdict({ ok: saved, message });
                  }}
                />
              ) : (
                <Button variant="outline" size="sm" onClick={() => setSigningIn(true)}>
                  {signedIn ? 'Sign in again' : 'Sign in with Claude…'}
                </Button>
              )}
            </div>
          ) : (
            <label className="block">
              <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
                {provider.is_region_input
                  ? 'AWS Region'
                  : provider.is_base_url_input
                    ? 'Server URL'
                    : 'API Key'}
              </span>
              <input
                type={provider.is_region_input || provider.is_base_url_input ? 'text' : 'password'}
                value={credential}
                placeholder={provider.prefix ? `${provider.prefix}…` : ''}
                onChange={(event) => setCredential(event.target.value)}
                className="mt-1 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </label>
          )}

          {verdict && (
            <p className={`mt-3 text-[12px] ${verdict.ok ? 'text-success' : 'text-destructive'}`}>
              {verdict.message}
            </p>
          )}

          <div className="mt-4 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setStep(0)}>
              Back
            </Button>
            {subscription ? (
              <Button size="sm" disabled={!credentialReady} onClick={enterModelStep}>
                Continue
              </Button>
            ) : (
              <>
                <Button size="sm" disabled={!credentialReady || verifying} onClick={verify}>
                  {verifying ? 'Verifying…' : 'Verify & continue'}
                </Button>
                {verdict && !verdict.ok && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!credentialReady}
                    onClick={enterModelStep}
                  >
                    Use anyway
                  </Button>
                )}
              </>
            )}
          </div>
        </Pane>
      )}

      {step === 2 && provider && (
        <Pane title="Model">
          {discovering && (
            <p className="text-[12px] text-muted-foreground animate-pulse mb-2">
              Discovering what this credential can run…
            </p>
          )}
          <div className="space-y-1.5">
            {models.map((id) => (
              <label
                key={id}
                className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 cursor-pointer transition-colors ${
                  model === id
                    ? 'bg-primary/10 ring-1 ring-primary/40'
                    : 'bg-secondary/40 hover:bg-secondary/70'
                }`}
              >
                <input
                  type="radio"
                  name="model"
                  checked={model === id}
                  onChange={() => setModel(id)}
                  className="accent-[var(--primary)]"
                />
                <code className="text-[12px] font-mono text-foreground">{id}</code>
                {id === provider.models.default && (
                  <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] text-success">
                    recommended
                  </span>
                )}
                {hints[id] && (
                  <span className="text-[11px] text-muted-foreground/70">{hints[id]}</span>
                )}
              </label>
            ))}
            <label
              className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 cursor-pointer transition-colors ${
                model === '__custom__'
                  ? 'bg-primary/10 ring-1 ring-primary/40'
                  : 'bg-secondary/40 hover:bg-secondary/70'
              }`}
            >
              <input
                type="radio"
                name="model"
                checked={model === '__custom__'}
                onChange={() => setModel('__custom__')}
                className="accent-[var(--primary)]"
              />
              <span className="text-[12px] text-foreground">Custom…</span>
              {model === '__custom__' && (
                <input
                  value={custom}
                  placeholder="model id"
                  onChange={(event) => setCustom(event.target.value)}
                  className="flex-1 rounded-lg bg-secondary/40 border border-border/40 px-3 py-1.5 text-[12px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              )}
            </label>
          </div>
          {saveError && <p className="mt-3 text-[12px] text-destructive">{saveError}</p>}
          <div className="mt-4 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              size="sm"
              disabled={model === '__custom__' && !custom.trim()}
              onClick={() => void finish()}
            >
              Save
            </Button>
          </div>
        </Pane>
      )}

      {step === 3 && provider && (
        <Pane title="You're set">
          <div className="flex items-center gap-3">
            <DuckMark state="joined" size={56} />
            <p className="text-[13px] text-foreground">
              {provider.full_name} ·{' '}
              <code className="font-mono">{model === '__custom__' ? custom.trim() : model}</code>
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Link href="/home">
              <Button size="sm">Go to Home</Button>
            </Link>
            <Link href="/settings/credentials">
              <Button variant="outline" size="sm">
                Open Settings
              </Button>
            </Link>
          </div>
        </Pane>
      )}
    </div>
  );
}

export default function SetupPage() {
  return (
    <BackendGate>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <SetupBody />
      </div>
    </BackendGate>
  );
}
