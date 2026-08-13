/**
 * BalanceVision - Balance Engine
 * 
 * Core test logic: landmark processing, failure detection, metric calculation,
 * temporal smoothing, and calibration.
 */

// ─── Landmark Indices (MediaPipe Pose) ──────────────────────────────────────
const LANDMARKS = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32
};

// ─── Utility Functions ──────────────────────────────────────────────────────

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z || 0) + (b.z || 0)) / 2
  };
}

function distance2D(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function distance3D(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((a.z || 0) - (b.z || 0)) ** 2);
}

function angleBetweenPoints(a, b, c) {
  // Angle at point b formed by vectors b->a and b->c
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const magBA = Math.sqrt(ba.x ** 2 + ba.y ** 2);
  const magBC = Math.sqrt(bc.x ** 2 + bc.y ** 2);
  if (magBA === 0 || magBC === 0) return 0;
  const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return Math.acos(cosAngle) * (180 / Math.PI);
}

function angleFromVertical(vector) {
  // Angle between a vector and the vertical (pointing up: 0, -1)
  // In normalized coords, Y increases downward, so vertical is (0, -1)
  const mag = Math.sqrt(vector.x ** 2 + vector.y ** 2);
  if (mag === 0) return 0;
  // Vertical unit vector pointing up in screen coords
  const dot = vector.x * 0 + vector.y * (-1);
  const cosAngle = Math.max(-1, Math.min(1, dot / mag));
  return Math.acos(cosAngle) * (180 / Math.PI);
}

function radToDeg(rad) {
  return rad * (180 / Math.PI);
}

// ─── Exponential Moving Average Smoother ────────────────────────────────────

class LandmarkSmoother {
  constructor(alpha = CONFIG.smoothingAlpha) {
    this.alpha = alpha;
    this.smoothed = null;
  }

  update(landmarks) {
    if (!this.smoothed) {
      this.smoothed = JSON.parse(JSON.stringify(landmarks));
      return this.smoothed;
    }

    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      const sm = this.smoothed[i];
      
      // Only smooth if confidence is adequate
      if (lm.visibility >= CONFIG.landmarkConfidenceThreshold) {
        sm.x = this.alpha * lm.x + (1 - this.alpha) * sm.x;
        sm.y = this.alpha * lm.y + (1 - this.alpha) * sm.y;
        sm.z = this.alpha * (lm.z || 0) + (1 - this.alpha) * (sm.z || 0);
        sm.visibility = lm.visibility;
      }
    }

    return this.smoothed;
  }

  reset() {
    this.smoothed = null;
  }
}

// ─── Balance Engine Class ───────────────────────────────────────────────────

class BalanceEngine {
  constructor() {
    this.state = 'IDLE'; // IDLE, CALIBRATING, TESTING, COMPLETED
    this.smoother = new LandmarkSmoother();
    this.calibrationData = null;
    this.testData = null;
    this.metrics = null;
    this.failureState = {};
    this.listeners = {};
    
    // Tracking loss
    this.lastTrackingTime = 0;
    this.trackingLost = false;
    this.trackingLostStart = 0;
    
    // Corrective movement detection
    this.lastCorrectiveTime = 0;
    this.inCorrective = false;
  }

