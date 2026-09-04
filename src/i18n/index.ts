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
  'tool.stage': 'Riser',
  'tool.stagepoly': 'Stage (polygon)',
  'tool.truss': 'Truss',
  'tool.wall': 'Wall',
  'tool.camera': 'Camera',
  'tool.heatmap': 'Heat-map',
  'tool.photo': 'Photo',
  'tool.grid': 'Grid',
  'tool.floorplan': 'Floor plan',
  'tool.export': 'Export',
  'tool.rail': 'Tools',
  // Kurzhilfen der Werkzeugleiste (B-13, 2026-09-04). Sie standen vorher nur
  // deutsch im Titel-Attribut jedes Knopfes.
  'tool.select.hint': 'Select & move — V',
  'tool.pan.hint': 'Pan the view — space/H',
  'tool.person.hint': 'Place a person',
  'tool.stage.hint': 'Draw a rectangular riser',
  'tool.stagepoly.hint': 'Draw a stage as a polygon',
  'tool.truss.hint': 'Drag a truss',
  'tool.wall.hint': 'Draw a wall path',
  'tool.camera.hint': 'Set a camera position (not photo mode)',
  'tool.rect.hint': 'Draw a rectangle / marker',
  'tool.line.hint': 'Draw a line',
  'tool.measure.hint': 'Measure a distance',
  // Fehlerschirm (Class-Komponente, ueber `translate` aufgeloest).
  'error.title': 'Something went wrong',
  'error.retry': 'Try again',
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

  // ── B-23: Dialoge und Panels, die vorher gar nicht gewickelt waren ───────
  //
  // Diese Gruppe kam nicht dazu, weil Schluessel fehlten, sondern weil der
  // TEXT nicht in `t()` stand. `i18n:check` hatte deshalb bis zuletzt "alle
  // erreichbaren Schluessel abgedeckt" gemeldet -- ueber Text ohne Schluessel
  // kann er nichts sagen. Seit `#61` steht die Zahl der ungewickelten
  // Komponenten unter jedem Lauf; diese neun sind damit abgeraeumt.

  // AreaLightDialog
  'dlg.area.title': 'Light up area',
  'dlg.area.lightFrom': 'Light from',
  'dlg.area.hintPre': 'Selected area',
  'dlg.area.hintPost': '. Choose which sides the light should come from – the target lux is reached evenly no matter how many sides you pick.',
  // Der Knopf zeigt den ersten Buchstaben: N/W/E/S statt N/W/O/S.
  'dlg.area.north': 'North',
  'dlg.area.west': 'West',
  'dlg.area.east': 'East',
  'dlg.area.south': 'South',
  'dlg.area.area': 'Area',
  'dlg.area.preset1': 'One side (N)',
  'dlg.area.presetNS': 'Crossed N–S',
  'dlg.area.presetEW': 'Crossed E–W',
  'dlg.area.presetAll': 'All sides',
  'dlg.area.targetLux': 'Target illuminance',
  'dlg.area.fixtureType': 'Fixture type',
  'dlg.area.distribution': 'Distribution',
  'dlg.area.straight': 'Straight',
  'dlg.area.cross': 'Crossed',
  'dlg.area.truss': 'Truss',
  'dlg.area.sidesOption': 'Sides (see compass)',
  'dlg.area.trussN': 'Truss',
  'dlg.area.throw': 'Distance / throw',
  'dlg.area.crossHint': '⤬ Crossed: beams cross each other – even and modelling (McCandless). Works from the front alone, too.',
  'dlg.area.straightHint': '‖ Straight: parallel beams, frontal look with a steeper fall-off.',
  'dlg.area.physics': 'Physics: illuminance falls with 1/d² (inverse-square law) and with the cosine of the angle of incidence. Two beams crossed at ~45° each compensate the fall-off of the opposite side → more even, and with less flat shadows than a blunt frontal light.',
  'dlg.area.generate': 'Generate',

  // CanvasActions
  'canvas.align': 'Align',
  'canvas.alignX': 'Align horizontally (X)',
  'canvas.alignY': 'Align vertically (Y)',
  'canvas.alignZ': 'To the same height (Z)',
  'canvas.distH': 'Distribute horizontally',
  'canvas.distV': 'Distribute vertically',
  'canvas.group': 'Group',
  'canvas.ungroup': 'Ungroup',
  'canvas.rotateMinus': 'Rotate −15°',
  'canvas.rotatePlus': 'Rotate +15°',
  'canvas.autoLight': 'Auto light',
  'canvas.threePoint': '3-point',
  'canvas.threePointHint': 'Three-point lighting for the selection',
  'canvas.threePointConfig': 'Configure three-point…',
  'canvas.area': 'Area',
  'canvas.areaHint': 'Light the area evenly',
  'canvas.ceiling': 'Ceiling',
  'canvas.ceilingHint': 'Build a ceiling from the walls',

  // ThreePointDialog
  'dlg.3pt.title': 'Configure three-point lighting',
  'dlg.3pt.hint': 'Lighting the way a cinematographer would: the key sets the brightness, the fill follows from the contrast ratio, the back light is the accent.',
  'dlg.3pt.goal': 'Lighting target',
  'dlg.3pt.keyTarget': 'Key target',
  // {key} und {fill} werden vom Aufrufer ersetzt und muessen stehen bleiben.
  'dlg.3pt.dimmedTo': 'Key is dimmed to {key} lx, fill to {fill} lx',
  'dlg.3pt.manual': 'Manual: the key dimmer is used as set',
  'dlg.3pt.position': 'Fixture positions',
  'dlg.3pt.freePos': 'Free position (no truss)',
  'dlg.3pt.trussN': 'Truss',
  'dlg.3pt.distance': 'Distance to the person',
  'dlg.3pt.onTruss': 'Key and fill go onto the truss (same height, clean spacing). The back light stays behind the person.',
  'dlg.3pt.noTruss': 'Without a truss: key and fill stand at the distance set here (instead of at random).',
  'dlg.3pt.ratio': 'Contrast ratio (key : fill)',
  'dlg.3pt.ratio15': '1.5:1 – very soft (flat/TV)',
  'dlg.3pt.ratio2': '2:1 – soft (Deakins standard)',
  'dlg.3pt.ratio3': '3:1 – natural',
  'dlg.3pt.ratio4': '4:1 – dramatic',
  'dlg.3pt.ratio8': '8:1 – noir / low-key',
  'dlg.3pt.backStrength': 'Back strength',
  'dlg.3pt.key': 'Key (main light)',
  'dlg.3pt.dimmer': 'Dimmer',
  'dlg.3pt.fill': 'Fill',
  'dlg.3pt.calcLux': 'Dimmer is calculated: ~{lx} lx',
  'dlg.3pt.calcRatio': 'Dimmer is calculated: key/{ratio}',
  'dlg.3pt.back': 'Back (rim light)',
  'dlg.3pt.backIntensity': 'Back intensity:',
  'dlg.3pt.generate': 'Generate',

  // ProjectDialog
  'dlg.proj.saveTitle': 'Save project',
  'dlg.proj.name': 'Project name',
  'dlg.proj.namePh': 'My lighting plan',
  'dlg.proj.author': 'Author',
  'dlg.proj.authorPh': 'Name',
  'dlg.proj.version': 'Version',
  'dlg.proj.notes': 'Notes',
  'dlg.proj.notesPh': 'Description…',
  'dlg.proj.whereHead': 'Where does this go?',
  'dlg.proj.whereBody': '"Save" puts the project into this device\'s browser storage – with no visible file path, and tied to this device. For a real file in a location you choose, use',
  'dlg.proj.whereFile': '"Save as file…"',
  'dlg.proj.toFile': 'Save as file…',
  'dlg.proj.toFileHint': 'Save as a project file in a location you choose',
  'dlg.proj.saveDevice': 'Save (device)',
  'dlg.proj.loadTitle': 'Load project',
  'dlg.proj.empty': 'No projects stored on this device.',
  'dlg.proj.emptyFile': 'You can open a project file (.lightplan.json) below via "Load from file…".',
  'dlg.proj.noAuthor': 'No author',
  'dlg.proj.fromFile': 'Load from file…',
  'dlg.proj.fromFileHint': 'Open a project file you exported earlier',

  // ChangesDialog
  'dlg.chg.tabLog': 'Log',
  'dlg.chg.tabUndo': 'Undo steps',
  'dlg.chg.tabDiff': 'Since last version',
  'dlg.chg.noLog': 'Nothing has happened in this session yet.',
  'dlg.chg.redoHead': 'Redoable (Ctrl Y)',
  'dlg.chg.redo': 'Redo',
  'dlg.chg.current': 'Current state',
  'dlg.chg.noUndo': 'Nothing to undo.',
  'dlg.chg.undoHead': 'Last steps (Ctrl Z)',
  'dlg.chg.undoTo': 'Undo up to here',
  'dlg.chg.noVersion': 'No saved version yet. Save the current state to compare against it later.',
  'dlg.chg.namePh': 'Name this version…',
  'dlg.chg.save': 'Save',
  'dlg.chg.saveNow': 'Save now',
  // Ein Wort je Zahlform statt einer angehaengten Endung.
  'dlg.chg.changeOne': 'change',
  'dlg.chg.changeMany': 'changes',
  'dlg.chg.since': 'since',
  'dlg.chg.stateAt': 'State',
  'dlg.chg.noChanges': 'No changes since the last version.',
  'dlg.chg.untitled': 'Lighting plan',

  // ScaleDialog
  'dlg.scale.title': 'Calibrate scale',
  'dlg.scale.hintPre': 'The line you drew currently measures',
  'dlg.scale.hintPost': '. Enter its real length – the floor plan is scaled to match.',
  'dlg.scale.realLength': 'Real length',
  'dlg.scale.factorPre': 'The plan is scaled by a factor of',
  'dlg.scale.enlarged': 'up',
  'dlg.scale.reduced': 'down',
  'dlg.scale.apply': 'Apply',

  // Panels (Ebenen, Szenen, Grundriss)
  'panel.expand': 'Expand',
  'panel.collapse': 'Collapse',
  'panel.layers.hide': 'Hide',
  'panel.layers.show': 'Show',
  'panel.layers.unlock': 'Unlock',
  'panel.layers.lock': 'Lock (not selectable)',
  'panel.scene.title': 'Scenes',
  'panel.scene.save': 'Save the current look',
  'panel.scene.saveHint': 'Store the current look as a new scene',
  'panel.scene.empty': 'No scenes yet. Set your fixtures and save the look.',
  'panel.scene.overwrite': 'Overwrite with the current look',
  'panel.scene.rename': 'Rename',
  'panel.scene.delete': 'Delete scene',
  'panel.floor.title': 'Floor plan',
  'panel.floor.remove': 'Remove floor plan',
  'panel.floor.page': 'Page',
  'panel.floor.width': 'Width',
  'panel.floor.height': 'Height',
  'panel.floor.scale': 'Scale',
  'panel.floor.opacity': 'Opacity',
  'panel.floor.lock': 'Lock',

  'common.close': 'Close',
  // `about.close` steht bereits weiter oben im About-Block.
  // ── Topbar (B-13, gewickelt 2026-09-04) ──────────────────────────────────
  'top.untitled': 'Untitled',
  'top.menu': 'Menu',
  'top.file': 'File',
  'top.edit': 'Edit',
  'top.new': 'New',
  'top.kbdNew': 'Ctrl N',
  'top.saveBrowser': 'Save (browser)',
  'top.kbdSave': 'Ctrl S',
  'top.loadBrowser': 'Load (browser)…',
  'top.saveFile': 'Project to file…',
  'top.loadFile': 'Open project file…',
  'top.exportAvplan': 'Export whole project (.avplan)…',
  'top.exportAvplanHint':
    'Export the whole project (venue + light + cameras + cabling) losslessly — readable by all three apps, foreign data is preserved',
  'top.importAvplan': 'Import whole project (.avplan)…',
  'top.importAvplanHint':
    'Import a whole project (.avplan) — light is loaded editable, camera/cabling data is preserved losslessly',
  'top.exportVenue': 'Export venue (.venue.json)…',
  'top.exportVenueHint':
    'Export the shared venue (walls, stage, people, floor plan) — importable in MultiCam Planner',
  'top.importVenue': 'Import venue…',
  'top.importVenueHint':
    'Import a shared venue — replaces walls, stage, people and floor plan; fixtures stay',
  'top.printPlot': 'Print light plot (PDF, title block + legend)…',
  'top.exportPng': 'Export as PNG…',
  'top.exportJpg': 'Export as JPG…',
  'top.exportPdf': 'Export as PDF (image)…',
  'top.undo': 'Undo',
  'top.kbdUndo': 'Ctrl Z',
  'top.redo': 'Redo',
  'top.kbdRedo': 'Ctrl Y',
  'top.changes': 'History & changes…',
  'top.versions': 'Versions & comparison…',
  'top.about': 'About LightPlanner',
  'top.view': 'View',
  'top.plan2d': '2D plan',
  'top.view3d': '3D',
  'top.render': 'Render',
  'top.renderHint':
    'Render: photoreal preview of the 3D scene (real fixtures, shadows, beams, realistic people)',
  'top.heatmap': 'Heat-map (colour by illuminance)',
  'top.heatmapSection': 'Heat-map',
  'top.displaySettings': 'Display & render settings',
  'top.exposure': 'Exposure',
  'top.ambience': 'Ambience',
  'top.haze': 'Haze',
  'top.beams': 'Beams',
  'top.floor': 'Floor',
  'top.floorColor': 'Floor colour',
  'top.renderOnlyHint': 'Exposure, floor and beams appear in Render mode only.',
  'top.scaleMax': 'Scale max',
  'top.target': 'Target',
  'top.sun': 'Sun / daylight',
  'top.sunOn': 'Sun active',
  'top.sunHint':
    'Real sun: daylight & shadows from location, date and time – falls through windows into the room.',
  'top.date': 'Date',
  'top.time': 'Time',
  'top.latitude': 'Latitude',
  'top.longitude': 'Longitude',
  'top.north': 'North ↻',
  'top.intensity': 'Intensity',
  // Platzhalter bleiben unveraendert: {alt}/{az} werden im Code ersetzt.
  'top.sunPos':
    'Sun position: {alt}° above the horizon · azimuth {az}° (0 = N). Falls through windows into the room.',
  'top.sunBelow': 'The sun is below the horizon – no direct daylight.',
  'top.snap': 'Snap',
  'top.focusNotes': 'Focus notes (plan)',
  'top.focusNotesHint': 'Show per-fixture focus notes in the 2D plan',
  'top.importFloorPlan': 'Import floor plan (JPG/PNG/PDF)',
  'top.schedule': 'Schedule',
  'top.export': 'Export',
  'top.save': 'Save',

  // ── Statusleiste ─────────────────────────────────────────────────────────
  'status.plan2d': '2D plan',
  'status.render': 'Render',
  'status.view3d': '3D',
  'status.selected': 'selected',
  'status.muted': 'muted',
  'status.exposure': 'Exposure',
  'status.haze': 'Haze',
  'status.snap': 'Snap',
  'status.snapOff': 'off',
  'status.scene': 'Scene',

  // ── Bibliothek (Sidebar) ─────────────────────────────────────────────────
  'sidebar.title': 'Fixture library',
  'sidebar.hint': 'Drag & drop or click',
  'sidebar.search': 'Search…',
  'sidebar.attachments': 'accessories available',
  'sidebar.addCustom': '+ Add custom fixture',

  // Kategorien der Bibliothek. Schluessel folgen `FixtureCategory`, damit eine
  // neue Kategorie hier auffaellt statt still deutsch zu bleiben.
  'fixtureCategory.profile': 'Profile spots',
  'fixtureCategory.fresnel': 'Fresnels',
  'fixtureCategory.par': 'PAR cans',
  'fixtureCategory.wash': 'LED wash',
  'fixtureCategory.spot': 'LED spot',
  'fixtureCategory.beam': 'Beam effect',
  'fixtureCategory.moving-wash': 'Moving head wash',
  'fixtureCategory.moving-spot': 'Moving head spot',
  'fixtureCategory.moving-beam': 'Moving head beam',
  'fixtureCategory.blinder': 'Blinder / strobe',
  'fixtureCategory.cyc': 'Cyc lights',
  'fixtureCategory.flood': 'Floods',
  'fixtureCategory.followspot': 'Followspots',
  'fixtureCategory.led-panel': 'LED panels',
  'fixtureCategory.custom': 'Custom',

  // ── Versionen & Vergleich ────────────────────────────────────────────────
  'version.title': 'Versions & comparison',
  'version.namePlaceholder': 'Name this version (e.g. after rehearsal 1)…',
  'version.save': 'Save',
  'version.empty': 'No versions yet. Save the current state to compare against it later.',
  'version.fixtures': 'fixtures',
  'version.restore': 'Load this version',
  'version.delete': 'Delete version',
  'version.restoreConfirm': 'Load version „{label}"? Unsaved changes will be lost.',
  'version.pick': 'Pick a version on the left to see what changed since then.',
  'version.noDiff': 'No differences from the current state.',
  'version.change': 'change',
  'version.changes': 'changes',
  'version.since': 'since',
  'version.current': 'current',
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
