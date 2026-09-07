// ───────────────────────────────────────────────────────────────────────────
// Ein Universe ist keine blosse Zahl (Bedarf 147, P4).
//
//   > Node/gateway protocol setup, unicast IPs and universe mapping are
//   > configured by hand in at least two places and documented in a third.
//   > […] Art-Net Net/Sub-Net/Universe versus A FLAT UNIVERSE NUMBER IS 'THE
//   > CLASSIC PATCH ERROR', and an sACN universe number IS NOT THE SAME FIELD
//   > as an Art-Net one.
//
// Belege: `mvrdevelopment/spec#94` (eröffnet 2021-07-29, in den MVR-1.6-Meilen-
// stein aufgenommen) und die Fehlerbeschreibung aus dem showstack-Datensatz.
// Die Empfehlung der Bedarfs-Datenbank ist eine einzige Modellierungs-
// entscheidung: „Model universe identity explicitly as protocol plus
// port-address, not as a bare integer, and render BOTH the Art-Net and sACN
// readings in the patch sheet."
//
// ─── WARUM EINE ZAHL NICHT REICHT ──────────────────────────────────────────
//
// Der Plan führt `universe: number`. Auf einem Blatt steht dann „Universe 2",
// und drei Leute lesen drei Dinge:
//
//   * sACN:      Universe 2 — eine flache Zahl von 1 bis 63999.
//   * Art-Net:   Port-Address 2 = Net 0, Sub-Net 0, Universe 2 — und die
//                Beschriftung am Gateway lautet dort „0:0:2".
//   * Art-Net,   wer „Universe" am Node einstellt, meint oft NUR die unteren
//     falsch:    vier Bit und lässt Net und Sub-Net auf 0 — was bei
//                Port-Address 17 aufwärts nicht mehr dasselbe ist.
//
// Die Zahl ist also nicht falsch, sie ist UNBESTIMMT. Dieses Modul macht sie
// bestimmt: das Projekt sagt, welches Protokoll gilt, und das Blatt zeigt
// beide Lesarten nebeneinander. Wer sie nebeneinander sieht, macht den Fehler
// nicht.
//
// ─── KEINE MIGRATION, UND DAS MIT ABSICHT ──────────────────────────────────
//
// `PlacedFixture.universe` bleibt eine Zahl. Sie in ein Objekt zu verwandeln
// hiesse, jede vorhandene Projektdatei umzuschreiben, jeden Vergleich, jeden
// Export — für eine Angabe, die als Zahl vollkommen genügt, SOBALD DANEBEN
// STEHT, WIE SIE ZU LESEN IST. Was fehlte, war nie ein zweites Feld an der
// Leuchte, sondern die Auskunft am Projekt.
//
// REIN: keine Datei, kein Netz, keine Uhr.
// ───────────────────────────────────────────────────────────────────────────

/** Welches Protokoll die Universe-Zahlen dieses Plans meinen. */
export type DmxProtocol = 'artnet' | 'sacn';

export const PROTOCOL_LABEL: Readonly<Record<DmxProtocol, string>> = {
  artnet: 'Art-Net',
  sacn: 'sACN (E1.31)',
};

/**
 * Was das Projekt annimmt, solange niemand etwas gesagt hat.
 *
 * sACN, und zwar aus einem nachprüfbaren Grund: seine Universe-Zählung
 * beginnt bei 1 und ist flach — genau so, wie `autoPatch` die Zahlen vergibt
 * (`startUniverse` 1, dann aufwärts). Art-Net als Vorgabe würde behaupten,
 * die 1 sei die Port-Address 1, und das ist eine Aussage über eine
 * Gateway-Einstellung, die niemand gemacht hat.
 */
export const DEFAULT_PROTOCOL: DmxProtocol = 'sacn';

/** Grenzen, an denen eine Zahl aufhört, ein Universe zu sein. */
export const SACN_MIN = 1;
export const SACN_MAX = 63999;
/** Art-Net Port-Address: 15 Bit, also 0..32767 (Net 0-127, Sub-Net 0-15, Universe 0-15). */
export const ARTNET_MIN = 0;
export const ARTNET_MAX = 32767;

export interface ArtnetParts {
  net: number;
  subnet: number;
  universe: number;
}

/**
 * Die drei Art-Net-Felder aus einer Port-Address.
 *
 * `null`, wenn die Zahl keine Port-Address sein kann. Kein Zurechtbiegen: ein
 * geklemmter Wert stünde als „0:0:15" auf dem Blatt, und jemand stellte ihn
 * so am Gateway ein.
 */
export function artnetParts(portAddress: number): ArtnetParts | null {
  if (!Number.isInteger(portAddress)) return null;
  if (portAddress < ARTNET_MIN || portAddress > ARTNET_MAX) return null;
  return {
    net: (portAddress >> 8) & 0x7f,
    subnet: (portAddress >> 4) & 0x0f,
    universe: portAddress & 0x0f,
  };
}

/** Aus den drei Feldern zurück in die Port-Address. */
export function artnetPortAddress(parts: ArtnetParts): number | null {
  const { net, subnet, universe } = parts;
  if (![net, subnet, universe].every(Number.isInteger)) return null;
  if (net < 0 || net > 127) return null;
  if (subnet < 0 || subnet > 15) return null;
  if (universe < 0 || universe > 15) return null;
  return (net << 8) | (subnet << 4) | universe;
}

/** Was auf dem Blatt steht, wo sich eine Lesart nicht bilden lässt. */
export const NO_READING = 'nicht darstellbar';

