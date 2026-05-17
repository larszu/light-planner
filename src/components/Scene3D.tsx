import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PlacedFixture, Person, StageElement } from '../types';
import { computeHeatMap, luxToColor, luxToColorTarget, effectiveFieldAngleDeg } from '../utils/lightCalc';
import { getBeamColorHex } from '../utils/colorTemp';

export interface Scene3DHandle {
  screenshot: () => string | null;
}

interface Props {
  fixtures: PlacedFixture[];
  persons: Person[];
  stageElements: StageElement[];
  selectedIds: Set<string>;
  showHeatMap: boolean;
  heatMapScale: number;
  heatMapTarget: number;
  onSelect: (id: string | null, ctrlKey?: boolean) => void;
}

const Scene3D = forwardRef<Scene3DHandle, Props>(({ fixtures, persons, stageElements, selectedIds, showHeatMap, heatMapScale, heatMapTarget, onSelect }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    animId: number;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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

    // Ambient light
    scene.add(new THREE.AmbientLight('#666680', 0.5));
    const dirLight = new THREE.DirectionalLight('#ffffff', 0.3);
    dirLight.position.set(20, 30, 10);
    scene.add(dirLight);

    const animId = 0;
    sceneRef.current = { scene, camera, renderer, controls, animId };

    // ── WASD keyboard movement ──
    const keys: Record<string, boolean> = {};
    const MOVE_SPEED = 0.25;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle when no input/textarea is focused
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
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
      if (keys['q'] || keys['pagedown'])   { dy -= 1; }
      if (keys['e'] || keys['pageup'])     { dy += 1; }

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
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
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
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update scene objects when data changes
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    const { scene } = s;

    // Remove old dynamic objects
    const toRemove = scene.children.filter((c) => c.userData?.dynamic);
    toRemove.forEach((c) => {
      scene.remove(c);
      if (c instanceof THREE.Mesh) { c.geometry.dispose(); }
    });

    // Stage elements (podeste)
    for (const se of stageElements) {
      const geo = new THREE.BoxGeometry(se.width, se.height, se.depth);
      const isSel = selectedIds.has(se.id);
      const mat = new THREE.MeshStandardMaterial({
        color: isSel ? '#cc8833' : '#8B4513',
        roughness: 0.7,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(se.x + se.width / 2, se.height / 2, se.y + se.depth / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { dynamic: true, selectId: se.id };
      scene.add(mesh);
    }

    // Persons (cylinder body + sphere head)
    for (const p of persons) {
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

    // Fixtures
    for (const f of fixtures) {
      const isSel = selectedIds.has(f.id);
      const group = new THREE.Group();
      group.userData = { dynamic: true, selectId: f.id };

      // Fixture body (small box at mounting height)
      const bodyGeo = new THREE.BoxGeometry(0.4, 0.3, 0.5);
      const bodyMat = new THREE.MeshStandardMaterial({ color: isSel ? '#ffcc33' : '#4fc3f7' });
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
      const dimOpacity = 0.04 * (f.dimming / 100);

      if (coneHeight > 0.1) {
        const coneGeo = new THREE.ConeGeometry(beamRadAtBase, coneHeight, 24, 1, true);
        // Shift geometry so tip is at local origin (tip at y=+h/2, base at y=-h/2)
        coneGeo.translate(0, -coneHeight / 2, 0);

        const coneMat = new THREE.MeshBasicMaterial({
          color: isSel ? '#ffcc33' : new THREE.Color(getBeamColorHex(f)),
          transparent: true,
          opacity: isSel ? Math.max(dimOpacity, 0.02) : dimOpacity,
          side: THREE.DoubleSide,
          depthWrite: false,
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

      // Thin line from fixture to aim point
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(f.x, f.mountingHeight, f.y),
        new THREE.Vector3(f.aimX, 0, f.aimY),
      ]);
      const lineMat = new THREE.LineBasicMaterial({ color: isSel ? '#ffcc33' : '#888888', opacity: 0.5, transparent: true });
      group.add(new THREE.Line(lineGeo, lineMat));

      scene.add(group);
    }

    // ── 3D Heatmap on ground plane ──
    if (showHeatMap && fixtures.length > 0) {
      const hmSize = 60;
      const hmRes = 128;
      const { data, maxLux } = computeHeatMap(fixtures, -hmSize / 2, -hmSize / 2, hmSize, hmSize, hmRes, hmRes);
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
        imgData.data[i * 4] = r;
        imgData.data[i * 4 + 1] = g;
        imgData.data[i * 4 + 2] = b;
        imgData.data[i * 4 + 3] = a;
      }
      ctx.putImageData(imgData, 0, 0);

      const hmTexture = new THREE.CanvasTexture(canvas2d);
      hmTexture.minFilter = THREE.LinearFilter;
      hmTexture.magFilter = THREE.LinearFilter;

      const hmGeo = new THREE.PlaneGeometry(hmSize, hmSize);
      const hmMat = new THREE.MeshBasicMaterial({
        map: hmTexture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const hmMesh = new THREE.Mesh(hmGeo, hmMat);
      hmMesh.rotation.x = -Math.PI / 2;
      hmMesh.position.y = 0.01; // slightly above ground
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
  }, [fixtures, persons, stageElements, selectedIds, showHeatMap, heatMapScale, heatMapTarget]);

  useImperativeHandle(ref, () => ({
    screenshot: () => {
      const s = sceneRef.current;
      if (!s) return null;
      s.renderer.render(s.scene, s.camera);
      return s.renderer.domElement.toDataURL('image/png');
    },
  }));

  return <div ref={containerRef} className="scene3d-container" />;
});

export default Scene3D;
