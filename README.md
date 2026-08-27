# BalanceVision — System, Data & Analytical Manual

**AI-Assisted Single-Leg Balance Assessment Web Application**

BalanceVision is a browser-based, computer-vision-assisted screening and performance-assessment tool for the Single-Leg Balance (single-leg stance) test. It uses the Google MediaPipe Pose Landmarker to derive movement metrics from a live camera feed and produces an application-generated stability score, age-referenced comparisons, and optional cloud data collection.

> **BalanceVision is a computer-vision-assisted screening / performance-assessment application. It is not a clinical diagnostic device.** All outputs are estimates derived from 2D camera landmarks and should be interpreted as part of a broader assessment, never as a standalone diagnosis or fall-risk prediction.

> **Quick access** — Application: https://aaron-chen-angus.github.io/BalanceVision/ · Live Results Sheet: https://docs.google.com/spreadsheets/d/1Ly_4NAyrZkuKwGuYUwez3qEGAnNIMqvMMrOOABXbgLE/ (full details in §2).

---

## 1. BalanceVision Overview

### Purpose
BalanceVision measures how long and how steadily a person can stand on one leg, and quantifies the quality of their postural control using computer vision instead of wearable sensors or a force platform. It is designed for educational, wellness, fitness, community-care, and screening contexts.

### Intended users
- Coaches, teachers, and community/wellness practitioners running balance screening
- Researchers collecting single-leg stance data at scale
- Individuals performing self-assessment with an assistant/operator
- Programmes assessing children/youth movement profiles (non-diagnostic)

### The Single-Leg Balance Test procedure
1. The participant stands with hands on hips.
2. One leg (the "test leg") is raised off the ground; the opposite leg becomes the **support leg**.
3. The participant holds the single-leg stance for as long as possible, up to a chosen maximum duration (30, 45, or 60 s).
4. The test ends when the operator presses **STOP** (on observing a fault) or the maximum duration timer elapses.

### Role of MediaPipe Pose Landmarker
BalanceVision loads the MediaPipe Tasks-Vision **Pose Landmarker (lite, float16)** model in the browser (`runningMode: 'VIDEO'`, single pose). Each camera frame yields 33 body landmarks in normalized image coordinates (`x`, `y` in 0–1, plus `z` and `visibility`). BalanceVision uses landmarks 11–32 (shoulders, elbows, wrists, hips, knees, ankles, heels, foot indices) to compute all metrics. Video frames are processed on-device and are never stored or uploaded.

### How the assessment is conducted
`HOME → SETUP → CAMERA → CALIBRATING → TESTING → COMPLETED → RESULTS`

- **Setup** collects participant details.
- **Camera** performs a live positioning checklist (person detected, full body visible, hands on hips, correct leg raised) and enables the START button only when all checks pass.
- **Calibrating** captures a 1-second baseline (`calibrationDurationMs = 1000`) of averaged landmark positions.
- **Testing** records per-frame metrics and shows a live timer plus informational warnings.
- **Completed → Results** finalizes metrics, saves locally, optionally submits to Google Sheets, and renders the results screen.

### Participant setup
The operator enters: Participant ID/nickname, age, sex (optional), test leg (raised leg), trial number, maximum duration, and participant type (adult / older adult / child). A safety checklist is shown, with an extra note for older adults.

### Test termination logic
- **The test does not auto-stop on faults.** Fault conditions (foot lowering, hands off hips, legs touching, major correction) are detected and shown as live warnings only.
- The test ends when:
  - the **operator presses STOP** → `terminationReason = "Stopped by assessor"`, or
  - the **elapsed time reaches the max duration** → `terminationReason = "Test completed successfully: <N> seconds"`.
- Tracking loss beyond `trackingLostTimeoutMs` (2000 ms) emits a `trackingTimeout` warning to the operator but does not itself stop the test.

### Metrics calculated
Balance duration, torso tilt (mean/max/SD), mediolateral (lateral) sway (mean/max/RMS/SD), torso angular velocity (mean/peak/RMS), supporting-knee angle and variability, pelvic (hip-line) tilt and variability, raised-leg positional variability, corrective-movement count, a sway classification, and a composite stability score (0–100) with a performance label.

### Results generated
A primary duration card, the composite stability score and performance label, a balance screening result (adults) or movement profile (children), age-reference comparison (adults), a 10-second indicator (age ≥ 50), side-to-side comparison, per-metric cards, sport movement profile (children), and charts (stability-over-time, body-sway trace, left-vs-right).

### Local storage and Google Sheets data collection
Every completed test is saved to browser `localStorage` under the key `balancevision_results`. If a webhook URL is configured, the same result object is also POSTed to Google Sheets. Users can export local history to CSV or delete it at any time.

### Application limitations
2D camera landmarks are estimates; accuracy depends on lighting, camera angle, occlusion, and device performance. Sway and stability values are **camera-derived proxies**, not force-platform Centre of Pressure. The composite stability score is an application-generated indicator that has not been clinically validated. See Sections 14 and 15.

---

## 2. Application and Data Access

**Application URL**
https://aaron-chen-angus.github.io/BalanceVision/

**Live Results Dataset (Google Sheet)**
https://docs.google.com/spreadsheets/d/1Ly_4NAyrZkuKwGuYUwez3qEGAnNIMqvMMrOOABXbgLE/

The Live Results Google Sheet contains assessment results submitted from the deployed application. Each completed test attempts to POST its result object to a Google Apps Script Web App, which appends one row to the sheet.

**Submission is configurable, not mandatory.** The export is controlled by `CONFIG.googleSheetsWebhookUrl` in `config.js`. In the currently committed configuration this URL is populated, so completed tests are auto-submitted. If the value is cleared/empty, the app runs fully offline and results are kept only in the browser's local storage. Submission uses `fetch(..., { mode: 'no-cors' })`, so the browser cannot read the response — the app cannot confirm success or failure of the write from the client side.

---

## 3. System and Data Pipeline

### Architecture (stage by stage)

```
Participant
   │  (stands on one leg in front of a camera)
   ▼
Mobile / Web Camera  ──────────── getUserMedia() in app.js (on-device)
   │  (raw video frames, never stored/uploaded)
   ▼
MediaPipe Pose Landmarker ─────── loaded from CDN, runs on-device (GPU/WASM)
   │  (33 landmarks per frame: x,y,z,visibility, normalized)
   ▼
Landmark Processing ───────────── balance-engine.js
   │  (EMA smoothing, key-point extraction, midpoints, distances, angles)
   ▼
Balance Assessment Engine ─────── balance-engine.js (state: CALIBRATING/TESTING)
   │  (1s calibration baseline; per-frame torso tilt, knee/hip angles,
   │   fault detection, corrective-movement counting)
   ▼
Metric Calculation ────────────── balance-engine.js finalizeMetrics()
   │  (mean/SD/RMS/peak aggregates; composite stability score; labels)
   ▼
Results Object ────────────────── results.js saveResult() (31 fields)
   │
   ├──► Local Storage (localStorage key: balancevision_results)   [always]
   │
   └──► Google Apps Script Web App (fetch POST, no-cors)          [if configured]
              │
              ▼
        Google Sheet ("Results" tab) — the Live Results Dataset
              │
              ▼
        Statistical Analysis / R / R Shiny (read via CSV/gviz or googlesheets4)
```

