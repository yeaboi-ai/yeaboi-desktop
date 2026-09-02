// The blueprint → intake bridge: a platform project's 13-section blueprint
// mapped onto the yeaboi engine's intake questionnaire, the shape
// `plan_generate` takes.
//
// The engine's stable contract is question numbers (1–30, served by the
// `intake_questions` tool); the 13-section schema is a platform concept, so
// the translation lives here. Explicit `answers` win inside the engine, then
// deterministic keyword extraction over `project_context`, then the engine's
// own defaults — an unfilled section is simply omitted.

export interface BlueprintProject {
  name: string;
  description?: string | null;
  repo_url?: string | null;
}

export interface IntakeArgs {
  description: string;
  answers: Record<string, string>;
  project_context: string;
}

/** Section slug → the heading `project_context` files it under. */
export const SECTION_LABELS: Record<string, string> = {
  project_overview: 'Project overview',
  goals_constraints: 'Goals & constraints',
  users_personas: 'Users & personas',
  team_capacity: 'Team & capacity',
  architecture: 'Architecture',
  tech_stack: 'Tech stack',
  api_integrations: 'APIs & integrations',
  ui_ux: 'UI / UX',
  security_compliance: 'Security & compliance',
  infrastructure: 'Infrastructure',
  risks_unknowns: 'Risks & unknowns',
  out_of_scope: 'Out of scope',
  open_questions: 'Open questions',
};

const TEAM_SIZE = /(\d+)\s*(?:engineer|dev|develop|people|person)/i;
const SPRINT_LENGTH = /([1-4])[\s-]?week/i;

function section(blueprint: Record<string, string>, slug: string): string {
  return (blueprint[slug] ?? '').trim();
}

function joinLabelled(blueprint: Record<string, string>, slugs: string[]): string {
  return slugs
    .map((slug) => {
      const content = section(blueprint, slug);
      return content ? `${SECTION_LABELS[slug]}:\n${content}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

/** Every filled section verbatim under its heading — the engine's keyword
 *  extraction reads this to fill whatever the explicit answers left open. */
export function contextOf(blueprint: Record<string, string>): string {
  return Object.keys(SECTION_LABELS)
    .map((slug) => {
      const content = section(blueprint, slug);
      return content ? `## ${SECTION_LABELS[slug]}\n${content}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

/** Map a project + filled blueprint into `plan_generate`'s inputs.
 *
 *  Throws when there is nothing to plan from — no project description and an
 *  empty overview section. */
export function mapBlueprintToIntake(
  project: BlueprintProject,
  blueprint: Record<string, string>,
): IntakeArgs {
  const overview = section(blueprint, 'project_overview');
  const projectDescription = (project.description ?? '').trim();
  if (!overview && !projectDescription) {
    throw new Error(
      'Nothing to plan from yet — fill in the Project overview section of the blueprint first.',
    );
  }

  const description = [project.name.trim(), projectDescription, overview]
    .filter(Boolean)
    .join('\n\n');

  const answers: Record<string, string> = {};
  const put = (question: number, value: string) => {
    if (value) answers[String(question)] = value;
  };

  const repoUrl = (project.repo_url ?? '').trim();
  put(2, repoUrl ? 'Existing codebase' : 'Greenfield');
  put(15, repoUrl ? 'Existing codebase' : 'New build');
  put(3, section(blueprint, 'users_personas'));
  put(4, section(blueprint, 'goals_constraints'));

  const capacity = section(blueprint, 'team_capacity');
  put(7, capacity);
  const size = TEAM_SIZE.exec(capacity);
  if (size) put(6, size[1]!);
  const sprintLength = SPRINT_LENGTH.exec(capacity);
  if (sprintLength) put(8, `${sprintLength[1]} weeks`);

  put(11, section(blueprint, 'tech_stack'));
  put(12, section(blueprint, 'api_integrations'));
  put(13, joinLabelled(blueprint, ['architecture', 'infrastructure', 'security_compliance']));
  if (repoUrl) put(17, repoUrl);
  put(21, joinLabelled(blueprint, ['risks_unknowns', 'open_questions']));
  put(23, section(blueprint, 'out_of_scope'));
  put(26, 'Markdown');

  return { description, answers, project_context: contextOf(blueprint) };
}
