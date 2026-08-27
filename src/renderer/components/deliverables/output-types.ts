// Frontend-facing metadata per output type. Keep in sync with the backend
// catalogue in `backend/src/app/services/output_service.py` and
// `backend/src/app/schemas/project_output.py`.

import type { LucideIcon } from "lucide-react";
import { Code2, Palette, Cloud, FileText } from "lucide-react";

export type OutputType =
  | "code_scaffold"
  | "design_bundle"
  | "terraform_stack"
  | "decision_doc";

export type OutputStatus =
  | "not_generated"
  | "generating"
  | "ready"
  | "failed";

export interface OutputTypeMeta {
  key: OutputType;
  label: string;
  short_description: string;
  icon: LucideIcon;
}

export const OUTPUT_TYPE_ORDER: OutputType[] = [
  "code_scaffold",
  "design_bundle",
  "terraform_stack",
  "decision_doc",
];

export const OUTPUT_TYPES: Record<OutputType, OutputTypeMeta> = {
  code_scaffold: {
    key: "code_scaffold",
    label: "Code scaffold",
    short_description: "GitHub repo seeded with architecture docs, CI, and exec plan.",
    icon: Code2,
  },
  design_bundle: {
    key: "design_bundle",
    label: "Design bundle",
    short_description: "DESIGN.md + tokens + Tailwind preset ready for the design team.",
    icon: Palette,
  },
  terraform_stack: {
    key: "terraform_stack",
    label: "Terraform stack",
    short_description: "Infrastructure-as-code from the infrastructure + tech stack sections.",
    icon: Cloud,
  },
  decision_doc: {
    key: "decision_doc",
    label: "Decision document",
    short_description: "Markdown brief summarising overview, goals, and scope.",
    icon: FileText,
  },
};
