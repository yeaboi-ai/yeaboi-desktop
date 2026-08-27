'use client';

import {
  CheckCircle2,
  Loader2,
  XCircle,
  FolderPlus,
  FilePlus,
  Pencil,
  Trash2,
  ListTodo,
  LayoutDashboard,
  Shield,
  Users,
  FileText,
} from 'lucide-react';

const TOOL_ICONS: Record<string, React.ElementType> = {
  create_project: FolderPlus,
  update_project: Pencil,
  delete_project: Trash2,
  list_projects: ListTodo,
  get_project: FileText,
  create_session: FilePlus,
  list_sessions: ListTodo,
  update_session: Pencil,
  create_card: FilePlus,
  update_card: Pencil,
  delete_card: Trash2,
  list_board_cards: LayoutDashboard,
  move_card: LayoutDashboard,
  get_blueprint_coverage: Shield,
  update_blueprint_section: Pencil,
  list_personas: Users,
  create_persona: Users,
  list_templates: FileText,
  create_template: FilePlus,
  get_project_status: LayoutDashboard,
};

const TOOL_LABELS: Record<string, string> = {
  create_project: 'Creating project',
  update_project: 'Updating project',
  delete_project: 'Deleting project',
  list_projects: 'Listing projects',
  get_project: 'Getting project details',
  create_session: 'Creating session',
  list_sessions: 'Listing sessions',
  update_session: 'Updating session',
  create_card: 'Creating card',
  update_card: 'Updating card',
  delete_card: 'Deleting card',
  list_board_cards: 'Loading board',
  move_card: 'Moving card',
  get_blueprint_coverage: 'Checking blueprint',
  update_blueprint_section: 'Updating blueprint',
  list_personas: 'Listing personas',
  create_persona: 'Creating persona',
  list_templates: 'Listing templates',
  create_template: 'Creating template',
  get_project_status: 'Getting project status',
};

interface NikoToolCardProps {
  name: string;
  status: 'running' | 'success' | 'error';
  error?: string;
}

export function NikoToolCard({ name, status, error }: NikoToolCardProps) {
  const Icon = TOOL_ICONS[name] || FileText;
  const label = TOOL_LABELS[name] || name;

  return (
    <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5 text-xs">
      <Icon className="size-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">{label}</span>
      <div className="ml-auto">
        {status === 'running' && <Loader2 className="size-3.5 animate-spin text-primary" />}
        {status === 'success' && <CheckCircle2 className="size-3.5 text-emerald-500" />}
        {status === 'error' && (
          <span title={error || 'Failed'}>
            <XCircle className="size-3.5 text-destructive" />
          </span>
        )}
      </div>
    </div>
  );
}
