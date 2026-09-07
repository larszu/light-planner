import React from 'react';
import { categoryCount, type CategoryDiff, type ProjectDiff } from '../core/diff';

const CATS: { key: keyof Omit<ProjectDiff, 'total' | 'unnamed'>; label: string }[] = [
  { key: 'fixtures', label: 'Leuchten' },
  { key: 'persons', label: 'Personen' },
  { key: 'trusses', label: 'Traversen' },
  { key: 'walls', label: 'Wände' },
  { key: 'stageElements', label: 'Bühne' },
  { key: 'ceilings', label: 'Decken' },
];

const Section: React.FC<{ label: string; diff: CategoryDiff }> = ({ label, diff }) => {
  if (categoryCount(diff) === 0) return null;
  return (
    <div className="diff-cat">
      <div className="diff-cat-head">{label}</div>
      {diff.added.map((a) => (
        <div key={'a' + a.id} className="diff-item add"><span className="diff-badge">+</span>{a.label}</div>
      ))}
      {diff.removed.map((r) => (
        <div key={'r' + r.id} className="diff-item rem"><span className="diff-badge">−</span>{r.label}</div>
      ))}
      {diff.changed.map((c) => (
        <div key={'c' + c.id} className="diff-item chg">
          <span className="diff-badge">~</span>
          <div className="diff-chg-body">
            <b>{c.label}</b>
            {c.fields.map((f, i) => (
              <span key={i} className="diff-field">{f.field}: <s>{f.from}</s> → <em>{f.to}</em></span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// Renders a full project diff grouped by category (added / removed / changed).
const DiffView: React.FC<{ diff: ProjectDiff }> = ({ diff }) => (
  <>
    {CATS.map((c) => <Section key={c.key} label={c.label} diff={diff[c.key]} />)}
    {/* B-21: was sich geaendert hat, aber nicht aufgeschluesselt wird. Es zu
        verschweigen hiesse, dem Nutzer eine Version als unveraendert zu
        zeigen, die es nicht ist — und er verwirft sie daraufhin. */}
    {diff.unnamed.length > 0 && (
      <div className="diff-cat">
        <div className="diff-cat-head">Nicht aufgeschlüsselt</div>
        <div className="diff-item chg">
          <span className="diff-badge">~</span>
          <div className="diff-chg-body">
            <b>{diff.unnamed.join(', ')}</b>
            <span className="diff-field">
              unterscheiden sich — dieser Vergleich zeigt für sie noch keine einzelnen Felder.
            </span>
          </div>
        </div>
      </div>
    )}
  </>
);

export default DiffView;
