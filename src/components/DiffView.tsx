import React from 'react';
import { categoryCount, ALLE_KATEGORIEN, KATEGORIE_NAMEN, type CategoryDiff, type ProjectDiff } from '../core/diff';
import { useTranslation } from '../i18n';

// B-21, zweite Haelfte: die Liste stand hier ein zweites Mal und war um acht
// Eintraege kuerzer als der Vergleich. Sie kommt jetzt aus `core/diff` —
// derselbe Grund wie ueberall: eine zweite Liste laeuft der ersten davon, und
// zwar still.
const CATS = ALLE_KATEGORIEN.map((key) => ({ key, label: KATEGORIE_NAMEN[key][1] }));

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
const DiffView: React.FC<{ diff: ProjectDiff }> = ({ diff }) => {
  const { t } = useTranslation();
  return (
  <>
    {CATS.map((c) => <Section key={c.key} label={c.label} diff={diff[c.key]} />)}
    {/* B-21: was sich geaendert hat, aber nicht aufgeschluesselt wird. Es zu
        verschweigen hiesse, dem Nutzer eine Version als unveraendert zu
        zeigen, die es nicht ist — und er verwirft sie daraufhin. */}
    {diff.unnamed.length > 0 && (
      <div className="diff-cat">
        <div className="diff-cat-head">{t('diff.unbroken', 'Not itemised')}</div>
        <div className="diff-item chg">
          <span className="diff-badge">~</span>
          <div className="diff-chg-body">
            <b>{diff.unnamed.join(', ')}</b>
            <span className="diff-field">
              {t(
                'diff.unbrokenHint',
                'differ — this comparison does not know any fields for them yet. That is a note for development, not a state of the plan.',
              )}
            </span>
          </div>
        </div>
      </div>
    )}
  </>
  );
};

export default DiffView;
