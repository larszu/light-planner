# Integrating Light-Planner into Cable-Planner

This document describes how the lighting planner is structured for embedding in
a host app (Cable-Planner) and exactly what is done vs. what remains.

## Verified against cable-planner (larszu/cable-planner @ v8.0.10)

Checked against the real source, not the diagram:

- **three `^0.184.0`** — identical to light-planner (no dedupe conflict). r3f
  `@react-three/fiber ^9.6.1`; light-planner's `Scene3D` is raw three and works
  side-by-side, port to r3f later if desired.
- **zustand `^5`** — matches.
- **React `^19`** — light-planner is now bumped to React 19 to match (runs clean).
- **Canvas** is `reactflow ^11` (schematic) — keep the spatial `PlanCanvas`/`Scene3D`
  as a separate view, don't force it into ReactFlow.
- **i18n**: same `t(key, 'Deutsche Form')` model, `Language = 'de'|'en'` in the
  uiStore. NB cable-planner defaults to `language: 'en'`; point the planner's
  `useTranslation` at the host uiStore on mount (the `t` signature is identical).
- Cable-planner is **already lighting-aware**: `ProjectMetadata.defaultLightingControl:
  'dmx512'|'artnet'|'sacn'`, connector types include `DMX 5-pol (XLR)` / `PowerCON`,
  and equipment carries `categoryProps`, `powerConsumptionWatts`, `weightKg`.

### Real types used by the mapping (`src/integration/equipment.ts`)
`CpEquipmentItem`/`CpPort`/`CpConnectorType` mirror cable-planner's
`types/equipment.ts` (`EquipmentItem` with `inputs: Port[]` / `outputs: Port[]`,
px `x/y/width/height`, `categoryProps`, `powerConsumptionWatts`, `weightKg`).
`fixtureToEquipment` yields e.g. `inputs: [DMX In (U1.13), Power[PowerCON]]`,
`outputs: [DMX Thru]`, `category: 'Licht'` — drop straight into
`projectStore.addEquipment(...)`.

### Real bridge API (`src/integration/cablePlannerHost.ts`)
`window.bridge.project.{ saveProject(project, path?), openProject(), saveProjectAs() }`
and `window.bridge.fs.{ readFile, writeFile }`. The lighting document is embedded
in the host `CablePlannerProject` (host owns Save/Open), so `createCablePlannerHost`
takes `onSaveDocument` / `onLoadDocument` hooks; only image/PDF export touches
`bridge.fs` directly.

## Architecture seams (already in place)

```
src/core/         UI-free engine + types (no React / no zustand / no DOM runtime)
                  lightCalc · geometry · autoLighting · colorTemp · patch
                  gelLibrary · fixtureLibrary · index.ts (barrel) · re-exports ../types
src/integration/  the host seam
                  equipment.ts   Fixture → EquipmentItem (DMX + power ports)
                  hostAdapter.ts HostAdapter interface (files / export / AI)
                  browserHost.ts default standalone adapter (FSA + direct AI)
                  hostContext.tsx HostProvider + useHost()
src/store/        zustand
                  uiStore.ts        view/display settings + language
                  projectStore.ts   live LightingDocument (host-subscribable)
                  lightingDocument.ts  LightingDocument type + serialize/parse
src/i18n/         t('key','Deutsch') (German = source) + useTranslation()
```

The lighting **core** has no platform dependencies. Everything platform-bound
(files, export, AI) goes through a **HostAdapter**; the UI never calls browser
APIs directly. View state is in a **uiStore**; the live document is published to
a **projectStore** a host can read/subscribe to.

## How to mount in Cable-Planner

1. **Provide a host adapter.** Implement `HostAdapter` (src/integration/hostAdapter.ts)
   backed by Cable-Planner's bridge:
   - `exportFile` → host ExportDialog / `lib-export-pdf` / `bridge` file write.
   - `saveProjectFile` / `openProjectFile` → `bridge.project.*` (atomic write/.bak).
   - `extractDatasheet` → host `aiSuggestions` (+ `credentials` keychain).
   Wrap the planner: `<HostProvider adapter={cableHost}><App/></HostProvider>`.

2. **Embed the document.** The lighting plan is a `LightingDocument`
   (src/store/lightingDocument.ts). Put it under a `lighting` key in
   `CablePlannerProject` and (de)serialize with `serializeLightingDocument` /
   `parseLightingDocument`. Subscribe to `useProjectStore` for the live plan.

3. **Cable the lights.** Turn fixtures into equipment with
   `fixturesToEquipment(document.fixtures)` (src/integration/equipment.ts). Each
   light becomes an `EquipmentItem` with **DMX in/thru** + **power** ports,
   carrying the DMX patch (universe/address/channels) and watts — so the cable
   planner can route DMX/power and tally load. Map `EquipmentItem`/`EquipmentPort`
   onto Cable-Planner's `types/equipment.ts` (field names are chosen to line up).

4. **Mount as a view.** Cable-Planner's canvas is ReactFlow (schematic). The
   lighting plan is spatial — keep `PlanCanvas` / `Scene3D` as a separate
   **view/mode** reading from the shared stores, rather than forcing it into
   ReactFlow. Selection/layers should read the host's `uiStore`.

## Status

| Phase | Done |
|-------|------|
| 1. UI-free core (`src/core`) | ✅ |
| 2. Fixture↔Equipment mapping + HostAdapter seam | ✅ |
| 3. zustand uiStore (view) + projectStore (live doc) + serializer | ✅ |
| 4. i18n scaffold (`t(key,'Deutsch')`, de/en, language toggle) | ✅ chrome wrapped |

## Remaining mechanical steps (no architectural risk)

- **projectStore as single source of truth.** Today `App.tsx` still owns the
  document via `useState` and *publishes* it to `projectStore`. Moving the
  ~50 editor mutations into store actions/slices (and undo/redo into a
  transactional `projectHistory`) makes the store authoritative — the host then
  edits through it. The `LightingDocument` shape already defines the slice.
- **Finish i18n wrapping.** Wrap the remaining strings (PropertyPanel, dialogs,
  panels) with `t('key','Deutsch')` and add English keys to `src/i18n`.
- **Three.js dedupe.** Pin one `three` version shared with Cable-Planner's
  react-three-fiber (avoid two `three` instances). `Scene3D` can stay raw three
  or be ported to r3f later. Bundle `public/models/person.glb` + the pdf worker
  via the host's asset pipeline.
- **Properties/Library/Selection** into the host's dispatcher: fixture editor as
  a section in `EquipmentProperties`, fixture library into the LibraryPanel
  drag-drop flow, selection into `uiStore`/`selectionLifecycle`.
- **Folder move.** Relocate under `src/renderer/components/Light/…`,
  `src/renderer/types/lighting.ts`, `src/renderer/lib/…`; drop the standalone
  `vite.config`/`index.html` for the host's electron-vite build.

## What can be reused verbatim

`src/core/*` (engine), the DMX patch (`autoPatch`/`findPatchConflicts` — the
bridge to the cable model), heat-map, photo mode, scenes, layers logic.
