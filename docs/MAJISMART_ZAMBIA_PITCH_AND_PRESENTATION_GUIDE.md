# MajiSmart Zambia — pitch and presentation guide

**Presenter:** developer / product lead

**Preparation date:** 31 October 2026. This guide describes the repository, not proof of a live deployment. Verify your demo environment before presenting.

**Ground rule:** say “simulated” when using simulated readings; never call a configuration calibrated without the recorded checks or claim physical verification that has not occurred.

## 1. Introduction

### Opening statement

> “When water is scarce, knowing what is in a storage tank and hearing about a fault quickly can help people decide what to do next. MajiSmart Zambia is a prototype that connects tank-level monitoring with community reporting, so residents see useful information and operators can investigate issues in one place.”

MajiSmart Zambia is an IoT-enabled **storage monitoring and incident reporting prototype** for institutions, community water schemes, utility teams and residents. An ultrasonic sensor measures distance to a water surface; an ESP32 transmits it to a backend which uses registered geometry and calibration to estimate depth and volume. People can submit reports and administrators can track and classify cases. It is designed to make recorded observations easier to act on—not to create water or guarantee service.

**Value proposition:** replace disconnected tank checks and incident records with a shared, timestamped view, while making uncertainty visible. The buyer is likely an institution or project operator; residents are beneficiaries, not automatically paying customers. Adoption, savings and willingness to pay remain to be validated.

## 2. Problem being solved

**Verified context, not live operational readings:**

- UNICEF's 2025 WASH budget brief, citing NWASCO, reports urban water coverage falling from **87.7% in 2023 to 86.5% in 2024**, and operations and maintenance cost coverage at around **65% in 2024**. These are sector indicators, not this product's performance. [1]
- The national NRW strategy cites **2020** NWASCO data: about **169 million m³**, **53% non-revenue water** and **ZMW 998.6 million** estimated revenue loss. These are historical estimates, not 2026 measurements. The strategy discusses physical and commercial losses; one tank sensor cannot measure or solve national NRW. [2]
- UNICEF's September 2024 drought update reports **9,779,145 exposed**, **6,552,027 adversely affected**, and **84 of 116 districts severely impacted**. Its December 2025 report describes continuing consequences of the 2023/24 drought; neither is a current tank measurement. [3][4]
- A Ministry statement published **19 June 2025** described average Lusaka production of **350,000 m³/day**, estimated demand of **480,000 m³/day**, a **130,000 m³/day** gap, and production of **265,000 m³/day** under the cited drought conditions. These are historical statement figures, not today's verified supply. [5]
- UNICEF's WASH page attributes its estimates to WHO/UNICEF JMP data retrieved in **2023–2024**: 27% of households lack basic water access; 60% in the poorest quintile lack basic service; 21% of schools lack basic access; 13% of health facilities lack any water service. Definitions and reference periods differ; these figures must not be treated as interchangeable. [6]

**Operational problems MajiSmart is designed to address:** a caretaker may have to physically check a tank; a resident may not know when the last sensor reading was received; a utility may receive phone calls without a consistent category or location; investigators need a history of what was reported and what was actually confirmed. These are product hypotheses to validate through interviews and a pilot, not proven national prevalence estimates. Reporting frequency is not the same as actual failure frequency.

## 3. Solution

**Flow:** sensor → ESP32 → authenticated HTTPS request → Express validation → calibration and geometry → persisted reading → SSE invalidation → authorised web refetch. The intended production database is Supabase PostgreSQL; the verified integration tests here used SQLite. Android uses the REST API and manual refresh, not live SSE. Physical hardware, PostgreSQL ingestion and production deployment are not verified.

A top-mounted ultrasonic sensor estimates the distance to the water surface. With an empty reference, the server computes depth, then volume from tank shape. An administrator records the configuration and compares sensor-derived depth with manual measurements. It records an estimated level and the device's last seen time. A resident can submit an issue; an administrator can record findings separately from the original claim.

