import React, { useState } from 'react';
import type { Fixture, FixtureCategory, BeamShape, LensType, MountType } from '../types';
import { extractFixtureSpecs, AI_MODELS, type ExtractedFields, type VerificationItem } from '../utils/aiExtract';
import { useHost } from '../integration/hostContext';

interface Props {
  onSave: (fixture: Fixture) => void;
  onCancel: () => void;
  initial?: Fixture;
}

const FixtureEditor: React.FC<Props> = ({ onSave, onCancel, initial }) => {
  const host = useHost();
  const [name, setName] = useState(initial?.name ?? '');
  const [manufacturer, setManufacturer] = useState(initial?.manufacturer ?? '');
  const [category, setCategory] = useState<FixtureCategory>(initial?.category ?? 'custom');
  const [wattage, setWattage] = useState(initial?.wattage ?? 100);
  const [lumens, setLumens] = useState(initial?.lumens ?? 10000);
  const [beamAngle, setBeamAngle] = useState(initial?.beamAngle ?? 26);
  const [fieldAngle, setFieldAngle] = useState(initial?.fieldAngle ?? 32);
  const [cutoffAngle, setCutoffAngle] = useState(initial?.cutoffAngle ?? 0);
  const [beamShape, setBeamShape] = useState<BeamShape>(initial?.beamShape ?? 'circular');
  const [beamRatioWH, setBeamRatioWH] = useState(initial?.beamRatioWH ?? 1);
  const [lensType, setLensType] = useState<LensType>(initial?.lensType ?? 'pc');
  const [colorTemp, setColorTemp] = useState(initial?.colorTemp ?? 3200);
  const [weight, setWeight] = useState(initial?.weight ?? 5);
  const [hasZoom, setHasZoom] = useState(!!initial?.zoomRange);
  const [zoomMin, setZoomMin] = useState(initial?.zoomRange?.[0] ?? 15);
  const [zoomMax, setZoomMax] = useState(initial?.zoomRange?.[1] ?? 30);
  const [cri, setCri] = useState(initial?.cri ?? 90);
  const [ipRating, setIpRating] = useState(initial?.ipRating ?? '');
  const [dmxChannels, setDmxChannels] = useState(initial?.dmxChannels ?? 1);
  // New fields
  const [mountType, setMountType] = useState<MountType>(initial?.mountType ?? 'clamp');
  const [hasColorTempRange, setHasColorTempRange] = useState(!!initial?.colorTempRange);
  const [colorTempMin, setColorTempMin] = useState(initial?.colorTempRange?.[0] ?? 2700);
  const [colorTempMax, setColorTempMax] = useState(initial?.colorTempRange?.[1] ?? 6500);
  const [hasPhotometric, setHasPhotometric] = useState(!!initial?.photometric);
  const [photoLux, setPhotoLux] = useState(initial?.photometric?.lux ?? 10000);
  const [photoDistance, setPhotoDistance] = useState(initial?.photometric?.distance ?? 1);
  const [tlci, setTlci] = useState(initial?.tlci ?? 0);

  // ── KI-Datenblatt-Extraktion ──
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiKey, setAiKey] = useState('');
  const [aiModel, setAiModel] = useState<string>(AI_MODELS[0].id);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiVerification, setAiVerification] = useState<VerificationItem[] | null>(null);

  const applyExtracted = (f: ExtractedFields) => {
    if (f.name != null) setName(f.name);
    if (f.manufacturer != null) setManufacturer(f.manufacturer);
    if (f.category != null) setCategory(f.category as FixtureCategory);
    if (f.wattage != null) setWattage(f.wattage);
    if (f.lumens != null) setLumens(f.lumens);
    if (f.beamAngle != null) setBeamAngle(f.beamAngle);
    if (f.fieldAngle != null) setFieldAngle(f.fieldAngle);
    if (f.cutoffAngle != null) setCutoffAngle(f.cutoffAngle);
    if (f.beamShape != null) setBeamShape(f.beamShape as BeamShape);
    if (f.lensType != null) setLensType(f.lensType as LensType);
    if (f.hasZoom != null) setHasZoom(f.hasZoom);
    if (f.zoomMin != null) setZoomMin(f.zoomMin);
    if (f.zoomMax != null) setZoomMax(f.zoomMax);
    if (f.hasColorTempRange != null) setHasColorTempRange(f.hasColorTempRange);
    if (f.colorTemp != null) setColorTemp(f.colorTemp);
    if (f.colorTempMin != null) setColorTempMin(f.colorTempMin);
    if (f.colorTempMax != null) setColorTempMax(f.colorTempMax);
    if (f.cri != null) setCri(f.cri);
    if (f.tlci != null) setTlci(f.tlci);
    if (f.weight != null) setWeight(f.weight);
    if (f.mountType != null) setMountType(f.mountType as MountType);
    if (f.ipRating != null) setIpRating(f.ipRating);
    if (f.dmxChannels != null) setDmxChannels(f.dmxChannels);
    if (f.hasPhotometric != null) setHasPhotometric(f.hasPhotometric);
    if (f.photoLux != null) setPhotoLux(f.photoLux);
    if (f.photoDistance != null) setPhotoDistance(f.photoDistance);
  };

  const handleExtract = async () => {
    if (!aiText.trim()) { setAiError('Bitte Datenblatt-Text oder Modellname einfügen.'); return; }
    if (!aiKey.trim()) { setAiError('Bitte Anthropic API-Schlüssel eingeben.'); return; }
    setAiLoading(true); setAiError(null);
    try {
      // Use the host's AI service when it provides one (e.g. Cable-Planner's
      // multi-provider aiSuggestions + keychain); else the direct browser call.
      const extract = host.extractDatasheet ?? extractFixtureSpecs;
      const { fields, verification } = await extract(aiText, { apiKey: aiKey.trim(), model: aiModel });
      applyExtracted(fields);
      setAiVerification(verification);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const fixture: Fixture = {
      id: initial?.id ?? 'custom-' + Date.now(),
      name: name.trim(),
      manufacturer: manufacturer.trim() || 'Custom',
      category,
      wattage,
      lumens,
      beamAngle,
      fieldAngle: fieldAngle || beamAngle + 6,
      cutoffAngle: cutoffAngle || undefined,
      beamShape,
      beamRatioWH,
      lensType,
      colorTemp: hasColorTempRange ? 0 : colorTemp,
      colorTempRange: hasColorTempRange ? [colorTempMin, colorTempMax] : undefined,
      weight,
      mountType,
      zoomRange: hasZoom ? [zoomMin, zoomMax] : undefined,
      cri,
      tlci: tlci || undefined,
      ipRating: ipRating || undefined,
      dmxChannels: dmxChannels || undefined,
      photometric: hasPhotometric ? { lux: photoLux, distance: photoDistance, beamAngle, colorTemp: colorTemp || 5600 } : undefined,
    };
    onSave(fixture);
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal fixture-editor-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial ? 'Leuchte bearbeiten' : 'Eigene Leuchte anlegen'}</h3>

        <div className="ai-assist">
          <button type="button" className={`ai-toggle ${aiOpen ? 'open' : ''}`} onClick={() => setAiOpen((o) => !o)}>
            ✨ KI-Assistent – Daten aus Datenblatt ziehen {aiOpen ? '▾' : '▸'}
          </button>
          {aiOpen && (
            <div className="ai-body">
              <textarea
                className="ai-textarea"
                rows={5}
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                placeholder={'Datenblatt-Text hier einfügen – oder einfach das Modell nennen, z. B. Elation KL Profile FC …'}
              />
              <div className="ai-controls">
                <input
                  className="ai-key"
                  type="password"
                  value={aiKey}
                  onChange={(e) => setAiKey(e.target.value)}
                  placeholder="Anthropic API-Schlüssel (sk-ant-…)"
                />
                <select value={aiModel} onChange={(e) => setAiModel(e.target.value)}>
                  {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                <button type="button" className="primary" disabled={aiLoading} onClick={handleExtract}>
                  {aiLoading ? 'Extrahiere…' : 'Daten extrahieren'}
                </button>
              </div>
              <div className="ai-note">
                Der Schlüssel wird nur für diese Sitzung im Arbeitsspeicher gehalten und nicht gespeichert.
                Er geht direkt an api.anthropic.com. Bitte alle übernommenen Werte unten prüfen.
              </div>
              {aiError && <div className="ai-error">⚠ {aiError}</div>}
              {aiVerification && (
                <div className="ai-verify">
                  <div className="ai-verify-head">✓ Übernommen – bitte prüfen ({aiVerification.length} Felder):</div>
                  <table className="ai-verify-table">
                    <thead><tr><th>Feld</th><th>Wert</th><th>Quelle / Begründung</th></tr></thead>
                    <tbody>
                      {aiVerification.map((v, i) => (
                        <tr key={i} className={/gesch/i.test(v.source) ? 'ai-est' : ''}>
                          <td>{v.field}</td><td>{v.value}</td><td>{v.source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="editor-grid">
          <label>Name*<input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. PAR 64 CP62" /></label>
          <label>Hersteller<input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="z.B. Generic" /></label>

          <label>Kategorie
            <select value={category} onChange={(e) => setCategory(e.target.value as FixtureCategory)}>
              <option value="profile">Profilscheinwerfer</option>
              <option value="fresnel">Stufenlinse</option>
              <option value="par">PAR</option>
              <option value="wash">LED Wash</option>
              <option value="spot">LED Spot</option>
              <option value="beam">Beam</option>
              <option value="moving-wash">Moving Head Wash</option>
              <option value="moving-spot">Moving Head Spot</option>
              <option value="moving-beam">Moving Head Beam</option>
              <option value="blinder">Blinder</option>
              <option value="cyc">Horizontleuchte</option>
              <option value="flood">Fluter</option>
              <option value="followspot">Verfolger</option>
              <option value="led-panel">LED-Flächenleuchte</option>
              <option value="custom">Eigene</option>
            </select>
          </label>

          <label>Befestigung
            <select value={mountType} onChange={(e) => setMountType(e.target.value as MountType)}>
              <option value="bowens">Bowens S-Mount</option>
              <option value="prolock-bowens">ProLock Bowens</option>
              <option value="junior">Junior Pin (1-1/8")</option>
              <option value="baby">Baby Pin (5/8")</option>
              <option value="clamp">C-Clamp / Bügelklemme</option>
              <option value="yoke">Integriertes Joch</option>
              <option value="none">Kein Ansatz</option>
            </select>
          </label>

          <label>Leistung (W)<input type="number" value={wattage} onChange={(e) => setWattage(Number(e.target.value))} min={1} /></label>
          <label>Lichtstrom (lm)<input type="number" value={lumens} onChange={(e) => setLumens(Number(e.target.value))} min={1} /></label>

          <label title="Heller Kern: Winkel, bei dem die Intensität auf 50 % des Maximums fällt (FWHM).">Beam-Winkel 50 % (°)<input type="number" value={beamAngle} step={0.5} onChange={(e) => setBeamAngle(Number(e.target.value))} min={1} max={180} /></label>
          <label title="Nutzbarer Rand: bei 10 % des Maximums. Immer größer als der Beam-Winkel.">Field-Winkel 10 % (°)<input type="number" value={fieldAngle} step={0.5} onChange={(e) => setFieldAngle(Number(e.target.value))} min={1} max={180} /></label>
          <label title="Wo das Licht praktisch endet (2,5 %). Optional – 0 = nicht angegeben.">Cutoff 2,5 % (°)<input type="number" value={cutoffAngle} step={0.5} onChange={(e) => setCutoffAngle(Number(e.target.value))} min={0} max={180} /></label>
          <div className="editor-note">Beam (50 %) &lt; Field (10 %) &lt; Cutoff (2,5 %). Der <b>Zoom</b> (unten) ist der einstellbare Beam-Winkel-Bereich – etwas anderes als Beam/Field.</div>

          <label>Strahlform
            <select value={beamShape} onChange={(e) => setBeamShape(e.target.value as BeamShape)}>
              <option value="circular">Kreisförmig</option>
              <option value="elliptical">Elliptisch</option>
              <option value="linear">Linear</option>
              <option value="rectangular">Rechteckig</option>
            </select>
          </label>

          {beamShape !== 'circular' && (
            <label>Beam W:H-Verhältnis<input type="number" value={beamRatioWH} step={0.1} onChange={(e) => setBeamRatioWH(Number(e.target.value))} min={0.1} max={10} /></label>
          )}

          <label>Linsentyp
            <select value={lensType} onChange={(e) => setLensType(e.target.value as LensType)}>
              <option value="fixed">Fest</option>
              <option value="zoom">Zoom</option>
              <option value="interchangeable">Wechselbar</option>
              <option value="fresnel">Fresnel</option>
              <option value="pc">Plano-Convex (PC)</option>
              <option value="reflector">Reflektor</option>
            </select>
          </label>

          <label className="checkbox-field">
            <input type="checkbox" checked={hasColorTempRange} onChange={(e) => setHasColorTempRange(e.target.checked)} /> Farbtemperatur-Bereich (Bi-Color)
          </label>
          {hasColorTempRange ? (
            <>
              <label>CCT Min (K)<input type="number" value={colorTempMin} onChange={(e) => setColorTempMin(Number(e.target.value))} min={1800} max={10000} /></label>
              <label>CCT Max (K)<input type="number" value={colorTempMax} onChange={(e) => setColorTempMax(Number(e.target.value))} min={1800} max={10000} /></label>
            </>
          ) : (
            <label>Farbtemperatur (K, 0=RGBW)<input type="number" value={colorTemp} onChange={(e) => setColorTemp(Number(e.target.value))} min={0} /></label>
          )}

          <label>Gewicht (kg)<input type="number" value={weight} step={0.1} onChange={(e) => setWeight(Number(e.target.value))} min={0} /></label>
          <label>CRI<input type="number" value={cri} onChange={(e) => setCri(Number(e.target.value))} min={0} max={100} /></label>
          <label>TLCI<input type="number" value={tlci} onChange={(e) => setTlci(Number(e.target.value))} min={0} max={100} /></label>
          <label>IP-Schutzart<input value={ipRating} onChange={(e) => setIpRating(e.target.value)} placeholder="z.B. 65" /></label>
          <label>DMX-Kanäle<input type="number" value={dmxChannels} onChange={(e) => setDmxChannels(Number(e.target.value))} min={0} /></label>

          <label className="checkbox-field">
            <input type="checkbox" checked={hasZoom} onChange={(e) => setHasZoom(e.target.checked)} /> Zoom
          </label>
          {hasZoom && (
            <>
              <label>Zoom Min (°)<input type="number" value={zoomMin} step={0.5} onChange={(e) => setZoomMin(Number(e.target.value))} min={1} /></label>
              <label>Zoom Max (°)<input type="number" value={zoomMax} step={0.5} onChange={(e) => setZoomMax(Number(e.target.value))} min={1} /></label>
            </>
          )}

          <label className="checkbox-field">
            <input type="checkbox" checked={hasPhotometric} onChange={(e) => setHasPhotometric(e.target.checked)} /> Photometrische Referenz
          </label>
          {hasPhotometric && (
            <>
              <label>Lux (gemessen)<input type="number" value={photoLux} onChange={(e) => setPhotoLux(Number(e.target.value))} min={1} /></label>
              <label>Messabstand (m)<input type="number" value={photoDistance} step={0.5} onChange={(e) => setPhotoDistance(Number(e.target.value))} min={0.5} /></label>
            </>
          )}
        </div>

        <div className="modal-actions">
          <button onClick={onCancel}>Abbrechen</button>
          <button className="primary" onClick={handleSave} disabled={!name.trim()}>Speichern</button>
        </div>
      </div>
    </div>
  );
};

export default FixtureEditor;
