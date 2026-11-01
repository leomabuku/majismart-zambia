import test from 'node:test';
import assert from 'node:assert/strict';
import {reportCsv} from '../src/services/reportCsv.js';

test('report-level CSV preserves missing durations and neutralizes untrusted formulas',()=>{
  const csv=reportCsv({records:[{id:'demo-1',reporter:'DEMO Resident 001',provenance:'SIMULATED',location:'=HYPERLINK("bad")',first_response_hours:null,admin_response:'Inspect, repair and verify "connection"'}]});
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"Inspect, repair and verify ""connection"""'));
  assert.ok(csv.includes('"SIMULATED"'));
  assert.equal(csv.split('\r\n').length,2);
  assert.equal(csv.includes('reporter_phone'),false);
});
