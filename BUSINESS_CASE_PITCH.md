# SmartWater Zambia

### A pitch document — the problem, the system, and why it matters

*Written for a mixed audience: engineers, utility managers, and funders. Read the
first page and you'll know the whole argument.*

---

## The pitch, in one paragraph

Zambia's water utilities lose **more than half of the water they treat** before it
ever reaches a customer — 57% on the regulator's own figures. They are not
careless; they are **flying blind**. There is instrumentation at the treatment
works and almost nothing between the district meter and the household tap, so a
burst pipe runs for days and a leaking tank drains for weeks before anyone
notices. SmartWater Zambia puts cheap sensors on the tanks and reservoirs that
already exist, gives residents a two-tap way to report a leak with a photo and an
exact GPS position, and merges both into **one live dashboard** a utility can
actually staff. The water utility stops guessing, the crew arrives at a pin
instead of an address, and the regulator finally gets evidence. It is an
observability problem with a straightforward engineering answer — and nobody in
Zambia is currently solving it at the tank layer.

---

# Part 1 — Background

## 1.1 Where the water goes

Water in a Zambian city travels a long way: river or borehole → treatment works →
trunk main → booster station → reservoir → distribution main → street → customer
meter → tap. The utility's income is counted **at the very last step**. Everything
that disappears before the meter earns the utility nothing.

That gap between "water produced" and "water billed" has a name: **non-revenue
water**, or NRW. It has three causes:

| Cause | What it looks like in the field | Rough share |
|---|---|---|
| **Physical losses** | Bursts, joint failures, leaking valves, overflowing tanks | The bulk of it |
| **Commercial losses** | Meter errors, illegal connections, unbilled supply | A meaningful slice |
| **Unbilled authorised use** | Kiosks, standpipes, public taps | Smaller but legitimate |

The engineering point is simple: **the first two are invisible without
measurement.** A burst main under a road in Matero does not announce itself. It
shows up as a number on a monthly report — after the water is gone.

## 1.2 How the loss is discovered today

1. **Someone complains.** They ring the utility, or a councillor, or post on
   Facebook, or use the national MyWatSan/Quickfix platform. The complaint is
   usually "there is no water", which does not tell a crew where the pipe broke.
2. **A crew drives past and notices.** Luck.
3. **A bill stops reconciling.** Monthly at best.
4. **An acoustic survey team walks the mains.** Effective, but a specialist team
   with vehicles covers only a few kilometres a week — and Zambia has thousands.

Each of these is *reactive*. Each starts the clock **after** the water has
already left the system.

## 1.3 The engineering reason it stays broken

Think about how software teams work. They don't guess whether a service is up;
they instrument it — metrics, logs, alerts, dashboards. **Water utilities operate
without that layer.** Concretely:

- **No sensor layer at the edge.** SCADA covers plants, not the 60-odd tanks and
  reservoirs scattered across a city.
- **No shared time-series of level and pressure.** Night-flow analysis needs
  continuous data; most utilities have monthly readings at best.
- **No structured field reports.** A phone call is unstructured, untraceable, and
  unlocatable.
- **No single source of truth.** Sensor data, complaints, and billing live in
  different systems, often on different people's laptops.
- **No audit trail for performance.** Which is precisely why utilities cannot
  demonstrate results to the regulator or to the programmes that fund them.

This is the developer framing of the problem, and it is the one that matters:
**you cannot fix a system you cannot see, and you cannot prove you fixed it
without a log.**

## 1.4 The consequence, in money and in people

- **57%** of sector water is lost (2023) against a "good" benchmark of **under
  20%**. In 2023 the regulator left the best-NRW award **vacant** — nobody
  qualified.
- The average utility spends **K12.61** delivering a cubic metre it sells for
  **K7.90**. Losing water means losing money twice.
- National revenue lost to NRW: about **ZMW 1 billion a year**, roughly twice the
  benchmark figure.
- Lusaka produces **350,000 m³/day** against **480,000** needed — and in the 2025
  drought, about **265,000**. Load-shedding has cut supply hours from 18 to 10.
- Roughly **70%** of Lusaka's residents live in unplanned or peri-urban
  settlements — the places least instrumented and last served.
- The MCC-funded leak-detection programme in Lusaka was independently evaluated
  and found **no change in NRW**, partly because "the culture of not prioritising
  leaks" persisted and the detection tools were left unfinished. Money alone did
  not fix it; **a workflow** was missing.

