import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { PlacedFixture, Person, StageElement, Truss, Wall, Ceiling, FloorPlan, Layers } from '../types';
import { computeHeatMap, luxToColor, luxToColorTarget, effectiveFieldAngleDeg, peakCandela } from '../utils/lightCalc';
import { getBeamColorHex } from '../utils/colorTemp';
import { sampleWall, isCurved } from '../utils/geometry';

// Candela → three.js spotlight intensity. Keeps relative brightness physical
// (ratios + 1/r² falloff); the exposure control handles absolute calibration.
const LIGHT_K = 0.0016;

// A real (textured) human model, loaded once and reused for the photo view so
// people cast and receive real shadows. Falls back to the simple cylinder when
// it isn't loaded (or in the non-photo view).
interface PersonModel { scene: THREE.Group; height: number; minY: number }
let personModelPromise: Promise<PersonModel> | null = null;
function loadPersonModel(): Promise<PersonModel> {
  if (!personModelPromise) {
    const url = `${import.meta.env.BASE_URL}models/person.glb`;
    personModelPromise = new GLTFLoader().loadAsync(url).then((g) => {
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
  selectedIds: Set<string>;
  showHeatMap: boolean;
  heatMapScale: number;
  heatMapTarget: number;
  photoMode: boolean;
  exposure: number;
  onSelect: (id: string | null, ctrlKey?: boolean) => void;
}

const Scene3D = forwardRef<Scene3DHandle, Props>(({ fixtures, persons, stageElements, trusses, walls, ceilings, floorPlan, layers, selectedIds, showHeatMap, heatMapScale, heatMapTarget, photoMode, exposure, onSelect }, ref) => {
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
    dir: THREE.DirectionalLight;
    grid: THREE.GridHelper;
  } | null>(null);
  // Whether the camera has been framed to the content yet (once per mount).
  const framedRef = useRef(false);
  // Photo-realism flags read by the animation loop without re-creating it.
  const photoModeRef = useRef(photoMode);
  const exposureRef = useRef(exposure);
  // Real human model for the photo view (lazy-loaded on first use).
  const [personModel, setPersonModel] = React.useState<PersonModel | null>(null);
  useEffect(() => {
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

    // Ground grid
    const grid = new THREE.GridHelper(60, 60, '#3a3a50', '#2a2a3c');
    scene.add(grid);

    // Ground plane (for shadows)
    const groundGeo = new THREE.PlaneGeometry(60, 60);
    const groundMat = new THREE.MeshStandardMaterial({ color: '#222238', roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Ambient + key light. In photo mode these are dimmed right down so the
    // fixtures themselves light the scene (and cast the real shadows).
    const ambient = new THREE.AmbientLight('#666680', photoModeRef.current ? 0.12 : 0.5);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight('#ffffff', photoModeRef.current ? 0.04 : 0.3);
    dirLight.position.set(20, 30, 10);
    scene.add(dirLight);

    // ── Post-processing chain for the photo view (bloom around bright sources) ──
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    composer.setSize(container.clientWidth, container.clientHeight);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.7,  // strength
      0.6,  // radius
      0.75, // threshold (only the bright bits bloom)
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    renderer.toneMapping = photoModeRef.current ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    renderer.toneMappingExposure = exposureRef.current;

    const animId = 0;
    sceneRef.current = { scene, camera, renderer, controls, animId, composer, bloom, ambient, dir: dirLight, grid };

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

    return () => {
      cancelAnimationFrame(sceneRef.current!.animId);
      renderer.domElement.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      obs.disconnect();
      composer.dispose();
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
    s.ambient.intensity = photoMode ? 0.12 : 0.5;
    s.dir.intensity = photoMode ? 0.05 : 0.3;
    s.grid.visible = !photoMode;
    s.scene.background = new THREE.Color(photoMode ? '#08080d' : '#1a1a2e');
    // Tone-mapping change requires existing materials to recompile.
    s.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((mm) => { mm.needsUpdate = true; });
    });
  }, [photoMode, exposure]);

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
          mats.forEach((m) => { (m as THREE.MeshBasicMaterial).map?.dispose(); m.dispose(); });
        } else if (o instanceof THREE.SpotLight) {
          o.shadow?.map?.dispose();
        }
      });
    });

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

    // Walls (vertical surfaces, straight or curved, that reflect light)
    if (layers.walls.visible) for (const w of walls) {
      if (Math.hypot(w.x2 - w.x1, w.y2 - w.y1) < 0.05) continue;
      const isSel = selectedIds.has(w.id);
      const pts = sampleWall(w, isCurved(w) ? 18 : 1); // floor polyline
      const pos: number[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        // two triangles forming the vertical quad a→b
        pos.push(a.x, 0, a.y, b.x, 0, b.y, b.x, w.height, b.y);
        pos.push(a.x, 0, a.y, b.x, w.height, b.y, a.x, w.height, a.y);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: isSel ? '#ffcc33' : w.color, roughness: 0.85, metalness: 0, side: THREE.DoubleSide,
      }));
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData = { dynamic: true, selectId: w.id };
      scene.add(mesh);
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

      // Photo view: a real, textured human that casts & receives real shadows.
      if (photoMode && personModel) {
        const m = cloneSkeleton(personModel.scene) as THREE.Group;
        const s = p.height / personModel.height;
        m.scale.setScalar(s);
        m.position.set(p.x, floorH - personModel.minY * s, p.y);
        m.rotation.y = Math.PI; // face toward −Z (typical "downstage")
        m.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
        });
        m.userData = { dynamic: true, selectId: p.id };
        if (isSel) m.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh && mesh.material) {
            const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
            mat.emissive = new THREE.Color('#ffcc33'); mat.emissiveIntensity = 0.25;
          }
        });
        scene.add(m);
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
      const MAX_LIGHTS = 24, MAX_SHADOWS = 6;
      ranked.slice(0, MAX_LIGHTS).forEach((r, i) => { litIds.add(r.id); if (i < MAX_SHADOWS) shadowIds.add(r.id); });
    }

    // Fixtures
    if (layers.fixtures.visible) for (const f of fixtures) {
      const isSel = selectedIds.has(f.id);
      const hidden = !!f.hidden; // muted lamp: ghosted body, no beam
      const group = new THREE.Group();
      group.userData = { dynamic: true, selectId: f.id };

      // Fixture body (small box at mounting height)
      const bodyGeo = new THREE.BoxGeometry(0.4, 0.3, 0.5);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: isSel ? '#ffcc33' : (hidden ? '#5a6270' : '#4fc3f7'),
        transparent: hidden, opacity: hidden ? 0.4 : 1,
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

      if (!hidden && coneHeight > 0.1) {
        const coneGeo = new THREE.ConeGeometry(beamRadAtBase, coneHeight, 24, 1, true);
        // Shift geometry so tip is at local origin (tip at y=+h/2, base at y=-h/2)
        coneGeo.translate(0, -coneHeight / 2, 0);

        // Photo mode: additively-blended haze so the beam reads as a volumetric
        // shaft (bloom then turns the bright core into a glow). Only the back
        // faces are drawn so the shaft doesn't wash out subjects in front of it.
        const volA = 0.04 + 0.08 * (f.dimming / 100);
        const coneMat = new THREE.MeshBasicMaterial({
          color: isSel ? '#ffcc33' : new THREE.Color(getBeamColorHex(f)),
          transparent: true,
          opacity: photoMode ? (isSel ? Math.max(volA, 0.04) : volA) : (isSel ? Math.max(dimOpacity, 0.02) : dimOpacity),
          side: photoMode ? THREE.BackSide : THREE.DoubleSide,
          depthWrite: false,
          blending: photoMode ? THREE.AdditiveBlending : THREE.NormalBlending,
        });
        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.position.copy(fixturePos);

        // Orient: local -Y (base direction) should point toward aim
        const coneDirNorm = coneVec.clone().normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, -1, 0),
          coneDirNorm,
        );
        cone.setRotationFromQuaternion(quat);
        group.add(cone);
      }

      // Photo mode: a real spotlight from this fixture → genuine shadows on
      // people and surfaces. Intensity/colour come from the same photometric
      // engine as the heat-map, so the relit view stays consistent.
      if (photoMode && litIds.has(f.id) && coneHeight > 0.1) {
        const spot = new THREE.SpotLight(new THREE.Color(getBeamColorHex(f)));
        spot.position.copy(fixturePos);
        spot.target.position.copy(aimPos);
        spot.angle = Math.min(Math.PI / 2.2, (fieldAngle / 2) * (Math.PI / 180));
        const beamDeg = f.currentBeamAngle ?? f.fixture.beamAngle;
        spot.penumbra = Math.max(0.15, Math.min(0.9, 1 - beamDeg / Math.max(fieldAngle, 0.01)));
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

      // Thin line from fixture to aim point
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(f.x, f.mountingHeight, f.y),
        new THREE.Vector3(f.aimX, 0, f.aimY),
      ]);
      const lineMat = new THREE.LineBasicMaterial({ color: isSel ? '#ffcc33' : '#888888', opacity: 0.5, transparent: true });
      group.add(new THREE.Line(lineGeo, lineMat));

      scene.add(group);
    }

    // ── 3D Heatmap on the ground, sized to cover the actual rig ──
    if (showHeatMap && fixtures.length > 0 && hasContent) {
      const pad = 4;
      const hx0 = bMinX - pad, hz0 = bMinY - pad;
      const hw = Math.max(8, (bMaxX - bMinX) + 2 * pad);
      const hd = Math.max(8, (bMaxY - bMinY) + 2 * pad);
      const hmRes = 180;
      const { data, maxLux } = computeHeatMap(fixtures, hx0, hz0, hw, hd, hmRes, hmRes, walls, ceilings);
      const scale = heatMapScale > 0 ? heatMapScale : (maxLux || 1000);

      const canvas2d = document.createElement('canvas');
      canvas2d.width = hmRes;
      canvas2d.height = hmRes;
      const ctx = canvas2d.getContext('2d')!;
      const imgData = ctx.createImageData(hmRes, hmRes);
      for (let i = 0; i < hmRes * hmRes; i++) {
        const [r, g, b, a] = heatMapTarget > 0
          ? luxToColorTarget(data[i], heatMapTarget)
          : luxToColor(data[i], scale);
        imgData.data[i * 4] = r; imgData.data[i * 4 + 1] = g;
        imgData.data[i * 4 + 2] = b; imgData.data[i * 4 + 3] = a;
      }
      ctx.putImageData(imgData, 0, 0);

      const hmTexture = new THREE.CanvasTexture(canvas2d);
      hmTexture.minFilter = THREE.LinearFilter;
      hmTexture.magFilter = THREE.LinearFilter;

      const hmMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(hw, hd),
        new THREE.MeshBasicMaterial({ map: hmTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      );
      hmMesh.rotation.x = -Math.PI / 2;
      // data row 0 = world y = hz0 (north); plane local +Y maps to world -Z
      // after the −90° X-rotation, so the texture lines up with the grid.
      hmMesh.position.set(hx0 + hw / 2, 0.012, hz0 + hd / 2);
      hmMesh.userData = { dynamic: true };
      scene.add(hmMesh);
    }

    // ── Dimension annotations (Maßlinien) ──
    // Add size labels for stage elements
    for (const se of stageElements) {
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
  }, [fixtures, persons, stageElements, trusses, walls, ceilings, floorPlan, layers, selectedIds, showHeatMap, heatMapScale, heatMapTarget, photoMode, personModel]);

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
  }));

  return <div ref={containerRef} className="scene3d-container" />;
});

export default Scene3D;
