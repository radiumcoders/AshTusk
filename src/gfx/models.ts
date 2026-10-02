/**
 * Voxel models built from boxes. Every model owns its materials so it can be
 * shaded by the light at its own position and flash white when hit.
 */
import * as THREE from 'three';
import { patch } from './scene';

const geoCache = new Map<string, THREE.BoxGeometry>();
function boxGeo(w: number, h: number, d: number) {
  const k = `${w},${h},${d}`;
  let g = geoCache.get(k);
  if (!g) geoCache.set(k, (g = new THREE.BoxGeometry(w, h, d)));
  return g;
}

export class Model {
  readonly root = new THREE.Group();
  readonly light = { value: new THREE.Vector2(1, 0) };
  private mats = new Map<string, THREE.MeshLambertMaterial>();
  private flashT = 0;

  constructor(private see = true) {}

  mat(color: string, glow?: string, opacity = 1): THREE.MeshLambertMaterial {
    const k = `${color}|${glow ?? ''}|${opacity}`;
    let m = this.mats.get(k);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, emissive: glow ?? 0x000000, transparent: opacity < 1, opacity });
      m.userData.baseEmissive = m.emissive.clone();
      patch(m, 'entity', this.light, this.see);
      this.mats.set(k, m);
    }
    return m;
  }

  box(parent: THREE.Object3D, w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0, glow?: string, opacity = 1) {
    const m = new THREE.Mesh(boxGeo(w, h, d), this.mat(color, glow, opacity));
    m.position.set(x, y, z);
    m.castShadow = opacity === 1;
    parent.add(m);
    return m;
  }

  group(parent: THREE.Object3D, x = 0, y = 0, z = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }

  flash(t = 0.12) {
    this.flashT = t;
  }

  update(dt: number, sky: number, block: number) {
    this.light.value.set(sky, block);
    if (this.flashT > 0) {
      this.flashT -= dt;
      const on = this.flashT > 0;
      for (const m of this.mats.values()) {
        if (on) m.emissive.setRGB(0.9, 0.9, 0.9);
        else m.emissive.copy(m.userData.baseEmissive as THREE.Color);
      }
    }
  }

  dispose() {
    this.root.removeFromParent();
    for (const m of this.mats.values()) m.dispose();
  }
}

// ------------------------------------------------------------------ humanoids

export interface Humanoid {
  m: Model;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  hand: THREE.Group;
  armor: { head: THREE.Group; chest: THREE.Group; feet: THREE.Group };
}

interface HumanoidPal { skin: string; dark: string; cloth: string; cloth2: string; boots: string; eye: string; width: number }

function humanoidBase(m: Model, p: HumanoidPal): Humanoid {
  const r = m.root;
  const W = p.width;
  const legs = [-1, 1].map((s) => {
    const g = m.group(r, s * 0.14 * W, 0.72, 0);
    m.box(g, 0.24 * W, 0.6, 0.26, p.cloth2, 0, -0.3, 0);
    m.box(g, 0.27 * W, 0.16, 0.32, p.boots, 0, -0.64, 0.03);
    return g;
  });
  const body = m.group(r, 0, 0.72, 0);
  m.box(body, 0.62 * W, 0.62, 0.36, p.skin, 0, 0.31, 0);
  m.box(body, 0.64 * W, 0.1, 0.38, p.cloth, 0, 0.05, 0);
  const head = m.group(body, 0, 0.62, 0);
  const arms = [-1, 1].map((s) => {
    const g = m.group(body, s * 0.42 * W, 0.54, 0);
    m.box(g, 0.2 * W, 0.62, 0.22, p.skin, 0, -0.27, 0);
    return g;
  });
  const hand = m.group(arms[1], 0, -0.56, 0.02);
  const armor = { head: m.group(head), chest: m.group(body), feet: m.group(r) };
  return { m, body, head, armL: arms[0], armR: arms[1], legL: legs[0], legR: legs[1], hand, armor };
}

