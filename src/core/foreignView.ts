// ───────────────────────────────────────────────────────────────────────────
// Read-only Ansicht fremder .avplan-Domaenen (Light-Seite).
//
// Light bearbeitet die Kameras nicht, soll sie aber EINSEHEN koennen: aus der
// verlustfrei mitgefuehrten "cameras"-Domaene (MultiCam ProjectFile) werden die
// platzierten Kameras defensiv extrahiert und im 2D-Plan als read-only Marker
// gezeigt. Die Domaene ist `unknown` → robust, wirft nie.
// ───────────────────────────────────────────────────────────────────────────

export interface ForeignCamera {
  id: string;
  x: number;
  y: number;
  label?: string;
  pan?: number;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Extrahiert platzierte Kameras aus einer fremden cameras-Domaene (MultiCam). */
export function foreignCamerasFrom(cameras: unknown): ForeignCamera[] {
  const list = (cameras as { cameras?: unknown } | null | undefined)?.cameras;
  if (!Array.isArray(list)) return [];
  const out: ForeignCamera[] = [];
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const o = c as Record<string, unknown>;
    const x = num(o.x);
    const y = num(o.y);
    if (x === undefined || y === undefined) continue;
    out.push({
      id: String(o.id ?? ''),
      x, y,
      label: typeof o.label === 'string' ? o.label : undefined,
      pan: num(o.pan),
    });
  }
  return out;
}
