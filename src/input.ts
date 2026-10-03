export type Op = '+' | '−' | '×' | '÷';

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
  Tab: 'focus',
  KeyL: 'focus',
  NumpadDecimal: 'focus',
};

const OPS: Record<string, Op> = {
  NumpadAdd: '+',
  KeyU: '+',
  NumpadSubtract: '−',
  KeyI: '−',
  Minus: '−',
  NumpadMultiply: '×',
  KeyO: '×',
  NumpadDivide: '÷',
  KeyP: '÷',
  Slash: '÷',
};

function classify(e: KeyboardEvent): Ev {
  const c = e.code;
  if (c === 'Equal') return e.key === '+' ? { k: 'op', op: '+' } : { k: 'equate' };
  if (c in OPS) return { k: 'op', op: OPS[c] };
  if (c === 'Space') return { k: 'jump' };
  if (c === 'ShiftLeft' || c === 'ShiftRight') return { k: 'dash' };
  if (c === 'KeyJ' || c === 'Numpad0') return { k: 'strike' };
  if (c === 'Enter' || c === 'NumpadEnter') return { k: 'equate' };
  if (c === 'Escape') return { k: 'pause' };
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(c);
  if (digit) return { k: 'digit', d: Number(digit[1]) };
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
