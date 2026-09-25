// Eine Fehlerzeile der Geraetebibliothek. Bei geaenderten Richtlinien steht
// der Weg gleich daneben: annehmen kann man sie nur auf der Website.
import React from 'react';
import { useTranslation } from '../i18n';
import type { LibraryErrorCode } from '../core/deviceLibraryClient';
import { useDeviceLibrary } from '../store/deviceLibraryStore';
import { libraryErrorText } from './deviceLibraryText';

const DeviceLibraryError: React.FC<{ code: LibraryErrorCode }> = ({ code }) => {
  const { t } = useTranslation();
  const server = useDeviceLibrary((s) => s.server);
  return (
    <p className="devlib-error" role="alert">
      {libraryErrorText(t, code)}
      {code === 'guidelines-outdated' && (
        <>
          {' '}
          <a href={`${server.replace(/\/+$/, '')}/guidelines`} target="_blank" rel="noreferrer">
            {t('devlib.guidelinesLink', 'Open the guidelines')}
          </a>
        </>
      )}
    </p>
  );
};

export default DeviceLibraryError;
