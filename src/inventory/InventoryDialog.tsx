// Lager / Bestand — schlanke Light-Planner-Ansicht. Teilt das portable
// `avplan-inventory`-Format mit cable- und multicam-planner (verlustfreier
// Austausch inkl. Lagerorte/Cases/Einheiten via Import).
import React, { useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { useTranslation } from '../i18n';
import { useInventoryStore, type InventoryItemInput } from './store';
import { serializeInventory, parseInventory, resolveInventoryCode } from './portable';
import type { InventoryItem } from './types';

interface Props {
  onClose: () => void;
}

type FormState = InventoryItemInput & { id?: string };

const cell: React.CSSProperties = { padding: '5px 8px', borderTop: '1px solid var(--lp-border, #333)' };
const inp: React.CSSProperties = { width: '100%', padding: '6px', background: 'var(--lp-input-bg, #1a1a1a)', border: '1px solid var(--lp-border, #333)', borderRadius: 4, color: 'inherit' };

const InventoryDialog: React.FC<Props> = ({ onClose }) => {
  const { t } = useTranslation();
  const items = useInventoryStore((s) => s.items);
  const nodes = useInventoryStore((s) => s.nodes);
  const units = useInventoryStore((s) => s.units);
  const addItem = useInventoryStore((s) => s.addItem);
  const updateItem = useInventoryStore((s) => s.updateItem);
  const removeItem = useInventoryStore((s) => s.removeItem);
  const exportSnapshot = useInventoryStore((s) => s.exportSnapshot);
  const importSnapshot = useInventoryStore((s) => s.importSnapshot);

  const [form, setForm] = useState<FormState | null>(null);
  const [scan, setScan] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const doImport = async (file: File) => {
    const snap = parseInventory(await file.text());
    if (!snap) {
      setMsg(t('inventory.importErr', 'Keine gültige Lager-Datei (avplan-inventory).'));
      return;
    }
    const replace = window.confirm(t('inventory.importConfirm', 'Bestehenden Bestand ERSETZEN? Abbrechen = zusammenführen.'));
    const n = importSnapshot(snap, replace ? 'replace' : 'merge');
    setMsg(t('inventory.importDone', '{n} Objekte importiert.').replace('{n}', String(n)));
  };

  const doScan = () => {
    const code = scan.trim();
    if (!code) return;
    const m = resolveInventoryCode(code, { items, nodes, units });
    if (!m) setMsg(t('inventory.scanNone', 'Kein Treffer.'));
    else if (m.kind === 'item') {
      setMsg(`${t('inventory.item', 'Artikel')}: ${m.item.model}`);
      setForm({ ...m.item });
    } else if (m.kind === 'node') setMsg(`${t('inventory.location', 'Lagerort')}: ${m.node.name}`);
    else setMsg(`${t('inventory.unit', 'Einheit')}: ${m.unit.serial || m.unit.code || m.unit.id.slice(0, 6)}`);
    setScan('');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(760px, 94vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>{t('inventory.title', 'Lager / Bestand')}</h2>
          <button onClick={onClose} aria-label={t('about.close', 'Schließen')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
            <span style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}><Icon name="search" size={13} /></span>
            <input value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doScan()}
              placeholder={t('inventory.scanPh', 'Code scannen / eingeben…')} style={{ ...inp, paddingLeft: 26 }} />
          </div>
          <button onClick={doScan}>{t('inventory.scan', 'Auflösen')}</button>
          <button onClick={doExport} title={t('inventory.exportHint', 'App-übergreifend exportieren')}><Icon name="export" size={13} /> {t('inventory.export', 'Export')}</button>
          <button onClick={() => fileRef.current?.click()}><Icon name="import" size={13} /> {t('inventory.import', 'Import')}</button>
          <button className="primary" onClick={() => setForm({ model: '', quantity: 1 })}><Icon name="plus" size={13} /> {t('inventory.add', 'Artikel')}</button>
        </div>
        {msg && <div style={{ ...cell, borderTop: 'none', background: 'var(--lp-input-bg,#1a1a1a)', borderRadius: 4, marginBottom: 8 }}>{msg}</div>}

        {form && (
          <div style={{ border: '1px solid var(--lp-accent,#5b9)', borderRadius: 6, padding: 12, marginBottom: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{form.id ? t('inventory.edit', 'Artikel bearbeiten') : t('inventory.new', 'Neuer Artikel')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <label>{t('inventory.model', 'Modell')} *<input autoFocus value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} style={inp} /></label>
              <label>{t('inventory.manufacturer', 'Hersteller')}<input value={form.manufacturer ?? ''} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} style={inp} /></label>
              <label>{t('inventory.quantity', 'Menge')}<input type="number" min={0} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} style={inp} /></label>
              <label>{t('inventory.code', 'Code')}<input value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value })} style={inp} /></label>
              <label>{t('inventory.ownership', 'Eigentum')}
                <select value={form.ownership ?? ''} onChange={(e) => setForm({ ...form, ownership: (e.target.value || undefined) as InventoryItem['ownership'] })} style={inp}>
                  <option value="">—</option>
                  <option value="owned">{t('inventory.owned', 'Eigentum')}</option>
                  <option value="rented">{t('inventory.rented', 'gemietet')}</option>
                  <option value="subhire">{t('inventory.subhire', 'Sub-Miete')}</option>
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button onClick={() => setForm(null)}>{t('common.cancel', 'Abbrechen')}</button>
              <button className="primary" disabled={form.model.trim() === ''} onClick={save}>{t('common.save', 'Speichern')}</button>
            </div>
          </div>
        )}

        <div style={{ overflow: 'auto', flex: 1 }}>
          {sorted.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', opacity: 0.6 }}>
              {t('inventory.empty', 'Noch keine Lager-Artikel. Lege welche an oder importiere ein Lager aus Cable/MultiCam Planner.')}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead style={{ opacity: 0.7 }}>
                <tr>
                  <th style={{ padding: '4px 8px' }}>{t('inventory.model', 'Modell')}</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>{t('inventory.quantity', 'Menge')}</th>
                  <th style={{ padding: '4px 8px' }}>{t('inventory.code', 'Code')}</th>
                  <th style={{ padding: '4px 8px' }}>{t('inventory.ownership', 'Eigentum')}</th>
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
                      <button onClick={() => setForm({ ...it })} style={{ marginRight: 4 }}>{t('common.edit', 'Bearbeiten')}</button>
                      <button onClick={() => removeItem(it.id)} aria-label={t('common.delete', 'Löschen')}><Icon name="trash" size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {(nodes.length > 0 || units.length > 0) && (
            <div style={{ fontSize: 12, opacity: 0.5, marginTop: 8 }}>
              + {nodes.length} {t('inventory.locations', 'Lagerorte/Cases')} · {units.length} {t('inventory.units', 'Einheiten')} ({t('inventory.fromImport', 'aus Import, verlustfrei erhalten')})
            </div>
          )}
        </div>

        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
      </div>
    </div>
  );
};

export default InventoryDialog;
