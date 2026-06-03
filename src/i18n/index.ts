// ───────────────────────────────────────────────────────────────────────────
// i18n — same model as Cable-Planner: German is the SOURCE language, written
// inline as the fallback in `t('some.key', 'Deutsche Form')`. The `en` dict
// only overrides for English. Missing keys fall back to the German fallback,
// so wrapping a string never breaks it.
//
// Usage:  const { t } = useTranslation();  t('menu.file', 'Datei')
// Language lives in the uiStore (matches a host that owns the language).
// ───────────────────────────────────────────────────────────────────────────
import { useUiStore } from '../store/uiStore';

// English overrides. Add keys here as strings get wrapped; anything missing
// shows the inline German fallback.
const en: Record<string, string> = {
  // Menu bar
  'menu.file': 'File',
  'menu.edit': 'Edit',
  'menu.view': 'View',
  'menu.help': 'Help',
  'menu.new': 'New',
  'menu.save': 'Save (browser)…',
  'menu.load': 'Load (browser)…',
  'menu.saveFile': 'Project to file… (choose location)',
  'menu.loadFile': 'Open project file…',
  'menu.exportPng': 'Export as PNG…',
  'menu.exportJpg': 'Export as JPG…',
  'menu.exportPdf': 'Export as PDF…',
  'menu.schedule': 'Instrument schedule & patch…',
  'menu.undo': 'Undo',
  'menu.redo': 'Redo',
  'menu.copy': 'Copy',
  'menu.paste': 'Paste',
  'menu.duplicate': 'Duplicate',
  'menu.plan2d': '2D plan',
  'menu.preview3d': '3D preview',
  'menu.heatmap': 'Heat-map',
  'menu.snap': 'Snap to grid',
  'menu.about': 'About Light Planner…',
  'menu.language': 'Language: English',
  // About
  'about.version': 'Version',
  'about.close': 'Close',
  // Toolbar (tool labels)
  'tool.select': 'Select',
  'tool.pan': 'Pan',
  'tool.rect': 'Rectangle',
  'tool.line': 'Line',
  'tool.measure': 'Measure',
  'tool.person': 'Person',
  'tool.stage': 'Podest',
  'tool.stagepoly': 'Stage (polygon)',
  'tool.truss': 'Truss',
  'tool.wall': 'Wall',
  'tool.camera': 'Camera',
  'tool.heatmap': 'Heat-map',
  'tool.photo': 'Photo',
  'tool.grid': 'Grid',
  'tool.floorplan': 'Floor plan',
  'tool.export': 'Export',
};

export function translate(language: 'de' | 'en', key: string, de: string): string {
  return language === 'en' && en[key] !== undefined ? en[key] : de;
}

/** Hook: returns a `t(key, de)` bound to the current language + the language. */
export function useTranslation() {
  const language = useUiStore((s) => s.language);
  const setLanguage = useUiStore((s) => s.setLanguage);
  return {
    t: (key: string, de: string) => translate(language, key, de),
    language,
    setLanguage,
  };
}
