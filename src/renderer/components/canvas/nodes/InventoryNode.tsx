'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo } from 'react';

interface InventoryItem {
  service: string;
  provider: string;
  tier: string;
  monthlyCost: string;
  notes?: string;
}

interface InventoryNodeData {
  label: string;
  items: InventoryItem[];
  totalEstimate: string;
  [key: string]: unknown;
}

function InventoryNodeComponent({ data }: NodeProps) {
  const nodeData = data as InventoryNodeData;
  const items = nodeData.items || [];
  const total = nodeData.totalEstimate || '$0';

  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding: '16px 20px',
        minWidth: 500,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--muted-foreground)',
          }}
        >
          Infrastructure Inventory
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)' }}>~{total}/mo</div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {['Service', 'Provider', 'Tier', 'Est. Cost', 'Notes'].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  padding: '6px 8px',
                  fontSize: 9,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--muted-foreground)',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <td style={{ padding: '8px', color: 'var(--foreground)', fontWeight: 500 }}>
                {item.service}
              </td>
              <td style={{ padding: '8px', color: 'var(--muted-foreground)' }}>{item.provider}</td>
              <td style={{ padding: '8px', color: 'var(--muted-foreground)', fontSize: 10 }}>
                {item.tier}
              </td>
              <td style={{ padding: '8px', color: 'var(--primary)', fontWeight: 500 }}>
                {item.monthlyCost}
              </td>
              <td
                style={{
                  padding: '8px',
                  color: 'var(--muted-foreground)',
                  fontSize: 10,
                  maxWidth: 150,
                }}
              >
                {item.notes || ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Handle type="target" position={Position.Top} id="top" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} id="left" style={{ opacity: 0 }} />
    </div>
  );
}

export const InventoryNode = memo(InventoryNodeComponent);
