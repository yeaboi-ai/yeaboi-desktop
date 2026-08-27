import * as React from 'react';

type SettingsShellProps = {
  header?: React.ReactNode;
  tabs?: React.ReactNode;
  children: React.ReactNode;
};

export function SettingsShell({ header, tabs, children }: SettingsShellProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 mx-auto w-full max-w-4xl px-6 py-12">
        {header}
        {tabs}
        {children}
      </main>
    </div>
  );
}
