// ───────────────────────────────────────────────────────────────────────────
// Die Anbindung an die Geraetebibliothek (devices.zumpelars.de).
// Lauf: `npm run library:check`
//
// WARUM ES DAS GIBT (2026-09-25). Dieses Repo hat keine Vitest-Tests; die
// Waechter sind die einzige Absicherung. Die Anbindung hat vier Stellen, an
// denen sie still falsch werden kann, und keine davon sieht man am Bildschirm:
//
//   1. Das Facet-Format. Einreichen und Import muessen dasselbe Profil
//      ergeben — sonst verliert ein Profil auf dem Weg durch die Bibliothek
//      seine DMX-Modi oder seine Datenblatt-Belege, und niemand merkt es,
//      weil die Leuchte trotzdem in der Liste steht.
//   2. Die Profilpruefung. Sie muss fremde Profile abweisen, die der Planer
//      nicht rechnen kann, und darf keinen Eintrag des eigenen Katalogs
//      abweisen — sonst ist sie strenger als der Planer.
//   3. Der Abgleich. Inkrementell ueber `latestSeq`, `removed` entfernt,
//      Ungueltige werden gezaehlt statt still verworfen.
//   4. Das Token. Es darf in keinem State, keinem Projekt und keiner
//      Log-Zeile stehen, und die Content-Security-Policy muss den Werks-Server
//      zulassen — sonst meldet der Release-Build „offline", obwohl er online ist.
//
// Der Client selbst (`src/core/deviceLibraryClient.ts`) ist eine Kopie aus
// larszu/av-device-library und wird dort gegen den echten Server getestet.
// Hier laeuft er gegen ein nachgebautes `fetch`: geprueft wird, was dieser
// Planer ihm uebergibt.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fixtureLibrary } from '../src/core/fixtureLibrary.ts';
import { validateFixtureProfile } from '../src/core/fixtureProfile.ts';
import {
  CORE_CATEGORY, LIBRARY_ID_PREFIX, applySync, connectSrcAllows, deviceToFixture, emptyCache,
  fixtureToProposal, isDatasheetLink, normalizeServerUrl, readCache,
} from '../src/core/deviceLibrary.ts';
import {
  DEFAULT_DEVICE_LIBRARY_URL, LibraryError, propose, signIn, sync, verifySecondFactor,
  type LibraryErrorCode, type SyncDevice, type SyncResponse,
} from '../src/core/deviceLibraryClient.ts';
import { libraryErrorText } from '../src/components/deviceLibraryText.ts';
import type { Fixture } from '../src/types.ts';

const wurzel = new URL('../', import.meta.url);
const lies = (p: string) => readFileSync(new URL(p, wurzel), 'utf8');
let n = 0;
const ok = (msg: string) => { n++; console.log(`  ✓ ${msg}`); };

// ── 1. Profilpruefung ───────────────────────────────────────────────────────
for (const f of fixtureLibrary) {
  const r = validateFixtureProfile(f);
  assert.ok(r.ok, `Katalog-Eintrag ${f.id} faellt durch die Profilpruefung: ${r.ok ? '' : r.problems.join('; ')}`);
}
ok(`alle ${fixtureLibrary.length} Katalog-Eintraege bestehen die Profilpruefung`);

const MUSTER: Fixture = {
  id: 'custom-1727000000000',
  name: 'MegaPointe',
  manufacturer: 'Robe',
  category: 'moving-spot',
  wattage: 470,
  lumens: 11000,
  beamAngle: 1.8,
  fieldAngle: 42,
  beamShape: 'circular',
  beamRatioWH: 1,
  lensType: 'zoom',
  zoomRange: [1.8, 42],
  colorTemp: 7500,
  weight: 22,
  mountType: 'yoke',
  dmxModes: [
    { id: 'm1', name: 'Mode 1', channels: 34, origin: 'device', evidence: 'Datenblatt S. 4' },
    { id: 'm2', name: 'Mode 2', channels: 39, origin: 'gdtf' },
  ],
  specSource: { wattage: { value: '470', source: '„Power consumption: 470 W"' } },
};
assert.ok(validateFixtureProfile(MUSTER).ok);