**Scope boundary:** this monitors a connected storage container and documents reports. It does not automatically monitor every pipe, detect underground leaks, test water quality, control pumps, perform billing, or establish the cause of a fault. A water-quality report is a concern reported by a person, not a laboratory result.

## 4. What we are building

| Module / stakeholder | Problem and action | Evidence of success and limitation |
|---|---|---|
| Admin dashboard / operators | Bring tank readings, alerts and reports into one view. | Pilot: time to find a tank and its last reading. Existing dashboard contains legacy seed data and is not a certified live utility view. |
| Installation / installer | Register a new tank, owner, station, coordinates, shape, sensor and device; inspect calculated capacity. | Pilot: percentage of installations with complete verified documentation. Existing tanks can be configured without deleting their history; geometry editing remains incomplete; registration is not calibration. |
| Calibration / technician | Record manual depth and sensor distance at low, middle and high levels, review error and verify against chosen tolerance. | Depth error and passing checks. Human-entered tests can be wrong; no physical verification has been performed. |
| Provisioning / administrator | Assign a device credential to the new tank; revoke or rotate through the API. Unknown devices cannot auto-register. | Rejected unauthorised packets and credential rotation exercise. Device replacement is available for already configured tanks; legacy configurations still require newly measured geometry; device keys require a security review. |
| Level monitoring / caretaker | Raw distance is converted using geometry; estimates and condition are recorded with receipt time. | Valid reading rate and manual comparison error. Values are estimates; sensor faults are rejected but not yet fully recorded as fault events. |
| Realtime and offline / operator | Web refetches after an SSE invalidation; offline monitor marks stale devices. | End-to-end latency and offline-detection tests in a pilot. SSE is process-local with no replay; Android refresh is manual; physical and PostgreSQL paths are unverified. |
| Community reports / resident | Submit category, title, description, location and optional evidence; follow own status. | Submissions with usable location; status visibility. Existing category set is narrower than the proposed taxonomy; community notices and richer impact fields are incomplete. |
| Case handling / investigator | Append classification, severity, findings, suspected/confirmed cause, action and outcome separately from original report. | Share of cases with a documented classification and resolution timestamp. Assignment is free text, not workforce management; case actions and status transitions are separate. |
| Report intelligence / utility manager | Count submissions, category and location groups, resolution rate and duration with filters and denominators. | Quality and completeness of source records. Excludes only known seed reports; other test reports may appear. No causal claims or AI. |
| Telemetry intelligence / operator | Aggregate explicitly OPERATIONAL reading samples by tank, separate from report counts. | Number of valid operational samples and missing data. Low/critical counts are samples, not independent events or durations; unknown/test/simulated records excluded where provenance is recorded. |
| Customer web and Android / owner | Show assigned tanks, last-known level and device status; track own reports. | Can a customer identify a stale reading? Android build and physical telemetry are unverified; location-based notices are incomplete. |
| Firmware and simulator / engineer | Send filtered distance via the validated API; simulator identifies its traffic. | Reproducible test runs and sensor error table. Firmware not compiled or physically tested here. Simulator marker is an accidental-contamination guard, not proof of origin. |

### Growth and architecture

Start with **one transparent demonstration container** and one consenting institution, then run a monitored pilot with a defined baseline, trained technicians and support arrangements. Expand to multiple tanks only after measuring accuracy, connectivity, maintenance costs and operator usefulness. For larger installations, test load, database indexes, queueing, role boundaries and alert delivery; add managed event delivery or a broker before multi-instance SSE. Horizontal scaling is a design objective, not a proven capability.

Intended hosting: **Cloudflare Pages** for React/Vite; **Render** for Express; **Supabase PostgreSQL** for the database; **Android Kotlin/Compose** for mobile; **ESP32** for sensing. TLS, backups, secrets, monitoring, network cost, hosting limits, procurement and data ownership must be agreed before deployment. No live infrastructure has been modified.

## 5. Demo script

