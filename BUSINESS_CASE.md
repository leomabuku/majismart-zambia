# SmartWater Zambia — problem, market and how it earns money

*Prepared 31 October 2026. Figures are the latest publicly reported; each claim is
sourced at the bottom. Currency is USD where the source is international, ZMW
where the Zambian regulator or ministry reports in kwacha.*

---

## 1. Executive summary

1. **The problem is measured in money, not litres.** Zambia's eleven commercial
   utilities (CUs) cannot account for **57% of the water they treat**. The
   regulator's own report shows the average CU spends **K12.61** to deliver a
   cubic metre it sells for **K7.90** — they lose money twice, on leakage and on
   tariff. NWASCO's "good" benchmark is under 20%; no utility is close, and in
   2023 the regulator left the best-NRW award **vacant** because nobody
   qualified.
2. **The gap is information at the distribution edge.** Utilities have SCADA at
   treatment works and bulk meters at district level, but almost nothing between
   the district meter and the customer. Leaks are found when a resident phones,
   when a crew drives past, or when a bill doesn't reconcile — typically days to
   weeks after the water has left the network.
3. **The commercial model that fits Zambia is not "sell boxes".** It is a
   **low-capex retrofit + monthly monitoring subscription**, sold inside
   programmes that already have money and a mandate to prove results: the World
   Bank's **US$33m Programme-for-Results**, the **Devolution Trust Fund**, the
   **WASH Compact 2026–2030** and the **Zambia Water Investment Programme**.
   Hardware gets a pilot in the door; the recurring revenue is the dashboard,
   alerts and verified reporting.

---

## 2. The problem in numbers (Zambia)

| Indicator | Value | Source |
|---|---|---|
| Sector average non-revenue water (NRW) | **57.0%** (2023), up from 56.7% (2022) | NWASCO sector report, analysed |
| NWASCO benchmark for "good" NRW | **< 20%** | NWASCO |
| Average cost to serve vs average tariff | **K12.61** vs **K7.90** per m³ | NWASCO |
| O&M cost coverage / collection efficiency | **75%** / **85%** | NWASCO |
| Sector metering ratio | **79%** (up from 75.5%, ~12,000 new meters) | NWASCO |
| National revenue lost to NRW (2020 baseline) | **ZMW 998.6m** vs a benchmark loss of ZMW 474.5m | MWDS NRW Strategy 2022–2026 |
| Lusaka production vs demand | **350,000 m³/day vs 480,000** (−130,000); **265,000** in the 2025 drought | Ministerial statement, June 2025 |
| LWSC service area | **~2.3–3.8m people**, ~**147,000** connections, 47% NRW | ESAWAS benchmarking / LWSC profile |
| People inside CU service areas | **~8.36m** (grew faster than connections) | NWASCO 2023 |
| Lusaka residents in unplanned/peri-urban settlements | **~70%** of the city | JICA ESIA, 2026 |
| Load-shedding impact (2024) | >**8 hours of production lost per day**; supply hours cut **18 → 10** | LWSC via Lusaka Times / LCC |

Two structural forces make 2024–2026 the right window:

- **Drought + load-shedding** cut output and forced water rationing. When supply
  is intermittent, more pipes empty and refill, which accelerates bursts — and
  metres of head pressure matter more than ever.
- **The metering push**: LWSC is running a metering programme over **64,415
  properties** explicitly to improve billing accuracy and reduce NRW. New meters
  create the per-connection data that a monitoring layer can turn into action.

---

## 3. How this is solved today — and why it under-performs

