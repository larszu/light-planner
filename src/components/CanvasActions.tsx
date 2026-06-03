import React from 'react';
import Icon from './Icon';

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
  const showAlign = p.multiSelected;
  const showAuto = p.hasArea || p.hasWalls || p.hasSelection;
  if (!showAlign && !showAuto) return null;
  return (
    <div className="canvas-actions">
      {showAlign && (
        <div className="ca-group">
          <span className="ca-label">Ausrichten</span>
          <button className="ca-btn" title="Horizontal ausrichten (X)" onClick={p.onAlignX}><Icon name="align" size={16} /></button>
          <button className="ca-btn" title="Vertikal ausrichten (Y)" onClick={p.onAlignY} style={{ transform: 'rotate(90deg)' }}><Icon name="align" size={16} /></button>
          <button className="ca-btn" title="Auf gleiche Höhe (Z)" onClick={p.onAlignZ}><Icon name="layers" size={16} /></button>
          <button className="ca-btn" title="Horizontal verteilen" onClick={p.onDistributeH}><Icon name="distribute" size={16} /></button>
          <button className="ca-btn" title="Vertikal verteilen" onClick={p.onDistributeV} style={{ transform: 'rotate(90deg)' }}><Icon name="distribute" size={16} /></button>
          <span className="ca-sep" />
          <button className="ca-btn" title="Gruppieren" onClick={p.onGroup}><Icon name="group" size={16} /></button>
          <button className="ca-btn" title="Gruppierung aufheben" onClick={p.onUngroup}><Icon name="group" size={16} /></button>
          <button className="ca-btn" title="−15° drehen" onClick={() => p.onRotate(-15)} style={{ transform: 'scaleX(-1)' }}><Icon name="rotate" size={16} /></button>
          <button className="ca-btn" title="+15° drehen" onClick={() => p.onRotate(15)}><Icon name="rotate" size={16} /></button>
        </div>
      )}
      {showAuto && (
        <div className="ca-group">
          <span className="ca-label">Auto-Licht</span>
          <button className="ca-btn text" title="3-Punkt-Ausleuchtung für die Auswahl" onClick={p.onAutoThreePoint}><Icon name="autolight" size={16} />3-Punkt</button>
          <button className="ca-btn" title="3-Punkt konfigurieren…" onClick={p.onAutoThreePointConfig}><Icon name="settings" size={15} /></button>
          {p.hasArea && <button className="ca-btn text" title="Fläche gleichmäßig ausleuchten" onClick={p.onAutoDistribute}><Icon name="distribute" size={16} />Fläche</button>}
          {p.hasWalls && <button className="ca-btn text" title="Decke aus den Wänden erzeugen" onClick={p.onGenerateCeiling}><Icon name="podium" size={16} />Decke</button>}
        </div>
      )}
    </div>
  );
};

export default CanvasActions;