const abgewiesen = (patch: Record<string, unknown>, feld: string) => {
  const r = validateFixtureProfile({ ...MUSTER, ...patch });
  assert.ok(!r.ok && r.problems.some((p) => p.startsWith(feld)), `${feld} haette abgewiesen werden muessen`);
};
abgewiesen({ beamAngle: undefined }, 'beamAngle');
abgewiesen({ beamAngle: Number.NaN }, 'beamAngle');
abgewiesen({ category: 'laser' }, 'category');
abgewiesen({ dmxModes: [{ id: 'm1', name: 'x', channels: 0, origin: 'device' }] }, 'dmxModes[0].channels');
abgewiesen({ dmxModes: [{ id: 'a', name: 'x', channels: 8, origin: 'device' }, { id: 'a', name: 'y', channels: 9, origin: 'device' }] }, 'dmxModes[1].id');
abgewiesen({ dmxModes: [{ id: 'a', name: 'x', channels: 8, origin: 'guess' }] }, 'dmxModes[0].origin');
abgewiesen({ specSource: { wattage: '470' } }, 'specSource');
abgewiesen({ zoomRange: [42, 1.8] }, 'zoomRange');
assert.ok(!validateFixtureProfile(null).ok);
ok('fremde Profile ohne Streuwinkel, mit 0-Kanal-Modus, doppelter Modus-Id, fremder Herkunft oder kaputtem Beleg werden abgewiesen');

// ── 2. Facet-Format: Einreichen und Import ergeben dasselbe Profil ──────────
const { core, facet } = fixtureToProposal(MUSTER, '  https://www.robe.cz/megapointe/datasheet.pdf ');
assert.equal('id' in facet, false, 'die lokale Id darf nicht mitgehen');
assert.deepEqual(core, {
  manufacturer: 'Robe', model: 'MegaPointe', category: CORE_CATEGORY,
  sourceUrl: 'https://www.robe.cz/megapointe/datasheet.pdf', powerWatts: 470, weightKg: 22,
});
// Dieselbe Stelle, die der Bibliotheks-Test liest: `dmxModes[0].channels`.
assert.equal((facet.dmxModes ?? [])[0].channels, 34);

const geraet = (slug: string, seq: number, over: Partial<SyncDevice> = {}): SyncDevice => ({
  slug, version: 1, seq, removed: false, status: 'unconfirmed', confirmations: 0,
  core: { ...core }, facet: JSON.parse(JSON.stringify(facet)) as Record<string, unknown>,
  ...over,
});
const zurueck = deviceToFixture(geraet('robe-megapointe', 1));
assert.ok(zurueck.ok);
assert.deepEqual(zurueck.fixture, { ...MUSTER, id: `${LIBRARY_ID_PREFIX}robe-megapointe` });
ok('Rundlauf Profil → Vorschlag → Abgleich → Profil verlustfrei (dmxModes mit Herkunft, specSource), Id wird devlib:<slug>');

const kernGewinnt = deviceToFixture(geraet('x', 1, { core: { ...core, model: 'MegaPointe (2019)' } }));
assert.ok(kernGewinnt.ok && kernGewinnt.fixture.name === 'MegaPointe (2019)');
const { wattage: _w, weight: _g, ...ohneLeistung } = facet;
const ausKern = deviceToFixture(geraet('y', 1, { facet: ohneLeistung as Record<string, unknown> }));
assert.ok(ausKern.ok && ausKern.fixture.wattage === 470 && ausKern.fixture.weight === 22);
ok('Name/Hersteller aus dem Kern; Leistung/Gewicht nur ersatzweise aus dem Kern');

assert.ok(isDatasheetLink('https://example.com/a.pdf'));
assert.ok(!isDatasheetLink('Datenblatt S. 4'));
assert.ok(!isDatasheetLink('ftp://example.com/a.pdf'));
ok('Datenblatt-Link: nur http(s)-Adressen');

// ── 3. Abgleich ─────────────────────────────────────────────────────────────
const S = DEFAULT_DEVICE_LIBRARY_URL;
const antwort = (latestSeq: number, devices: SyncDevice[]): SyncResponse =>
  ({ format: 'avplan-device-sync', version: 1, planner: 'light', latestSeq, devices });
const jetzt = new Date('2026-09-25T10:00:00Z');

const kaputt = geraet('kaputt', 3, { facet: { ...facet, beamAngle: 'weit' } as Record<string, unknown> });
let r = applySync(emptyCache(S), antwort(3, [geraet('a', 1), geraet('b', 2), kaputt]), 0, jetzt);
assert.equal(r.cache.latestSeq, 3);
assert.deepEqual([r.added, r.updated, r.removed, r.invalid], [2, 0, 0, 1]);
assert.equal(r.cache.entries.length, 2);
assert.equal(r.cache.invalid[0].slug, 'kaputt');
assert.ok(r.cache.invalid[0].problems.some((p) => p.startsWith('beamAngle')));

