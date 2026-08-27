'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

type FetchFn = (url: string, options?: RequestInit) => Promise<Response>;

interface AIEditModalProps {
  nodeId: string;
  nodeType: string;
  nodeData: any;
  diagramContext: any;
  onClose: () => void;
  onUpdate: (nodeId: string, newData: any) => void;
  sessionId: string;
  fetchFn?: FetchFn;
}

const modalStyles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    width: 400,
    background: 'var(--card)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    overflow: 'hidden',
  },
  header: {
    padding: '16px 20px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  headerType: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 4,
  },
  headerLabel: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--foreground)',
    lineHeight: '20px',
  },
  body: {
    padding: '16px 20px',
  },
  textarea: {
    width: '100%',
    minHeight: 80,
    padding: '10px 12px',
    background: 'color-mix(in srgb, var(--foreground) 4%, transparent)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    color: 'var(--foreground)',
    fontSize: 13,
    lineHeight: '20px',
    fontFamily: 'inherit',
    resize: 'vertical' as const,
    outline: 'none',
    transition: 'border-color 0.15s ease',
    boxSizing: 'border-box' as const,
  },
  textareaFocus: {
    borderColor: 'rgba(229,166,48,0.4)',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    padding: '12px 20px 16px',
  },
  buttonBase: {
    padding: '8px 16px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    fontFamily: 'inherit',
    cursor: 'pointer',
    border: 'none',
    transition: 'background 0.15s ease, opacity 0.15s ease',
    lineHeight: '16px',
  },
  cancelButton: {
    background: 'transparent',
    color: 'var(--muted-foreground)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  applyButton: {
    background: 'var(--primary)',
    color: 'var(--primary-foreground)',
  },
  applyButtonDisabled: {
    opacity: 0.5,
    cursor: 'default',
  },
  error: {
    padding: '8px 12px',
    margin: '12px 0 0',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: 6,
    fontSize: 12,
    color: '#ef4444',
    lineHeight: '18px',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 0',
    fontSize: 12,
    color: 'var(--muted-foreground)',
  },
  spinner: {
    width: 14,
    height: 14,
    border: '2px solid rgba(229,166,48,0.2)',
    borderTopColor: 'var(--primary)',
    borderRadius: '50%',
    animation: 'ai-edit-spin 0.6s linear infinite',
  },
};

export default function AIEditModal({
  nodeId,
  nodeType,
  nodeData,
  diagramContext,
  onClose,
  onUpdate,
  sessionId,
  fetchFn,
}: AIEditModalProps) {
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const label = nodeData?.label || nodeId;
  const typeLabel = nodeType
    .replace(/^wire/, 'Wireframe ')
    .replace(/^\w/, (c: string) => c.toUpperCase());

  useEffect(() => {
    // Focus textarea on mount
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    },
    [onClose, loading],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleSubmit = async () => {
    if (!instruction.trim() || loading) return;

    setLoading(true);
    setError(null);

    try {
      const doFetch = fetchFn || fetch;
      const resp = await doFetch(`/api/sessions/${sessionId}/ai-edit-element`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node_id: nodeId,
          node_type: nodeType,
          node_data: nodeData,
          instruction: instruction.trim(),
          diagram_context: diagramContext,
        }),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        throw new Error(body?.detail || `Request failed (${resp.status})`);
      }

      const result = await resp.json();
      onUpdate(nodeId, result.new_data);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to apply AI edit');
    } finally {
      setLoading(false);
    }
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl + Enter to submit
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      {/* Inject spinner animation */}
      <style>{`@keyframes ai-edit-spin { to { transform: rotate(360deg); } }`}</style>

      <div style={modalStyles.overlay} onClick={loading ? undefined : onClose}>
        <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div style={modalStyles.header}>
            <div style={modalStyles.headerType}>{typeLabel}</div>
            <div style={modalStyles.headerLabel}>{label}</div>
          </div>

          {/* Body */}
          <div style={modalStyles.body}>
            <textarea
              ref={textareaRef}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Describe the change..."
              style={{
                ...modalStyles.textarea,
                ...(focused ? modalStyles.textareaFocus : {}),
              }}
              disabled={loading}
            />

            {loading && (
              <div style={modalStyles.loading}>
                <div style={modalStyles.spinner} />
                Applying changes...
              </div>
            )}

            {error && <div style={modalStyles.error}>{error}</div>}
          </div>

          {/* Footer */}
          <div style={modalStyles.footer}>
            <button
              style={{
                ...modalStyles.buttonBase,
                ...modalStyles.cancelButton,
              }}
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              style={{
                ...modalStyles.buttonBase,
                ...modalStyles.applyButton,
                ...(!instruction.trim() || loading ? modalStyles.applyButtonDisabled : {}),
              }}
              onClick={handleSubmit}
              disabled={!instruction.trim() || loading}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