Put plainly: this is not a technology curiosity. It is a public-health issue, a
financial sustainability issue, and — during a drought — a water-security issue.

---

# Part 2 — Problem statement

> **Zambian water utilities have no continuous, actionable view of the water in
> their own distribution networks.** Between the district meter and the customer
> tap, losses are detected late, reported informally, and recorded nowhere. The
> result is that more than half of treated water is lost, utilities cannot afford
> the water they do deliver, and neither the regulator nor funders can verify
> performance — because no trustworthy data exists.

Broken into the four things that must be fixed:

| # | Problem | Consequence |
|---|---|---|
| **P1** | No telemetry at tank/reservoir level | Leaks and overflows run for days; nobody sees a level curve that shouldn't be there |
| **P2** | Resident reports are unstructured and unlocatable | Crews hunt; duplicate reports; no severity; no proof of resolution |
| **P3** | Signals live in different places | Operators cannot connect "tank dropping fast" with "three complaints from Chilenje" |
| **P4** | No auditable record of response | Utilities can't prove improvement to NWASCO or to results‑based funders |

Everything in the system below maps to one of those four.

---

# Part 3 — The solution

**SmartWater Zambia** is a monitoring and reporting platform made of four layers.

### Layer 1 — Sense (field hardware)

An **ESP32** microcontroller with an **ultrasonic level sensor** mounted over a
tank, reservoir, or sump. It measures the distance to the water surface every few
seconds and converts that into depth and percentage. It costs roughly **$30–45**
in parts, runs on mains or solar, and posts readings over Wi‑Fi or mobile data.

It is deliberately **retrofit**: it bolts onto assets the utility already owns. It
does not wait for a metering programme, a pipe replacement, or a tender.

### Layer 2 — Receive (backend)

A Node + Express API on Postgres (Supabase) accepts signed telemetry, stores the
time series, and runs the rules that matter:

- **Threshold transitions** — level crossing low/critical raises an alert once,
  not every reading.
- **Heartbeat monitoring** — a device that goes silent is itself an incident.
- **Realtime push** — dashboards update over Server-Sent Events, no refreshing.
- **Role-based access** — admins see everything; technicians see their work;
  customers see their own reports and public data.

### Layer 3 — Report (the people layer)

This is the part most systems miss. Residents are the densest sensor network a
utility has — millions of pairs of eyes — but only if their reports are usable.

In the **Android app** (and on the mobile web), a customer taps *Report a leak*.
The app:

1. Captures **live GPS** with an accuracy figure, automatically.
2. Opens the **camera** so the photo is evidence, not description.
3. Takes a category (burst pipe, pipe leak, no water, water quality, tank
   malfunction, other), a title and a note.
4. Submits to the same API as the sensors.

The admin then sees that report **pinned on the map**, with the photo and a
one-tap **Directions** link into Google Maps. The crew no longer drives to a
neighbourhood — it drives to a point.

### Layer 4 — Act (dashboards)

A React web dashboard for the utility control room:

- **Live dashboard** — tanks, levels, status, alerts, activity.
- **Incident map** — every tank and every community report, geographically.
- **Alerts centre** — acknowledge, escalate, resolve, with who and when.
- **Community reports** — full detail, photo, coordinates, accuracy, workflow
  status (pending → in progress → resolved / rejected).
- **Tank analytics** — level history per site, patterns, consumption.
- **Team & roles** — an admin promotes a technician, demotes a customer, and the
  permissions follow immediately.
- **Hardware simulator** — for demos and training when real hardware isn't on
  the bench.

---

## 3.1 A night in the life of the system

*02:14* — A 45 m³ tank in Chilenje starts losing level faster than any household
draw can explain. The ultrasonic sensor keeps posting.

*02:21* — The backend sees the level fall through a threshold it should not have
crossed. **Alert raised.** A technician's phone buzzes.

*02:26* — A resident nearby opens the app, taps *Report a leak*, allows location,
photographs water running across the road, submits. The pin lands 400 m from the
tank.

*02:28* — On the dashboard, the operator sees two things at once: a tank draining
and a fresh report at the same coordinates. **That correlation is the whole
product.** Two weak, separate signals become one confident conclusion.

*06:40* — The crew, with directions already in hand, closes the valve on a failed
joint. The technician marks the report *resolved* with a second photo.

