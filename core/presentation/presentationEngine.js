// PresentationEngine — separates SPORT EVENTS from audiovisual presentation.
// Engines/game views publish events (sport vocabulary, untouched); presentation listeners (commentary, audio, crowd,
// HUD flashes) subscribe. No sport rule lives here. One engine per mounted match; dispose() releases everything.
export function createPresentation({ sport, listeners = [] } = {}) {
  const subs = new Set(listeners.filter(Boolean));
  let disposed = false;
  const api = {
    sport,
    on(listener) { subs.add(listener); return () => subs.delete(listener); },
    // event: { type, t?, ...payload }  ctx: sport context snapshot (score, clock, situation, names resolver…)
    emit(event, ctx = {}) {
      if (disposed || !event) return;
      for (const l of subs) { try { l.onEvent?.(event, ctx, api); } catch (e) { console.error('[presentation]', e); } }
    },
    emitAll(events, ctx) { for (const e of events) api.emit(e, ctx); },
    tick(dt, ctx) { if (!disposed) for (const l of subs) l.tick?.(dt, ctx, api); },
    dispose() { if (disposed) return; disposed = true; for (const l of subs) l.dispose?.(); subs.clear(); },
    get disposed() { return disposed; },
  };
  return api;
}
