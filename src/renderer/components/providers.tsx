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
import { DuckChrome } from '@/components/brand/duck-chrome';
import { AmbienceHost } from '@/components/yeaboi/ambience-host';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <BrandProvider>
          <ConfirmProvider>
            <ProviderHealthProvider>
              <NikoProvider>
                <ProviderHealthBanner />
                <AppShell>{children}</AppShell>
                <DuckChrome />
                <AmbienceHost />
                <Toaster />
              </NikoProvider>
            </ProviderHealthProvider>
          </ConfirmProvider>
        </BrandProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