### Where each stage occurs
- **Camera capture, MediaPipe inference, landmark processing, all metric calculation, scoring, and local storage happen entirely in the browser on the participant's device.**
- **Only the numeric results object** (never video or images) leaves the device, and only if a Google Sheets webhook is configured.
- **Statistical analysis / R Shiny** occurs downstream, reading from the Google Sheet.

### Data classification

| Category | Fields |
|----------|--------|
| **User-entered** | `participantId`, `age`, `sex`, `participantType`, `trialNumber`, and the selected test leg / max duration (test leg is stored as derived `supportLeg`) |
| **Automatically generated metadata** | `id`, `timestamp`, `terminationReason`, `supportLeg` (derived from the entered test leg) |
| **Computer-vision-derived (per frame, from MediaPipe landmarks)** | torso tilt, hip-line angle, support-knee angle, hip/shoulder midpoints, raised-leg ankle positions |
| **Calculated / derived metrics (aggregated over the test)** | `meanTorsoTilt`, `maxTorsoTilt`, `sdTorsoTilt`, `meanLateralSway`, `maxLateralSway`, `rmsLateralSway`, `sdLateralSway`, `meanAngularVelocity`, `peakAngularVelocity`, `rmsAngularVelocity`, `meanKneeAngle`, `kneeVariability`, `maxKneeDeviation`, `meanPelvicTilt`, `maxPelvicTilt`, `pelvicVariability`, `raisedLegVariability`, `correctiveMovements`, `duration` |
| **Scoring / classification** | `swayClassification`, `stabilityScore`, `performanceLabel` |
| **Google Sheets exported fields** | The complete 31-field result object (see Section 4) |

---

## 4. Comprehensive Data Dictionary

This dictionary lists **every field in the result object** built by `ResultsManager.saveResult()` in `results.js`. This exact object is written to `localStorage` **and** sent to Google Sheets by `sendToGoogleSheets(result)` (the full object is `JSON.stringify`-ed as the POST body). Rounding shown is applied in `saveResult()` via `round(value, decimals)`.

Coordinate note: MediaPipe landmark `x`/`y` are **normalized to the image (0–1)**, with `y` increasing downward. "Normalized" units below are dimensionless ratios; several sway metrics are additionally scaled by calibration `shoulderWidth` or `bodyHeight`.

| Field Name | Data Type | Unit / Format | Description | Source / Calculation |
|------------|-----------|---------------|-------------|----------------------|
| `id` | String | base36 token | Unique record identifier | Generated: `Date.now().toString(36) + random` (`generateId()`) |
| `participantId` | String | free text | Participant ID or nickname | User-entered (Setup form) |
| `age` | Integer | years | Participant age | User-entered; `parseInt`, form min 5 / max 120 |
| `sex` | Categorical | `male` \| `female` \| `other` \| `''` | Participant sex (optional) | User-entered; does not affect scoring |
| `participantType` | Categorical | `adult` \| `older_adult` \| `child` | Participant category (drives which result panels show) | User-entered |
| `supportLeg` | Categorical | `left` \| `right` | The **support** (standing) leg | Derived: opposite of the user-selected test/raised leg (`testLeg === 'left' ? 'right' : 'left'`) |
| `trialNumber` | Integer | count | Trial index for this participant/session | User-entered; `parseInt`, default 1 |
| `duration` | Numeric | seconds (1 dp) | Balance duration held | `(performance.now() − testStartTime)/1000`, rounded to 1 dp in `finalizeMetrics` |
| `terminationReason` | String | text | Why the test ended | `"Stopped by assessor"` or `"Test completed successfully: <max> seconds"` |
| `meanTorsoTilt` | Numeric | degrees (1 dp) | Mean torso deviation from vertical | Mean of per-frame torso-tilt series (see §5) |
| `maxTorsoTilt` | Numeric | degrees (1 dp) | Peak torso tilt during test | `Math.max` of torso-tilt series |
| `sdTorsoTilt` | Numeric | degrees (2 dp) | SD of torso tilt (variability) | Sample SD (n−1) of torso-tilt series |
| `meanLateralSway` | Numeric | normalized ratio (3 dp) | Mean absolute mediolateral hip displacement | Mean of `abs((hipMid.x − cal.hipMid.x)/cal.shoulderWidth)` |
| `maxLateralSway` | Numeric | normalized ratio (3 dp) | Max absolute mediolateral hip displacement | `Math.max` of the absolute lateral displacement series |
| `rmsLateralSway` | Numeric | normalized ratio (3 dp) | RMS of mediolateral hip displacement | `sqrt(mean(displacement²))` of the signed lateral series |
| `sdLateralSway` | Numeric | normalized ratio (3 dp) | SD of mediolateral hip displacement | Sample SD (n−1) of the signed lateral series |
| `swayClassification` | Categorical | `Low Sway` \| `Moderate Sway` \| `High Sway` | Categorical banding of lateral sway | From `rmsLateralSway` vs `CONFIG.swayClassification` (low<0.02, moderate<0.05, else high) |
| `meanAngularVelocity` | Numeric | degrees/second (1 dp) | Mean rate of torso-tilt change | Mean of per-frame `abs(Δtilt)/Δt` |
| `peakAngularVelocity` | Numeric | degrees/second (1 dp) | Maximum instantaneous angular velocity | `Math.max` of the angular-velocity series |
| `rmsAngularVelocity` | Numeric | degrees/second (1 dp) | RMS of angular velocity | `sqrt(mean(angVel²))` |
| `meanKneeAngle` | Numeric | degrees (1 dp) | Mean support-knee angle | Mean of per-frame support-knee angle (hip–knee–ankle) |
| `kneeVariability` | Numeric | degrees (2 dp) | SD of support-knee angle | Sample SD (n−1) of support-knee-angle series |
| `maxKneeDeviation` | Numeric | degrees (1 dp) | Max deviation of knee angle from calibration baseline | `Math.max(abs(kneeAngle − cal.supportKneeAngle))` |
| `meanPelvicTilt` | Numeric | degrees (1 dp) | Mean absolute hip-line angle | Mean of `abs(hipAngle)` (hip-line vs horizontal) |
| `maxPelvicTilt` | Numeric | degrees (1 dp) | Max absolute hip-line angle | `Math.max(abs(hipAngle))` |
| `pelvicVariability` | Numeric | degrees (2 dp) | SD of hip-line angle | Sample SD (n−1) of the signed hip-line-angle series |
| `raisedLegVariability` | Numeric | normalized (3 dp) | Positional variability of the raised-leg ankle | `SD(raised ankle x) + SD(raised ankle y)` (normalized image coords) |
| `correctiveMovements` | Integer | count | Number of distinct balance corrections | Event count from `detectCorrectiveMovement()` (threshold + cooldown; see §5) |
| `stabilityScore` | Integer | 0–100 | Composite application-generated stability score | Weighted sum of 6 sub-scores (see §5/§6); rounded, clamped 0–100 |
| `performanceLabel` | String | text | Verbal performance band | From `stabilityScore` vs `CONFIG.performanceLabels` (Strong ≥75, Moderate ≥40, Limited <40) |
| `timestamp` | DateTime | ISO 8601 string | Time the result was saved | `new Date().toISOString()` |

