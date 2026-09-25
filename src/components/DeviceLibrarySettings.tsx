// ───────────────────────────────────────────────────────────────────────────
// Einstellungen → Geraetebibliothek: Server, Anmeldung, Abgleich.
//
// Ein Konto legt man auf der Website an (E-Mail bestaetigen, Richtlinien
// annehmen) — der Planer verlinkt dorthin, statt es nachzubauen.
// ───────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { format, useTranslation } from '../i18n';
import {
  DEFAULT_DEVICE_LIBRARY_URL,
  forgotPasswordUrl,
  registerUrl,
} from '../core/deviceLibraryClient';
import { connectSrcAllows, normalizeServerUrl } from '../core/deviceLibrary';
import { useDeviceLibrary } from '../store/deviceLibraryStore';
import DeviceLibraryError from './DeviceLibraryError';
import type { LibraryErrorCode } from '../core/deviceLibraryClient';

const cspOf = (): string =>
  document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '';

const DeviceLibrarySettings: React.FC = () => {
  const { t, language } = useTranslation();
  const lib = useDeviceLibrary();
  const [serverInput, setServerInput] = useState(lib.server);
  const [serverError, setServerError] = useState<string | null>(null);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LibraryErrorCode | null>(null);

  const init = useDeviceLibrary((s) => s.init);
  useEffect(() => {
    void init();
  }, [init]);

  const applyServer = async (raw: string) => {
    const r = normalizeServerUrl(raw);
    if (!r.ok) {
      setServerError(r.reason === 'insecure'
        ? t('devlib.server.insecure', 'Use https:// — plain http is only allowed for a server on this computer.')
        : t('devlib.server.invalid', 'This is not a valid server address.'));
      return;
    }
    if (!connectSrcAllows(cspOf(), r.url, location.origin)) {
      setServerError(t('devlib.server.csp', 'This app build may only connect to the default device library. Another server needs a build with that address in its content security policy.'));
      return;
    }
    setServerError(null);
    setServerInput(r.url);
    setChallenge(null);
    await lib.setServer(r.url);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = challenge ? await lib.verify(challenge, code) : await lib.signIn(login, password);
      if (r.kind === 'second-factor') setChallenge(r.challenge);
      else if (r.kind === 'error') setError(r.code);
      else {
        setPassword('');
        setCode('');
        setChallenge(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const openLink = (url: string) => window.open(url, '_blank', 'noopener');
  const { cache, lastSync } = lib;
  const when = cache.syncedAt ? new Date(cache.syncedAt).toLocaleString(language) : null;

  return (
    <div className="devlib-settings">
      <p className="settings-hint">
        {t('devlib.hint', 'Shared fixture profiles from devices.zumpelars.de. They appear in the fixture library as a read-only source; you can submit your own custom fixtures. An account is required.')}
      </p>

      <div className="editor-grid devlib-grid">
        <label>
          {t('devlib.server', 'Server')}
          <input
            type="url"
            value={serverInput}
            onChange={(e) => setServerInput(e.target.value)}
            onBlur={() => { if (serverInput !== lib.server) void applyServer(serverInput); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void applyServer(serverInput); }}
          />
        </label>
      </div>
      {serverError && <p className="devlib-error" role="alert">{serverError}</p>}
      {lib.server !== DEFAULT_DEVICE_LIBRARY_URL && (
        <div className="settings-chips">
          <button type="button" className="tb-chip" onClick={() => { setServerInput(DEFAULT_DEVICE_LIBRARY_URL); void applyServer(DEFAULT_DEVICE_LIBRARY_URL); }}>
            {t('devlib.server.reset', 'Reset to default server')}
          </button>
        </div>
      )}

      {lib.session === 'signed-in' ? (
        <>
          <p className="settings-hint">
            {lib.user
              ? format(t('devlib.signedInAs', 'Signed in as {name}.'), { name: lib.user.username || lib.user.email })
              : t('devlib.signedInOffline', 'Signed in (the server could not be reached at start).')}
            {lib.tokenVolatile && ` ${t('devlib.tokenVolatile', 'No secure storage is available on this system, so the sign-in lasts until the app is closed.')}`}
          </p>
          <p className="settings-hint">
            {when
              ? format(t('devlib.syncState', '{n} profiles, last sync {when}.'), { n: cache.entries.length, when })
              : t('devlib.neverSynced', 'Not synced yet.')}
            {cache.invalid.length > 0 && ` ${format(t('devlib.invalidCount', '{n} entries failed the profile check and are not shown.'), { n: cache.invalid.length })}`}
            {lastSync && ` ${format(t('devlib.syncDelta', 'Last run: {added} new, {updated} updated, {removed} removed.'), { added: lastSync.added, updated: lastSync.updated, removed: lastSync.removed })}`}
          </p>
          {!lib.cacheSaved && (
            <p className="devlib-error" role="alert">{t('devlib.cacheNotSaved', 'The synced profiles could not be stored on this computer; they are gone after a restart.')}</p>
          )}
          {lib.syncError && <DeviceLibraryError code={lib.syncError} />}
          {cache.invalid.length > 0 && (
            <details className="devlib-invalid">
              <summary>{t('devlib.invalidList', 'Show entries that failed the check')}</summary>
              <ul>
                {cache.invalid.map((i) => (
                  <li key={i.slug}>{i.label}: {i.problems.join('; ')}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="settings-chips">
            <button type="button" className="tb-chip" disabled={lib.syncing} onClick={() => void lib.syncNow()}>
              {lib.syncing ? t('devlib.syncing', 'Syncing…') : t('devlib.sync', 'Sync now')}
            </button>
            <button type="button" className="tb-chip" disabled={lib.syncing} onClick={() => void lib.syncNow(true)}>
              {t('devlib.syncFull', 'Reload everything')}
            </button>
            <button type="button" className="tb-chip" onClick={() => void lib.signOut()}>
              {t('devlib.signOut', 'Sign out')}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submit}>
          <div className="editor-grid devlib-grid">
            {challenge ? (
              <label>
                {t('devlib.code', 'Authenticator code')}
                <input
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
            ) : (
              <>
                <label>
                  {t('devlib.login', 'Email or username')}
                  <input autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} />
                </label>
                <label>
                  {t('devlib.password', 'Password')}
                  <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </label>
              </>
            )}
          </div>
          {challenge && <p className="settings-hint">{t('devlib.codeHint', 'Two-factor sign-in is on for this account. Enter the six-digit code from your authenticator app.')}</p>}
          {error && <DeviceLibraryError code={error} />}
          <div className="settings-chips">
            <button
              type="submit"
              className="tb-chip on"
              disabled={busy || lib.session === 'unknown' || (challenge ? !code.trim() : !login.trim() || !password)}
            >
              {busy ? t('devlib.signingIn', 'Signing in…') : challenge ? t('devlib.verify', 'Confirm code') : t('devlib.signIn', 'Sign in')}
            </button>
            {challenge && (
              <button type="button" className="tb-chip" onClick={() => { setChallenge(null); setCode(''); }}>
                {t('devlib.back', 'Back')}
              </button>
            )}
            <button type="button" className="tb-chip" onClick={() => openLink(registerUrl(lib.server))}>
              {t('devlib.register', 'Create account')}
            </button>
            <button type="button" className="tb-chip" onClick={() => openLink(forgotPasswordUrl(lib.server))}>
              {t('devlib.forgot', 'Forgot password')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default DeviceLibrarySettings;