| Status quo | What it costs / where it fails |
|---|---|
| **Resident phone calls, WhatsApp, social media, and MyWatSan/Quickfix** (national complaint platform, escalates unresolved cases to NWASCO on toll-free 5252) | No GPS, no photo, no severity, often no address; duplicates; no SLA clock. Reports describe a symptom ("no water") not a location of loss. |
| **Reactive repair crews + ward councillors** | Dispatch depends on someone answering a phone; crews arrive without knowing pipe size, valve position or what the leak looks like. |
| **District metered areas (DMAs), night-flow analysis, acoustic leak surveys** | Effective but expert- and vehicle-intensive; a survey team covers a few km of mains per week. The MCC evaluation of Lusaka's DMA/leak-detection investment found the utility's NRW was **unchanged** — "a persistent culture of not prioritising leaks" and the leak-detection infrastructure was never completed. |
| **Capital works — pipe replacement (MCC, AfDB, JICA, World Bank)** | Correct but slow and expensive; a new trunk main is a 3–5 year cycle. Meanwhile 57% still leaks. |
| **Prepaid meters and water kiosks** | Mixed. Southern Water (100 meters) and Luapula **abandoned prepaid meters entirely** — sticking valves, 2–3 year battery life, weak after-sales. Kiosks (DTF-funded) improve access but not network losses. |
| **SCADA at plants / booster stations** | Tells you what leaves the plant, not what arrives in Chilenje or Matero. |
| **Donor/NGO projects (WSUP, DTF, UNICEF)** | Strong at access and hygiene; usually time-boxed, and the asset often degrades after the project closes because nobody owns day-to-day monitoring. |

**The gap our system fills:** cheap continuous measurement at the *community tank
and reservoir* layer, plus a photo-and-GPS report channel for residents, both in
one dashboard the utility can actually staff. That is the layer where a leak or a
theft shows up as a level curve that doesn't behave, hours before anyone calls.

---

## 4. Who the customer is (Zambia segmentation)

### Tier 1 — The eleven commercial utilities (primary buyer)

| Utility | Province / towns |
|---|---|
| **Lusaka Water Supply & Sanitation (LWSC)** | Lusaka, Kafue, Chilanga, Chongwe, Luangwa, Chirundu — the flagship account |
| Kafubu (KWSC) | Ndola, Luanshya, Mpongwe, Masaiti |
| Nkana (NWSC) | Kitwe, Kalulushi, Lufwanyama |
| Mulonga (MWSC) | Chingola, Chililabombwe, Mufulira |
| Lukanga (LgWSC) | Central Province (Kabwe) |
| Southern (SWSC) | Southern Province (Livingstone, Choma, Mazabuka) |
| Eastern (EWSC) | Eastern Province (Chipata) |
| Western (WWSC) | Western Province (Mongu) |
| Chambeshi (CWSC) | Northern + Muchinga |
| Luapula (LpWSC) | Luapula (Mansa) |
| North-Western (NWWSSCL) | North-Western (Solwezi — mining belt) |

**Buyer roles:** Managing Director (signs), Director of Technical Services / NRW
unit (champions), Commercial Manager (billing accuracy), ICT (integration),
Finance (tariff justification to NWASCO). **Budget trigger:** a PforR
disbursement-linked indicator, a tariff review, or a donor programme with M&E
money attached.

### Tier 2 — Regulator and ministry (credibility + data revenue)

**NWASCO** (regulator, publishes the annual sector report; approves tariffs) and
**MWDS** (policy, NRW Strategy 2022–2026, WASH Compact). They need comparable,
verifiable utility performance data — today it is self-reported annually.

### Tier 3 — Institutions with water assets and a directive to fix them

Schools, health facilities, universities, prisons, military barracks, estates and
mine townships. The **Presidential Directive on WASH in schools and health
facilities** makes this a funded segment; the SafeManzi results-based contract
pays **up to USD 100 per water point per quarter** for verified uptime.

### Tier 4 — Donors and implementers (the fastest money, and the best references)

World Bank (ZWSSGC PforR, US$33m; Lusaka Sanitation), AfDB, JICA, KfW/GIZ, EU,
FCDO, DGIS, UNICEF, WSUP, WaterAid, and the **Devolution Trust Fund** (basket
fund backed by GRZ, KfW, EU, DANIDA) which finances peri-urban extension and
kiosks. They buy *monitoring and verifiable results*, not devices.

### Tier 5 — Households and small businesses (B2C, later)

Loss alerts for landlords, guesthouses, car washes, bakeries and irrigators.
Small ticket, high volume, good for brand but not the first revenue.

---

## 5. Why this product wins where it is deployed