export function buildOrc(): Humanoid {
  const m = new Model(false);
  const skin = '#5f8f3a';
  const h = humanoidBase(m, { skin, dark: '#43692a', cloth: '#4a2c18', cloth2: '#3d3a4a', boots: '#3a2a1e', eye: '#ffdd33', width: 1.08 });
  const hd = h.head;
  m.box(hd, 0.5, 0.46, 0.46, skin, 0, 0.23, 0);
  m.box(hd, 0.52, 0.08, 0.1, '#33521f', 0, 0.34, 0.2);
  for (const s of [-1, 1]) {
    m.box(hd, 0.09, 0.05, 0.03, '#ffdd33', s * 0.12, 0.27, 0.235, '#ffcc22');
    m.box(hd, 0.05, 0.13, 0.05, '#f2ead0', s * 0.14, 0.12, 0.25);
    m.box(hd, 0.14, 0.09, 0.06, '#4f7a30', s * 0.3, 0.27, -0.02).rotation.z = s * 0.4;
  }
  m.box(hd, 0.44, 0.12, 0.1, '#4f7a30', 0, 0.05, 0.2);
  m.box(hd, 0.16, 0.22, 0.16, '#1d1a1a', 0, 0.54, -0.1);
  m.box(hd, 0.36, 0.08, 0.4, '#1d1a1a', 0, 0.47, -0.04);
  m.box(hd, 0.18, 0.05, 0.02, '#b3322a', -0.12, 0.2, 0.235);
  // Harness, loincloth, fur pauldron, bracers
  m.box(h.body, 0.09, 0.72, 0.02, '#6b4226', 0, 0.32, 0.19).rotation.z = 0.62;
  m.box(h.body, 0.3, 0.26, 0.03, '#6b4226', 0, -0.08, 0.19);
  m.box(h.body, 0.12, 0.1, 0.03, '#d0b060', 0, 0.05, 0.2);
  m.box(h.armR, 0.3, 0.16, 0.3, '#b8a07a', 0, 0.03, 0);
  m.box(h.armR, 0.23, 0.14, 0.25, '#6b4226', 0, -0.38, 0);
  m.box(h.armL, 0.23, 0.14, 0.25, '#6b4226', 0, -0.38, 0);
  return h;
}

export type HollowKind = 'hollow' | 'sun' | 'frost' | 'deep';
const HOLLOW_TINT: Record<HollowKind, { skin: string; rag: string; eye: string }> = {
  hollow: { skin: '#c9cfd8', rag: '#4d5363', eye: '#5ff0ff' },
  sun: { skin: '#e2cf9e', rag: '#8a5a2a', eye: '#ffb02e' },
  frost: { skin: '#c4e2f6', rag: '#2f4f78', eye: '#b8f6ff' },
  deep: { skin: '#b88896', rag: '#4a2030', eye: '#ff3d5a' },
};

export function buildHollow(kind: HollowKind, scale = 1): Humanoid {
  const m = new Model();
  const t = HOLLOW_TINT[kind];
  const h = humanoidBase(m, { skin: t.skin, dark: '#8f98a6', cloth: t.rag, cloth2: '#262a34', boots: '#1d1f26', eye: t.eye, width: 0.82 });
  const hd = h.head;
  m.box(hd, 0.44, 0.44, 0.42, t.skin, 0, 0.22, 0);
  for (const s of [-1, 1]) {
    m.box(hd, 0.13, 0.11, 0.03, '#0d1018', s * 0.1, 0.26, 0.21);
    m.box(hd, 0.06, 0.05, 0.02, t.eye, s * 0.1, 0.26, 0.225, t.eye);
  }
  for (let i = -2; i <= 2; i++) m.box(hd, 0.05, 0.07, 0.02, '#eef2f6', i * 0.07, 0.06, 0.215);
  m.box(h.body, 0.56, 0.3, 0.04, t.rag, 0, 0.1, 0.18);
  m.box(h.body, 0.4, 0.5, 0.04, t.rag, 0.05, 0.25, -0.19);
  if (kind !== 'hollow') {
    m.box(hd, 0.5, 0.1, 0.48, t.rag, 0, 0.45, 0);
    for (const s of [-1, 0, 1]) m.box(hd, 0.08, 0.16, 0.08, t.eye, s * 0.15, 0.56, 0, t.eye);
  }
  m.root.scale.setScalar(scale);
  return h;
}

