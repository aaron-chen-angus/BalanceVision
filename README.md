# BalanceVision — System Manual

**AI-Assisted Single-Leg Balance Assessment Web Application**

---

## 1. Overview

BalanceVision uses Google MediaPipe Pose Landmarker (computer vision) to measure and report metrics during a Single-Leg Balance Test. It runs entirely in the browser on any device with a camera — phone, tablet, or laptop.

- **No wearable sensors required**
- **No video stored or uploaded**
- **All processing happens on-device**
- **Results saved locally + optional Google Sheets export**

---

## 2. Application Workflow

```
HOME → SETUP (participant details) → CAMERA (positioning) → TEST (recording) → RESULTS
```

| Screen | Purpose |
|--------|---------|
| Home | Start new assessment or view history |
| Setup | Enter participant ID, age, sex, test leg, trial number, duration, participant type |
| Camera | Live pose detection, operator checklist, start test |
| Test | Timer running, live metrics, STOP button |
| Results | Full metrics, charts, score, age reference |
| History | View/export past results |

---

## 3. Indicators & Metrics Measured

### 3.1 Core Metrics (all participants)

| Metric | Description | Unit |
|--------|-------------|------|
| **Balance Duration** | Time from test start to stop | seconds |
| **Mean Torso Tilt** | Average deviation of torso from vertical | degrees |
| **Maximum Torso Tilt** | Peak torso deviation during test | degrees |
| **Lateral Stability** | Mediolateral sway classification | Low / Moderate / High Sway |
| **RMS Lateral Sway** | Root-mean-square of hip midpoint displacement | normalised |
| **Peak Angular Velocity** | Maximum rate of torso tilt change | °/s |
| **Mean Angular Velocity** | Average rate of torso tilt change | °/s |
| **Corrective Movements** | Count of distinct balance corrections | count |
| **Supporting Knee Stability** | Standard deviation of support knee angle | degrees |
| **Pelvic Stability** | Standard deviation of hip line angle | degrees |
| **Raised-Leg Control** | Variability of raised leg position | normalised |
| **BalanceVision Stability Score** | Composite score (0–100) | score |

### 3.2 Composite Stability Score Formula

```
Score = Duration (50%) + Torso Stability (15%) + Angular Stability (10%)
      + Knee Stability (10%) + Pelvic Stability (10%) + Corrective Movements (5%)
```

Each component is normalised to 0–100 before weighting.

### 3.3 Performance Labels

| Score Range | Label |
|-------------|-------|
| 75–100 | Strong single-leg balance performance |
| 40–74 | Moderate single-leg balance performance |
| 0–39 | Limited single-leg balance performance |

---

## 4. Differences by Participant Type

### 4.1 Adult (18+)

- Full Balance Screening Result displayed
- Age reference comparison (see Section 5)
- Performance label (Strong / Moderate / Limited)
- If score < 30 and age ≥ 60: advisory to consult healthcare professional

### 4.2 Older Adult (selected explicitly)

- Same metrics as Adult
- 10-Second Balance Indicator displayed (for age ≥ 50)
- Enhanced safety warning before test
- Advisory language if performance is low

### 4.3 Child / Youth

