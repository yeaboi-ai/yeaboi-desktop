"use client";

/**
 * Renders structured diagram JSON as beautiful styled nodes and edges.
 *
 * Input format (from AI facilitator ```diagram blocks):
 * {
 *   type: "architecture" | "flow" | "wireframe" | "erd",
 *   title: string,
 *   nodes: [{ id, label, type, description? }],
 *   edges: [{ from, to, label? }]
 * }
 */

interface DiagramNode {
  id: string;
  label: string;
  type: string;
  description?: string;
}

interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

interface DiagramData {
  type: string;
  title: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

const NODE_COLORS: Record<string, { bg: string; border: string; icon: string }> = {
  frontend: { bg: "bg-blue-500/15", border: "border-blue-500/30", icon: "🖥" },
  service: { bg: "bg-success/15", border: "border-success/30", icon: "⚙️" },
  database: { bg: "bg-amber-500/15", border: "border-amber-500/30", icon: "🗄" },
  user: { bg: "bg-violet-500/15", border: "border-violet-500/30", icon: "👤" },
  screen: { bg: "bg-cyan-500/15", border: "border-cyan-500/30", icon: "📱" },
  entity: { bg: "bg-rose-500/15", border: "border-rose-500/30", icon: "📦" },
  api: { bg: "bg-orange-500/15", border: "border-orange-500/30", icon: "🔌" },
  queue: { bg: "bg-pink-500/15", border: "border-pink-500/30", icon: "📨" },
  cache: { bg: "bg-red-500/15", border: "border-red-500/30", icon: "⚡" },
  storage: { bg: "bg-yellow-500/15", border: "border-yellow-500/30", icon: "📁" },
  default: { bg: "bg-foreground/[0.10]", border: "border-border", icon: "◆" },
};

function getNodeStyle(type: string) {
  return NODE_COLORS[type] || NODE_COLORS.default;
}

export function DiagramRenderer({ data }: { data: DiagramData }) {
  const { title, nodes, edges, type } = data;

  // Layout nodes in a grid
  const cols = Math.min(nodes.length, 3);
  const rows = Math.ceil(nodes.length / cols);

  return (
    <div className="my-2 rounded-xl border border-border bg-foreground/[0.02] overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border/60 flex items-center gap-2">
        <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
          {type} diagram
        </span>
        <span className="text-xs text-muted-foreground font-medium">{title}</span>
      </div>

      {/* Diagram */}
      <div className="p-4">
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
          }}
        >
          {nodes.map((node) => {
            const style = getNodeStyle(node.type);
            const outEdges = edges.filter((e) => e.from === node.id);

            return (
              <div key={node.id} className="relative">
                <div
                  className={`${style.bg} ${style.border} border rounded-lg p-3 text-center`}
                >
                  <span className="text-lg block mb-1">{style.icon}</span>
                  <span className="text-xs font-semibold text-foreground/90 block">
                    {node.label}
                  </span>
                  {node.description && (
                    <span className="text-[10px] text-muted-foreground/70 block mt-0.5">
                      {node.description}
                    </span>
                  )}
                </div>

                {/* Edge labels below node */}
                {outEdges.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 justify-center">
                    {outEdges.map((edge, i) => {
                      const target = nodes.find((n) => n.id === edge.to);
                      return (
                        <span
                          key={i}
                          className="text-[9px] text-muted-foreground/50 bg-foreground/[0.05] rounded px-1.5 py-0.5"
                        >
                          → {target?.label || edge.to}
                          {edge.label && ` (${edge.label})`}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Parse a message for ```diagram blocks and return the diagram data if found.
 */
export function parseDiagramFromMessage(content: string): DiagramData | null {
  if (!content) return null;

  // Try ```diagram blocks first
  const match = content.match(/```diagram\s*\n?([\s\S]*?)```/);
  if (match) {
    try {
      const data = JSON.parse(match[1].trim());
      if (data && data.type && (data.nodes || data.tables || data.screens)) {
        return data as DiagramData;
      }
    } catch {}
  }

  return null;
}

/**
 * Get the text content of a message without diagram blocks.
 */
export function getMessageTextWithoutDiagram(content: string): string {
  if (!content) return "";
  return content.replace(/```diagram\s*\n?[\s\S]*?```/g, "").trim();
}