| Advantage | Why it matters here |
|---|---|
| **Retrofit, no new meters** | Works on the tanks, towers and reservoirs utilities already own. No dependency on the metering programme finishing. |
| **ESP32 + ultrasonic BOM ≈ $30–45** | A district-metered area's worth of visibility for the price of one imported smart meter. |
| **Works on a bad network** | Store-and-forward ingestion, long timeouts, polling fallback — 2G/3G and load-shedding tolerant. |
| **Resident reports with GPS + photo + directions** | Turns "there is no water" into a pin a crew can navigate to, with evidence. Directly attacks the "culture of not prioritising leaks" the MCC evaluation identified. |
| **Runs on a free/near-free cloud stack** | Cloudflare Pages + Render + Supabase keeps gross margin high at pilot scale. |
| **Role separation (admin / technician / customer)** | Matches how utilities actually work: control room vs field crew vs customer. |

---

## 6. Monetisation — seven revenue lines, ranked

Benchmarks used for pricing (published, 2025–26): **US$2 per smart meter per
month** (Biz4Intellia, India/global), **R100–R300 per meter per month** by
reading frequency (Watermatic, South Africa), **RWF 35,000 per meter + RWF
100/user/month** (Smart Water, Rwanda), and a generic IoT band of **US$20–100
per sensor per month** plus US$200–1,000 hardware.

### (a) Tank-monitoring subscription — the core recurring line ✅ start here

Priced per monitored tank/station per month, not per sensor:

| Tier | Included | Indicative price |
|---|---|---|
| Community / estate | 1 tank, dashboard, SMS/WhatsApp alerts, 2 seats | **$25–35 / tank / month** |
| Utility | Up to 20 tanks, alerts + SLAs, report module, API, 10 seats | **$60–90 / tank / month** |
| Utility enterprise | Unlimited tanks, SSO, integration, on-prem/private cloud option | **$1,500–4,000 / month** + per-tank |

Sanity check: a single 50 m³ tank leaking 5 m³/day at K7.90/m³ loses ~K14,400 a
year in *billed* water — and several times that in pumped energy. One prevented
burst pays for a year of subscription.

### (b) Hardware + connectivity bundle ✅ needed to land pilots

Kit (ESP32, ultrasonic sensor, enclosure, power, SIM) at **$90–140 installed**,
sold outright, leased (36 months at ~$5/month), or bundled free into a 24-month
subscription — the model that removes procurement friction, because a utility
can fund an opex line far more easily than a capex line.

### (c) Paid pilot / proof-of-value contract ✅ fastest first revenue

A packaged **8–12 week, 10-tank pilot** with a baseline-and-verification report:
**$6,000–20,000**. This is how you get inside a utility without a tender, and it
produces the case study that unlocks the rest.

### (d) Performance / gain-share contracts 🔜 the biggest upside

Bill a share — **10–25% for 24 months** — of *verified* NRW recovery value,
measured against a baseline month. This is exactly the logic of the World
Bank's **US$27m Programme-for-Results** (Kafubu, Luapula, Western, North-Western)
and NWASCO's tariff-review culture: utilities are rewarded for moving indicators,
so a vendor who only gets paid when the indicator moves is an easy yes. It
requires a credible measurement protocol — our platform produces that data.

### (e) Donor and climate finance 🔜 real money, slower cycle

- **Devolution Trust Fund** proposals (CUs apply; monitoring is a legitimate
  project component).
- **WASH Compact 2026–2030** (US$2.111bn framework) explicitly lists private
  sector, climate funds and microfinance as financing sources.
- **Zambia Water Investment Programme** (US$5.75–6bn ambition) with a
  Green Climate Fund-backed blended-finance facility being designed.
- **Results-based contracts** in the SafeManzi mould: a per-water-point or
  per-verified-report fee (USD 100/quarter/water point is the published anchor).
- **Carbon**: pumping is energy-intensive; verified reduction in water lost =
  verified kWh saved. Worth exploring once you have 12+ months of metered data.

### (f) Regulator / ministry data subscription 🔜

Anonymised, comparable, monthly performance data per utility — the thing NWASCO
currently collects annually by survey. Annual licence **$15,000–40,000**, or
funded by a donor as a public good.

### (g) White-label / API licensing to other African utilities 🔜

The same stack under a utility's brand in Malawi, Zimbabwe, Tanzania. Licence fee
plus per-tank royalty. Requires a proven Zambian reference first.

**What to charge first:** (c) paid pilot + (b) hardware, converting to (a)
subscription. Everything else follows a reference site.

