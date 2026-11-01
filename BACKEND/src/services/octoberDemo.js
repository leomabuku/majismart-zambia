export const OCTOBER_DEMO = {
  key: 'reports.october2026.demo.v1', prefix: 'demo-oct2026-v1-',
  name: 'October 2026 • synthetic community reports',
  asOf: '2026-10-31T21:59:59.000Z', residents: 80
};

const places = ['Kanyama', 'Mtendere', 'Chilenje', 'Kabwata', 'Chelston', 'Matero', 'Chawama', 'Garden', 'Woodlands', 'Kalingalinga', 'Avondale', 'Kabulonga'];
const faults = [
  ['WATER_SHORTAGE','COMPLETE_INTERRUPTION','POWER_FAILURE','HIGH','RESTORE_SUPPLY','Power interruption at a fictional booster station','No water available at the shared collection point','Check pump power, restore supply and verify downstream delivery'],
  ['PIPE_LEAKAGE','MINOR_LEAK','WORN_JOINT','MEDIUM','REPAIR','Worn coupling at a fictional service connection','Water leaking continuously beside a connection','Isolate the affected section, replace the coupling and check for residual leakage'],
  ['PIPE_LEAKAGE','UNDERGROUND_LEAK','CORRODED_PIPE','HIGH','REPAIR','Corrosion on a fictional buried pipe section','Wet ground and a persistent pool without visible surface damage','Inspect the pressure zone, locate the leak and repair the confirmed section'],
  ['BURST_PIPE','BURST_PIPE','PRESSURE_SURGE','CRITICAL','REPLACEMENT','A simulated pressure surge damaged an ageing main','A burst pipe is discharging water onto the access road','Isolate the main, arrange temporary access and replace the damaged section'],
  ['LOW_PRESSURE','LOW_PRESSURE','PARTIALLY_CLOSED_VALVE','MEDIUM','REPAIR','A fictional distribution valve was partly closed','Very weak flow during the morning collection period','Inspect valve settings and verify pressure after adjustment'],
  ['WATER_INTERRUPTION','REDUCED_SUPPLY','PUMP_MAINTENANCE','HIGH','RESTORE_SUPPLY','Planned maintenance overran its fictional restoration window','Water supply stopped after the announced maintenance period','Confirm restoration time and communicate updates to affected users'],
  ['WATER_QUALITY','DISCOLORATION','SEDIMENT_AFTER_REPAIR','HIGH','FLUSHING','Simulated sediment after a pipe repair; laboratory safety is not established','Discoloured water noticed after supply resumed','Escalate for sampling, investigate the complaint and record verification before closure'],
  ['DAMAGED_INFRASTRUCTURE','DAMAGED_VALVE','VANDALISM','HIGH','REPLACEMENT','A fictional valve enclosure was damaged','Damaged valve housing with intermittent leakage','Secure the location, replace the damaged parts and inspect the enclosure'],
  ['TANK_MALFUNCTION','OVERFLOW','STUCK_FLOAT_VALVE','MEDIUM','REPLACEMENT','A fictional inlet float valve stuck open','Tank overflow continuing after the tank appears full','Inspect the inlet control and test shut-off after replacement'],
  ['MONITORING_FAULT','DEVICE_OFFLINE','COMMUNICATION_FAILURE','MEDIUM','REPAIR','A fictional gateway lost its data connection','Tank level has not updated despite water being available','Check power and connectivity, then verify against a manual reading'],
  ['MONITORING_FAULT','INACCURATE_READING','SENSOR_ALIGNMENT','LOW','INSPECTION','A fictional level sensor was misaligned','Displayed level differs from a manual inspection','Check mounting and calibration against independent observations'],
  ['OTHER','DAMAGED_CONNECTION','SERVICE_CONNECTION_DAMAGE','LOW','REPAIR','A fictional public standpipe connection was damaged','Shared tap damaged and difficult to use','Inspect the connection, repair the tap and test operation']
];
const weights = [0,0,0,1,1,1,1,2,2,3,3,4,4,4,5,5,6,6,7,8,9,10,11];
const legacyCategory = c => ({ LOW_PRESSURE:'WATER_SHORTAGE', WATER_INTERRUPTION:'WATER_SHORTAGE', DAMAGED_INFRASTRUCTURE:'OTHER', MONITORING_FAULT:'OTHER' }[c] || c);