r = applySync(r.cache, antwort(6, [
  geraet('a', 4, { version: 2, status: 'confirmed', confirmations: 3 }),
  geraet('b', 5, { removed: true, facet: null }),
  geraet('kaputt', 6),
]), 3, jetzt);
assert.equal(r.cache.latestSeq, 6);
assert.deepEqual([r.added, r.updated, r.removed, r.invalid], [1, 1, 1, 0]);
assert.deepEqual(r.cache.entries.map((e) => e.slug).sort(), ['a', 'kaputt']);
assert.equal(r.cache.entries.find((e) => e.slug === 'a')?.confirmations, 3);

// Eine neue, ungueltige Fassung nimmt die alte gueltige mit.
r = applySync(r.cache, antwort(7, [{ ...kaputt, seq: 7, version: 2 }]), 6, jetzt);
assert.deepEqual(r.cache.entries.map((e) => e.slug), ['a']);
assert.equal(r.invalid, 1);

// Vollabgleich beginnt leer; latestSeq faellt nie zurueck.
const voll = applySync(r.cache, antwort(7, [geraet('c', 7)]), 0, jetzt);
assert.deepEqual(voll.cache.entries.map((e) => e.slug), ['c']);
assert.equal(voll.cache.invalid.length, 0);
assert.equal(applySync(voll.cache, antwort(2, []), 7, jetzt).cache.latestSeq, 7);
assert.throws(() => applySync(emptyCache(S), { ...antwort(1, []), planner: 'cable' }, 0, jetzt));
ok('Abgleich: inkrementell ueber latestSeq, removed entfernt, Ungueltige gezaehlt, Vollabgleich beginnt leer');

assert.ok(readCache(JSON.parse(JSON.stringify(voll.cache)), S));
assert.equal(readCache(JSON.parse(JSON.stringify(voll.cache)), 'https://andere.example'), null);
assert.equal(readCache({ format: 'x' }, S), null);
ok('Cache gehoert zu genau einem Server');

// ── 4. Server-Adresse und Content-Security-Policy ───────────────────────────
assert.equal(DEFAULT_DEVICE_LIBRARY_URL, 'https://devices.zumpelars.de');
assert.deepEqual(normalizeServerUrl(' https://devices.zumpelars.de/ '), { ok: true, url: 'https://devices.zumpelars.de' });
assert.deepEqual(normalizeServerUrl('http://devices.zumpelars.de'), { ok: false, reason: 'insecure' });
assert.deepEqual(normalizeServerUrl('http://127.0.0.1:4190'), { ok: true, url: 'http://127.0.0.1:4190' });
assert.deepEqual(normalizeServerUrl('devices'), { ok: false, reason: 'invalid' });
ok('Server-Adresse: https Pflicht, http nur lokal');

const csp = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(lies('index.html'))?.[1];
assert.ok(csp, 'index.html hat keine <meta>-CSP');
assert.ok(connectSrcAllows(csp, DEFAULT_DEVICE_LIBRARY_URL, 'file://'), 'die CSP laesst den Werks-Server nicht zu');
assert.ok(!connectSrcAllows(csp, 'https://evil.example', 'file://'));
assert.ok(connectSrcAllows("connect-src 'self'", 'http://localhost:4183/x', 'http://localhost:4183'));
assert.ok(connectSrcAllows('connect-src https://*.example.com', 'https://a.example.com', 'x'));
assert.ok(!connectSrcAllows('connect-src https://*.example.com', 'https://example.com', 'x'));
ok('CSP in index.html laesst https://devices.zumpelars.de zu, fremde Server nicht');

// ── 5. Der Client, wie dieser Planer ihn aufruft ────────────────────────────
type Aufruf = { url: string; init: RequestInit };
const aufrufe: Aufruf[] = [];
const antworten: Response[] = [];
globalThis.fetch = (async (url: string, init: RequestInit) => {
  aufrufe.push({ url, init });
  return antworten.shift()!;
}) as typeof fetch;

antworten.push(new Response(JSON.stringify({ twoFactorRedirect: true }), { status: 200, headers: { 'x-auth-challenge': 'chal-1' } }));
const erst = await signIn(S, 'lars', 'geheim');
assert.deepEqual(erst, { kind: 'second-factor', challenge: 'chal-1' });
assert.ok(aufrufe[0].url.endsWith('/api/auth/sign-in/username'));
assert.equal(aufrufe[0].init.credentials, 'omit');

antworten.push(new Response(JSON.stringify({ user: { id: 'u1', email: 'l@x.de', username: 'lars', emailVerified: true } }), { status: 200, headers: { 'set-auth-token': 'tok-1' } }));
const zweit = await verifySecondFactor(S, 'chal-1', '123 456');
assert.equal(zweit.kind, 'ok');
assert.equal((aufrufe[1].init.headers as Record<string, string>)['x-auth-challenge'], 'chal-1');

