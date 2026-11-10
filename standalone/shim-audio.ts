/** Opens one AudioContext on the player's first click or key press (browsers require a gesture). */
export function withPageAudio(signal: AbortSignal, open: (c: AudioContext) => void) {
  let c: AudioContext | null = null;
  const start = () => {
    if (!c) { c = new AudioContext(); open(c); }
    if (c.state === "suspended") void c.resume();
  };
  addEventListener("pointerdown", start, { signal });
  addEventListener("keydown", start, { signal });
  signal.addEventListener("abort", () => { void c?.close(); });
}