export function buildOctoberDemo() {
  const reports = [], details = [], history = [], cases = [];
  const end = Date.parse(OCTOBER_DEMO.asOf);
  let index = 0;
  for (let day = 1; day <= 31; day++) {
    const count = 6 + day * 7 % 9 + ([10,11].includes(day) ? 12 : 0);
    for (let slot = 0; slot < count; slot++, index++) {
      const fault = faults[weights[(index * 7 + day) % weights.length]];
      const [category, confirmed, cause, severity, action, causeText, observation, response] = fault;
      const location = ['PIPE_LEAKAGE','BURST_PIPE'].includes(category) && index % 3 ? places[day % 3] : places[(index + day) % places.length];
      const id = OCTOBER_DEMO.prefix + String(index + 1).padStart(4,'0');
      const created = Date.UTC(2026,9,day,6 + slot % 14,(index * 17) % 60);
      const ackHours = (severity === 'CRITICAL' ? .25 + index % 5 * .4 : 1 + index % 37) + (day === 10 || day === 11 ? 8 : 0);
      const firstResponse = created + ackHours * 3600000;
      const resolveHours = ackHours + 3 + index % 97;
      const resolvedAt = created + resolveHours * 3600000;
      let status = index % 17 === 0 ? 'REJECTED' : index % 10 < 7 ? 'RESOLVED' : index % 10 === 7 ? 'IN_PROGRESS' : index % 10 === 8 ? 'ACKNOWLEDGED' : 'SUBMITTED';
      if (firstResponse > end) status = 'SUBMITTED';
      else if (status === 'RESOLVED' && resolvedAt > end) status = 'IN_PROGRESS';
      const resident = (index * 13) % OCTOBER_DEMO.residents + 1;
      const iso = n => new Date(Math.min(n,end)).toISOString();
      const rejected = status === 'REJECTED';
      const notes = status === 'SUBMITTED' ? '[DEMO] Awaiting dispatch review.' : `[DEMO] Dispatch ${index % 4 + 1}: ${rejected ? 'Duplicate complaint linked to an existing fictional case.' : response + '.'}`;
      reports.push({ id, reporter_id:null, reporter_name:`DEMO Resident ${String(resident).padStart(3,'0')}`, reporter_phone:null,
        category:legacyCategory(category), title:`[DEMO] ${observation}`, description:`SYNTHETIC TRAINING RECORD. ${observation} in a fictional service zone of ${location}. This is not evidence of a real incident.`,
        location_name:location, station_id:null, status, admin_notes:notes,
        rejection_reason:rejected ? '[DEMO] Duplicate of a fictional case; no separate repair dispatch.' : null,
        created_at:iso(created), updated_at:iso(status === 'RESOLVED' ? resolvedAt : status === 'SUBMITTED' ? created : status === 'IN_PROGRESS' ? firstResponse + 1800000 : firstResponse) });
      details.push({ report_id:id, reported_category:category, observed_at:iso(created - 1800000),
        reported_severity:severity === 'CRITICAL' ? 'HIGH' : severity, ongoing:'YES',
        affected_area:`Fictional ${location} service zone ${index % 5 + 1}`, provenance:'SIMULATED' });
      const transition = (step, before, after, time, text) => history.push({ id:`${id}-h${step}`,report_id:id,previous_status:before,new_status:after,changed_by:null,notes:`[DEMO] ${text}`,created_at:iso(time) });
      transition(0,null,'SUBMITTED',created,'Fictional resident submitted this scenario.');
      if (status !== 'SUBMITTED') {
        transition(1,'SUBMITTED',rejected ? 'REJECTED' : 'ACKNOWLEDGED',firstResponse,notes);
        cases.push({ id:`${id}-c1`,report_id:id,actor_id:null,confirmed_category:rejected ? 'UNCLASSIFIED' : confirmed,severity,
          suspected_cause:rejected ? null : cause,confirmed_cause:null, findings:'[DEMO] Initial triage; findings are synthetic.',
          action_taken:rejected ? 'NONE' : 'INSPECTION',outcome:rejected ? 'INVALID' : 'PENDING',
          assigned_to:`DEMO Response Team ${index % 4 + 1}`,notes,created_at:iso(firstResponse) });
      }
      if (['IN_PROGRESS','RESOLVED'].includes(status)) transition(2,'ACKNOWLEDGED','IN_PROGRESS',firstResponse + 1800000,'Fictional inspection team dispatched.');
      if (status === 'RESOLVED') {
        transition(3,'IN_PROGRESS','RESOLVED',resolvedAt,response + '. Verification recorded within this scenario.');
        cases.push({ id:`${id}-c2`,report_id:id,actor_id:null,confirmed_category:confirmed,severity,suspected_cause:cause,confirmed_cause:cause,
          findings:`[DEMO] ${causeText}.`,action_taken:action,outcome:'RESOLVED',assigned_to:`DEMO Response Team ${index % 4 + 1}`,
          notes:`[DEMO] ${response}. Fictional follow-up confirms restoration.`,created_at:iso(resolvedAt) });
      }
    }
  }
  return { reports, details, history, cases };
}

async function insertRows(tx, table, rows, conflict = 'id') {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const values = rows.flatMap(row => columns.map(key => row[key]));
  await tx.run(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${rows.map(() => '(' + columns.map(() => '?').join(',') + ')').join(',')} ON CONFLICT (${conflict}) DO NOTHING`, ...values);
}

export async function ensureOctoberDemo(db) {
  const existing = await db.get('SELECT value FROM system_settings WHERE key = ?', OCTOBER_DEMO.key);
  if (existing) return JSON.parse(existing.value);
  const batch = buildOctoberDemo();
  const metadata = { ...OCTOBER_DEMO, reports:batch.reports.length, provenance:'SIMULATED' };
  await db.transaction(async tx => {
    await insertRows(tx,'community_reports',batch.reports);
    await insertRows(tx,'report_submission_details',batch.details,'report_id');
    await insertRows(tx,'report_status_history',batch.history);
    await insertRows(tx,'report_case_events',batch.cases);
    await tx.run(`INSERT INTO system_settings (key,value,description) VALUES (?,?,?) ON CONFLICT (key) DO NOTHING`,OCTOBER_DEMO.key,JSON.stringify(metadata),'User-requested synthetic October dataset; excluded from operational totals.');
  });
  return metadata;
}
