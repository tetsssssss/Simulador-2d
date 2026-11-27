// Replay support for the NHL / MLB 3D renderers. During an instant replay the game hands the renderer a NEW state object every frame whose `t` runs
// over a past interval but whose `events` list is the live one. These pure helpers pick the events that belong to the replayed moment.
// First event at or after time t (events are appended in time order).
export function replayStart(events = [], t = 0) { let i = 0; while (i < events.length && (events[i].t ?? 0) < t - 0.01) i++; return i; }
// Is this event already "due" at replay time t?
export const replayDue = (e, t) => (e.t ?? 0) <= t + 1e-6;
