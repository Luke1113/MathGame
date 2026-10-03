export type Op = '+' | '−' | '×' | '÷' | '^' | '√';

export type Ev =
  | { k: 'jump' }
  | { k: 'dash' }
  | { k: 'strike' }
  | { k: 'equate' }
  | { k: 'pause' }
  | { k: 'up' }
  | { k: 'down' }
  | { k: 'left' }
  | { k: 'right' }
  | { k: 'op'; op: Op }
  | { k: 'digit'; d: number }
  | { k: 'other' };

export type Hold = 'left' | 'right' | 'up' | 'down' | 'jump' | 'focus';

const HOLD: Record<string, Hold> = {
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  Space: 'jump',
  KeyL: 'focus',
  NumpadDecimal: 'focus',
};

/** Operator keys by physical position: numpad, plus U I O P (and X for times) on a laptop. */
const OP_CODES: Record<string, Op> = {
  NumpadAdd: '+',
  KeyU: '+',
  NumpadSubtract: '−',
  KeyI: '−',
  NumpadMultiply: '×',
  KeyO: '×',
  KeyX: '×',
  NumpadDivide: '÷',
  KeyP: '÷',
  KeyK: '^',
  KeyR: '√',
};

/** Operator symbols by the character typed, so Shift + = gives + and Shift + 8 gives ×, on any layout. */
const OP_CHARS: Record<string, Op> = {
  '+': '+',
  '-': '−',
  '−': '−',
  '*': '×',
  '×': '×',
  '/': '÷',
  '÷': '÷',
  '^': '^',
  '√': '√',
};

function classify(e: KeyboardEvent): Ev {
  const c = e.code;
  if (c === 'Tab') return { k: 'dash' };
  if (c === 'Space') return { k: 'jump' };
  if (c === 'KeyJ' || c === 'Numpad0') return { k: 'strike' };
  if (c === 'Enter' || c === 'NumpadEnter') return { k: 'equate' };
  if (c === 'Escape') return { k: 'pause' };
  if (c in OP_CODES) return { k: 'op', op: OP_CODES[c] };
  // Typed characters next: Shift + 8 has code Digit8 but means ×.
  if (e.key in OP_CHARS) return { k: 'op', op: OP_CHARS[e.key] };
  if (e.key === '=') return { k: 'equate' };
  if (/^[0-9]$/.test(e.key)) return { k: 'digit', d: Number(e.key) };
  const numpad = /^Numpad([1-9])$/.exec(c);
  if (numpad) return { k: 'digit', d: Number(numpad[1]) };
  const hold = HOLD[c];
  if (hold === 'up' || hold === 'down' || hold === 'left' || hold === 'right') return { k: hold };
  return { k: 'other' };
}

const SWALLOW = new Set([
  'Tab',
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Slash',
  'Quote',
  'Enter',
  'NumpadEnter',
  'Backspace',
]);

export class Input {
  private held = new Set<Hold>();
  private queue: Ev[] = [];

  constructor(target: Window) {
    target.addEventListener('keydown', (e) => {
      if (SWALLOW.has(e.code) || e.code.startsWith('Numpad')) e.preventDefault();
      const hold = HOLD[e.code];
      if (hold) this.held.add(hold);
      if (e.repeat) return;
      this.queue.push(classify(e));
    });
    target.addEventListener('keyup', (e) => {
      const hold = HOLD[e.code];
      if (hold) this.held.delete(hold);
    });
    target.addEventListener('blur', () => this.held.clear());
  }

  down(h: Hold): boolean {
    return this.held.has(h);
  }

  drain(): Ev[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}
