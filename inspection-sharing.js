(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SPOTITSharing=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MAX_BYTES=250*1024*1024, MAX_ENTRIES=10000;
  /* Reuse the canonical entry model — the browser global, or require() under
   * Node — so the lane rule and the sync fields cannot drift from the app. */
  const entryModel=(function(){
    try{ if(typeof module==='object'&&module.exports) return require('./entry-model.js'); }catch(e){ /* browser */ }
    if(typeof SPOTITEntry!=='undefined') return SPOTITEntry;
    return null;
  })();
  const SYNC_STATUS=(entryModel&&entryModel.SYNC_STATUS)||{PENDING:'pending'};
  const textFields=['type','timestamp','expressway','interchange','interchangeSegment','bound','lane','photoFilename','photoTimestamp','inspector','notes'];
  function normalize(row){
    if(!row || typeof row!=='object' || Array.isArray(row)) throw Error('Invalid inspection record.');
    if(!Number.isFinite(row.lat)||Math.abs(row.lat)>90||!Number.isFinite(row.lon)||Math.abs(row.lon)>180) throw Error('Invalid coordinates.');
    if(typeof row.type!=='string'||!row.type.trim()||typeof row.timestamp!=='string'||!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(row.timestamp)) throw Error('Missing defect type or invalid inspection date.');
    const day=row.timestamp.slice(0,10);
    if(!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day) throw Error('Invalid inspection date.');
    const time=row.timestamp.slice(11).split(':').map(Number);
    if(time[0]>23||time[1]>59||time[2]>59) throw Error('Invalid inspection time.');
    if(row.km!==null && row.km!==undefined && !Number.isFinite(row.km)) throw Error('Invalid KM station.');
    const result={};
    for(const field of textFields){
      if(row[field]!==undefined && typeof row[field]!=='string') throw Error(`Invalid ${field}.`);
      result[field]=String(row[field]||'');
      if(result[field].length>4000) throw Error('Inspection text is too long.');
    }
    /* `lane` is left exactly as imported so the legacy contract and the
     * fingerprint are untouched; the structured pair is derived alongside it. */
    const lane=entryModel?entryModel.laneFields(result.lane):{lane_number:null,lane_other:''};
    return {...result,lat:row.lat,lon:row.lon,km:row.km??null,
      id:typeof row.id==='string'?row.id:'',originId:typeof row.originId==='string'?row.originId:'',
      photoId:typeof row.photoId==='string'?row.photoId:'',
      archivePhotoPath:typeof row.archivePhotoPath==='string'?row.archivePhotoPath:'',
      photoAvailable:row.photoAvailable===true,
      lane_number:lane.lane_number,lane_other:lane.lane_other,
      photo_path:typeof row.photo_path==='string'?row.photo_path:'',
      user_id:typeof row.user_id==='string'?row.user_id:'',
      team:typeof row.team==='string'?row.team:'',
      created_at:typeof row.created_at==='string'?row.created_at:'',
      updated_at:typeof row.updated_at==='string'?row.updated_at:'',
      /* Imported history starts as pending work; the future queue upserts by
       * UUID, so re-sending it can never duplicate a cloud row. */
      sync_status:SYNC_STATUS.PENDING};
  }
  // Legacy workbooks round KM to three decimals and have no stable IDs.
  function fingerprint(row){
    return JSON.stringify([row.type,row.timestamp,row.lat,row.lon,row.km==null?null:Math.round(Number(row.km)*1000),row.expressway||'',row.interchange||'',row.interchangeSegment||'',row.bound||'',row.lane||'',row.photoFilename||'']);
  }
  function planImport(existing,rows){
    const byId=new Map(),prints=new Set();
    for(const row of existing){
      if(row.id) byId.set(row.id,row);
      if(row.originId) byId.set(row.originId,row);
      prints.add(fingerprint(row));
    }
    const added=[],conflicts=[];let duplicates=0;
    for(const row of rows){
      const key=row.originId||row.id;
      const prior=key && byId.get(key);
      if(prior && (fingerprint(prior)!==fingerprint(row)||(prior.km??null)!==(row.km??null)||(prior.notes||'')!==(row.notes||'')||(prior.photoTimestamp||'')!==(row.photoTimestamp||''))){conflicts.push(row);continue;}
      if(prints.has(fingerprint(row))){duplicates++;continue;}
      added.push(row);prints.add(fingerprint(row));if(key) byId.set(key,row);
    }
    return {added,duplicates,conflicts};
  }
  function forExport(rows,name){
    return rows.map(row=>({...row,inspector:row.inspector||(!row.importBatchId?String(name||'').trim():'')}));
  }
  const crcTable=Uint32Array.from({length:256},(_,index)=>{
    let value=index;for(let n=0;n<8;n++)value=(value>>>1)^((value&1)?0xedb88320:0);return value>>>0;
  });
  function crc32(bytes){
    let crc=0xffffffff;
    for(const byte of bytes)crc=(crc>>>8)^crcTable[(crc^byte)&255];
    return (crc^0xffffffff)>>>0;
  }
  async function readZip(file){
    if(file.size>MAX_BYTES) throw Error('File exceeds the 250 MB import limit. Split it into smaller exports.');
    const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer);
    const u16=n=>view.getUint16(n,true),u32=n=>view.getUint32(n,true);
    let end=-1;
    for(let n=bytes.length-22;n>=Math.max(0,bytes.length-65557);n--){if(u32(n)===0x06054b50 && n+22+u16(n+20)===bytes.length){end=n;break;}}
    if(end<0||u16(end+4)||u16(end+6)||u16(end+8)!==u16(end+10)) throw Error('Invalid or multi-part ZIP file.');
    const count=u16(end+10);let offset=u32(end+16),total=0;
    if(count>MAX_ENTRIES*2+30||offset+u32(end+12)>end) throw Error('Unsupported or oversized archive.');
    const files=new Map();
    for(let i=0;i<count;i++){
      if(offset+46>end||u32(offset)!==0x02014b50) throw Error('Invalid ZIP directory.');
      const flags=u16(offset+8),method=u16(offset+10),crc=u32(offset+16),size=u32(offset+20),expanded=u32(offset+24),nameSize=u16(offset+28),extra=u16(offset+30),comment=u16(offset+32),start=u32(offset+42);
      const name=new TextDecoder().decode(bytes.slice(offset+46,offset+46+nameSize));
      total+=expanded;
      if(total>MAX_BYTES||flags&1||![0,8].includes(method)||name.startsWith('/')||name.includes('\\')||name.split('/').includes('..')||files.has(name)) throw Error('Unsafe, encrypted, or unsupported archive.');
      if(start+30>bytes.length||u32(start)!==0x04034b50) throw Error('Invalid ZIP entry.');
      const dataStart=start+30+u16(start+26)+u16(start+28);
      if(dataStart+size>offset) throw Error('Truncated ZIP entry.');
      files.set(name,{async blob(){
        let data=bytes.slice(dataStart,dataStart+size);
        if(method===8){
          let stream;
          try{stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}
          catch{throw Error('This browser cannot read compressed Excel files. Use an original SPOT IT export or a newer browser.');}
          const reader=stream.getReader(),parts=[];let length=0;
          while(true){const {done,value}=await reader.read();if(done) break;length+=value.length;if(length>expanded){await reader.cancel();throw Error('Invalid expanded ZIP size.');}parts.push(value);}
          data=new Uint8Array(await new Blob(parts).arrayBuffer());
        }
        if(data.length!==expanded||crc32(data)!==crc) throw Error('File is damaged (ZIP checksum mismatch).');
        return new Blob([data]);
      }});
      offset+=46+nameSize+extra+comment;
    }
    return files;
  }
  function parseXml(text){
    const doc=new DOMParser().parseFromString(text,'application/xml');
    if(doc.querySelector('parsererror')) throw Error('Invalid Excel XML.');
    return doc;
  }
  async function readWorkbookPhotos(files){
    const required=['xl/metadata.xml','xl/richData/richValueRel.xml','xl/richData/rdrichvalue.xml','xl/richData/_rels/richValueRel.xml.rels','xl/worksheets/sheet1.xml'];
    if(required.some(path=>!files.has(path))) return new Map();
    const [metadata,richRels,richValues,relationships,sheet]=await Promise.all(required.map(async path=>parseXml(await (await files.get(path).blob()).text())));
    const children=(node,name)=>[...(node?.children||[])].filter(child=>child.localName===name);
    const descendants=(node,name)=>[...(node?.getElementsByTagName('*')||[])].filter(child=>child.localName===name);
    const valueBooks=children(descendants(metadata,'valueMetadata')[0],'bk');
    const futureBooks=children(descendants(metadata,'futureMetadata')[0],'bk');
    const richRecords=descendants(richValues,'rv');
    const relationSlots=descendants(richRels,'rel');
    const targets=new Map(descendants(relationships,'Relationship').map(rel=>[rel.getAttribute('Id'),rel.getAttribute('Target')]));
    const photos=new Map();
    for(const cell of descendants(sheet,'c')){
      const vm=Number(cell.getAttribute('vm'));
      if(!Number.isInteger(vm)||vm<1) continue;
      const futureIndex=Number(descendants(valueBooks[vm-1],'rc')[0]?.getAttribute('v'));
      const richIndex=Number(descendants(futureBooks[futureIndex],'rvb')[0]?.getAttribute('i'));
      const imageSlot=Number(descendants(richRecords[richIndex],'v')[0]?.textContent);
      const slot=relationSlots[imageSlot];
      const relationId=slot?.getAttribute('r:id')||slot?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
      const target=targets.get(relationId)||'';
      const parts=['xl','richData'];
      for(const part of target.split('/')){
        if(!part||part==='.') continue;
        if(part==='..') parts.pop(); else parts.push(part);
      }
      const mediaPath=parts.join('/');
      const row=Number((cell.getAttribute('r')||'').replace(/\D/g,''));
      if(row>=2&&mediaPath.startsWith('xl/media/')&&files.has(mediaPath)) photos.set(row,files.get(mediaPath));
    }
    return photos;
  }
  async function readWorkbook(files){
    if(!files.has('xl/worksheets/sheet1.xml')) throw Error('Not a SPOT IT workbook.');
    const strings=files.has('xl/sharedStrings.xml')?[...parseXml(await (await files.get('xl/sharedStrings.xml').blob()).text()).getElementsByTagName('si')].map(n=>n.textContent):[];
    async function rows(path){
      const doc=parseXml(await (await files.get(path).blob()).text());
      return [...doc.getElementsByTagName('row')].map(row=>{
        const values=[];
        for(const cell of row.getElementsByTagName('c')){
          const ref=cell.getAttribute('r')||'';let col=0;
          for(const c of ref.replace(/\d/g,'')) col=col*26+c.charCodeAt(0)-64;
          const type=cell.getAttribute('t'),v=cell.getElementsByTagName('v')[0]?.textContent||'';
          values[col-1]=type==='inlineStr'?(cell.getElementsByTagName('is')[0]?.textContent||''):type==='s'?(strings[Number(v)]||''):v;
        }
        return values;
      });
    }
    const embeddedPhotos=await readWorkbookPhotos(files);
    const all=await rows('xl/worksheets/sheet1.xml'),headers=all.shift();
    const expected=['Type of Defect','Timestamp','Latitude','Longitude','Latitude (DMM)','Longitude (DMM)','Expressway','Direction','Lane','Km Station','Photo','Photo Filename'];
    if(!headers||expected.some((v,i)=>headers[i]!==v)) throw Error('Please choose a SPOT IT inspection workbook with its original columns.');
    if(headers[12]&&headers[12]!=='Interchange / Exit') throw Error('Please choose a SPOT IT inspection workbook with its original columns.');
    if(headers[13]&&headers[13]!=='Interchange Segment') throw Error('Please choose a SPOT IT inspection workbook with its original columns.');
    const records=all.filter(row=>row.some(Boolean)).map(row=>{
      if(row[2]===''||row[3]===''||row[2]==null||row[3]==null) throw Error('Workbook has missing coordinates.');
      return normalize({type:row[0],timestamp:row[1],lat:Number(row[2]),lon:Number(row[3]),expressway:row[6]||'',bound:row[7]||'',lane:row[8]||'',km:row[9]?Number(row[9])/1000:null,photoFilename:row[11]||'',interchange:row[12]||'',interchangeSegment:row[13]||''});
    });
    if(files.has('xl/worksheets/sheet2.xml')){
      const metadata=await rows('xl/worksheets/sheet2.xml');
      if(metadata[0]?.[0]==='KMTrack sharing v1'){
        if(metadata.length-1!==records.length) throw Error('Sharing details do not match this workbook. Use the original export.');
        return metadata.slice(1).map((row,i)=>{
          const full=normalize(JSON.parse(row[4]));
          if((embeddedPhotos.has(i+2)||!records[i].photoFilename||records[i].photoFilename==='#VALUE!')&&full.photoFilename) records[i].photoFilename=full.photoFilename;
          if(fingerprint(full)!==fingerprint(records[i])) throw Error('Inspection rows were edited after export. Please use an original SPOT IT export.');
          full.photoFile=embeddedPhotos.get(i+2)||null;
          full.photoAvailable=!!full.photoFile;
          return full;
        });
      }
    }
    return records.map((record,index)=>({...record,photoFile:embeddedPhotos.get(index+2)||null,photoAvailable:embeddedPhotos.has(index+2)}));
  }
  async function readImport(file){
    const files=await readZip(file),manifests=[...files.keys()].filter(name=>/(^|\/)manifest\.json$/.test(name));
    let rows,hasPhotos=false;
    if(/\.zip$/i.test(file.name)){
      if(manifests.length!==1) throw Error('Choose a SPOT IT Photos ZIP containing one manifest.');
      const manifest=JSON.parse(await (await files.get(manifests[0]).blob()).text());
      if(manifest.format!=='KMTrack inspection backup'||![1,2].includes(manifest.version)||!Array.isArray(manifest.entries)) throw Error('Unsupported inspection backup.');
      rows=manifest.entries;hasPhotos=true;
    }else if(/\.xlsx$/i.test(file.name)){rows=await readWorkbook(files);hasPhotos=rows.some(row=>row.photoFile);}
    else throw Error('Choose a SPOT IT .xlsx or Photos .zip file.');
    if(!rows.length||rows.length>MAX_ENTRIES) throw Error('Import must contain 1–10,000 entries.');
    const valid=[],issues=[];let missingPhotos=0;
    for(let i=0;i<rows.length;i++){
      try{
        const embeddedPhoto=rows[i].photoFile||null;
        const row=normalize(rows[i]);
        row.photoFile=embeddedPhoto||(hasPhotos&&row.photoAvailable&&row.archivePhotoPath?files.get(row.archivePhotoPath):null);
        if((row.photoFilename||row.photoId)&&!row.photoFile) missingPhotos++;
        valid.push(row);
      }catch(error){issues.push(`Entry ${i+1}: ${error.message}`);}
    }
    return {rows:valid,issues,missingPhotos};
  }
  return {normalize,fingerprint,planImport,forExport,readZip,readWorkbookPhotos,readWorkbook,readImport,crc32};
});
