import { type ArmorSlot, type Charm, ITEMS, type ItemDef } from './items';

export interface Stack { id: string; n: number }

export const INV_SIZE = 36;
export const HOTBAR = 9;

export class Inventory {
  slots: (Stack | null)[] = new Array(INV_SIZE).fill(null);
  selected = 0;
  /** Stack held on the mouse cursor while the inventory is open. */
  cursor: Stack | null = null;
  /** Worn gear. */
  equip: Record<ArmorSlot | 'charm', Stack | null> = { head: null, chest: null, feet: null, charm: null };
  /** Bumps on every change so the UI knows to redraw. */
  version = 0;

  def(id: string): ItemDef {
    return ITEMS[id];
  }

  get held(): Stack | null {
    return this.slots[this.selected];
  }

  changed() {
    this.version++;
  }

  defense(): number {
    let d = 0;
    for (const s of [this.equip.head, this.equip.chest, this.equip.feet]) if (s) d += ITEMS[s.id].armor?.defense ?? 0;
    return d;
  }

  charm(): Charm | null {
    return this.equip.charm ? ITEMS[this.equip.charm.id].charm ?? null : null;
  }

  fireproof(): boolean {
    return [this.equip.head, this.equip.chest, this.equip.feet].filter((s) => s && ITEMS[s.id].armor?.fireproof).length >= 2;
  }

  /** Which equipment slot an item goes in, if any. */
  slotFor(id: string): ArmorSlot | 'charm' | null {
    const d = ITEMS[id];
    return d.armor?.slot ?? (d.charm ? 'charm' : null);
  }

  /** Click on an equipment slot with (or without) a stack on the cursor. */
  clickEquip(slot: ArmorSlot | 'charm') {
    const c = this.cursor;
    if (c && this.slotFor(c.id) !== slot) return false;
    this.cursor = this.equip[slot];
    this.equip[slot] = c;
    this.changed();
    return true;
  }

  /** Equip straight from a pack slot (shift-click / double-click). */
  equipFrom(i: number): boolean {
    const s = this.slots[i];
    if (!s) return false;
    const slot = this.slotFor(s.id);
    if (!slot) return false;
    this.slots[i] = this.equip[slot];
    this.equip[slot] = s;
    this.changed();
    return true;
  }

  canFit(id: string): boolean {
    const max = ITEMS[id].stack;
    return this.slots.some((s) => !s || (s.id === id && s.n < max));
  }

  /** Adds items, returns how many did not fit. */
  add(id: string, n: number): number {
    const max = ITEMS[id].stack;
    for (const s of this.slots) {
      if (n <= 0) break;
      if (s && s.id === id && s.n < max) {
        const k = Math.min(n, max - s.n);
        s.n += k;
        n -= k;
      }
    }
    for (let i = 0; i < this.slots.length && n > 0; i++) {
      if (this.slots[i]) continue;
      const k = Math.min(n, max);
      this.slots[i] = { id, n: k };
      n -= k;
    }
    this.changed();
    return n;
  }

  count(id: string): number {
    let c = this.cursor?.id === id ? this.cursor.n : 0;
    for (const s of this.slots) if (s?.id === id) c += s.n;
    return c;
  }

  remove(id: string, n: number): boolean {
    if (this.count(id) < n) return false;
    for (let i = this.slots.length - 1; i >= 0 && n > 0; i--) {
      const s = this.slots[i];
      if (s?.id !== id) continue;
      const k = Math.min(n, s.n);
      s.n -= k;
      n -= k;
      if (s.n === 0) this.slots[i] = null;
    }
    if (n > 0 && this.cursor?.id === id) {
      this.cursor.n -= n;
      if (this.cursor.n <= 0) this.cursor = null;
    }
    this.changed();
    return true;
  }

  takeHeld(n = 1) {
    const s = this.held;
    if (!s) return;
    s.n -= n;
    if (s.n <= 0) this.slots[this.selected] = null;
    this.changed();
  }

  /** Left click on a slot: pick up / put down / merge / swap with the cursor stack. */
  clickSlot(i: number) {
    const s = this.slots[i];
    const c = this.cursor;
    if (c && s && c.id === s.id) {
      const k = Math.min(c.n, ITEMS[s.id].stack - s.n);
      s.n += k;
      c.n -= k;
      if (c.n === 0) this.cursor = null;
    } else {
      this.slots[i] = c;
      this.cursor = s;
    }
    this.changed();
  }

  /** Right click: take half, or drop a single item from the cursor. */
  rightClickSlot(i: number) {
    const s = this.slots[i];
    const c = this.cursor;
    if (!c && s) {
      const half = Math.ceil(s.n / 2);
      this.cursor = { id: s.id, n: half };
      s.n -= half;
      if (s.n === 0) this.slots[i] = null;
    } else if (c && (!s || (s.id === c.id && s.n < ITEMS[c.id].stack))) {
      if (s) s.n++;
      else this.slots[i] = { id: c.id, n: 1 };
      c.n--;
      if (c.n === 0) this.cursor = null;
    }
    this.changed();
  }

  /** Puts the cursor stack back into the inventory (when closing the panel). */
  stowCursor(): Stack | null {
    if (!this.cursor) return null;
    const left = this.add(this.cursor.id, this.cursor.n);
    const rest = left > 0 ? { id: this.cursor.id, n: left } : null;
    this.cursor = null;
    this.changed();
    return rest;
  }

  serialize() {
    return { slots: this.slots, selected: this.selected, equip: this.equip };
  }

  load(d: { slots: (Stack | null)[]; selected: number; equip?: Inventory['equip'] }) {
    this.slots = d.slots.map((s) => (s && ITEMS[s.id] ? { ...s } : null));
    if (d.equip) for (const k of Object.keys(this.equip) as (keyof Inventory['equip'])[]) this.equip[k] = d.equip[k] && ITEMS[d.equip[k]!.id] ? { ...d.equip[k]! } : null;
    while (this.slots.length < INV_SIZE) this.slots.push(null);
    this.selected = d.selected ?? 0;
    this.changed();
  }
}
