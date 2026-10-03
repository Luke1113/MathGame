export interface SaveData {
  /** Glyphs the player has learned: digits '0'–'9' and operators '+', '−', '×', '÷', '='. */
  has: string[];
  /** The last lamp touched — where x returns after becoming undefined. */
  lamp: { room: string; x: number; y: number } | null;
  /** Gates and doors that have been opened, as "room:key". */
  opened: string[];
  /** Shrines already taken, as "room:key". */
  taken: string[];
  bossDone: boolean;
}

const KEY = 'mathgame.save.v1';

export function freshSave(): SaveData {
  return { has: [], lamp: null, opened: [], taken: [], bossDone: false };
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<SaveData>;
    return { ...freshSave(), ...d };
  } catch {
    return null;
  }
}

export function writeSave(d: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage unavailable: progress lives only in memory */
  }
}
