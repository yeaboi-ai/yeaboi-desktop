export function SettingsHeader() {
  return (
    <div className="mb-8 animate-slide-up motion-reduce:animate-none">
      <p className="text-[10px] font-body font-medium tracking-[0.18em] uppercase text-muted-foreground mb-3">
        Configuration
      </p>
      <h1 className="font-display text-4xl italic leading-[1.05] text-foreground">Settings</h1>
      <p className="text-sm text-muted-foreground font-body mt-3 leading-relaxed">
        Configure AI, integrations, and team management.
      </p>
    </div>
  );
}
