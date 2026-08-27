'use client';

// The facilitator's visible state: the thinking indicator, its connection
// status, its broadcast next move, and the two suggestion popups it can
// raise (switch persona / generate an output artifact).

import { useRef, useState } from 'react';

export type AgentStatus =
  | 'unknown'
  | 'joining'
  | 'ready'
  | 'connected'
  | 'disconnected'
  | 'extracting'
  | 'detaching'
  | 'detached';

export function useAiState() {
  const [aiThinking, setAiThinking] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('unknown');
  const [agentIntent, setAgentIntent] = useState<{ intent: string; eta_ms: number | null } | null>(
    null,
  );
  const [personaSuggestion, setPersonaSuggestion] = useState<{
    persona: string;
    label: string;
    reason: string;
  } | null>(null);
  const [outputSuggestion, setOutputSuggestion] = useState<{
    output_type: string;
    label: string;
    reason: string;
  } | null>(null);
  // Output types the user said "Later" to — never re-suggest this session.
  const dismissedOutputsRef = useRef<Set<string>>(new Set());

  return {
    aiThinking,
    setAiThinking,
    agentStatus,
    setAgentStatus,
    agentIntent,
    setAgentIntent,
    personaSuggestion,
    setPersonaSuggestion,
    outputSuggestion,
    setOutputSuggestion,
    dismissedOutputsRef,
  };
}