// ------------------------------------------------------------------ armor visuals

const ARMOR_COLORS: Record<string, [string, string?]> = {
  hide: ['#8a5a34'],
  iron: ['#b8bec6'],
  ember: ['#ff7a2a', '#7a2208'],
};

export function setArmor(h: Humanoid, slot: 'head' | 'chest' | 'feet', itemId: string | null) {
  const g = h.armor[slot];
  while (g.children.length) g.remove(g.children[0]);
  if (!itemId) return;
  const tier = itemId.split('_')[0];
  const [c, glow] = ARMOR_COLORS[tier] ?? ARMOR_COLORS.iron;
  const m = h.m;
  if (slot === 'head') {
    m.box(g, 0.56, 0.2, 0.52, c, 0, 0.44, -0.01, glow);
    m.box(g, 0.56, 0.06, 0.08, c, 0, 0.36, 0.24, glow);
    for (const s of [-1, 1]) {
      const horn = m.box(g, 0.07, 0.24, 0.07, '#e8dcc0', s * 0.3, 0.6, 0);
      horn.rotation.z = -s * 0.5;
    }
  } else if (slot === 'chest') {
    m.box(g, 0.68, 0.48, 0.42, c, 0, 0.36, 0, glow);
    for (const s of [-1, 1]) m.box(g, 0.32, 0.14, 0.36, c, s * 0.44, 0.58, 0, glow);
  } else {
    for (const s of [-1, 1]) m.box(g, 0.3, 0.26, 0.34, c, s * 0.15, 0.13, 0.03, glow);
  }
}

// ------------------------------------------------------------------ weapons

const MATS: Record<string, [string, string]> = {
  flint: ['#6d6f76', '#46484e'],
  stone: ['#808289', '#55575d'],
  iron: ['#c8ccd2', '#7d848d'],
  gold: ['#f5c542', '#b5851a'],
  ember: ['#ff6a1f', '#ffd27a'],
  rime: ['#9fe0ff', '#e0fbff'],
  bone: ['#e8dcc0', '#b8a888'],
  mountainbreaker: ['#3a3a42', '#ff6a1f'],
};

