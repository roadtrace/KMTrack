// Reconstruct only the authorized extraction in memory for original-byte guards.
// Never writes/reverts application files. Source oracle preserves pre-existing edits.
const oracle=require('./legacy-matcher-before.json');
function restore(html){
 // Reverse style-block isolation in memory; keep the frozen source oracle unchanged.
 html=html.replace(/  <style id="b01-preview-styles">\n([\s\S]*?)  <\/style>\n  <style>\n/,(_,preview)=>'  <style>\n'+preview);
 const functions=oracle.functions;
 html=html.replace('  <script src="./legacy-matcher.js"></script>\n','');
 const start=html.indexOf('    // Initialize before cache-hit dataset loading;');
 const end=html.indexOf('\n\n    async function loadCalibrationDataset',start);
 if(start<0||end<start)throw Error('Extraction wiring changed');
 const header='    // Spatial index — built here, ABOVE loadCalibrationDataset, since a\n'
  +'    // cache-hit load calls buildSpatialIndex() synchronously on page load.\n'
  +'    // Declaring these below the loader (as before) caused a temporal-dead-zone\n'
  +'    // ReferenceError on the very first load: buildSpatialIndex() referenced\n'
  +'    // spatialGrid/corridorIndex before their `let` declarations had run.\n'
  +'    const GRID_SIZE = 0.0025; // ~250 m latitude cells\n'
  +'    let spatialGrid = new Map();\n    let corridorIndex = new Map();\n\n';
 html=html.slice(0,start)+header+['gridKey','corridorKey','buildSpatialIndex','nearbyIndices','nearestFrom'].map(n=>functions[n]).join('\n')+html.slice(end);
 for(const name of ['haversineKm','computeKmStation','computeCorridorCandidates']){
  const start=html.indexOf('    function '+name+'('),end=html.indexOf('\n    }',start)+6;
  if(start<0||end<start)throw Error('Delegate missing');
  html=html.slice(0,start)+functions[name]+html.slice(end);
 }
 return html;
}
module.exports={restore};
