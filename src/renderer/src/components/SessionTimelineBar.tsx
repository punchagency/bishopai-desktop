import React from 'react';
import { IconScissors } from './Icons';
import type { CandidateAppointment } from '../lib/types';

export interface TimelineSegment {
  id: number;
  from_turn: number;
  to_turn: number;
  appointment_id?: string;
  client_name_hint?: string | null;
}

interface Props {
  totalTurns: number;
  segments: TimelineSegment[];
  candidates: CandidateAppointment[];
  onSelectSegment?: (segId: number) => void;
  onMergeWithNext?: (segId: number) => void;
}

const SEGMENT_COLORS = [
  { bg: 'rgba(200, 120, 80, 0.15)', border: '#c87850', text: '#9a4e28' },
  { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', text: '#1d4ed8' },
  { bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', text: '#047857' },
  { bg: 'rgba(139, 92, 246, 0.15)', border: '#8b5cf6', text: '#6d28d9' },
];

export function SessionTimelineBar({
  totalTurns,
  segments,
  candidates,
  onSelectSegment,
  onMergeWithNext,
}: Props) {
  const maxTurns = Math.max(1, totalTurns, segments[segments.length - 1]?.to_turn ?? 1);

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.75rem',
          fontWeight: 700,
          color: 'var(--il-color-text-subtle)',
          marginBottom: '0.35rem',
        }}
      >
        <span>Visual Session Timeline ({segments.length} Detected Encounters)</span>
        <span>Turns #1 to #{maxTurns}</span>
      </div>

      {/* Visual Color Segment Timeline */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '42px',
          borderRadius: '8px',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          background: 'var(--il-color-surface-raised, rgba(0,0,0,0.03))',
        }}
      >
        {segments.map((seg, idx) => {
          const color = SEGMENT_COLORS[idx % SEGMENT_COLORS.length];
          const turnCount = Math.max(1, seg.to_turn - seg.from_turn + 1);
          const flexWidth = (turnCount / maxTurns) * 100;

          const matchedCand = candidates.find((c) => c.id === seg.appointment_id);
          const label = matchedCand?.client_name ?? seg.client_name_hint ?? `Session #${idx + 1}`;

          return (
            <div
              key={seg.id}
              onClick={() => onSelectSegment?.(seg.id)}
              style={{
                width: `${flexWidth}%`,
                background: color.bg,
                borderRight: idx < segments.length - 1 ? `2px dashed ${color.border}` : 'none',
                padding: '0.35rem 0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                position: 'relative',
                boxSizing: 'border-box',
              }}
              title={`Session Encounter #${idx + 1}: Turns #${seg.from_turn} to #${seg.to_turn} (${label})`}
            >
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.78rem', fontWeight: 700, color: color.text }}>
                #{idx + 1}: {label}
              </div>

              <div style={{ fontSize: '0.7rem', opacity: 0.8, whiteSpace: 'nowrap', marginLeft: '0.3rem' }}>
                #{seg.from_turn}–#{seg.to_turn}
              </div>

              {idx < segments.length - 1 && onMergeWithNext && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMergeWithNext(seg.id);
                  }}
                  title="Merge this segment with the next segment"
                  style={{
                    position: 'absolute',
                    right: '-10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 5,
                    background: '#ffffff',
                    border: `1px solid ${color.border}`,
                    borderRadius: '10px',
                    padding: '0.1rem 0.3rem',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    color: color.text,
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  }}
                >
                  <IconScissors size={10} /> Merge
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