/** Builds a held-item model. Local +z is "forward from the hand". */
export function weaponModel(m: Model, id: string | null): THREE.Group {
  const g = new THREE.Group();
  if (!id) return g;
  const wood = '#7a5531';
  const mt = MATS[id.split('_')[0]] ?? MATS[id] ?? MATS.iron;
  const glow = id.startsWith('ember') || id === 'mountainbreaker' ? '#ff5a10' : undefined;
  const a = new THREE.Group();
  a.rotation.x = Math.PI / 2; // build along +y, point along +z
  g.add(a);
  const kind =
    id.endsWith('pick') ? 'pick' : id.endsWith('cleaver') || id === 'bone_club' ? 'cleaver' : id.endsWith('dagger') ? 'dagger'
      : id.endsWith('spear') ? 'spear' : id.endsWith('warhammer') || id === 'mountainbreaker' ? 'hammer' : id.endsWith('bow') ? 'bow'
        : id === 'throwing_axe' || id === 'ember_axe' ? 'axe' : id === 'ember_staff' ? 'staff' : id === 'torch' ? 'torch' : id.startsWith('heart') ? 'orb' : 'none';
  switch (kind) {
    case 'pick':
      m.box(a, 0.06, 0.7, 0.06, wood, 0, 0.25, 0);
      m.box(a, 0.62, 0.09, 0.09, mt[0], 0, 0.58, 0);
      for (const s of [-1, 1]) m.box(a, 0.12, 0.08, 0.08, mt[1], s * 0.33, 0.53, 0);
      break;
    case 'cleaver':
      if (id === 'bone_club') {
        m.box(a, 0.08, 0.4, 0.08, '#d8ccb0', 0, 0.15, 0);
        m.box(a, 0.16, 0.42, 0.16, '#e8dcc0', 0, 0.52, 0);
        m.box(a, 0.22, 0.1, 0.22, '#e8dcc0', 0, 0.74, 0);
      } else {
        m.box(a, 0.06, 0.3, 0.06, wood, 0, 0.05, 0);
        m.box(a, 0.16, 0.05, 0.1, mt[1], 0, 0.21, 0);
        m.box(a, 0.05, 0.62, 0.24, mt[0], 0, 0.54, 0.05, glow);
        m.box(a, 0.055, 0.62, 0.05, mt[1], 0, 0.54, -0.08);
      }
      break;
    case 'dagger':
      m.box(a, 0.05, 0.18, 0.05, '#5a3d24', 0, 0.02, 0);
      m.box(a, 0.12, 0.04, 0.06, mt[1], 0, 0.12, 0);
      m.box(a, 0.04, 0.32, 0.09, mt[0], 0, 0.3, 0);
      break;
    case 'spear':
      m.box(a, 0.05, 1.7, 0.05, wood, 0, 0.35, 0);
      m.box(a, 0.07, 0.3, 0.12, mt[0], 0, 1.33, 0, glow ?? (id === 'rime_spear' ? '#2a6a8a' : undefined));
      break;
    case 'hammer':
      m.box(a, 0.07, 1.0, 0.07, wood, 0, 0.35, 0);
      m.box(a, 0.42, 0.28, 0.28, mt[0], 0, 0.85, 0, glow);
      m.box(a, 0.46, 0.06, 0.3, mt[1], 0, 0.85, 0, glow);
      break;
    case 'axe':
      m.box(a, 0.06, 0.62, 0.06, wood, 0, 0.2, 0);
      m.box(a, 0.05, 0.3, 0.3, mt[0], 0, 0.45, 0.14, glow);
      break;
    case 'bow': {
      const b = new THREE.Group();
      b.rotation.x = -Math.PI / 2;
      g.add(b);
      for (let i = -3; i <= 3; i++) m.box(b, 0.06, 0.18, 0.06, id === 'orc_longbow' ? '#5a3d24' : '#8a5f34', 0, i * 0.15, -Math.abs(i) * 0.05);
      m.box(b, 0.015, 0.9, 0.015, '#e8e0cc', 0, 0, -0.26);
      break;
    }
    case 'staff':
      m.box(a, 0.06, 1.2, 0.06, '#5a3d24', 0, 0.3, 0);
      m.box(a, 0.16, 0.16, 0.16, '#ff7a1a', 0, 0.98, 0, '#ff6a10');
      break;
    case 'torch':
      m.box(a, 0.07, 0.5, 0.07, wood, 0, 0.15, 0);
      m.box(a, 0.13, 0.16, 0.13, '#ffb02e', 0, 0.46, 0, '#ff9a20');
      break;
    case 'orb':
      m.box(a, 0.22, 0.22, 0.22, '#ffd27a', 0, 0.1, 0, '#ff9a20');
      break;
  }
  return g;
}

// ------------------------------------------------------------------ creatures

export function buildBoar() {
  const m = new Model();
  const r = m.root;
  const body = m.group(r, 0, 0.42, 0);
  m.box(body, 0.6, 0.48, 0.95, '#7a5034', 0, 0, 0);
  m.box(body, 0.16, 0.14, 0.8, '#3a2416', 0, 0.28, -0.02);
  const head = m.group(body, 0, 0.02, 0.5);
  m.box(head, 0.44, 0.4, 0.36, '#6a4228', 0, 0, 0.12);
  m.box(head, 0.26, 0.2, 0.12, '#c08a7a', 0, -0.06, 0.34);
  for (const s of [-1, 1]) {
    m.box(head, 0.05, 0.15, 0.05, '#f2ead0', s * 0.16, 0.0, 0.33);
    m.box(head, 0.06, 0.06, 0.02, '#120a06', s * 0.13, 0.1, 0.305);
    m.box(head, 0.1, 0.12, 0.05, '#5a3a24', s * 0.18, 0.24, 0.05);
  }
  const legs = [[-0.2, 0.32], [0.2, 0.32], [-0.2, -0.32], [0.2, -0.32]].map(([x, z]) => {
    const g = m.group(r, x, 0.24, z);
    m.box(g, 0.14, 0.26, 0.14, '#3a2416', 0, -0.12, 0);
    return g;
  });
  return { m, body, head, legs };
}

