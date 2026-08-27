import type { Node, Edge } from '@xyflow/react';

/**
 * Build context about the current element and its surrounding diagram
 * for the AI to understand what it's editing.
 */
export function buildEditContext(
  nodeId: string,
  nodeData: any,
  allNodes: Node[],
  allEdges: Edge[],
): { element: any; connections: any[]; context: string } {
  // Find connected nodes via edges
  const connectedEdges = allEdges.filter(
    (e) => e.source === nodeId || e.target === nodeId,
  );

  const connections = connectedEdges.map((edge) => {
    const isSource = edge.source === nodeId;
    const connectedNodeId = isSource ? edge.target : edge.source;
    const connectedNode = allNodes.find((n) => n.id === connectedNodeId);
    return {
      direction: isSource ? 'outgoing' : 'incoming',
      edgeLabel: edge.label || edge.data?.label || null,
      connectedNode: connectedNode
        ? {
            id: connectedNode.id,
            type: connectedNode.type,
            label: (connectedNode.data as any)?.label || connectedNode.id,
          }
        : { id: connectedNodeId, type: 'unknown', label: connectedNodeId },
    };
  });

  // Build a summary of neighboring nodes for context
  const neighborSummary = connections
    .map(
      (c) =>
        `${c.direction === 'incoming' ? '<-' : '->'} ${c.connectedNode.label} (${c.connectedNode.type})${c.edgeLabel ? ` [${c.edgeLabel}]` : ''}`,
    )
    .join('\n');

  const context = [
    `Element "${(nodeData as any)?.label || nodeId}" is a ${allNodes.find((n) => n.id === nodeId)?.type || 'unknown'} node.`,
    connections.length > 0
      ? `Connected to ${connections.length} node(s):\n${neighborSummary}`
      : 'No connections to other nodes.',
    `Total diagram: ${allNodes.length} nodes, ${allEdges.length} edges.`,
  ].join('\n\n');

  return {
    element: { id: nodeId, ...nodeData },
    connections,
    context,
  };
}

/**
 * Parse AI response into updated node data.
 * Expects the response to contain a JSON block with the new data fields.
 */
export function parseEditResponse(
  response: string,
  originalData: any,
  _nodeType: string,
): any {
  // Try to extract JSON from the response
  let jsonStr = response.trim();

  // Strip markdown code fences if present
  if (jsonStr.startsWith('```')) {
    const lines = jsonStr.split('\n');
    // Remove first line (```json or ```)
    lines.shift();
    // Remove last line if it's ```)
    if (lines[lines.length - 1]?.trim() === '```') {
      lines.pop();
    }
    jsonStr = lines.join('\n').trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    // Merge with original data, preserving any fields the AI didn't mention
    return { ...originalData, ...parsed };
  } catch {
    // If JSON parsing fails, return original data unchanged
    return originalData;
  }
}
