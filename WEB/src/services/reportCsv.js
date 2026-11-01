export function reportCsv(result) {
  const columns=['id','reporter','location','category','confirmed_category','severity','status','provenance','created_at','first_response_at','first_response_hours','resolved_at','resolution_hours','confirmed_cause','action_taken','outcome','assigned_to','admin_response'];
  const cell=value=>{
    let text=String(value??'');
    if(typeof value==='string'&&/^\s*[=+@-]/.test(text))text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  };
  return '\uFEFF'+[columns,...result.records.map(row=>columns.map(key=>row[key]))].map(row=>row.map(cell).join(',')).join('\r\n');
}