**Preparation:** use a local or approved disposable environment. Apply migrations to a disposable PostgreSQL database if demonstrating PostgreSQL; otherwise say “local SQLite demonstration.” Create admin and customer accounts. Register a clearly named **SIMULATED** tank with a dedicated high-entropy test credential and assign it to the demo customer. Create test reports only in the demo environment. Never use production data or credentials. Confirm browser, backend, device and network; put screenshots of the same screens in a backup folder, clearly labelled as screenshots.

1. **Problem and users.** Show slide with one cited 2024/2025 figure. Say: “These are historic sector indicators; our first use case is one tank and one reporting workflow.” Audience: the scope is bounded. Backup: read the figures from this guide.
2. **Admin dashboard.** Sign in as admin and open **Monitoring Dashboard**. Say: “This shows available records; seeded data is not a live utility feed.” Audience: operator visibility. Backup: labelled screenshot.
3. **Tank and location.** Open **Install tank**, or a pre-created test tank and the map. Show the registered identifier and location; pin or coordinates are manually provided. Say: “A coordinate is only as trustworthy as the installation record.” Backup: show the saved coordinates on the installation screen.
4. **Geometry and calibration.** In **Install tank**, select the existing installation and its calibration history. Explain empty and full reference distances and manually measured errors. Say: “Saved is not the same as calibrated. This prototype has not been physically validated.” Backup: use the blank calibration table in `docs/IMPLEMENTATION_PROGRESS.md`.
5. **Simulated reading.** With the SIMULATED installation, run `IOT_API_KEY='<demo-only-key>' node FIRMWARE/simulator/iot_simulator.js --mode=once --tank=<demo-tank-code> --device=<demo-device-code>` from the repository root. Replace placeholders locally; avoid showing or recording the secret. Defaults assume a 50 cm test configuration—choose geometry and references accordingly. Say: “This packet is simulated, not from a physical sensor.” Audience: authenticated input becomes a persisted reading. Backup: labelled screenshot of a previous disposable test; do not invent a successful packet.
6. **Condition change.** Use simulator `--mode=critical` only if its 45 cm distance is valid for the demo calibration. Refresh the dashboard and show last update/condition; on disconnect show offline state instead. Say: “The backend computes the classification; a stale level is not current.” Backup: explain thresholds without asserting a live change. WARNING is currently mapped to NORMAL in legacy views; show the newer customer condition if available.
7. **Customer interface.** Sign out, sign in as the assigned demo customer; open **Your water**. Show last-known level, device state and calibration warning. Say: “A customer sees their own assigned tank rather than the utility analytics.” Backup: labelled customer screenshot.
8. **Report.** Open **Community Reports → Submit Incident Report**, choose one of the existing categories, add a non-sensitive test description and manual location; submit. Say: “A report is a claim, not a confirmed cause.” Backup: open a previously created test report.
9. **Admin investigation.** Sign in as admin, open **Community Reports**, select the test report, then use **Internal case record**. Record a classification and finding. Say: “The original category stays unchanged; internal notes are not shown to customers.” Backup: show an existing test case with sensitive details removed.
10. **Resolve.** Use the existing report status form to mark the test case resolved; case-event outcome and status are separate actions. Say: “The status history records the change; resolution is an administrator action.” Backup: show an existing resolved test report.
11. **Analytics.** Open **Report intelligence**, filter to the test report's location/date, and point out counts and denominator. Say: “This demo includes test data; it is not evidence of real incident trends.” Simulated readings are excluded from operational telemetry aggregation. Backup: use empty state and explain what real records would populate.
12. **Scale.** Return to the architecture diagram described in §3. Say: “One pilot comes first; we must validate sensor accuracy, cost, privacy and support before scale.” Backup: diagram on paper.

## Tough questions and defensible answers

