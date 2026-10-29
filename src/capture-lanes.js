/* Presentation only: never resolves a road or changes a capture snapshot. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SPOTITCaptureLanes = api;
})(globalThis, function() {
  'use strict';
  const boundaries = [33, 65.8], bufferKm = .02;
  function segment(km) {
    return !Number.isFinite(km) || km < 9.56 || km > 88.7 ? 0 : km < 33 ? 1 : km < 65.8 ? 2 : 3;
  }
  function create() {
    let layout = 'default';
    function update({mode = '', ready = false, expressway, km, interchange = false, busy = false} = {}) {
      if (busy) return layout;
      if (mode === 'interchange') return layout = 'interchange';
      if (mode === 'mainline' && layout === 'interchange') layout = 'default';
      if (!ready) return layout;
      if (mode !== 'mainline' && interchange) return layout = 'interchange';
      const next = String(expressway).trim().toUpperCase() === 'NLEX' ? segment(km) : 0;
      if (!next) return layout = 'default';
      const previous = Number(layout);
      if (previous >= 1 && previous <= 3 && previous !== next) {
        const boundary = boundaries[Math.min(previous, next) - 1];
        if (Math.abs(km - boundary) < bufferKm) return layout;
      }
      return layout = String(next);
    }
    return {update};
  }
  function choices(layout) {
    return layout === 'interchange' ? ['Entry Ramp', 'Exit Ramp', 'Acce', 'Dece']
      : layout === '2' ? ['1', '2', '3'] : layout === '3' ? ['1', '2'] : ['1', '2', '3', '4'];
  }
  return {create, segment, choices};
});
