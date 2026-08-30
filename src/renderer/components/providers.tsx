'use client';

import { SessionProvider } from 'next-auth/react';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import { Toaster } from '@/components/ui/toast';
import { NikoProvider } from '@/components/niko/niko-provider';
import { ProviderHealthProvider } from '@/components/providers/provider-health-provider';
import { ProviderHealthBanner } from '@/components/system/provider-health-banner';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { BrandProvider } from '@/components/providers/brand-provider';
import { AppShell } from './app-shell';
import { AmbienceHost } from '@/components/yeaboi/ambience-host';
import { NikoBar } from '@/components/niko/niko-bar';
import { ScreensaverHost } from '@/components/screensaver/screensaver-host';
import { CapturePicker } from '@/components/session/capture-picker';
import { OnboardingGate } from '@/components/onboarding/onboarding-gate';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <BrandProvider>
          <ConfirmProvider>
            <ProviderHealthProvider>
              <NikoProvider>
                {/* First run, the wizard is the whole window; the shell and its
                    chrome mount only once onboarding is done or not needed. */}
                <OnboardingGate>
                  <ProviderHealthBanner />
                  <AppShell>{children}</AppShell>
                  <NikoBar />
                  <AmbienceHost />
                  <ScreensaverHost />
                </OnboardingGate>
                <CapturePicker />
                <Toaster />
              </NikoProvider>
            </ProviderHealthProvider>
          </ConfirmProvider>
        </BrandProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
