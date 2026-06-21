import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { PlacedFixture, Person, StageElement, Truss, Wall, Ceiling, FloorPlan, Layers, CameraView, FloorMaterial } from '../types';
import { computeHeatMap, surfaceLux, luxToColor, luxToColorTarget, effectiveFieldAngleDeg, peakCandela } from '../core/lightCalc';
import { getBeamColorHex } from '../core/colorTemp';
import { sampleWall, isCurved, pointInPolygon, wallSegments, normalizedWindows, type NormWindow } from '../core/geometry';
import { floorPreset, wallPreset, surfaceCanvas, DEFAULT_FLOOR, type SurfacePreset } from '../core/surfaceTextures';
import type { ResolvedSun } from '../core/sun';

// Candela → three.js spotlight intensity. Keeps relative brightness physical
// (ratios + 1/r² falloff); the exposure control handles absolute calibration.
const LIGHT_K = 0.0032;

// ── Volumetric haze-beam shader (photo view, raymarched) ─────────────────────
// A real beam in haze is light scattered through the beam *volume*, so the eye
// integrates a bright core with soft edges. We render the bounding cone's near
// wall and raymarch the view ray forward through the cone, integrating the beam's
// own Gaussian radial profile (10 % at the field angle — the σ the heat-map uses)
// with a ~1/d² scatter that's denser near the lamp. A per-pixel jitter hides the
// step count. Density is driven entirely by the haze slider (haze 0 ⇒ nothing).
const BEAM_VERT = /* glsl */`
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const BEAM_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vWorldPos;
  uniform vec3 uApex;     // lamp position (world)
  uniform vec3 uDir;      // unit axis apex→aim (world)
  uniform float uHeight;  // apex→floor distance
  uniform float uSigma;   // Gaussian σ (rad), anchored on the field angle
  uniform vec3 uColor; uniform float uHaze; uniform float uIntensity; uniform float uTipFade; uniform float uGain;
  uniform float uHG;      // Henyey–Greenstein asymmetry (forward scatter, 0..~0.9)
  uniform float uExtinct; // haze extinction coefficient per metre (per unit haze)
  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.31, 289.07))) * 43758.5453); }
  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorldPos - ro);
    float far = length(vWorldPos - ro);       // far wall (BackSide) — always present
    const int STEPS = 24;
    float step = uHeight / float(STEPS);
    float jitter = hash(gl_FragCoord.xy) * step;
    float k = uHG, kk = uHG * uHG;
    float sigT = uExtinct * uHaze;            // extinction per metre
    // Single-scattering integral along the view ray, marching from the cone's far
    // wall back toward the camera (so the shaft is visible from any orbit/inside):
    //   L = ∫ phase(α)·E(P)·T_light·T_view ds,  E = I(θ)/d² (true inverse-square).
    float acc = 0.0;
    for (int i = 0; i < STEPS; i++) {
      float s = far - jitter - float(i) * step; // distance from camera; march toward it
      if (s <= 0.0) break;                       // don't sample behind the camera
      vec3 P = ro + rd * s;
      vec3 toP = P - uApex;
      float axial = dot(toP, uDir);
      if (axial < 0.0 || axial > uHeight) continue;
      float d2 = dot(toP, toP);                  // |lamp→P|²
      float d = sqrt(d2);
      float radial = sqrt(max(0.0, d2 - axial * axial));
      float theta = atan(radial / max(axial, 1e-3));
      float Iprof = exp(-(theta * theta) / (2.0 * uSigma * uSigma));   // beam intensity I(θ)
      float E = Iprof / max(d2, 0.09);            // irradiance (1/d², clamped at the lens)
      float cosA = dot(toP / d, -rd);             // light propagation · view-to-camera
      float phase = (1.0 - kk) / pow(max(1e-4, 1.0 + kk - 2.0 * k * cosA), 1.5); // Henyey–Greenstein
      float trans = exp(-sigT * (d + s));         // Beer–Lambert: light path + view path
      float tip = smoothstep(0.0, uTipFade * uHeight, axial);
      acc += E * phase * trans * tip;
    }
    // Accumulated optical depth → medium opacity (1 − e^−τ).
    float tau = acc * step * uHaze * uIntensity * uGain;
    float a = (1.0 - exp(-tau)) * 0.9;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
  }`;

// Bend the standard (Mixamo/RPM) skeleton into a seated pose: thighs forward,
// knees bent, slight forward lean + arms resting. Tuned for the bundled avatar.
function applySitPose(root: THREE.Object3D) {
  const rot = (name: string, x: number, y = 0, z = 0) => {
    const b = root.getObjectByName(name);
    if (b) { b.rotation.x += x; b.rotation.y += y; b.rotation.z += z; }
  };
  // Anatomically: hips flex the thighs forward (toward where the chest/face
  // point) and the knees drop the shins straight down — both on this rig need a
  // negative X (a positive X sat the figure on backwards, legs trailing behind).
  // Feet flat, gentle lean, hands resting. Verified in the pose harness.
  rot('LeftUpLeg', -1.45, 0, 0.12);
  rot('RightUpLeg', -1.45, 0, -0.12);
  rot('LeftLeg', -1.55);
  rot('RightLeg', -1.55);
  rot('LeftFoot', 0.2);
  rot('RightFoot', 0.2);
  rot('Spine', 0.06);
  rot('Spine1', 0.04);
  rot('LeftArm', 0.45, 0, 0.1);
  rot('RightArm', 0.45, 0, -0.1);
}

// Lowest skinned-vertex world Y for a posed model — used to rest the figure on
// the floor/podium exactly (the bind-pose bounding box is wrong once posed).
function posedMinWorldY(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  let min = Infinity; const v = new THREE.Vector3();
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (!(sm as unknown as THREE.Mesh).isMesh) return;
    if ((sm as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh && sm.skeleton) sm.skeleton.update();
    const pos = sm.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) { sm.getVertexPosition(i, v); v.applyMatrix4(sm.matrixWorld); if (v.y < min) min = v.y; }
  });
  return min === Infinity ? 0 : min;
}

// A real (textured) human model, loaded once and reused for the photo view so
// people cast and receive real shadows. Falls back to the simple cylinder when
// it isn't loaded (or in the non-photo view).
interface PersonModel { scene: THREE.Group; height: number; minY: number }
let personModelPromise: Promise<PersonModel> | null = null;

// Load the model bytes via XHR rather than three's fetch-based FileLoader:
// fetch() can't read file:// URLs, so the packaged Electron app (which serves
// the UI from file://) would otherwise fail to load the GLB and fall back to
// the stand-in figure. XHR handles both http(s) and file:// (status 0 = ok).
function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300))
      ? resolve(xhr.response as ArrayBuffer)
      : reject(new Error(`HTTP ${xhr.status} for ${url}`));
    xhr.onerror = () => reject(new Error(`network error for ${url}`));
    xhr.send();
  });
}

function loadPersonModel(): Promise<PersonModel> {
  if (!personModelPromise) {
    const url = `${import.meta.env.BASE_URL}models/person.glb`;
    const loader = new GLTFLoader();
    // GLTFLoader decodes embedded texture blobs via ImageBitmapLoader
    // (createImageBitmap) by default. Under Electron's file:// origin that path
    // fails on blob: URLs ("Couldn't load texture blob"), leaving every material
    // white. The texture loader lives on the parser (created per-parse), so we
    // register a plugin that swaps in a plain TextureLoader — its <img>-element
    // decode path works in both the browser and the packaged Electron app.
    loader.register((parser) => {
      const tl = new THREE.TextureLoader(parser.options.manager);
      tl.setCrossOrigin(parser.options.crossOrigin);
      tl.setRequestHeader(parser.options.requestHeader);
      parser.textureLoader = tl;
      return { name: 'LP_compatible_texture_loader' };
    });
    personModelPromise = fetchArrayBuffer(url)
      .then((buf) => loader.parseAsync(buf, ''))
      .then((g) => {
      const scene = g.scene;
      // The bind pose is a T-pose; sample the idle clip so the figure stands
      // naturally (arms down). One mixer.update bakes the pose into the bones,
      // which the per-person clones then capture.
      const idle = g.animations.find((a) => /idle|stand|rest/i.test(a.name)) ?? g.animations[0];
      if (idle) {
        const mixer = new THREE.AnimationMixer(scene);
        mixer.clipAction(idle).play();
        mixer.update(0.4);
      }
      // Tame the avatar's materials so it reads as a real, lit person rather
      // than a glowing mask: kill any baked emissive (the cause of the "creepy"
      // self-lit face under bloom) and let it pick up the environment (IBL) so
      // skin/clothing show real colour instead of a black silhouette.
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((mm) => {
          const m = mm as THREE.MeshStandardMaterial;
          if (m.emissive) { m.emissive.setRGB(0, 0, 0); m.emissiveIntensity = 0; }
          if ('envMapIntensity' in m) m.envMapIntensity = 1.15;
          m.toneMapped = true;
          m.needsUpdate = true;
        });
      });
      // Strip the bundled avatar's novelty "Reindeer Glasses" accessory — a
      // single mesh that carries the glasses, the red nose and the antlers.
      // Removed before measuring height so the antlers don't inflate it.
      const accessories: THREE.Object3D[] = [];
      scene.traverse((o) => { if (/glasses/i.test(o.name)) accessories.push(o); });
      accessories.forEach((o) => o.parent?.remove(o));
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(scene);
      return { scene, height: Math.max(0.1, box.max.y - box.min.y), minY: box.min.y };
    });
  }
  return personModelPromise;
}

