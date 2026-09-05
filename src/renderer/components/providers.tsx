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
import { AudienceProvider } from '@/components/providers/audience-provider';
import { AudienceGate } from '@/components/audience/audience-gate';
import { RailProvider } from '@/components/providers/rail-provider';
import { PaletteProvider } from '@/components/providers/palette-provider';
import { MusicProvider } from '@/components/providers/music-provider';
import { GlobalPalette } from '@/components/palette/global-palette';

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
                  {/* Once onboarding is done, the audience question gates the
                      window the same way — once, and never again. */}
                  <AudienceProvider>
                    {/* The rail's squares are a preference per world; the rail
                        and the dialog that arranges it read one copy. */}
                    <RailProvider>
                      {/* Find anything: one dialog the home's field, the title
                          bar and the Go menu all open. */}
                      <PaletteProvider>
                        {/* One player for the rail's pocket, the Music page
                            and the menu chords; the radio's station is the
                            backend's, shared with the terminal. */}
                        <MusicProvider>
                          <AudienceGate>
                            <ProviderHealthBanner />
                            <AppShell>{children}</AppShell>
                            <NikoBar />
                            <GlobalPalette />
                            <AmbienceHost />
                            <ScreensaverHost />
                          </AudienceGate>
                        </MusicProvider>
                      </PaletteProvider>
                    </RailProvider>
                  </AudienceProvider>
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
