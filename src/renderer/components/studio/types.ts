import type React from 'react';
import {
  Rocket,
  Zap,
  Bug,
  Search,
  Layers,
  Wrench,
  User,
  Brain,
  HelpCircle,
  Swords,
  Code,
  Database,
  Globe,
  Layout,
  Server,
  Lock,
  Gauge,
  FileText,
  Target,
  Lightbulb,
  PenTool,
  Cpu,
  Cloud,
  GitBranch,
  Package,
  Puzzle,
  Workflow,
  TestTube,
  BookOpen,
  MessageSquare,
  BarChart3,
  Smartphone,
} from 'lucide-react';
import { createElement } from 'react';

export interface BlueprintSection {
  id?: string;
  key: string;
  slug?: string;
  label: string;
  description?: string | null;
  is_system?: boolean;
  sort_order?: number;
}

export interface BlueprintTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  sections: string[];
  default_persona_id: string | null;
  is_system: boolean;
  sort_order: number;
}

export interface BlueprintPersona {
  id: string;
  org_id?: string;
  slug: string;
  name: string;
  description: string | null;
  system_prompt: string;
  focus_sections: string[];
  is_system: boolean;
  sort_order: number;
  video_avatar_id?: string | null;
}

export const ICON_MAP: Record<string, React.ReactNode> = {
  rocket: createElement(Rocket, { className: 'h-4 w-4' }),
  zap: createElement(Zap, { className: 'h-4 w-4' }),
  bug: createElement(Bug, { className: 'h-4 w-4' }),
  search: createElement(Search, { className: 'h-4 w-4' }),
  layers: createElement(Layers, { className: 'h-4 w-4' }),
  wrench: createElement(Wrench, { className: 'h-4 w-4' }),
  code: createElement(Code, { className: 'h-4 w-4' }),
  database: createElement(Database, { className: 'h-4 w-4' }),
  globe: createElement(Globe, { className: 'h-4 w-4' }),
  layout: createElement(Layout, { className: 'h-4 w-4' }),
  server: createElement(Server, { className: 'h-4 w-4' }),
  lock: createElement(Lock, { className: 'h-4 w-4' }),
  gauge: createElement(Gauge, { className: 'h-4 w-4' }),
  'file-text': createElement(FileText, { className: 'h-4 w-4' }),
  target: createElement(Target, { className: 'h-4 w-4' }),
  lightbulb: createElement(Lightbulb, { className: 'h-4 w-4' }),
  'pen-tool': createElement(PenTool, { className: 'h-4 w-4' }),
  cpu: createElement(Cpu, { className: 'h-4 w-4' }),
  cloud: createElement(Cloud, { className: 'h-4 w-4' }),
  'git-branch': createElement(GitBranch, { className: 'h-4 w-4' }),
  package: createElement(Package, { className: 'h-4 w-4' }),
  puzzle: createElement(Puzzle, { className: 'h-4 w-4' }),
  workflow: createElement(Workflow, { className: 'h-4 w-4' }),
  'test-tube': createElement(TestTube, { className: 'h-4 w-4' }),
  'book-open': createElement(BookOpen, { className: 'h-4 w-4' }),
  'message-square': createElement(MessageSquare, { className: 'h-4 w-4' }),
  'bar-chart': createElement(BarChart3, { className: 'h-4 w-4' }),
  smartphone: createElement(Smartphone, { className: 'h-4 w-4' }),
};

export const ICON_OPTIONS = Object.keys(ICON_MAP);

export const PERSONA_ICONS: Record<string, React.ReactNode> = {
  default: createElement(User, { className: 'h-5 w-5' }),
  pm: createElement(Brain, { className: 'h-5 w-5' }),
  architect: createElement(Layers, { className: 'h-5 w-5' }),
  mentor: createElement(HelpCircle, { className: 'h-5 w-5' }),
  challenger: createElement(Swords, { className: 'h-5 w-5' }),
};

export const SECTION_DESCRIPTIONS: Record<string, string> = {
  project_overview: "What the project does, who it's for, and the core value proposition",
  goals_constraints: 'Success criteria, timeline, budget, and technical constraints',
  users_personas: 'Target users, their needs, pain points, and usage patterns',
  team_capacity: 'Team size, skills, sprint length, and available bandwidth',
  architecture: 'System components, how they connect, and data flow',
  tech_stack: 'Frontend, backend, database, and infrastructure choices',
  api_integrations: 'External APIs, SDKs, webhooks, and third-party services',
  ui_ux: 'Interface style, key screens, navigation, and design principles',
  security_compliance: 'Authentication, authorization, data protection, and compliance',
  infrastructure: 'Hosting, deployment, CI/CD, monitoring, and scaling approach',
  risks_unknowns: 'Technical risks, blockers, and unresolved concerns',
  out_of_scope: 'Features and work explicitly excluded from this release',
  open_questions: 'Decisions that still need to be made',
};

export function toggleSection(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((s) => s !== key) : [...list, key];
}

export type AuthFetch = (url: string, opts?: RequestInit) => Promise<Response>;