export interface Scene3DHandle {
  screenshot: () => string | null;
  getCanvas: () => HTMLCanvasElement | null;
  lookThroughCamera: (cam: { x: number; y: number; height: number; aimX: number; aimY: number; fov: number }) => void;
}

// ── Floor / wall finishes (Render view) ──────────────────────────────────────
// Procedural tile textures are expensive-ish to draw, so cache the resulting
// THREE.Texture by preset+colour. Shared across all mounts/instances.
const surfaceTexCache = new Map<string, THREE.Texture>();
// `repeat` is baked into the cache key so the floor (repeat = 400 / tile, mapped
// via the plane's 0..1 UVs) and the walls (repeat = 1, tiling baked into the
// wall UVs) get independent cached textures and never fight over `.repeat`.
function surfaceTexture<Id extends string>(preset: SurfacePreset<Id>, color: string, repeat: number): THREE.Texture | null {
  if (!preset.draw) return null;
  const key = `${preset.id}|${color}|${repeat.toFixed(3)}`;
  let tex = surfaceTexCache.get(key) ?? null;
  if (!tex) {
    const cv = surfaceCanvas(preset, color);
    if (!cv) return null;
    tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8; // keep crisp at grazing floor angles (clamped by GPU)
    tex.repeat.set(repeat, repeat);
    surfaceTexCache.set(key, tex);
  }
  return tex;
}

// Apply the chosen floor finish to the persistent ground mesh. Only the
// realistic (photo) view is textured; plain 3D keeps the dark schematic floor
// so the helper grid and objects stay readable.
function applyFloorMaterial(ground: THREE.Mesh, floor: FloorMaterial, photo: boolean) {
  const m = ground.material as THREE.MeshStandardMaterial;
  if (!photo) {
    m.map = null; m.color.set('#222238'); m.roughness = 0.92;
  } else {
    const preset = floorPreset(floor.preset);
    const tex = surfaceTexture(preset, floor.color, 400 / preset.tileMeters); // plane is 400 m across
    if (tex) {
      m.map = tex; m.color.set('#ffffff'); // the tinted texture carries the colour
    } else {
      m.map = null; m.color.set(floor.color);
    }
    m.roughness = preset.roughness;
  }
  m.needsUpdate = true;
}

interface Props {
  fixtures: PlacedFixture[];
  persons: Person[];
  stageElements: StageElement[];
  trusses: Truss[];
  walls: Wall[];
  ceilings: Ceiling[];
  floorPlan: FloorPlan | null;
  layers: Layers;
  cameras: CameraView[];
  selectedIds: Set<string>;
  showHeatMap: boolean;
  heatMapScale: number;
  heatMapTarget: number;
  photoMode: boolean;
  exposure: number;
  haze: number;
  showBeams: boolean;
  ambience: number;
  floor: FloorMaterial;
  sun: ResolvedSun | null;
  onSelect: (id: string | null, ctrlKey?: boolean) => void;
  onHoverLux?: (lux: number | null) => void;
}

