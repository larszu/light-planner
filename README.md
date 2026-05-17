<h1 align="center">💡 LightPlanner</h1>

<p align="center">
  Photometric stage & studio lighting design for film, broadcast and live events
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue" />
  <img src="https://img.shields.io/badge/offline-ready-success" />
  <img src="https://img.shields.io/badge/built%20with-Electron%20%2B%20React%20%2B%20Three.js-9cf" />
  <img src="https://img.shields.io/badge/typescript-strongly%20typed-blue" />
  <img src="https://img.shields.io/badge/status-active%20development-orange" />
  <img src="https://img.shields.io/badge/license-MIT-lightgrey" />
</p>

<p align="center">
  Plan, visualize, and verify stage lighting designs with a real photometric engine.
</p>

---

## ✨ Overview

**LightPlanner** is a desktop application for designing, simulating, and documenting theatrical, studio and live-event lighting plots.
Built with **Electron, React, TypeScript and Three.js**, it combines a 2D plan view with a true 3D venue view and a quantitative lux heatmap driven by manufacturer photometric data.

It is built for the people who actually rig and operate the lights — DPs, gaffers, LDs, location scouts and broadcast designers — and it works without an internet connection.

✔ Fully offline desktop application
✔ macOS & Windows support
✔ Physically grounded lux & candela calculations
✔ Curated library of real-world fixtures, gels and lamps

---

## ✨ Core Features

### 🗺️ 2D Plan View
- Pan, zoom, snap-to-grid canvas
- Floor-plan image import with metre-scale calibration
- Drag-and-drop fixture placement
- Interactive aim point (click & drag the beam target)
- Multi-select, group / ungroup, undo / redo (Ctrl+Z / Ctrl+Y)
- Shapes, dimensions, walls & stage podiums
- Persons on stage with height parameter

---

### 🧊 3D Venue View
- Real-time Three.js scene with venue, podiums and fixtures
- Volumetric beam cones drawn at the 10 % field-angle so the cone edge matches the heatmap fade-out
- Orbit / pan / zoom navigation
- 3D heatmap projected onto the stage floor
- Screenshot export of the full 3D view

---

### 🔆 Photometric Engine
- Gaussian beam model with elliptical-beam support (PARs, washes, blinders)
- Lux calculation from either:
  - **Manufacturer photometric data** (lux at distance, beam angle)
  - **Lumens** with proper 2-D Gaussian flux integral as a fallback
- Zoom & frost flux-conservation compensation (peak candela scales as (refAngle / effectiveAngle)²)
- Per-fixture dimming, attachments, gel stacks and body rotation all feed the engine
- Live peak-lux readout at the aim point in the property panel

---

### 🎚️ Fixture Library
- Curated catalogue of real broadcast & theatre fixtures:
  - ETC Source Four (fixed & zoom), Profile spots, Fresnels
  - PAR 64 / 56 with CP60 / CP61 / CP62 lamps (elliptical beams)
  - Aputure LS-series, ARRI Skypanel, LED panels & washes
  - Moving heads (wash, spot, beam) and blinders
  - Cyc / horizon lights and floodlights
- Photometric reference data per fixture (lux × distance)
- Mount type & weight tracking
- **Custom fixtures** with full attribute editor
- Fixture swap on placed instances without losing position / aim

---

### 🎨 Gels & Color
- LEE & Rosco gel libraries (CTO, CTB, frost / diffusion, colour)
- Stacked-gel transmission and mired-shift colour-temp model
- Frost / diffusion correctly widens the beam **and** preserves total flux
- Per-fixture CCT, tunable-white range and beam-colour preview

---

### 🌡️ Heatmap & Targeting
- Lux heatmap overlay in both 2D and 3D
- Standard heat palette (blue → cyan → green → yellow → red)
- **Target-lux mode** with 3-zone colouring (under-lit, on-target, over-lit)
- Real-time readout while moving fixtures, zooming or dimming

---

### 🎬 Auto-Lighting
- **3-point lighting** generator (key / fill / back) with configurable contrast ratio
- **Even-distribution** generator using front and back trusses with 45° elevation
- Optional target-lux dimming — the engine back-solves dimmer values for you
- Cinematographic defaults from Roger Deakins / classic film references

---

### 💾 Project Management
- Local JSON project files (`.lpj`)
- New / Open / Save / Save As workflows
- Custom fixtures, fixture groups, shapes, persons and podiums all persist
- Project meta (name, author, notes, version, timestamps)

---

### 🖼️ Export
- 2D plan screenshot export
- 3D view screenshot export
- Named output files for production paperwork

---

## ⚙️ Experimental / Planned

- 📄 PDF cue-sheet & fixture-list export
- 🎛️ DMX patch sheet generation
- 🎯 Soft-Gaussian (super-Gaussian) beam model for fixtures whose 50 % and 10 % angles don't fit a single σ
- 🌐 Multi-user / cloud-sync collaboration

---

## 🧪 Tech Stack

- **Electron** — desktop runtime (Windows + macOS)
- **React** + **TypeScript** — UI
- **Three.js** — 3D venue renderer
- **Vite** — dev server & bundler
- **electron-builder** — installer / portable / DMG builds via GitHub Actions

---

## 👤 Author

Built and maintained by **Lars Zumpe**

---

## ❤️ Support / Donate

If LightPlanner saves you time on your next show, consider buying me a coffee:

<p>
  <a href="https://paypal.me/larszumpe">
    <img src="https://img.shields.io/badge/PayPal-larszumpe-00457C?logo=paypal&logoColor=white" alt="Donate via PayPal" />
  </a>
</p>

Donations are completely optional — the app will be MIT-licensed and free either way. 🙌

---

## 📄 License

MIT
