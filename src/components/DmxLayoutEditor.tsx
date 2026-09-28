import React, { useRef, useState } from 'react';
import type { DmxAttribute, DmxChannel, DmxMode } from '../types';
import { ATTRIBUTES, DEFAULT_RANGE, TEMPLATES, hasRange, layoutProblems, layoutSpan } from '../core/dmxLayout';
import { readGdtf, type GdtfImport } from '../core/gdtf';
import { format, useTranslation } from '../i18n';

type T = ReturnType<typeof useTranslation>['t'];

const attributeLabel = (t: T, a: DmxAttribute): string => ({
  dimmer: t('dmx.attr.dimmer', 'Dimmer'),
  shutter: t('dmx.attr.shutter', 'Shutter / strobe'),
  red: t('dmx.attr.red', 'Red'),
  green: t('dmx.attr.green', 'Green'),
  blue: t('dmx.attr.blue', 'Blue'),
  white: t('dmx.attr.white', 'White'),
  amber: t('dmx.attr.amber', 'Amber'),
  lime: t('dmx.attr.lime', 'Lime'),
  uv: 'UV',
  cyan: t('dmx.attr.cyan', 'Cyan'),
  magenta: 'Magenta',
  yellow: t('dmx.attr.yellow', 'Yellow'),
  colorWheel: t('dmx.attr.colorWheel', 'Colour wheel'),
  cct: 'CCT',
  zoom: 'Zoom',
  pan: 'Pan',
  tilt: 'Tilt',
  other: t('dmx.attr.other', 'Other (not shown)'),
}[a]);

interface Props {
  mode: DmxMode;
  onChange: (m: DmxMode) => void;
}

/**
 * Kanalbelegung eines Modus: je Kanal Attribut, optional Fein-Kanal (16 bit)
 * und physikalischer Bereich. Aufgeklappt unter der Moduszeile.
 */
export const DmxLayoutEditor: React.FC<Props> = ({ mode, onChange }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const layout = mode.layout ?? [];
  const set = (l: DmxChannel[]) => onChange({ ...mode, layout: l.length ? l : undefined });
  const upd = (i: number, part: Partial<DmxChannel>) => set(layout.map((c, j) => (j === i ? { ...c, ...part } : c)));
  const problems = layoutProblems(mode);
  const beyond = problems.filter((p) => p.kind === 'beyond-mode').map((p) => (p.offset ?? 0) + 1);
  const problemText = [
    ...(beyond.length ? [format(t('dmx.beyond', 'Channel(s) {n} lie beyond the {c} channels of this mode.'), { n: beyond.join(', '), c: mode.channels })] : []),
    ...problems.filter((p) => p.kind !== 'beyond-mode').map((p) => (
      p.kind === 'double-use' ? format(t('dmx.double', 'Channel {n} is assigned twice.'), { n: (p.offset ?? 0) + 1 })
        : t('dmx.noIntensity', 'No dimmer, colour or CCT channel: DMX input cannot change the brightness.')
    )),
  ];

  return (
    <div className="dmx-layout">
      <button type="button" className="dmx-layout-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? '▾' : '▸'} {layout.length
          ? format(t('dmx.layoutCount', 'Channel layout: {n} channels'), { n: layoutSpan(layout) })
          : mode.channels === 1
            ? t('dmx.layoutImplicit', 'Channel layout: dimmer (single channel)')
            : t('dmx.layoutNone', 'Channel layout: none — DMX input cannot read this mode')}
      </button>
      {open && (
        <div className="dmx-layout-body">
          <select
            value=""
            title={t('dmx.template', 'Start from a template')}
            onChange={(e) => {
              const tpl = TEMPLATES.find((x) => x.id === e.target.value);
              // Eine Vorlage ist eine ausdrueckliche Wahl: der Modus waechst mit.
              if (tpl) onChange({ ...mode, channels: Math.max(mode.channels, layoutSpan(tpl.layout)), layout: tpl.layout.map((c) => ({ ...c })) });
            }}
          >
            <option value="">{t('dmx.template', 'Start from a template')}…</option>
            {TEMPLATES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
          {layout.map((c, i) => (
            <div key={i} className="dmx-layout-row">
              <input
                type="number" min={1} max={512} value={c.offset + 1}
                title={t('dmx.channel', 'Channel (1 = start address)')}
                onChange={(e) => upd(i, { offset: Math.max(0, Math.round(Number(e.target.value) || 1) - 1) })}
              />
              <select
                value={c.attribute}
                onChange={(e) => {
                  const a = e.target.value as DmxAttribute;
                  upd(i, { attribute: a, range: undefined, slots: undefined });
                }}
              >
                {ATTRIBUTES.map((a) => <option key={a} value={a}>{attributeLabel(t, a)}</option>)}
              </select>
              <input
                type="number" min={1} max={512} value={c.fineOffset != null ? c.fineOffset + 1 : ''}
                placeholder={t('dmx.finePh', 'fine')}
                title={t('dmx.fine', 'Fine channel for 16 bit (empty = 8 bit)')}
                onChange={(e) => upd(i, { fineOffset: e.target.value === '' ? undefined : Math.max(0, Math.round(Number(e.target.value)) - 1) })}
              />
              {hasRange(c.attribute) && (
                <>
                  <input
                    type="number" value={(c.range ?? DEFAULT_RANGE[c.attribute]!)[0]}
                    title={t('dmx.rangeFrom', 'Physical value at DMX 0')}
                    onChange={(e) => upd(i, { range: [Number(e.target.value), (c.range ?? DEFAULT_RANGE[c.attribute]!)[1]] })}
                  />
                  <input
                    type="number" value={(c.range ?? DEFAULT_RANGE[c.attribute]!)[1]}
                    title={t('dmx.rangeTo', 'Physical value at full')}
                    onChange={(e) => upd(i, { range: [(c.range ?? DEFAULT_RANGE[c.attribute]!)[0], Number(e.target.value)] })}
                  />
                </>
              )}
              {c.slots && <span className="dmx-layout-note">{format(t('dmx.slots', '{n} ranges'), { n: c.slots.length })}</span>}
              <button type="button" onClick={() => set(layout.filter((_, j) => j !== i))}>x</button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => set([...layout, { attribute: 'dimmer', offset: layoutSpan(layout) }])}
          >{t('dmx.addChannel', '+ Channel')}</button>
          {problemText.map((p) => <p key={p} className="dmx-layout-warn">{p}</p>)}
          <p className="fx-modes-hint">
            {t('dmx.hint', 'Ranges: degrees for pan, tilt and zoom, kelvin for CCT. The layout must match the device manual — one channel off and every value lands on the wrong function.')}
          </p>
        </div>
      )}
    </div>
  );
};

/** Datei-Knopf fuer GDTF. Liefert das Ergebnis oder einen Fehlertext. */
export const GdtfImportButton: React.FC<{ onImport: (g: GdtfImport) => void }> = ({ onImport }) => {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="dmx-gdtf">
      <button type="button" onClick={() => input.current?.click()}>{t('dmx.gdtfImport', 'Import GDTF…')}</button>
      <input
        ref={input} type="file" accept=".gdtf" hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            const g = await readGdtf(new Uint8Array(await file.arrayBuffer()), file.name);
            onImport(g);
            setMsg([
              format(t('dmx.gdtfDone', '{n} mode(s) read from {f}.'), { n: g.modes.length, f: file.name }),
              ...g.warnings,
            ].join(' '));
          } catch (err) {
            setMsg(`${t('dmx.gdtfFail', 'GDTF could not be read')}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }}
      />
      {msg && <p className="fx-modes-hint">{msg}</p>}
    </div>
  );
};
