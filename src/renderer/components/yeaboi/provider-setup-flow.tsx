'use client';

// The provider flow's presentation: provider grid → credential (API key or
// subscription sign-in) → model list. One implementation behind both the
// first-run onboarding wizard and the /setup settings page; the host owns
// what surrounds it (step trail, headings, the saved pane).
//
// The grid keeps each card to an icon, a name, and one line — where a key
// comes from belongs to the credential pane, where the URL is a real link.

import { useRef } from 'react';
import type { ProviderSetup } from '@/hooks/yeaboi/use-provider-setup';
import { Linkified } from '@/components/yeaboi/linkified';
import { ModelChoice } from '@/components/yeaboi/model-choice';
import { ProviderGrid } from '@/components/yeaboi/provider-grid';
import { ProviderIcon } from '@/components/yeaboi/provider-icon';
import { SignInPanel } from '@/components/yeaboi/sign-in-panel';
import { Button } from '@/components/ui/button';

// Why the subscription option is inert for these vendors: their subscription
// sign-ins (Codex CLI, Gemini CLI) mint tokens their public APIs refuse, and
// yeaboi calls the public APIs. Anthropic is the one vendor whose API accepts
// its subscription tokens (`claude setup-token`). Stated plainly rather than
// hidden, so the option is discoverable the day a vendor opens it up.
const VENDOR_SUBSCRIPTION_NOTES: Record<string, string> = {
  openai:
    "OpenAI doesn't accept ChatGPT subscription sign-ins on its API yet — paste an API key instead.",
  google:
    "Google doesn't accept Gemini subscription sign-ins on its API yet — paste an API key instead.",
};

function Pane({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="max-w-xl rounded-2xl bg-card ring-1 ring-border/60 p-6">
      <h2 className="flex items-center gap-3 text-[14px] font-body font-medium text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

const FIELD_INPUT =
  'w-full rounded-lg bg-secondary/40 border border-border/40 px-3.5 py-2.5 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40';

function AuthSwitch({ flow, vendorNote }: { flow: ProviderSetup; vendorNote?: string }) {
  const groupRef = useRef<HTMLDivElement>(null);
  const segment = (active: boolean, disabled = false) =>
    `rounded-full px-4 py-1.5 text-[12px] font-body transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/60 ${
      active
        ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
        : disabled
          ? 'text-muted-foreground/40 cursor-not-allowed'
          : 'text-muted-foreground hover:text-foreground'
    }`;

  // A real radiogroup: arrows flip the choice (and carry focus with it);
  // Tab enters and leaves the group as one stop.
  const toggle = () => {
    if (vendorNote) return;
    flow.setAuthMode(flow.authMode === 'api_key' ? 'subscription' : 'api_key');
    requestAnimationFrame(() => {
      groupRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    });
  };
  const onGroupKey = (event: React.KeyboardEvent) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      toggle();
    }
  };

  const radio = (mode: 'api_key' | 'subscription', label: string, disabled = false) => {
    const checked = flow.authMode === mode;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        aria-disabled={disabled}
        tabIndex={checked ? 0 : -1}
        className={segment(checked, disabled)}
        onClick={() => {
          if (!disabled) flow.setAuthMode(mode);
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="mt-5">
      <span
        id="auth-switch-label"
        className="block text-[11px] font-body uppercase tracking-widest text-muted-foreground/70"
      >
        Sign in with
      </span>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-labelledby="auth-switch-label"
        onKeyDown={onGroupKey}
        className="mt-2 inline-flex gap-1 rounded-full bg-secondary/40 p-1 ring-1 ring-border/40"
      >
        {radio('api_key', 'API key')}
        {radio('subscription', 'Subscription', Boolean(vendorNote))}
      </div>
      {vendorNote && <p className="mt-2 text-[11.5px] text-muted-foreground/80">{vendorNote}</p>}
    </div>
  );
}

function CredentialPane({ flow, onBack }: { flow: ProviderSetup; onBack: () => void }) {
  const provider = flow.provider;
  if (!provider) return null;
  const vendorNote = VENDOR_SUBSCRIPTION_NOTES[provider.provider_val];
  const showAuthSwitch = provider.provider_val === 'anthropic' || Boolean(vendorNote);
  const credentialLabel = provider.is_region_input
    ? 'AWS Region'
    : provider.is_base_url_input
      ? 'Server URL'
      : 'API key';

  return (
    <Pane
      title={
        <>
          <ProviderIcon provider={provider.provider_val} size={32} />
          <span>
            {provider.full_name}
            <span className="mt-0.5 block text-[11.5px] font-normal text-muted-foreground">
              {flow.subscription ? (
                'Billed to your Claude plan — no API key needed.'
              ) : (
                <Linkified text={provider.instructions} />
              )}
            </span>
          </span>
        </>
      }
    >
      {showAuthSwitch && <AuthSwitch flow={flow} vendorNote={vendorNote} />}

      {flow.subscription ? (
        <div className="mt-5">
          {flow.signingIn && <SignInPanel onClose={flow.closeSignIn} />}
          <div className="rounded-xl bg-secondary/30 ring-1 ring-border/40 p-4">
            <p className="text-[13px] font-medium text-foreground">Use your Claude subscription</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
              Pro and Max plans cover yeaboi's calls — nothing extra to pay for. A browser window
              opens to authorize; the token is stored on this machine and never shown here.
            </p>
            <p className="mt-3 flex items-center gap-2 text-[12px]" role="status">
              {flow.signedIn ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                  <span className="text-success">Signed in — subscription token saved</span>
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" aria-hidden />
                  <span className="text-muted-foreground/80">Not signed in yet</span>
                </>
              )}
            </p>
          </div>
        </div>
      ) : (
        <label className="mt-5 block">
          <span className="text-[11px] font-body uppercase tracking-widest text-muted-foreground/70">
            {credentialLabel}
          </span>
          <input
            type={provider.is_region_input || provider.is_base_url_input ? 'text' : 'password'}
            value={flow.credential}
            placeholder={provider.prefix ? `${provider.prefix}…` : ''}
            autoFocus
            onChange={(event) => flow.setCredential(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && flow.credentialReady && !flow.verifying) {
                event.preventDefault();
                flow.verify();
              }
            }}
            className={`mt-2 ${FIELD_INPUT}`}
          />
        </label>
      )}

      {flow.verdict && !(flow.subscription && flow.verdict.ok) && (
        <p
          role="status"
          className={`mt-3 text-[12px] ${flow.verdict.ok ? 'text-success' : 'text-destructive'}`}
        >
          {flow.verdict.message}
        </p>
      )}

      <div className="mt-6 flex items-center gap-2.5">
        {flow.subscription ? (
          flow.signedIn ? (
            <>
              <Button onClick={flow.enterModelPhase}>Continue</Button>
              <Button variant="outline" onClick={flow.openSignIn}>
                Sign in again
              </Button>
            </>
          ) : (
            <Button onClick={flow.openSignIn}>Sign in with Claude</Button>
          )
        ) : (
          <>
            <Button disabled={!flow.credentialReady || flow.verifying} onClick={flow.verify}>
              {flow.verifying ? 'Verifying…' : 'Verify & continue'}
            </Button>
            {flow.verdict && !flow.verdict.ok && (
              <Button
                variant="outline"
                disabled={!flow.credentialReady}
                onClick={flow.enterModelPhase}
              >
                Use anyway
              </Button>
            )}
          </>
        )}
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>
    </Pane>
  );
}

