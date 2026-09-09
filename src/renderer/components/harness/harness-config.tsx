'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface HarnessStatus {
  id: string;
  project_id: string;
  status: string;
  repo_url: string | null;
  repo_name: string | null;
  created_at: string;
}

interface HarnessConfigProps {
  projectId: string;
  projectName?: string;
  status: HarnessStatus | null;
  onPreview: (repoName: string) => Promise<void>;
  onGenerate: (repoName: string, githubToken: string) => Promise<void>;
  loading: boolean;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function HarnessConfig({
  projectId,
  projectName,
  status,
  onPreview,
  onGenerate,
  loading,
}: HarnessConfigProps) {
  const defaultName = status?.repo_name || (projectName ? slugify(projectName) : '');
  const [repoName, setRepoName] = useState(defaultName);
  const [githubToken, setGithubToken] = useState('');
  const [showToken, setShowToken] = useState(false);

  const handlePreview = async () => {
    await onPreview(repoName);
  };

  const handleGenerate = async () => {
    if (!repoName.trim()) return;
    await onGenerate(repoName.trim(), githubToken);
  };

  return (
    <div className="rounded-lg border border-border bg-background p-5 space-y-5">
      <div>
        <h2 className="text-sm font-semibold mb-1">Scaffold Configuration</h2>
        <p className="text-xs text-muted-foreground">
          Preview your scaffold or create a GitHub repository with all generated files.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <Label htmlFor="repo-name" className="text-xs mb-1.5 block">
            Repository Name
          </Label>
          <Input
            id="repo-name"
            placeholder="my-project-scaffold"
            value={repoName}
            onChange={(e) => setRepoName(e.target.value)}
            className="font-mono text-sm"
            disabled={loading}
          />
        </div>

        <div>
          <Label htmlFor="github-token" className="text-xs mb-1.5 block">
            GitHub Token{' '}
            <span className="text-muted-foreground font-normal">
              (optional — required to create repo)
            </span>
          </Label>
          <div className="relative">
            <Input
              id="github-token"
              type={showToken ? 'text' : 'password'}
              placeholder="ghp_••••••••••••••••••••"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              className="font-mono text-sm pr-16"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showToken ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Optional — server token used if blank. Override with your own PAT if needed.
          </p>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={handlePreview} disabled={loading}>
          {loading ? 'Loading…' : 'Preview'}
        </Button>
        <Button size="sm" onClick={handleGenerate} disabled={loading || !repoName.trim()}>
          {loading ? 'Generating…' : 'Generate & Create Repo'}
        </Button>
      </div>

      {status?.repo_url && (
        <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm">
          <p className="font-medium text-green-600 dark:text-green-400 mb-1">Repo created</p>
          <a
            href={status.repo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-green-700 dark:text-green-300 hover:underline break-all"
          >
            {status.repo_url}
          </a>
        </div>
      )}
    </div>
  );
}
