<h1 align="center">💡 LightPlanner</h1>

<p align="center">
  A quick lighting sketch — without paper
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue" />
  <img src="https://img.shields.io/badge/offline-ready-success" />
  <img src="https://img.shields.io/badge/built%20with-Electron%20%2B%20React%20%2B%20Three.js-9cf" />
  <img src="https://img.shields.io/badge/typescript-strongly%20typed-blue" />
  <img src="https://img.shields.io/badge/status-early-orange" />
  <img src="https://img.shields.io/badge/license-MIT-lightgrey" />
</p>

---

## ✨ What it is

**LightPlanner** is a small desktop app for quickly sketching out a lighting setup.
The kind of plan you'd otherwise scribble on the back of a call sheet — just on a 2D canvas with a little 3D preview on top.

It is **not** a replacement for Vectorworks, or Capture. It's the tool you reach for when you just want to think through where the lights go before you start rigging.

✔ Runs offline on macOS & Windows
✔ Drop in fixtures, drag the aim point, see roughly where the light lands
✔ Save the plan as a single file and move on

---

## 🧰 What's in it

### 🗺️ 2D plan view
- Pan / zoom canvas with a metre grid
- Drop fixtures, drag them around, drag the aim point
- Multi-select, group, undo / redo
- Stick a stage, a podium or a person on the floor for reference

### 📐 Import a building plan
- Drop in a floor plan as **JPG, PNG or PDF** (multi-page PDFs let you flip between pages)
- **Calibrate the scale**: drag a line along something you know the length of (a wall, a scale bar), type the real distance, and the whole plan snaps to the right size
- Nudge it into place, dial the opacity down, and lock it so you don't move it by accident
- Now everything you draw on top is to scale

### 🧊 3D preview
- A simple Three.js view of the room with the cones drawn in
- Useful to sanity-check angles and heights
- Screenshot button for sharing

### 🔆 Lux heatmap
- A rough lux estimate on the floor based on the fixtures' photometric data
- Switch on a target value to colour the floor by under / on / over
- Not a replacement for a real photometric study — close enough for a sketch

### 🎚️ A fixture & gel library
- Source Fours, PARs, Fresnels, LED panels and a few moving heads
- Current Elation LED range built in — KL Fresnel 8 FC, KL Panel, KL Profile FC, KL PAR FC, Fuze, …
- LEE & Rosco CTO / CTB / frost gels
- Add your own custom fixture — or **let the AI pull the specs from a datasheet** (paste the text, it fills the photometric/beam/power fields and shows where each value came from so you can check it)

### 📋 Patch & paperwork
- Auto-number the rig and auto-patch DMX (universe / address, footprint-aware, with clash detection)
- Equipment list, instrument schedule and an electrical-load summary (kW, A per phase, 16 A circuits) — export to CSV
- Trusses / hanging positions you can draw and label

### 🎬 Auto-place helpers
- One-click 3-point lighting around a person
- "Fill an area evenly" generator for a stage or podium
- Useful starting points — you'll still want to nudge things by hand

### 💾 Save / open · export
- One project file with everything in it — fixtures, trusses, and the calibrated building plan — in local storage, no cloud
- File menu with undo / redo, and export of the current view as PNG, JPG or PDF

---

## 🚀 Getting started

Download the latest release from the [Releases page](https://github.com/larszu/light-planner/releases) — pick the installer or portable build for your platform.

Or run from source:

```bash
npm install
npm run dev          # web preview in the browser
npm run electron:dev # the actual desktop app
```

---

## 🧪 Tech

Electron · React · TypeScript · Three.js · Vite · electron-builder.

---

## ⚠️ Status

Early. Things will change. Use it for sketches, not for paperwork you have to hand in.

---

## 👤 Author

**Lars Zumpe**

---

## ❤️ Coffee?

<p>
  <a href="https://paypal.me/larszumpe">
    <img src="https://img.shields.io/badge/PayPal-larszumpe-00457C?logo=paypal&logoColor=white" alt="Donate via PayPal" />
  </a>
</p>

Totally optional — the app will be MIT-licensed and free either way.

---

## 📄 License

MIT
