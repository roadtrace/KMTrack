/* Import/export UI uses the existing entry array, saveEntries and photo store. */
let sharingBusy=false;
function syncSharingFilters(){
  const batches=new Map(),inspectors=new Set();
  for(const entry of entries){
    if(entry.importBatchId) batches.set(entry.importBatchId,entry.importLabel||'Imported batch');
    if(entry.inspector) inspectors.add(entry.inspector);
  }
  for(const prefix of ['entry-filter','map-entry']){
    for(const field of ['source','inspector']){
      const select=document.getElementById(`${prefix}-${field}`);
      if(!select) continue;
      const previous=select.value;
      const options=field==='source'?[['','All inspections'],['mine','My inspections'],['imported','Imported inspections'],...batches]:[['','All inspectors'],...[...inspectors].sort().map(name=>[name,name])];
      if(previous&&!options.some(([value])=>value===previous)) options.push([previous,previous]);
      select.replaceChildren(...options.map(([value,label])=>new Option(label,value)));
      select.value=previous;
    }
  }
  const undo=document.getElementById('undo-import-btn');
  if(undo) undo.hidden=!batches.size;
}
async function prepareSharingExport(){
  if(sharingBusy) return null;
  const snapshot=entriesForExport();
  if(!snapshot) return null;
  sharingBusy=true;
  try{
    const dialog=document.getElementById('export-name-dialog');
    const input=document.getElementById('export-inspector-name');
    try{input.value=localStorage.getItem('kmtrack_inspector_name_v1')||'';}catch{input.value='';}
    dialog.returnValue='';dialog.showModal();
    await new Promise(resolve=>dialog.addEventListener('close',resolve,{once:true}));
    if(dialog.returnValue!=='export') return null;
    const name=input.value.trim();
    try{localStorage.setItem('kmtrack_inspector_name_v1',name);}catch{/* Export still works when remembering preferences is blocked. */}
    const result=KMTrackSharing.forExport(snapshot,name);
    // Attribute only this device's unnamed entries, never colleagues' records.
    const named=new Map(result.filter(e=>!e.importBatchId&&e.inspector).map(e=>[e.id,e.inspector]));
    const before=entries;
    entries=entries.map(e=>!e.importBatchId&&!e.inspector&&named.has(e.id)?{...e,inspector:named.get(e.id)}:e);
    if(!saveEntries()){
      entries=before;
      alert('Inspector names could not be saved on this device. They will still be included in this export.');
    }
    renderLog();
    return result;
  }finally{sharingBusy=false;}
}
async function addSharingWorksheet(files,rows,createdAt){
  async function replace(name,from,to){
    const file=files.find(f=>f.name===name);
    file.blob=new Blob([(await file.blob.text()).replace(from,to)]);
  }
  await replace('[Content_Types].xml','</Types>','<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  await replace('xl/workbook.xml','</sheets>','<sheet name="Sharing Details" sheetId="2" r:id="rId3"/></sheets>');
  await replace('xl/_rels/workbook.xml.rels','</Relationships>','<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>');
  const values=[['KMTrack sharing v1','Inspector','Source','Batch','Record JSON (do not edit)'],...rows.map(e=>[e.originId||e.id||'',e.inspector||'',e.importBatchId?'Imported':'Own',e.importLabel||'',JSON.stringify(e)])];
  const xml=values.map((row,i)=>`<row r="${i+1}">${row.map((v,j)=>`<c r="${excelColumnName(j)}${i+1}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(v)}</t></is></c>`).join('')}</row>`).join('');
  files.push({name:'xl/worksheets/sheet2.xml',date:createdAt,blob:new Blob([`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="38" customWidth="1"/><col min="2" max="4" width="26" customWidth="1"/><col min="5" max="5" hidden="1"/></cols><sheetData>${xml}</sheetData></worksheet>`])});
}

// A failed photo write never leaves a partially imported set of entries.
async function commitSharedImport(rows,{label,inspectors}){
  if(!storageAvailable) throw Error('Device storage is unavailable. Import cancelled.');
  const plan=KMTrackSharing.planImport(entries,rows);
  if(!plan.added.length) throw Error('There are no new, non-conflicting entries to import.');
  const batchId=newId(),added=[],photoIds=[];
  try{
    for(const row of plan.added){
      let photoId='';
      if(row.photoFile){
        const blob=await row.photoFile.blob();
        const signature=new Uint8Array(await blob.slice(0,12).arrayBuffer());
        const jpeg=signature[0]===255&&signature[1]===216&&signature[2]===255;
        const png=signature[0]===137&&signature[1]===80&&signature[2]===78&&signature[3]===71;
        if(!jpeg&&!png) throw Error('An attached photo is not a supported JPEG or PNG image.');
        photoId=newId();photoIds.push(photoId);
        await putPhoto(photoId,blob.slice(0,blob.size,jpeg?'image/jpeg':'image/png'));
      }
      const {photoFile,archivePhotoPath,photoAvailable,...data}=row;
      const inspector=inspectors.get(row.inspector||'')??row.inspector??'';
      added.push({...data,id:row.id&&!entries.some(e=>e.id===row.id)&&!added.some(e=>e.id===row.id)?row.id:newId(),originId:row.originId||row.id||'',photoId,inspector,importBatchId:batchId,importLabel:label,importedAt:new Date().toISOString()});
    }
    const before=entries;
    entries=entries.concat(added);
    if(!saveEntries()){entries=before;throw Error('Could not persist this import. No entries were added.');}
    selectedEntryIds.clear();renderLog();updateMapEntries();
    return {count:added.length,batchId};
  }catch(error){
    for(const id of photoIds){await deletePhoto(id);}
    throw error;
  }
}
async function undoSharedImport(){
  const imported=entries.filter(e=>e.importBatchId).sort((a,b)=>String(b.importedAt).localeCompare(String(a.importedAt)));
  if(!imported.length) return;
  const batch=imported[0].importBatchId,removed=entries.filter(e=>e.importBatchId===batch);
  if(!confirm(`Undo import “${imported[0].importLabel}”? This removes its ${removed.length} remaining entries, including any edits made to them. Your other inspections are kept.`)) return;
  const before=entries;
  entries=entries.filter(e=>e.importBatchId!==batch);
  if(!saveEntries()){entries=before;throw Error('Could not save Undo. Entries have been kept.');}
  if(typeof deletionController!=='undefined' && deletionController.getPending()?.entry.importBatchId===batch) deletionController.finalizePending();
  selectedEntryIds.clear();renderLog();updateMapEntries();
  for(const e of removed){if(e.photoId&&!entries.some(other=>other.photoId===e.photoId)){await deletePhoto(e.photoId);await deletePhoto(e.photoId+':raw');}}
  document.getElementById('import-status').textContent=`Import undone: ${removed.length} entries removed.`;
}
document.addEventListener('DOMContentLoaded',()=>{
  const host=document.createElement('div');
  host.innerHTML=`
    <dialog class="sharing-dialog" id="export-name-dialog" aria-labelledby="export-name-title">
      <form method="dialog"><h2 id="export-name-title">Export inspections</h2>
      <label>Inspector name (optional)<input id="export-inspector-name" maxlength="100" autocomplete="name"></label>
      <p>Remembered on this device. Applies only to your unnamed inspections; existing inspector names are preserved.</p>
      <div class="sharing-dialog-actions"><button value="cancel">Cancel</button><button value="export">Export</button></div></form>
    </dialog>
    <dialog class="sharing-dialog" id="import-dialog" aria-labelledby="import-title">
      <h2 id="import-title">Review import</h2><p id="import-summary"></p>
      <label>Batch label<input id="import-label" maxlength="160"></label>
      <div id="import-inspectors"></div><p id="import-warnings"></p>
      <p>Existing entries are never replaced. Identical entries and conflicting IDs are skipped. Undo last import remains available after reopening the app.</p>
      <div class="sharing-dialog-actions"><button id="import-cancel" type="button">Cancel</button><button id="import-confirm" type="button">Import entries</button></div>
    </dialog>`;
  document.body.append(host);
  for(const field of ['source','inspector']){
    document.getElementById(`entry-filter-${field}`).addEventListener('change',applyEntryFilters);
    document.getElementById(`map-entry-${field}`).addEventListener('change',updateMapEntries);
  }
  const fileInput=document.getElementById('import-file'),dialog=document.getElementById('import-dialog'),confirmButton=document.getElementById('import-confirm'),cancelButton=document.getElementById('import-cancel');
  let preview=null;
  function cancel(){if(sharingBusy)return;dialog.close();preview=null;}
  cancelButton.addEventListener('click',cancel);
  dialog.addEventListener('cancel',e=>{if(sharingBusy)e.preventDefault();else preview=null;});
  document.getElementById('import-btn').addEventListener('click',()=>{if(!sharingBusy)fileInput.click();});
  fileInput.addEventListener('change',async()=>{
    const file=fileInput.files[0];fileInput.value='';if(!file||sharingBusy)return;
    sharingBusy=true;document.getElementById('import-status').textContent='Reading inspection file…';
    try{
      const data=await KMTrackSharing.readImport(file),plan=KMTrackSharing.planImport(entries,data.rows);
      preview=data;
      document.getElementById('import-label').value=file.name;
      const days=data.rows.map(e=>e.timestamp.slice(0,10)).sort();
      document.getElementById('import-summary').textContent=`${file.name}: ${plan.added.length} new entries; ${plan.duplicates} duplicates; ${plan.conflicts.length} conflicts; ${data.issues.length} invalid. ${plan.added.filter(e=>e.photoFile).length} available photos. Dates: ${days[0]||'—'} to ${days.at(-1)||'—'}.`;
      document.getElementById('import-warnings').textContent=[data.missingPhotos?`${data.missingPhotos} referenced photos are unavailable in this file. Excel imports do not contain photo images.`:'',...data.issues.slice(0,5),...plan.conflicts.slice(0,5).map(e=>`Conflict skipped: ${e.type} · ${e.timestamp}`)].filter(Boolean).join('\n');
      const names=document.getElementById('import-inspectors');names.replaceChildren();
      for(const name of new Set(data.rows.map(e=>e.inspector||''))){
        const label=document.createElement('label');label.textContent=name?`Inspector: ${name}`:'Inspector for unnamed entries (optional)';
        const input=document.createElement('input');input.value=name;input.dataset.original=name;input.maxLength=100;label.append(input);names.append(label);
      }
      confirmButton.disabled=!plan.added.length;dialog.showModal();
      document.getElementById('import-status').textContent='';
    }catch(error){document.getElementById('import-status').textContent=`Import not started: ${error.message}`;}
    finally{sharingBusy=false;}
  });
  confirmButton.addEventListener('click',async()=>{
    if(!preview||sharingBusy)return;
    sharingBusy=true;confirmButton.disabled=true;cancelButton.disabled=true;
    try{
      const inspectors=new Map([...document.querySelectorAll('#import-inspectors input')].map(input=>[input.dataset.original,input.value.trim()]));
      const result=await commitSharedImport(preview.rows,{label:document.getElementById('import-label').value.trim()||'Imported batch',inspectors});
      dialog.close();preview=null;
      document.getElementById('import-status').textContent=`Imported ${result.count} entries. Use Source filters to view this batch.`;
    }catch(error){document.getElementById('import-warnings').textContent=error.message;}
    finally{sharingBusy=false;confirmButton.disabled=false;cancelButton.disabled=false;}
  });
  document.getElementById('undo-import-btn').addEventListener('click',async()=>{
    if(sharingBusy)return;sharingBusy=true;
    try{await undoSharedImport();}catch(error){alert(error.message);}finally{sharingBusy=false;}
  });
  syncSharingFilters();
});
