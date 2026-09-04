async (page) => {
  if(new URL(page.url()).origin!=='http://127.0.0.1:4175')throw Error('Use the dedicated localhost:4175 test origin.');
  // This session uses a dedicated localhost origin, never the user's app data.
  await page.evaluate(async()=>{
    for(const registration of await navigator.serviceWorker.getRegistrations())await registration.unregister();
    for(const key of await caches.keys())if(key.startsWith('kmtrack-shell-'))await caches.delete(key);
  });
  await page.reload();
  const result=await page.evaluate(async()=>{
    const row={id:'browser-juan',type:'Potholes',timestamp:'2026-09-04 10:30:00',lat:14.7012345,lon:121.2012345,km:12.003456,expressway:'NLEX',bound:'NB',lane:'1',photoId:'',photoFilename:'',inspector:'Juan'};
    const workbook=await buildInspectionWorkbook(new Date(),[row]);
    const file=new File([workbook],'Juan.xlsx');
    const parsed=await KMTrackSharing.readImport(file);
    if(parsed.rows[0].km!==row.km||parsed.rows[0].inspector!=='Juan')throw Error('Excel round-trip mismatch');
    const legacyFiles=[...await KMTrackSharing.readZip(workbook)].filter(([path])=>path!=='xl/worksheets/sheet2.xml');
    const legacy=await createStoredZip(await Promise.all(legacyFiles.map(async([name,part])=>({name,blob:await part.blob()}))));
    const old=await KMTrackSharing.readImport(new File([legacy],'Old.xlsx'));
    if(old.rows.length!==1||old.rows[0].inspector!==''||old.rows[0].km!==12.003)throw Error('Legacy Excel failed');
    const transfer=new DataTransfer();transfer.items.add(file);
    document.getElementById('import-file').files=transfer.files;
    document.getElementById('import-file').dispatchEvent(new Event('change'));
    return {roundTrip:parsed.rows[0],legacyEntries:old.rows.length};
  });
  await page.getByRole('dialog',{name:'Review import'}).waitFor();
  console.log(JSON.stringify(result));
  await page.screenshot({path:'output/playwright/sharing-import-preview.png'});
}
