import React from 'react';

// One consistent line-icon set (1.7px stroke, currentColor) replacing the
// emoji icons across the UI. Add a name here and reference it as <Icon name=… />.
export type IconName =
  | 'select' | 'pan' | 'rect' | 'line' | 'measure' | 'person' | 'podium' | 'stage'
  | 'truss' | 'wall' | 'camera' | 'fixture' | 'plan2d' | 'cube3d' | 'photo' | 'grid'
  | 'heatmap' | 'settings' | 'import' | 'schedule' | 'export' | 'save' | 'open'
  | 'undo' | 'redo' | 'search' | 'chevronRight' | 'chevronDown' | 'eye' | 'eyeOff'
  | 'lock' | 'unlock' | 'plus' | 'minus' | 'snap' | 'ruler' | 'tag' | 'menu' | 'beam'
  | 'scene' | 'layers' | 'library' | 'lamp' | 'autolight' | 'distribute' | 'align'
  | 'group' | 'rotate' | 'trash' | 'info' | 'check' | 'close';

const P: Record<IconName, React.ReactNode> = {
  select: <path d="M5 3l6.5 16 2.2-6.3 6.3-2.2Z" />,
  pan: <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V12m0-1a1.5 1.5 0 0 1 3 0v4a5 5 0 0 1-5 5h-1.5a4 4 0 0 1-3-1.4L6 16a1.6 1.6 0 0 1 2.4-2L9 15" />,
  rect: <rect x="4" y="6" width="16" height="12" rx="1.5" />,
  line: <path d="M5 19 19 5" />,
  measure: <path d="M4 14 14 4l6 6L10 20Z M8 8l2 2M11 5l2 2M5 11l2 2" />,
  ruler: <path d="M4 14 14 4l6 6L10 20Z M8 8l2 2M11 5l2 2M5 11l2 2" />,
  person: <><circle cx="12" cy="6" r="3" /><path d="M6 21v-1a6 6 0 0 1 12 0v1" /></>,
  podium: <path d="M3 9l9-5 9 5-9 5Z M3 9v6l9 5 9-5V9" />,
  stage: <path d="M12 3 4 8v8l8 5 8-5V8Z" />,
  truss: <path d="M3 7h18M3 17h18M6 7l4 10M14 7l4 10M18 7l-4 10M10 7 6 17" />,
  wall: <path d="M3 6h18v12H3Z M3 12h18M8 6v6M16 12v6M12 6v.01" />,
  camera: <><path d="M4 7h3l1.5-2h7L18 7h2a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.2" /></>,
  fixture: <path d="M12 2a5 5 0 0 1 3 9v2H9v-2a5 5 0 0 1 3-9ZM9 17h6M10 21h4" />,
  lamp: <path d="M12 2a5 5 0 0 1 3 9v2H9v-2a5 5 0 0 1 3-9ZM9 17h6M10 21h4" />,
  plan2d: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>,
  cube3d: <path d="M12 2 3 7v10l9 5 9-5V7Z M3 7l9 5 9-5M12 12v10" />,
  photo: <><rect x="3" y="6" width="18" height="13" rx="2" /><circle cx="12" cy="12.5" r="3.4" /><path d="M8 6l1.2-2h5.6L16 6" /></>,
  grid: <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />,
  heatmap: <path d="M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-3 2-5 5-9Z" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1L15 3.5H9l-.4 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4L2.6 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1L9 20.5h6l.4-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4Z" /></>,
  import: <path d="M12 3v10m0 0 3.5-3.5M12 13 8.5 9.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />,
  schedule: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h4" /></>,
  export: <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />,
  save: <path d="M5 3h11l3 3v15H5Z M8 3v5h7M8 14h8v7H8Z" />,
  open: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  undo: <path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3" />,
  redo: <path d="m15 7 5 5-5 5M20 12H9a5 5 0 0 0 0 10h3" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></>,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <path d="M4 4l16 16M9.5 9.6A3 3 0 0 0 14.4 14.4M6.2 6.3C3.8 7.8 2 12 2 12s3.5 7 10 7a10 10 0 0 0 4-.8M9.8 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-2.4 3.3" />,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  unlock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.7-1.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  snap: <path d="M5 5h4M5 5v4M19 5h-4M19 5v4M5 19h4M5 19v-4M19 19h-4M19 19v-4" />,
  tag: <path d="M4 7V5h16v2M9 5v14M7 19h4" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  beam: <path d="M9 3h6l1 7H8ZM10 10v6a2 2 0 0 0 4 0v-6M11 20h2" />,
  scene: <><circle cx="12" cy="12" r="3" /><path d="M12 4v3M12 17v3M4 12h3M17 12h3" /></>,
  layers: <path d="m12 3 9 5-9 5-9-5Z M3 13l9 5 9-5M3 8v5M21 8v5" />,
  library: <path d="M4 5h4v14H4Zm6 0h4v14h-4Zm7 .5 3 .8-3.5 13-3-.8Z" />,
  autolight: <path d="M12 3v2M5 6l1.5 1.5M19 6l-1.5 1.5M12 8a4 4 0 0 1 2 7.5V18h-4v-2.5A4 4 0 0 1 12 8ZM10 20h4" />,
  distribute: <path d="M4 6h16M4 18h16M7 10v4M12 10v4M17 10v4" />,
  align: <path d="M4 4v16M9 7h11M9 12h7M9 17h11" />,
  group: <><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /><path d="M11 7h3v3M13 17h-3v-3" /></>,
  rotate: <path d="M4 12a8 8 0 1 1 2.3 5.6M4 12v4m0-4H8" />,
  trash: <path d="M5 7h14M9 7V5h6v2M6 7l1 13h10l1-13" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></>,
  check: <path d="m5 12 5 5L20 6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
};

export const Icon: React.FC<{ name: IconName; size?: number; className?: string }> = ({ name, size = 18, className }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {P[name]}
  </svg>
);

export default Icon;
