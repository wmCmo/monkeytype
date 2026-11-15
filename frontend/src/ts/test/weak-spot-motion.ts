// Finger movement between two keystrokes, for weak-spot scoring. Letters that
// share a movement tend to share a difficulty: "bt", "un" and "ny" are all one
// index finger jumping between the bottom and top rows. Grouping keystrokes by
// movement lets a weakness learned on one pair carry over to pairs that have
// barely been typed.
//
// Assumes a QWERTY (ANSI) keyboard and standard touch-typing fingers.

type Hand = "L" | "R";
type Finger = "pinky" | "ring" | "middle" | "index";
type Key = { hand: Hand; finger: Finger; row: number };

// top, home, bottom; column index decides the finger
const qwertyRows = ["qwertyuiop[]\\", "asdfghjkl;'", "zxcvbnm,./"];

const fingerByColumn: [Hand, Finger][] = [
  ["L", "pinky"],
  ["L", "ring"],
  ["L", "middle"],
  ["L", "index"],
  ["L", "index"],
  ["R", "index"],
  ["R", "index"],
  ["R", "middle"],
  ["R", "ring"],
  ["R", "pinky"],
  ["R", "pinky"],
  ["R", "pinky"],
  ["R", "pinky"],
];

const fingerOrder: Record<Finger, number> = {
  pinky: 0,
  ring: 1,
  middle: 2,
  index: 3,
};

const keys = new Map<string, Key>();
qwertyRows.forEach((row, rowIndex) => {
  Array.from(row).forEach((char, column) => {
    const [hand, finger] = fingerByColumn[column] as [Hand, Finger];
    keys.set(char, { hand, finger, row: rowIndex });
  });
});

function keyOf(char: string): Key | undefined {
  return keys.get(char.toLowerCase());
}

/**
 * The movement from `from` to `to`, or undefined when either key isn't on
 * the map (space, digits, accents). Classes:
 * - `repeat`: the same key twice
 * - `alt`: the other hand
 * - `sf:<rows>`: same finger, a different key, jumping that many rows
 * - `adj:<rows>` / `far:<rows>`: same hand, neighbouring / other fingers
 */
export function motionClass(from: string, to: string): string | undefined {
  const a = keyOf(from);
  const b = keyOf(to);
  if (a === undefined || b === undefined) return undefined;
  if (from.toLowerCase() === to.toLowerCase()) return "repeat";
  if (a.hand !== b.hand) return "alt";
  const rows = Math.abs(a.row - b.row);
  if (a.finger === b.finger) return `sf:${rows}`;
  const adjacent =
    Math.abs(fingerOrder[a.finger] - fingerOrder[b.finger]) === 1;
  return `${adjacent ? "adj" : "far"}:${rows}`;
}
