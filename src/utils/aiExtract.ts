// ── KI-gestützte Datenblatt-Extraktion (Anthropic Messages API) ───────
//
// Calls Claude directly from the browser with the user's own API key and a
// forced tool call, so the response is structured JSON we can drop straight
// into the fixture form. Every field comes back with a `source` note so the
// user can verify it against the datasheet before saving — the model is told
// to quote the datasheet or explicitly flag an estimate.

export const AI_MODELS = [
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (genau)' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (schnell)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (günstig)' },
] as const;

export interface ExtractedFields {
  name?: string;
  manufacturer?: string;
  category?: string;
  wattage?: number;
  lumens?: number;
  beamAngle?: number;
  fieldAngle?: number;
  cutoffAngle?: number;
  beamShape?: string;
  lensType?: string;
  hasZoom?: boolean;
  zoomMin?: number;
  zoomMax?: number;
  colorTemp?: number;
  hasColorTempRange?: boolean;
  colorTempMin?: number;
  colorTempMax?: number;
  cri?: number;
  tlci?: number;
  weight?: number;
  mountType?: string;
  ipRating?: string;
  dmxChannels?: number;
  hasPhotometric?: boolean;
  photoLux?: number;
  photoDistance?: number;
}

export interface VerificationItem { field: string; value: string; source: string }

export interface ExtractResult {
  fields: ExtractedFields;
  verification: VerificationItem[];
}

const SYSTEM_PROMPT = `Du bist Assistent für Veranstaltungstechnik und extrahierst aus einem Scheinwerfer-Datenblatt
die für eine Lichtberechnung relevanten Kenndaten. Arbeite ausschließlich mit den Angaben aus dem Text.
Wichtig für die Berechnung sind vor allem: Leistung (W), Lichtstrom (lm) bzw. eine photometrische
Referenz (Lux bei einem bestimmten Abstand in Metern), Abstrahlwinkel (Beam 50% und Field 10%),
Zoom-Bereich, Farbtemperatur bzw. CCT-Bereich, Gewicht (kg) und DMX-Kanäle.
Rechne Einheiten wenn nötig um (z. B. lbs→kg, ft→m). Wenn ein Wert nicht im Datenblatt steht, darfst du
ihn aus anderen Angaben schätzen – kennzeichne das dann in der Quelle eindeutig als „geschätzt".
Gib das Ergebnis ausschließlich über das Tool 'fixture_specs' zurück. Fülle für JEDES gelieferte Feld
einen Eintrag in 'verification' mit Feldname, Wert und Quelle (wörtliches Zitat aus dem Datenblatt
oder kurze Begründung der Schätzung), damit der Nutzer alles überprüfen kann.`;

const TOOL = {
  name: 'fixture_specs',
  description: 'Strukturierte Scheinwerfer-Kenndaten aus dem Datenblatt, mit Quelle je Feld.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Modellbezeichnung' },
      manufacturer: { type: 'string' },
      category: { type: 'string', enum: ['profile', 'fresnel', 'par', 'wash', 'spot', 'beam', 'moving-wash', 'moving-spot', 'moving-beam', 'blinder', 'cyc', 'flood', 'followspot', 'led-panel', 'custom'] },
      wattage: { type: 'number', description: 'Leistungsaufnahme in Watt' },
      lumens: { type: 'number', description: 'Lichtstrom in Lumen' },
      beamAngle: { type: 'number', description: 'Beam-Winkel (50%, FWHM) in Grad – heller Kern' },
      fieldAngle: { type: 'number', description: 'Field-Winkel (10%) in Grad – nutzbarer Rand, größer als Beam' },
      cutoffAngle: { type: 'number', description: 'Cutoff-Winkel (2,5%) in Grad, falls angegeben' },
      beamShape: { type: 'string', enum: ['circular', 'elliptical', 'linear', 'rectangular'] },
      lensType: { type: 'string', enum: ['fixed', 'zoom', 'interchangeable', 'fresnel', 'pc', 'reflector'] },
      hasZoom: { type: 'boolean' },
      zoomMin: { type: 'number', description: 'kleinster Zoom-Winkel in Grad' },
      zoomMax: { type: 'number', description: 'größter Zoom-Winkel in Grad' },
      colorTemp: { type: 'number', description: 'feste Farbtemperatur in Kelvin (0 = RGBW/Full-Color)' },
      hasColorTempRange: { type: 'boolean' },
      colorTempMin: { type: 'number' },
      colorTempMax: { type: 'number' },
      cri: { type: 'number' },
      tlci: { type: 'number' },
      weight: { type: 'number', description: 'Gewicht in kg' },
      mountType: { type: 'string', enum: ['bowens', 'prolock-bowens', 'junior', 'baby', 'clamp', 'yoke', 'none'] },
      ipRating: { type: 'string', description: 'IP-Schutzart, nur Zahl, z. B. 65' },
      dmxChannels: { type: 'number' },
      hasPhotometric: { type: 'boolean', description: 'true, wenn eine Lux@Abstand-Referenz vorliegt' },
      photoLux: { type: 'number', description: 'gemessene Beleuchtungsstärke in Lux' },
      photoDistance: { type: 'number', description: 'Messabstand in Metern' },
      verification: {
        type: 'array',
        description: 'Pro extrahiertem Feld: Quelle/Begründung zur Überprüfung',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            value: { type: 'string' },
            source: { type: 'string', description: 'Zitat aus dem Datenblatt oder „geschätzt: …"' },
          },
          required: ['field', 'value', 'source'],
        },
      },
    },
    required: ['verification'],
  },
} as const;

export async function extractFixtureSpecs(
  datasheet: string,
  opts: { apiKey: string; model: string },
): Promise<ExtractResult> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 2048,
      output_config: { effort: 'medium' },
      // tools render before system → caching the system block caches both.
      tools: [{ ...TOOL, cache_control: { type: 'ephemeral' } }],
      tool_choice: { type: 'tool', name: 'fixture_specs' },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: `Extrahiere die berechnungsrelevanten Kenndaten aus folgendem Datenblatt / dieser Modellbeschreibung:\n\n${datasheet}`,
      }],
    }),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body?.error?.message ? `${body.error.message}` : detail;
    } catch { /* ignore */ }
    if (res.status === 401) throw new Error('API-Schlüssel ungültig (401). Bitte Schlüssel prüfen.');
    if (res.status === 429) throw new Error('Rate-Limit erreicht (429). Bitte kurz warten und erneut versuchen.');
    throw new Error(detail);
  }

  const data = await res.json();
  const toolBlock = (data.content ?? []).find((b: { type: string; name?: string }) => b.type === 'tool_use' && b.name === 'fixture_specs');
  if (!toolBlock) throw new Error('Keine strukturierten Daten erhalten. Bitte erneut versuchen.');

  const input = toolBlock.input as ExtractedFields & { verification?: VerificationItem[] };
  const { verification = [], ...fields } = input;
  return { fields, verification };
}
