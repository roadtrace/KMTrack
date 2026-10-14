/* Existing legacy GPS/KM matcher, extracted without new matching rules.
 * Calibration is read at each original access through the supplied callback.
 * The instance owns only disposable indexes; no IO, clock or application state.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.SPOTITLegacyMatcher=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const GRID_SIZE = 0.0025;
    function gridKey(lat, lon) { return `${Math.floor(lat / GRID_SIZE)},${Math.floor(lon / GRID_SIZE)}`; }
    function corridorKey(e, b) { return `${e}|||${b}`; }
    function haversineKm(lat1, lon1, lat2, lon2) {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
  function createMatcher(getCalibration, getConfirmedCorridor) {
    let spatialGrid = new Map();
    let corridorIndex = new Map();
    function buildSpatialIndex() {
      spatialGrid = new Map();
      corridorIndex = new Map();
      for (let i = 0; i < getCalibration().length; i++) {
        const p = getCalibration()[i];
        const g = gridKey(p.lat, p.lon);
        let bucket = spatialGrid.get(g); if (!bucket) { bucket = []; spatialGrid.set(g, bucket); } bucket.push(i);
        const c = corridorKey(p.e, p.b);
        let cb = corridorIndex.get(c); if (!cb) { cb = []; corridorIndex.set(c, cb); } cb.push(i);
      }
    }
    function nearbyIndices(lat, lon, rings) {
      const out = []; const gx = Math.floor(lat / GRID_SIZE), gy = Math.floor(lon / GRID_SIZE);
      for (let dx = -rings; dx <= rings; dx++) for (let dy = -rings; dy <= rings; dy++) {
        const b = spatialGrid.get(`${gx + dx},${gy + dy}`); if (b) out.push(...b);
      }
      return out;
    }
    function nearestFrom(indices, lat, lon, skipIdx = -1) {
      let bestIdx = -1, bestDist = Infinity;
      for (const i of indices) {
        if (i === skipIdx) continue;
        const p = getCalibration()[i], d = haversineKm(lat, lon, p.lat, p.lon);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      return bestIdx < 0 ? null : { idx: bestIdx, dist: bestDist };
    }
    function computeKmStation(lat, lon, expressway = '') {
      if (getCalibration().length < 1) return null;
      let candidates = nearbyIndices(lat, lon, 4);
      if (expressway) candidates = candidates.filter(i => getCalibration()[i].e === expressway);
      if (!candidates.length) {
        candidates = getCalibration().map((point, index) => (!expressway || point.e === expressway) ? index : -1).filter(index => index >= 0);
      }

      let first = nearestFrom(candidates, lat, lon);
      if (!first) return null;
      const best = getCalibration()[first.idx];

      // If the local grid did not contain enough points from the identified corridor,
      // fall back to the corridor index (still much smaller than the whole dataset).
      let same = corridorIndex.get(corridorKey(best.e, best.b)) || [];
      if (same.length < 2) same = candidates.filter(i => getCalibration()[i].e === best.e && getCalibration()[i].b === best.b);
      if (same.length < 2) same = getCalibration().map((p, i) => p.e === best.e && p.b === best.b ? i : -1).filter(i => i >= 0);

      const second = nearestFrom(same, lat, lon, first.idx);
      let km = best.k;
      if (second) {
        const total = first.dist + second.dist;
        km = total === 0 ? best.k : best.k + (getCalibration()[second.idx].k - best.k) * (first.dist / total);
      }
      return { km, expressway: best.e, bound: best.b, distance: first.dist };
    }
    function computeCorridorCandidates(lat, lon) {
      const local = nearbyIndices(lat, lon, 4);
      const corridors = new Set(local.map(index => getCalibration()[index].e));
      const confirmed = getConfirmedCorridor();
      if (confirmed) corridors.add(confirmed);
      if (!corridors.size) for (const point of getCalibration()) corridors.add(point.e);
      return [...corridors].map(expressway => computeKmStation(lat, lon, expressway)).filter(Boolean);
    }
    return { buildSpatialIndex, nearbyIndices, nearestFrom, computeKmStation, computeCorridorCandidates };
  }
  return { GRID_SIZE, gridKey, corridorKey, haversineKm, createMatcher };
});
