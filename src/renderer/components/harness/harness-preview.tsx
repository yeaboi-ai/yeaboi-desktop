'use client';

import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface HarnessPreviewProps {
  files: Record<string, string>;
}

function FileIcon({ path }: { path: string }) {
  if (path.endsWith('.yml') || path.endsWith('.yaml')) {
    return <span className="text-yellow-500">⚙</span>;
  }
  if (path.endsWith('.md')) {
    return <span className="text-blue-400">📄</span>;
  }
  if (path === '' || path.endsWith('.gitkeep')) {
    return <span className="text-muted-foreground">📁</span>;
  }
  return <span className="text-muted-foreground">📄</span>;
}

function FileNode({ path, content, depth }: { path: string; content: string; depth: number }) {
  const [open, setOpen] = useState(false);
  const isGitkeep = path.endsWith('.gitkeep');
  const fileName = path.split('/').pop() ?? path;

  if (isGitkeep) {
    return (
      <div
        className="flex items-center gap-2 py-0.5 text-sm text-muted-foreground"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <FileIcon path={path} />
        <span className="font-mono text-xs">{fileName}</span>
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted/60 transition-colors text-left cursor-pointer"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <span className="text-muted-foreground text-xs">{open ? '▾' : '▸'}</span>
        <FileIcon path={path} />
        <span className="font-mono text-xs font-medium">{fileName}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {content.split('\n').length} lines
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          className="mx-2 mt-1 mb-2 overflow-x-auto rounded-md border border-border bg-muted/30"
          style={{ marginLeft: `${depth * 16 + 24}px` }}
        >
          <pre className="p-3 text-xs leading-relaxed font-mono text-foreground whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
            {content}
          </pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function buildTree(files: Record<string, string>) {
  // Group files by directory prefix for display
  const sorted = Object.entries(files).sort(([a], [b]) => {
    // Directories first, then files
    const aDepth = a.split('/').length;
    const bDepth = b.split('/').length;
    if (aDepth !== bDepth) return aDepth - bDepth;
    return a.localeCompare(b);
  });
  return sorted;
}

export function HarnessPreview({ files }: HarnessPreviewProps) {
  const tree = buildTree(files);
  const totalFiles = Object.keys(files).filter((p) => !p.endsWith('.gitkeep')).length;

  if (!Object.keys(files).length) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        No files generated yet. Click Preview to see the scaffold.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
        <span className="text-sm font-semibold">Generated Scaffold</span>
        <span className="text-xs text-muted-foreground">{totalFiles} files</span>
      </div>
      <div className="py-1">
        {tree.map(([path, content]) => (
          <FileNode key={path} path={path} content={content} depth={path.split('/').length - 1} />
        ))}
      </div>
    </div>
  );
}
