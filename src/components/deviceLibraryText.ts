import type { LibraryErrorCode, SyncDevice } from '../core/deviceLibraryClient';

type T = (key: string, en: string) => string;

/** Ein Aufruf je Fall, damit `lang:check` jeden Fallback als Literal sieht. */
export const libraryErrorText = (t: T, code: LibraryErrorCode): string => {
  switch (code) {
    case 'wrong-credentials': return t('devlib.err.credentials', 'Email, username or password is wrong.');
    case 'guidelines-outdated': return t('devlib.err.guidelines', 'The community guidelines have changed. Please accept the new version on the website, then try again.');
    case 'exists': return t('devlib.err.exists', 'This manufacturer and model are already in the device library. Open the existing entry there and confirm or correct it instead.');
    case 'email-not-verified': return t('devlib.err.unverified', 'Please confirm your email address first — the link is in the welcome email.');
    case 'wrong-code': return t('devlib.err.code', 'The code is wrong or has expired. Enter the current code from your authenticator app.');
    case 'rate-limited': return t('devlib.err.rate', 'Too many attempts. Please wait a minute and try again.');
    case 'not-signed-in': return t('devlib.err.session', 'Your session has expired. Please sign in again.');
    case 'offline': return t('devlib.err.offline', 'The device library cannot be reached. Check the connection and the server address.');
    case 'server': return t('devlib.err.server', 'The device library answered with an error. Please try again later.');
  }
};

export const libraryStatusText = (t: T, status: SyncDevice['status']): string => {
  switch (status) {
    case 'verified': return t('devlib.status.verified', 'Verified');
    case 'confirmed': return t('devlib.status.confirmed', 'Confirmed');
    case 'unconfirmed': return t('devlib.status.unconfirmed', 'Unconfirmed');
    case 'disputed': return t('devlib.status.disputed', 'Disputed');
  }
};