- **No fall-risk terminology used**
- **No "Balance Screening Result"** — replaced with "Movement Balance Profile"
- **No age reference comparison** (adult norms don't apply)
- **Sport Movement Profile** displayed (see Section 6)
- Focus on: balance duration, postural stability, symmetry, body control

---

## 5. Age Reference Values

Shown only for adults (age ≥ 18). Based on published normative data for eyes-open single-leg stance (best of three trials):

| Age Group | Reference (seconds) |
|-----------|-------------------|
| 18–39 | 44.7 |
| 40–49 | 41.9 |
| 50–59 | 41.2 |
| 60–69 | 32.1 |
| 70–79 | 21.5 |
| 80+ | 9.4 |

Results are described as "above reference", "around reference", or "below reference". No diagnostic language is used.

---

## 6. 10-Second Balance Indicator

Shown only for adults aged 50+.

- **Completed**: Maintained single-leg stance ≥ 10 seconds
- **Not Completed**: Duration < 10 seconds

Accompanied by explanatory text that this is a studied health indicator, not a diagnosis.

---

## 7. Sport Movement Profiles (Child/Youth Only)

Based on stability score, corrective movements, sway, and side-to-side symmetry:

| Profile | Criteria | Suggested Activities |
|---------|----------|---------------------|
| **Precision & Balance** | High score, low sway, ≤3 corrections | Gymnastics, dance, figure skating, martial arts, climbing |
| **Agility & Body-Control** | Good score, good pelvic stability | Football, basketball, badminton, tennis, netball |
| **Developing Dynamic Control** | Lower score or many corrections | Swimming, cycling, movement games, intro martial arts |
| **Movement Symmetry Focus** | >25% left/right difference | Activities developing bilateral control |

**Disclaimer**: These are NOT talent identification tools. Sport aptitude depends on many factors beyond balance.

---

## 8. Differences by Sex

Currently, the **sex** field is recorded but does **not change** any metrics, scoring, or reference values. It is stored for:

- Data recording purposes
- Future potential use if sex-specific normative data are added

All indicators are identical regardless of sex selection.

---

## 9. Side-to-Side Comparison

When both left-support and right-support tests exist for the same participant:

- Best duration from each side compared
- Absolute and percentage difference shown
- Bar chart visualisation available
- Asymmetry noted (not diagnosed)

---

## 10. Test Operation

### Starting
1. Fill participant details on Setup screen
2. Point camera at participant — ensure all checklist items pass (person detected, full body visible, leg raised)
3. Press START TEST
4. 1-second calibration captures baseline

### During Test
- Timer counts up on screen
- Operator sees live warnings (informational only):
  - ⚠️ Foot lowering
  - ⚠️ Hands moving
  - ⚠️ Legs close
  - ⚠️ Large movement
- **Test does NOT auto-stop** — operator decides when to press STOP

### Stopping
- **Operator presses STOP** when they observe a violation (or test is complete)
- **Max duration timer** stops automatically at the configured limit (30/45/60s)
- Termination reason recorded: "Stopped by assessor" or "Test completed successfully: X seconds"

---

## 11. Data Storage

### Local Storage (Browser)
All results saved in browser localStorage. Data persists until cleared.

### Export Options
- **CSV Export**: Download all results as a CSV file from History screen
- **Google Sheets**: Real-time auto-export (see Section 12)

### Data Fields Stored

```
participantId, age, sex, participantType, supportLeg, trialNumber,
duration, terminationReason, meanTorsoTilt, maxTorsoTilt, sdTorsoTilt,
meanLateralSway, maxLateralSway, rmsLateralSway, sdLateralSway,
swayClassification, meanAngularVelocity, peakAngularVelocity,
rmsAngularVelocity, meanKneeAngle, kneeVariability, maxKneeDeviation,
meanPelvicTilt, maxPelvicTilt, pelvicVariability, raisedLegVariability,
correctiveMovements, stabilityScore, performanceLabel, timestamp
```

---

## 12. Google Sheets Integration

BalanceVision can automatically send each test result to a Google Sheet. This creates a live database that updates every time a test is completed.

### Setup Instructions

**Step 1: Create a Google Sheet**
- Create a new Google Sheet
- Name the first sheet "Results"
- Add headers in Row 1 matching the data fields (or leave blank — the script will handle it)

**Step 2: Create a Google Apps Script**
1. In your Google Sheet, go to **Extensions → Apps Script**
2. Replace the code with:

```javascript
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Results");
  var data = JSON.parse(e.postData.contents);
  
  // Add headers if first row is empty
  if (sheet.getLastRow() === 0) {
    var headers = Object.keys(data);
    sheet.appendRow(headers);
  }
  
  // Append data row
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function(header) { return data[header] || ''; });
  sheet.appendRow(row);
  
  return ContentService.createTextOutput(JSON.stringify({status: 'ok'}))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. Click **Deploy → New deployment**
4. Type: **Web app**
5. Execute as: **Me**
6. Who has access: **Anyone**
7. Click Deploy and copy the URL

**Step 3: Configure BalanceVision**
Open `config.js` and set:
```javascript
googleSheetsWebhookUrl: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec',
```

**Step 4: Test**
Run a balance test. Check your Google Sheet — a new row should appear within seconds.

### Data Flow
```
BalanceVision (browser) → POST request → Google Apps Script → Google Sheet
```

- No authentication needed from the app side
- Works on any device with internet
- Sheet updates in real-time
- Multiple devices can write to the same sheet

---

## 13. Charts & Visualisations

| Chart | Description |
|-------|-------------|
| **Stability Over Time** | Line chart of torso tilt angle across test duration |
| **Body Sway Trace** | 2D scatter plot of hip midpoint movement (ML vs vertical) |
| **Left vs Right** | Bar chart comparing duration for both legs (when available) |

Charts require internet (Chart.js loaded from CDN). Historical results viewed from History won't show charts (frame-level data not stored).

---

## 14. Technical Stack

| Component | Technology |
|-----------|-----------|
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES Module) |
| Pose estimation | MediaPipe Tasks Vision Pose Landmarker (v0.10.21) |
| Skeleton overlay | HTML5 Canvas |
| Charts | Chart.js 4.x (CDN) |
| Local storage | Browser localStorage |
| Cloud storage | Google Sheets via Apps Script (optional) |
| Deployment | Static site — GitHub Pages |

No build process. No npm. No server. Just files.

---

## 15. File Structure

```
BalanceVision/
├── index.html          Entry point
├── styles.css          All styling
├── app.js              State machine, UI, camera, MediaPipe (ES module)
├── balance-engine.js   Metrics calculation, smoothing, landmark processing
├── results.js          Score calculation, history, charts, Google Sheets
├── config.js           All thresholds and settings
└── README.md           This manual
```

---

## 16. Deployment (GitHub Pages)

1. Push `BalanceVision/` folder contents to repo root
2. Settings → Pages → Deploy from branch → main → /root
3. Access at `https://username.github.io/repo-name/`

Requirements: HTTPS (GitHub Pages provides this automatically).

---

## 17. Configuration Reference

All in `config.js`:

| Setting | Default | Description |
|---------|---------|-------------|
| `detectionConfidence` | 0.60 | Minimum pose detection confidence |
| `trackingConfidence` | 0.60 | Minimum tracking confidence |
| `smoothingAlpha` | 0.30 | EMA smoothing factor (0=more smoothing, 1=none) |
| `footGroundTolerance` | 0.08 | How close foot must be to "ground" level |
| `handHipDistanceThreshold` | 0.30 | Wrist-hip distance / torso length for failure |
| `legContactThreshold` | 0.12 | Minimum leg separation (normalised) |
| `majorCorrectionThreshold` | 0.15 | Body displacement / height for major correction |
| `failurePersistenceMs` | 350 | Time condition must persist for warning |
| `correctiveMovementCooldownMs` | 650 | Cooldown between counting corrections |
| `calibrationDurationMs` | 1000 | Baseline capture duration |
| `defaultMaxDuration` | 60 | Default test duration (seconds) |
| `googleSheetsWebhookUrl` | '' | Google Apps Script URL (empty = disabled) |

---

## 18. Privacy

- Camera frames processed locally — never stored or uploaded
- Only numerical metrics saved
- No cookies, analytics, or tracking
- Google Sheets export (if enabled) sends only computed metrics, never images
- User can delete all local history at any time

---

## 19. Limitations & Disclaimer

- **Not a medical device** — results are computer-vision-assisted estimates
- **Camera angle affects accuracy** — front-facing, full-body view recommended
- **Lighting matters** — poor lighting reduces landmark detection quality
- **Mobile performance varies** — older phones may have lower frame rates
- **No auto-termination** — operator must manually stop when violation observed
- **Sport profiles are exploratory** — not talent identification
- **Age references are approximate** — based on published normative data

BalanceVision is intended for educational, wellness, fitness, community care, and screening use. Always consult qualified professionals for clinical assessment.

---

## 20. License

Republic Polytechnic
Team NotLepak (S3729C)