**Total fields in the result object / Google Sheets payload: 31.**

### Data Dictionary Validation
This dictionary has been checked field-by-field against the actual Google Sheets submission payload. In `results.js`, `sendToGoogleSheets(result)` is called with the same `result` object returned by `saveResult()`, and it sends `JSON.stringify(result)` as the POST body. There is **no field filtering or renaming** between the local record and the Google Sheets payload — therefore all 31 fields listed above are exported.

**Variables calculated but NOT exported to Google Sheets:**
- Per-frame time-series arrays held in `engine.testData` (`timestamps`, `torsoTilts`, `hipMidpoints`, `shoulderMidpoints`, `angularVelocities`, `kneeAngles`, `pelvicTilts`, `raisedLegPositions`). These drive the charts and the aggregate metrics but are never persisted or exported (historical results viewed later show no charts for this reason).
- `calibrationData` (baseline torso length, shoulder width, midpoints, baseline knee/hip angles, body height) — used internally only.
- Live fault-warning flags (`foot_lowering`, `hands_moving`, `legs_close`, `major_movement`) — shown to the operator during the test but not stored.
- The Apps Script also receives the exported `maxDuration` only indirectly, embedded inside the `terminationReason` string; `maxDuration` itself is **not** a separate exported field.

> The Google Apps Script (see §12) writes rows keyed to whatever headers exist in the sheet's Row 1. If the sheet header order differs from the object key order, values are still mapped by header name (`headers.map(h => data[h] || '')`). Ensure sheet headers match the 31 field names above exactly.

---

## 5. BalanceVision Metrics and Calculations

All metrics derive from MediaPipe landmarks after exponential-moving-average smoothing (`smoothingAlpha = 0.3`, applied only to landmarks with `visibility ≥ 0.5`). Key derived points: `shoulderMid = midpoint(L/R shoulder)`, `hipMid = midpoint(L/R hip)`, `shoulderWidth = dist2D(L,R shoulder)`, `torsoLength = dist2D(shoulderMid, hipMid)`.

### Balance duration (`duration`)
- **Purpose:** Primary outcome — how long single-leg stance is held.
- **Landmarks:** None directly (wall-clock timing of the TESTING state).
- **Method:** `(performance.now() − testStartTime) / 1000`, capped at the selected max duration.
- **Unit:** seconds. **Interpretation:** longer = better balance endurance.
- **Limitations:** Bounded by the chosen max (30/45/60 s); the operator's reaction time to fault events affects when STOP is pressed.

### Torso tilt (`meanTorsoTilt`, `maxTorsoTilt`, `sdTorsoTilt`)
- **Purpose:** Upright postural control of the trunk.
- **Landmarks:** shoulder midpoint (11,12) and hip midpoint (23,24).
- **Method:** `torsoVector = shoulderMid − hipMid`; `angleFromVertical(vector)` = angle (deg) between the torso vector and screen-vertical (0,−1). Aggregated as mean, max, and sample SD.
- **Unit:** degrees. **Interpretation:** lower mean/SD = steadier trunk.
- **Limitations:** 2D projection; tilt toward/away from camera is under-represented.

### Mediolateral (lateral) sway (`meanLateralSway`, `maxLateralSway`, `rmsLateralSway`, `sdLateralSway`)
- **Purpose:** Side-to-side body-sway proxy.
- **Landmarks:** hip midpoint (23,24); calibration baseline `hipMid` and `shoulderWidth`.
- **Method:** per-frame `latDisp = (hipMid.x − cal.hipMid.x) / cal.shoulderWidth`. Mean/max use `abs(latDisp)`; RMS and SD use the signed series.
- **Unit:** normalized ratio (body-scaled, dimensionless). **Interpretation:** lower = less sway.
- **Limitations:** This is a **camera-derived body-sway proxy, not force-platform Centre of Pressure (COP).** Normalizing by shoulder width partly controls for distance from camera but not for camera angle.

### Torso angular velocity (`meanAngularVelocity`, `peakAngularVelocity`, `rmsAngularVelocity`)
- **Purpose:** Speed of trunk oscillation (jerkiness of correction).
- **Landmarks:** derived from the torso-tilt series.
- **Method:** per-frame `abs(tiltₙ − tiltₙ₋₁) / Δt`; aggregated as mean, peak (`Math.max`), and RMS.
- **Unit:** degrees/second. **Interpretation:** lower = smoother control.
- **Limitations:** Sensitive to frame rate and landmark jitter despite smoothing.

### Supporting-knee stability (`meanKneeAngle`, `kneeVariability`, `maxKneeDeviation`)
- **Purpose:** Stability of the standing (support) knee.
- **Landmarks:** support-side hip, knee, ankle (23/24, 25/26, 27/28).
- **Method:** `angleBetweenPoints(hip, knee, ankle)` per frame. `kneeVariability` = sample SD; `maxKneeDeviation` = max abs deviation from calibration baseline `supportKneeAngle`.
- **Unit:** degrees. **Interpretation:** lower variability/deviation = steadier support limb.

### Pelvic stability (`meanPelvicTilt`, `maxPelvicTilt`, `pelvicVariability`)
- **Purpose:** Frontal-plane pelvic control.
- **Landmarks:** left hip (23) and right hip (24).
- **Method:** `hipAngle = atan2(rightHip.y − leftHip.y, rightHip.x − leftHip.x)` in degrees (hip line vs horizontal). Mean/max use `abs`; `pelvicVariability` = sample SD of signed series.
- **Unit:** degrees. **Interpretation:** lower = level, stable pelvis.

### Raised-leg stability (`raisedLegVariability`)
- **Purpose:** How still the raised (non-support) leg is kept.
- **Landmarks:** raised-side ankle (27 or 28).
- **Method:** `SD(raised ankle x) + SD(raised ankle y)` over the test (normalized image coords).
- **Unit:** normalized (sum of two SDs). **Interpretation:** lower = steadier raised leg.

