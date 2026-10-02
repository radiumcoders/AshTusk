/** Voxel debris and glowing sparks, rendered as two instanced meshes. */
import * as THREE from 'three';
import type { World } from '../world/world';

interface P {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  life: number; max: number; size: number; c: THREE.Color; grav: number; collide: boolean;
}

export interface BurstOpts { speed?: number; size?: number; life?: number; grav?: number; up?: number; collide?: boolean; light?: number; spread?: number }

const MAX = 1400;

class Pool {
  readonly mesh: THREE.InstancedMesh;
  list: P[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private v = new THREE.Vector3();

  constructor(mat: THREE.Material) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  update(dt: number, world: World) {
    for (const p of this.list) {
      p.life -= dt;
      p.vy -= p.grav * dt;
      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;
      const nz = p.z + p.vz * dt;
      if (p.collide && world.solid(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
        p.vx *= 0.4;
        p.vz *= 0.4;
        p.vy = Math.abs(p.vy) * 0.2;
      } else {
        p.x = nx;
        p.y = ny;
        p.z = nz;
      }
    }
    this.list = this.list.filter((p) => p.life > 0);
    const n = Math.min(MAX, this.list.length);
    for (let i = 0; i < n; i++) {
      const p = this.list[i];
      const k = Math.min(1, (p.life / p.max) * 2) * p.size;
      this.s.set(k, k, k);
      this.v.set(p.x, p.y, p.z);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, p.c);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class Particles {
  private solid = new Pool(new THREE.MeshBasicMaterial({ fog: false }));
  private glow = new Pool(new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));

  constructor(scene: THREE.Scene) {
    scene.add(this.solid.mesh, this.glow.mesh);
  }

  burst(x: number, y: number, z: number, color: string | THREE.Color, n: number, o: BurstOpts = {}, glow = false) {
    const pool = glow ? this.glow : this.solid;
    const base = new THREE.Color(color);
    if (!glow) base.multiplyScalar(o.light ?? 1);
    const speed = o.speed ?? 3;
    for (let i = 0; i < n; i++) {
      if (pool.list.length >= MAX) pool.list.shift();
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.3) * Math.PI * 0.5;
      const s = speed * (0.3 + Math.random() * 0.7);
      const life = (o.life ?? 0.7) * (0.6 + Math.random() * 0.6);
      const sp = o.spread ?? 0.3;
      pool.list.push({
        x: x + (Math.random() - 0.5) * sp, y: y + (Math.random() - 0.5) * sp, z: z + (Math.random() - 0.5) * sp,
        vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + (o.up ?? 2), vz: Math.sin(a) * Math.cos(e) * s,
        life, max: life, size: (o.size ?? 0.1) * (0.7 + Math.random() * 0.6),
        c: base.clone().multiplyScalar(0.85 + Math.random() * 0.3), grav: o.grav ?? 14, collide: o.collide ?? true,
      });
    }
  }

  update(dt: number, world: World) {
    this.solid.update(dt, world);
    this.glow.update(dt, world);
  }
}
