import { generateTimetable } from "../lib/scheduler.js";

// Runs the solver off the main thread so the page stays responsive during long solves.
self.onmessage = (event) => {
  const { records, options } = event.data ?? {};
  const startedAt = performance.now();
  try {
    const result = generateTimetable({ records, options });
    self.postMessage({ ok: true, result, elapsedMs: Math.round(performance.now() - startedAt) });
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message || String(error), elapsedMs: Math.round(performance.now() - startedAt) });
  }
};
