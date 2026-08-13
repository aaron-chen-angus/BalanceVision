# BalanceVision

**AI-Assisted Single-Leg Balance Assessment**

BalanceVision uses computer vision (Google MediaPipe Pose Landmarker) to conduct and analyse a Single-Leg Balance Test directly in the browser. No wearable sensors, no video recording, no server required.

## Features

- **Pose detection** — Real-time body landmark tracking using MediaPipe
- **Automatic failure detection** — Foot grounding, hands off hips, legs touching, major corrective movement
- **Balance metrics** — Duration, torso tilt, lateral sway, angular velocity, knee/pelvic stability
- **Composite score** — BalanceVision Stability Score (0–100)
- **Age reference** — Comparison against published normative data
- **Left/right comparison** — Asymmetry detection
- **Sport profiles** — Fun, exploratory movement profiles for children/youth
- **Trial history** — Local browser storage, no server uploads
- **Voice guidance** — Optional browser speech synthesis
- **Privacy-first** — All processing on-device; no images stored or uploaded

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Pose estimation | MediaPipe Tasks Vision / Pose Landmarker |
| Skeleton overlay | HTML5 Canvas |
| Charts | Chart.js 4.x (CDN) |
| Storage | localStorage |
| Deployment | Static site (GitHub Pages) |

No React, Node.js, database, or build process required.

## How to Run Locally

1. Clone or download this repository
2. Serve the `BalanceVision/` directory over HTTPS (camera requires secure context)

**Option A — VS Code Live Server:**
```
Install the "Live Server" extension, right-click index.html → Open with Live Server
```

**Option B — Python:**
```bash
cd BalanceVision
python -m http.server 8080
# Then open http://localhost:8080
# Note: localhost is treated as secure context in most browsers
```

**Option C — npx serve:**
```bash
npx serve BalanceVision
```

3. Allow camera access when prompted
4. Use Chrome, Edge, or Safari for best MediaPipe compatibility

## How to Deploy via GitHub Pages

1. Push the `BalanceVision/` folder contents to the root of a GitHub repository (or configure Pages to serve from a subfolder)
2. Go to **Settings → Pages → Deploy from branch → main → /root**
3. Wait for deployment (usually 1–2 minutes)
4. Access at `https://yourusername.github.io/your-repo/`

All paths are relative — no configuration changes needed.

## File Structure

```
BalanceVision/
├── index.html          Main entry point
├── styles.css          All application styles
├── app.js              Main controller, state machine, UI, MediaPipe
├── balance-engine.js   Core test logic, failure detection, metrics
├── results.js          Results calculation, charts, history, sport profiles
├── config.js           All configurable thresholds and reference values
└── README.md           This file
```

## Camera Permission Requirements

- The app requires HTTPS (or localhost) for camera access
- Users must explicitly grant camera permission
- Rear camera is preferred for facilitator use; front camera available via toggle

## MediaPipe Setup

The app loads MediaPipe from the official CDN:
- Model: `pose_landmarker_lite` (float16)
- WASM runtime: `@mediapipe/tasks-vision@0.10.22`

No local model files required. Internet connection needed for first load (model is cached by browser).

## How to Adjust Thresholds

Open `config.js` and modify values. Key settings:

```javascript
handHipDistanceThreshold: 0.30    // Wrist-hip distance / torso length
footGroundTolerance: 0.08         // Raised foot proximity to ground
legContactThreshold: 0.12         // Minimum leg separation
majorCorrectionThreshold: 0.15    // Body displacement / height
failurePersistenceMs: 350         // How long condition must persist (ms)
```

All thresholds are normalised to body proportions, making them robust across different camera distances and body sizes.

## Known Limitations

- **Not a medical device** — Results are computer-vision-assisted estimates, not clinical measurements
- **Camera angle sensitivity** — Best accuracy with approximately front-facing view
- **Lighting requirements** — Adequate lighting needed for pose detection
- **MediaPipe Z-depth** — Anterior-posterior sway estimates may be unreliable; shown only when data quality is sufficient
- **Single person** — Only tracks one person at a time
- **Browser support** — Requires modern browser with WebGL support (Chrome 90+, Edge 90+, Safari 15+)
- **Mobile performance** — Frame rate may vary on older devices

## Privacy Statement

- Camera images are processed **on this device** for pose estimation
- No images or video are stored or uploaded
- Only derived numerical results may be saved in browser localStorage
- No cookies, tracking, or analytics
- Clear history at any time from the Results History screen

## Disclaimer

BalanceVision is intended for educational, wellness, fitness, community care, and screening applications. It is **not** a medical diagnostic device.

- Results are application-generated performance indicators
- The BalanceVision Stability Score is not a validated clinical score
- Age reference values are approximate and based on published normative data
- Sport movement profiles are exploratory and are not talent identification tools
- Always consult qualified professionals for clinical assessment

## License

MIT
