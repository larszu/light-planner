// Eigene Leuchtenprofile und die Geraetebibliothek: Zustand je Profil,
// Datenblatt-Link nachtragen, einzeln hochladen. Der Link wird am Profil
// gespeichert (`datasheetUrl`) — sonst fehlte er beim naechsten
// automatischen Hochladen wieder.
//
// Der Knopf ist bewusst kein `primary`: dessen Tally-Punkt traegt schon
// „Speichern" in der Kopfzeile, und einer pro Sichtfeld ist die Regel.
import React, { useState } from 'react';
import type { Fixture } from '../types';
import { useTranslation } from '../i18n';
import { deviceUrl } from '../core/deviceLibraryClient';
import { isDatasheetLink, isLibraryFixture, uploadStatus } from '../core/deviceLibrary';
import { validateFixtureProfile } from '../core/fixtureProfile';
import { useDeviceLibrary } from '../store/deviceLibraryStore';
import DeviceLibraryError from './DeviceLibraryError';
import { uploadStateText } from './deviceLibraryText';

interface Props {
  fixtures: Fixture[];
  onSaveFixture: (f: Fixture) => void;
  onClose: () => void;
}

const DeviceLibraryUploadDialog: React.FC<Props> = ({ fixtures, onSaveFixture, onClose }) => {
  const { t } = useTranslation();
  const { session, server, uploads, uploading, uploadError, uploadNow } = useDeviceLibrary();
  const own = fixtures.filter((f) => !isLibraryFixture(f));
  const [id, setId] = useState(own[0]?.id ?? '');
  const fixture = own.find((f) => f.id === id);
  const [link, setLink] = useState(fixture?.datasheetUrl ?? '');
  const check = fixture ? validateFixtureProfile(fixture) : null;
  const linkOk = isDatasheetLink(link);

  const pick = (next: string) => {
    setId(next);
    setLink(own.find((f) => f.id === next)?.datasheetUrl ?? '');
  };

  const submit = async () => {
    if (!fixture || !linkOk) return;
    const updated: Fixture = { ...fixture, datasheetUrl: link.trim() };
    onSaveFixture(updated);
    await uploadNow([updated]);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !uploading) onClose(); }}>
      <div className="modal fixture-editor-modal" role="dialog" aria-modal="true" aria-label={t('devlib.upload.title', 'Upload to device library')}>
        <h3>{t('devlib.upload.title', 'Upload to device library')}</h3>
        {own.length === 0 ? (
          <p className="settings-hint">{t('devlib.propose.none', 'There is no custom fixture in this project yet. Add one with “+ Add custom fixture”.')}</p>
        ) : (
          <>
            <p className="settings-hint">
              {t('devlib.upload.hint', 'The whole fixture profile is uploaded — photometry, beam, DMX modes and the datasheet evidence per field. If the library already has this manufacturer and model, your profile becomes its next version. A moderator checks it before others see it.')}
            </p>
            <ul className="devlib-own">
              {own.map((f) => {
                const rec = uploads.items[f.id];
                return (
                  <li key={f.id}>
                    <button type="button" className={`tb-chip ${f.id === id ? 'on' : ''}`} onClick={() => pick(f.id)}>
                      {f.manufacturer} {f.name}
                    </button>
                    <span className="devlib-own-state">{uploadStateText(t, uploadStatus(f, uploads))}</span>
                    {rec?.slug && (
                      <a href={deviceUrl(server, rec.slug)} target="_blank" rel="noreferrer">{t('devlib.propose.open', 'Open entry')}</a>
                    )}
                    {rec?.findings && rec.findings.length > 0 && <span className="devlib-own-state">{rec.findings.join('; ')}</span>}
                    {rec?.error && <span className="devlib-own-state">{rec.error}</span>}
                  </li>
                );
              })}
            </ul>
            <div className="editor-grid devlib-grid">
              <label>
                {t('devlib.propose.source', 'Datasheet link')}
                <input type="url" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} />
              </label>
            </div>
            {link && !linkOk && <p className="devlib-error">{t('devlib.propose.badLink', 'Enter the full link to the manufacturer’s datasheet, starting with https://.')}</p>}
            {check && !check.ok && (
              <p className="devlib-error">{t('devlib.propose.invalidShort', 'This profile fails the profile check:')} {check.problems.join('; ')}</p>
            )}
            {session !== 'signed-in' && (
              <p className="settings-hint">{t('devlib.upload.signIn', 'The link is saved with the fixture. To upload, sign in under Settings → Device library.')}</p>
            )}
            {uploadError && <DeviceLibraryError code={uploadError} />}
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="tb-btn" onClick={onClose} disabled={uploading}>
            {t('devlib.propose.close', 'Close')}
          </button>
          {own.length > 0 && (
            <button type="button" className="tb-btn" disabled={uploading || !linkOk || !check?.ok} onClick={() => void submit()}>
              {uploading
                ? t('devlib.upload.sending', 'Uploading…')
                : session === 'signed-in'
                  ? t('devlib.upload.submit', 'Save link and upload')
                  : t('devlib.upload.saveOnly', 'Save link')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeviceLibraryUploadDialog;
