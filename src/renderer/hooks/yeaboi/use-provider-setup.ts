// The provider-setup flow's state and actions, lifted out of the /setup page
// so the first-run onboarding wizard and the settings page drive one
// implementation. Pick a provider, enter (and live-verify) its credential —
// or run the subscription sign-in — then pick a model and save.

import { useEffect, useState } from 'react';
import {
  type ProviderCard,
  type ProviderCatalog,
  discoverModels,
  loadProviders,
  saveSetting,
  verifyProvider,
} from '@/lib/yeaboi/settings';

/** Moments the flow's host may react to (the wizard's duck does). */
export type ProviderSetupEvent = 'verified' | 'rejected' | 'saved' | 'signin-open';

export interface ProviderSetupSaved {
  providerName: string;
  model: string;
}

export type ProviderPhase = 'pick' | 'credential' | 'model' | 'saved';

export function useProviderSetup(options?: {
  onSaved?: (result: ProviderSetupSaved) => void;
  onEvent?: (event: ProviderSetupEvent) => void;
}) {
  const { onSaved, onEvent } = options ?? {};
  const [catalog, setCatalog] = useState<ProviderCatalog | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [phase, setPhase] = useState<ProviderPhase>('pick');
  const [provider, setProvider] = useState<ProviderCard | null>(null);

  // Credential phase. For the subscription path the credential stays '' —
  // the backend already holds the token.
  const [authMode, setAuthMode] = useState<'api_key' | 'subscription'>('api_key');
  const [credential, setCredential] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verdict, setVerdict] = useState<{ ok: boolean; message: string } | null>(null);

  // Model phase.
  const [models, setModels] = useState<string[]>([]);
  const [hints, setHints] = useState<Record<string, string>>({});
  const [discovering, setDiscovering] = useState(false);
  const [model, setModel] = useState('');
  const [custom, setCustom] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    loadProviders().then(setCatalog, (e: Error) => setCatalogError(e.message));
  }, []);

  const pickProvider = (card: ProviderCard) => {
    setProvider(card);
    setCredential(card.is_base_url_input ? (card.default_input ?? '') : '');
    setAuthMode('api_key');
    setSignedIn(false);
    setVerdict(null);
    setPhase('credential');
  };

  const enterModelPhase = () => {
    if (!provider) return;
    setPhase('model');
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
        onEvent?.(result.ok ? 'verified' : 'rejected');
        if (result.ok) enterModelPhase();
      },
      (e: Error) => {
        setVerdict({ ok: false, message: e.message });
        setVerifying(false);
        onEvent?.('rejected');
      },
    );
  };

  const openSignIn = () => {
    setSigningIn(true);
    onEvent?.('signin-open');
  };

  const closeSignIn = (saved: boolean, message: string) => {
    setSigningIn(false);
    setSignedIn(saved);
    setVerdict({ ok: saved, message });
    onEvent?.(saved ? 'verified' : 'rejected');
    // A saved token means the credential step is done — go pick a model.
    if (saved) enterModelPhase();
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
      setPhase('saved');
      onEvent?.('saved');
      onSaved?.({ providerName: provider.full_name, model: chosen });
    } catch (e) {
      setSaveError((e as Error).message);
    }
  };

  const subscription = provider?.provider_val === 'anthropic' && authMode === 'subscription';
  const credentialReady = subscription ? signedIn : credential.trim().length > 0;
  const chosenModel = model === '__custom__' ? custom.trim() : model;

  return {
    catalog,
    catalogError,
    phase,
    setPhase,
    provider,
    pickProvider,
    authMode,
    setAuthMode,
    credential,
    setCredential,
    signedIn,
    signingIn,
    openSignIn,
    closeSignIn,
    verifying,
    verdict,
    verify,
    enterModelPhase,
    models,
    hints,
    discovering,
    model,
    setModel,
    custom,
    setCustom,
    saveError,
    finish,
    subscription,
    credentialReady,
    chosenModel,
  };
}

export type ProviderSetup = ReturnType<typeof useProviderSetup>;