1. **How do you know Zambia has a problem?** The cited UNICEF and Ministry publications document access, reliability and historic loss challenges. They do not establish demand for this product; customer discovery must do that.
2. **What evidence supports need?** Coverage, drought impact and historical NRW support investigation of operational needs. Pilot interviews and baseline data are needed to test whether MajiSmart improves a specific workflow.
3. **What do you solve?** Visibility of connected tank estimates and structured incident tracking. We do not create supply, repair pipes or certify water quality.
4. **Why more than a student IoT project?** It joins measurement, identity, case history and stakeholder workflows; commercial value is still an unproven hypothesis, not an established outcome.
5. **How does ultrasonic sensing work?** A sound pulse reflects from the surface; echo time estimates distance using speed of sound. Surface shape, temperature, mounting and sensor dead zone affect accuracy.
6. **How do you calculate depth?** Correct raw distance using the configured offset and subtract it from the empty reference; clamp only within a configured tolerance. Reject impossible readings.
7. **How is volume calculated?** Rectangle: length × width × depth; vertical cylinder: πr² × depth. Horizontal cylinder uses circular-segment area × length. Convert cm³ to litres by dividing by 1,000.
8. **Why does geometry matter?** Horizontal-cylinder volume is nonlinear in depth; a quarter of its height is not a quarter of its volume.
9. **How do you calibrate?** Measure internal dimensions and empty/full distances, then compare independent manual depths and filtered sensor values at several levels. Record errors and repeat; an admin verification is not laboratory certification.
10. **What about bad measurements?** Reject timeouts, invalid distance, dead-zone and out-of-range readings; display calibration uncertainty and last seen. Persistent fault-event management is still incomplete.
11. **What if Wi-Fi fails?** The firmware reconnects and retries with a later sample; it does not buffer a durable backlog. The monitor can flag a device offline after its configured timeout.
12. **What if power fails?** Monitoring stops and the last level becomes stale. A battery, UPS or solar supply is a separate engineered and costed option, not a feature already proven here.
13. **How is a device secured?** It uses a provisioned per-device credential over HTTPS; server checks identity, active state and assignment. High-entropy credentials, TLS CA verification, rotation and operational security are essential; rate limiting and further review remain.
14. **Can a device report another tank?** The backend compares its assigned tank with the submitted tank ID and rejects a mismatch.
15. **How is realtime implemented?** An SSE stream sends invalidations to web clients, which refetch authorised data. It is process-local with no replay; Android currently refreshes manually.
16. **When a device stops transmitting?** The offline monitor changes its status after the configured interval. The displayed level is last known, not guaranteed current.
17. **How do you distinguish low water from sensor failure?** A valid low measurement is not definitive proof of low water. Sanity checks, missing-heartbeat detection and manual verification help; a comprehensive fault-state workflow remains to be implemented.
18. **Who is the customer?** Initial candidates are institutions and community schemes operating tanks, and later utilities or NGOs. Procurement authority and budget must be confirmed in discovery.
19. **Who pays and who benefits?** A tank-owning institution, utility or project could pay for installation and service; caretakers and residents benefit from information. No contracts or customers are claimed.
20. **Why would a utility adopt it?** If a pilot demonstrates faster access to trustworthy readings and more complete incident histories at acceptable cost. Integration, procurement and reliability are substantial barriers.
21. **Why would a household use it?** An assigned tank's last-known level and report status can be useful. Basic public notices should preferably be funded by an institution rather than charging residents.
22. **Who maintains hardware?** A trained installer or contracted local technician, with agreed ownership, service levels, spares and travel budget. That operational network does not yet exist as a commitment.
23. **What are the alternatives?** Manual dip checks, float gauges, phone calls, spreadsheets, standalone level sensors and existing SCADA or utility platforms. The proposed advantage is combining a modest sensor with a shared case workflow; it must be tested against these alternatives.
24. **What is the competitive advantage?** Local workflow fit and transparent low-cost deployment are hypotheses, not verified exclusive advantages. Avoid claiming proprietary technology or established market leadership.
25. **How do you monetize?** Institution-funded subscription plus separate installation, maintenance and optional integrations. Prices below are illustrative, not quotes.
26. **Why sustainable in Zambia?** Only if pricing covers connectivity, visits, replacement and support while meeting customer budgets; test this with actual quotations and pilot procurement.
27. **How scale to Lusaka or Copperbelt?** First validate a small pilot, technician process and consent. Then partition organisations, establish service operations and load-test ingestion/database and multi-instance messaging. Citywide deployment is not proven.
28. **Thousands of sensors?** Estimate request rate from device count and interval, benchmark database and API, batch or queue as appropriate, add durable messaging, retention and observability. No present capacity claim is justified.
29. **Connectivity costs?** Use measured data volumes and current local carrier quotes. Wi-Fi coverage, outages and installation costs vary; no mobile cost is assumed as a fact.
30. **Internet unavailable?** The current firmware drops missed samples and retries later. Offline buffering and store-and-forward are potential improvements, not currently guaranteed.
31. **How protect data?** Restrict roles and owner access, keep credentials server-side, use TLS, audit access and define retention and consent. Public legacy endpoints and deployment still need a security review.
32. **How maintain hardware at scale?** Schedule inspections, maintain spare sensors, document calibration, monitor device availability and budget travel. Demonstrate field performance before promising service levels.
33. **Integrate with utility systems?** Use authenticated, documented APIs or export interfaces after requirements and permissions are agreed. No SCADA or billing integration is currently demonstrated.
34. **Detect underground leaks?** No. Residents can report suspected leaks; confirmation needs field investigation and potentially other instruments.
35. **Measure water quality?** No. A water-quality report records a concern, not a sensor or laboratory result.
36. **Control water distribution?** No; the prototype is monitoring and case recording, not a control system.
37. **Does a tank sensor reduce losses automatically?** No. It can provide observations that may help an operator act; savings require measured operational changes and cannot be inferred from level alone.
38. **How measure impact?** Compare agreed baseline and pilot outcomes: time to discover low storage, report completeness, response intervals, device uptime, calibration error and full cost. Use comparable sites and document confounders.
39. **Biggest limitation?** No actual physical demonstration or PostgreSQL deployment has been validated in this environment; the real-world benefit and hardware accuracy remain unproven.
40. **What next?** Verify physical calibration and PostgreSQL end to end, support safe geometry editing and recalibration, finish case/report provenance and run a privacy-reviewed pilot.

