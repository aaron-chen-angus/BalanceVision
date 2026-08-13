/**
 * BalanceVision Configuration
 * 
 * All configurable thresholds, reference values, and parameters.
 * These are initial engineering values and should be validated empirically
 * before formal use in any assessment context.
 */

const CONFIG = {
  // ─── MediaPipe Settings ───────────────────────────────────────────
  detectionConfidence: 0.60,
  trackingConfidence: 0.60,
  presenceConfidence: 0.60,
  numPoses: 1,

  // ─── Smoothing ────────────────────────────────────────────────────
  // Exponential moving average alpha (0 = all history, 1 = no smoothing)
  smoothingAlpha: 0.3,
  // Number of frames for moving average fallback
  movingAverageWindow: 6,

  // ─── Failure Detection Thresholds ─────────────────────────────────
  // Raised foot ground tolerance: normalized distance
  footGroundTolerance: 0.08,
  // Wrist-to-hip distance / torso length threshold
  handHipDistanceThreshold: 0.30,
  // Minimum distance between legs (normalized) before "legs touching"
  legContactThreshold: 0.12,
  // Major corrective movement: displacement / body height
  majorCorrectionThreshold: 0.15,

  // ─── Temporal Persistence (ms) ────────────────────────────────────
  // How long a failure condition must persist before triggering termination
  failurePersistenceMs: 350,
  // Specific overrides
  footGroundPersistenceMs: 300,
  handHipPersistenceMs: 400,
  legContactPersistenceMs: 350,

  // ─── Tracking ─────────────────────────────────────────────────────
  // How long tracking can be lost before pausing/prompting
  trackingLostTimeoutMs: 2000,
  // Minimum confidence to use a landmark
  landmarkConfidenceThreshold: 0.5,

  // ─── Corrective Movement Detection ────────────────────────────────
  // Threshold for counting a corrective movement (normalized displacement)
  correctiveMovementThreshold: 0.06,
  // Cooldown between corrective movement counts (ms)
  correctiveMovementCooldownMs: 650,

  // ─── Calibration ──────────────────────────────────────────────────
  calibrationDurationMs: 1000,

  // ─── Test Durations (seconds) ─────────────────────────────────────
  defaultMaxDuration: 60,
  durationOptions: [30, 45, 60],

  // ─── Composite Score Weights ──────────────────────────────────────
  scoreWeights: {
    duration: 0.50,
    torsoStability: 0.15,
    angularStability: 0.10,
    kneeStability: 0.10,
    pelvicStability: 0.10,
    correctiveMovements: 0.05
  },

  // ─── Age Reference Values (eyes-open, best-of-three, seconds) ─────
  // Based on published normative data for single-leg stance
  referenceValues: {
    "18-39": 44.7,
    "40-49": 41.9,
    "50-59": 41.2,
    "60-69": 32.1,
    "70-79": 21.5,
    "80+": 9.4
  },

  // ─── Sport Profile Rules ──────────────────────────────────────────
  sportProfiles: {
    precisionBalance: {
      label: "Precision & Balance Profile",
      description: "Movement characteristics may be relevant to activities such as:",
      sports: ["gymnastics", "dance", "figure skating", "martial arts", "climbing"],
      reason: "These activities frequently require precise postural control and sustained single-leg stability.",
      criteria: {
        durationPercentile: 75,
        swayPercentile: 25, // low sway = better
        correctiveMovementsMax: 3
      }
    },
    agilityControl: {
      label: "Agility & Body-Control Profile",
      description: "Movement characteristics may be relevant to activities such as:",
      sports: ["football", "basketball", "badminton", "tennis", "netball"],
      reason: "These activities frequently involve rapid changes in body position and periods of single-leg support.",
      criteria: {
        durationPercentile: 50,
        pelvicStabilityPercentile: 60
      }
    },
    developingControl: {
      label: "Developing Dynamic Control",
      description: "Suggested activities:",
      sports: ["swimming", "cycling", "general movement games", "introductory martial arts", "structured fundamental movement programmes"],
      reason: "Your results suggest an opportunity to further develop balance and postural control through varied movement experiences.",
      criteria: {
        durationPercentile: 50, // below median
        correctiveMovementsMin: 4
      }
    },
    symmetryFocus: {
      label: "Movement Symmetry Focus",
      description: "",
      sports: [],
      reason: "There was a noticeable difference between your left and right sides. Try activities that develop control on both sides of the body.",
      criteria: {
        asymmetryPercentage: 25 // >25% difference
      }
    }
  },

  // ─── Sway Classification ──────────────────────────────────────────
  swayClassification: {
    low: 0.02,      // RMS below this = Low Sway
    moderate: 0.05, // RMS below this = Moderate Sway
    // Above moderate = High Sway
  },

  // ─── Balance Performance Labels ───────────────────────────────────
  performanceLabels: {
    strong: { minScore: 75, label: "Strong single-leg balance performance" },
    moderate: { minScore: 40, label: "Moderate single-leg balance performance" },
    limited: { minScore: 0, label: "Limited single-leg balance performance" }
  },

  // ─── UI Settings ──────────────────────────────────────────────────
  debugMode: false,
  voiceGuidance: true,

  // ─── Google Sheets Integration ────────────────────────────────────
  // Set this to your Google Apps Script Web App URL to enable auto-export
  // See README for setup instructions
  googleSheetsWebhookUrl: 'https://script.google.com/macros/s/AKfycbxYDwps5Sb3iKLrLlsqOnBh84hyCHRtnPOdcNYegaeOtUDbM2sbIc15ZRgiEZ_BE_l7/exec',

  // ─── Camera ───────────────────────────────────────────────────────
  preferredCamera: 'environment', // 'environment' (rear) or 'user' (front)
  cameraWidth: 640,
  cameraHeight: 480
};
