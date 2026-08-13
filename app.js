/**
 * BalanceVision - Main Application Controller
 * 
 * State machine, UI management, MediaPipe integration, camera control,
 * and screen navigation.
 */

// ─── Application State Machine ──────────────────────────────────────────────

const AppState = {
  HOME: 'HOME',
  SETUP: 'SETUP',
  CAMERA: 'CAMERA',
  READY: 'READY',
  CALIBRATING: 'CALIBRATING',
  TESTING: 'TESTING',
  COMPLETED: 'COMPLETED',
  RESULTS: 'RESULTS',
  HISTORY: 'HISTORY',
  ABOUT: 'ABOUT'
};

// ─── Global Application Instance ────────────────────────────────────────────

class BalanceVisionApp {
  constructor() {
    this.currentState = AppState.HOME;
    this.participantData = {};
    this.engine = new BalanceEngine();
    this.resultsManager = new ResultsManager();
    this.chartRenderer = new ChartRenderer();
    
    // MediaPipe
    this.poseLandmarker = null;
    this.mpLoaded = false;
    
    // Camera
    this.videoElement = null;
    this.canvasElement = null;
    this.canvasCtx = null;
    this.stream = null;
    this.animationId = null;
    this.currentCamera = CONFIG.preferredCamera;
    
    // Test state
    this.testTimer = null;
    this.testStartTime = 0;
    this.testElapsed = 0;
    this.lastFrameTime = 0;
    
    // Voice
    this.voiceEnabled = CONFIG.voiceGuidance;
    this.synth = window.speechSynthesis || null;
    
    // Debug
    this.debugMode = CONFIG.debugMode;
    this.fps = 0;
    this.frameCount = 0;
    this.fpsTimer = 0;

    // Bind engine events
    this.engine.on('testComplete', (data) => this.onTestComplete(data));
    this.engine.on('trackingLost', () => this.onTrackingLost());
    this.engine.on('trackingRestored', () => this.onTrackingRestored());
    this.engine.on('trackingTimeout', () => this.onTrackingTimeout());
    this.engine.on('calibrationComplete', () => this.onCalibrationComplete());
    this.engine.on('liveData', (data) => this.onLiveData(data));
  }

  // ─── Initialization ─────────────────────────────────────────────────────

  async init() {
    this.renderScreen(AppState.HOME);
    this.setupNavigation();
    
    // Preload MediaPipe
    this.loadMediaPipe();
  }

