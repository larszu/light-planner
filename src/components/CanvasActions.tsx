import React from 'react';
import Icon from './Icon';
import { useTranslation } from '../i18n';

interface Props {
  viewMode: '2d' | '3d';
  hasSelection: boolean;
  multiSelected: boolean;
  hasArea: boolean;
  hasWalls: boolean;
  onAlignX: () => void;
  onAlignY: () => void;
  onAlignZ: () => void;
  onDistributeH: () => void;
  onDistributeV: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onRotate: (deg: number) => void;
  onAutoThreePoint: () => void;
  onAutoThreePointConfig: () => void;
  onAutoDistribute: () => void;
  onGenerateCeiling: () => void;
}

// Contextual action bar floating over the canvas. Only the groups relevant to
// the current selection/scene appear, so the chrome stays clean.
const CanvasActions: React.FC<Props> = (p) => {
  const { t } = useTranslation();
  const showAlign = p.multiSelected;
  const showAuto = p.hasArea || p.hasWalls || p.hasSelection;
  if (!showAlign && !showAuto) return null;
  return (
    <div className="canvas-actions">
      {showAlign && (
        <div className="ca-group">
          <span className="ca-label">{t('canvas.align', 'Align')}</span>
          <button className="ca-btn" title={t('canvas.alignX', 'Align horizontally (X)')} onClick={p.onAlignX}><Icon name="align" size={16} /></button>
          <button className="ca-btn" title={t('canvas.alignY', 'Align vertically (Y)')} onClick={p.onAlignY} style={{ transform: 'rotate(90deg)' }}><Icon name="align" size={16} /></button>
          <button className="ca-btn" title={t('canvas.alignZ', 'To the same height (Z)')} onClick={p.onAlignZ}><Icon name="layers" size={16} /></button>
          <button className="ca-btn" title={t('canvas.distH', 'Distribute horizontally')} onClick={p.onDistributeH}><Icon name="distribute" size={16} /></button>
          <button className="ca-btn" title={t('canvas.distV', 'Distribute vertically')} onClick={p.onDistributeV} style={{ transform: 'rotate(90deg)' }}><Icon name="distribute" size={16} /></button>
          <span className="ca-sep" />
          <button className="ca-btn" title={t('canvas.group', 'Group')} onClick={p.onGroup}><Icon name="group" size={16} /></button>
          <button className="ca-btn" title={t('canvas.ungroup', 'Ungroup')} onClick={p.onUngroup}><Icon name="group" size={16} /></button>
          <button className="ca-btn" title={t('canvas.rotateMinus', 'Rotate −15°')} onClick={() => p.onRotate(-15)} style={{ transform: 'scaleX(-1)' }}><Icon name="rotate" size={16} /></button>
          <button className="ca-btn" title={t('canvas.rotatePlus', 'Rotate +15°')} onClick={() => p.onRotate(15)}><Icon name="rotate" size={16} /></button>
        </div>
      )}
      {showAuto && (
        <div className="ca-group">
          <span className="ca-label">{t('canvas.autoLight', 'Auto light')}</span>
          <button className="ca-btn text" title={t('canvas.threePointHint', 'Three-point lighting for the selection')} onClick={p.onAutoThreePoint}><Icon name="autolight" size={16} />{t('canvas.threePoint', '3-point')}</button>
          <button className="ca-btn" title={t('canvas.threePointConfig', 'Configure three-point…')} onClick={p.onAutoThreePointConfig}><Icon name="settings" size={15} /></button>
          {p.hasArea && <button className="ca-btn text" title={t('canvas.areaHint', 'Light the area evenly')} onClick={p.onAutoDistribute}><Icon name="distribute" size={16} />{t('canvas.area', 'Area')}</button>}
          {p.hasWalls && <button className="ca-btn text" title={t('canvas.ceilingHint', 'Build a ceiling from the walls')} onClick={p.onGenerateCeiling}><Icon name="podium" size={16} />{t('canvas.ceiling', 'Ceiling')}</button>}
        </div>
      )}
    </div>
  );
};

export default CanvasActions;