### Corrective movements (`correctiveMovements`)
- **Purpose:** Count of discrete balance corrections.
- **Landmarks:** hip midpoint, shoulder midpoint, torso tilt, vs calibration baseline and `bodyHeight`.
- **Method:** A correction is *entered* when `hipDisp` or `shoulderDisp` (displacement / bodyHeight) exceeds `correctiveMovementThreshold` (0.06) or `abs(torsoTilt − baseTorsoTilt) > 8°`, respecting a `correctiveMovementCooldownMs` (650 ms). It is *counted* when the body returns below threshold (a completed correction cycle).
- **Unit:** count. **Interpretation:** fewer = steadier.

### Sway classification (`swayClassification`)
- **Method:** banding of `rmsLateralSway`: `< 0.02` → Low, `< 0.05` → Moderate, else High (`CONFIG.swayClassification`).
- **Unit:** categorical.

### Composite stability score (`stabilityScore`) and performance label
See Section 6. **This is an application-generated composite, not a validated clinical measure.**

### Left–right asymmetry (results-screen only)
- **Purpose:** Compare best duration on each support leg for one participant.
- **Method:** `getSideComparison()` uses best `duration` per side: `absoluteDifference = |left − right|`, `percentageDifference = |left − right| / mean(left,right) × 100`.
- **Note:** Computed on the results/history screen from stored records; it is **not** a stored/exported field.

> **COP disclaimer:** BalanceVision does not measure force-platform Centre of Pressure. All "sway" values are body-landmark displacement proxies derived from a single camera and should not be equated with COP metrics.

---

## 6. Scoring and Interpretation

### Composite stability score (`stabilityScore`, 0–100)
Computed in `calculateStabilityScore(duration)`. Six sub-scores are each mapped to 0–100 and combined with the weights in `CONFIG.scoreWeights`:

| Sub-score | Formula | Weight |
|-----------|---------|--------|
| Duration | `min(100, (duration / maxDuration) × 100)` | 0.50 |
| Torso stability | `max(0, 100 − meanTorsoTilt × 8)` | 0.15 |
| Angular stability | `max(0, 100 − meanAngularVelocity × 2)` | 0.10 |
| Knee stability | `max(0, 100 − kneeVariability × 10)` | 0.10 |
| Pelvic stability | `max(0, 100 − pelvicVariability × 10)` | 0.10 |
| Corrective movements | `max(0, 100 − correctiveCount × 15)` | 0.05 |

`stabilityScore = round(clamp(Σ subScore × weight, 0, 100))`. Duration dominates (50% of the score).

### Performance label (`performanceLabel`)
From `CONFIG.performanceLabels`:

| Score | Label |
|-------|-------|
| ≥ 75 | Strong single-leg balance performance |
| ≥ 40 | Moderate single-leg balance performance |
| < 40 | Limited single-leg balance performance |

### Balance screening result (adults, results screen)
`getBalanceScreeningResult()` maps the same score bands to a screening sentence. If `stabilityScore < 30` **and** `age ≥ 60`, an advisory sentence recommends discussing balance/strength/fall-prevention with a qualified professional.

### Age-based comparison (`referenceValues`)
Shown only for age ≥ 18. Best-trial duration is compared to eyes-open, best-of-three single-leg-stance reference values (`CONFIG.referenceValues`):

| Age group | Reference (s) |
|-----------|---------------|
| 18–39 | 44.7 |
| 40–49 | 41.9 |
| 50–59 | 41.2 |
| 60–69 | 32.1 |
| 70–79 | 21.5 |
| 80+ | 9.4 |

The result is described as "above / around / below reference" (`|diff| < 2 s` = around). These values are stated in code as "published normative data for single-leg stance"; the exact primary source is not cited in the code — **requires verification from implementation owner** before scientific reporting. Published normative/meta-analytic ranges vary substantially by protocol (see §5/§12/§14).

### 10-second indicator (age ≥ 50)
`getTenSecondIndicator()` reports Completed / Not Completed for `duration ≥ 10 s`, with explanatory text that it is a studied health/functional indicator, **not** an individual diagnosis or prediction. (Relates to Araujo et al., 2022 — see §12.)

### Left–right difference
Percentage difference between best left- and right-support durations (see §5). Not diagnostic.

### Sport movement profile (children/youth only)
`getSportProfile()` assigns one of four non-diagnostic profiles (`CONFIG.sportProfiles`) from `stabilityScore`, `correctiveMovements`, `pelvicVariability`, and side-to-side asymmetry (>25% → Movement Symmetry Focus). These are exploratory suggestions, **not** talent identification.

> **Validation statement:** The stability score, sway classification, performance labels, and sport profiles are application-generated composites created for this tool. They are **not clinically validated** and no claim of clinical validity is made.

---

## 7. Statistical Analysis Opportunities

All suggestions below use only fields actually collected by BalanceVision (see §4). Continuous sway/variability fields are body-scaled normalized ratios, not physical units — treat them as relative measures.

### 7.1 Descriptive Statistics

| Analysis | Field(s) |
|----------|----------|
| Number of assessments | count of rows (`id`) |
| Participant age distribution | `age` |
| Mean / median balance duration | `duration` |
| SD, IQR, min/max of duration | `duration` |
| Distribution of termination reasons | `terminationReason` |
| Mean torso tilt | `meanTorsoTilt` (also `maxTorsoTilt`, `sdTorsoTilt`) |
| Mean sway | `meanLateralSway`, `rmsLateralSway` |
| Sway class frequencies | `swayClassification` |
| Mean angular velocity | `meanAngularVelocity`, `peakAngularVelocity` |
| Corrective movements | `correctiveMovements` |
| Stability score distribution | `stabilityScore`, `performanceLabel` |
| Knee/pelvic variability | `kneeVariability`, `pelvicVariability` |

Report central tendency (mean/median), spread (SD/IQR), and range for each continuous field; frequencies/proportions for categorical fields (`sex`, `participantType`, `supportLeg`, `swayClassification`, `performanceLabel`, `terminationReason`).

### 7.2 Group Comparisons
Available grouping variables: `participantType`, `sex`, `supportLeg`, `swayClassification`, age groups derived from `age`.

| Comparison | Outcome | Suggested test |
|------------|---------|----------------|
| Duration by age group | `duration` | One-way ANOVA (if normal) or Kruskal–Wallis |
| Male vs female | `duration`, `stabilityScore` | Independent-samples t-test or Mann–Whitney U |
| Participant type (adult/older/child) | `duration`, `stabilityScore` | One-way ANOVA or Kruskal–Wallis |
| Tested (support) leg | `duration` | t-test / Mann–Whitney (unpaired) or paired if linkable (§7.3) |
| Sway class × age group | `swayClassification`, age group | Chi-square test of association |