antworten.push(new Response(JSON.stringify(antwort(0, [])), { status: 200 }));
await sync(S, 'tok-1', 'light', 5);
assert.equal(aufrufe[2].url, `${S}/api/sync?planner=light&after=5`);
assert.equal((aufrufe[2].init.headers as Record<string, string>).authorization, 'Bearer tok-1');
ok('Client: 2FA ueber x-auth-challenge, ohne Cookies, Abgleich mit planner=light&after=<seq>');

// Die Bibliotheks-Routen antworten mit klein geschriebenen Codes (Better Auth
// mit grossen). Jeder Fall muss beim richtigen Code ankommen — ein
// `guidelines-outdated` als „wrong-credentials" gelesen, und der Planer
// meldet den Nutzer ab, statt ihn zur Website zu schicken.
const fehlerCode = async (status: number, body: unknown): Promise<LibraryErrorCode> => {
  antworten.push(new Response(JSON.stringify(body), { status }));
  try {
    await propose(S, 'tok-1', 'light', core, facet as unknown as Record<string, unknown>);
  } catch (e) {
    assert.ok(e instanceof LibraryError);
    return e.code;
  }
  throw new Error('propose haette scheitern muessen');
};
assert.equal(await fehlerCode(409, { error: 'exists' }), 'exists');
assert.equal(await fehlerCode(403, { error: 'guidelines-outdated' }), 'guidelines-outdated');
assert.equal(await fehlerCode(403, { error: 'email-not-verified' }), 'email-not-verified');
assert.equal(await fehlerCode(401, { error: 'not-signed-in' }), 'not-signed-in');
const alleCodes: LibraryErrorCode[] = [
  'wrong-credentials', 'email-not-verified', 'guidelines-outdated', 'exists', 'wrong-code',
  'rate-limited', 'not-signed-in', 'offline', 'server',
];
const texte = alleCodes.map((c) => libraryErrorText((_k, en) => en, c));
assert.equal(new Set(texte).size, alleCodes.length, 'jeder Fehlercode braucht einen eigenen Text');
assert.ok(/\/guidelines`/.test(lies('src/components/DeviceLibraryError.tsx')), 'guidelines-outdated ohne Link auf <server>/guidelines');
const store0 = lies('src/store/deviceLibraryStore.ts');
assert.ok(!/guidelines-outdated'\)\s*await forgetSession/.test(store0), 'geaenderte Richtlinien sind kein Grund zum Abmelden');
ok('Fehlercodes: exists (409), guidelines-outdated mit Link, klein geschriebene Codes, jeder Code mit eigenem Text');

// ── 6. Wo das Token NICHT stehen darf ───────────────────────────────────────
const store = lies('src/store/deviceLibraryStore.ts');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
for (const datei of [
  'src/store/deviceLibraryStore.ts', 'src/core/deviceLibrary.ts', 'src/components/DeviceLibrarySettings.tsx',
  'src/components/DeviceLibraryProposeDialog.tsx', 'electron/main.cjs', 'electron/preload.cjs',
]) {
  assert.ok(!/console\.\w+\(/.test(code(lies(datei))), `${datei}: keine Log-Zeile in der Anbindung (Token-Gefahr)`);
}
const tokenImState = /(?<![.\w])set\(\{[^}]*\btoken\b/;
// Gegenprobe: ein Muster, das seinen eigenen Defekt nicht findet, prueft nichts.
assert.ok(tokenImState.test("set({ session: 'signed-in', token })") && !tokenImState.test('tokenStore.set({ token })'));
assert.ok(!tokenImState.test(code(store)), 'das Token darf nicht in den zustand-State');
assert.ok(!/\btoken\b/i.test(code(lies('src/types.ts'))), 'ProjectData/Fixture duerfen kein Token-Feld tragen');
const main = code(lies('electron/main.cjs'));
assert.ok(/safeStorage\.encryptString/.test(main) && /preload\.cjs/.test(main), 'Electron: safeStorage + Preload');
const preload = code(lies('electron/preload.cjs'));
assert.ok(!/exposeInMainWorld\([^)]*ipcRenderer\s*[,)]/.test(preload), 'ipcRenderer selbst darf nicht in den Renderer');
ok('Token: nicht im State, nicht im Projekt, nicht im Log; Electron verschluesselt mit safeStorage');

console.log(`\nGeraetebibliothek: ${n} Zusagen gehalten.`);
