import React, { useEffect, useState } from 'react';
import type { PlacedFixture } from '../types';
import type { LiveResult } from '../core/dmxLive';
import { dmxBridge, useDmxLive } from '../store/dmxLiveStore';
import { format, useTranslation } from '../i18n';

interface Props {
  fixtures: PlacedFixture[];
  live: LiveResult | null;
  planUniverses: number[];
  onRecordScene: () => void;
  onApplyToPlan: () => void;
  onLocate: (ids: string[]) => void;
  onClose: () => void;
}

// Der DMX-Eingang: Leuchten live aus einem Pult oder einer Lichtsoftware
// fahren. Der Empfang laeuft weiter, wenn der Dialog zu ist — die Statusleiste
// zeigt, dass er an ist.
const DmxInputDialog: React.FC<Props> = ({ fixtures, live, planUniverses, onRecordScene, onApplyToPlan, onLocate, onClose }) => {
  const { t } = useTranslation();
  const { running, settings, sources, errors, packets, start, stop, setSettings } = useDmxLive();
  const [ifaces, setIfaces] = useState<{ name: string; address: string }[]>([]);
  const bridge = dmxBridge();

  useEffect(() => {
    void bridge?.interfaces().then(setIfaces);
  }, [bridge]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  // Eine geaenderte Einstellung gilt erst nach einem Neustart des Empfangs.
  const change = (s: Parameters<typeof setSettings>[0]) => {
    setSettings(s);
    if (running) void stop().then(() => start(planUniverses));
  };

  const patched = fixtures.filter((f) => f.dmxAddress != null && f.dmxAddress >= 1);
  const unpatched = fixtures.length - patched.length;
  const withoutLayout = patched.filter((f) => live?.undecodable.has(f.id));

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal settings-modal dmxin-modal" role="dialog" aria-modal="true" aria-label={t('dmxin.title', 'DMX input')}>
        <h3>{t('dmxin.title', 'DMX input')}</h3>
        <p className="settings-hint">
          {t('dmxin.intro', 'Drive the fixtures in the plan live from a console or lighting software over Art-Net or sACN. The plan reads each fixture at its patched address, using the channel layout of its DMX mode. Nothing is sent; the planner only listens.')}
        </p>

        {!bridge && (
          <p className="dmxin-warn">
            {t('dmxin.desktopOnly', 'Receiving DMX needs the desktop app — a browser cannot open network ports.')}
          </p>
        )}

        <h4 className="settings-h">{t('dmxin.protocols', 'Protocols')}</h4>
        <div className="settings-chips">
          <button type="button" className={`tb-chip ${settings.artnet ? 'on' : ''}`} onClick={() => change({ artnet: !settings.artnet })}>
            Art-Net
          </button>
          <button type="button" className={`tb-chip ${settings.sacn ? 'on' : ''}`} onClick={() => change({ sacn: !settings.sacn })}>
            sACN (E1.31)
          </button>
        </div>

        <div className="dmxin-grid">
          <label>
            {t('dmxin.artnetBase', 'Art-Net numbering')}
            <select value={settings.artnetBase} onChange={(e) => change({ artnetBase: Number(e.target.value) })}>
              <option value={0}>{t('dmxin.artnetBase0', 'Plan universe 1 = Art-Net 0')}</option>
              <option value={1}>{t('dmxin.artnetBase1', 'Plan universe 1 = Art-Net 1')}</option>
            </select>
          </label>
          <label>
            {t('dmxin.iface', 'Network (sACN)')}
            <select value={settings.iface} onChange={(e) => change({ iface: e.target.value })}>
              <option value="">{t('dmxin.ifaceAll', 'All interfaces')}</option>
              {ifaces.map((i) => (
                <option key={i.address} value={i.address}>{i.name} · {i.address}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="dmxin-run">
          {running ? (
            <button type="button" className="tb-btn" onClick={() => void stop()}>{t('dmxin.stop', 'Stop receiving')}</button>
          ) : (
            <button type="button" className="tb-btn primary" disabled={!bridge || (!settings.artnet && !settings.sacn)} onClick={() => void start(planUniverses)}>
              {t('dmxin.start', 'Start receiving')}
            </button>
          )}
          <span className="settings-hint">
            {running
              ? format(t('dmxin.status', '{n} packets/s · {s} source(s)'), { n: packets, s: sources.length })
              : t('dmxin.off', 'Off')}
          </span>
        </div>

        {errors.filter((e) => e !== 'desktop-only').map((e) => (
          <p key={e} className="dmxin-warn">{e}</p>
        ))}

        {sources.length > 0 && (
          <table className="dmxin-table">
            <thead>
              <tr>
                <th>{t('dmxin.source', 'Source')}</th>
                <th>{t('dmxin.protocol', 'Protocol')}</th>
                <th>{t('dmxin.universe', 'Universe')}</th>
                <th>{t('dmxin.priority', 'Priority')}</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={`${s.protocol}${s.source}${s.universe}`}>
                  <td>{s.name || s.source}</td>
                  <td>{s.protocol === 'artnet' ? 'Art-Net' : 'sACN'}</td>
                  <td>{s.universe}</td>
                  <td>{s.protocol === 'sacn' ? s.priority : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h4 className="settings-h">{t('dmxin.rig', 'Rig')}</h4>
        <p className="settings-hint">
          {format(t('dmxin.rigCount', '{d} of {p} patched fixtures are being driven.'), { d: live?.driven.size ?? 0, p: patched.length })}
          {unpatched > 0 && ` ${format(t('dmxin.unpatched', '{n} have no DMX address.'), { n: unpatched })}`}
        </p>
        {withoutLayout.length > 0 && (
          <p className="dmxin-warn">
            {format(t('dmxin.noLayout', '{n} fixture(s) receive data but their DMX mode has no channel layout — set one in the fixture editor or import a GDTF file.'), { n: withoutLayout.length })}{' '}
            <button type="button" className="dmxin-link" onClick={() => onLocate(withoutLayout.map((f) => f.id))}>
              {t('dmxin.show', 'Show')}
            </button>
          </p>
        )}

        <h4 className="settings-h">{t('dmxin.keep', 'Keep what is live')}</h4>
        <p className="settings-hint">
          {t('dmxin.keepHint', 'The live state is not saved on its own. Record it as a scene, or write it into the plan (intensity, colour, CCT, zoom and the pan/tilt focus).')}
        </p>
        <div className="settings-chips">
          <button type="button" className="tb-btn" disabled={!live || live.driven.size === 0} onClick={onRecordScene}>
            {t('dmxin.recordScene', 'Record as scene')}
          </button>
          <button type="button" className="tb-btn" disabled={!live || live.driven.size === 0} onClick={onApplyToPlan}>
            {t('dmxin.applyPlan', 'Write into plan')}
          </button>
        </div>

        <div className="settings-foot">
          <button type="button" className="tb-btn" onClick={onClose}>{t('common.close', 'Close')}</button>
        </div>
      </div>
    </div>
  );
};

export default DmxInputDialog;
