export interface SlashCommand {
  name: string;
  description: string;
  args?: string;
  category: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // Planning & Facilitator
  { name: "persona", description: "Switch AI persona", args: "engineer | pm | architect | mentor | challenger", category: "Facilitator" },
  { name: "assertiveness", description: "Adjust AI energy", args: "passive | balanced | active", category: "Facilitator" },
  { name: "summarize", description: "Summarize discussion so far", category: "Facilitator" },
  { name: "focus", description: "Focus on a blueprint topic", args: "overview | goals | users | architecture | tech | api | ui | security | infrastructure | questions", category: "Facilitator" },

  // Blueprint & Diagrams
  { name: "blueprint", description: "Show blueprint fill status", category: "Blueprint" },
  { name: "diagram", description: "Generate a diagram", args: "architecture | flow | erd | wireframe", category: "Blueprint" },
  { name: "extract", description: "Extract blueprint from chat", category: "Blueprint" },

  // Design & Visual
  { name: "design-system", description: "Generate design system", category: "Design" },
  { name: "wireframe", description: "Generate wireframe layout", args: "description", category: "Design" },

  // Tasks & Board
  { name: "generate-tasks", description: "Create kanban cards from blueprint", category: "Tasks" },
  { name: "estimate", description: "Estimate effort and sprints", category: "Tasks" },

  // Voice & Call
  { name: "mute", description: "Mute the AI Facilitator", category: "Call" },
  { name: "unmute", description: "Unmute the AI Facilitator", category: "Call" },
  { name: "interrupt", description: "Cut the voice agent off mid-sentence", category: "Call" },
  { name: "wait", description: "Tell the voice agent to wait while you finish", category: "Call" },
  { name: "dig", description: "Ask the voice agent to go deeper on the recent topic", category: "Call" },

  // Session
  { name: "help", description: "Show all commands", category: "Session" },
  { name: "clear", description: "Clear chat display", category: "Session" },
  { name: "export", description: "Export blueprint as markdown", category: "Session" },
];

export function filterCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase().replace(/^\//, "");
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(
    (cmd) => cmd.name.includes(q) || cmd.description.toLowerCase().includes(q)
  );
}
