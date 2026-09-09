// Lager / Bestand — schlanke Light-Planner-Ansicht. Teilt das portable
// `avplan-inventory`-Format mit cable- und multicam-planner (verlustfreier
// Austausch inkl. Lagerorte/Cases/Einheiten via Import).
import React, { useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { useTranslation } from '../i18n';
import { useInventoryStore, type InventoryItemInput } from './store';
import { serializeInventory, parseInventory, resolveInventoryCode, unitLabel } from './portable';
import type { InventorySnapshot } from './portable';
import {
  VORSCHAU_SORTEN,
  importVorschau,
  vorschauIstLeer,
  vorschauSumme,
  type ImportMode,
  type VorschauSorte,
} from './importPreview';
import type { InventoryItem } from './types';

interface Props {
  onClose: () => void;
}

type FormState = InventoryItemInput & { id?: string };

const cell: React.CSSProperties = { padding: '5px 8px', borderTop: '1px solid var(--lp-border, #333)' };
const zahl: React.CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

/**
 * Deutsche Beschriftung je Datensatz-Sorte.
 *
 * `satisfies Record<VorschauSorte, string>`: kommt eine fünfte Sorte dazu, ist
 * das hier ein Typfehler und keine leere Zelle in der Vorschau.
 */
const SORTEN_LABEL = {
  items: 'Artikel',
  nodes: 'Lagerorte / Cases',
  sets: 'Sets',
  units: 'Einheiten',
} satisfies Record<VorschauSorte, string>;
const inp: React.CSSProperties = { width: '100%', padding: '6px', background: 'var(--lp-input-bg, #1a1a1a)', border: '1px solid var(--lp-border, #333)', borderRadius: 4, color: 'inherit' };

const InventoryDialog: React.FC<Props> = ({ onClose }) => {
  const { t } = useTranslation();
  const items = useInventoryStore((s) => s.items);
  const nodes = useInventoryStore((s) => s.nodes);
  const sets = useInventoryStore((s) => s.sets);
  const units = useInventoryStore((s) => s.units);
  const addItem = useInventoryStore((s) => s.addItem);
  const updateItem = useInventoryStore((s) => s.updateItem);
  const removeItem = useInventoryStore((s) => s.removeItem);
  const exportSnapshot = useInventoryStore((s) => s.exportSnapshot);
  const importSnapshot = useInventoryStore((s) => s.importSnapshot);

  const [form, setForm] = useState<FormState | null>(null);
  const [scan, setScan] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  /** Gelesene, noch nicht geschriebene Import-Datei samt gewähltem Modus. */
  const [pending, setPending] = useState<{ snap: InventorySnapshot; mode: ImportMode } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Die Vorschau rechnet gegen den JETZIGEN Bestand — nicht gegen den vom
  // Zeitpunkt des Dateiöffnens. Wer nebenbei einen Artikel anlegt, sieht die
  // Zahlen mitgehen, statt eine Vorschau zu bestätigen, die nicht mehr gilt.
  const vorschau = useMemo(
    () => (pending ? importVorschau({ items, nodes, sets, units }, pending.snap, pending.mode) : null),
    [pending, items, nodes, sets, units],
  );
  const summe = vorschau ? vorschauSumme(vorschau) : null;

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.model.localeCompare(b.model, undefined, { sensitivity: 'base' })),
    [items],
  );

  const save = () => {
    if (!form || form.model.trim() === '') return;
    const payload: InventoryItemInput = {
      model: form.model.trim(),
      manufacturer: form.manufacturer?.trim() || undefined,
      category: form.category?.trim() || undefined,
      quantity: Number.isFinite(form.quantity) ? Math.max(0, Math.round(form.quantity)) : 0,
      code: form.code?.trim() || undefined,
      codeType: form.code?.trim() ? form.codeType ?? 'qr' : undefined,
      ownership: form.ownership,
    };
    if (form.id) updateItem(form.id, payload);
    else addItem(payload);
    setForm(null);
  };

  const doExport = () => {
    const json = serializeInventory(exportSnapshot(), { app: 'light-planner' });
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lager.avinv.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // E-15 (B-22): der Import ging über ein `window.confirm`, das „ERSETZEN?
  // Abbrechen = zusammenführen" fragte. Abbrechen führte also ZUSAMMEN — an
  // dieser Stelle gab es keinen Weg, gar nichts zu tun —, und die Frage stand
  // ohne eine einzige Zahl daneben. Der Bestand ist projektübergreifend und
  // hat kein Undo; „ersetzen" konnte damit hunderte Positionen löschen, die
  // der Nutzer nie gesehen hat. Jetzt liegt die Datei zuerst hier und wird
  // erst mit dem bestätigten Modus geschrieben.
  const doImport = async (file: File) => {
    const snap = parseInventory(await file.text());
    if (!snap) {
      setMsg(t('inventory.importErr', 'Not a valid inventory file (avplan-inventory).'));
      return;
    }
    // Vorbelegung ist die harmlose der beiden Antworten: `merge` nimmt nichts
    // weg. Eine Vorbelegung auf `replace` wäre eine Entscheidung, die niemand
    // getroffen hat.
    setPending({ snap, mode: 'merge' });
    setMsg(null);
  };

  const doImportConfirm = () => {
    if (!pending) return;
    const n = importSnapshot(pending.snap, pending.mode);
    setPending(null);
    // „Importiert" ist erst wahr, wenn es auch geschrieben wurde. Vorher
    // meldete der Dialog den Erfolg, während der volle localStorage den
    // Bestand still verwarf — sichtbar wurde das beim nächsten Start.
    setMsg(
      useInventoryStore.getState().storageFull
        ? t(
            'inventory.importFull',
            '{n} objects read but NOT saved: local storage is full. Free some space, then import again.',
          ).replace('{n}', String(n))
        : t('inventory.importDone', '{n} items imported.').replace('{n}', String(n)),
    );
  };

  const doScan = () => {
    const code = scan.trim();
    if (!code) return;
    const m = resolveInventoryCode(code, { items, nodes, units });
    if (!m) setMsg(t('inventory.scanNone', 'No match.'));
    else if (m.kind === 'item') {
      setMsg(`${t('inventory.item', 'Item')}: ${m.item.model}`);
      setForm({ ...m.item });
    } else if (m.kind === 'node') setMsg(`${t('inventory.location', 'Location')}: ${m.node.name}`);
    else setMsg(`${t('inventory.unit', 'Unit')}: ${unitLabel(m.unit)}`);
    setScan('');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(760px, 94vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>{t('inventory.title', 'Inventory')}</h2>
          <button onClick={onClose} aria-label={t('about.close', 'Close')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
            <span style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}><Icon name="search" size={13} /></span>
            <input value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doScan()}
              placeholder={t('inventory.scanPh', 'Scan / enter code…')} style={{ ...inp, paddingLeft: 26 }} />
          </div>
          <button onClick={doScan}>{t('inventory.scan', 'Resolve')}</button>
          <button onClick={doExport} title={t('inventory.exportHint', 'Export across apps')}><Icon name="export" size={13} /> {t('inventory.export', 'Export')}</button>
          <button onClick={() => fileRef.current?.click()}><Icon name="import" size={13} /> {t('inventory.import', 'Import')}</button>
          <button className="primary" onClick={() => setForm({ model: '', quantity: 1 })}><Icon name="plus" size={13} /> {t('inventory.add', 'Item')}</button>
        </div>
        {msg && <div style={{ ...cell, borderTop: 'none', background: 'var(--lp-input-bg,#1a1a1a)', borderRadius: 4, marginBottom: 8 }}>{msg}</div>}

        {pending && vorschau && summe && (
          <div style={{ border: '1px solid var(--lp-border, #333)', borderRadius: 6, padding: 10, marginBottom: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('inventory.previewTitle', 'What this import changes')}</div>

            {/* Der Modus steht ÜBER der Tabelle: das Umschalten rechnet sie neu,
                und genau dieser Vergleich ist die Entscheidung. */}
            <div role="radiogroup" aria-label={t('inventory.previewTitle', 'What this import changes')} style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {(['merge', 'replace'] as ImportMode[]).map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={pending.mode === m}
                  className={pending.mode === m ? 'primary' : undefined}
                  onClick={() => setPending({ ...pending, mode: m })}
                >
                  {m === 'merge'
                    ? t('inventory.previewMerge', 'Merge')
                    : t('inventory.previewReplace', 'Replace')}
                </button>
              ))}
              <span style={{ opacity: 0.7, alignSelf: 'center', fontSize: 12 }}>
                {pending.mode === 'merge'
                  ? t('inventory.previewMergeHint', 'Carried forward — nothing is dropped.')
                  : t('inventory.previewReplaceHint', 'The existing inventory is discarded.')}
              </span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', opacity: 0.75 }}>
                  <th style={{ padding: '4px 8px' }} />
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>{t('inventory.previewNew', 'new')}</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>{t('inventory.previewChanged', 'changed')}</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>{t('inventory.previewSame', 'unchanged')}</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>
                    {pending.mode === 'replace'
                      ? t('inventory.previewRemoved', 'dropped')
                      : t('inventory.previewUntouched', 'kept')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {VORSCHAU_SORTEN.map((sorte: VorschauSorte) => (
                  <tr key={sorte}>
                    <td style={cell}>{t(`inventory.sorte.${sorte}`, SORTEN_LABEL[sorte])}</td>
                    <td style={zahl}>{vorschau[sorte].neu.length}</td>
                    <td style={zahl}>{vorschau[sorte].geaendert.length}</td>
                    <td style={zahl}>{vorschau[sorte].gleich.length}</td>
                    <td style={{ ...zahl, color: pending.mode === 'replace' && vorschau[sorte].entfernt.length > 0 ? 'var(--lp-danger, #f87171)' : undefined }}>
                      {pending.mode === 'replace' ? vorschau[sorte].entfernt.length : vorschau[sorte].unberuehrt.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Die eine Zahl, die nicht rückgängig zu machen ist, wird
                ausgeschrieben statt nur in einer Spalte zu stehen. */}
            {summe.entfernt > 0 && (
              <div style={{ marginTop: 8, color: 'var(--lp-danger, #f87171)' }}>
                {t('inventory.previewRemoves', '{n} existing records will be dropped. This cannot be undone.').replace('{n}', String(summe.entfernt))}
              </div>
            )}
            {vorschauIstLeer(vorschau) && (
              <div style={{ marginTop: 8, opacity: 0.8 }}>
                {t('inventory.previewNothing', 'This file changes nothing in the inventory.')}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button onClick={() => setPending(null)}>{t('inventory.previewCancel', 'Cancel')}</button>
              <button className="primary" onClick={doImportConfirm}>
                {t('inventory.previewApply', 'Import')}
              </button>
            </div>
          </div>
        )}

        {form && (
          <div style={{ border: '1px solid var(--lp-accent,#5b9)', borderRadius: 6, padding: 12, marginBottom: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{form.id ? t('inventory.edit', 'Edit item') : t('inventory.new', 'New item')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <label>{t('inventory.model', 'Model')} *<input autoFocus value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} style={inp} /></label>
              <label>{t('inventory.manufacturer', 'Manufacturer')}<input value={form.manufacturer ?? ''} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} style={inp} /></label>
              <label>{t('inventory.quantity', 'Quantity')}<input type="number" min={0} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} style={inp} /></label>
              <label>{t('inventory.code', 'Code')}<input value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value })} style={inp} /></label>
              <label>{t('inventory.ownership', 'Ownership')}
                <select value={form.ownership ?? ''} onChange={(e) => setForm({ ...form, ownership: (e.target.value || undefined) as InventoryItem['ownership'] })} style={inp}>
                  <option value="">—</option>
                  <option value="owned">{t('inventory.owned', 'Owned')}</option>
                  <option value="rented">{t('inventory.rented', 'Rented')}</option>
                  <option value="subhire">{t('inventory.subhire', 'Sub-hire')}</option>
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button onClick={() => setForm(null)}>{t('common.cancel', 'Cancel')}</button>
              <button className="primary" disabled={form.model.trim() === ''} onClick={save}>{t('common.save', 'Save')}</button>
            </div>
          </div>
        )}

        <div style={{ overflow: 'auto', flex: 1 }}>
          {sorted.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', opacity: 0.6 }}>
              {t('inventory.empty', 'No inventory items yet. Add some, or import an inventory from Cable/MultiCam Planner.')}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead style={{ opacity: 0.7 }}>
                <tr>
                  <th style={{ padding: '4px 8px' }}>{t('inventory.model', 'Model')}</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>{t('inventory.quantity', 'Quantity')}</th>
                  <th style={{ padding: '4px 8px' }}>{t('inventory.code', 'Code')}</th>
                  <th style={{ padding: '4px 8px' }}>{t('inventory.ownership', 'Ownership')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sorted.map((it) => (
                  <tr key={it.id}>
                    <td style={cell}>{it.model}{it.manufacturer && <span style={{ opacity: 0.5 }}> · {it.manufacturer}</span>}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>{it.quantity}</td>
                    <td style={{ ...cell, opacity: 0.8 }}>{it.code ?? '—'}</td>
                    <td style={{ ...cell, opacity: 0.8 }}>{it.ownership ?? '—'}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>
                      <button onClick={() => setForm({ ...it })} style={{ marginRight: 4 }}>{t('common.edit', 'Edit')}</button>
                      <button onClick={() => removeItem(it.id)} aria-label={t('common.delete', 'Delete')}><Icon name="trash" size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {(nodes.length > 0 || units.length > 0) && (
            <div style={{ fontSize: 12, opacity: 0.5, marginTop: 8 }}>
              + {nodes.length} {t('inventory.locations', 'Locations/cases')} · {units.length} {t('inventory.units', 'Units')} ({t('inventory.fromImport', 'from import, preserved losslessly')})
            </div>
          )}
        </div>

        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
      </div>
    </div>
  );
};

export default InventoryDialog;
