"use client";

import { useEffect, useState } from "react";
import { Download, Link as LinkIcon, Check } from "lucide-react";
import { useAuthFetch } from "@/hooks/use-auth-fetch";

interface BlueprintExportMenuProps {
  projectId: string;
  iterationId: string;
  initialShareEnabled?: boolean;
  initialShareToken?: string | null;
}

export function BlueprintExportMenu({
  projectId,
  iterationId,
  initialShareEnabled = false,
  initialShareToken = null,
}: BlueprintExportMenuProps) {
  const { authFetch, ready } = useAuthFetch();
  const [shareEnabled, setShareEnabled] = useState(initialShareEnabled);
  const [shareToken, setShareToken] = useState<string | null>(initialShareToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareOrigin, setShareOrigin] = useState<string>("");

  useEffect(() => {
    setShareOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  useEffect(() => {
    setShareEnabled(initialShareEnabled);
    setShareToken(initialShareToken);
  }, [initialShareEnabled, initialShareToken]);

  async function downloadMarkdown() {
    if (!ready) return;
    const resp = await authFetch(
      `/api/projects/${projectId}/blueprint/export.md?iteration_id=${iterationId}`,
    );
    if (!resp.ok) return;
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // The Content-Disposition header carries the canonical filename; this
    // fallback only kicks in when the browser strips it (some configs do).
    a.download = `blueprint-${iterationId}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function toggleShare() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const method = shareEnabled ? "DELETE" : "POST";
      const resp = await authFetch(
        `/api/projects/${projectId}/blueprint-iterations/${iterationId}/share`,
        { method },
      );
      if (resp.ok) {
        const data = await resp.json();
        setShareEnabled(data.share_enabled);
        setShareToken(data.share_token);
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyShareLink() {
    if (!shareToken || !shareOrigin) return;
    await navigator.clipboard.writeText(`${shareOrigin}/share/blueprint/${shareToken}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={downloadMarkdown}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] border border-border/60 transition-colors"
      >
        <Download className="h-3.5 w-3.5" />
        Markdown
      </button>
      <button
        type="button"
        onClick={toggleShare}
        disabled={busy}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
          shareEnabled
            ? "text-success bg-success/10 border-success/30 hover:bg-success/15"
            : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] border-border/60"
        } disabled:opacity-50`}
      >
        <LinkIcon className="h-3.5 w-3.5" />
        {shareEnabled ? "Sharing on" : "Share"}
      </button>
      {shareEnabled && shareToken && (
        <button
          type="button"
          onClick={copyShareLink}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] border border-border/60 transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <LinkIcon className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy link"}
        </button>
      )}
    </div>
  );
}
