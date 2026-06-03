// Fast pose-tuning harness: loads person.glb into a bare three scene and lets a
// puppeteer script set bone rotations live (no reload) + recenter on the ground,
// so we can dial in the sitting pose by screenshotting candidates. Dev-only.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const W = 720, H = 900;
const root = document.getElementById('root')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
root.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#3a3f4a');
const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100);
camera.position.set(2.4, 1.0, 3.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.7, 0);

scene.add(new THREE.HemisphereLight('#ffffff', '#404040', 1.1));
const dir = new THREE.DirectionalLight('#ffffff', 1.4); dir.position.set(3, 6, 4); scene.add(dir);
const grid = new THREE.GridHelper(6, 12, '#888', '#555'); scene.add(grid);

let model: THREE.Group | null = null;
const bind = new Map<string, THREE.Euler>();

function xhrBuf(url: string): Promise<ArrayBuffer> {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest(); x.open('GET', url, true); x.responseType = 'arraybuffer';
    x.onload = () => (x.status === 0 || (x.status >= 200 && x.status < 300)) ? res(x.response) : rej(new Error('HTTP ' + x.status));
    x.onerror = () => rej(new Error('net')); x.send();
  });
}

// Lowest skinned-vertex Y in world (true posed bbox bottom), for grounding.
function posedMinY(o: THREE.Object3D): number {
  o.updateMatrixWorld(true);
  let min = Infinity; const v = new THREE.Vector3();
  o.traverse((c) => {
    const sm = c as THREE.SkinnedMesh;
    if (!(sm as unknown as THREE.Mesh).isMesh) return;
    if ((sm as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh && sm.skeleton) sm.skeleton.update();
    const pos = sm.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) { sm.getVertexPosition(i, v); v.applyMatrix4(sm.matrixWorld); if (v.y < min) min = v.y; }
  });
  return min;
}

(async () => {
  const buf = await xhrBuf(`${import.meta.env.BASE_URL}models/person.glb`);
  const g = await new GLTFLoader().parseAsync(buf, '');
  model = g.scene;
  model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { const mats = Array.isArray(m.material) ? m.material : [m.material]; mats.forEach((mm) => { const s = mm as THREE.MeshStandardMaterial; if (s.emissive) s.emissiveIntensity = 0; }); } });
  // Drop the novelty "Reindeer Glasses" accessory (glasses + red nose + antlers).
  model.traverse((o) => { if (/glasses/i.test(o.name)) o.visible = false; });
  model.updateMatrixWorld(true);
  model.traverse((o) => { if ((o as THREE.Bone).isBone) bind.set(o.name, o.rotation.clone()); });
  // normalize height to ~1.7 m
  const box = new THREE.Box3().setFromObject(model);
  const s = 1.7 / Math.max(0.1, box.max.y - box.min.y);
  model.scale.setScalar(s);
  scene.add(model);
  ground();
  (window as unknown as { __poseReady?: boolean }).__poseReady = true;
})();

function ground() {
  if (!model) return;
  model.position.y = 0; model.updateMatrixWorld(true);
  const minY = posedMinY(model);
  model.position.y = -minY;
}

interface PoseMap { [bone: string]: [number, number?, number?] }
(window as unknown as { __pose?: unknown }).__pose = {
  bones: () => Array.from(bind.keys()),
  // reset every known bone to bind, then add the given deltas (same += semantics
  // as applySitPose), then ground the figure.
  set: (map: PoseMap) => {
    if (!model) return;
    bind.forEach((eul, name) => { const b = model!.getObjectByName(name); if (b) b.rotation.copy(eul); });
    for (const [name, d] of Object.entries(map)) {
      const b = model.getObjectByName(name);
      if (b) { b.rotation.x += d[0] || 0; b.rotation.y += d[1] || 0; b.rotation.z += d[2] || 0; }
    }
    ground();
  },
  view: (px: number, py: number, pz: number, tx = 0, ty = 0.6, tz = 0) => { camera.position.set(px, py, pz); controls.target.set(tx, ty, tz); controls.update(); },
};

renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