## Business model and growth strategy

**Primary buyer:** a school, hospital, institutional facility or community scheme managing a small number of tanks, because a bounded pilot has a clear caretaker and measurable workflow. **Secondary:** utility operators, councils and NGO-funded water projects. Interview operators, finance/procurement officers and residents before settling on price.

**Recommended primary offer:** institution-funded recurring software and support subscription, with hardware and installation invoiced separately. Offer optional managed monitoring, project deployment/training and enterprise integrations. Avoid charging ordinary households for essential public notices without a strong reason. Annual contracts may better fit institutional procurement; managed service must define who responds to alerts and when.

**Illustrative, unvalidated example—not a quotation or market price:** assume one institution buys 5 kits. Assume per kit parts ZMW 500, mounting and labour ZMW 300, travel allocation ZMW 100, giving direct initial cost **5 × 900 = ZMW 4,500**. Assume a proposed installation charge of **ZMW 1,200 per tank**, yielding **ZMW 6,000** before overhead and warranty: **ZMW 1,500** gross contribution, not profit. Assume a software/support fee of **ZMW 750 per institution per month** and monthly allocated cloud/connectivity/support cost of **ZMW 500**, giving **ZMW 250** monthly contribution before taxes, administration and replacements. These numbers are arbitrary planning assumptions, not verified local costs or customer willingness to pay. Quote local components, labour, data, travel, taxes and warranties before pricing. A simple bottom-up model is `number of paying institutions × average annual subscription + installations + contracted services`; no market-size or revenue forecast is asserted.