export function buildSlime() {
  const m = new Model();
  const body = m.group(m.root, 0, 0, 0);
  m.box(body, 0.74, 0.62, 0.74, '#8a5fc0', 0, 0.31, 0, undefined, 0.78);
  m.box(body, 0.36, 0.3, 0.36, '#4a2c66', 0, 0.28, 0);
  for (const s of [-1, 1]) {
    m.box(body, 0.14, 0.14, 0.02, '#f0f0f0', s * 0.15, 0.42, 0.37);
    m.box(body, 0.06, 0.07, 0.02, '#1c1028', s * 0.15, 0.4, 0.38);
  }
  return { m, body };
}

export function buildBat() {
  const m = new Model();
  const body = m.group(m.root, 0, 0, 0);
  m.box(body, 0.26, 0.24, 0.26, '#3a2a4a', 0, 0, 0);
  for (const s of [-1, 1]) {
    m.box(body, 0.05, 0.04, 0.02, '#ff4060', s * 0.07, 0.04, 0.135, '#ff2040');
    m.box(body, 0.06, 0.1, 0.04, '#3a2a4a', s * 0.08, 0.16, 0);
  }
  const wings = [-1, 1].map((s) => {
    const g = m.group(body, s * 0.12, 0.02, 0);
    m.box(g, 0.5, 0.03, 0.3, '#5a4070', s * 0.25, 0, 0);
    return g;
  });
  return { m, body, wings };
}

export function buildWolf() {
  const m = new Model();
  const r = m.root;
  const body = m.group(r, 0, 0.5, 0);
  m.box(body, 0.42, 0.42, 0.9, '#3a3640', 0, 0, 0);
  m.box(body, 0.46, 0.2, 0.4, '#2a2630', 0, 0.16, 0.22);
  const head = m.group(body, 0, 0.12, 0.5);
  m.box(head, 0.36, 0.34, 0.34, '#3a3640', 0, 0, 0.08);
  m.box(head, 0.2, 0.16, 0.22, '#2a2630', 0, -0.06, 0.32);
  for (const s of [-1, 1]) {
    m.box(head, 0.08, 0.14, 0.06, '#2a2630', s * 0.12, 0.22, 0);
    m.box(head, 0.06, 0.04, 0.02, '#ff8a2a', s * 0.1, 0.06, 0.255, '#ff6a10');
  }
  const tail = m.group(body, 0, 0.12, -0.45);
  m.box(tail, 0.1, 0.1, 0.4, '#4a4450', 0, 0, -0.18).rotation.x = 0.5;
  const legs = [[-0.14, 0.3], [0.14, 0.3], [-0.14, -0.3], [0.14, -0.3]].map(([x, z]) => {
    const g = m.group(r, x, 0.32, z);
    m.box(g, 0.12, 0.34, 0.12, '#2a2630', 0, -0.16, 0);
    return g;
  });
  return { m, body, head, legs, tail };
}

