/**
 * Three.js scene: isometric orthographic camera, sun/moon lighting with
 * shadows, voxel materials and chunk mesh management.
 *
 * All world + entity materials are patched with a small shader extension:
 *  - baked sky/torch light (per vertex for voxels, per object for entities)
 *  - up to 8 dynamic point glows (player torch, fireballs, the forge...)
 *  - a horizontal cutaway so caves and interiors are visible from above
 *  - dithered see-through of anything between the camera and the player
 */
import * as THREE from 'three';
import { CHUNK, DAY_PORTION, HEIGHT, LOAD_RADIUS, MESH_BUDGET_MS } from '../config';
import type { Chunk } from '../world/chunk';
import { buildChunk, type ChunkMesh, type Geo } from '../world/mesher';
import type { World } from '../world/world';
import { atlas, crackTex } from './textures';

export const MAX_LIGHTS = 8;

/** Uniforms shared by every patched material. */
export const U = {
  uCutY: { value: 999 },
  uPlayer: { value: new THREE.Vector3() },
  uCamDir: { value: new THREE.Vector3(1, 1, 1).normalize() },
  uSee: { value: 1 },
  uLights: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) },
  uLightCols: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3()) },
  uLightN: { value: 0 },
  uTorch: { value: new THREE.Vector3(1.0, 0.68, 0.38) },
  uMinLight: { value: 0.035 },
};

