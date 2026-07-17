import type { ProtocolChange, ReviewContext, SessionNote } from '../lib/types';
import { Badge } from '../components/Badge';

const CHANGE_TONE: Record<ProtocolChange['type'], 'success' | 'warning' | 'accent' | 'neutral'> = {
  add: 'success',
  remove: 'warning',
  adjust: 'accent',
  continue: 'neutral',
};

// Read-only preview of the Supplement Protocol grid as it will actually be
// written — the client's FULL running plan (continued supplements included,
// not just what this session mentioned), with this session's changes applied.
// Editing the changes themselves happens in the Edit tab's Supplements /
// Protocol changes fields; this is the "what you'll actually get" check.

export function SupplementProtocolPanel({
  plan,
  note,
  priorProtocol,
}: {
  plan: ReviewContext['supplementPlan'] | null;
  note: SessionNote;
  priorProtocol: SessionNote | null;
}) {
  if (!plan) return <p className="il-empty">Loading…</p>;

  return (
    <div className="il-suppgrid">
      <div className="il-suppgrid__section">
        <h4>What will be written to the Supplement Protocol</h4>
        {plan.merged.length ? (
          <table className="il-table">
            <thead>
              <tr><th>Name</th><th>Special instructions</th><th>Qty</th></tr>
            </thead>
            <tbody>
              {plan.merged.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>{r.dose || <span className="il-empty">—</span>}</td>
                  <td>{r.qty ?? <span className="il-empty">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="il-empty">No supplements on the plan.</p>
        )}
      </div>

      <div className="il-suppgrid__section">
        <h4>This session's changes</h4>
        {note.protocol_changes.length ? (
          <ul className="il-list">
            {note.protocol_changes.map((c, i) => (
              <li key={i}><Badge tone={CHANGE_TONE[c.type]}>{c.type}</Badge> {c.description}</li>
            ))}
          </ul>
        ) : (
          <p className="il-empty">No protocol changes noted this session.</p>
        )}
      </div>

      <div className="il-suppgrid__section il-suppgrid__section--muted">
        <h4>Current plan (before this session)</h4>
        {plan.current.length ? (
          <p className="il-suppgrid__inline">{plan.current.map((r) => r.name).join(', ')}</p>
        ) : (
          <p className="il-empty">No prior supplements on file.</p>
        )}
      </div>

      {priorProtocol && (
        <div className="il-suppgrid__section il-suppgrid__section--muted">
          <h4>Previous session's changes</h4>
          {priorProtocol.protocol_changes.length ? (
            <ul className="il-list">
              {priorProtocol.protocol_changes.map((c, i) => (
                <li key={i}><Badge tone={CHANGE_TONE[c.type]}>{c.type}</Badge> {c.description}</li>
              ))}
            </ul>
          ) : (
            <p className="il-empty">No protocol changes that session.</p>
          )}
        </div>
      )}
    </div>
  );
}