export function buildSpider() {
  const m = new Model();
  const body = m.group(m.root, 0, 0.32, 0);
  m.box(body, 0.5, 0.28, 0.5, '#2a2430', 0, 0, 0.22);
  m.box(body, 0.66, 0.46, 0.66, '#3a2a40', 0, 0.06, -0.32);
  m.box(body, 0.3, 0.06, 0.3, '#7a3a8a', 0, 0.3, -0.32);
  for (const [x, y] of [[-0.08, 0.06], [0.08, 0.06], [-0.14, 0.0], [0.14, 0.0]])
    m.box(body, 0.05, 0.05, 0.02, '#ff2040', x, y, 0.475, '#ff1030');
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1])
    for (let i = 0; i < 4; i++) {
      const g = m.group(body, s * 0.22, 0, 0.36 - i * 0.18);
      const leg = m.box(g, 0.5, 0.05, 0.05, '#1c1820', s * 0.24, 0.06, 0);
      leg.rotation.z = s * 0.45;
      m.box(g, 0.05, 0.36, 0.05, '#1c1820', s * 0.47, -0.12, 0);
      legs.push(g);
    }
  return { m, body, legs };
}

export function buildBoss() {
  const m = new Model();
  const body = m.group(m.root, 0, 0, 0);
  const bone = '#d8dde6';
  m.box(body, 1.6, 1.4, 1.5, bone, 0, 0.7, 0);
  m.box(body, 1.64, 0.3, 1.54, '#b8c0cc', 0, 0.2, 0);
  for (const s of [-1, 1]) {
    m.box(body, 0.48, 0.42, 0.06, '#07080c', s * 0.38, 0.72, 0.76);
    m.box(body, 0.16, 0.14, 0.04, '#5ff0ff', s * 0.38, 0.72, 0.8, '#5ff0ff');
  }
  m.box(body, 0.18, 0.24, 0.06, '#07080c', 0, 0.38, 0.76);
  const jaw = m.group(body, 0, 0.06, 0.1);
  m.box(jaw, 1.2, 0.3, 1.1, '#b8c0cc', 0, -0.15, 0.1);
  for (let i = -4; i <= 4; i++) m.box(jaw, 0.1, 0.16, 0.08, '#f4f6fa', i * 0.12, 0.05, 0.64);
  const crown = m.group(body, 0, 1.4, 0);
  m.box(crown, 1.5, 0.22, 1.4, '#6a707b', 0, 0.1, 0);
  for (let i = -2; i <= 2; i++) {
    m.box(crown, 0.16, 0.42, 0.16, '#8a919c', i * 0.32, 0.4, 0.62);
    m.box(crown, 0.16, 0.42, 0.16, '#8a919c', i * 0.32, 0.4, -0.62);
  }
  for (const x of [-0.5, 0, 0.5]) m.box(crown, 0.14, 0.14, 0.04, '#5ff0ff', x, 0.1, 0.72, '#5ff0ff');
  const hands = [-1, 1].map((s) => {
    const g = new THREE.Group();
    m.box(g, 0.6, 0.18, 0.7, bone, 0, 0, 0);
    for (let i = -1.5; i <= 1.5; i++) m.box(g, 0.1, 0.1, 0.42, '#c8cdd6', i * 0.14, -0.04, 0.5);
    m.box(g, 0.12, 0.1, 0.3, '#c8cdd6', s * 0.32, -0.04, 0.2);
    m.root.add(g);
    return g;
  });
  return { m, body, jaw, crown, hands };
}

export function buildTotem() {
  const m = new Model();
  const r = m.root;
  const wood = '#7a5531';
  m.box(r, 0.7, 2.6, 0.7, wood, 0, 1.3, 0);
  for (let f = 0; f < 3; f++) {
    const y = 0.5 + f * 0.75;
    m.box(r, 0.74, 0.06, 0.74, '#4e341d', 0, y + 0.32, 0);
    m.box(r, 0.72, 0.08, 0.72, f === 1 ? '#b3322a' : '#8a6038', 0, y + 0.26, 0);
    for (const s of [-1, 1]) m.box(r, 0.12, 0.08, 0.04, f === 2 ? '#7fffd4' : '#2a1a0c', s * 0.16, y + 0.08, 0.36, f === 2 ? '#5fffc4' : undefined);
    m.box(r, 0.32, 0.06, 0.04, '#2a1a0c', 0, y - 0.12, 0.36);
    if (f === 2) for (const s of [-1, 1]) m.box(r, 0.05, 0.12, 0.04, '#e8dcc0', s * 0.12, y - 0.06, 0.37);
  }
  for (const s of [-1, 1]) {
    const horn = m.group(r, s * 0.32, 2.62, 0);
    m.box(horn, 0.14, 0.14, 0.14, '#e8dcc0', s * 0.08, 0, 0);
    m.box(horn, 0.12, 0.12, 0.12, '#e8dcc0', s * 0.2, 0.1, 0);
    m.box(horn, 0.1, 0.18, 0.1, '#e8dcc0', s * 0.28, 0.26, 0);
    m.box(r, 0.06, 0.4, 0.04, s > 0 ? '#b3322a' : '#e8dcc0', s * 0.4, 1.6, 0.1);
  }
  return { m };
}

