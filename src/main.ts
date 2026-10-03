import { Game } from './game';
import { Input } from './input';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const input = new Input(window);
const game = new Game(canvas, input);

function resize(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
}
window.addEventListener('resize', resize);
resize();

const wake = () => game.sfx.unlock();
window.addEventListener('keydown', wake);
window.addEventListener('pointerdown', () => {
  wake();
  canvas.focus();
});
canvas.focus();

// Debug hooks for automated play-testing.
(window as unknown as { __game: Game }).__game = game;

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(1 / 30, (now - last) / 1000);
  last = now;
  game.frame(dt);
  game.render();
  requestAnimationFrame(loop);
}

void document.fonts?.load('italic 500 32px "Cormorant Garamond"').catch(() => undefined);
requestAnimationFrame(loop);
