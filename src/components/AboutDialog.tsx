import React from 'react';
import { APP_NAME, APP_VERSION } from '../version';
import { useTranslation, format } from '../i18n';

interface Props { onClose: () => void }

// "Über LZ Light Planner" – app name, current version and a short summary.
const AboutDialog: React.FC<Props> = ({ onClose }) => {
  const { t } = useTranslation();
  return (
  <div className="modal-backdrop" onClick={onClose}>
    <div className="modal about-modal" onClick={(e) => e.stopPropagation()}>
      <div className="about-logo" role="img" aria-label="Lars Zumpe Medienproduktion">
        <img className="lzm-auf-dunkel" src={`${import.meta.env.BASE_URL}brand/lzm_hauptlogo_offwhite.svg`} alt="" />
        <img className="lzm-auf-hell" src={`${import.meta.env.BASE_URL}brand/lzm_hauptlogo_navy.svg`} alt="" />
      </div>
      <h2 className="about-name">{APP_NAME}</h2>
      <div className="about-version">{t('about.version', 'Version')} {APP_VERSION}</div>
      <div className="about-company">Lars Zumpe Medienproduktion</div>
      <p className="about-desc">
        {t(
          'about.description',
          'Planning for event and stage lighting - floor-plan import, scale, fixtures with real photometric data, heatmap, 3D preview with photo view, scenes, layers, DMX patch and export.',
        )}
      </p>
      <div className="about-tech">React · TypeScript · Three.js · Vite</div>
      <div className="about-copy">
        {format(t('about.copyright', '© {year} · Every calculation stays traceable.'), {
          year: new Date().getFullYear(),
        })}
      </div>
      <div className="modal-actions">
        <button className="primary" onClick={onClose}>{t('about.close', 'Close')}</button>
      </div>
    </div>
  </div>
  );
};

export default AboutDialog;
