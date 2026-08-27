"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import { logger } from "@/lib/logger";

type SettingEntry = { key: string; is_set: boolean; masked_value: string | null };

export function GitHubSection() {
  const { ready } = useAuthFetch();
  const [token, setToken] = useState("");
  const [currentMasked, setCurrentMasked] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!ready) return;
    fetch("/api/settings-proxy")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.settings) return;
        const gh = (data.settings as SettingEntry[]).find((s) => s.key === "github_token");
        if (gh?.is_set) setCurrentMasked(gh.masked_value);
      })
      .catch(() => logger.warn("Failed to load org settings"));
  }, [ready]);

  const handleSave = async () => {
    if (!token.trim()) return;
    setSaving(true);
    try {
      const r = await fetch("/api/settings-proxy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: { github_token: token } }),
      });
      if (r.ok) {
        const data = await r.json();
        const gh = (data.settings as SettingEntry[]).find((s) => s.key === "github_token");
        if (gh?.is_set) setCurrentMasked(gh.masked_value);
        setToken("");
        setEditing(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const connected = !!currentMasked;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-body font-semibold text-foreground tracking-wide">Connected services</h3>
        <p className="text-[11px] text-muted-foreground font-body mt-0.5">
          Org-level credentials. Per-user OAuth providers live in the{" "}
          <Link href="/settings#integrations" className="underline underline-offset-2 hover:text-foreground">
            Integrations tab
          </Link>
          .
        </p>
      </div>

      <div className="rounded-lg border border-border/40 bg-card/40">
        <div className="flex items-center gap-3 px-4 py-3">
          <Github className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-body font-medium text-foreground">GitHub</p>
            <p className="text-[11px] text-muted-foreground font-body">
              Used by the orchestrator to create branches and open PRs
            </p>
          </div>
          {connected && !editing && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-body font-medium tracking-wide uppercase bg-success/15 text-success">
              Connected
            </span>
          )}
          {!connected && !editing && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-body font-medium tracking-wide uppercase bg-muted text-muted-foreground border border-border">
              Not set
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? "Cancel" : connected ? "Update" : "Connect"}
          </Button>
        </div>

        {editing && (
          <div className="border-t border-border/40 px-4 py-3 space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder={currentMasked || "ghp_..."}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                type="password"
                className="flex-1"
                aria-label="GitHub personal access token"
              />
              <Button onClick={handleSave} disabled={saving || !token.trim()} size="sm" className="text-xs">
                {saving ? "Saving…" : saved ? "Saved" : "Save"}
              </Button>
            </div>
            {currentMasked && (
              <p className="text-[10px] text-muted-foreground/60 font-body">
                Current: <code className="text-muted-foreground">{currentMasked}</code>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
