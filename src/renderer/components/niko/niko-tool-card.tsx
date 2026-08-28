'use client';

// One row per tool Niko reached for, with a human label for it. The maps are
// keyed by the read-only tool names in yeaboi/niko/tools.py — an unmapped name
// falls back to the raw name and a file icon, so a backend that grows a tool
// degrades rather than breaks.

import {
  BarChart3,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  FileText,
  GitBranch,
  LayoutDashboard,
  ListTodo,
  Loader2,
  Map,
  Presentation,
  Shield,
  ShieldCheck,
  Ship,
  Sparkles,
  Spade,
  Sunrise,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';

const TOOL_ICONS: Record<string, React.ElementType> = {
  list_capabilities: Sparkles,
  list_routes: Map,
  list_sessions: ListTodo,
  get_session: FileText,
  standup_history: Sunrise,
  reporting_history: Presentation,
  retro_history: LayoutDashboard,
  poker_history: Spade,
  team_roster: Users,
  team_profile: TrendingUp,
  performance_roster: UserRound,
  ship_status: Ship,
  ship_history: Ship,
  agents_usage_history: BarChart3,
  agents_advisor_history: Wallet,
  agents_standup_history: Bot,
  agents_security_history: ShieldCheck,
  llm_usage: Wallet,
  ceremonies_list: Calendar,
  ceremonies_history: Clock,
  provenance_audit: Shield,
  provenance_trace: GitBranch,
  navigate: Compass,
};

const TOOL_LABELS: Record<string, string> = {
  list_capabilities: 'Reading what yeaboi does',
  list_routes: 'Finding the screen',
  list_sessions: 'Reading your plans',
  get_session: 'Opening a plan',
  standup_history: 'Reading standups',
  reporting_history: 'Reading delivery reports',
  retro_history: 'Reading retros',
  poker_history: 'Reading poker sessions',
  team_roster: 'Reading the team',
  team_profile: "Reading your team's profile",
  performance_roster: 'Reading the engineer roster',
  ship_status: 'Checking Ship',
  ship_history: 'Reading Ship runs',
  agents_usage_history: 'Reading agent spend',
  agents_advisor_history: 'Reading recoverable spend',
  agents_standup_history: 'Reading what agents shipped',
  agents_security_history: 'Reading agent security',
  llm_usage: "Reading yeaboi's own spend",
  ceremonies_list: 'Reading the schedule',
  ceremonies_history: 'Reading what fired',
  provenance_audit: 'Reading the decision record',
  provenance_trace: 'Tracing a decision',
  navigate: 'Taking you there',
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
          <span title={error || 'Nothing to read'}>
            <XCircle className="size-3.5 text-muted-foreground/60" />
          </span>
        )}
      </div>
    </div>
  );
}