  async loadMediaPipe() {
    try {
      // Dynamic import of the ESM bundle — works in module scripts on all modern mobile browsers
      const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs');

      const filesetResolver = await vision.FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'
      );

      this.poseLandmarker = await vision.PoseLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numPoses: CONFIG.numPoses,
        minPoseDetectionConfidence: CONFIG.detectionConfidence,
        minPosePresenceConfidence: CONFIG.presenceConfidence,
        minTrackingConfidence: CONFIG.trackingConfidence
      });

      this.mpLoaded = true;
      console.log('MediaPipe Pose Landmarker loaded successfully');
    } catch (error) {
      console.error('Failed to load MediaPipe:', error);
      // Show error on screen so user knows what happened
      const readinessText = document.getElementById('readiness-text');
      if (readinessText) {
        readinessText.textContent = 'Error loading model: ' + (error.message || 'unknown');
      }
      this.showError('Failed to load pose detection. Error: ' + (error.message || 'Check internet connection and reload.'));
    }
  }

  // ─── Navigation ─────────────────────────────────────────────────────────

  setupNavigation() {
    document.addEventListener('click', (e) => {
      const navBtn = e.target.closest('[data-nav]');
      if (navBtn) {
        const target = navBtn.dataset.nav;
        this.navigate(target);
      }
    });
  }

  navigate(screen) {
    this.stopCamera();
    this.cancelAnimationFrame();
    this.renderScreen(screen);
  }

  // ─── State Transitions ──────────────────────────────────────────────────

  renderScreen(state) {
    this.currentState = state;
    const app = document.getElementById('app');
    
    switch (state) {
      case AppState.HOME:
        app.innerHTML = this.renderHomeScreen();
        break;
      case AppState.SETUP:
        app.innerHTML = this.renderSetupScreen();
        this.attachSetupHandlers();
        break;
      case AppState.CAMERA:
        app.innerHTML = this.renderCameraScreen();
        this.initCamera();
        break;
      case AppState.READY:
        // Handled within camera screen
        break;
      case AppState.CALIBRATING:
        this.startCalibration();
        break;
      case AppState.TESTING:
        this.startTest();
        break;
      case AppState.COMPLETED:
        // Handled by engine callback
        break;
      case AppState.RESULTS:
        app.innerHTML = this.renderResultsScreen();
        this.renderCharts();
        break;
      case AppState.HISTORY:
        app.innerHTML = this.renderHistoryScreen();
        break;
      case AppState.ABOUT:
        app.innerHTML = this.renderAboutScreen();
        break;
    }

    // Scroll to top
    window.scrollTo(0, 0);
  }

  // ─── HOME SCREEN ───────────────────────────────────────────────────────

  renderHomeScreen() {
    return `
      <div class="screen home-screen">
        <nav class="nav-bar">
          <span class="nav-logo">BalanceVision</span>
          <div class="nav-links">
            <button data-nav="HISTORY" class="nav-btn">History</button>
            <button data-nav="ABOUT" class="nav-btn">About</button>
          </div>
        </nav>
        <div class="hero">
          <div class="hero-icon">
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
              <circle cx="40" cy="12" r="8" stroke="#00e5ff" stroke-width="2"/>
              <line x1="40" y1="20" x2="40" y2="50" stroke="#00e5ff" stroke-width="2"/>
              <line x1="40" y1="28" x2="28" y2="40" stroke="#00e5ff" stroke-width="2"/>
              <line x1="40" y1="28" x2="52" y2="40" stroke="#00e5ff" stroke-width="2"/>
              <line x1="40" y1="50" x2="32" y2="70" stroke="#00e5ff" stroke-width="2"/>
              <line x1="40" y1="50" x2="50" y2="62" stroke="#00e5ff" stroke-width="2"/>
              <line x1="50" y1="62" x2="48" y2="56" stroke="#00e5ff" stroke-width="1.5" stroke-dasharray="2 2"/>
            </svg>
          </div>
          <h1 class="hero-title">BalanceVision</h1>
          <p class="hero-subtitle">AI-Assisted Single-Leg Balance Assessment</p>
          <p class="hero-description">
            Measure balance duration, postural stability and movement control using computer vision.
          </p>
          <button class="btn btn-primary btn-large" data-nav="SETUP">
            START ASSESSMENT
          </button>
        </div>
        <div class="features">
          <div class="feature-item">
            <span class="feature-icon">📷</span>
            <span>No wearable sensors</span>
          </div>
          <div class="feature-item">
            <span class="feature-icon">🔒</span>
            <span>No video recording</span>
          </div>
          <div class="feature-item">
            <span class="feature-icon">📱</span>
            <span>Processed on your device</span>
          </div>
        </div>
        <div class="privacy-note">
          <p>Privacy: Camera images are processed on this device for pose estimation and are not stored or uploaded by BalanceVision. Only derived numerical results may be saved locally.</p>
        </div>
      </div>
    `;
  }

  // ─── SETUP SCREEN ─────────────────────────────────────────────────────

  renderSetupScreen() {
    return `
      <div class="screen setup-screen">
        <nav class="nav-bar">
          <button data-nav="HOME" class="nav-btn">← Home</button>
          <span class="nav-title">Participant Details</span>
        </nav>
        <form id="setup-form" class="setup-form">
          <div class="form-group">
            <label for="participantId">Participant ID or Nickname</label>
            <input type="text" id="participantId" required placeholder="e.g., Participant01" 
                   value="${this.participantData.participantId || ''}">
          </div>
          <div class="form-group">
            <label for="age">Age</label>
            <input type="number" id="age" required min="5" max="120" placeholder="e.g., 65"
                   value="${this.participantData.age || ''}">
          </div>
          <div class="form-group">
            <label for="sex">Sex (optional)</label>
            <select id="sex">
              <option value="">— Select —</option>
              <option value="male" ${this.participantData.sex === 'male' ? 'selected' : ''}>Male</option>
              <option value="female" ${this.participantData.sex === 'female' ? 'selected' : ''}>Female</option>
              <option value="other" ${this.participantData.sex === 'other' ? 'selected' : ''}>Other</option>
            </select>
          </div>
          <div class="form-group">
            <label>Test Leg (leg to be raised)</label>
            <div class="radio-group">
              <label class="radio-label">
                <input type="radio" name="testLeg" value="left" 
                       ${this.participantData.testLeg !== 'right' ? 'checked' : ''}>
                <span>Left leg raised</span>
              </label>
              <label class="radio-label">
                <input type="radio" name="testLeg" value="right"
                       ${this.participantData.testLeg === 'right' ? 'checked' : ''}>
                <span>Right leg raised</span>
              </label>
            </div>
          </div>
          <div class="form-group">
            <label for="trialNumber">Trial Number</label>
            <input type="number" id="trialNumber" min="1" max="10" value="${this.participantData.trialNumber || 1}">
          </div>
          <div class="form-group">
            <label for="maxDuration">Maximum Test Duration</label>
            <select id="maxDuration">
              ${CONFIG.durationOptions.map(d => 
                `<option value="${d}" ${(this.participantData.maxDuration || CONFIG.defaultMaxDuration) === d ? 'selected' : ''}>${d} seconds</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Participant Type</label>
            <div class="radio-group">
              <label class="radio-label">
                <input type="radio" name="participantType" value="adult"
                       ${this.participantData.participantType !== 'older_adult' && this.participantData.participantType !== 'child' ? 'checked' : ''}>
                <span>Adult</span>
              </label>
              <label class="radio-label">
                <input type="radio" name="participantType" value="older_adult"
                       ${this.participantData.participantType === 'older_adult' ? 'checked' : ''}>
                <span>Older adult</span>
              </label>
              <label class="radio-label">
                <input type="radio" name="participantType" value="child"
                       ${this.participantData.participantType === 'child' ? 'checked' : ''}>
                <span>Child / Youth</span>
              </label>
            </div>
          </div>
          
          <div class="safety-card">
            <h3>⚠️ Safety Check</h3>
            <ul>
              <li>✓ The surrounding area is clear</li>
              <li>✓ A stable support is available nearby if needed</li>
              <li>✓ The participant is appropriately supervised</li>
              <li>✓ The full body will be visible in the camera</li>
            </ul>
            <p class="safety-note" id="safety-older" style="display:none;">
              If the participant has significant balance difficulties, use appropriate supervision and follow professional safety procedures.
            </p>
          </div>

          <button type="submit" class="btn btn-primary btn-large">
            Continue to Camera Setup →
          </button>
        </form>
      </div>
    `;
  }

  attachSetupHandlers() {
    const form = document.getElementById('setup-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.participantData = {
        participantId: document.getElementById('participantId').value.trim(),
        age: parseInt(document.getElementById('age').value),
        sex: document.getElementById('sex').value,
        testLeg: document.querySelector('input[name="testLeg"]:checked').value,
        trialNumber: parseInt(document.getElementById('trialNumber').value),
        maxDuration: parseInt(document.getElementById('maxDuration').value),
        participantType: document.querySelector('input[name="participantType"]:checked').value
      };
      this.renderScreen(AppState.CAMERA);
    });

    // Show older adult safety note
    document.querySelectorAll('input[name="participantType"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const note = document.getElementById('safety-older');
        note.style.display = radio.value === 'older_adult' ? 'block' : 'none';
      });
    });
  }

  // ─── CAMERA SCREEN ────────────────────────────────────────────────────

  renderCameraScreen() {
    return `
      <div class="screen camera-screen">
        <div class="camera-header">
          <button data-nav="SETUP" class="nav-btn">← Back</button>
          <span class="nav-title">Camera Setup</span>
          <button id="toggle-camera-btn" class="nav-btn">🔄 Switch</button>
        </div>
        
        <div class="camera-container">
          <video id="camera-video" autoplay playsinline muted></video>
          <canvas id="pose-canvas"></canvas>
          <div class="position-guide">
            <div class="guide-outline"></div>
          </div>
          <div id="readiness-indicator" class="readiness-indicator level-red">
            <span id="readiness-text">Initializing camera...</span>
          </div>
        </div>

        <!-- Operator Checklist -->
        <div class="operator-guide">
          <h3 class="operator-guide-title">📋 Position Checklist</h3>
          <div class="checklist">
            <div class="checklist-item" id="check-person">
              <span class="check-icon" id="check-person-icon">○</span>
              <span class="check-label">Person detected in frame</span>
            </div>
            <div class="checklist-item" id="check-fullbody">
              <span class="check-icon" id="check-fullbody-icon">○</span>
              <span class="check-label">Full body visible (head to feet)</span>
            </div>
            <div class="checklist-item" id="check-hands">
              <span class="check-icon" id="check-hands-icon">○</span>
              <span class="check-label">Hands on hips</span>
            </div>
            <div class="checklist-item" id="check-leg">
              <span class="check-icon" id="check-leg-icon">○</span>
              <span class="check-label">${this.participantData.testLeg === 'left' ? 'Left' : 'Right'} leg raised (subject's ${this.participantData.testLeg})</span>
            </div>
          </div>
          <p class="operator-hint" id="operator-hint">Position the participant so their full body is visible in the camera</p>
        </div>

        <div class="camera-controls">
          <div class="voice-toggle">
            <label class="toggle-label">
              <input type="checkbox" id="voice-toggle" ${this.voiceEnabled ? 'checked' : ''}>
              <span>Voice Guidance ${this.voiceEnabled ? 'ON' : 'OFF'}</span>
            </label>
            <label class="toggle-label">
              <input type="checkbox" id="debug-toggle" ${this.debugMode ? 'checked' : ''}>
              <span>Debug</span>
            </label>
          </div>
          <button id="start-test-btn" class="btn btn-primary btn-large" disabled>
            START TEST
          </button>
          <p class="start-hint" id="start-hint">Complete all checklist items to enable start</p>
        </div>

        <div id="debug-panel" class="debug-panel" style="display:${this.debugMode ? 'block' : 'none'}">
          <div id="debug-info" class="debug-info"></div>
        </div>
      </div>
    `;
  }

  async initCamera() {
    this.videoElement = document.getElementById('camera-video');
    this.canvasElement = document.getElementById('pose-canvas');
    this.canvasCtx = this.canvasElement.getContext('2d');

    // Toggle camera button
    document.getElementById('toggle-camera-btn').addEventListener('click', () => {
      this.currentCamera = this.currentCamera === 'environment' ? 'user' : 'environment';
      this.startCamera();
    });

    // Voice toggle
    document.getElementById('voice-toggle').addEventListener('change', (e) => {
      this.voiceEnabled = e.target.checked;
      e.target.nextElementSibling.textContent = `Voice Guidance ${this.voiceEnabled ? 'ON' : 'OFF'}`;
    });

    // Debug toggle
    document.getElementById('debug-toggle').addEventListener('change', (e) => {
      this.debugMode = e.target.checked;
      const panel = document.getElementById('debug-panel');
      if (panel) panel.style.display = this.debugMode ? 'block' : 'none';
    });

    // Start test button
    document.getElementById('start-test-btn').addEventListener('click', () => {
      this.renderScreen(AppState.CALIBRATING);
    });

    await this.startCamera();
  }

  async startCamera() {
    // Stop existing stream
    this.stopCamera();

    try {
      const constraints = {
        video: {
          facingMode: this.currentCamera,
          width: { ideal: CONFIG.cameraWidth },
          height: { ideal: CONFIG.cameraHeight }
        }
      };

      // Update UI
      const readinessText = document.getElementById('readiness-text');
      if (readinessText) readinessText.textContent = 'Starting camera...';

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = this.stream;
      
      await new Promise((resolve) => {
        this.videoElement.onloadedmetadata = () => {
          this.canvasElement.width = this.videoElement.videoWidth;
          this.canvasElement.height = this.videoElement.videoHeight;
          resolve();
        };
      });

      await this.videoElement.play();

      // Mirror only for front-facing camera
      const container = document.querySelector('.camera-container');
      if (container) {
        if (this.currentCamera === 'user') {
          container.classList.add('mirror');
        } else {
          container.classList.remove('mirror');
        }
      }

      if (readinessText) readinessText.textContent = 'Camera active — loading pose detection...';
      
      this.startPoseDetection();
    } catch (error) {
      console.error('Camera error:', error);
      if (error.name === 'NotAllowedError') {
        this.showError('Camera permission denied. Please allow camera access to use BalanceVision.');
      } else if (error.name === 'NotFoundError') {
        this.showError('No camera found. Please connect a camera and try again.');
      } else {
        this.showError(`Unable to access camera: ${error.message || 'unknown error'}. Please check your device settings.`);
      }
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.cancelAnimationFrame();
  }

  cancelAnimationFrame() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  // ─── POSE DETECTION LOOP ──────────────────────────────────────────────

  startPoseDetection() {
    if (!this.mpLoaded) {
      // Update UI to show MediaPipe is still loading
      const readinessText = document.getElementById('readiness-text');
      if (readinessText) readinessText.textContent = 'Loading pose detection model...';
      setTimeout(() => this.startPoseDetection(), 500);
      return;
    }

    // MediaPipe is ready - update status
    const readinessText = document.getElementById('readiness-text');
    if (readinessText) readinessText.textContent = 'Pose detection active — looking for person...';

    const detect = () => {
      if (!this.videoElement || this.videoElement.paused || this.videoElement.ended) {
        this.animationId = requestAnimationFrame(detect);
        return;
      }

      const now = performance.now();
      
      // FPS calculation
      this.frameCount++;
      if (now - this.fpsTimer >= 1000) {
        this.fps = this.frameCount;
        this.frameCount = 0;
        this.fpsTimer = now;
      }

      // Ensure timestamps are always increasing for MediaPipe
      if (now <= this.lastFrameTime) {
        this.animationId = requestAnimationFrame(detect);
        return;
      }
      this.lastFrameTime = now;

      try {
        const result = this.poseLandmarker.detectForVideo(this.videoElement, now);
        this.processResult(result, now);
      } catch (error) {
        console.error('Pose detection frame error:', error);
        // Still try to update UI even if detection fails
        const indicator = document.getElementById('readiness-indicator');
        if (indicator && !this.mpErrorShown) {
          this.mpErrorShown = true;
          console.error('Full error details:', error.message, error.stack);
        }
      }

      this.animationId = requestAnimationFrame(detect);
    };

    this.animationId = requestAnimationFrame(detect);
  }

  processResult(result, timestamp) {
    const landmarks = result.landmarks?.[0] || null;
    const worldLandmarks = result.worldLandmarks?.[0] || null;

    // Draw skeleton
    this.drawSkeleton(landmarks);

    if (this.currentState === AppState.CAMERA || this.currentState === AppState.READY) {
      // Run full readiness assessment with checklist
      try {
        this.updateOperatorChecklist(landmarks);
      } catch (err) {
        console.error('Checklist update error:', err);
      }

    } else if (this.currentState === AppState.CALIBRATING) {
      const frameResult = this.engine.processFrame(landmarks, worldLandmarks, timestamp);
      if (frameResult && frameResult.state === 'CALIBRATION_COMPLETE') {
        this.onCalibrationComplete();
      }
    } else if (this.currentState === AppState.TESTING) {
      this.engine.processFrame(landmarks, worldLandmarks, timestamp);
    }

    // Debug info
    if (this.debugMode && landmarks) {
      this.updateDebugInfo(landmarks);
    }
  }

  // ─── OPERATOR CHECKLIST ───────────────────────────────────────────────

  updateOperatorChecklist(landmarks) {
    const checks = {
      person: false,
      fullbody: false,
      hands: false,
      leg: false
    };

    let hint = '';

    if (!landmarks || landmarks.length === 0) {
      hint = 'No person detected — point the camera at the participant';
    } else {
      // Check 1: Person detected
      // If we have landmarks with valid coordinates, person IS detected
      // (the skeleton is drawing, so MediaPipe found them)
      const hasBody = landmarks[LANDMARKS.LEFT_SHOULDER] && 
                      landmarks[LANDMARKS.RIGHT_SHOULDER] &&
                      landmarks[LANDMARKS.LEFT_HIP] && 
                      landmarks[LANDMARKS.RIGHT_HIP];
      checks.person = !!hasBody;

      if (!checks.person) {
        hint = 'Person partially detected — ensure good lighting and clear view';
      } else {
        // Check 2: Full body visible
        // Use a lenient visibility check — if coordinate exists, treat as somewhat visible
        const getVis = (lm) => {
          if (!lm) return 0;
          return lm.visibility ?? lm.presence ?? (lm.x !== undefined ? 0.7 : 0);
        };

        const bodyChecks = [
          { name: 'shoulders', pass: getVis(landmarks[LANDMARKS.LEFT_SHOULDER]) > 0.3 && 
                                     getVis(landmarks[LANDMARKS.RIGHT_SHOULDER]) > 0.3 },
          { name: 'hips', pass: getVis(landmarks[LANDMARKS.LEFT_HIP]) > 0.3 && 
                                getVis(landmarks[LANDMARKS.RIGHT_HIP]) > 0.3 },
          { name: 'knees', pass: getVis(landmarks[LANDMARKS.LEFT_KNEE]) > 0.3 && 
                                 getVis(landmarks[LANDMARKS.RIGHT_KNEE]) > 0.3 },
          { name: 'ankles', pass: getVis(landmarks[LANDMARKS.LEFT_ANKLE]) > 0.2 && 
                                  getVis(landmarks[LANDMARKS.RIGHT_ANKLE]) > 0.2 },
          { name: 'feet', pass: getVis(landmarks[LANDMARKS.LEFT_FOOT_INDEX]) > 0.1 && 
                                getVis(landmarks[LANDMARKS.RIGHT_FOOT_INDEX]) > 0.1 },
          { name: 'wrists', pass: getVis(landmarks[LANDMARKS.LEFT_WRIST]) > 0.3 && 
                                  getVis(landmarks[LANDMARKS.RIGHT_WRIST]) > 0.3 }
        ];

        const failedParts = bodyChecks.filter(c => !c.pass).map(c => c.name);
        checks.fullbody = failedParts.length === 0;

        if (!checks.fullbody) {
          hint = `Cannot clearly see: ${failedParts.join(', ')} — move further from camera`;
        } else {
          // Check if feet are at very edge of frame
          const maxAnkleY = Math.max(
            landmarks[LANDMARKS.LEFT_ANKLE]?.y || 0,
            landmarks[LANDMARKS.RIGHT_ANKLE]?.y || 0
          );
          if (maxAnkleY > 0.97) {
            checks.fullbody = false;
            hint = 'Feet at edge of frame — step back or angle camera down';
          }
        }

        // Check 3: Hands on hips
        if (checks.fullbody) {
          const leftWrist = landmarks[LANDMARKS.LEFT_WRIST];
          const rightWrist = landmarks[LANDMARKS.RIGHT_WRIST];
          const leftHip = landmarks[LANDMARKS.LEFT_HIP];
          const rightHip = landmarks[LANDMARKS.RIGHT_HIP];
          const leftShoulder = landmarks[LANDMARKS.LEFT_SHOULDER];
          const rightShoulder = landmarks[LANDMARKS.RIGHT_SHOULDER];

          // Torso length for normalisation
          const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
          const hipMidY = (leftHip.y + rightHip.y) / 2;
          const torsoLen = Math.abs(hipMidY - shoulderMidY) || 0.25;

          const leftDist = Math.sqrt(
            (leftWrist.x - leftHip.x) ** 2 + (leftWrist.y - leftHip.y) ** 2
          ) / torsoLen;
          const rightDist = Math.sqrt(
            (rightWrist.x - rightHip.x) ** 2 + (rightWrist.y - rightHip.y) ** 2
          ) / torsoLen;

          // Generous threshold: within 40% of torso length
          checks.hands = leftDist < 0.40 && rightDist < 0.40;

          if (!checks.hands && !hint) {
            hint = 'Ask participant to place both hands firmly on their hips';
          }
        }

        // Check 4: Correct leg raised
        // testLeg = leg to raise. MediaPipe left/right = subject's anatomical left/right.
        if (checks.fullbody) {
          const leftAnkleY = landmarks[LANDMARKS.LEFT_ANKLE]?.y || 0;
          const rightAnkleY = landmarks[LANDMARKS.RIGHT_ANKLE]?.y || 0;

          // Y increases downward in normalized coords.
          // Raised foot = smaller Y (higher in frame)
          const heightDiff = Math.abs(leftAnkleY - rightAnkleY);
          const threshold = 0.04;

          let detectedRaisedLeg = null;
          if (heightDiff > threshold) {
            if (leftAnkleY < rightAnkleY) {
              detectedRaisedLeg = 'left';
            } else {
              detectedRaisedLeg = 'right';
            }
          }

          const expectedLeg = this.participantData.testLeg;

          if (detectedRaisedLeg === expectedLeg) {
            checks.leg = true;
          } else if (detectedRaisedLeg === null && !hint) {
            hint = `Ask participant to raise their ${expectedLeg} foot off the ground`;
          } else if (detectedRaisedLeg && detectedRaisedLeg !== expectedLeg && !hint) {
            hint = `Wrong leg — please raise the ${expectedLeg} leg (${detectedRaisedLeg} is currently raised)`;
          }
        }
      }
    }

    // Update checklist UI
    this.setCheckIcon('check-person-icon', checks.person);
    this.setCheckIcon('check-fullbody-icon', checks.fullbody);
    this.setCheckIcon('check-hands-icon', checks.hands);
    this.setCheckIcon('check-leg-icon', checks.leg);

    // Update readiness indicator
    const allReady = checks.person && checks.fullbody && checks.hands && checks.leg;
    const indicator = document.getElementById('readiness-indicator');
    const readinessText = document.getElementById('readiness-text');
    
    if (indicator && readinessText) {
      if (allReady) {
        indicator.className = 'readiness-indicator level-green';
        readinessText.textContent = '✓ Ready — Press START TEST';
      } else if (checks.person && checks.fullbody) {
        indicator.className = 'readiness-indicator level-amber';
        readinessText.textContent = 'Almost ready — check position';
      } else if (checks.person) {
        indicator.className = 'readiness-indicator level-amber';
        readinessText.textContent = 'Person detected — need full body';
      } else {
        indicator.className = 'readiness-indicator level-red';
        readinessText.textContent = 'Looking for person...';
      }
    }

    // Update hint
    const hintEl = document.getElementById('operator-hint');
    if (hintEl) {
      hintEl.textContent = allReady ? '✓ All checks passed — ready to start the test' : hint;
      hintEl.className = allReady ? 'operator-hint hint-ready' : 'operator-hint';
    }

    // Enable/disable start button
    const startBtn = document.getElementById('start-test-btn');
    const startHint = document.getElementById('start-hint');
    if (startBtn) {
      startBtn.disabled = !allReady;
      if (allReady) {
        startBtn.textContent = '▶ START TEST';
        if (startHint) {
          startHint.textContent = 'Participant is in position — ready to go';
          startHint.className = 'start-hint hint-ready';
        }
      } else {
        startBtn.textContent = 'START TEST';
        if (startHint) {
          startHint.textContent = 'Complete all checklist items to enable start';
          startHint.className = 'start-hint';
        }
      }
    }
  }

  setCheckIcon(elementId, isChecked) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (isChecked) {
      el.textContent = '✓';
      el.className = 'check-icon check-pass';
    } else {
      el.textContent = '○';
      el.className = 'check-icon check-pending';
    }
  }

  // ─── SKELETON DRAWING ─────────────────────────────────────────────────

  drawSkeleton(landmarks) {
    if (!this.canvasCtx || !this.canvasElement) return;
    
    const ctx = this.canvasCtx;
    const w = this.canvasElement.width;
    const h = this.canvasElement.height;
    
    ctx.clearRect(0, 0, w, h);

    if (!landmarks || landmarks.length === 0) return;

    // Connection pairs for pose skeleton
    const connections = [
      [11, 12], // shoulders
      [11, 13], [13, 15], // left arm
      [12, 14], [14, 16], // right arm
      [11, 23], [12, 24], // torso sides
      [23, 24], // hips
      [23, 25], [25, 27], // left leg
      [24, 26], [26, 28], // right leg
      [27, 29], [29, 31], // left foot
      [28, 30], [30, 32], // right foot
      [27, 31], [28, 32]  // ankle to toe
    ];

    // Draw connections with glow effect
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 6;
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';

    for (const [startIdx, endIdx] of connections) {
      const start = landmarks[startIdx];
      const end = landmarks[endIdx];
      if (!start || !end) continue;
      if (start.visibility < 0.4 || end.visibility < 0.4) continue;

      // Dim lines for low-confidence connections
      const avgVis = (start.visibility + end.visibility) / 2;
      ctx.globalAlpha = Math.max(0.3, avgVis);
      
      ctx.beginPath();
      ctx.moveTo(start.x * w, start.y * h);
      ctx.lineTo(end.x * w, end.y * h);
      ctx.stroke();
    }

    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 0;

    // Draw landmarks as circles
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (!lm || lm.visibility < 0.4) continue;
      
      // Only draw body landmarks (skip face mesh points 0-10)
      if (i < 11) continue;

      const radius = lm.visibility > 0.7 ? 7 : 5;
      const x = lm.x * w;
      const y = lm.y * h;

      // Green = high confidence, Orange = medium, Red = low
      let color;
      if (lm.visibility > 0.8) {
        color = '#4caf50'; // green
      } else if (lm.visibility > 0.6) {
        color = '#00e5ff'; // cyan
      } else {
        color = '#ffab40'; // amber
      }

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // During testing, draw green border
    if (this.currentState === AppState.TESTING) {
      this.drawTestingOverlay(ctx, w, h);
    }
  }

  drawTestingOverlay(ctx, w, h) {
    // Green border when testing is active
    ctx.strokeStyle = 'rgba(76, 175, 80, 0.6)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
  }

  // ─── READINESS (now handled by updateOperatorChecklist above) ────────

  // ─── CALIBRATION ──────────────────────────────────────────────────────

  startCalibration() {
    this.currentState = AppState.CALIBRATING;
    
    // The raised leg is what was selected in setup
    // Support leg is the opposite
    const supportLeg = this.participantData.testLeg === 'left' ? 'right' : 'left';
    this.engine.startCalibration(supportLeg);

    // Update UI
    const readinessIndicator = document.getElementById('readiness-indicator');
    if (readinessIndicator) {
      readinessIndicator.className = 'readiness-indicator level-amber';
      document.getElementById('readiness-text').textContent = 'Calibrating... Hold position';
    }

    const startBtn = document.getElementById('start-test-btn');
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.textContent = 'CALIBRATING...';
    }

    if (this.voiceEnabled) {
      this.speak('Calibrating. Hold your position.');
    }
  }

  onCalibrationComplete() {
    this.startTest();
  }

  // ─── TESTING ──────────────────────────────────────────────────────────

  startTest() {
    this.currentState = AppState.TESTING;
    this.engine.startTest(this.participantData.maxDuration);
    this.testStartTime = performance.now();

    // Replace camera controls with test UI
    const controls = document.querySelector('.camera-controls');
    if (controls) {
      controls.innerHTML = `
        <div class="test-active-ui">
          <div class="test-status">BALANCE TEST ACTIVE</div>
          <div class="test-timer" id="test-timer">00:00.0</div>
          <div class="test-instruction">Maintain Position</div>
          <div id="test-warnings" class="test-warnings"></div>
          <button id="stop-test-btn" class="btn btn-danger btn-large">
            STOP TEST
          </button>
        </div>
      `;

      document.getElementById('stop-test-btn').addEventListener('click', () => {
        this.engine.stopTest('Stopped by assessor');
      });
    }

    // Update readiness indicator
    const indicator = document.getElementById('readiness-indicator');
    if (indicator) {
      indicator.className = 'readiness-indicator level-green';
      document.getElementById('readiness-text').textContent = 'TEST IN PROGRESS';
    }

    // Start timer display
    this.startTimerDisplay();

    if (this.voiceEnabled) {
      this.speak('Test started. Hold your position.');
    }
  }

  startTimerDisplay() {
    const timerEl = document.getElementById('test-timer');
    if (!timerEl) return;

    const updateTimer = () => {
      if (this.currentState !== AppState.TESTING) return;
      const elapsed = (performance.now() - this.testStartTime) / 1000;
      const minutes = Math.floor(elapsed / 60);
      const seconds = Math.floor(elapsed % 60);
      const tenths = Math.floor((elapsed * 10) % 10);
      timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
      requestAnimationFrame(updateTimer);
    };
    requestAnimationFrame(updateTimer);
  }

  // ─── LIVE DATA DISPLAY ────────────────────────────────────────────────

  onLiveData(data) {
    // Update warnings
    const warningsEl = document.getElementById('test-warnings');
    if (warningsEl && data.failureWarnings.length > 0) {
      const warningTexts = {
        'foot_lowering': '⚠️ Foot lowering',
        'hands_moving': '⚠️ Hands moving',
        'legs_close': '⚠️ Legs close',
        'major_movement': '⚠️ Large movement'
      };
      warningsEl.innerHTML = data.failureWarnings
        .map(w => `<span class="warning-tag">${warningTexts[w] || w}</span>`)
        .join(' ');
    } else if (warningsEl) {
      warningsEl.innerHTML = '';
    }

    // Debug panel
    if (this.debugMode) {
      const debugEl = document.getElementById('debug-info');
      if (debugEl) {
        debugEl.innerHTML = `
          <div>FPS: ${this.fps}</div>
          <div>Elapsed: ${data.elapsed.toFixed(1)}s</div>
          <div>Torso Tilt: ${data.torsoTilt.toFixed(1)}°</div>
          <div>Hip Angle: ${data.hipAngle.toFixed(1)}°</div>
          <div>Knee Angle: ${data.supportKneeAngle.toFixed(1)}°</div>
          <div>Corrective: ${data.correctiveCount}</div>
          <div>Warnings: ${data.failureWarnings.join(', ') || 'none'}</div>
        `;
      }
    }
  }

  // ─── TEST COMPLETION ──────────────────────────────────────────────────

  onTestComplete(data) {
    this.currentState = AppState.COMPLETED;
    this.stopCamera();
    this.cancelAnimationFrame();

    // Save result
    const supportLeg = this.participantData.testLeg === 'left' ? 'right' : 'left';
    this.lastResult = this.resultsManager.saveResult(
      this.participantData,
      data.metrics,
      supportLeg
    );
    this.lastTestData = this.engine.getTestData();
    this.lastCalibrationData = this.engine.getCalibrationData();

    if (this.voiceEnabled) {
      this.speak(`Test complete. ${data.duration.toFixed(1)} seconds. ${data.reason}`);
    }

    // Show results after brief delay
    setTimeout(() => {
      this.renderScreen(AppState.RESULTS);
    }, 500);
  }

  // ─── TRACKING EVENTS ─────────────────────────────────────────────────

  onTrackingLost() {
    const indicator = document.getElementById('readiness-indicator');
    if (indicator && this.currentState === AppState.TESTING) {
      indicator.className = 'readiness-indicator level-amber';
      document.getElementById('readiness-text').textContent = 'Pose tracking temporarily lost';
    }
  }

  onTrackingRestored() {
    const indicator = document.getElementById('readiness-indicator');
    if (indicator && this.currentState === AppState.TESTING) {
      indicator.className = 'readiness-indicator level-green';
      document.getElementById('readiness-text').textContent = 'TEST IN PROGRESS';
    }
  }

  onTrackingTimeout() {
    const indicator = document.getElementById('readiness-indicator');
    if (indicator) {
      indicator.className = 'readiness-indicator level-red';
      document.getElementById('readiness-text').textContent = 'Tracking lost — consider restarting';
    }
  }

  // ─── RESULTS SCREEN ───────────────────────────────────────────────────

  renderResultsScreen() {
    const r = this.lastResult;
    if (!r) return this.renderHomeScreen();

    const ageRef = this.resultsManager.getAgeComparisonText(r.duration, r.age);
    const tenSec = this.resultsManager.getTenSecondIndicator(r.duration, r.age);
    const sideComp = this.resultsManager.getSideComparison(r.participantId);
    const screening = this.resultsManager.getBalanceScreeningResult(r, r.age);
    const isChild = r.participantType === 'child';

    let sportProfileHtml = '';
    if (isChild) {
      const sportProfile = this.resultsManager.getSportProfile(r, sideComp);
      sportProfileHtml = this.renderSportProfile(sportProfile);
    }

    return `
      <div class="screen results-screen">
        <nav class="nav-bar">
          <button data-nav="HOME" class="nav-btn">← Home</button>
          <span class="nav-title">Results</span>
          <button data-nav="HISTORY" class="nav-btn">History</button>
        </nav>

        <!-- Primary Result Card -->
        <div class="result-card result-card-primary">
          <div class="result-card-header">BALANCEVISION</div>
          <div class="result-card-subheader">Single-Leg Balance Assessment</div>
          <div class="result-duration">${r.duration.toFixed(1)} <span class="unit">seconds</span></div>
          <div class="result-leg">${r.supportLeg.toUpperCase()} LEG SUPPORT</div>
          <div class="result-reason">${r.terminationReason}</div>
        </div>

        <!-- Stability Score -->
        <div class="result-card">
          <h3>BalanceVision Stability Score</h3>
          <div class="score-display">
            <span class="score-value">${r.stabilityScore}</span>
            <span class="score-max">/ 100</span>
          </div>
          <div class="score-label">${r.performanceLabel}</div>
          <p class="score-disclaimer" title="This is an application-generated performance indicator and is not a validated clinical score.">
            ℹ️ Application-generated indicator — not a validated clinical score
          </p>
        </div>

        ${!isChild ? `
        <!-- Balance Screening Result -->
        <div class="result-card">
          <h3>Balance Screening Result</h3>
          <p class="screening-result">Your performance suggests: <strong>${screening.result}</strong></p>
          ${screening.additionalAdvice ? `<p class="screening-advice">${screening.additionalAdvice}</p>` : ''}
        </div>
        ` : `
        <!-- Child: Movement Balance Profile -->
        <div class="result-card">
          <h3>Movement Balance Profile</h3>
          <p>Balance duration and postural stability assessment</p>
        </div>
        `}

        <!-- Age Reference -->
        ${ageRef ? `
        <div class="result-card">
          <h3>Age Reference</h3>
          <p>Your best trial: <strong>${r.duration.toFixed(1)} s</strong></p>
          <p>Reference for age group ${ageRef.ageGroup}: approximately <strong>${ageRef.referenceValue} s</strong></p>
          <p>Your result is approximately ${ageRef.absDifference} s <strong>${ageRef.comparison}</strong>.</p>
        </div>
        ` : ''}

        <!-- 10-Second Indicator -->
        ${tenSec ? `
        <div class="result-card">
          <h3>10-Second Balance Indicator</h3>
          <div class="indicator-badge ${tenSec.completed ? 'badge-success' : 'badge-warning'}">
            ${tenSec.text}
          </div>
          <p class="indicator-explanation">${tenSec.explanation}</p>
        </div>
        ` : ''}

        <!-- Metric Cards -->
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-label">Mean Torso Tilt</div>
            <div class="metric-value">${r.meanTorsoTilt}°</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Maximum Torso Tilt</div>
            <div class="metric-value">${r.maxTorsoTilt}°</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Lateral Stability</div>
            <div class="metric-value">${r.swayClassification}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Peak Angular Velocity</div>
            <div class="metric-value">${r.peakAngularVelocity}°/s</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Corrective Movements</div>
            <div class="metric-value">${r.correctiveMovements}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Supporting Knee Stability</div>
            <div class="metric-value">SD ${r.kneeVariability}°</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Pelvic Stability</div>
            <div class="metric-value">SD ${r.pelvicVariability}°</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Raised-Leg Control</div>
            <div class="metric-value">${r.raisedLegVariability.toFixed(3)}</div>
          </div>
        </div>

        <!-- Side-to-Side Comparison -->
        ${sideComp ? `
        <div class="result-card">
          <h3>Side-to-Side Difference</h3>
          <div class="side-comparison">
            <span>LEFT SUPPORT <strong>${sideComp.leftDuration.toFixed(1)} s</strong></span>
            <span>RIGHT SUPPORT <strong>${sideComp.rightDuration.toFixed(1)} s</strong></span>
          </div>
          <p>Absolute difference: ${sideComp.absoluteDifference} s (${sideComp.percentageDifference}%)</p>
        </div>
        ` : ''}

        <!-- Sport Profile (Child/Youth only) -->
        ${sportProfileHtml}

        <!-- Charts -->
        <div class="result-card chart-card">
          <h3>Stability Over Time</h3>
          <div class="chart-container">
            <canvas id="stability-chart"></canvas>
          </div>
        </div>
        <div class="result-card chart-card">
          <h3>Body Sway Trace</h3>
          <div class="chart-container chart-square">
            <canvas id="sway-chart"></canvas>
          </div>
        </div>
        ${sideComp ? `
        <div class="result-card chart-card">
          <h3>Left vs Right</h3>
          <div class="chart-container">
            <canvas id="leftright-chart"></canvas>
          </div>
        </div>
        ` : ''}

        <!-- Actions -->
        <div class="result-actions">
          <button class="btn btn-primary" data-nav="SETUP">New Test</button>
          <button class="btn btn-secondary" data-nav="HISTORY">View History</button>
          <button class="btn btn-secondary" data-nav="HOME">Home</button>
        </div>
      </div>
    `;
  }

  renderSportProfile(sportData) {
    if (!sportData) return '';
    const profile = sportData.profile;

    return `
      <div class="result-card sport-profile-card">
        <h3>Explore Your Sport Movement Profile</h3>
        <p class="sport-disclaimer">
          These suggestions are based only on balance-related characteristics measured during this activity. 
          Sport aptitude depends on many other physical, technical, psychological, and environmental factors.
        </p>
        <div class="sport-profile-result">
          <h4>${profile.label}</h4>
          ${profile.description ? `<p>${profile.description}</p>` : ''}
          ${profile.sports.length > 0 ? `
          <ul class="sport-list">
            ${profile.sports.map(s => `<li>${s}</li>`).join('')}
          </ul>
          ` : ''}
          <p class="sport-reason">${profile.reason}</p>
        </div>
        <p class="sport-profile-note">
          Your balance profile shows characteristics that are useful in activities requiring 
          single-leg stability, postural control, and precise body positioning.
        </p>
      </div>
    `;
  }

  renderCharts() {
    // Small delay to ensure canvas elements exist
    setTimeout(() => {
      const testData = this.lastTestData;
      const calData = this.lastCalibrationData;

      // Stability over time
      const stabilityData = this.resultsManager.getStabilityOverTimeData(testData);
      if (stabilityData) {
        this.chartRenderer.renderStabilityChart('stability-chart', stabilityData);
      }

      // Sway trace
      const swayData = this.resultsManager.getSwayTraceData(testData, calData);
      if (swayData) {
        this.chartRenderer.renderSwayTrace('sway-chart', swayData);
      }

      // Left vs right
      const lrData = this.resultsManager.getLeftRightComparisonData(this.participantData.participantId);
      if (lrData) {
        this.chartRenderer.renderLeftRightChart('leftright-chart', lrData);
      }
    }, 100);
  }

  // ─── HISTORY SCREEN ───────────────────────────────────────────────────

  renderHistoryScreen() {
    const results = this.resultsManager.getAllResults();

    let historyHtml = '';
    if (results.length === 0) {
      historyHtml = '<p class="empty-state">No previous tests recorded.</p>';
    } else {
      historyHtml = results.slice().reverse().map(r => `
        <div class="history-item">
          <div class="history-item-header">
            <span class="history-id">${r.participantId}</span>
            <span class="history-date">${new Date(r.timestamp).toLocaleDateString()}</span>
          </div>
          <div class="history-item-body">
            <span><strong>${r.duration.toFixed(1)} s</strong> — ${r.supportLeg} support</span>
            <span>Score: ${r.stabilityScore}/100</span>
            <span class="history-reason">${r.terminationReason}</span>
          </div>
          <button class="btn btn-small btn-danger" onclick="app.deleteResult('${r.id}')">Delete</button>
        </div>
      `).join('');
    }

    return `
      <div class="screen history-screen">
        <nav class="nav-bar">
          <button data-nav="HOME" class="nav-btn">← Home</button>
          <span class="nav-title">Results History</span>
        </nav>
        <div class="history-content">
          ${historyHtml}
        </div>
        ${results.length > 0 ? `
        <div class="history-actions">
          <button class="btn btn-danger" onclick="app.clearHistory()">Delete All History</button>
        </div>
        ` : ''}
      </div>
    `;
  }

  deleteResult(id) {
    if (confirm('Delete this result?')) {
      this.resultsManager.deleteResult(id);
      this.renderScreen(AppState.HISTORY);
    }
  }

  clearHistory() {
    if (confirm('Delete all test history? This cannot be undone.')) {
      this.resultsManager.deleteAllResults();
      this.renderScreen(AppState.HISTORY);
    }
  }

  // ─── ABOUT SCREEN ────────────────────────────────────────────────────

  renderAboutScreen() {
    return `
      <div class="screen about-screen">
        <nav class="nav-bar">
          <button data-nav="HOME" class="nav-btn">← Home</button>
          <span class="nav-title">About</span>
        </nav>
        <div class="about-content">
          <h2>About BalanceVision</h2>
          <p>
            BalanceVision uses pose estimation to track body landmarks during a single-leg stance.
          </p>
          <h3>It measures:</h3>
          <ul>
            <li>Balance duration</li>
            <li>Torso stability</li>
            <li>Body sway</li>
            <li>Angular movement</li>
            <li>Corrective movements</li>
            <li>Left-right performance</li>
          </ul>
          <h3>Technology</h3>
          <p>
            Powered by Google MediaPipe Pose Landmarker, running entirely in your browser.
            No data leaves your device.
          </p>
          <div class="disclaimer-card">
            <h3>⚠️ Disclaimer</h3>
            <p>
              BalanceVision is intended for educational, wellness, fitness and screening applications. 
              It is not a medical diagnostic device. Results are computer-vision-assisted estimates 
              and should not be used for clinical diagnosis.
            </p>
          </div>
          <h3>Privacy</h3>
          <p>
            Camera images are processed on this device for pose estimation and are not stored or uploaded 
            by BalanceVision. Only derived numerical results may be saved locally in your browser.
          </p>
        </div>
      </div>
    `;
  }

  // ─── DEBUG ────────────────────────────────────────────────────────────

  updateDebugInfo(landmarks) {
    const debugEl = document.getElementById('debug-info');
    if (!debugEl || !this.debugMode) return;
    if (this.currentState === AppState.TESTING) return; // Updated in onLiveData

    const keyPoints = this.engine.extractKeyPoints(landmarks);
    const torsoTilt = this.engine.calculateTorsoTilt(keyPoints);
    const leftWristHip = distance2D(keyPoints.leftWrist, keyPoints.leftHip) / keyPoints.torsoLength;
    const rightWristHip = distance2D(keyPoints.rightWrist, keyPoints.rightHip) / keyPoints.torsoLength;

    debugEl.innerHTML = `
      <div>FPS: ${this.fps}</div>
      <div>Torso Tilt: ${torsoTilt.toFixed(1)}°</div>
      <div>L Wrist-Hip: ${leftWristHip.toFixed(3)}</div>
      <div>R Wrist-Hip: ${rightWristHip.toFixed(3)}</div>
      <div>L Ankle Y: ${landmarks[LANDMARKS.LEFT_ANKLE]?.y.toFixed(3) || 'N/A'}</div>
      <div>R Ankle Y: ${landmarks[LANDMARKS.RIGHT_ANKLE]?.y.toFixed(3) || 'N/A'}</div>
      <div>Knee L: ${landmarks[LANDMARKS.LEFT_KNEE]?.visibility.toFixed(2) || 'N/A'}</div>
      <div>Knee R: ${landmarks[LANDMARKS.RIGHT_KNEE]?.visibility.toFixed(2) || 'N/A'}</div>
    `;
    debugEl.style.display = 'block';
  }

  // ─── VOICE ────────────────────────────────────────────────────────────

  speak(text) {
    if (!this.voiceEnabled || !this.synth) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    this.synth.speak(utterance);
  }

  // ─── ERROR HANDLING ───────────────────────────────────────────────────

  showError(message) {
    const app = document.getElementById('app');
    const errorHtml = `
      <div class="error-overlay">
        <div class="error-card">
          <h3>⚠️ Error</h3>
          <p>${message}</p>
          <button class="btn btn-primary" data-nav="HOME">Return Home</button>
        </div>
      </div>
    `;
    
    // Append error overlay
    const div = document.createElement('div');
    div.innerHTML = errorHtml;
    app.appendChild(div.firstElementChild);
  }
}

// ─── Initialize App ─────────────────────────────────────────────────────────

let app;

function startApp() {
  app = new BalanceVisionApp();
  window.app = app; // Make accessible for inline onclick handlers
  app.init();
}

// Module scripts are deferred — DOM is already ready when this runs
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