export function patch(mat: THREE.Material, kind: 'voxel' | 'entity', ent?: { value: THREE.Vector2 }, see = true, cap = false) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    if (ent) sh.uniforms.uEnt = ent;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
${kind === 'voxel' ? 'attribute vec2 aLight;' : 'uniform vec2 uEnt;'}
varying vec2 vLight;
varying vec3 vWorldP;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vLight = ${kind === 'voxel' ? 'aLight' : 'uEnt'};
vWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uCutY;
uniform vec3 uPlayer;
uniform vec3 uCamDir;
uniform float uSee;
uniform vec4 uLights[${MAX_LIGHTS}];
uniform vec3 uLightCols[${MAX_LIGHTS}];
uniform int uLightN;
uniform vec3 uTorch;
uniform float uMinLight;
varying vec2 vLight;
varying vec3 vWorldP;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if (vWorldP.y > uCutY) discard;
${see ? `if (uSee > 0.5) {
  vec3 sv = vWorldP - uPlayer;
  float st = dot(sv, uCamDir);
  if (st > 0.7 && vWorldP.y > uPlayer.y - 0.25) {
    float sr = length(sv - st * uCamDir);
    float chk = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0);
    if (sr < 1.3 || (sr < 2.3 && chk < 1.0)) discard;
  }
}` : ''}
${cap ? `// Back faces seen through the cutaway are the inside of solid rock: paint them as a dark cross-section.
if (!gl_FrontFacing) {
  // Outdoors there is no cut, so a visible back face can only come from the see-through hole: just let it vanish.
  vec3 bv = vWorldP - uPlayer;
  float bt = dot(bv, uCamDir);
  bool nearSee = uSee > 0.5 && vWorldP.y > uPlayer.y - 0.25 && length(bv - bt * uCamDir) < 2.4;
  if (uCutY > 900.0 || nearSee) discard;
  gl_FragColor = vec4(0.045, 0.04, 0.055, 1.0);
  return;
}` : ''}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
reflectedLight.directDiffuse *= vLight.x;
reflectedLight.indirectDiffuse *= max(vLight.x, uMinLight);
vec3 dyn = vec3(0.0);
for (int i = 0; i < ${MAX_LIGHTS}; i++) {
  if (i >= uLightN) break;
  vec4 L = uLights[i];
  float a = clamp(1.0 - distance(vWorldP, L.xyz) / L.w, 0.0, 1.0);
  dyn += uLightCols[i] * a * a;
}
totalEmissiveRadiance += diffuseColor.rgb * (uTorch * vLight.y * 1.2 + dyn);`);
  };
  mat.customProgramCacheKey = () => `ashtusk-${kind}-${see}-${cap}`;
  return mat;
}

interface ChunkView { group: THREE.Group; meshes: THREE.Mesh[] }

export class Scene3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly sun = new THREE.DirectionalLight(0xffffff, 2.4);
  readonly hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a4a3a, 1.1);
  readonly target = new THREE.Vector3();
  yaw = Math.PI / 4;
  yawTarget = Math.PI / 4;
  zoom = 1;
  pixelScale = 2;
  readonly camDir = new THREE.Vector3();

  readonly solidMat: THREE.MeshLambertMaterial;
  readonly cutoutMat: THREE.MeshLambertMaterial;
  readonly plantMat: THREE.MeshLambertMaterial;
  readonly waterMat: THREE.MeshLambertMaterial;
  readonly lavaMat: THREE.MeshLambertMaterial;
  private views = new Map<Chunk, ChunkView>();
  readonly highlight: THREE.LineSegments;
  readonly crack: THREE.Mesh;
  private crackMaps: THREE.CanvasTexture[];
  private fog = new THREE.Fog(0x8fc4e8, 110, 150);

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio(1);
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -200, 400);
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(0x8fc4e8);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -34;
    sc.right = sc.top = 34;
    sc.near = 1;
    sc.far = 220;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target, this.hemi);

    const tex = new THREE.CanvasTexture(atlas.canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.solidMat = patch(new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, side: THREE.DoubleSide, shadowSide: THREE.FrontSide }), 'voxel', undefined, true, true) as THREE.MeshLambertMaterial;
    this.cutoutMat = patch(new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, alphaTest: 0.5 }), 'voxel') as THREE.MeshLambertMaterial;
    this.plantMat = patch(new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }), 'voxel') as THREE.MeshLambertMaterial;
    this.waterMat = patch(new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false }), 'voxel') as THREE.MeshLambertMaterial;
    this.lavaMat = patch(new THREE.MeshLambertMaterial({ map: tex, vertexColors: true }), 'voxel') as THREE.MeshLambertMaterial;

    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
      new THREE.LineBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.85 }),
    );
    this.highlight.visible = false;
    this.crackMaps = crackTex.map((c) => {
      const t = new THREE.CanvasTexture(c);
      t.magFilter = t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      return t;
    });
    this.crack = new THREE.Mesh(
      new THREE.BoxGeometry(1.006, 1.006, 1.006),
      new THREE.MeshBasicMaterial({ map: this.crackMaps[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
    );
    this.crack.visible = false;
    this.scene.add(this.highlight, this.crack);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setShadows(on: boolean) {
    this.renderer.shadowMap.enabled = on;
    for (const m of [this.solidMat, this.cutoutMat, this.plantMat, this.waterMat, this.lavaMat]) m.needsUpdate = true;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
  }

  setPixelScale(s: number) {
    this.pixelScale = s;
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(Math.ceil(w / this.pixelScale), Math.ceil(h / this.pixelScale), false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.updateCamera();
  }

  updateCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    const vh = 26 / this.zoom;
    const c = this.camera;
    c.left = (-vh * aspect) / 2;
    c.right = (vh * aspect) / 2;
    c.top = vh / 2;
    c.bottom = -vh / 2;
    c.updateProjectionMatrix();
  }

  /** Smoothly follow a world position. */
  follow(p: THREE.Vector3, dt: number) {
    this.target.lerp(p, Math.min(1, dt * 7));
    let d = this.yawTarget - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 9);
    const el = THREE.MathUtils.degToRad(36);
    this.camDir.set(Math.sin(this.yaw) * Math.cos(el), Math.sin(el), Math.cos(this.yaw) * Math.cos(el));
    this.camera.position.copy(this.target).addScaledVector(this.camDir, 100);
    this.camera.lookAt(this.target);
    U.uCamDir.value.copy(this.camDir);
  }

  /** Camera-relative movement axes on the ground plane. */
  axes() {
    const f = new THREE.Vector2(-Math.sin(this.yaw), -Math.cos(this.yaw));
    const r = new THREE.Vector2(Math.cos(this.yaw), -Math.sin(this.yaw));
    return { f, r };
  }

  ray(clientX: number, clientY: number): THREE.Ray {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    return rc.ray;
  }

  project(p: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const v = p.clone().project(this.camera);
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight, visible: v.x > -1 && v.x < 1 && v.y > -1 && v.y < 1 };
  }

  // ---------------------------------------------------------------- time of day

  setTime(dayTime: number, eclipse: number) {
    const D = DAY_PORTION;
    const day = dayTime < D;
    const p = day ? dayTime / D : (dayTime - D) / (1 - D);
    const arc = Math.PI * p;
    // Sun travels east -> west, tilted towards the south.
    const dir = new THREE.Vector3(Math.cos(arc), Math.sin(arc) * 0.9 + 0.12, 0.45).normalize();
    this.sun.position.copy(this.target).addScaledVector(dir, 100);
    this.sun.target.position.copy(this.target);

    const edge = day ? Math.min(1, Math.min(p, 1 - p) * 8) : 0;
    const dayCol = new THREE.Color(0xfff2dc);
    const duskCol = new THREE.Color(0xff9a5a);
    const moonCol = new THREE.Color(0x8aa0ff);
    const col = day ? duskCol.clone().lerp(dayCol, edge) : moonCol;
    let sunI = day ? 0.6 + 1.9 * edge : 0.75;
    let hemiI = day ? 0.45 + 0.75 * edge : 0.6;
    const sky = day
      ? new THREE.Color(0xe8946a).lerp(new THREE.Color(0x8fc4e8), edge)
      : new THREE.Color(0x0b1024).lerp(new THREE.Color(0x1a1838), Math.max(0, 1 - Math.min(p, 1 - p) * 6));
    this.hemi.color.set(day ? 0xcfe8ff : 0x7a8ad0);
    this.hemi.groundColor.set(day ? 0x6a5a48 : 0x1a1a2a);
    if (eclipse > 0) {
      col.lerp(new THREE.Color(0xff3a3a), eclipse);
      sky.lerp(new THREE.Color(0x1a0408), eclipse);
      sunI *= 1 - eclipse * 0.8;
      hemiI *= 1 - eclipse * 0.6;
    }
    this.sun.color.copy(col);
    this.sun.intensity = sunI;
    this.hemi.intensity = hemiI;
    (this.scene.background as THREE.Color).copy(sky);
    this.fog.color.copy(sky);
  }

  // ---------------------------------------------------------------- chunks

  /** Builds/updates chunk meshes near the focus, nearest first, within a time budget. */
  updateChunks(world: World, fx: number, fz: number) {
    const pcx = Math.floor(fx / CHUNK);
    const pcz = Math.floor(fz / CHUNK);
    const todo: [number, Chunk][] = [];
    for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++)
      for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
        const c = world.chunk(pcx + dx, pcz + dz);
        if (c.dirty || !this.views.has(c)) todo.push([dx * dx + dz * dz, c]);
      }
    if (!todo.length) return 0;
    todo.sort((a, b) => a[0] - b[0]);
    const start = performance.now();
    let n = 0;
    for (const [, c] of todo) {
      this.setChunk(c, buildChunk(world, c));
      n++;
      if (performance.now() - start > MESH_BUDGET_MS) break;
    }
    return todo.length - n;
  }

  /** Synchronously meshes everything around a point (used while loading). */
  buildAll(world: World, fx: number, fz: number) {
    while (this.updateChunks(world, fx, fz) > 0);
  }

  private toGeometry(g: Geo): THREE.BufferGeometry | null {
    if (!g.idx.length) return null;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(g.nrm, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
    geom.setAttribute('aLight', new THREE.Float32BufferAttribute(g.lit, 2));
    geom.setIndex(g.idx);
    geom.computeBoundingSphere();
    return geom;
  }

  private setChunk(c: Chunk, data: ChunkMesh) {
    this.removeChunk(c);
    const group = new THREE.Group();
    const meshes: THREE.Mesh[] = [];
    const add = (g: Geo, mat: THREE.Material, cast: boolean) => {
      const geom = this.toGeometry(g);
      if (!geom) return;
      const m = new THREE.Mesh(geom, mat);
      m.castShadow = cast;
      m.receiveShadow = true;
      group.add(m);
      meshes.push(m);
    };
    add(data.solid, this.solidMat, true);
    add(data.cutout, this.cutoutMat, true);
    add(data.plant, this.plantMat, false);
    add(data.lava, this.lavaMat, false);
    add(data.water, this.waterMat, false);
    this.scene.add(group);
    this.views.set(c, { group, meshes });
  }

  removeChunk(c: Chunk) {
    const v = this.views.get(c);
    if (!v) return;
    for (const m of v.meshes) m.geometry.dispose();
    this.scene.remove(v.group);
    this.views.delete(c);
  }

  clearChunks() {
    for (const c of [...this.views.keys()]) this.removeChunk(c);
  }

  setCrack(stage: number) {
    (this.crack.material as THREE.MeshBasicMaterial).map = this.crackMaps[Math.min(4, stage)];
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

export { HEIGHT };
