import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import './ui/ui.css';
import { Game } from './game/game';
import { buildPortraits } from './gfx/icons';
import { buildTextures } from './gfx/textures';

buildTextures();
buildPortraits();

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);

// Fixed-step simulation (60 Hz), render every animation frame.
const STEP = 1 / 60;
let last = performance.now();
let acc = 0;

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  while (acc >= STEP) {
    game.update(STEP);
    game.input.endFrame();
    acc -= STEP;
  }
  game.render(dt);
  game.ui.update(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handy for debugging from the console.
(window as unknown as { ashtusk: Game }).ashtusk = game;