/**
 * Die Art-Net-Lesart einer Zahl, so wie sie am Gateway steht.
 *
 * `0:0:2` — Net, Sub-Net, Universe. Genau diese Schreibweise nutzen die
 * Bedienoberflächen der Nodes, und genau ihr Fehlen ist „the classic patch
 * error".
 */
export const artnetReading = (n: number): string => {
  const p = artnetParts(n);
  return p ? `${p.net}:${p.subnet}:${p.universe}` : NO_READING;
};

/** Die sACN-Lesart: die flache Zahl, aber nur wo sie eine sein kann. */
export const sacnReading = (n: number): string =>
  (Number.isInteger(n) && n >= SACN_MIN && n <= SACN_MAX ? String(n) : NO_READING);

/**
 * Wie die Zahl im gewählten Protokoll heisst — und wie sie im anderen hiesse.
 *
 * BEIDE, immer. Der Beleg beschreibt den Fehler als ein Verwechseln zweier
 * Lesarten; ein Blatt, das nur die eine zeigt, kann ihn nicht verhindern, und
 * eines, das die gewählte verschweigt, verwirrt zusätzlich.
 */
export interface UniverseReading {
  /** Die Zahl, wie sie im Plan steht. */
  value: number;
  /** Das gewählte Protokoll. */
  protocol: DmxProtocol;
  /** Die Lesart im gewählten Protokoll. */
  primary: string;
  /** Die Lesart im anderen — zum Danebenhalten. */
  other: string;
  /** Wie das andere Protokoll heisst. */
  otherProtocol: DmxProtocol;
  /**
   * Warum die Zahl in diesem Protokoll nicht geht, oder `null`. Kein
   * stillschweigendes Klemmen: eine Adresse, die es nicht gibt, bekommt einen
   * Satz statt einer erfundenen Zahl.
   */
  problem: string | null;
}

export function universeReading(value: number, protocol: DmxProtocol): UniverseReading {
  const other: DmxProtocol = protocol === 'artnet' ? 'sacn' : 'artnet';
  const lesart = (p: DmxProtocol): string => (p === 'artnet' ? artnetReading(value) : sacnReading(value));

  let problem: string | null = null;
  if (!Number.isInteger(value)) {
    problem = 'Keine ganze Zahl — ein Universe ist keine Nachkommastelle.';
  } else if (protocol === 'artnet' && (value < ARTNET_MIN || value > ARTNET_MAX)) {
    problem = `Art-Net kennt nur Port-Adressen von ${ARTNET_MIN} bis ${ARTNET_MAX} (Net 0-127, Sub-Net 0-15, Universe 0-15).`;
  } else if (protocol === 'sacn' && (value < SACN_MIN || value > SACN_MAX)) {
    problem = `sACN kennt nur Universes von ${SACN_MIN} bis ${SACN_MAX}.`;
  }

  return {
    value,
    protocol,
    primary: lesart(protocol),
    other: lesart(other),
    otherProtocol: other,
    problem,
  };
}

/**
 * Die Stelle, an der die Verwechslung wirklich passiert.
 *
 * Bis Port-Address 15 sind Art-Net und sACN äusserlich gleich — „Universe 3"
 * heisst hier wie dort dasselbe Feld am Gerät. Ab 16 laufen sie auseinander:
 * Art-Net 16 ist Sub-Net 1 / Universe 0, und wer am Node „Universe 16"
 * einstellt, findet dieses Feld gar nicht (es hat nur vier Bit).
 *
 * Genau dort, und nur dort, ist der Hinweis etwas wert. Ein Blatt, das bei
 * jeder Zahl warnt, wird nicht gelesen.
 */
export const READINGS_DIVERGE_ABOVE = 15;

export const readingsDiverge = (value: number): boolean =>
  Number.isInteger(value) && value > READINGS_DIVERGE_ABOVE;

/**
 * Die Universes eines Plans, in fester Reihenfolge, mit beiden Lesarten.
 *
 * Für das Patch-Blatt. Die Reihenfolge hängt an der Zahl und nicht an der
 * Reihenfolge der Leuchten: sonst sähe dasselbe Blatt zweimal anders aus.
 */
export function universeReadings(
  values: readonly (number | undefined)[],
  protocol: DmxProtocol,
): UniverseReading[] {
  const zahlen = [...new Set(values.filter((v): v is number => v !== undefined))];
  zahlen.sort((a, b) => a - b);
  return zahlen.map((v) => universeReading(v, protocol));
}

export const UNIVERSE_HEADERS = ['Universe', 'Art-Net (Net:Sub:Uni)', 'sACN', 'Hinweis'] as const;

/** Was in der Hinweis-Spalte steht, wo es nichts zu sagen gibt. */
export const NO_NOTE = '—';

/**
 * Das Universe-Blatt: eine Zeile je Universe, beide Lesarten nebeneinander.
 *
 * BEIDE Spalten immer, auch die des nicht gewählten Protokolls. Wer das
 * Gateway einstellt, hat oft das andere vor sich — und der Sinn dieses
 * Blattes ist, dass ihm der Unterschied auffällt, bevor er ihn tippt.
 */
export function universeTable(
  readings: readonly UniverseReading[],
): { header: string[]; rows: (string | number)[][] } {
  return {
    header: [...UNIVERSE_HEADERS],
    rows: readings.map((r) => [
      r.value,
      artnetReading(r.value),
      sacnReading(r.value),
      r.problem ?? (readingsDiverge(r.value)
        ? 'Ab hier lesen Art-Net und sACN verschieden — am Node stimmen Net und Sub-Net nicht mehr mit 0.'
        : NO_NOTE),
    ]),
  };
}