---

## 7. Unit economics sketch (per monitored tank, annual)

| Line | Amount (USD) | Notes |
|---|---|---|
| Hardware BOM + assembly | 45–70 | ESP32, ultrasonic sensor, enclosure, power |
| Installation labour | 20–35 | Local technician, ~1 hour |
| Connectivity (SIM data) | 12–36 | 1–3/month, NB-IoT or 3G |
| Cloud + support | 15–25 | Free tiers now; scales with tenants |
| **Year-1 cost** | **~95–165** | |
| **Year-1 revenue** (utility tier @ $60/mo) | **720** | plus hardware margin |
| **Gross margin, year 1** | **~75–85%** | improves as connectivity is bulk-bought |

Break-even on a 30-tank deployment: roughly **6–9 months** at utility pricing,
faster if hardware is sold at list rather than bundled.

---

## 8. Go-to-market: the first 12 months

| Window | Action | Why |
|---|---|---|
| **0–30 days** | Package the **10-tank Lusaka pilot** with a one-page baseline→verification offer; target LWSC's NRW/Technical Services unit and a peri-urban site (Chilenje, Matero, Kanyama) | LWSC is the reference everyone watches; peri-urban is where the 70% live and where NWASCO scrutiny is highest |
| **0–60 days** | Publish a free **"Zambia NRW & service-level briefing"** built from NWASCO/MWDS data (this document's spine) and circulate to all 11 CUs + NWASCO | Positions the team as the sector's data people before any sales call |
| **30–90 days** | Approach the four **PforR utilities** (Kafubu, Luapula, Western, North-Western) — they must *prove* indicator movement to get paid | Budget exists, motive exists, procurement is programme-based |
| **60–120 days** | Register with **DTF** and partner with a CU on a peri-urban tank-monitoring component; add **UNZA Engineering** as academic validator | Unlocks grant money and third-party credibility |
| **90–180 days** | Convert the pilot into a **24-month subscription**; add the **resident reporting app** as the customer-facing layer the utility can show the board and the regulator | Community reports also reduce call-centre load — an operational selling point, not just PR |
| **180–365 days** | Two paid pilots in other utilities; approach **NWASCO** with a sector data product; explore a **SafeManzi-style** results-based contract for schools/health facilities | Diversifies beyond one utility's budget cycle |

**Positioning line:** *"We don't sell sensors. We give a utility the evidence it
needs to find its water — and the regulator the proof that it did."*

---

## 9. Risks and honest mitigations

| Risk | Reality | Mitigation |
|---|---|---|
| **Procurement and payment delays** | CUs are public entities; 60–180 day payment cycles are normal | Contract via donor programmes; invoice quarterly in advance; keep pilots pre-paid |
| **"Culture of not prioritising leaks"** (MCC's own finding) | Data without a repair process changes nothing | Sell the *workflow* (alert → dispatch → close with photo), and make SLA compliance the KPI that NWASCO and PforR both look at |
| **Device theft, vandalism, power cuts** | Real in peri-urban sites | Concealed enclosures, solar+battery, tamper alerts, cheap enough to replace |
| **Connectivity gaps** | 2G/3G patchy in some townships | Store-and-forward with days of local buffering; SMS fallback |
| **Tariff politics** | Utilities cannot raise tariffs freely | Position as cost reduction and energy saving, not revenue protection alone |
| **Free-tier dependencies** | Render sleeps, Supabase free caps | Fine for pilots; budget a $50–150/month production floor per utility once paid |
| **Data protection** | Resident phone numbers and GPS | Consent at capture, retention policy, role-based access (already in the product) |
| **Big-vendor competition** | Grundfos, Xylem, Itron, Sedaru sell smart-water suites | They price for utilities at scale and rarely localise for 2G/peri-urban; compete on price, installation speed, community layer and local presence |

---

## 10. What to prove next (KPIs for the first pilot)

1. **Detection latency**: hours from level anomaly to alert (target < 2 h) vs
   days for a phone call.
2. **Verified water saved** per tank per month (m³ and ZMW).
3. **Report quality**: share of resident reports with GPS + photo (target > 80%),
   and median crew travel deviation saved.
4. **Alert precision**: false-positive rate under 15%.
5. **Uptime**: > 95% of readings delivered despite power/network gaps.

Those five numbers are the entire sales argument to the next ten utilities — and
the evidence base for a gain-share contract.

---

## Sources

- NWASCO *Water Supply and Sanitation Sector Report* (2023/2024 editions) and the
  analysis of its 57% NRW, K12.61 vs K7.90 cost recovery, 79% metering, 75% O&M
  coverage, 85% collection — <https://addanode.com/insights/nwasco-sector-report-zambia/>,
  <https://www.esawas.org/publication/nwasco-water-supply-and-sanitation-sector-report-2024>
- Ministry of Water Development & Sanitation, *National Non-Revenue Water
  Management Strategy 2022–2026* — <https://www.mwds.gov.zm/wp-content/uploads/2024/01/Ministry-of-Water-NATIONAL-NON-REVENUE-WATER-MANAGEMENT-STRATEGY.pdf>
- Ministerial Statement on Strategic Water Supply Interventions in Lusaka
  Province, June 2025 (350,000 m³ vs 480,000 demand; 265,000 in drought;
  64,415-property metering programme) — <https://www.mwds.gov.zm/?p=2772>
- LWSC water rationing and load-shedding impact, 2024 —
  <https://www.lusakatimes.com/2024/05/14/lusaka-water-supply/>,
  <https://www.lsk.gov.zm/?p=2434>
- MCC / Mathematica evaluation of the Lusaka water, sanitation and drainage
  project (NRW unchanged; leakage tools not completed) —
  <https://www.mcc.gov/resources/doc/evalbrief-090623-zmb-wash/>,
  <https://www.mcc.gov/resources/story/section-zmb-star-report-infrastructure-activity/>
- World Bank, *Improving Water Supply and Sanitation in Growth Centres in
  Zambia* (prepaid meter reliability failures at SWSC and LpWSC) —
  <https://documents1.worldbank.org/curated/en/099525103292281715/pdf/P1727860f6d96604f093530909b7ccfd07e.pdf>
- World Bank / MWDS, *Zambia Water Supply and Sanitation Services in Growth
  Centres* — US$33m, US$27m Programme-for-Results — <https://www.mwds.gov.zm/?page_id=4867>
- *Water Forward — Zambia Water Compact 2026–2030* (US$2.111bn; climate funds,
  PPPs, CDF) — <https://www.worldbank.org/content/dam/theworldbankgroupasset/document/2026/ZAMBIA%20WASH%20PACT%2028.1.26%20FINAL.pdf>
- Zambia seeking US$6bn via the Zambia Water Investment Programme, GCF-backed
  blended facility — <https://www.daily-mail.co.zm/2025/03/31/zambia-pursues-blended-financing-to-unlock-water-investments-seeks-6-billion-in-water-financing/>
- SafeManzi results-based funding pilot, USD 100/water point/quarter —
  <https://www.smithschool.ox.ac.uk/sites/default/files/2025-03/Results-based-funding-Zambia-v12.pdf>
- MyWatSan/Quickfix national complaints platform and NWASCO toll-free line —
  <http://www.mywatsan.co.zm/contact.php>
- Devolution Trust Fund (basket fund: GRZ, KfW, EU, DANIDA) —
  <https://ppp.worldbank.org/library/devolution-trust-fund-through-national-water-supply-and-sanitation-council>
- The eleven commercial utilities and their provinces — MWDS *Annual Report 2024*
  — <https://www.mwds.gov.zm/wp-content/uploads/2025/12/MWDS-Annual-Report-2024.pdf>
- LWSC scale (~2.3–3.8m people, ~147,000 connections) — ESAWAS benchmarking —
  <https://www.esawas.org/wp-content/uploads/2024/04/3rd-ESAWAS-Large-WSS-Utilities-Benchmarking-Report-June-2017-1.pdf>
- Pricing benchmarks: Biz4Intellia (US$2/meter/month) —
  <https://www.biz4intellia.com/smart-water-meter-solutions/>; Watermatic
  (R100–R300/meter/month) — <https://www.watermatic.co.za/>; Smart Water Rwanda
  (RWF 35,000/meter + RWF 100/user/month) — <http://giih.ur.ac.rw/article75>
