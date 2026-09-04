import React from 'react';
import Icon from './Icon';
import { useTranslation } from '../i18n';

interface Props {
  viewMode: '2d' | '3d';
  photoMode: boolean;
  cursorLux: number | null;
  selectionCount: number;
  snapStep: number;
  haze: number;
  exposure: number;
  activeSceneName: string | null;
  hiddenCount: number;
}

// Persistent bottom status bar — the live feedback (lux, selection, snap, render
// settings, active scene) that used to be scattered across the UI.
const StatusBar: React.FC<Props> = ({ viewMode, photoMode, cursorLux, selectionCount, snapStep, haze, exposure, activeSceneName, hiddenCount }) => {
  const { t, language } = useTranslation();
  // Die Zahl folgt der Oberflaechensprache, nicht dem Betriebssystem: die
  // Leiste stand mit hartem 'de-DE' da, und in der englischen Fassung waere
  // aus "1.200 lx" sonst weiter der deutsche Punkt geworden.
  const luxLocale = language === 'en' ? 'en-US' : 'de-DE';

  return (
    <footer className="statusbar">
      <span className="sb-item"><Icon name={viewMode === '2d' ? 'plan2d' : (photoMode ? 'photo' : 'cube3d')} size={13} />
        {viewMode === '2d'
          ? t('status.plan2d', '2D-Plan')
          : (photoMode ? t('status.render', 'Render') : t('status.view3d', '3D'))}</span>
      {cursorLux !== null && (
        <span className="sb-item sb-lux"><Icon name="heatmap" size={13} /><b>{Math.round(cursorLux).toLocaleString(luxLocale)}</b> lx</span>
      )}
      <span className="sb-item"><b>{selectionCount}</b> {t('status.selected', 'ausgewählt')}</span>
      {hiddenCount > 0 && <span className="sb-item">{hiddenCount} {t('status.muted', 'stummgeschaltet')}</span>}
      <span className="sb-spacer" />
      {photoMode && <span className="sb-item">{t('status.exposure', 'Belichtung')} <b>{exposure.toFixed(2)}</b></span>}
      {photoMode && <span className="sb-item">{t('status.haze', 'Dunst')} <b>{Math.round(haze * 100)}%</b></span>}
      <span className="sb-item">{t('status.snap', 'Einrasten')} <b>{snapStep > 0 ? `${snapStep} m` : t('status.snapOff', 'aus')}</b></span>
      {activeSceneName && <span className="sb-item sb-scene"><span className="sb-dot" />{t('status.scene', 'Szene')} „{activeSceneName}"</span>}
    </footer>
  );
};

export default StatusBar;
