/** Keyboard + mouse state, polled once per fixed update. */
export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  mouse = { x: 0, y: 0, left: false, right: false, leftPressed: false, rightPressed: false, wheel: 0 };
  /** Set by UI panels that want to own the mouse (inventory open etc.). */
  captured = false;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.left = this.mouse.right = false;
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    target.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    target.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  hit(...codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.leftPressed = this.mouse.rightPressed = false;
    this.mouse.wheel = 0;
  }
}
