const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync(require.resolve('./index.html'),'utf8');
const sharing=fs.readFileSync(require.resolve('./sharing-ui.js'),'utf8');
const controls=fs.readFileSync(require.resolve('./log-controls.js'),'utf8');
const importer=fs.readFileSync(require.resolve('./inspection-sharing.js'),'utf8');
const swipe=fs.readFileSync(require.resolve('./swipe-actions.js'),'utf8');

test('Excel exports center every cell style and format KM metres as stationing',()=>{
  assert.match(html,/<numFmt numFmtId="164" formatCode="0\+000"\/>/);
  const styles=html.match(/<cellXfs count="4">([\s\S]*?)<\/cellXfs>/)?.[1]||'';
  assert.equal((styles.match(/<alignment horizontal="center" vertical="center"\/>/g)||[]).length,4);
  assert.match(styles,/<xf numFmtId="164"[^>]*applyNumberFormat="1"[^>]*applyAlignment="1">/);
  assert.match(html,/colIndex===9&&\(value===''\|\|value===null\|\|value===undefined\).*s="3"\/>/);
  assert.match(html,/colIndex===9\?3:0/);
});

test('Sharing Details stays centered and photo workbooks use rich values rather than floating drawings',()=>{
  assert.match(sharing,/xl\/worksheets\/sheet2\.xml/);
  for(const part of ['xl/metadata.xml','xl/richData/richValueRel.xml','xl/richData/rdrichvalue.xml','xl/richData/rdrichvaluestructure.xml','xl/richData/rdRichValueTypes.xml']) assert.match(html,new RegExp(part.replace(/[./]/g,'\\$&')));
  assert.match(html,/t="e" vm="\$\{richIndex\+1\}"/);
  assert.doesNotMatch(html,/xl\/drawings\//);
  assert.doesNotMatch(sharing,/xl\/drawings\//);
});

test('photo export and import advertise and preserve one native-photo workbook',()=>{
  assert.match(controls,/Excel with photos/);
  assert.match(controls,/Native in-cell photos for offline viewing/);
  assert.match(html,/SpotIt_with_photos_\$\{stamp\}\.xlsx/);
  assert.match(importer,/async function readWorkbookPhotos\(files\)/);
  assert.match(importer,/photoFile=embeddedPhotos\.get\(i\+2\)\|\|null/);
  assert.match(importer,/Choose a SPOT IT \.xlsx or Photos \.zip file/);
});

test('resolved interchange names persist through Excel export and import',()=>{
  assert.match(swipe,/Interchange \/ Exit/);
  assert.match(swipe,/Interchange Segment/);
  assert.match(importer,/interchange:row\[12\]\|\|''/);
  assert.match(importer,/interchangeSegment:row\[13\]\|\|''/);
  assert.match(importer,/expressway','interchange','interchangeSegment','bound/);
});