**Acquisition:** interview caretakers, utility operations managers, procurement and residents; co-design a limited paid or funded pilot, agree an evaluation and data-ownership plan, then seek references only with permission. Potential—not committed—partners include local installers, utilities, councils, WASH NGOs and connectivity providers. Risks: procurement delays, weak connectivity, power outages, corrosion, calibration drift, theft, false alerts, privacy and unreliable recurring support. Mitigate with realistic service agreements, measured error, device health monitoring, spare parts, site surveys and data minimisation.

## Presentation delivery guidance

**30 seconds:** “MajiSmart Zambia is a prototype for monitoring connected water tanks and tracking community water reports. A sensor measures distance to the water, the backend estimates the level from the tank's geometry, and operators can investigate reported issues. It does not create supply or detect every leak. Our next step is to validate accuracy and operational value in a small pilot.”

**60 seconds:** “Water access, reliable supply and utility sustainability remain difficult challenges in Zambia. MajiSmart focuses on a smaller, practical operational question: what is in a connected tank, when was it last measured, and what happened to a reported problem? An ESP32 sends raw distance; the server applies tank geometry and calibration and the web application presents a last-known level. Residents can submit reports, while administrators record findings separately. We will use a clearly labelled simulation today. The physical sensor, production PostgreSQL and customer impact still require verification.”

**Three minutes:** Start with the 2025 UNICEF coverage and cost-recovery figures, identify their historical period, and explain a caretaker's manual checks and fragmented incident calls. Introduce the sensor → server → dashboard chain using a transparent container; distinguish raw distance from depth and volume. Show a simulated reading and a report moving through the case workflow. Explain that the operator can count documented incidents but cannot infer causation or national losses. Identify an institution as a potential buyer, installation plus recurring support as a hypothesis, and a small pilot with accuracy, response-time and cost measurements as the next step. Close with explicit limitations: no physical or PostgreSQL verification, no water-quality measurement or network control.

**Nontechnical architecture:** say “the sensor measures distance, the server translates it using the tank's dimensions, and the apps show the latest recorded result.” Keep TLS, SSE and database detail for questions.

**Business potential:** discuss a named buyer, budget owner, maintenance plan and measured pilot value, not an invented market size. **Unfinished feature:** “That is planned, not demonstrated; today I can show the implemented portion and explain the next verification step.”

**Closing:** “MajiSmart starts with one measurable tank and one accountable reporting workflow. The opportunity is to prove that trustworthy, timely information helps a local operator act—then expand only when the evidence, maintenance model and users justify it.”

## Sources

1. UNICEF Zambia, *WASH Budget Brief 2025*, reporting NWASCO 2023–2024 indicators: https://www.unicef.org/zambia/media/7681/file/WASH%20Budget%20Brief%202025.pdf.pdf
2. Ministry of Water Development and Sanitation, *National Non-Revenue Water Management Strategy 2022–2026*, historical 2020 baseline: https://www.mwds.gov.zm/wp-content/uploads/2024/01/Ministry-of-Water-NATIONAL-NON-REVENUE-WATER-MANAGEMENT-STRATEGY.pdf
3. UNICEF Zambia, *Cholera and Drought Response*, September 2024: https://www.unicef.org/zambia/reports/cholera-drought-response-sep2024
4. UNICEF Zambia, *Humanitarian Situation Report*, December 2025: https://www.unicef.org/zambia/reports/zambia-country-office-humanitarian-situation-report-2025
5. Ministry of Water Development and Sanitation, *Ministerial statement on Lusaka water supply*, published 19 June 2025: https://www.mwds.gov.zm/?p=2772
6. UNICEF Zambia, *Water, Sanitation and Hygiene*, WHO/UNICEF JMP estimates retrieved 2023–2024: https://www.unicef.org/zambia/water-sanitation-and-hygiene
7. World Bank, *Grant to Enhance Accountability and Efficiency of Zambia's Water Sector*, 28 April 2025: https://www.worldbank.org/en/news/press-release/2025/04/28/world-bank-grant-to-enhance-accountability-and-efficiency-of-afe-zambias-water-sector — demonstrates institutional investment priority, not an endorsement, partnership or MajiSmart customer.