const Scene3D = forwardRef<Scene3DHandle, Props>(({ fixtures, persons, stageElements, trusses, walls, ceilings, floorPlan, layers, cameras, selectedIds, showHeatMap, heatMapScale, heatMapTarget, photoMode, exposure, haze, showBeams, ambience, floor, sun, onSelect, onHoverLux }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    animId: number;
    composer: EffectComposer;
    bloom: UnrealBloomPass;
    ambient: THREE.AmbientLight;
    hemi: THREE.HemisphereLight;
    dir: THREE.DirectionalLight;
    sun: THREE.DirectionalLight;
    grid: THREE.GridHelper;
    ground: THREE.Mesh;
    env: THREE.Texture;
    pmrem: THREE.PMREMGenerator;
  } | null>(null);
  // Whether the camera has been framed to the content yet (once per mount).
  const framedRef = useRef(false);
  // Photo-realism flags read by the animation loop without re-creating it.
  const photoModeRef = useRef(photoMode);
  const exposureRef = useRef(exposure);
  const ambienceRef = useRef(ambience);
  ambienceRef.current = ambience;
  // Current lit fixtures + hover callback, read by the (once-built) pointer
  // handler so the live lux readout always uses fresh data.
  const litRef = useRef<PlacedFixture[]>([]);
  const onHoverLuxRef = useRef(onHoverLux);
  onHoverLuxRef.current = onHoverLux;
  // Real human model for the photo view (lazy-loaded on first use).
  const [personModel, setPersonModel] = React.useState<PersonModel | null>(null);
  useEffect(() => {
    // Load the real human only for the photo view (plain 3D / heat-map use the
    // simple stand-in figure, so the heavy GLB isn't needed there).
    if (photoMode && !personModel) loadPersonModel().then(setPersonModel).catch(() => { /* keep fallback */ });
  }, [photoMode, personModel]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    framedRef.current = false; // a fresh scene/camera needs framing again

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1a1a2e');
    scene.fog = new THREE.Fog('#1a1a2e', 50, 120);

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 200);
    camera.position.set(15, 15, 15);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(10, 0, 10);

    // Ground grid (hidden in the photo view)
    const grid = new THREE.GridHelper(60, 60, '#3a3a50', '#2a2a3c');
    scene.add(grid);

    // Ground plane – large so it always reads as a real floor; receives shadows.
    const groundGeo = new THREE.PlaneGeometry(400, 400);
    const groundMat = new THREE.MeshStandardMaterial({ color: photoModeRef.current ? '#4a4d57' : '#222238', roughness: 0.92, metalness: 0 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Image-based ambient light (the "ambience" the photo view was missing).
    // A pre-filtered RoomEnvironment gives every PBR surface a soft, directional
    // fill so people/objects read with real colour and form instead of turning
    // into black silhouettes outside the spotlight cones. Kept subtle (low
    // environmentIntensity) so the fixtures still dominate and cast the mood.
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    const amb0 = ambienceRef.current;
    scene.environmentIntensity = photoModeRef.current ? amb0 * 0.45 : 0;

    // Lighting. In the render view the fill (hemisphere + ambient + IBL) scales
    // with the user's global "Ambiente" setting, so the floor/scene can be made
    // as bright or as moody as wanted while the fixtures still carry the look.
    const ambient = new THREE.AmbientLight('#7a7a92', photoModeRef.current ? amb0 * 0.18 : 0.5);
    scene.add(ambient);
    const hemi = new THREE.HemisphereLight('#7d8aa0', '#1b1f2a', photoModeRef.current ? amb0 * 1.0 : 0.0);
    scene.add(hemi);
    const dirLight = new THREE.DirectionalLight('#ffffff', photoModeRef.current ? amb0 * 0.18 : 0.3);
    dirLight.position.set(20, 30, 10);
    scene.add(dirLight);

    // Global sun (issue #28). Position/colour/intensity are driven by the
    // resolved sun in a dedicated effect; it stays invisible until enabled.
    const sunLight = new THREE.DirectionalLight('#ffffff', 0);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 400;
    sunLight.shadow.camera.left = -60;
    sunLight.shadow.camera.right = 60;
    sunLight.shadow.camera.top = 60;
    sunLight.shadow.camera.bottom = -60;
    sunLight.visible = false;
    scene.add(sunLight);
    scene.add(sunLight.target);

    // ── Post-processing chain for the photo view (bloom around bright sources) ──
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    composer.setSize(container.clientWidth, container.clientHeight);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.32, // strength (subtle – just a halo on the brightest bits)
      0.4,  // radius
      0.85, // threshold (raised so lit faces/skin don't bloom into a glow)
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    renderer.toneMapping = photoModeRef.current ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    renderer.toneMappingExposure = exposureRef.current;

    const animId = 0;
    sceneRef.current = { scene, camera, renderer, controls, animId, composer, bloom, ambient, hemi, dir: dirLight, sun: sunLight, grid, ground, env, pmrem };

    // ── WASD keyboard movement ──
    const keys: Record<string, boolean> = {};
    const MOVE_SPEED = 0.25;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle when no input/textarea is focused
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Space would otherwise scroll / trigger focused buttons
      if (e.key === ' ') e.preventDefault();
      keys[e.key.toLowerCase()] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const _forward = new THREE.Vector3();
    const _right = new THREE.Vector3();
    const applyWASD = () => {
      // Forward/back direction (horizontal only, from camera look direction)
      camera.getWorldDirection(_forward);
      _forward.y = 0;
      _forward.normalize();
      // Right direction
      _right.crossVectors(_forward, camera.up).normalize();

      let dx = 0, dz = 0, dy = 0;
      if (keys['w'] || keys['arrowup'])    { dx += _forward.x; dz += _forward.z; }
      if (keys['s'] || keys['arrowdown'])  { dx -= _forward.x; dz -= _forward.z; }
      if (keys['a'] || keys['arrowleft'])  { dx -= _right.x;   dz -= _right.z; }
      if (keys['d'] || keys['arrowright']) { dx += _right.x;   dz += _right.z; }
      if (keys['q'] || keys['pagedown'] || keys['shift']) { dy -= 1; } // runter
      if (keys['e'] || keys['pageup']   || keys[' '])     { dy += 1; } // hoch (Leertaste)

      if (dx !== 0 || dz !== 0 || dy !== 0) {
        const move = new THREE.Vector3(dx, dy, dz).normalize().multiplyScalar(MOVE_SPEED);
        camera.position.add(move);
        controls.target.add(move);
      }
    };

    const animate = () => {
      sceneRef.current!.animId = requestAnimationFrame(animate);
      applyWASD();
      controls.update();
      if (photoModeRef.current) {
        renderer.toneMappingExposure = exposureRef.current;
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
      composer.setSize(container.clientWidth, container.clientHeight);
    };
    const obs = new ResizeObserver(handleResize);
    obs.observe(container);

    // Click handling
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const handleClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      let found: string | null = null;
      for (const hit of intersects) {
        let obj: THREE.Object3D | null = hit.object;
        while (obj) {
          if (obj.userData?.selectId) { found = obj.userData.selectId; break; }
          obj = obj.parent;
        }
        if (found) break;
      }
      onSelect(found);
    };
    renderer.domElement.addEventListener('click', handleClick);

    // Live lux readout (like the 2D view): illuminance on whatever real surface
    // is under the cursor — floor, podium top/side, wall or a person — computed
    // with the same engine as the heat-map, at the surface's true height/normal.
    const handlePointerMove = (e: MouseEvent) => {
      const cb = onHoverLuxRef.current;
      if (!cb) return;
      const lit = litRef.current;
      if (!lit.length) { cb(null); return; }
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      let hit: THREE.Intersection | null = null;
      for (const h of hits) {
        if (!(h.object as THREE.Mesh).isMesh) continue; // skip lines/sprites
        if (h.object.userData?.noPick) continue;         // skip overlays/beams/heat plane
        if (!h.face) continue;                            // need a surface normal
        hit = h; break;
      }
      if (!hit) { cb(null); return; }
      const p = hit.point;
      const n = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
      // three world (x, yUp, z) + normal → plan space (x, z, height) for surfaceLux.
      cb(Math.max(0, surfaceLux(lit, p.x, p.z, p.y, n.x, n.z, n.y, false)));
    };
    const handlePointerLeave = () => onHoverLuxRef.current?.(null);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      cancelAnimationFrame(sceneRef.current!.animId);
      renderer.domElement.removeEventListener('click', handleClick);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      obs.disconnect();
      composer.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle the photo-realistic look: real tone mapping + exposure, dim the
  // generic fill lights so the fixtures carry the scene, hide the helper grid.
  useEffect(() => {
    photoModeRef.current = photoMode;
    exposureRef.current = exposure;
    const s = sceneRef.current;
    if (!s) return;
    s.renderer.toneMapping = photoMode ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    s.renderer.toneMappingExposure = exposure;
    s.ambient.intensity = photoMode ? ambience * 0.18 : 0.5;
    s.hemi.intensity = photoMode ? ambience * 1.0 : 0.0;
    s.dir.intensity = photoMode ? ambience * 0.18 : 0.3;
    s.scene.environmentIntensity = photoMode ? ambience * 0.45 : 0;
    // Global sun (issue #28): place the directional sun light from the resolved
    // sun position. The light comes from the sun's direction toward the room.
    if (sun) {
      const D = 120;
      s.sun.position.set(sun.dir3D.x * D, Math.max(2, sun.dir3D.y * D), sun.dir3D.z * D);
      s.sun.target.position.set(0, 0, 0);
      s.sun.target.updateMatrixWorld();
      s.sun.color.set(sun.color);
      s.sun.intensity = (photoMode ? 2.6 : 1.1) * Math.max(0.05, Math.sin(sun.altitude));
      s.sun.visible = true;
    } else {
      s.sun.visible = false;
      s.sun.intensity = 0;
    }
    s.grid.visible = !photoMode;
    applyFloorMaterial(s.ground, floor, photoMode);
    const bg = photoMode ? '#15151c' : '#1a1a2e';
    s.scene.background = new THREE.Color(bg);
    if (s.scene.fog) (s.scene.fog as THREE.Fog).color.set(bg);
    // Tone-mapping change requires existing materials to recompile.
    s.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((mm) => { mm.needsUpdate = true; });
    });
  }, [photoMode, exposure, ambience, floor, sun]);

  // Update scene objects when data changes
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    const { scene } = s;

    // ── Bounding box of all content (used to frame the camera and to size
    //    the heat-map so both always cover the actual rig, wherever it sits) ──
    let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
    const acc = (x: number, y: number) => { if (x < bMinX) bMinX = x; if (x > bMaxX) bMaxX = x; if (y < bMinY) bMinY = y; if (y > bMaxY) bMaxY = y; };
    for (const f of fixtures) { acc(f.x, f.y); acc(f.aimX, f.aimY); }
    for (const p of persons) acc(p.x, p.y);
    for (const se of stageElements) { acc(se.x, se.y); acc(se.x + se.width, se.y + se.depth); }
    for (const t of trusses) { acc(t.x1, t.y1); acc(t.x2, t.y2); }
    for (const w of walls) { acc(w.x1, w.y1); acc(w.x2, w.y2); }
    for (const c of ceilings) for (const p of c.points) acc(p.x, p.y);
    if (floorPlan) { acc(floorPlan.offsetX, floorPlan.offsetY); acc(floorPlan.offsetX + floorPlan.widthMeters, floorPlan.offsetY + floorPlan.heightMeters); }
    const hasContent = bMinX !== Infinity;

    // Remove old dynamic objects (traverse so meshes/lights inside groups are
    // disposed too — including spotlight shadow maps).
    const toRemove = scene.children.filter((c) => c.userData?.dynamic);
    toRemove.forEach((c) => {
      scene.remove(c);
      c.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          // Skip disposing shared, cached surface textures (floor/wall finishes)
          // — they're reused across rebuilds and live in surfaceTexCache.
          mats.forEach((m) => {
            if (!(m as { __keepMap?: boolean }).__keepMap) (m as THREE.MeshBasicMaterial).map?.dispose();
            m.dispose();
          });
        } else if (o instanceof THREE.SpotLight) {
          o.shadow?.map?.dispose();
        }
      });
    });

    // ── Heat-map foundation ──────────────────────────────────────────────
    // Lit lamps drive both the floor map and the surface drape. Compute the
    // floor grid (and its scale) up front so podiums, walls, ceilings and
    // people can be draped on the *same* scale as the floor legend.
    const lit = fixtures.filter((f) => !f.hidden);
    litRef.current = lit; // keep the pointer handler's lux readout fresh
    const heatOn = showHeatMap && lit.length > 0 && hasContent;
    let heatScale = 1000;

    // Three.js world (x, yUp, z) + normal → palette RGBA (0..1), via the plan-
    // space engine (plan x = world x, plan y = world z, plan height = world y).
    const heatColorAt = (
      wx: number, wy: number, wz: number,
      nx: number, ny: number, nz: number,
      twoSided: boolean,
    ): [number, number, number, number] => {
      const lux = surfaceLux(lit, wx, wz, wy, nx, nz, ny, twoSided);
      const [r, g, b, a] = heatMapTarget > 0 ? luxToColorTarget(lux, heatMapTarget) : luxToColor(lux, heatScale);
      return [r / 255, g / 255, b / 255, a / 255];
    };

    // Transparent vertex-coloured overlay from a triangle soup (world coords) +
    // per-vertex normals — drapes heat values onto a surface, see-through where
    // the surface is dark so the real object shows underneath.
    const addHeatOverlay = (positions: number[], normals: number[], twoSided: boolean) => {
      const n = positions.length / 3;
      if (n === 0) return;
      const colors = new Float32Array(n * 4);
      let anyLit = false;
      for (let i = 0; i < n; i++) {
        const [r, g, b, a] = heatColorAt(
          positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2],
          normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2], twoSided,
        );
        colors[i * 4] = r; colors[i * 4 + 1] = g; colors[i * 4 + 2] = b; colors[i * 4 + 3] = a;
        if (a > 0.004) anyLit = true;
      }
      if (!anyLit) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        // Always double-sided: these flat drapes have mixed triangle winding, so
        // FrontSide would cull podium/polygon tops when viewed from above. The
        // `twoSided` flag only governs the lux calc (lit from either face).
        vertexColors: true, transparent: true, depthWrite: false, toneMapped: false,
        side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      mesh.renderOrder = 2;
      mesh.userData = { dynamic: true, noPick: true };
      scene.add(mesh);
    };

    // Subdivide an (optionally rotated, optionally sloped) rectangular top into a
    // grid and drape it. hFront/hBack let ramps slope from front (−d/2) to back.
    const addRectTopHeat = (cx: number, cz: number, w: number, d: number, hFront: number, hBack: number, rotY: number) => {
      const ni = Math.min(48, Math.max(1, Math.ceil(w / 0.3)));
      const nj = Math.min(48, Math.max(1, Math.ceil(d / 0.3)));
      const cosR = Math.cos(rotY), sinR = Math.sin(rotY);
      const slope = (hBack - hFront) / Math.max(d, 1e-6);
      const wx = (lx: number, lz: number) => cx + lx * cosR + lz * sinR;
      const wz = (lx: number, lz: number) => cz - lx * sinR + lz * cosR;
      const nlen = Math.hypot(1, slope);
      const lnx = 0, lny = 1 / nlen, lnz = -slope / nlen; // local top normal
      const nwx = lnx * cosR + lnz * sinR, nwz = -lnx * sinR + lnz * cosR;
      const yAt = (lz: number) => hFront + (lz + d / 2) * slope;
      const pos: number[] = [], nor: number[] = [];
      const push = (lx: number, lz: number) => { pos.push(wx(lx, lz), yAt(lz), wz(lx, lz)); nor.push(nwx, lny, nwz); };
      for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) {
        const x0 = -w / 2 + (w * i) / ni, x1 = -w / 2 + (w * (i + 1)) / ni;
        const z0 = -d / 2 + (d * j) / nj, z1 = -d / 2 + (d * (j + 1)) / nj;
        push(x0, z0); push(x1, z0); push(x1, z1);
        push(x0, z0); push(x1, z1); push(x0, z1);
      }
      addHeatOverlay(pos, nor, false);
    };

    // Drape the 4 vertical side faces of a (rotated) box/ramp podium, so the
    // heat-map wraps the whole podium, not just its top. Each side's outward
    // normal is used for the lux, so only the faces actually facing a lamp light up.
    const addBoxSidesHeat = (cx: number, cz: number, w: number, d: number, H: number, rotY: number) => {
      if (H <= 0.01) return;
      const cosR = Math.cos(rotY), sinR = Math.sin(rotY);
      const toW = (lx: number, lz: number): [number, number] => [cx + lx * cosR + lz * sinR, cz - lx * sinR + lz * cosR];
      const nW = (nx: number, nz: number): [number, number] => [nx * cosR + nz * sinR, -nx * sinR + nz * cosR];
      const hw = w / 2, hd = d / 2;
      const vj = Math.min(24, Math.max(1, Math.ceil(H / 0.3)));
      const sides: { a: [number, number]; b: [number, number]; n: [number, number] }[] = [
        { a: [-hw, -hd], b: [hw, -hd], n: [0, -1] }, // front
        { a: [hw, hd], b: [-hw, hd], n: [0, 1] },    // back
        { a: [-hw, hd], b: [-hw, -hd], n: [-1, 0] }, // left
        { a: [hw, -hd], b: [hw, hd], n: [1, 0] },    // right
      ];
      const pos: number[] = [], nor: number[] = [];
      for (const sd of sides) {
        const [ax, az] = toW(sd.a[0], sd.a[1]);
        const [bx, bz] = toW(sd.b[0], sd.b[1]);
        const [nx, nz] = nW(sd.n[0], sd.n[1]);
        const segLen = Math.hypot(bx - ax, bz - az);
        const ui = Math.min(24, Math.max(1, Math.ceil(segLen / 0.3)));
        for (let s = 0; s < ui; s++) for (let t = 0; t < vj; t++) {
          const sa = s / ui, sb = (s + 1) / ui;
          const ya = (t * H) / vj, yb = ((t + 1) * H) / vj;
          const x0 = ax + (bx - ax) * sa, z0 = az + (bz - az) * sa;
          const x1 = ax + (bx - ax) * sb, z1 = az + (bz - az) * sb;
          pos.push(x0, ya, z0, x1, ya, z1, x1, yb, z1, x0, ya, z0, x1, yb, z1, x0, yb, z0);
          for (let k = 0; k < 6; k++) nor.push(nx, 0, nz);
        }
      }
      addHeatOverlay(pos, nor, false);
    };

    // Drape the vertical sides of a free polygon stage (each outline edge → a
    // wall up to height h).
    const addPolySidesHeat = (points: { x: number; y: number }[], h: number) => {
      if (h <= 0.01 || points.length < 2) return;
      const vj = Math.min(24, Math.max(1, Math.ceil(h / 0.3)));
      const pos: number[] = [], nor: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        const segLen = Math.hypot(b.x - a.x, b.y - a.y);
        if (segLen < 0.01) continue;
        const nx = -(b.y - a.y) / segLen, nz = (b.x - a.x) / segLen; // outward (CW outline)
        const ui = Math.min(24, Math.max(1, Math.ceil(segLen / 0.3)));
        for (let s = 0; s < ui; s++) for (let t = 0; t < vj; t++) {
          const sa = s / ui, sb = (s + 1) / ui;
          const ya = (t * h) / vj, yb = ((t + 1) * h) / vj;
          const ax = a.x + (b.x - a.x) * sa, az = a.y + (b.y - a.y) * sa;
          const bx = a.x + (b.x - a.x) * sb, bz = a.y + (b.y - a.y) * sb;
          pos.push(ax, ya, az, bx, ya, bz, bx, yb, bz, ax, ya, az, bx, yb, bz, ax, yb, az);
          for (let k = 0; k < 6; k++) nor.push(nx, 0, nz);
        }
      }
      addHeatOverlay(pos, nor, true); // outline winding may vary → light either face
    };

    // Drape a horizontal polygon (free stage outline / ceiling) at a height.
    const addPolyHeat = (points: { x: number; y: number }[], h: number, faceDown: boolean) => {
      let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
      for (const p of points) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minZ) minZ = p.y; if (p.y > maxZ) maxZ = p.y; }
      const ni = Math.min(64, Math.max(1, Math.ceil((maxX - minX) / 0.3)));
      const nj = Math.min(64, Math.max(1, Math.ceil((maxZ - minZ) / 0.3)));
      const ny = faceDown ? -1 : 1;
      const pos: number[] = [], nor: number[] = [];
      for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) {
        const x0 = minX + ((maxX - minX) * i) / ni, x1 = minX + ((maxX - minX) * (i + 1)) / ni;
        const z0 = minZ + ((maxZ - minZ) * j) / nj, z1 = minZ + ((maxZ - minZ) * (j + 1)) / nj;
        if (!pointInPolygon((x0 + x1) / 2, (z0 + z1) / 2, points)) continue;
        pos.push(x0, h, z0, x1, h, z0, x1, h, z1, x0, h, z0, x1, h, z1, x0, h, z1);
        for (let k = 0; k < 6; k++) nor.push(0, ny, 0);
      }
      addHeatOverlay(pos, nor, false);
    };

    // Drape a wall: subdivide along its (possibly curved) run × its height.
    const addWallHeat = (w: Wall) => {
      const pts = sampleWall(w, isCurved(w) ? 18 : 1);
      const vj = Math.min(40, Math.max(1, Math.ceil(w.height / 0.3)));
      const pos: number[] = [], nor: number[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const segLen = Math.hypot(b.x - a.x, b.y - a.y);
        if (segLen < 0.01) continue;
        const nx = -(b.y - a.y) / segLen, nz = (b.x - a.x) / segLen; // horizontal normal
        const ui = Math.min(40, Math.max(1, Math.ceil(segLen / 0.3)));
        for (let s = 0; s < ui; s++) for (let t = 0; t < vj; t++) {
          const sa = s / ui, sb = (s + 1) / ui;
          const ya = (t * w.height) / vj, yb = ((t + 1) * w.height) / vj;
          const ax = a.x + (b.x - a.x) * sa, az = a.y + (b.y - a.y) * sa;
          const bx = a.x + (b.x - a.x) * sb, bz = a.y + (b.y - a.y) * sb;
          pos.push(ax, ya, az, bx, ya, bz, bx, yb, bz, ax, ya, az, bx, yb, bz, ax, yb, az);
          for (let k = 0; k < 6; k++) nor.push(nx, 0, nz);
        }
      }
      addHeatOverlay(pos, nor, true);
    };

    // Paint a person's tessellated body (geometry already in world coords) with
    // heat values per vertex — the head, closer to the lamp, reads a different
    // value than the feet. Opaque with a dark fallback so the figure stays solid.
    const paintFigureHeat = (geo: THREE.BufferGeometry, selId: string) => {
      const posAttr = geo.getAttribute('position');
      const normAttr = geo.getAttribute('normal');
      const colors = new Float32Array(posAttr.count * 3);
      for (let i = 0; i < posAttr.count; i++) {
        const [r, g, b, a] = heatColorAt(
          posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i),
          normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i), false,
        );
        if (a > 0.004) { colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b; }
        else { colors[i * 3] = 0.05; colors[i * 3 + 1] = 0.06; colors[i * 3 + 2] = 0.09; }
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
      mesh.userData = { dynamic: true, selectId: selId };
      scene.add(mesh);
    };

    // Drape the heat-map over the *real* (posed, skinned) human: read each
    // skinned vertex in its final world position, colour it by the lux that
    // actually reaches it, and build a thin see-through shell hugging the body —
    // so the figure stays photo-real while the head/torso/legs show real values.
    const _v = new THREE.Vector3(), _n = new THREE.Vector3();
    const buildPersonHeatOverlay = (root: THREE.Object3D, selId: string) => {
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        const sm = o as THREE.SkinnedMesh;
        if (!(sm as unknown as THREE.Mesh).isMesh) return;
        const geo = sm.geometry;
        const posAttr = geo.getAttribute('position');
        if (!posAttr) return;
        const normAttr = geo.getAttribute('normal');
        if ((sm as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh && sm.skeleton) sm.skeleton.update();
        const normalMat = new THREE.Matrix3().getNormalMatrix(sm.matrixWorld);
        const count = posAttr.count;
        const wpos = new Float32Array(count * 3);
        const colors = new Float32Array(count * 4);
        let anyLit = false;
        for (let i = 0; i < count; i++) {
          sm.getVertexPosition(i, _v);       // posed (skinned) local position
          _v.applyMatrix4(sm.matrixWorld);   // → world
          if (normAttr) _n.fromBufferAttribute(normAttr, i).applyMatrix3(normalMat).normalize();
          else _n.set(0, 1, 0);
          const [r, g, b, a] = heatColorAt(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, false);
          // sit the shell a hair outside the skin to avoid z-fighting
          wpos[i * 3] = _v.x + _n.x * 0.012; wpos[i * 3 + 1] = _v.y + _n.y * 0.012; wpos[i * 3 + 2] = _v.z + _n.z * 0.012;
          colors[i * 4] = r; colors[i * 4 + 1] = g; colors[i * 4 + 2] = b; colors[i * 4 + 3] = a;
          if (a > 0.004) anyLit = true;
        }
        if (!anyLit) return;
        const og = new THREE.BufferGeometry();
        og.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
        if (geo.index) og.setIndex(Array.from(geo.index.array as ArrayLike<number>));
        og.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
        const mesh = new THREE.Mesh(og, new THREE.MeshBasicMaterial({
          vertexColors: true, transparent: true, depthWrite: false, toneMapped: false,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        }));
        mesh.renderOrder = 3;
        mesh.userData = { dynamic: true, selectId: selId, noPick: true };
        scene.add(mesh);
      });
    };

    // Floor heat-map (textured plane), sized to cover the whole rig.
    if (heatOn) {
      const pad = 4;
      const hx0 = bMinX - pad, hz0 = bMinY - pad;
      const hw = Math.max(8, (bMaxX - bMinX) + 2 * pad);
      const hd = Math.max(8, (bMaxY - bMinY) + 2 * pad);
      const hmRes = 180;
      const { data, maxLux } = computeHeatMap(fixtures, hx0, hz0, hw, hd, hmRes, hmRes, walls, ceilings, sun);
      heatScale = heatMapScale > 0 ? heatMapScale : (maxLux || 1000);

      const canvas2d = document.createElement('canvas');
      canvas2d.width = hmRes; canvas2d.height = hmRes;
      const ctx = canvas2d.getContext('2d')!;
      const imgData = ctx.createImageData(hmRes, hmRes);
      for (let i = 0; i < hmRes * hmRes; i++) {
        const [r, g, b, a] = heatMapTarget > 0 ? luxToColorTarget(data[i], heatMapTarget) : luxToColor(data[i], heatScale);
        imgData.data[i * 4] = r; imgData.data[i * 4 + 1] = g; imgData.data[i * 4 + 2] = b; imgData.data[i * 4 + 3] = a;
      }
      ctx.putImageData(imgData, 0, 0);

      const hmTexture = new THREE.CanvasTexture(canvas2d);
      hmTexture.minFilter = THREE.LinearFilter; hmTexture.magFilter = THREE.LinearFilter;
      const hmMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(hw, hd),
        new THREE.MeshBasicMaterial({ map: hmTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
      );
      hmMesh.rotation.x = -Math.PI / 2;
      hmMesh.position.set(hx0 + hw / 2, 0.012, hz0 + hd / 2);
      hmMesh.userData = { dynamic: true, noPick: true };
      scene.add(hmMesh);
    }

    // Imported building plan textured onto the floor (matches 2D placement)
    if (floorPlan && layers.floorPlan.visible) {
      const { offsetX, offsetY, widthMeters, heightMeters } = floorPlan;
      const tex = new THREE.Texture(floorPlan.image);
      tex.needsUpdate = true;
      tex.colorSpace = THREE.SRGBColorSpace;
      const geo = new THREE.PlaneGeometry(widthMeters, heightMeters);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: floorPlan.opacity, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(offsetX + widthMeters / 2, 0.006, offsetY + heightMeters / 2);
      mesh.userData = { dynamic: true };
      scene.add(mesh);
    }

    // Stage elements (podeste) – flat box, a wedge when it's a ramp, or an
    // extruded prism for a free polygon stage.
    if (layers.stage.visible) for (const se of stageElements) {
      const isSel = selectedIds.has(se.id);
      const mat = new THREE.MeshStandardMaterial({ color: isSel ? '#cc8833' : '#8B4513', roughness: 0.7 });

      if (se.points && se.points.length >= 3) {
        const pts = se.points, h = Math.max(0.01, se.height);
        const pos: number[] = [];
        for (let i = 1; i < pts.length - 1; i++) {
          const a = pts[0], b = pts[i], c = pts[i + 1];
          pos.push(a.x, 0, a.y, b.x, 0, b.y, c.x, 0, c.y);   // bottom
          pos.push(a.x, h, a.y, c.x, h, c.y, b.x, h, b.y);   // top
        }
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          pos.push(a.x, 0, a.y, b.x, 0, b.y, b.x, h, b.y);   // side
          pos.push(a.x, 0, a.y, b.x, h, b.y, a.x, h, a.y);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData = { dynamic: true, selectId: se.id };
        scene.add(mesh);
        if (heatOn) { addPolyHeat(se.points, h, false); addPolySidesHeat(se.points, h); }
        continue;
      }

      const w = se.width, d = se.depth;
      const isRamp = se.height2 != null && Math.abs(se.height2 - se.height) > 0.01;
      let geo: THREE.BufferGeometry;
      if (isRamp) {
        // Top sloped from height (front, −d/2) to height2 (back, +d/2); bottom flat at 0.
        const hF = Math.max(0.01, se.height), hB = Math.max(0.01, se.height2!);
        const hw = w / 2, hd = d / 2;
        // 8 corners: 0-3 bottom (y=0), 4-7 top
        const v = [
          [-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd],
          [-hw, hF, -hd], [hw, hF, -hd], [hw, hB, hd], [-hw, hB, hd],
        ];
        const quad = (a: number, b: number, c: number, e: number) => [v[a], v[b], v[c], v[a], v[c], v[e]];
        const faces = [
          ...quad(4, 5, 6, 7), // top (sloped)
          ...quad(1, 0, 3, 2), // bottom
          ...quad(0, 1, 5, 4), // front
          ...quad(2, 3, 7, 6), // back
          ...quad(3, 0, 4, 7), // left
          ...quad(1, 2, 6, 5), // right
        ];
        const pos: number[] = [];
        for (const p of faces) pos.push(p[0], p[1], p[2]);
        geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.computeVertexNormals();
      } else {
        geo = new THREE.BoxGeometry(w, se.height, d);
        geo.translate(0, se.height / 2, 0);
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(se.x + w / 2, 0, se.y + d / 2);
      mesh.rotation.y = -(se.rotation * Math.PI) / 180;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { dynamic: true, selectId: se.id };
      scene.add(mesh);
      if (heatOn) {
        const hF = Math.max(0.01, se.height);
        const hB = isRamp ? Math.max(0.01, se.height2!) : hF;
        const rotY = -(se.rotation * Math.PI) / 180;
        addRectTopHeat(se.x + w / 2, se.y + d / 2, w, d, hF, hB, rotY);
        addBoxSidesHeat(se.x + w / 2, se.y + d / 2, w, d, Math.max(hF, hB), rotY);
      }
    }

    // Trusses (rigging / hanging positions)
    if (layers.trusses.visible) for (const t of trusses) {
      const len = Math.hypot(t.x2 - t.x1, t.y2 - t.y1);
      if (len < 0.05) continue;
      const isSel = selectedIds.has(t.id);
      const angle = Math.atan2(t.y2 - t.y1, t.x2 - t.x1);
      const geo = new THREE.BoxGeometry(len, 0.3, 0.3);
      const mat = new THREE.MeshStandardMaterial({ color: isSel ? '#ffcc33' : '#9aa4b2', roughness: 0.6, metalness: 0.4 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((t.x1 + t.x2) / 2, t.height, (t.y1 + t.y2) / 2);
      mesh.rotation.y = -angle;
      mesh.castShadow = true;
      mesh.userData = { dynamic: true, selectId: t.id };
      scene.add(mesh);
    }

    // Walls (vertical surfaces, straight or curved, that reflect light). In the
    // realistic view they take a tileable finish (Putz/Rauhfaser/Beton/…) tinted
    // to the wall colour; plain 3D keeps the flat schematic colour.
    if (layers.walls.visible) for (const w of walls) {
      if (Math.hypot(w.x2 - w.x1, w.y2 - w.y1) < 0.05) continue;
      const isSel = selectedIds.has(w.id);
      const preset = wallPreset(w.material);
      const tex = photoMode ? surfaceTexture(preset, w.color, 1) : null;
      const tile = preset.tileMeters;
      const { segs, length } = wallSegments(w);
      const wins = normalizedWindows(w, length);
      const pos: number[] = [];
      const uv: number[] = [];
      // Glass panes are grouped per window (one window may span several curve
      // segments) so each keeps its own transmittance/tint.
      const glassByWin = new Map<NormWindow, number[]>();

      // Vertical solid quad a→b between heights y0..y1, UVs in tile units so the
      // texture flows continuously along the run and up the wall.
      const pushSolid = (pa: { x: number; y: number }, pb: { x: number; y: number }, y0: number, y1: number, u0: number, u1: number) => {
        if (y1 - y0 < 1e-4) return;
        const v0 = y0 / tile, v1 = y1 / tile;
        pos.push(pa.x, y0, pa.y, pb.x, y0, pb.y, pb.x, y1, pb.y);
        uv.push(u0, v0, u1, v0, u1, v1);
        pos.push(pa.x, y0, pa.y, pb.x, y1, pb.y, pa.x, y1, pa.y);
        uv.push(u0, v0, u1, v1, u0, v1);
      };

      for (const seg of segs) {
        // Split this segment at any window edge that falls inside it, so each
        // sub-segment is either fully solid or fully inside one opening.
        const bps = [seg.r0, seg.r1];
        for (const win of wins) {
          if (win.r0 > seg.r0 + 1e-6 && win.r0 < seg.r1 - 1e-6) bps.push(win.r0);
          if (win.r1 > seg.r0 + 1e-6 && win.r1 < seg.r1 - 1e-6) bps.push(win.r1);
        }
        bps.sort((a, b) => a - b);
        for (let i = 0; i < bps.length - 1; i++) {
          const s = bps[i], e = bps[i + 1];
          if (e - s < 1e-4) continue;
          const span = seg.r1 - seg.r0;
          const ta = (s - seg.r0) / span, tb = (e - seg.r0) / span;
          const pa = { x: seg.a.x + (seg.b.x - seg.a.x) * ta, y: seg.a.y + (seg.b.y - seg.a.y) * ta };
          const pb = { x: seg.a.x + (seg.b.x - seg.a.x) * tb, y: seg.a.y + (seg.b.y - seg.a.y) * tb };
          const u0 = s / tile, u1 = e / tile;
          const mid = (s + e) / 2;
          const win = wins.find((wn) => mid >= wn.r0 && mid <= wn.r1);
          if (!win) {
            pushSolid(pa, pb, 0, w.height, u0, u1); // full-height solid wall
          } else {
            pushSolid(pa, pb, 0, win.sill, u0, u1);        // below the sill
            pushSolid(pa, pb, win.top, w.height, u0, u1);  // above the head
            let g = glassByWin.get(win); if (!g) { g = []; glassByWin.set(win, g); }
            const y0 = win.sill, y1 = win.top;
            g.push(pa.x, y0, pa.y, pb.x, y0, pb.y, pb.x, y1, pb.y);
            g.push(pa.x, y0, pa.y, pb.x, y1, pb.y, pa.x, y1, pa.y);
          }
        }
      }

      if (pos.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({
          color: isSel ? '#ffcc33' : (tex ? '#ffffff' : w.color),
          roughness: tex ? preset.roughness : 0.85, metalness: 0, side: THREE.DoubleSide,
        });
        if (tex) { mat.map = tex; (mat as { __keepMap?: boolean }).__keepMap = true; }
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData = { dynamic: true, selectId: w.id };
        scene.add(mesh);
      }

      // Translucent glass panes. They do NOT cast shadows, so fixture light (and
      // the sun, once added) passes straight through the opening into the room.
      for (const [win, gpos] of glassByWin) {
        const ggeo = new THREE.BufferGeometry();
        ggeo.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3));
        ggeo.computeVertexNormals();
        const gmat = new THREE.MeshStandardMaterial({
          color: isSel ? '#ffe08a' : win.tint,
          roughness: 0.06, metalness: 0, side: THREE.DoubleSide,
          transparent: true, opacity: 0.14 + (1 - win.transmittance) * 0.45, depthWrite: false,
        });
        const gmesh = new THREE.Mesh(ggeo, gmat);
        gmesh.castShadow = false; gmesh.receiveShadow = false;
        gmesh.userData = { dynamic: true, selectId: w.id };
        scene.add(gmesh);
      }
      if (heatOn) addWallHeat(w);
    }

    // Ceilings (translucent horizontal polygon at height)
    if (layers.ceilings.visible) for (const c of ceilings) {
      if (c.points.length < 3) continue;
      const isSel = selectedIds.has(c.id);
      const pos: number[] = [];
      for (let i = 1; i < c.points.length - 1; i++) {
        const a = c.points[0], b = c.points[i], d = c.points[i + 1];
        pos.push(a.x, c.height, a.y, b.x, c.height, b.y, d.x, c.height, d.y);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: isSel ? '#ffcc33' : c.color, roughness: 0.9, metalness: 0,
        side: THREE.DoubleSide, transparent: true, opacity: 0.35,
      }));
      mesh.userData = { dynamic: true, selectId: c.id };
      scene.add(mesh);
      if (heatOn) addPolyHeat(c.points, c.height, true);
    }

    // Persons (cylinder body + sphere head)
    if (layers.persons.visible) for (const p of persons) {
      const isSel = selectedIds.has(p.id);
      const group = new THREE.Group();
      group.userData = { dynamic: true, selectId: p.id };

      // Find if person is on a stage element
      let floorH = 0;
      for (const se of stageElements) {
        if (p.x >= se.x && p.x <= se.x + se.width && p.y >= se.y && p.y <= se.y + se.depth) {
          floorH = Math.max(floorH, se.height);
        }
      }

      // A real, photo-scanned casual human — ONLY in the photo view. Plain 3D
      // and the heat-map use the simple stand-in figure (below), so turning the
      // photo view off (or heat-map on without photo) gives clean cylinders.
      // In photo + heat-map the lux values are draped on top of the real body.
      if (photoMode && personModel) {
        const m = cloneSkeleton(personModel.scene) as THREE.Group;
        const s = p.height / personModel.height;
        m.scale.setScalar(s);
        // Facing: plan angle (0 = +X) → rotation about Y (model forward = +Z = plan +Y).
        m.rotation.y = ((90 - (p.facing ?? 270)) * Math.PI) / 180;
        const sitting = p.pose === 'sitting';
        m.position.set(p.x, floorH - personModel.minY * s, p.y); // standing: feet on the surface
        if (sitting) {
          applySitPose(m);
          // Re-ground on the seated silhouette (bind-pose minY no longer applies).
          m.position.y += floorH - posedMinWorldY(m);
        }
        const highlight = (mm: THREE.Material) => {
          const c = (mm as THREE.MeshStandardMaterial).clone();
          c.emissive = new THREE.Color('#ffcc33');
          c.emissiveIntensity = 0.22;
          return c;
        };
        m.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          // Selection glow only in the pure photo view (the heat drape would hide it).
          if (isSel && photoMode && !heatOn) mesh.material = Array.isArray(mesh.material) ? mesh.material.map(highlight) : highlight(mesh.material);
        });
        m.userData = { dynamic: true, selectId: p.id };
        scene.add(m);
        if (heatOn) buildPersonHeatOverlay(m, p.id);
        continue;
      }

      // Heat-map fallback before the model has loaded: a tessellated figure
      // coloured by the lux reaching each body part (head vs feet).
      if (heatOn) {
        const bodyH = p.height * 0.75, headR = p.height * 0.1;
        const cyl = new THREE.CylinderGeometry(0.18, 0.2, bodyH, 16, 18);
        cyl.translate(p.x, floorH + bodyH / 2, p.y);
        paintFigureHeat(cyl, p.id);
        const sph = new THREE.SphereGeometry(headR, 16, 14);
        sph.translate(p.x, floorH + bodyH + headR, p.y);
        paintFigureHeat(sph, p.id);
        continue;
      }

      const bodyH = p.height * 0.75;
      const headR = p.height * 0.1;
      const bodyGeo = new THREE.CylinderGeometry(0.18, 0.18, bodyH, 12);
      const bodyMat = new THREE.MeshStandardMaterial({ color: isSel ? '#ffcc33' : '#ff9633' });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = floorH + bodyH / 2;
      body.castShadow = true;
      group.add(body);

      const headGeo = new THREE.SphereGeometry(headR, 12, 8);
      const head = new THREE.Mesh(headGeo, bodyMat);
      head.position.y = floorH + bodyH + headR;
      head.castShadow = true;
      group.add(head);

      group.position.set(p.x, 0, p.y);
      scene.add(group);
    }

    // Photo mode: promote the strongest fixtures to real spotlights. Each
    // shadow-casting light is its own render pass, so cap them hard; the rest
    // still emit light (no shadow) so the fill stays believable.
    const litIds = new Set<string>();
    const shadowIds = new Set<string>();
    if (photoMode) {
      const ranked = fixtures
        .filter((f) => !f.hidden && peakCandela(f) > 0)
        .map((f) => ({ id: f.id, cd: peakCandela(f) }))
        .sort((a, b) => b.cd - a.cd);
      const MAX_LIGHTS = 12, MAX_SHADOWS = 4;
      ranked.slice(0, MAX_LIGHTS).forEach((r, i) => { litIds.add(r.id); if (i < MAX_SHADOWS) shadowIds.add(r.id); });
    }

    // Fixtures
    if (layers.fixtures.visible) for (const f of fixtures) {
      const isSel = selectedIds.has(f.id);
      // "off" = emits no light: hidden, dimmed to 0, or fully blocked by gel.
      // Drives both the ghosted body and the (no) beam, so a lamp switched off
      // in a scene reads as off in 3D.
      const off = peakCandela(f) <= 0;
      const group = new THREE.Group();
      group.userData = { dynamic: true, selectId: f.id };

      // Fixture body (small box at mounting height)
      const bodyGeo = new THREE.BoxGeometry(0.4, 0.3, 0.5);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: isSel ? '#ffcc33' : (off ? '#5a6270' : '#4fc3f7'),
        transparent: off, opacity: off ? 0.4 : 1,
      });
      const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
      bodyMesh.position.set(f.x, f.mountingHeight, f.y);
      bodyMesh.castShadow = true;
      group.add(bodyMesh);

      // Aim direction
      const dx = f.aimX - f.x;
      const dy = f.aimY - f.y;
      const angle = Math.atan2(dy, dx);
      bodyMesh.rotation.y = -angle;

      // Beam cone – drawn at the field angle (10 % isophote) so its edge
      // coincides with the heat-map fade-out (σ uses the same angle).
      const fieldAngle = effectiveFieldAngleDeg(f);
      const fixturePos = new THREE.Vector3(f.x, f.mountingHeight, f.y);
      const aimPos = new THREE.Vector3(f.aimX, 0, f.aimY);
      const coneVec = aimPos.clone().sub(fixturePos);
      const coneHeight = coneVec.length();
      const beamRadAtBase = Math.tan((fieldAngle / 2) * (Math.PI / 180)) * coneHeight;
      const dimOpacity = 0.03 + 0.06 * (f.dimming / 100); // visible but not washed out when stacked

      // A beam is only drawn for a lamp that actually emits — peakCandela() is 0
      // when the fixture is hidden OR dimmed to 0 (or fully blocked by gel), so a
      // lamp switched off in a scene shows no cone. In the photo view it also
      // needs haze, and the global showBeams toggle / haze 0 disable all shafts.
      if (!off && coneHeight > 0.1 && (photoMode ? (showBeams && haze > 0.01) : true)) {
        const coneDirNorm = coneVec.clone().normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), coneDirNorm);
        const beamColor = isSel ? new THREE.Color('#ffcc33') : new THREE.Color(getBeamColorHex(f));

        if (photoMode) {
          // True volumetric shaft, raymarched in BEAM_FRAG. The bounding cone is
          // a touch wider than the field angle so the Gaussian tail fades out
          // *inside* it (no hard rim); closed + FrontSide so the near wall always
          // gives the march a start point.
          const fieldHalfRad = (fieldAngle / 2) * (Math.PI / 180);
          const halfA = Math.min(Math.PI / 2.1, fieldHalfRad * 1.45);
          const geo = new THREE.ConeGeometry(Math.tan(halfA) * coneHeight, coneHeight, 40, 1, false);
          geo.translate(0, -coneHeight / 2, 0);
          const cone = new THREE.Mesh(geo, new THREE.ShaderMaterial({
            uniforms: {
              uApex: { value: fixturePos.clone() },
              uDir: { value: coneDirNorm.clone() },
              uHeight: { value: coneHeight },
              uSigma: { value: fieldHalfRad / Math.sqrt(2 * Math.LN10) },
              uColor: { value: beamColor },
              uHaze: { value: haze },
              uIntensity: { value: Math.max(0.12, f.dimming / 100) }, // beam density tracks the dimmer
              uTipFade: { value: 0.05 },
              uGain: { value: 32.0 },
              uHG: { value: 0.6 },     // forward-scattering haze (Mie-like)
              uExtinct: { value: 0.03 },
            },
            vertexShader: BEAM_VERT,
            fragmentShader: BEAM_FRAG,
            transparent: true,
            depthWrite: false,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
          }));
          cone.userData = { noPick: true };
          cone.position.copy(fixturePos);
          cone.setRotationFromQuaternion(quat);
          group.add(cone);
        } else {
          // Technical 3D: a faint solid cone as a beam-coverage indicator.
          const geo = new THREE.ConeGeometry(beamRadAtBase, coneHeight, 24, 1, true);
          geo.translate(0, -coneHeight / 2, 0);
          const cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color: beamColor,
            transparent: true,
            opacity: isSel ? Math.max(dimOpacity, 0.02) : dimOpacity,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.NormalBlending,
          }));
          cone.userData = { noPick: true };
          cone.position.copy(fixturePos);
          cone.setRotationFromQuaternion(quat);
          group.add(cone);
        }
      }

      // Photo mode: a real spotlight from this fixture → genuine shadows on
      // people and surfaces. Intensity/colour come from the same photometric
      // engine as the heat-map, so the relit view stays consistent.
      if (photoMode && litIds.has(f.id) && coneHeight > 0.1) {
        const spot = new THREE.SpotLight(new THREE.Color(getBeamColorHex(f)));
        spot.position.copy(fixturePos);
        spot.target.position.copy(aimPos);
        // Soft pool edge via penumbra (NOT a projected map): giving every
        // spotlight its own gobo texture blew past the GPU's texture-unit limit
        // once a rig had a handful of lamps, which made all the lit materials
        // (people, fixtures, floor) fail to render — they vanished, leaving only
        // the unlit heat-map overlays. Penumbra needs no texture and still fades
        // the edge gradually (cone opened a little past the field angle).
        const fieldHalfRad = (fieldAngle / 2) * (Math.PI / 180);
        spot.angle = Math.min(Math.PI / 2.2, fieldHalfRad * 1.15);
        spot.penumbra = 0.85; // soft radial falloff from the centre (textureless gobo substitute)
        spot.decay = 2;
        spot.distance = 0;
        spot.intensity = peakCandela(f) * LIGHT_K;
        if (shadowIds.has(f.id)) {
          spot.castShadow = true;
          spot.shadow.mapSize.set(1024, 1024);
          spot.shadow.bias = -0.0006;
          spot.shadow.camera.near = 0.5;
          spot.shadow.camera.far = Math.max(20, coneHeight * 2 + 10);
          spot.shadow.focus = 1;

          // Flügeltore: invisible shadow-casting flaps 1 m in front of the lens
          // cut the beam for real, at the same angle the heat-map uses
          // ((1−closure)·fieldHalf), oriented in the fixture's own frame.
          if (f.barnDoors) {
            const bd = f.barnDoors;
            const aN = aimPos.clone().sub(fixturePos).normalize();
            let right = new THREE.Vector3().crossVectors(aN, new THREE.Vector3(0, 1, 0));
            if (right.lengthSq() < 1e-6) right.set(1, 0, 0); else right.normalize();
            const up = new THREE.Vector3().crossVectors(right, aN).normalize();
            const br = (f.bodyRotation || 0) * Math.PI / 180;
            const cb = Math.cos(br), sb = Math.sin(br);
            const R = right.clone().multiplyScalar(cb).add(up.clone().multiplyScalar(sb));
            const U = right.clone().multiplyScalar(-sb).add(up.clone().multiplyScalar(cb));
            const L = 1.0;
            const fieldHalf = (fieldAngle / 2) * Math.PI / 180;
            const apR = Math.tan(fieldHalf) * L;
            const base = fixturePos.clone().add(aN.clone().multiplyScalar(L));
            const zAxis = new THREE.Vector3().crossVectors(R, U).normalize();
            const flapQuat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(R, U, zAxis));
            const flapMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 });
            const addFlap = (closure: number, dir: THREE.Vector3, wide: boolean) => {
              if (closure <= 0) return;
              const cut = Math.tan((1 - closure) * fieldHalf) * L;
              const ext = apR * 2.5, width = apR * 6;
              const center = base.clone().add(dir.clone().multiplyScalar(cut + ext / 2));
              const m = new THREE.Mesh(new THREE.PlaneGeometry(wide ? width : ext, wide ? ext : width), flapMat);
              m.castShadow = true;
              m.quaternion.copy(flapQuat);
              m.position.copy(center);
              m.userData = { dynamic: true };
              group.add(m);
            };
            addFlap(bd.top || 0, U, true);
            addFlap(bd.bottom || 0, U.clone().negate(), true);
            addFlap(bd.right || 0, R, false);
            addFlap(bd.left || 0, R.clone().negate(), false);
          }
        }
        group.add(spot);
        group.add(spot.target);
      }

      // Thin fixture→aim helper line — useful in the technical view, but
      // unrealistic in the photo view, so draw it only when not in photo mode
      // (or when this fixture is selected, to keep the aim editable).
      if (!photoMode || isSel) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(f.x, f.mountingHeight, f.y),
          new THREE.Vector3(f.aimX, 0, f.aimY),
        ]);
        const lineMat = new THREE.LineBasicMaterial({ color: isSel ? '#ffcc33' : '#888888', opacity: 0.5, transparent: true });
        group.add(new THREE.Line(lineGeo, lineMat));
      }

      scene.add(group);
    }

    // Placeable cameras – a marker + sight line (so you can see the viewpoints).
    for (const cam of cameras) {
      const isSel = selectedIds.has(cam.id);
      const g = new THREE.Group();
      g.userData = { dynamic: true, selectId: cam.id };
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.28, 0.5), new THREE.MeshStandardMaterial({ color: isSel ? '#ffcc33' : '#26c6da' }));
      body.position.set(cam.x, cam.height, cam.y);
      body.rotation.y = -Math.atan2(cam.aimY - cam.y, cam.aimX - cam.x);
      g.add(body);
      const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(cam.x, cam.height, cam.y), new THREE.Vector3(cam.aimX, 0.9, cam.aimY)]);
      g.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: '#26c6da', transparent: true, opacity: 0.6 })));
      scene.add(g);
    }

    // (The floor heat-map plane is built up front in the "Heat-map foundation"
    //  block so the surface drape can share its lux scale.)

    // ── Dimension annotations (Maßlinien) ──
    // CAD-style size labels — only in the plain 3D view. In the photo/heat-map
    // views they clutter the render and (being depthTest:false) punch through
    // podiums/people, hiding the heat drape on a podium top.
    if (!photoMode && !showHeatMap) for (const se of stageElements) {
      const label = `${se.width}×${se.depth}m h=${se.height}m`;
      const canvas2d = document.createElement('canvas');
      canvas2d.width = 256;
      canvas2d.height = 64;
      const ctx = canvas2d.getContext('2d')!;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = '#ffffff';
      ctx.font = '24px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 128, 32);

      const tex = new THREE.CanvasTexture(canvas2d);
      const sprMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(sprMat);
      sprite.position.set(se.x + se.width / 2, se.height + 0.5, se.y + se.depth / 2);
      sprite.scale.set(2, 0.5, 1);
      sprite.userData = { dynamic: true };
      scene.add(sprite);
    }

    // ── Frame the camera to the content once per mount, so entering the 3D
    //    view always shows the rig (instead of a fixed faraway viewpoint) ──
    if (hasContent && !framedRef.current) {
      const cx = (bMinX + bMaxX) / 2, cz = (bMinY + bMaxY) / 2;
      const span = Math.max(bMaxX - bMinX, bMaxY - bMinY, 6);
      const dist = span * 1.1 + 10;
      s.camera.position.set(cx + dist * 0.6, dist * 0.7 + 4, cz + dist * 0.85);
      s.controls.target.set(cx, 1, cz);
      s.controls.update();
      framedRef.current = true;
    }
  }, [fixtures, persons, stageElements, trusses, walls, ceilings, floorPlan, layers, cameras, selectedIds, showHeatMap, heatMapScale, heatMapTarget, photoMode, haze, showBeams, personModel, sun]);

  useImperativeHandle(ref, () => ({
    screenshot: () => {
      const s = sceneRef.current;
      if (!s) return null;
      if (photoModeRef.current) { s.renderer.toneMappingExposure = exposureRef.current; s.composer.render(); }
      else s.renderer.render(s.scene, s.camera);
      return s.renderer.domElement.toDataURL('image/png');
    },
    getCanvas: () => {
      const s = sceneRef.current;
      if (!s) return null;
      // Re-render so the read-back buffer is fresh (use the photo chain if on).
      if (photoModeRef.current) { s.renderer.toneMappingExposure = exposureRef.current; s.composer.render(); }
      else s.renderer.render(s.scene, s.camera);
      return s.renderer.domElement;
    },
    lookThroughCamera: (cam) => {
      const s = sceneRef.current;
      if (!s) return;
      s.camera.fov = cam.fov;
      s.camera.updateProjectionMatrix();
      s.camera.position.set(cam.x, cam.height, cam.y);
      s.controls.target.set(cam.aimX, 0.9, cam.aimY); // look slightly above the floor
      s.controls.update();
      framedRef.current = true; // keep this view; don't auto-frame over it
    },
  }));

  return <div ref={containerRef} className="scene3d-container" />;
});

export default Scene3D;