export function buildForge() {
  const m = new Model();
  const r = m.root;
  const stone = '#7d7f86';
  const dark = '#4b4d53';
  const iron = '#3a3a42';
  m.box(r, 3.2, 1.0, 3.2, stone, 0, 0.5, 0);
  m.box(r, 3.3, 0.14, 3.3, '#a2a4ab', 0, 1.02, 0);
  m.box(r, 2.6, 0.5, 2.6, iron, 0, 1.3, 0);
  m.box(r, 3.0, 0.18, 3.0, '#6a6c76', 0, 1.62, 0);
  const coals = m.box(r, 2.5, 0.12, 2.5, '#3a3a40', 0, 1.6, 0);
  const sockets = [-0.85, 0, 0.85].map((x) => m.box(r, 0.4, 0.4, 0.06, '#121216', x, 0.55, 1.61));
  for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
    m.box(r, 0.4, 2.8, 0.4, dark, x, 1.4, z);
    const horn = m.group(r, x, 2.8, z);
    m.box(horn, 0.16, 0.4, 0.16, '#e8dcc0', Math.sign(x) * 0.1, 0.2, 0).rotation.z = -Math.sign(x) * 0.4;
  }
  m.box(r, 0.6, 0.5, 0.08, '#e8dcc0', 0, 0.35, 1.62);
  const flames = new THREE.Group();
  r.add(flames);
  const fl = [0, 1, 2, 3, 4, 5].map((i) => {
    const f = m.box(flames, 0.4, 0.8, 0.4, i % 2 ? '#ffb02e' : '#ff6a1a', Math.cos(i * 1.7) * 0.7, 2.0, Math.sin(i * 1.7) * 0.7, i % 2 ? '#ff9a20' : '#ff5a10');
    f.castShadow = false;
    return f;
  });
  flames.visible = false;
  return { m, coals, sockets, flames, fl };
}

// ------------------------------------------------------------------ projectiles & drops

export function buildProjectile(kind: 'arrow' | 'orb' | 'fireball' | 'axe' | 'bolt') {
  const m = new Model();
  const g = m.group(m.root);
  if (kind === 'arrow' || kind === 'bolt') {
    m.box(g, 0.04, 0.04, 0.7, kind === 'bolt' ? '#4d5363' : '#a8743f', 0, 0, 0);
    m.box(g, 0.07, 0.07, 0.12, '#c8ccd2', 0, 0, 0.38);
    m.box(g, 0.12, 0.02, 0.14, kind === 'bolt' ? '#5ff0ff' : '#e04848', 0, 0, -0.32);
  } else if (kind === 'orb') {
    m.box(g, 0.34, 0.34, 0.34, '#5ff0ff', 0, 0, 0, '#3fd0ff');
    m.box(g, 0.2, 0.2, 0.2, '#e0fbff', 0, 0, 0, '#e0fbff');
  } else if (kind === 'fireball') {
    m.box(g, 0.36, 0.36, 0.36, '#ff6a1a', 0, 0, 0, '#ff5a10');
    m.box(g, 0.22, 0.22, 0.22, '#fff1a0', 0, 0, 0, '#ffe080');
  } else {
    weaponModel(m, 'throwing_axe').children.forEach((c) => g.add(c));
  }
  return { m, g };
}
