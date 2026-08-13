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
      // Wait for MediaPipe module to be loaded (from index.html module script)
      const getMediaPipe = () => {
        return new Promise((resolve) => {
          if (window.__mediapipe) {
            resolve(window.__mediapipe);
          } else {
            window.addEventListener('mediapipe-ready', () => resolve(window.__mediapipe), { once: true });
          }
        });
      };

      const { PoseLandmarker, FilesetResolver, DrawingUtils } = await getMediaPipe();

      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm'
      );

      this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
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

      this.DrawingUtils = DrawingUtils;
      this.PoseLandmarker = PoseLandmarker;
      this.mpLoaded = true;
      console.log('MediaPipe Pose Landmarker loaded successfully');
    } catch (error) {
      console.error('Failed to load MediaPipe:', error);
      this.showError('Failed to load pose detection model. Please check your internet connection and try again.');
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
          <button id="toggle-camera-btn" class="nav-btn">🔄 Switch Camera</button>
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
          <div id="leg-warning" class="leg-warning" style="display:none;"></div>
        </div>

        <div class="camera-controls">
          <div class="voice-toggle">
            <label class="toggle-label">
              <input type="checkbox" id="voice-toggle" ${this.voiceEnabled ? 'checked' : ''}>
              <span>Voice Guidance ${this.voiceEnabled ? 'ON' : 'OFF'}</span>
            </label>
          </div>
          <div class="camera-instructions">
            <p>Stand tall • Hands on hips • Raise one foot • Look forward</p>
          </div>
          <button id="start-test-btn" class="btn btn-primary btn-large" disabled>
            START TEST
          </button>
        </div>

        <div id="debug-panel" class="debug-panel" style="display:${this.debugMode ? 'block' : 'none'}">
          <button id="toggle-debug" class="btn btn-small">🔧 Debug</button>
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

    // Start test button
    document.getElementById('start-test-btn').addEventListener('click', () => {
      this.renderScreen(AppState.CALIBRATING);
    });

    // Debug toggle
    const debugBtn = document.getElementById('toggle-debug');
    if (debugBtn) {
      debugBtn.addEventListener('click', () => {
        this.debugMode = !this.debugMode;
        document.getElementById('debug-info').style.display = this.debugMode ? 'block' : 'none';
      });
    }

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
      this.startPoseDetection();
    } catch (error) {
      console.error('Camera error:', error);
      if (error.name === 'NotAllowedError') {
        this.showError('Camera permission denied. Please allow camera access to use BalanceVision.');
      } else {
        this.showError('Unable to access camera. Please check your device settings.');
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
      setTimeout(() => this.startPoseDetection(), 500);
      return;
    }

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
        // Silently handle occasional detection errors
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
      // Check readiness
      const readiness = this.engine.checkReadiness(landmarks);
      this.updateReadinessUI(readiness);

      // Detect which leg is raised
      if (landmarks) {
        const detectedLeg = this.engine.detectRaisedLeg(landmarks);
        this.checkLegSelection(detectedLeg);
      }

      // Enable start button when ready
      const startBtn = document.getElementById('start-test-btn');
      if (startBtn) {
        startBtn.disabled = !readiness.ready;
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

    // Draw connections
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    for (const [startIdx, endIdx] of connections) {
      const start = landmarks[startIdx];
      const end = landmarks[endIdx];
      if (!start || !end) continue;
      if (start.visibility < 0.5 || end.visibility < 0.5) continue;

      ctx.beginPath();
      ctx.moveTo(start.x * w, start.y * h);
      ctx.lineTo(end.x * w, end.y * h);
      ctx.stroke();
    }

    // Draw landmarks
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (!lm || lm.visibility < 0.5) continue;
      
      // Only draw body landmarks (skip face)
      if (i < 11) continue;

      ctx.beginPath();
      ctx.arc(lm.x * w, lm.y * h, 5, 0, 2 * Math.PI);
      ctx.fillStyle = lm.visibility > 0.8 ? '#00e5ff' : '#ffab40';
      ctx.fill();
    }

    // During testing, draw status overlay
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

  // ─── READINESS UI ─────────────────────────────────────────────────────

  updateReadinessUI(readiness) {
    const indicator = document.getElementById('readiness-indicator');
    const text = document.getElementById('readiness-text');
    if (!indicator || !text) return;

    indicator.className = `readiness-indicator level-${readiness.level}`;
    text.textContent = readiness.status;
  }

  checkLegSelection(detectedLeg) {
    const warning = document.getElementById('leg-warning');
    if (!warning) return;

    if (detectedLeg && detectedLeg !== this.participantData.testLeg) {
      warning.style.display = 'block';
      warning.textContent = `⚠️ Please raise the ${this.participantData.testLeg} leg (detected: ${detectedLeg} leg raised)`;
    } else {
      warning.style.display = 'none';
    }
  }

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
document.addEventListener('DOMContentLoaded', () => {
  app = new BalanceVisionApp();
  app.init();
});
