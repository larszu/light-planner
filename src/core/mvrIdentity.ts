// ───────────────────────────────────────────────────────────────────────────
// Austauschdateien, die an einer Umbenennung nicht zerbrechen (Bedarf 144, P4).
//
//   > Documented failure modes, all mundane and all silent: renaming the .vwx
//   > leaves the paperwork reading a stale .xml; NON-UNIQUE UIDS MAKE A DELETED
//   > FIXTURE REAPPEAR; 'one undefined or corrupted character in a data field
//   > can invalidate the whole exchange .xml'; backslashes in Mac folder names…
//
// Belege: `showstack`-Datenblatt zu Lightwright (John McKernon Software,
// abgerufen 2026-08-17), `PeramatoG/Perastage#2157` (2026-07-27) und `#2233`.
// Die Empfehlung der Bedarfs-Datenbank: „Path-independent references, STABLE
// INTERNAL UUIDS SURVIVING RELOAD, case-normalised asset caching, tolerant
// parsing with visible warnings."
//
// ─── ZWEI GEMESSENE DEFEKTE ────────────────────────────────────────────────
//
// Gemessen am 2026-09-06 an `buildSceneDescription`:
//
//  1. DERSELBE PLAN ERGAB ZWEIMAL VERSCHIEDENE UUIDs. `fixtureXml` rief bei
//     jedem Export `uuid()` neu auf. Wer eine geänderte `.mvr` nachimportiert,
//     bekommt damit KEINE Aktualisierung, sondern lauter neue Objekte: die
//     alten bleiben stehen, die neuen kommen dazu. Genau der Befund aus dem
//     Beleg — „a deleted fixture reappears" —, nur von der anderen Seite.
//
//  2. ZWEI TYPEN, EIN DATEINAME. „Source/Four" und „Source:Four" wurden beide
//     zu `ETC_Source_Four.gdtf`; der Importer bekam für zwei verschiedene
//     Geräte denselben Bezug, ohne ein Wort. Dasselbe gilt für Namen, die sich
//     nur in der Gross-/Kleinschreibung unterscheiden: auf einem
//     Mac-Dateisystem sind sie dieselbe Datei.
//
// ─── WARUM ABGELEITET UND NICHT GESPEICHERT ────────────────────────────────
//
// Eine gespeicherte `mvrUuid` je Leuchte wäre ein neues Feld, eine Migration
// und ein zweiter Ort, an dem eine Identität liegt — und sie ginge verloren,
// sobald jemand die Leuchte kopiert. Abgeleitet aus der id, die das Projekt
// ohnehin führt, überlebt sie das Speichern, das Neuladen und den Export von
// einem anderen Rechner: dieselbe Leuchte, dieselbe UUID.
//
// REIN: keine Datei, kein Netz, keine Uhr, kein Zufall.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Eine stabile UUID aus einem Text.
 *
 * VERSION 8, und das mit Absicht. RFC 9562 hält Version 8 für eigene,
 * herstellerdefinierte Layouts frei — genau das ist hier der Fall. Eine 4
 * hineinzuschreiben („zufällig erzeugt") wäre eine Aussage über die Herkunft
 * dieser Bytes, die nicht stimmt: sie sind ausgerechnet, nicht gewürfelt. Für
 * einen Importer zählt, dass die Zeichenkette eindeutig und stabil ist; die
 * Versionsziffer soll trotzdem die Wahrheit sagen.
 *
 * Der Hash ist FNV-1a in vier Durchgängen mit verschiedenen Startwerten. Er
 * ist NICHT kryptographisch, und das muss er auch nicht sein: hier soll sich
 * niemand ausweisen, hier sollen zwei verschiedene Leuchten verschiedene
 * Namen tragen.
 */
export function stableUuid(seed: string): string {
  const bytes = new Uint8Array(16);
  // Vier unabhängige FNV-1a-Durchgänge, jeder mit einem eigenen Offset-Basis.
  // Ein einzelner 32-Bit-Hash, viermal wiederholt, ergäbe vier gleiche Blöcke.
  const basen = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  for (let k = 0; k < 4; k += 1) {
    let h = basen[k] >>> 0;
    for (let i = 0; i < seed.length; i += 1) {
      h ^= seed.charCodeAt(i) & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
      // Die zweite Hälfte des Zeichens (Unicode über 255) geht mit ein, sonst
      // wären „Röhre" und „Rhre" derselbe Wert.
      h ^= (seed.charCodeAt(i) >>> 8) & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    bytes[k * 4] = (h >>> 24) & 0xff;
    bytes[k * 4 + 1] = (h >>> 16) & 0xff;
    bytes[k * 4 + 2] = (h >>> 8) & 0xff;
    bytes[k * 4 + 3] = h & 0xff;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x80; // Version 8
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variante RFC 9562
  const h = [...bytes].map((x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`;
}

/**
 * Die UUID einer Leuchte in der MVR.
 *
 * Der Namensraum steht im Text: zwei Projekte mit derselben Leuchten-id
 * bekämen sonst dieselbe UUID, und wer beide in einen Visualisierer lädt,
 * sieht eine Leuchte statt zweier.
 */
export const fixtureUuid = (projectId: string, fixtureId: string): string =>
  stableUuid(`lightplanner:fixture:${projectId}:${fixtureId}`);

/** Dieselbe Regel für die Ebene. */
export const layerUuid = (projectId: string, layerName: string): string =>
  stableUuid(`lightplanner:layer:${projectId}:${layerName}`);

// ─── GDTF-Dateinamen ohne stille Kollision ─────────────────────────────────

/** Was aus einem Namen im Dateisystem werden darf. */
const sanitize = (s: string): string => s.replace(/[\\/:*?"<>|@]+/g, '_').trim() || 'Fixture';

/**
 * Schlüssel für „derselbe Gerätetyp".
 *
 * Kleingeschrieben, denn auf einem Mac- oder Windows-Dateisystem sind
 * `S4.gdtf` und `s4.gdtf` dieselbe Datei. Ein Export, der beide schreibt,
 * überschreibt sich selbst — und das fällt erst dem auf, der die Datei
 * öffnet.
 */
const fileKey = (name: string): string => sanitize(name).toLowerCase();

export interface SpecCollision {
  /** Der Dateiname, auf den mehrere Typen fielen. */
  file: string;
  /** Die Typen, die darauf fielen — in der Reihenfolge ihres Auftretens. */
  types: string[];
}

export interface GdtfSpecNames {
  /** Typ-Schlüssel (`manufacturer@name`) → Dateiname mit `.gdtf`. */
  byType: Map<string, string>;
  /**
   * Wo mehrere Typen auf denselben Namen fielen. Sie bekommen einen
   * eindeutigen Namen — aber es steht dabei, denn ein Importer, der beide
   * Typen aus seiner Bibliothek zieht, findet nur einen davon wieder.
   */
  collisions: SpecCollision[];
}

/**
 * Deterministische, kollisionsfreie GDTF-Dateinamen.
 *
 * Die Nummerierung hängt an der Reihenfolge des ERSTEN Auftretens, nicht an
 * einem Zähler über alle Leuchten: sonst verschöbe sich jeder Name, sobald
 * jemand eine Lampe löscht, und die nächste `.mvr` beschriebe dieselbe Anlage
 * mit anderen Bezügen.
 */
export function gdtfSpecNames(
  types: ReadonlyArray<{ manufacturer: string; name: string }>,
): GdtfSpecNames {
  const byType = new Map<string, string>();
  const belegt = new Map<string, string[]>();

  for (const t of types) {
    const typeKey = `${t.manufacturer}@${t.name}`;
    if (byType.has(typeKey)) continue;
    const basis = sanitize(typeKey);
    const key = fileKey(typeKey);
    const schon = belegt.get(key) ?? [];
    // Der erste behält den Namen; jeder weitere bekommt eine Endung. So
    // bleibt der Name eines vorhandenen Typs stabil, wenn ein zweiter
    // dazukommt.
    const datei = schon.length === 0 ? `${basis}.gdtf` : `${basis}-${schon.length + 1}.gdtf`;
    schon.push(typeKey);
    belegt.set(key, schon);
    byType.set(typeKey, datei);
  }

  const collisions: SpecCollision[] = [];
  for (const [key, liste] of belegt) {
    if (liste.length > 1) collisions.push({ file: `${key}.gdtf`, types: liste });
  }
  return { byType, collisions };
}
