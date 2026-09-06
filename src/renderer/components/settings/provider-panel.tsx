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
import { CUSTOM_MODEL, ModelChoice } from '@/components/yeaboi/model-choice';
import { GuideLink } from '@/components/onboarding/guide-link';
import { Linkified } from '@/components/yeaboi/linkified';
import { ProviderGrid } from '@/components/yeaboi/provider-grid';
import { ProviderIcon } from '@/components/yeaboi/provider-icon';
import { ChoicePills, SettingsCard } from '@/components/settings/primitives';
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
      className="block"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(value.trim());
        setDraft(null);
      }}
    >
      <span className="text-[11px] font-body tracking-wide text-muted-foreground uppercase">
        {field.label}
      </span>
      <span className="mt-1 flex items-center gap-2">
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
          className="min-w-0 flex-1 rounded-lg border border-border/40 bg-secondary/40 px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/40 focus:outline-none"
        />
        <Button size="sm" variant="outline" type="submit" disabled={!changed}>
          Save
        </Button>
      </span>
      {field.help_url && <GuideLink url={field.help_url} scope={field.help_scope} />}
    </form>
  );
}

export function ProviderPanel({
  card,
  fields,
  catalog,
  onSave,
  onSignIn,
}: {
  /** The catalog card for the provider in use, if the catalog has loaded. */
  card: ProviderCard | null;
  /** Only the rows this provider actually uses. */
  fields: SettingField[];
  catalog: ProviderCatalog | null;
  onSave: (env: string, value: string) => void;
  onSignIn: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Mounted from the first open onwards, so closing animates as well as
  // opening — and a page of these costs nothing until one is asked for.
  const [everOpen, setEverOpen] = useState(false);
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
    // Open, the card gets out of the way: what is inside is a page of choices,
    // and a fill behind them made them cards on a card.
    <SettingsCard
      index={0}
      className={cn('transition-colors duration-200', open && 'bg-transparent ring-transparent')}
    >
      <button
        type="button"
        onClick={() => {
          setEverOpen(true);
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="group flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-secondary/30 focus-visible:ring-1 focus-visible:ring-primary/50 focus-visible:outline-none"
      >
        <ProviderIcon provider={card?.provider_val ?? 'anthropic'} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-body font-medium text-foreground">
            {card?.full_name ?? 'LLM provider'}
          </span>
          <span className="block truncate text-[12px]">
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
        <ChevronRight
          aria-hidden
          className={`h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:text-muted-foreground ${
            open ? 'rotate-90' : ''
          }`}
        />
      </button>

      {/* The panel opens by growing rather than appearing: a grid row from
          nothing to its content's height, which is the one way to ease to a
          height nobody has measured. */}
      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-[240ms] ease-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          {everOpen && (
            <div className="space-y-5 border-t border-border/40 px-5 py-4">
              {providerField && catalog && (
                <div>
                  <h3 className="mb-2 font-mono text-[10px] tracking-widest text-muted-foreground/60 uppercase">
                    Provider
                  </h3>
                  <ProviderGrid
                    providers={catalog.providers}
                    active={providerField.active_choice}
                    autoFocus={false}
                    onPick={(picked) => {
                      if (picked.provider_val !== providerField.active_choice)
                        onSave('LLM_PROVIDER', picked.provider_val);
                    }}
                  />
                </div>
              )}
              {modelField && presets.length > 0 && (
                <div>
                  <h3 className="mb-2 font-mono text-[10px] tracking-widest text-muted-foreground/60 uppercase">
                    Model
                  </h3>
                  <ModelChoice
                    models={presets}
                    recommended={recommended}
                    hints={card?.model_hints ?? {}}
                    value={modelValue}
                    custom={custom || (modelIsPreset ? '' : model)}
                    onPick={(id) => {
                      if (id === CUSTOM_MODEL) setCustom(modelIsPreset ? '' : model);
                      else onSave('LLM_MODEL', id === recommended ? '' : id);
                    }}
                    onCustom={setCustom}
                  />
                  {modelValue === CUSTOM_MODEL && (
                    <div className="mt-2">
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

              <div>
                <h3 className="mb-2 font-mono text-[10px] tracking-widest text-muted-foreground/60 uppercase">
                  Credential
                </h3>
                <div className="space-y-3">
                  {authField && (
                    <ChoicePills
                      options={authField.choices}
                      active={authField.active_choice}
                      labels={authField.choice_labels}
                      onPick={(opt) => onSave(authField.env, opt)}
                    />
                  )}
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
                  {credentials.map((field) => (
                    <CredentialField
                      key={field.env}
                      field={field}
                      onSave={(value) => onSave(field.env, value)}
                    />
                  ))}
                  {card?.instructions && !signInField && (
                    <p className="text-[11px] leading-snug text-muted-foreground/80">
                      <Linkified text={card.instructions} />
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </SettingsCard>
  );
}
