// Ein eigenes Leuchtenprofil der Geraetebibliothek vorschlagen. Es geht in
// die Moderation und ist fuer andere erst nach der Freigabe sichtbar. Der
// Datenblatt-Link ist Pflicht: ohne Beleg nimmt die Bibliothek nichts an.
import React, { useState } from 'react';
import type { Fixture } from '../types';
import { format, useTranslation } from '../i18n';
import { LibraryError, deviceUrl, type LibraryErrorCode } from '../core/deviceLibraryClient';
import { isDatasheetLink, isLibraryFixture } from '../core/deviceLibrary';
import { validateFixtureProfile } from '../core/fixtureProfile';
import { useDeviceLibrary } from '../store/deviceLibraryStore';
import DeviceLibraryError from './DeviceLibraryError';

const DeviceLibraryProposeDialog: React.FC<{ fixtures: Fixture[]; onClose: () => void }> = ({ fixtures, onClose }) => {
  const { t } = useTranslation();
  const { session, server, propose } = useDeviceLibrary();
  const own = fixtures.filter((f) => !isLibraryFixture(f));
  const [id, setId] = useState(own[0]?.id ?? '');
  const [sourceUrl, setSourceUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: LibraryErrorCode } | { text: string } | null>(null);
  const [done, setDone] = useState<{ slug: string; state: string } | null>(null);

  const fixture = own.find((f) => f.id === id);
  const check = fixture ? validateFixtureProfile(fixture) : null;
  const linkOk = isDatasheetLink(sourceUrl);

  const submit = async () => {
    if (!fixture || !linkOk) return;
    setBusy(true);
    setError(null);
    try {
      setDone(await propose(fixture, sourceUrl));
    } catch (e) {
      setError(e instanceof LibraryError ? { code: e.code } : { text: String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal fixture-editor-modal" role="dialog" aria-modal="true" aria-label={t('devlib.propose.title', 'Submit to device library')}>
        <h3>{t('devlib.propose.title', 'Submit to device library')}</h3>
        {session !== 'signed-in' ? (
          <p className="settings-hint">{t('devlib.propose.signIn', 'Sign in under Settings → Device library first.')}</p>
        ) : own.length === 0 ? (
          <p className="settings-hint">{t('devlib.propose.none', 'There is no custom fixture in this project yet. Add one with “+ Add custom fixture”.')}</p>
        ) : done ? (
          <p className="settings-hint">
            {format(t('devlib.propose.done', 'Submitted as “{slug}”. It is visible to others once a moderator has approved it.'), { slug: done.slug })}{' '}
            <a href={deviceUrl(server, done.slug)} target="_blank" rel="noreferrer">{t('devlib.propose.open', 'Open entry')}</a>
          </p>
        ) : (
          <>
            <p className="settings-hint">
              {t('devlib.propose.hint', 'The whole fixture profile is submitted — photometry, beam, DMX modes and the datasheet evidence per field. A moderator checks it against the datasheet before others see it.')}
            </p>
            <div className="editor-grid devlib-grid">
              <label>
                {t('devlib.propose.fixture', 'Fixture')}
                <select value={id} onChange={(e) => setId(e.target.value)}>
                  {own.map((f) => (
                    <option key={f.id} value={f.id}>{f.manufacturer} {f.name}</option>
                  ))}
                </select>
              </label>
              <label>
                {t('devlib.propose.source', 'Datasheet link')}
                <input type="url" placeholder="https://" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
              </label>
            </div>
            {sourceUrl && !linkOk && <p className="devlib-error">{t('devlib.propose.badLink', 'Enter the full link to the manufacturer’s datasheet, starting with https://.')}</p>}
            {check && !check.ok && (
              <p className="devlib-error">
                {format(t('devlib.propose.invalid', 'This profile fails the profile check: {problems}'), { problems: check.problems.join('; ') })}
              </p>
            )}
            {error && ('code' in error
              ? <DeviceLibraryError code={error.code} />
              : <p className="devlib-error" role="alert">{error.text}</p>)}
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="tb-btn" onClick={onClose} disabled={busy}>
            {done ? t('devlib.propose.close', 'Close') : t('devlib.propose.cancel', 'Cancel')}
          </button>
          {session === 'signed-in' && own.length > 0 && !done && (
            <button type="button" className="tb-btn primary" disabled={busy || !linkOk || !check?.ok} onClick={() => void submit()}>
              {busy ? t('devlib.propose.sending', 'Submitting…') : t('devlib.propose.submit', 'Submit')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeviceLibraryProposeDialog;
