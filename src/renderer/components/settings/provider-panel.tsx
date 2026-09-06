'use client';

// The provider you are on, and the two things that define it: the model it
// runs and the credential it runs on. Collapsed to one line like every other
// card on the page — this is a page you mostly read — opening onto the same
// grid /setup uses, the model list, and the key.

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useProviderHealthContext } from '@/components/providers/provider-health-provider';
import { providerFailureLabel } from '@shared/provider-copy';
import type { ProviderCard, ProviderCatalog, SettingField } from '@/lib/yeaboi/settings';
import { CUSTOM_MODEL, modelTrait } from '@/components/yeaboi/model-choice';
import { GuideLink } from '@/components/onboarding/guide-link';
import { Linkified } from '@/components/yeaboi/linkified';
import { ProviderIcon } from '@/components/yeaboi/provider-icon';
import { Picker } from '@/components/ui/picker';
import { SettingsCard } from '@/components/settings/primitives';
import { Segmented } from '@/components/ui/segmented';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const DOT = ' · ';

/** One editable value: the label above, the control below, help beneath that.
 *  Secrets always start empty so a save can never write dots over a key. */
function CredentialField({
  field,
  onSave,
}: {
  field: SettingField;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const current = field.secret ? '' : field.value;
  const value = draft ?? current;
  const changed = field.secret ? Boolean(value.trim()) : value !== current;

  return (
    <form
      className="flex min-w-[22rem] flex-1 items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(value.trim());
        setDraft(null);
      }}
    >
      <span className="flex items-center gap-2">
        <input
          type={field.secret ? 'password' : 'text'}
          value={value}
          aria-label={field.label}
          placeholder={
            field.is_set
              ? field.secret
                ? `${field.value} — type to replace`
                : field.value
              : field.default || ''
          }
          onChange={(event) => setDraft(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-border/40 bg-secondary/40 px-3 py-1.5 font-mono text-[12.5px] text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/40 focus:outline-none"
        />
        <Button size="sm" variant="outline" type="submit" disabled={!changed}>
          Save
        </Button>
        {field.help_url && (
          <span className="shrink-0">
            <GuideLink url={field.help_url} scope={field.help_scope} />
          </span>
        )}
      </span>
    </form>
  );
}

export function ProviderPanel({
  card,
  fields,
  catalog,
  onSave,
  onSignIn,
  action,
}: {
  /** The catalog card for the provider in use, if the catalog has loaded. */
  card: ProviderCard | null;
  /** Only the rows this provider actually uses. */
  fields: SettingField[];
  catalog: ProviderCatalog | null;
  onSave: (env: string, value: string) => void;
  onSignIn: () => void;
  /** Anything the page wants on the header's right — the way back to setup. */
  action?: React.ReactNode;
}) {
  const [custom, setCustom] = useState('');
  const { summary } = useProviderHealthContext();

  const byEnv = (env: string) => fields.find((f) => f.env === env);
  const providerField = byEnv('LLM_PROVIDER');
  const modelField = byEnv('LLM_MODEL');
  const authField = byEnv('ANTHROPIC_AUTH_MODE');
  const signInField = fields.find((f) => f.action === 'signin');
  // Everything that isn't the provider, the model, the auth switch or the
  // sign-in row is a credential this provider needs typed in.
  const credentials = fields.filter(
    (f) => !['LLM_PROVIDER', 'LLM_MODEL', 'ANTHROPIC_AUTH_MODE'].includes(f.env) && !f.action,
  );

  const presets = card?.models.presets ?? [];
  const recommended = card?.models.default ?? '';
  const model = modelField?.value ?? '';
  const modelIsPreset = presets.includes(model);
  const modelValue = model === '' ? recommended : modelIsPreset ? model : CUSTOM_MODEL;

  // The line under the name: what it runs, and what it runs on.
  const credentialState = (): { text: string; live: boolean } => {
    if (signInField)
      return {
        text: signInField.is_set ? 'subscription' : 'not signed in',
        live: signInField.is_set,
      };
    const secret = credentials.find((f) => f.secret);
    if (secret) return { text: secret.is_set ? 'API key' : 'no API key', live: secret.is_set };
    const first = credentials[0];
    if (first) return { text: first.value || first.default || 'not set', live: first.is_set };
    return { text: 'no credential needed', live: true };
  };
  // A configured credential that the provider then rejected must not keep
  // reading as green: health is what a real call proved, and it wins.
  const snapshot = summary?.providers?.[card?.provider_val ?? ''];
  const unhealthy = !!snapshot?.status && snapshot.status !== 'ok';
  const state = unhealthy
    ? { text: providerFailureLabel(snapshot?.error_code), live: false }
    : credentialState();

  return (
    // No card behind it: what is on it is a summary line and two controls that
    // are cards themselves.
    <SettingsCard index={0} variant="flat" animate={false}>
      <div className="flex items-center gap-3.5 border-b border-border/40 px-[var(--card-gutter,1rem)] py-3">
        <ProviderIcon provider={card?.provider_val ?? 'anthropic'} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block font-body text-[13.5px] font-medium text-foreground">
            AI provider
          </span>
          <span className="block truncate text-[12px]">
            <span className="text-muted-foreground">{card?.full_name ?? 'LLM provider'}</span>
            <span className="text-muted-foreground/50">{DOT}</span>
            <span className="text-muted-foreground">{model || `${recommended} (default)`}</span>
            <span className="text-muted-foreground/50">{DOT}</span>
            <span
              className={
                unhealthy
                  ? 'text-destructive'
                  : state.live
                    ? 'text-success'
                    : 'text-muted-foreground/70'
              }
            >
              {state.text}
            </span>
          </span>
        </span>
        {action}
      </div>

      <div className="space-y-5 px-[var(--card-gutter,1rem)] py-4">
        {/* Read together and changed together, so they sit together. */}
        <div className="grid gap-5 md:grid-cols-2">
          {providerField && catalog && (
            <div>
              <h3 className="mb-2 font-mono text-[10px] tracking-widest text-muted-foreground/60 uppercase">
                Provider
              </h3>
              {/* A list, not a wall: there are a dozen of these and only one
                    is ever in use. The grid is the setup flow's, where picking
                    one is the whole screen. */}
              <Picker
                label="Provider"
                variant="card"
                value={providerField.active_choice ?? ''}
                options={catalog.providers.map((one) => ({
                  value: one.provider_val,
                  label: one.full_name,
                  note: one.tagline,
                  icon: <ProviderIcon provider={one.provider_val} size={28} />,
                }))}
                onChange={(picked) => {
                  if (picked !== providerField.active_choice) onSave('LLM_PROVIDER', picked);
                }}
              />
            </div>
          )}
          {modelField && presets.length > 0 && (
            <div>
              <h3 className="mb-2 font-mono text-[10px] tracking-widest text-muted-foreground/60 uppercase">
                Model
              </h3>
              <Picker
                label="Model"
                variant="card"
                value={modelValue}
                options={[
                  ...presets.map((id) => ({
                    value: id,
                    label: id,
                    mono: true,
                    ...(modelTrait(id, card?.model_hints ?? {})
                      ? { note: modelTrait(id, card?.model_hints ?? {}) }
                      : {}),
                    ...(id === recommended ? { badge: 'recommended' } : {}),
                  })),
                  {
                    value: CUSTOM_MODEL,
                    label: 'Custom…',
                    note: 'Paste any model id this credential can reach.',
                  },
                ]}
                onChange={(id) => {
                  if (id === CUSTOM_MODEL) setCustom(modelIsPreset ? '' : model);
                  else onSave('LLM_MODEL', id === recommended ? '' : id);
                }}
              />
              {modelValue === CUSTOM_MODEL && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={custom}
                    onChange={(event) => setCustom(event.target.value)}
                    placeholder="model id"
                    aria-label="Custom model id"
                    className="min-w-0 flex-1 rounded-lg border border-border/40 bg-secondary/40 px-3 py-2 font-mono text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/50 focus-visible:border-border"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!custom.trim() || custom.trim() === model}
                    onClick={() => onSave('LLM_MODEL', custom.trim())}
                  >
                    Use this model
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-2 font-mono text-[10px] tracking-widest text-muted-foreground/60 uppercase">
            Credential
          </h3>
          {/* The choice and what it needs sit on one line: picking the tier is
              the question, and the key or the account is the answer to it. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            {authField && (
              <Segmented
                label="Credential"
                options={authField.choices}
                value={authField.active_choice}
                {...(authField.choice_labels ? { labels: authField.choice_labels } : {})}
                onPick={(opt) => onSave(authField.env, opt)}
              />
            )}
            {/* Keyed on the tier, so switching plays the new row in rather
                than swapping one for the other between frames. */}
            <div
              key={authField?.active_choice ?? 'credential'}
              className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 motion-reduce:animate-none"
              style={{ animation: 'swap-in 200ms ease-out both' }}
            >
              {credentials.map((field) => (
                <CredentialField
                  key={field.env}
                  field={field}
                  onSave={(value) => onSave(field.env, value)}
                />
              ))}
              {signInField && (
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`font-mono text-[12px] ${
                      signInField.is_set ? 'text-foreground' : 'text-muted-foreground/50'
                    }`}
                  >
                    {signInField.is_set ? signInField.value : 'not signed in'}
                  </span>
                  <Button variant="outline" size="sm" onClick={onSignIn}>
                    Sign in…
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-3">
            {card?.instructions && !signInField && (
              <p className="text-[11px] leading-snug text-muted-foreground/80">
                <Linkified text={card.instructions} />
              </p>
            )}
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}
