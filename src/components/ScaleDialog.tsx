import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '../i18n';

interface Props {
  measuredMeters: number;   // length of the drawn reference segment in current units
  onApply: (realMeters: number) => void;
  onCancel: () => void;
}

// Asks the user how long the reference segment they just drew really is, then
// hands the value back so the plan can be rescaled to match.
const ScaleDialog: React.FC<Props> = ({ measuredMeters, onApply, onCancel }) => {
  const { t } = useTranslation();
  const [value, setValue] = useState(measuredMeters.toFixed(2));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const real = Number(value);
  const valid = Number.isFinite(real) && real > 0;
  const factor = valid ? real / measuredMeters : 1;

  const submit = () => { if (valid) onApply(real); };

  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <div className="modal scale-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>📏 {t('dlg.scale.title', 'Calibrate scale')}</h3>
        <p className="dialog-hint">
          {t('dlg.scale.hintPre', 'The line you drew currently measures')} <strong>{measuredMeters.toFixed(2)} m</strong>{' '}
          {t('dlg.scale.hintPost', '. Enter its real length – the floor plan is scaled to match.')}
        </p>
        <div className="scale-input-row">
          <label>{t('dlg.scale.realLength', 'Real length')}</label>
          <input
            ref={inputRef}
            type="number"
            min={0.01}
            step={0.1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') onCancel();
            }}
          />
          <span>m</span>
        </div>
        {valid && Math.abs(factor - 1) > 0.001 && (
          <p className="scale-factor-hint">
            {t('dlg.scale.factorPre', 'The plan is scaled by a factor of')} <strong>{factor.toFixed(3)}×</strong>{' '}
            {factor > 1 ? t('dlg.scale.enlarged', 'up') : t('dlg.scale.reduced', 'down')}.
          </p>
        )}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>{t('common.cancel', 'Cancel')}</button>
          <button className="btn-primary" onClick={submit} disabled={!valid}>{t('dlg.scale.apply', 'Apply')}</button>
        </div>
      </div>
    </div>
  );
};

export default ScaleDialog;