*06:41* — The record exists: timestamp, coordinates, photo, who acted, how long it
took. That record is water saved — and evidence a utility can show a regulator.

---

## 3.2 Why this design, and not the alternatives

| Alternative | Why it doesn't fit Zambia |
|---|---|
| **Smart water meters for everyone** | Excellent data, but a per-customer cost and a years-long rollout. Lusaka's programme targets 64,415 properties at a time — meanwhile 57% leaks. |
| **Acoustic leak surveys** | Skilled and thorough, but labour-bound. Tried at scale under MCC in Lusaka with no measured NRW improvement. |
| **Prepaid meters** | Two Zambian utilities abandoned their programmes — sticking valves, 2–3 year battery life, no local support. |
| **Replacing pipes** | The right long-term answer, delivered over decades. |
| **A better complaint hotline** | Improves the inbox, not the visibility. No telemetry, no correlation, no proof. |
| **Enterprise smart-water suites (Itron, Xylem, Grundfos)** | Priced and designed for large utilities with reliable power and connectivity; little localisation for peri-urban 2G and load-shedding. |

SmartWater Zambia's bet: **instrument the cheapest layer that still changes the
outcome** — the tank — and add the people layer on top. Fast to deploy, cheap to
scale, and honest about what it does and does not replace.

---

# Part 4 — Why it matters

### For a household
Water arrives when it should. Fewer days of dry taps. A visible way to be heard —
a report with a photo is much harder to lose than a phone call.

### For the utility
Water recovered is water sold. A single tank leaking 5 m³/day wastes about
**K14,400 a year** of billed water, before the pumping energy is counted. Add
fewer emergency callouts, faster repair times, and a board-ready picture of the
network. This is the difference between reacting to complaints and running an
asset.

### For the regulator and the ministry
NWASCO currently assesses performance largely through annual self-reporting.
Continuous, comparable data would let it **name and shame with evidence** — and
identify the utilities genuinely improving. The National NRW Strategy and the
WASH Compact both call for exactly this and currently have no instrument to
deliver it.

### For funders
Zambia has moved decisively toward **results-based financing**: the World Bank's
**US$33m** growth-centres programme pays partly on disbursement-linked
indicators, and the **US$2.1bn WASH Compact 2026–2030** is built on a
results-based monitoring framework. Every one of those programmes is
**desperate for verifiable data**. The platform is the missing measurement layer
under the money.

### For Zambian engineering
A locally built, locally maintainable stack — ESP32, Node, Postgres, React,
Kotlin — running on infrastructure that costs almost nothing at pilot scale. It
can be installed by a technician with a drill and a phone, repaired by swapping a
$10 sensor, and taught in a week.

---

# Part 5 — Where it stands today

Built and working:

- ✅ Live telemetry ingestion with API-key authentication, threshold alerting,
  heartbeat/offline detection, and realtime dashboard push.
- ✅ Web dashboard: live levels, incident map, alerts, analytics, community
  reports, team and roles.
- ✅ Android app: Google sign-in (server-verified), live map, my reports,
  notifications, and photo + GPS leak reporting.
- ✅ Role model enforced end to end: admin, technician, customer.
- ✅ Deployed on a free-tier stack (Cloudflare Pages, Render, Supabase) so a
  pilot has essentially no standing infrastructure cost.

Next, and the point of this document:

1. **A 10-tank pilot** with a Zambian utility in a peri‑urban service area.
2. **Baseline-and-verify**: measure detection latency, water saved, and report
   quality before and after.
3. **Publish the result** — the sector is starved of local evidence, and one good
   Zambian case study travels further than any brochure.

---

## The one-line version

> **Half of Zambia's water disappears between the treatment works and the tap,
> because nobody is watching that stretch. We built the watching — sensors on the
> tanks, a camera and a GPS in every customer's pocket, and one dashboard that
> turns both into water saved.**

---

### Key sources

NWASCO Water Supply & Sanitation Sector Report (2023/24) · Ministry of Water
Development & Sanitation, *National Non-Revenue Water Management Strategy
2022–2026* · Ministerial Statement on Lusaka water supply, June 2025 · MCC /
Mathematica evaluation of the Lusaka WASH project · World Bank *Zambia WSS
Growth Centres* (US$33m PforR) · *Water Forward — Zambia Water Compact
2026–2030* · MyWatSan / NWASCO complaint channels. Full citations and pricing
detail: see `BUSINESS_CASE.md`.