Use t-test/ANOVA when normality and (approximately) equal variances hold; otherwise use Mann–Whitney U / Kruskal–Wallis. Use chi-square for two categorical variables (expected cell counts ≥ 5).

### 7.3 Left-versus-Right / Within-Participant Analysis
Records can be linked by `participantId` and split by `supportLeg`. If the same participant has both left- and right-support records:

- **Paired t-test** or **Wilcoxon signed-rank test** on `duration` (left vs right).
- **Side-to-side % difference**: `|left − right| / mean(left,right) × 100` — quantifies asymmetry.
- **Bland–Altman** analysis of left vs right `duration` (or `stabilityScore`) to visualize agreement/bias between sides.

These answer: "Is there a systematic left/right balance asymmetry within participants?"

### 7.4 Correlation and Association Analysis

| Relationship | Fields | Method |
|--------------|--------|--------|
| Duration vs age | `duration`, `age` | Pearson (if linear/normal) or Spearman |
| Duration vs sway | `duration`, `rmsLateralSway` | Spearman (sway typically skewed) |
| Duration vs angular velocity | `duration`, `meanAngularVelocity` | Spearman |
| Stability score vs corrective movements | `stabilityScore`, `correctiveMovements` | Spearman |
| Torso tilt vs sway | `meanTorsoTilt`, `rmsLateralSway` | Pearson/Spearman |
| Age vs stability metrics | `age`, `stabilityScore`/`kneeVariability` | Spearman |

Use Pearson when both variables are continuous, roughly linear, and normal; use Spearman rank correlation otherwise. **Correlation does not imply causation.**

### 7.5 Regression Analysis
With sufficient sample size (rule of thumb ≥ 10–15 observations per predictor):

- **Simple / multiple linear regression** for continuous outcomes, e.g.
  `duration ~ age + rmsLateralSway + meanAngularVelocity + correctiveMovements`
  or `stabilityScore ~ age + sex + participantType`.
- **Logistic regression** only if a valid binary outcome is defined, e.g. the derived `duration ≥ 10 s` (10-second indicator) as the dependent variable predicted by `age`, `sex`, sway metrics. Note: `stabilityScore` already embeds `duration`, so avoid using both as predictor/outcome together (collinearity/circularity).

Only variables listed in §4 (plus derived age groups / 10-second flag) should be used.

### 7.6 Repeated Measures / Longitudinal Analysis
`participantId` + `trialNumber` + `timestamp` allow repeated observations per participant:

- **Change scores** between trials (e.g. Trial 2 − Trial 1 `duration`).
- **Paired analyses** across trials (paired t / Wilcoxon).
- **Repeated-measures ANOVA** for ≥ 3 trials under balanced designs.
- **Linear mixed-effects models** (random intercept for `participantId`) for unbalanced repeated data — the most flexible option.

Sufficient repeated observations per participant are required; sparse or single-trial participants limit these analyses.