function ModelPane({ flow, saveLabel }: { flow: ProviderSetup; saveLabel: string }) {
  const provider = flow.provider;
  if (!provider) return null;
  const rowClass = (selected: boolean) =>
    `flex items-start gap-3 rounded-xl px-3.5 py-3 cursor-pointer transition-colors ${
      selected ? 'bg-primary/10 ring-1 ring-primary/40' : 'bg-secondary/40 hover:bg-secondary/70'
    }`;
  return (
    <Pane
      title={
        <>
          <ProviderIcon provider={provider.provider_val} size={32} />
          <span>
            Pick a model
            <span className="mt-0.5 block text-[11.5px] font-normal text-muted-foreground">
              {flow.discovering
                ? 'Discovering what this credential can run…'
                : `What ${provider.name} runs for you day to day. You can switch any time in Settings.`}
            </span>
          </span>
        </>
      }
    >
      <div className="mt-5">
        <ModelChoice
          models={flow.models}
          recommended={provider.models.default}
          hints={flow.hints}
          value={flow.model}
          custom={flow.custom}
          onPick={flow.setModel}
          onCustom={flow.setCustom}
          busy={flow.discovering}
        />
      </div>
      {flow.saveError && <p className="mt-3 text-[12px] text-destructive">{flow.saveError}</p>}
      <div className="mt-6 flex items-center gap-2.5">
        <Button
          disabled={flow.model === '__custom__' && !flow.custom.trim()}
          onClick={() => void flow.finish()}
        >
          {saveLabel}
        </Button>
        <Button variant="ghost" onClick={() => flow.setPhase('credential')}>
          Back
        </Button>
      </div>
    </Pane>
  );
}

export function ProviderSetupFlow({
  flow,
  saveLabel = 'Save',
}: {
  flow: ProviderSetup;
  saveLabel?: string;
}) {
  if (flow.catalogError)
    return (
      <p className="text-[13px] text-muted-foreground">
        Could not load the provider catalog: {flow.catalogError}
      </p>
    );
  if (!flow.catalog) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  if (flow.phase === 'pick')
    return <ProviderGrid providers={flow.catalog.providers} onPick={flow.pickProvider} />;
  if (flow.phase === 'credential')
    return <CredentialPane flow={flow} onBack={() => flow.setPhase('pick')} />;
  if (flow.phase === 'model') return <ModelPane flow={flow} saveLabel={saveLabel} />;
  return null;
}
