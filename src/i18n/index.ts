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
  // ── Lager / Bestand (InventoryDialog) ────────────────────────────────────
  //
  // WARUM DIESE 33 SCHLUESSEL SPAETER KAMEN ALS DIE UEBRIGEN 42. Von den
  // vorhandenen englischen Eintraegen bedienten **40 von 42** toten Code:
  // `MenuBar.tsx` (24 `menu.*`) und `Toolbar.tsx` (12 `tool.*`) werden
  // nirgends importiert und nirgends gerendert -- `App.tsx` nutzt TopBar und
  // ToolRail. Der einzige substanzielle Dialog mit uebersetzten Strings,
  // `inventory/InventoryDialog.tsx` (37 Aufrufe), hatte KEINEN einzigen.
  //
  // Die Uebersetzungsarbeit war also vollstaendig in Code geflossen, den
  // niemand sieht. Deshalb kommen diese hier zuerst und nicht der
  // Sprachschalter: wer den Schalter freilegt, bevor die erreichbaren Strings
  // uebersetzt sind, liefert einen sichtbar halb uebersetzten Zustand aus --
  // und ein Nutzer, der Englisch waehlt und Deutsch bekommt, haelt die
  // Funktion fuer kaputt, und zwar zu Recht.
  'inventory.title': 'Inventory',
  'inventory.item': 'Item',
  'inventory.add': 'Item',
  'inventory.new': 'New item',
  'inventory.edit': 'Edit item',
  'inventory.empty':
    'No inventory items yet. Add some, or import an inventory from Cable/MultiCam Planner.',
  'inventory.model': 'Model',
  'inventory.manufacturer': 'Manufacturer',
  'inventory.quantity': 'Quantity',
  'inventory.code': 'Code',
  'inventory.location': 'Location',
  'inventory.locations': 'Locations/cases',
  'inventory.unit': 'Unit',
  'inventory.units': 'Units',
  // `ownership` ist das Feld, `owned` einer seiner Werte. Im Deutschen heissen
  // beide "Eigentum" -- die Beschriftung und die erste Auswahl sind dort also
  // wortgleich. Englisch kann das trennen, und tut es hier.
  'inventory.ownership': 'Ownership',
  'inventory.owned': 'Owned',
  'inventory.rented': 'Rented',
  'inventory.subhire': 'Sub-hire',
  'inventory.scan': 'Resolve',
  'inventory.scanPh': 'Scan / enter code…',
  'inventory.scanNone': 'No match.',
  'inventory.import': 'Import',
  'inventory.importErr': 'Not a valid inventory file (avplan-inventory).',
  'inventory.importConfirm': 'REPLACE the existing inventory? Cancel = merge.',
  // Der Platzhalter {n} wird vom Aufrufer ersetzt und muss stehen bleiben.
  'inventory.importDone': '{n} items imported.',
  'inventory.export': 'Export',
  'inventory.exportHint': 'Export across apps',
  'inventory.fromImport': 'from import, preserved losslessly',

  // ── Gemeinsame Schaltflaechen ────────────────────────────────────────────
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.edit': 'Edit',
  'common.delete': 'Delete',
  // `about.close` steht bereits weiter oben im About-Block.
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