### 7.7 Data Quality and Assumption Checking
Before analysis, check: missing values (empty `sex`, missing fields), duplicate submissions (identical `participantId` + `timestamp`), outliers/impossible values (`age` < 5 or > 120, negative `duration`, extreme angular velocity), normality (Shapiro–Wilk / Q–Q plots), unequal variances (Levene's test), small sample sizes, multiple-testing inflation (adjust with Bonferroni/BH), and non-independence from repeated `participantId` (use mixed models). See §15.

---

## 8. Recommended Data Visualisations

All use real BalanceVision field names.

| Visualisation | Variables / Fields | Chart Type | Purpose / Interpretation |
|---------------|--------------------|------------|--------------------------|
| Participant age distribution | `age` | Histogram | Sample composition |
| Balance duration distribution | `duration` | Histogram | Spread/skew of primary outcome |
| Stability score distribution | `stabilityScore` | Histogram / density | Distribution of composite performance |
| Duration by age group | age group (from `age`), `duration` | Boxplot (grouped) | How balance declines with age |
| Left vs right duration | `supportLeg`, `duration` | Grouped/paired bar or dot plot | Side asymmetry |
| Duration vs age | `age` (x), `duration` (y) | Scatter + trend line | Association of age and balance |
| Sway vs duration | `rmsLateralSway` (x), `duration` (y) | Scatter | Whether steadier bodies balance longer |
| Torso tilt vs duration | `meanTorsoTilt` (x), `duration` (y) | Scatter | Trunk control vs endurance |
| Angular velocity vs duration | `meanAngularVelocity` (x), `duration` (y) | Scatter | Smoothness vs endurance |
| Corrective movement distribution | `correctiveMovements` | Bar / histogram | Frequency of corrections |
| Stability score vs corrective movements | `correctiveMovements` (x), `stabilityScore` (y) | Scatter | Consistency check of the score |
| Repeated performance | `trialNumber`/`timestamp` (x), `duration` (y), group by `participantId` | Line chart | Change over trials |
| Termination reason | `terminationReason` | Bar chart | Completed vs assessor-stopped mix |
| Participant-level profile | one `participantId`, all metrics | Radar / small-multiples | Individual balance profile |
| Sway class × participant type | `swayClassification`, `participantType` | Stacked bar | Category composition |

For scatterplots: **x** = candidate explanatory field, **y** = outcome (usually `duration` or `stabilityScore`); optional **grouping** by `sex`, `participantType`, or `supportLeg` (colour). Grouped boxplots use the categorical field on x and the continuous outcome on y.

### Recommended future R Shiny dashboard

> The following is a **recommendation for future development**, not part of the current application.

#### Dashboard Overview
KPI cards:
- Total Assessments (`count of id`)
- Mean Balance Duration (`duration`)
- Mean Stability Score (`stabilityScore`)
- Mean Corrective Movements (`correctiveMovements`)

#### Participant Profile
Individual assessment metrics for a selected `participantId` (all §4 fields, left/right, trial history).

#### Population Analysis
Distributions and group comparisons (`age`, `sex`, `participantType`, `supportLeg`).

#### Stability Relationships
Scatterplots and correlations among `duration`, `rmsLateralSway`, `meanAngularVelocity`, `meanTorsoTilt`, `stabilityScore`, `correctiveMovements`.

#### Repeated Assessments
Longitudinal `duration`/`stabilityScore` by `trialNumber`/`timestamp` per `participantId`.

Only components supported by the 31 exported fields are included.

---

## 9. Direct Integration with R

The live Google Sheet can be read directly into R. Sheet ID:

```
1Ly_4NAyrZkuKwGuYUwez3qEGAnNIMqvMMrOOABXbgLE
```

### Method A: Google Sheets CSV / GViz (public sheet)

```r
library(readr)

balance_data <- read_csv(
  "https://docs.google.com/spreadsheets/d/1Ly_4NAyrZkuKwGuYUwez3qEGAnNIMqvMMrOOABXbgLE/gviz/tq?tqx=out:csv"
)

head(balance_data)
str(balance_data)
summary(balance_data)
```

This works when the sheet is shared as "Anyone with the link can view".

### Method B: googlesheets4

```r
library(googlesheets4)

# Public sheet — no login needed
gs4_deauth()

balance_data <- read_sheet(
  "https://docs.google.com/spreadsheets/d/1Ly_4NAyrZkuKwGuYUwez3qEGAnNIMqvMMrOOABXbgLE/"
)
```

**Authentication:** If the sheet is private, remove `gs4_deauth()` and authenticate with `gs4_auth()` (OAuth) or a service-account token (`gs4_auth(path = "service-account.json")`), and share the sheet with that account's email.

> Column names in R will match the sheet's Row 1 headers, which should equal the 31 field names in §4 (e.g. `participantId`, `age`, `duration`, `stabilityScore`, `rmsLateralSway`, `correctiveMovements`, `supportLeg`, `timestamp`).

---

## 10. R Shiny Integration

GitHub does **not** need to be an intermediate data repository. Recommended pipeline:

```
BalanceVision → Google Sheets → R Shiny → Data Cleaning → Statistics → Interactive Visualisations
```

### Live-refresh data source

```r
balance_data <- reactive({
  invalidateLater(60000, session)   # refresh every 60 s
  readr::read_csv(
    "https://docs.google.com/spreadsheets/d/1Ly_4NAyrZkuKwGuYUwez3qEGAnNIMqvMMrOOABXbgLE/gviz/tq?tqx=out:csv",
    show_col_types = FALSE
  )
})
```

This re-reads the sheet periodically so the dashboard reflects new submissions.

### Example ggplot2 output (using real field names)

```r
library(ggplot2)

output$balancePlot <- renderPlot({
  df <- balance_data()
  ggplot(df, aes(x = age, y = duration)) +
    geom_point() +
    geom_smooth(method = "lm") +
    labs(x = "Age (years)", y = "Balance duration (s)")
})
```

Additional examples with real fields:

```r
# Duration by support leg
ggplot(df, aes(x = supportLeg, y = duration)) + geom_boxplot()

# Stability score vs corrective movements
ggplot(df, aes(x = correctiveMovements, y = stabilityScore)) +
  geom_point() + geom_smooth(method = "lm")

# Sway vs duration
ggplot(df, aes(x = rmsLateralSway, y = duration)) + geom_point()
```

**Roles:** Use **GitHub** for source control, app source code, R Shiny source code, and documentation. Use **Google Sheets** as the live data source. The Shiny app reads the Sheet directly at runtime — no need to commit data to GitHub.

---

## 11. Suggested R Shiny Dashboard

> Conceptual architecture for **future development**, built on the actual 31 exported fields. All tabs below are recommendations, not existing features.

**TAB 1 — Overview**
- Participant/assessment count (`id`)
- Mean / median balance duration (`duration`)
- Mean stability score (`stabilityScore`)
- Key distributions (`duration`, `stabilityScore`, `age`)

**TAB 2 — Participant Analysis**
- Select `participantId`
- Individual balance profile (all §4 metrics)
- Left/right comparison (`supportLeg`, `duration`)
- Trial history (`trialNumber`, `timestamp`, `duration`, `stabilityScore`)

**TAB 3 — Population Analysis**
- Age comparisons (age groups from `age`)
- Sex comparisons (`sex`) where available
- Participant-type comparisons (`participantType`)
- Distributions of continuous metrics

**TAB 4 — Movement Stability**
- Sway (`meanLateralSway`, `rmsLateralSway`)
- Torso tilt (`meanTorsoTilt`, `maxTorsoTilt`)
- Angular velocity (`meanAngularVelocity`, `peakAngularVelocity`)
- Corrective movements (`correctiveMovements`)

**TAB 5 — Statistical Analysis**
- Descriptive statistics tables
- Correlations (§7.4)
- Selected group comparisons (§7.2)

**TAB 6 — Data Explorer**
- Interactive, filterable table of the live Google Sheet (all 31 fields)

---

## 12. Key Scientific References Supporting BalanceVision

References are peer-reviewed journal articles, formatted in APA 7th edition. Each was verified against its source. Content describing each study was rephrased for compliance with licensing restrictions.

### Single-Leg Stance and Fall Risk / Health

- Araujo, C. G., de Souza e Silva, C. G., Laukkanen, J. A., Fiatarone Singh, M., Kunutsor, S. K., Myers, J., Franca, J. F., & Castro, C. L. B. (2022). Successful 10-second one-legged stance performance predicts survival in middle-aged and older individuals. *British Journal of Sports Medicine, 56*(17), 975–980. https://doi.org/10.1136/bjsports-2021-105360
  *Relevance:* Basis for BalanceVision's 10-second indicator; associates inability to hold a 10-second one-leg stance in mid/later life with higher all-cause mortality risk.

- Michikawa, T., Nishiwaki, Y., Takebayashi, T., & Toyama, Y. (2009). One-leg standing test for elderly populations. *Journal of Orthopaedic Science, 14*(5), 675–685. https://doi.org/10.1007/s00776-009-1371-6
  *Relevance:* Review supporting the one-leg standing test as a screening tool in community-dwelling older adults, while cautioning about evidence quality — reinforcing BalanceVision's non-diagnostic positioning.

### Postural Sway and Stability

- Johansson, J., Nordström, A., Gustafson, Y., Westling, G., & Nordström, P. (2017). Increased postural sway during quiet stance as a risk factor for prospective falls in community-dwelling elderly individuals. *Age and Ageing, 46*(6), 964–970. https://doi.org/10.1093/ageing/afx083
  *Relevance:* Prospective evidence that objective postural sway independently predicts incident falls — motivating BalanceVision's sway-related proxies while underscoring that force-platform sway differs from camera proxies.

- Piirtola, M., & Era, P. (2006). Force platform measurements as predictors of falls among older people — a review. *Gerontology, 52*(1), 1–16. https://doi.org/10.1159/000089820
  *Relevance:* Reviews force-platform (COP) sway as a fall predictor; clarifies that BalanceVision's camera-derived sway is a proxy, not equivalent to platform COP.

### Age-Related Balance Performance

- Springer, B. A., Marin, R., Cyhan, T., Roberts, H., & Gill, N. W. (2007). Normative values for the unipedal stance test with eyes open and closed. *Journal of Geriatric Physical Therapy, 30*(1), 8–15. https://doi.org/10.1519/00139143-200704000-00003
  *Relevance:* Peer-reviewed age-stratified normative single-leg-stance values (eyes open/closed, best-of-three) relevant to BalanceVision's age-reference comparison. The exact source of the app's stored reference numbers requires owner verification.

### Balance Test Diagnostic Accuracy (context for non-diagnostic positioning)

- Lima, C. A., Ricci, N. A., Nogueira, E. C., & Perracini, M. R. (2018). The Berg Balance Scale as a clinical screening tool to predict fall risk in older adults: A systematic review. *Physiotherapy, 104*(4), 383–394. https://doi.org/10.1016/j.physio.2018.02.002
  *Relevance:* Systematic review showing that even an established balance screening scale has limited/inconsistent predictive accuracy for falls, supporting BalanceVision's non-diagnostic stance and the "results are part of a broader assessment" message in §14.

### Computer Vision / Pose Estimation for Human Movement Assessment

- Needham, L., Evans, M., Cosker, D. P., Wade, L., McGuigan, P. M., Bilzon, J. L., & Colyer, S. L. (2021). The accuracy of several pose estimation methods for 3D joint centre localisation. *Scientific Reports, 11*, 20673. https://doi.org/10.1038/s41598-021-00212-x
  *Relevance:* Quantifies pose-estimation joint-localisation accuracy versus marker-based reference (systematic hip/knee differences of ~30–50 mm), informing the accuracy caveats in §14.

> **Reference caveat:** The specific published source of the numeric `referenceValues` in `config.js` is not cited in the code. The values are broadly consistent with published unipedal-stance norms but should be confirmed against a specific protocol before scientific reporting — **requires verification from implementation owner.**

---

## 13. Recommended Scientific Sources to Verify

Before formal use or reporting, verify current peer-reviewed literature on:
- Diagnostic balance tests and fall-risk classification (e.g., systematic reviews of balance test accuracy)
- The Single-Leg / unipedal Stance Test protocol variants (eyes open/closed, arm position, footwear)
- Postural sway and incident falls (prospective cohorts, meta-analyses)
- Age- and sex-specific single-leg stance normative values matching the app's protocol
- Validity/reliability of MediaPipe / 2D pose estimation for balance and postural assessment specifically (not only gait)

Cite a source only where it genuinely supports the specific claim being made.

---

## 14. Scientific and Clinical Limitations

- **Single-Leg Stance alone cannot diagnose fall risk.** Fall risk is multifactorial (vision, medications, strength, cognition, environment, history). A single balance test is only one input.
- **Balance-test predictive accuracy is limited.** Even validated clinical scales show inconsistent fall-prediction accuracy (Lima et al., 2018), so BalanceVision results should be interpreted as part of a broader assessment, not as a definitive predictor.
- **Camera-based motion estimates are not equivalent to force-platform COP.** BalanceVision's sway/stability values are 2D body-landmark proxies (Piirtola & Era, 2006; Johansson et al., 2017 concern platform sway).
- **MediaPipe landmark accuracy varies** with lighting, occlusion, clothing, camera angle, distance, and device performance; pose-estimation joint localisation carries measurable error versus marker-based systems (Needham et al., 2021).
- **The composite stability score is app-generated and unvalidated.** It has not been benchmarked against gold-standard measures or clinical outcomes.
- **Age reference values depend on protocol** (eyes open/closed, arm position, footwear, trial count). The app's stored norms must match the intended protocol.
- **Clinical interpretation should be cautious.** Systematic reviews find single-leg/balance tests useful for screening but limited in diagnostic accuracy.

BalanceVision is intended for educational, wellness, fitness, community-care, and screening use. Always consult qualified professionals for clinical assessment.

---

## 15. Data Quality Considerations

Based on the actual implementation and export payload:

- **Incomplete / manually stopped tests:** Many records will show `terminationReason = "Stopped by assessor"`; these end for varied reasons (fault, fatigue, safety). Consider analysing completed-to-max vs assessor-stopped separately.
- **Tracking loss / low landmark confidence:** During tracking loss no frame is stored, and only landmarks with `visibility ≥ 0.5` are smoothed/used. Poor-tracking sessions may yield fewer frames and less stable aggregates. There is no exported field flagging tracking quality — treat sessions with implausibly low variability or very short duration cautiously.
- **Duplicate submissions:** The `no-cors` POST cannot confirm success, and each `saveResult` triggers one send; retries/reloads could duplicate rows. De-duplicate on `id` (unique per record) or `participantId` + `timestamp`.
- **Repeated trials:** Same `participantId` can appear multiple times (`trialNumber`); observations are not independent — use paired/mixed-model methods (§7.6).
- **Missing participant fields:** `sex` is optional (may be empty). Age is required by the form (min 5, max 120) but validate anyway.
- **Impossible / extreme values:** Screen for out-of-range `age`, non-positive `duration`, extreme `peakAngularVelocity`, or sway values that indicate tracking noise.
- **Inconsistent units:** Sway/variability fields are body-scaled normalized ratios, not physical units; do not mix them with degree-based metrics in the same axis without labelling.

Handle these with a documented cleaning step (de-duplicate, range-check, flag low-quality sessions, separate completed vs stopped) before statistical analysis (§7.7).

---

## 16. Privacy and Ethical Considerations

Derived strictly from the source code:

- **Participant information collected:** `participantId` (ID or nickname — the form invites a nickname), `age`, optional `sex`, `participantType`, `trialNumber`, chosen leg/duration.
- **Camera video is NOT stored.** Frames are consumed live by MediaPipe for pose estimation; no image/video is written to storage or transmitted.
- **Pose processing occurs locally** in the browser (MediaPipe model + WASM/GPU on-device).
- **Derived data upload:** Only the 31-field numeric result object is uploaded, and only if `googleSheetsWebhookUrl` is set. No images are ever uploaded.
- **Google Sheets implications:** When enabled, results are written to a shared Google Sheet (the Live Results Dataset). Anyone with access to that sheet can view submitted results. Treat the sheet as a shared data store and control its sharing settings accordingly.
- **Recommendation:** Use a participant ID or nickname rather than full names or other unnecessary identifiable information, consistent with the app's own Setup prompt and privacy notes.

The app displays privacy notes on the Home and About screens stating that camera images are processed on-device and not stored/uploaded, and that only derived numerical results may be saved locally. These README statements match those in `app.js`.

---

## 17. Technical Documentation

### System requirements
- A device with a camera (phone, tablet, or laptop).
- A modern browser supporting ES modules, `getUserMedia`, WebAssembly, and (ideally) WebGL/GPU for MediaPipe.
- Internet access to load MediaPipe (CDN) and Chart.js (CDN); the balance logic itself is local.

### Architecture / project files

```
BalanceVision/
├── index.html          Entry point; loads config/engine/results (globals) then app.js (module)
├── styles.css          All styling
├── app.js              State machine, UI, camera, MediaPipe integration (ES module)
├── balance-engine.js   Landmark processing, smoothing, calibration, metric calculation, scoring
├── results.js          Result object, localStorage, age reference, charts, Google Sheets export
├── config.js           All thresholds, weights, reference values, webhook URL
└── README.md           This manual
```

Script load order matters: `config.js`, `balance-engine.js`, `results.js` are plain scripts exposing globals (`CONFIG`, `LANDMARKS`, `BalanceEngine`, `ResultsManager`, `ChartRenderer`); `app.js` is an ES module and instantiates the app.

### MediaPipe
- Package: `@mediapipe/tasks-vision@0.10.21` (dynamic ESM import from jsDelivr).
- Model: `pose_landmarker_lite` (float16), `runningMode: 'VIDEO'`, `numPoses: 1`, delegate `GPU`.
- Confidence thresholds: detection/tracking/presence = 0.60 (`config.js`).

### Running locally
Serve the folder over HTTP(S) (a module + camera app cannot run from `file://`). For example, from the `BalanceVision/` folder use any static server (e.g. VS Code Live Server, or a simple static file server). Then open the served URL in a browser and grant camera permission.

### GitHub Pages deployment
1. Push the `BalanceVision/` contents to the repository (root or a `/docs` folder).
2. Repository **Settings → Pages → Deploy from branch → main**, choose the folder containing `index.html`.
3. Access at `https://<username>.github.io/<repo-name>/` (the live app is at https://aaron-chen-angus.github.io/BalanceVision/).
4. GitHub Pages provides HTTPS, which is required for camera access.

### Configuration reference (`config.js`)

| Setting | Default | Description |
|---------|---------|-------------|
| `detectionConfidence` | 0.60 | Min pose detection confidence |
| `trackingConfidence` | 0.60 | Min tracking confidence |
| `presenceConfidence` | 0.60 | Min presence confidence |
| `numPoses` | 1 | Poses to detect |
| `smoothingAlpha` | 0.30 | EMA smoothing factor |
| `landmarkConfidenceThreshold` | 0.50 | Min landmark visibility to use/smooth |
| `footGroundTolerance` | 0.08 | Raised-foot "grounded" threshold |
| `handHipDistanceThreshold` | 0.30 | Wrist-hip distance / torso length fault |
| `legContactThreshold` | 0.12 | Min leg separation (normalized) |
| `majorCorrectionThreshold` | 0.15 | Displacement / body height for major correction |
| `failurePersistenceMs` | 350 | Persistence before major-correction warning |
| `footGroundPersistenceMs` | 300 | Persistence for foot-ground warning |
| `handHipPersistenceMs` | 400 | Persistence for hand-off-hip warning |
| `legContactPersistenceMs` | 350 | Persistence for legs-touching warning |
| `trackingLostTimeoutMs` | 2000 | Tracking-loss timeout |
| `correctiveMovementThreshold` | 0.06 | Normalized displacement for a correction |
| `correctiveMovementCooldownMs` | 650 | Cooldown between counted corrections |
| `calibrationDurationMs` | 1000 | Baseline capture duration |
| `defaultMaxDuration` | 60 | Default test duration (s) |
| `durationOptions` | [30,45,60] | Selectable max durations |
| `scoreWeights` | see §6 | Composite score weights |
| `referenceValues` | see §6 | Age-group reference durations |
| `swayClassification` | low 0.02 / moderate 0.05 | Sway banding thresholds |
| `performanceLabels` | 75 / 40 / 0 | Score bands and labels |
| `googleSheetsWebhookUrl` | (set) | Apps Script Web App URL (empty = disabled) |
| `preferredCamera` | `environment` | Default camera facing |
| `cameraWidth` / `cameraHeight` | 640 / 480 | Requested camera resolution |

### Google Sheets integration
The client sends `JSON.stringify(result)` (the 31-field object) via `fetch(url, { method:'POST', mode:'no-cors', body })`. Set up the receiver as an Apps Script Web App bound to the target Sheet:

```javascript
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Results");
  var data = JSON.parse(e.postData.contents);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(Object.keys(data));       // create headers from payload keys
  }
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function(h) { return data[h] || ''; });
  sheet.appendRow(row);

  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

Deploy as **Web app**, execute as **Me**, access **Anyone**, then paste the deployment URL into `config.js` → `googleSheetsWebhookUrl`. Because the browser uses `no-cors`, the app cannot read the response; verify writes by checking the Sheet.

### Charts / visualisation
Chart.js 4.x (CDN) renders three results charts: stability-over-time (torso tilt), body-sway trace (hip midpoint ML vs vertical), and left-vs-right duration. Historical records show no charts because per-frame data is not persisted.

### Troubleshooting
- **"Failed to load pose detection":** Check internet (MediaPipe CDN), reload; GPU delegate may fall back.
- **Camera permission denied / not found:** Grant camera access; ensure HTTPS; check device camera.
- **Low frame rate on older phones:** Expected; the lite model is used to reduce load.
- **No rows in the Sheet:** Confirm `googleSheetsWebhookUrl` is set and the Apps Script is deployed with "Anyone" access; remember the client cannot detect failures (no-cors).

### Browser requirements
HTTPS (or localhost) is required for camera access. A recent version of Chrome, Edge, Safari, or Firefox on desktop or mobile is recommended.

### Privacy & limitations
See §16 and §14.

---

## 18. Final Validation (performed before saving this README)

1. **Google Sheets submission payload inspected** — `ResultsManager.saveResult()` builds the object; `sendToGoogleSheets(result)` sends the same object as `JSON.stringify(result)`.
2. **Every exported field listed** — all 31 fields catalogued in §4.
3. **Data Dictionary compared row-by-row** to the payload — every result-object key has a dictionary row; no extra/missing keys.
4. **No exported field missing** — confirmed (31/31).
5. **Formulas checked against JavaScript** — torso tilt (angle from vertical of shoulderMid→hipMid), lateral sway (hip-x displacement / shoulderWidth; mean/max on abs, RMS/SD on signed), angular velocity (Δtilt/Δt), knee/pelvic angles, corrective-movement thresholds+cooldown, and the composite score weights all match `balance-engine.js`/`config.js`.
6. **Units checked** — seconds, degrees, degrees/second, normalized ratios, counts, categorical, DateTime.
7. **Recommended statistics use only available variables** (§7).
8. **Recommended visualisations use only available variables** (§8).
9. **References verified** — each APA reference was checked against its source; unverifiable candidates were removed.
10. **APA 7th edition formatting** applied with DOIs.
11–15. **No application source code, scoring logic, or Google Sheets submission logic was modified.** Only `BalanceVision/README.md` was changed; prior useful documentation was preserved and reorganised.

---

## License

Republic Polytechnic Health Promotion Innovation Laboratory
