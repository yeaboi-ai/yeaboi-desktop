'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, Zap } from 'lucide-react';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { listVideoAvatars, type VideoAvatar } from '@/lib/api/video-avatars';
import { PersonaThumbnail } from '@/components/session/persona-thumbnail';
import { GenerationPresetsPanel } from './generation-presets-panel';
import { TicketTemplatesPanel } from './ticket-templates-panel';
import { TemplateEditor } from './template-editor';
import { PersonaEditor } from './persona-editor';
import { SectionEditor } from './section-editor';
import { AgentHarnessPanel } from './agent-harness-panel';
import { type StudioItem } from '@/lib/yeaboi/studio-areas';
import {
  ICON_MAP,
  toggleSection,
  type BlueprintPersona,
  type BlueprintSection,
  type BlueprintTemplate,
} from './types';

export function StudioShell({ item }: { item: StudioItem }) {
  const { authFetch, ready } = useAuthFetch();

  const [templates, setTemplates] = useState<BlueprintTemplate[]>([]);
  const [personas, setPersonas] = useState<BlueprintPersona[]>([]);
  const [sections, setSections] = useState<BlueprintSection[]>([]);
  const [videoAvatars, setVideoAvatars] = useState<VideoAvatar[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [editingPersona, setEditingPersona] = useState<string | null>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<BlueprintTemplate>>({});
  const [personaDraft, setPersonaDraft] = useState<Partial<BlueprintPersona>>({});
  const [sectionDraft, setSectionDraft] = useState<{ label: string; description: string }>({
    label: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    const [tResp, pResp, sResp, vList] = await Promise.all([
      authFetch('/api/blueprint-templates'),
      authFetch('/api/blueprint-personas'),
      authFetch('/api/blueprint-sections'),
      listVideoAvatars(authFetch).catch(() => []),
    ]);
    if (tResp.ok) setTemplates(await tResp.json());
    if (pResp.ok) setPersonas(await pResp.json());
    if (sResp.ok) {
      const raw = await sResp.json();
      setSections(
        raw.map((s: BlueprintSection & { slug?: string }) => ({ ...s, key: s.slug || s.key })),
      );
    }
    setVideoAvatars(vList);
    setLoading(false);
  }, [authFetch, ready]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Moving between sections abandons whatever was half-edited in the last one.
  useEffect(() => {
    setEditingTemplate(null);
    setEditingPersona(null);
    setEditingSection(null);
    setSaveError(null);
  }, [item]);

  // ─── Template CRUD ─────────────────────────────────────────────────────────
  function startEditTemplate(t: BlueprintTemplate) {
    setEditingTemplate(t.id);
    setDraft({
      name: t.name,
      description: t.description,
      icon: t.icon,
      sections: [...t.sections],
      default_persona_id: t.default_persona_id,
    });
  }
  function startNewTemplate() {
    setEditingTemplate('new');
    setDraft({ name: '', description: '', icon: 'zap', sections: [], default_persona_id: null });
  }
  async function saveTemplate() {
    setSaving(true);
    setSaveError(null);
    try {
      const resp =
        editingTemplate === 'new'
          ? await authFetch('/api/blueprint-templates', {
              method: 'POST',
              body: JSON.stringify(draft),
            })
          : await authFetch(`/api/blueprint-templates/${editingTemplate}`, {
              method: 'PATCH',
              body: JSON.stringify(draft),
            });
      if (resp.ok) {
        await fetchAll();
        setEditingTemplate(null);
      } else {
        const err = await resp.json().catch(() => ({}));
        setSaveError(err.detail || `Failed to save (${resp.status})`);
      }
    } finally {
      setSaving(false);
    }
  }
  async function deleteTemplate(id: string) {
    const resp = await authFetch(`/api/blueprint-templates/${id}`, { method: 'DELETE' });
    if (resp.ok) await fetchAll();
  }

  // ─── Persona CRUD ──────────────────────────────────────────────────────────
  function startEditPersona(p: BlueprintPersona) {
    setEditingPersona(p.id);
    setPersonaDraft({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      system_prompt: p.system_prompt,
      focus_sections: [...p.focus_sections],
      video_avatar_id: p.video_avatar_id ?? null,
    });
  }
  function startNewPersona() {
    setEditingPersona('new');
    setPersonaDraft({
      name: '',
      description: '',
      system_prompt: '',
      focus_sections: [],
      video_avatar_id: null,
    });
  }
  async function savePersona() {
    setSaving(true);
    setSaveError(null);
    try {
      const resp =
        editingPersona === 'new'
          ? await authFetch('/api/blueprint-personas', {
              method: 'POST',
              body: JSON.stringify(personaDraft),
            })
          : await authFetch(`/api/blueprint-personas/${editingPersona}`, {
              method: 'PATCH',
              body: JSON.stringify(personaDraft),
            });
      if (resp.ok) {
        await fetchAll();
        setEditingPersona(null);
      } else {
        const err = await resp.json().catch(() => ({}));
        setSaveError(err.detail || `Failed to save (${resp.status})`);
      }
    } finally {
      setSaving(false);
    }
  }
  async function deletePersona(id: string) {
    const resp = await authFetch(`/api/blueprint-personas/${id}`, { method: 'DELETE' });
    if (resp.ok) await fetchAll();
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-4 w-48 bg-card rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-card rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 animate-fade-in">
      {item === 'blueprint:templates' && (
        <BlueprintTemplatesSection
          templates={templates}
          personas={personas}
          sections={sections}
          editingTemplate={editingTemplate}
          draft={draft}
          setDraft={setDraft}
          saving={saving}
          saveError={saveError}
          onStartNew={startNewTemplate}
          onStartEdit={startEditTemplate}
          onSave={saveTemplate}
          onCancel={() => {
            setEditingTemplate(null);
            setSaveError(null);
          }}
          onDelete={deleteTemplate}
          authFetch={authFetch}
        />
      )}
      {item === 'blueprint:sections' && (
        <BlueprintSectionsSection
          sections={sections}
          editingSection={editingSection}
          sectionDraft={sectionDraft}
          setSectionDraft={setSectionDraft}
          saving={saving}
          onStartNew={() => {
            setEditingSection('new');
            setSectionDraft({ label: '', description: '' });
          }}
          onStartEdit={(s) => {
            setEditingSection(s.key);
            setSectionDraft({ label: s.label, description: s.description || '' });
          }}
          onCancel={() => setEditingSection(null)}
          onSaveNew={async () => {
            setSaving(true);
            const resp = await authFetch('/api/blueprint-sections', {
              method: 'POST',
              body: JSON.stringify(sectionDraft),
            });
            if (resp.ok) {
              await fetchAll();
              setEditingSection(null);
            }
            setSaving(false);
          }}
          onSaveEdit={async (key) => {
            setSaving(true);
            const resp = await authFetch(`/api/blueprint-sections/${key}`, {
              method: 'PATCH',
              body: JSON.stringify(sectionDraft),
            });
            if (resp.ok) {
              await fetchAll();
              setEditingSection(null);
            }
            setSaving(false);
          }}
          onDelete={async (id) => {
            const resp = await authFetch(`/api/blueprint-sections/${id}`, { method: 'DELETE' });
            if (resp.ok) await fetchAll();
          }}
          authFetch={authFetch}
        />
      )}
      {item === 'planning:personas' && (
        <PlanningPersonasSection
          personas={personas}
          templates={templates}
          sections={sections}
          videoAvatars={videoAvatars}
          editingPersona={editingPersona}
          draft={personaDraft}
          setDraft={setPersonaDraft}
          saving={saving}
          saveError={saveError}
          onStartNew={startNewPersona}
          onStartEdit={startEditPersona}
          onSave={savePersona}
          onCancel={() => {
            setEditingPersona(null);
            setSaveError(null);
          }}
          onDelete={deletePersona}
          authFetch={authFetch}
        />
      )}
      {item === 'agent:harness' && <AgentHarnessPanel />}
      {item === 'tickets:templates' && <TicketTemplatesPanel />}
      {item === 'tickets:generation' && <GenerationPresetsPanel />}
    </div>
  );
}

// ─── Inline section components (kept inside shell for simple data plumbing) ──

function BlueprintTemplatesSection({
  templates,
  personas,
  sections,
  editingTemplate,
  draft,
  setDraft,
  saving,
  saveError,
  onStartNew,
  onStartEdit,
  onSave,
  onCancel,
  onDelete,
  authFetch,
}: {
  templates: BlueprintTemplate[];
  personas: BlueprintPersona[];
  sections: BlueprintSection[];
  editingTemplate: string | null;
  draft: Partial<BlueprintTemplate>;
  setDraft: (d: Partial<BlueprintTemplate>) => void;
  saving: boolean;
  saveError: string | null;
  onStartNew: () => void;
  onStartEdit: (t: BlueprintTemplate) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground">
          Blueprint Templates ({templates.length})
        </p>
        <button
          onClick={onStartNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-body font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Create Template
        </button>
      </div>

      {editingTemplate === 'new' && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-5">
          <TemplateEditor
            draft={draft}
            setDraft={setDraft}
            sections={sections}
            personas={personas}
            saving={saving}
            saveError={saveError}
            onSave={onSave}
            onCancel={onCancel}
            toggleSection={toggleSection}
            authFetch={authFetch}
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {templates.map((t) => (
          <div key={t.id}>
            {editingTemplate === t.id ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-5">
                <TemplateEditor
                  draft={draft}
                  setDraft={setDraft}
                  sections={sections}
                  personas={personas}
                  saving={saving}
                  saveError={saveError}
                  onSave={onSave}
                  onCancel={onCancel}
                  toggleSection={toggleSection}
                  authFetch={authFetch}
                />
              </div>
            ) : (
              <div
                onClick={() => onStartEdit(t)}
                className="rounded-lg border border-border/50 bg-card/40 p-4 group hover:border-primary/30 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-muted-foreground/60">
                      {ICON_MAP[t.icon] || <Zap className="h-4 w-4" />}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-body font-medium text-foreground">
                          {t.name}
                        </span>
                        {t.is_system && (
                          <span className="text-[8px] font-body text-muted-foreground/40 px-1.5 py-0.5 rounded bg-muted/30">
                            System
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-body text-muted-foreground/50 mt-0.5">
                        {t.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!t.is_system && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(t.id);
                        }}
                        className="p-1 rounded hover:bg-destructive/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3 text-muted-foreground/50 hover:text-destructive" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-[9px] font-body text-muted-foreground/40 px-1.5 py-0.5 rounded bg-muted/20">
                    {t.sections.length} sections
                  </span>
                  {t.default_persona_id && (
                    <span className="text-[9px] font-body text-primary/50 px-1.5 py-0.5 rounded bg-primary/10">
                      {personas.find((p) => p.id === t.default_persona_id)?.name || 'Persona'}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PlanningPersonasSection({
  personas,
  templates,
  sections,
  videoAvatars,
  editingPersona,
  draft,
  setDraft,
  saving,
  saveError,
  onStartNew,
  onStartEdit,
  onSave,
  onCancel,
  onDelete,
  authFetch,
}: {
  personas: BlueprintPersona[];
  templates: BlueprintTemplate[];
  sections: BlueprintSection[];
  videoAvatars: VideoAvatar[];
  editingPersona: string | null;
  draft: Partial<BlueprintPersona>;
  setDraft: (d: Partial<BlueprintPersona>) => void;
  saving: boolean;
  saveError: string | null;
  onStartNew: () => void;
  onStartEdit: (p: BlueprintPersona) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground">
          AI Personas ({personas.length})
        </p>
        <button
          onClick={onStartNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-body font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Create Persona
        </button>
      </div>

      {editingPersona === 'new' && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-5">
          <PersonaEditor
            draft={draft}
            setDraft={setDraft}
            sections={sections}
            templates={templates}
            saving={saving}
            saveError={saveError}
            onSave={onSave}
            onCancel={onCancel}
            toggleSection={toggleSection}
            authFetch={authFetch}
          />
        </div>
      )}

      <div className="space-y-3">
        {personas.map((p) => (
          <div key={p.id}>
            {editingPersona === p.id ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-5">
                <PersonaEditor
                  draft={draft}
                  setDraft={setDraft}
                  sections={sections}
                  templates={templates}
                  saving={saving}
                  saveError={saveError}
                  onSave={onSave}
                  onCancel={onCancel}
                  toggleSection={toggleSection}
                  authFetch={authFetch}
                />
              </div>
            ) : (
              <div
                onClick={() => onStartEdit(p)}
                className="rounded-xl border border-border/50 bg-card/40 p-5 group hover:border-primary/30 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3.5">
                    <PersonaThumbnail
                      videoPreviewUrl={
                        videoAvatars.find((v) => v.id === p.video_avatar_id)?.preview_url
                      }
                      slug={p.slug}
                      alt={p.name}
                      className="w-10 h-10 rounded-xl object-cover bg-muted/20 shrink-0"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-body font-medium text-foreground">
                          {p.name}
                        </span>
                        {p.is_system && (
                          <span className="text-[9px] font-body text-muted-foreground/40 px-1.5 py-0.5 rounded bg-muted/30">
                            System
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-body text-muted-foreground/50 mt-0.5 line-clamp-1">
                        {p.description || p.system_prompt.slice(0, 100)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onStartEdit(p)}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground/50" />
                    </button>
                    {!p.is_system && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(p.id);
                        }}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-destructive" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-3.5 pl-[3.375rem]">
                  {p.focus_sections.slice(0, 5).map((s) => (
                    <span
                      key={s}
                      className="text-[9px] font-body text-muted-foreground/40 px-2 py-0.5 rounded-md bg-muted/20"
                    >
                      {sections.find((sec) => sec.key === s)?.label || s}
                    </span>
                  ))}
                  {p.focus_sections.length > 5 && (
                    <span className="text-[9px] font-body text-muted-foreground/30">
                      +{p.focus_sections.length - 5} more
                    </span>
                  )}
                  {templates
                    .filter((t) => t.default_persona_id === p.id)
                    .map((t) => (
                      <span
                        key={t.id}
                        className="text-[9px] font-body text-primary/40 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/15"
                      >
                        {t.name}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BlueprintSectionsSection({
  sections,
  editingSection,
  sectionDraft,
  setSectionDraft,
  saving,
  onStartNew,
  onStartEdit,
  onCancel,
  onSaveNew,
  onSaveEdit,
  onDelete,
  authFetch,
}: {
  sections: BlueprintSection[];
  editingSection: string | null;
  sectionDraft: { label: string; description: string };
  setSectionDraft: (d: { label: string; description: string }) => void;
  saving: boolean;
  onStartNew: () => void;
  onStartEdit: (s: BlueprintSection) => void;
  onCancel: () => void;
  onSaveNew: () => Promise<void>;
  onSaveEdit: (key: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground">
          Blueprint Sections ({sections.length})
        </p>
        <button
          onClick={onStartNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-body font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Create Section
        </button>
      </div>

      {editingSection === 'new' && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-5">
          <SectionEditor
            draft={sectionDraft}
            setDraft={setSectionDraft}
            saving={saving}
            onSave={onSaveNew}
            onCancel={onCancel}
            authFetch={authFetch}
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sections.map((s) => (
          <div key={s.key}>
            {editingSection === s.key ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-5">
                <SectionEditor
                  draft={sectionDraft}
                  setDraft={setSectionDraft}
                  saving={saving}
                  onSave={() => onSaveEdit(s.key)}
                  onCancel={onCancel}
                  authFetch={authFetch}
                />
              </div>
            ) : (
              <div
                onClick={() => onStartEdit(s)}
                className="rounded-lg border border-border/50 bg-card/40 p-4 group hover:border-primary/30 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-body font-medium text-foreground">
                        {s.label}
                      </span>
                      {s.is_system && (
                        <span className="text-[8px] font-body text-muted-foreground/40 px-1.5 py-0.5 rounded bg-muted/30">
                          System
                        </span>
                      )}
                    </div>
                    {s.description && (
                      <p className="text-[10px] font-body text-muted-foreground/50 mt-0.5">
                        {s.description}
                      </p>
                    )}
                    <span className="text-[8px] font-body text-muted-foreground/20">{s.key}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onStartEdit(s)}
                      className="p-1 rounded hover:bg-muted transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-3 w-3 text-muted-foreground/50" />
                    </button>
                    {!s.is_system && s.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(s.id!);
                        }}
                        className="p-1 rounded hover:bg-destructive/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3 text-muted-foreground/50 hover:text-destructive" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
