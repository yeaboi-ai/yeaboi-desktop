"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-base";
import { Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import { logger } from "@/lib/logger";
import {
  SettingsCard,
  SettingsSectionHeader,
  SettingsFormField,
  SettingsSaveBar,
  SettingsInlineError,
} from "@/components/settings/primitives";
import type { MeProfile } from "@/components/settings/types";
import { AvatarEditor } from "./profile/avatar-editor";

const BIO_MAX = 280;

type Draft = {
  display_name: string;
  pronouns: string;
  job_title: string;
  bio: string;
  timezone: string;
};

function profileToDraft(profile: MeProfile | null): Draft {
  return {
    display_name: profile?.display_name ?? "",
    pronouns: profile?.pronouns ?? "",
    job_title: profile?.job_title ?? "",
    bio: profile?.bio ?? "",
    timezone: profile?.timezone ?? "",
  };
}

function timezoneOptions(): string[] {
  const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  if (typeof fn === "function") return fn("timeZone");
  return ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Tokyo"];
}

export function ProfileTab() {
  const { ready } = useAuthFetch();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [draft, setDraft] = useState<Draft>(profileToDraft(null));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    apiFetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: MeProfile | null) => {
        if (data) {
          setProfile(data);
          setDraft(profileToDraft(data));
        }
      })
      .catch(() => logger.warn("Failed to fetch user profile"))
      .finally(() => setLoading(false));
  }, [ready]);

  const original = useMemo(() => profileToDraft(profile), [profile]);

  const changed = useMemo(() => {
    const diff: Partial<Record<keyof Draft, string>> = {};
    (Object.keys(draft) as (keyof Draft)[]).forEach((key) => {
      if (draft[key] !== original[key]) {
        diff[key] = draft[key];
      }
    });
    return diff;
  }, [draft, original]);

  const dirty = Object.keys(changed).length > 0;
  const bioOverflow = draft.bio.length > BIO_MAX;

  const handleSave = async () => {
    if (!dirty || bioOverflow) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const r = await apiFetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changed),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => null);
        throw new Error(data?.detail || `Save failed: ${r.status}`);
      }
      const updated: MeProfile = await r.json();
      setProfile(updated);
      setDraft(profileToDraft(updated));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(original);
    setSaveError(null);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-border h-96 bg-card animate-pulse motion-reduce:animate-none" />
      </div>
    );
  }

  const detectedTz =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;
  const initial = (draft.display_name || profile?.email || "?").charAt(0).toUpperCase();
  const previewName = draft.display_name.trim() || profile?.name?.trim() || "Your name";
  const previewSubline =
    [draft.job_title.trim(), draft.pronouns.trim()].filter(Boolean).join(" · ") || profile?.email || null;

  return (
    <div className="space-y-4">
      <SettingsCard index={0}>
        <SettingsSectionHeader title="Your profile" subtitle="How you appear to your team" />

        <div className="px-5 py-5 space-y-5">
          <AvatarEditor
            avatarUrl={profile?.avatar_url ?? null}
            fallbackInitial={initial}
            name={previewName}
            subline={previewSubline}
            onChange={(updated) => setProfile(updated)}
            onError={(msg) => setSaveError(msg)}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SettingsFormField id="display-name" label="Display name">
              <Input
                value={draft.display_name}
                onChange={(e) => setDraft((d) => ({ ...d, display_name: e.target.value }))}
                placeholder="Your name"
                className="bg-background"
              />
            </SettingsFormField>

            <SettingsFormField id="pronouns" label="Pronouns">
              <Input
                value={draft.pronouns}
                onChange={(e) => setDraft((d) => ({ ...d, pronouns: e.target.value }))}
                placeholder="she/her, he/him, they/them, …"
                maxLength={40}
                className="bg-background"
              />
            </SettingsFormField>
          </div>

          <SettingsFormField id="job-title" label="Job title">
            <Input
              value={draft.job_title}
              onChange={(e) => setDraft((d) => ({ ...d, job_title: e.target.value }))}
              placeholder="e.g. Senior Engineer"
              maxLength={100}
              className="bg-background"
            />
          </SettingsFormField>

          <SettingsFormField
            id="bio"
            label="Bio"
            help={
              <span className={bioOverflow ? "text-destructive" : undefined}>
                {draft.bio.length} / {BIO_MAX}
              </span>
            }
            error={
              bioOverflow
                ? `Bio is ${draft.bio.length - BIO_MAX} character${draft.bio.length - BIO_MAX === 1 ? "" : "s"} too long`
                : undefined
            }
          >
            <Textarea
              value={draft.bio}
              onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))}
              placeholder="One sentence about you. Shown on hover in member lists."
              rows={2}
              className="bg-background min-h-[60px]"
            />
          </SettingsFormField>
        </div>

        <div className="border-t border-border/50 px-5 py-5 space-y-5">
          <div>
            <h3 className="text-xs font-body font-semibold text-foreground tracking-wide">Preferences</h3>
            <p className="text-[11px] text-muted-foreground font-body mt-0.5">Account-level settings</p>
          </div>

          <SettingsFormField
            id="timezone"
            label="Time zone"
            help={
              detectedTz && draft.timezone !== detectedTz
                ? `Detected: ${detectedTz}`
                : "Affects voice-session timing and notifications"
            }
          >
            <select
              value={draft.timezone}
              onChange={(e) => setDraft((d) => ({ ...d, timezone: e.target.value }))}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs text-foreground focus:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">— not set —</option>
              {timezoneOptions().map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </SettingsFormField>

          <SettingsFormField
            id="email"
            label="Email"
            help={
              <span className="inline-flex items-center gap-1">
                <Lock className="size-3" aria-hidden="true" />
                Managed by your sign-in provider
              </span>
            }
          >
            <Input
              value={profile?.email ?? ""}
              readOnly
              disabled
              aria-readonly="true"
              className="bg-secondary/30 cursor-not-allowed"
            />
          </SettingsFormField>
        </div>
      </SettingsCard>

      {saveError && <SettingsInlineError message={saveError} />}

      <SettingsSaveBar
        visible={dirty}
        saving={saving}
        saved={saved}
        onSave={handleSave}
        onCancel={dirty ? handleCancel : undefined}
        saveLabel={bioOverflow ? "Fix errors" : "Save"}
      />
    </div>
  );
}