  // ─── Event System ───────────────────────────────────────────────────────
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }

  // ─── State Management ───────────────────────────────────────────────────

  startCalibration(supportLeg) {
    this.state = 'CALIBRATING';
    this.supportLeg = supportLeg; // 'left' or 'right'
    this.raisedLeg = supportLeg === 'left' ? 'right' : 'left';
    this.calibrationFrames = [];
    this.calibrationStartTime = performance.now();
    this.smoother.reset();
    this.emit('stateChange', { state: 'CALIBRATING' });
  }

  startTest(maxDuration) {
    this.state = 'TESTING';
    this.testStartTime = performance.now();
    this.maxDuration = maxDuration * 1000; // Convert to ms
    this.testData = {
      frames: [],
      torsoTilts: [],
      hipMidpoints: [],
      shoulderMidpoints: [],
      angularVelocities: [],
      kneeAngles: [],
      pelvicTilts: [],
      raisedLegPositions: [],
      timestamps: []
    };
    this.metrics = this.createEmptyMetrics();
    this.failureState = {
      footGround: { active: false, startTime: 0 },
      handHip: { active: false, startTime: 0 },
      legContact: { active: false, startTime: 0 },
      majorCorrection: { active: false, startTime: 0 }
    };
    this.correctiveCount = 0;
    this.lastCorrectiveTime = 0;
    this.inCorrective = false;
    this.emit('stateChange', { state: 'TESTING' });
  }

  stopTest(reason) {
    if (this.state !== 'TESTING') return;
    this.state = 'COMPLETED';
    const duration = (performance.now() - this.testStartTime) / 1000;
    this.finalizeMetrics(duration, reason);
    this.emit('testComplete', {
      duration: duration,
      reason: reason,
      metrics: this.metrics
    });
    this.emit('stateChange', { state: 'COMPLETED' });
  }

  // ─── Frame Processing ───────────────────────────────────────────────────

  processFrame(landmarks, worldLandmarks, timestamp) {
    if (!landmarks || landmarks.length === 0) {
      this.handleTrackingLoss(timestamp);
      return null;
    }

    // Check overall tracking quality
    const avgVisibility = this.getAverageVisibility(landmarks);
    if (avgVisibility < CONFIG.landmarkConfidenceThreshold) {
      this.handleTrackingLoss(timestamp);
      return null;
    }

    this.lastTrackingTime = timestamp;
    if (this.trackingLost) {
      this.trackingLost = false;
      this.emit('trackingRestored', {});
    }

    // Smooth landmarks
    const smoothed = this.smoother.update(landmarks);

    // Extract key points
    const keyPoints = this.extractKeyPoints(smoothed);

    if (this.state === 'CALIBRATING') {
      return this.processCalibrationFrame(keyPoints, timestamp);
    } else if (this.state === 'TESTING') {
      return this.processTestFrame(keyPoints, worldLandmarks, timestamp);
    }

    return { keyPoints, state: this.state };
  }

  handleTrackingLoss(timestamp) {
    if (!this.trackingLost) {
      this.trackingLost = true;
      this.trackingLostStart = timestamp;
      this.emit('trackingLost', {});
    } else if (this.state === 'TESTING') {
      const lostDuration = timestamp - this.trackingLostStart;
      if (lostDuration > CONFIG.trackingLostTimeoutMs) {
        this.emit('trackingTimeout', { duration: lostDuration });
      }
    }
  }

  getAverageVisibility(landmarks) {
    const keyIndices = [
      LANDMARKS.LEFT_SHOULDER, LANDMARKS.RIGHT_SHOULDER,
      LANDMARKS.LEFT_HIP, LANDMARKS.RIGHT_HIP,
      LANDMARKS.LEFT_KNEE, LANDMARKS.RIGHT_KNEE,
      LANDMARKS.LEFT_ANKLE, LANDMARKS.RIGHT_ANKLE
    ];
    let sum = 0;
    for (const idx of keyIndices) {
      sum += (landmarks[idx]?.visibility || 0);
    }
    return sum / keyIndices.length;
  }

  extractKeyPoints(landmarks) {
    const lm = landmarks;
    return {
      leftShoulder: lm[LANDMARKS.LEFT_SHOULDER],
      rightShoulder: lm[LANDMARKS.RIGHT_SHOULDER],
      leftElbow: lm[LANDMARKS.LEFT_ELBOW],
      rightElbow: lm[LANDMARKS.RIGHT_ELBOW],
      leftWrist: lm[LANDMARKS.LEFT_WRIST],
      rightWrist: lm[LANDMARKS.RIGHT_WRIST],
      leftHip: lm[LANDMARKS.LEFT_HIP],
      rightHip: lm[LANDMARKS.RIGHT_HIP],
      leftKnee: lm[LANDMARKS.LEFT_KNEE],
      rightKnee: lm[LANDMARKS.RIGHT_KNEE],
      leftAnkle: lm[LANDMARKS.LEFT_ANKLE],
      rightAnkle: lm[LANDMARKS.RIGHT_ANKLE],
      leftHeel: lm[LANDMARKS.LEFT_HEEL],
      rightHeel: lm[LANDMARKS.RIGHT_HEEL],
      leftFootIndex: lm[LANDMARKS.LEFT_FOOT_INDEX],
      rightFootIndex: lm[LANDMARKS.RIGHT_FOOT_INDEX],
      shoulderMid: midpoint(lm[LANDMARKS.LEFT_SHOULDER], lm[LANDMARKS.RIGHT_SHOULDER]),
      hipMid: midpoint(lm[LANDMARKS.LEFT_HIP], lm[LANDMARKS.RIGHT_HIP]),
      shoulderWidth: distance2D(lm[LANDMARKS.LEFT_SHOULDER], lm[LANDMARKS.RIGHT_SHOULDER]),
      torsoLength: distance2D(
        midpoint(lm[LANDMARKS.LEFT_SHOULDER], lm[LANDMARKS.RIGHT_SHOULDER]),
        midpoint(lm[LANDMARKS.LEFT_HIP], lm[LANDMARKS.RIGHT_HIP])
      )
    };
  }

  // ─── Calibration ───────────────────────────────────────────────────────

  processCalibrationFrame(keyPoints, timestamp) {
    this.calibrationFrames.push({ keyPoints, timestamp });

    const elapsed = timestamp - this.calibrationStartTime;
    if (elapsed >= CONFIG.calibrationDurationMs) {
      this.finalizeCalibration();
      return { state: 'CALIBRATION_COMPLETE', calibration: this.calibrationData };
    }

    return { state: 'CALIBRATING', progress: elapsed / CONFIG.calibrationDurationMs };
  }

  finalizeCalibration() {
    const frames = this.calibrationFrames;
    if (frames.length === 0) return;

    // Average all calibration frames
    const avgKeyPoints = this.averageKeyPoints(frames.map(f => f.keyPoints));

    this.calibrationData = {
      torsoLength: avgKeyPoints.torsoLength,
      shoulderWidth: avgKeyPoints.shoulderWidth,
      hipMid: avgKeyPoints.hipMid,
      shoulderMid: avgKeyPoints.shoulderMid,
      // Wrist-to-hip baseline distances
      leftWristToHip: distance2D(avgKeyPoints.leftWrist, avgKeyPoints.leftHip),
      rightWristToHip: distance2D(avgKeyPoints.rightWrist, avgKeyPoints.rightHip),
      // Support foot baseline
      supportAnkleY: this.supportLeg === 'left' ? avgKeyPoints.leftAnkle.y : avgKeyPoints.rightAnkle.y,
      supportAnkleX: this.supportLeg === 'left' ? avgKeyPoints.leftAnkle.x : avgKeyPoints.rightAnkle.x,
      // Raised foot baseline
      raisedAnkleY: this.raisedLeg === 'left' ? avgKeyPoints.leftAnkle.y : avgKeyPoints.rightAnkle.y,
      raisedKneeAngle: this.getRaisedKneeAngle(avgKeyPoints),
      // Support knee baseline
      supportKneeAngle: this.getSupportKneeAngle(avgKeyPoints),
      // Body height estimate (shoulder to ankle)
      bodyHeight: Math.abs(avgKeyPoints.shoulderMid.y - 
        (this.supportLeg === 'left' ? avgKeyPoints.leftAnkle.y : avgKeyPoints.rightAnkle.y)),
      // Initial torso tilt
      baseTorsoTilt: this.calculateTorsoTilt(avgKeyPoints),
      // Hip line angle
      baseHipAngle: this.calculateHipAngle(avgKeyPoints)
    };

    this.emit('calibrationComplete', this.calibrationData);
  }

  averageKeyPoints(keyPointsArray) {
    if (keyPointsArray.length === 0) return null;
    // Use the last frame as template, average positions
    const result = JSON.parse(JSON.stringify(keyPointsArray[keyPointsArray.length - 1]));
    const n = keyPointsArray.length;

    const pointNames = [
      'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow',
      'leftWrist', 'rightWrist', 'leftHip', 'rightHip',
      'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle',
      'leftHeel', 'rightHeel', 'leftFootIndex', 'rightFootIndex',
      'shoulderMid', 'hipMid'
    ];

    for (const name of pointNames) {
      let sumX = 0, sumY = 0, sumZ = 0;
      for (const kp of keyPointsArray) {
        sumX += kp[name].x;
        sumY += kp[name].y;
        sumZ += (kp[name].z || 0);
      }
      result[name] = { x: sumX / n, y: sumY / n, z: sumZ / n, visibility: result[name].visibility };
    }

    // Recalculate derived values
    result.shoulderWidth = distance2D(result.leftShoulder, result.rightShoulder);
    result.torsoLength = distance2D(result.shoulderMid, result.hipMid);

    return result;
  }

  // ─── Test Frame Processing ────────────────────────────────────────────

  processTestFrame(keyPoints, worldLandmarks, timestamp) {
    const elapsed = timestamp - this.testStartTime;
    const cal = this.calibrationData;

    // Check max duration
    if (elapsed >= this.maxDuration) {
      this.stopTest(`Test completed successfully: ${this.maxDuration / 1000} seconds`);
      return { state: 'COMPLETED' };
    }

    // Calculate current metrics
    const torsoTilt = this.calculateTorsoTilt(keyPoints);
    const hipAngle = this.calculateHipAngle(keyPoints);
    const supportKneeAngle = this.getSupportKneeAngle(keyPoints);
    const hipDisplacement = this.calculateHipDisplacement(keyPoints);

    // Store frame data
    this.testData.timestamps.push(elapsed / 1000);
    this.testData.torsoTilts.push(torsoTilt);
    this.testData.hipMidpoints.push({ x: keyPoints.hipMid.x, y: keyPoints.hipMid.y, z: keyPoints.hipMid.z });
    this.testData.shoulderMidpoints.push({ x: keyPoints.shoulderMid.x, y: keyPoints.shoulderMid.y });
    this.testData.kneeAngles.push(supportKneeAngle);
    this.testData.pelvicTilts.push(hipAngle);
    this.testData.raisedLegPositions.push(this.getRaisedLegPosition(keyPoints));

    // Angular velocity
    if (this.testData.torsoTilts.length >= 2) {
      const prevTilt = this.testData.torsoTilts[this.testData.torsoTilts.length - 2];
      const prevTime = this.testData.timestamps[this.testData.timestamps.length - 2];
      const dt = (elapsed / 1000) - prevTime;
      if (dt > 0) {
        const angVel = Math.abs(torsoTilt - prevTilt) / dt;
        this.testData.angularVelocities.push(angVel);
      }
    }

    // Detect corrective movements
    this.detectCorrectiveMovement(keyPoints, timestamp);

    // ─── Failure Detection (informational only — does NOT auto-stop) ─────
    // The operator decides when to stop the test via the STOP button.
    const now = timestamp;

    const footGrounded = this.checkFootGrounded(keyPoints);
    this.updateFailureState('footGround', footGrounded, now, CONFIG.footGroundPersistenceMs);

    const handsOffHips = this.checkHandsOffHips(keyPoints);
    this.updateFailureState('handHip', handsOffHips, now, CONFIG.handHipPersistenceMs);

    const legsTouching = this.checkLegsTouching(keyPoints);
    this.updateFailureState('legContact', legsTouching, now, CONFIG.legContactPersistenceMs);

    const majorCorrection = this.checkMajorCorrection(keyPoints);
    this.updateFailureState('majorCorrection', majorCorrection, now, CONFIG.failurePersistenceMs);

    // Emit live data (warnings shown to operator but no auto-stop)
    const liveMetrics = {
      elapsed: elapsed / 1000,
      torsoTilt,
      hipAngle,
      supportKneeAngle,
      hipDisplacement,
      correctiveCount: this.correctiveCount,
      failureWarnings: this.getActiveWarnings()
    };
    this.emit('liveData', liveMetrics);

    return { state: 'TESTING', metrics: liveMetrics, keyPoints };
  }

  // ─── Failure Detection Methods ────────────────────────────────────────

  checkFootGrounded(keyPoints) {
    const cal = this.calibrationData;
    const supportAnkleY = this.supportLeg === 'left' ? keyPoints.leftAnkle.y : keyPoints.rightAnkle.y;
    const raisedAnkleY = this.raisedLeg === 'left' ? keyPoints.leftAnkle.y : keyPoints.rightAnkle.y;
    const raisedHeelY = this.raisedLeg === 'left' ? keyPoints.leftHeel.y : keyPoints.rightHeel.y;
    const raisedFootY = this.raisedLeg === 'left' ? keyPoints.leftFootIndex.y : keyPoints.rightFootIndex.y;

    // In normalized coords, Y increases downward. Raised foot should have smaller Y.
    // Check if raised foot approaches support foot level
    const footDiff = supportAnkleY - raisedAnkleY;
    const heelDiff = supportAnkleY - raisedHeelY;
    const toeDiff = supportAnkleY - raisedFootY;

    // Also check against baseline
    const baselineDiff = cal.supportAnkleY - cal.raisedAnkleY;

    // Foot is grounded if the height difference is very small
    const threshold = CONFIG.footGroundTolerance;
    const isGrounded = (footDiff < threshold && heelDiff < threshold) ||
                       (Math.abs(raisedAnkleY - supportAnkleY) < threshold);

    // Also check if raised knee is straightening (leg lowering)
    const raisedKneeAngle = this.getRaisedKneeAngle(keyPoints);
    const kneeExtending = raisedKneeAngle > (cal.raisedKneeAngle + 20);

    return isGrounded || (footDiff < threshold * 2 && kneeExtending);
  }

  checkHandsOffHips(keyPoints) {
    const cal = this.calibrationData;
    const torsoLen = keyPoints.torsoLength || cal.torsoLength;

    const leftDist = distance2D(keyPoints.leftWrist, keyPoints.leftHip) / torsoLen;
    const rightDist = distance2D(keyPoints.rightWrist, keyPoints.rightHip) / torsoLen;

    return leftDist > CONFIG.handHipDistanceThreshold || 
           rightDist > CONFIG.handHipDistanceThreshold;
  }

  checkLegsTouching(keyPoints) {
    const torsoLen = keyPoints.torsoLength || this.calibrationData.torsoLength;

    const kneeDist = distance2D(keyPoints.leftKnee, keyPoints.rightKnee) / torsoLen;
    const ankleDist = distance2D(keyPoints.leftAnkle, keyPoints.rightAnkle) / torsoLen;

    return kneeDist < CONFIG.legContactThreshold || ankleDist < CONFIG.legContactThreshold;
  }

  checkMajorCorrection(keyPoints) {
    const cal = this.calibrationData;
    const bodyHeight = cal.bodyHeight;
    if (bodyHeight === 0) return false;

    const hipDisp = distance2D(keyPoints.hipMid, cal.hipMid) / bodyHeight;
    const shoulderDisp = distance2D(keyPoints.shoulderMid, cal.shoulderMid) / bodyHeight;

    // Support ankle movement
    const supportAnkle = this.supportLeg === 'left' ? keyPoints.leftAnkle : keyPoints.rightAnkle;
    const baseAnkle = { x: cal.supportAnkleX, y: cal.supportAnkleY };
    const ankleDisp = distance2D(supportAnkle, baseAnkle) / bodyHeight;

    return hipDisp > CONFIG.majorCorrectionThreshold ||
           shoulderDisp > CONFIG.majorCorrectionThreshold ||
           ankleDisp > CONFIG.majorCorrectionThreshold * 0.7;
  }

  updateFailureState(condition, isActive, now, persistenceMs) {
    const fs = this.failureState[condition];
    if (isActive) {
      if (!fs.active) {
        fs.active = true;
        fs.startTime = now;
      } else if (now - fs.startTime >= persistenceMs) {
        fs.triggered = true;
      }
    } else {
      fs.active = false;
      fs.startTime = 0;
    }
  }

  getActiveWarnings() {
    const warnings = [];
    if (this.failureState.footGround.active) warnings.push('foot_lowering');
    if (this.failureState.handHip.active) warnings.push('hands_moving');
    if (this.failureState.legContact.active) warnings.push('legs_close');
    if (this.failureState.majorCorrection.active) warnings.push('major_movement');
    return warnings;
  }

  // ─── Corrective Movement Detection ────────────────────────────────────

  detectCorrectiveMovement(keyPoints, timestamp) {
    const cal = this.calibrationData;
    const bodyHeight = cal.bodyHeight || 1;

    const hipDisp = distance2D(keyPoints.hipMid, cal.hipMid) / bodyHeight;
    const shoulderDisp = distance2D(keyPoints.shoulderMid, cal.shoulderMid) / bodyHeight;
    const torsoTilt = this.calculateTorsoTilt(keyPoints);

    const isExcessive = hipDisp > CONFIG.correctiveMovementThreshold ||
                        shoulderDisp > CONFIG.correctiveMovementThreshold ||
                        Math.abs(torsoTilt - cal.baseTorsoTilt) > 8; // 8 degrees

    if (isExcessive && !this.inCorrective) {
      // Check cooldown
      if (timestamp - this.lastCorrectiveTime > CONFIG.correctiveMovementCooldownMs) {
        this.inCorrective = true;
      }
    } else if (!isExcessive && this.inCorrective) {
      // Movement returned toward baseline - count it
      this.correctiveCount++;
      this.inCorrective = false;
      this.lastCorrectiveTime = timestamp;
    }
  }

  // ─── Metric Calculations ──────────────────────────────────────────────

  calculateTorsoTilt(keyPoints) {
    const torsoVector = {
      x: keyPoints.shoulderMid.x - keyPoints.hipMid.x,
      y: keyPoints.shoulderMid.y - keyPoints.hipMid.y
    };
    return angleFromVertical(torsoVector);
  }

  calculateHipAngle(keyPoints) {
    // Angle of hip line relative to horizontal
    const dx = keyPoints.rightHip.x - keyPoints.leftHip.x;
    const dy = keyPoints.rightHip.y - keyPoints.leftHip.y;
    return Math.atan2(dy, dx) * (180 / Math.PI);
  }

  calculateHipDisplacement(keyPoints) {
    if (!this.calibrationData) return 0;
    return distance2D(keyPoints.hipMid, this.calibrationData.hipMid);
  }

  getSupportKneeAngle(keyPoints) {
    if (this.supportLeg === 'left') {
      return angleBetweenPoints(keyPoints.leftHip, keyPoints.leftKnee, keyPoints.leftAnkle);
    } else {
      return angleBetweenPoints(keyPoints.rightHip, keyPoints.rightKnee, keyPoints.rightAnkle);
    }
  }

  getRaisedKneeAngle(keyPoints) {
    if (this.raisedLeg === 'left') {
      return angleBetweenPoints(keyPoints.leftHip, keyPoints.leftKnee, keyPoints.leftAnkle);
    } else {
      return angleBetweenPoints(keyPoints.rightHip, keyPoints.rightKnee, keyPoints.rightAnkle);
    }
  }

  getRaisedLegPosition(keyPoints) {
    if (this.raisedLeg === 'left') {
      return { knee: keyPoints.leftKnee, ankle: keyPoints.leftAnkle };
    } else {
      return { knee: keyPoints.rightKnee, ankle: keyPoints.rightAnkle };
    }
  }

  // ─── Final Metrics ────────────────────────────────────────────────────

  createEmptyMetrics() {
    return {
      duration: 0,
      terminationReason: '',
      meanTorsoTilt: 0,
      maxTorsoTilt: 0,
      sdTorsoTilt: 0,
      meanLateralSway: 0,
      maxLateralSway: 0,
      rmsLateralSway: 0,
      sdLateralSway: 0,
      meanAngularVelocity: 0,
      peakAngularVelocity: 0,
      rmsAngularVelocity: 0,
      meanKneeAngle: 0,
      kneeVariability: 0,
      maxKneeDeviation: 0,
      meanPelvicTilt: 0,
      maxPelvicTilt: 0,
      pelvicVariability: 0,
      raisedLegVariability: 0,
      correctiveMovements: 0,
      stabilityScore: 0,
      swayClassification: 'Low Sway',
      performanceLabel: ''
    };
  }

  finalizeMetrics(duration, reason) {
    const data = this.testData;
    if (!data || data.timestamps.length === 0) return;

    this.metrics.duration = Math.round(duration * 10) / 10;
    this.metrics.terminationReason = reason;
    this.metrics.correctiveMovements = this.correctiveCount;

    // Torso tilt
    this.metrics.meanTorsoTilt = this.mean(data.torsoTilts);
    this.metrics.maxTorsoTilt = Math.max(...data.torsoTilts);
    this.metrics.sdTorsoTilt = this.standardDeviation(data.torsoTilts);

    // Lateral sway (hip midpoint X displacement from baseline)
    const cal = this.calibrationData;
    const lateralDisplacements = data.hipMidpoints.map(p => 
      (p.x - cal.hipMid.x) / cal.shoulderWidth
    );
    this.metrics.meanLateralSway = this.mean(lateralDisplacements.map(Math.abs));
    this.metrics.maxLateralSway = Math.max(...lateralDisplacements.map(Math.abs));
    this.metrics.rmsLateralSway = this.rms(lateralDisplacements);
    this.metrics.sdLateralSway = this.standardDeviation(lateralDisplacements);

    // Angular velocity
    if (data.angularVelocities.length > 0) {
      this.metrics.meanAngularVelocity = this.mean(data.angularVelocities);
      this.metrics.peakAngularVelocity = Math.max(...data.angularVelocities);
      this.metrics.rmsAngularVelocity = this.rms(data.angularVelocities);
    }

    // Supporting knee
    if (data.kneeAngles.length > 0) {
      this.metrics.meanKneeAngle = this.mean(data.kneeAngles);
      this.metrics.kneeVariability = this.standardDeviation(data.kneeAngles);
      const baseKnee = cal.supportKneeAngle;
      this.metrics.maxKneeDeviation = Math.max(...data.kneeAngles.map(a => Math.abs(a - baseKnee)));
    }

    // Pelvic stability
    if (data.pelvicTilts.length > 0) {
      this.metrics.meanPelvicTilt = this.mean(data.pelvicTilts.map(Math.abs));
      this.metrics.maxPelvicTilt = Math.max(...data.pelvicTilts.map(Math.abs));
      this.metrics.pelvicVariability = this.standardDeviation(data.pelvicTilts);
    }

    // Raised leg stability
    if (data.raisedLegPositions.length > 0) {
      const ankleXs = data.raisedLegPositions.map(p => p.ankle.x);
      const ankleYs = data.raisedLegPositions.map(p => p.ankle.y);
      this.metrics.raisedLegVariability = this.standardDeviation(ankleXs) + this.standardDeviation(ankleYs);
    }

    // Sway classification
    const rms = this.metrics.rmsLateralSway;
    if (rms < CONFIG.swayClassification.low) {
      this.metrics.swayClassification = 'Low Sway';
    } else if (rms < CONFIG.swayClassification.moderate) {
      this.metrics.swayClassification = 'Moderate Sway';
    } else {
      this.metrics.swayClassification = 'High Sway';
    }

    // Composite stability score
    this.metrics.stabilityScore = this.calculateStabilityScore(duration);

    // Performance label
    const score = this.metrics.stabilityScore;
    if (score >= CONFIG.performanceLabels.strong.minScore) {
      this.metrics.performanceLabel = CONFIG.performanceLabels.strong.label;
    } else if (score >= CONFIG.performanceLabels.moderate.minScore) {
      this.metrics.performanceLabel = CONFIG.performanceLabels.moderate.label;
    } else {
      this.metrics.performanceLabel = CONFIG.performanceLabels.limited.label;
    }
  }

  calculateStabilityScore(duration) {
    const maxDur = this.maxDuration / 1000;
    const weights = CONFIG.scoreWeights;

    // Duration score (0-100): proportion of max duration achieved
    const durationScore = Math.min(100, (duration / maxDur) * 100);

    // Torso stability score (lower tilt = better)
    const torsoScore = Math.max(0, 100 - this.metrics.meanTorsoTilt * 8);

    // Angular stability (lower velocity = better)
    const angularScore = Math.max(0, 100 - this.metrics.meanAngularVelocity * 2);

    // Knee stability (lower variability = better)
    const kneeScore = Math.max(0, 100 - this.metrics.kneeVariability * 10);

    // Pelvic stability (lower variability = better)
    const pelvicScore = Math.max(0, 100 - this.metrics.pelvicVariability * 10);

    // Corrective movements (fewer = better)
    const correctiveScore = Math.max(0, 100 - this.correctiveCount * 15);

    const composite = 
      durationScore * weights.duration +
      torsoScore * weights.torsoStability +
      angularScore * weights.angularStability +
      kneeScore * weights.kneeStability +
      pelvicScore * weights.pelvicStability +
      correctiveScore * weights.correctiveMovements;

    return Math.round(Math.max(0, Math.min(100, composite)));
  }

  // ─── Statistical Helpers ──────────────────────────────────────────────

  mean(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, v) => sum + v, 0) / arr.length;
  }

  standardDeviation(arr) {
    if (arr.length < 2) return 0;
    const avg = this.mean(arr);
    const squaredDiffs = arr.map(v => (v - avg) ** 2);
    return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (arr.length - 1));
  }

  rms(arr) {
    if (arr.length === 0) return 0;
    return Math.sqrt(arr.reduce((sum, v) => sum + v * v, 0) / arr.length);
  }

  // ─── Position Readiness Check ─────────────────────────────────────────

  checkReadiness(landmarks) {
    if (!landmarks || landmarks.length === 0) {
      return { ready: false, status: 'No person detected', level: 'red' };
    }

    const required = [
      LANDMARKS.LEFT_SHOULDER, LANDMARKS.RIGHT_SHOULDER,
      LANDMARKS.LEFT_HIP, LANDMARKS.RIGHT_HIP,
      LANDMARKS.LEFT_KNEE, LANDMARKS.RIGHT_KNEE,
      LANDMARKS.LEFT_ANKLE, LANDMARKS.RIGHT_ANKLE,
      LANDMARKS.LEFT_WRIST, LANDMARKS.RIGHT_WRIST,
      LANDMARKS.LEFT_FOOT_INDEX, LANDMARKS.RIGHT_FOOT_INDEX
    ];

    const visible = required.filter(idx => 
      landmarks[idx] && landmarks[idx].visibility >= CONFIG.landmarkConfidenceThreshold
    );

    if (visible.length < 6) {
      return { ready: false, status: 'Person detected — move into view', level: 'red' };
    }

    if (visible.length < 10) {
      return { ready: false, status: 'Move further back — need full body visible', level: 'amber' };
    }

    if (visible.length < required.length) {
      return { ready: false, status: 'Nearly ready — adjust position', level: 'amber' };
    }

    // Check if full body is in frame (feet shouldn't be at very bottom)
    const ankleY = Math.max(
      landmarks[LANDMARKS.LEFT_ANKLE]?.y || 0,
      landmarks[LANDMARKS.RIGHT_ANKLE]?.y || 0
    );
    if (ankleY > 0.95) {
      return { ready: false, status: 'Move further back — feet near edge of frame', level: 'amber' };
    }

    return { ready: true, status: 'Full body visible — Ready for test', level: 'green' };
  }

  // ─── Leg Detection ────────────────────────────────────────────────────

  detectRaisedLeg(landmarks) {
    if (!landmarks || landmarks.length === 0) return null;

    const leftAnkleY = landmarks[LANDMARKS.LEFT_ANKLE]?.y || 0;
    const rightAnkleY = landmarks[LANDMARKS.RIGHT_ANKLE]?.y || 0;
    const leftKneeY = landmarks[LANDMARKS.LEFT_KNEE]?.y || 0;
    const rightKneeY = landmarks[LANDMARKS.RIGHT_KNEE]?.y || 0;

    // In normalized coords, Y increases downward. Raised foot = smaller Y.
    const leftFootHeight = rightAnkleY - leftAnkleY; // positive = left foot is higher
    const rightFootHeight = leftAnkleY - rightAnkleY; // positive = right foot is higher

    const threshold = 0.05; // minimum difference to detect a raised leg

    if (leftFootHeight > threshold && (leftKneeY < rightKneeY)) {
      return 'left'; // Left leg is raised
    } else if (rightFootHeight > threshold && (rightKneeY < leftKneeY)) {
      return 'right'; // Right leg is raised
    }

    return null; // No leg clearly raised
  }

  // ─── Getters ──────────────────────────────────────────────────────────

  getTestData() {
    return this.testData;
  }

  getMetrics() {
    return this.metrics;
  }

  getCalibrationData() {
    return this.calibrationData;
  }

  reset() {
    this.state = 'IDLE';
    this.smoother.reset();
    this.calibrationData = null;
    this.testData = null;
    this.metrics = null;
    this.failureState = {};
    this.trackingLost = false;
    this.correctiveCount = 0;
  }
}
