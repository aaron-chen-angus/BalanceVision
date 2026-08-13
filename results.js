/**
 * BalanceVision - Results Module
 * 
 * Results calculation, display, age reference comparison, trial history,
 * charts, sport profiles, and composite scoring.
 */

// ─── Results Manager ────────────────────────────────────────────────────────

class ResultsManager {
  constructor() {
    this.STORAGE_KEY = 'balancevision_results';
  }

  // ─── Storage ──────────────────────────────────────────────────────────

  saveResult(participantData, metrics, supportLeg) {
    const result = {
      id: this.generateId(),
      participantId: participantData.participantId,
      age: participantData.age,
      sex: participantData.sex || '',
      participantType: participantData.participantType,
      supportLeg: supportLeg,
      trialNumber: participantData.trialNumber,
      duration: metrics.duration,
      terminationReason: metrics.terminationReason,
      meanTorsoTilt: this.round(metrics.meanTorsoTilt, 1),
      maxTorsoTilt: this.round(metrics.maxTorsoTilt, 1),
      sdTorsoTilt: this.round(metrics.sdTorsoTilt, 2),
      meanLateralSway: this.round(metrics.meanLateralSway, 3),
      maxLateralSway: this.round(metrics.maxLateralSway, 3),
      rmsLateralSway: this.round(metrics.rmsLateralSway, 3),
      sdLateralSway: this.round(metrics.sdLateralSway, 3),
      swayClassification: metrics.swayClassification,
      meanAngularVelocity: this.round(metrics.meanAngularVelocity, 1),
      peakAngularVelocity: this.round(metrics.peakAngularVelocity, 1),
      rmsAngularVelocity: this.round(metrics.rmsAngularVelocity, 1),
      meanKneeAngle: this.round(metrics.meanKneeAngle, 1),
      kneeVariability: this.round(metrics.kneeVariability, 2),
      maxKneeDeviation: this.round(metrics.maxKneeDeviation, 1),
      meanPelvicTilt: this.round(metrics.meanPelvicTilt, 1),
      maxPelvicTilt: this.round(metrics.maxPelvicTilt, 1),
      pelvicVariability: this.round(metrics.pelvicVariability, 2),
      raisedLegVariability: this.round(metrics.raisedLegVariability, 3),
      correctiveMovements: metrics.correctiveMovements,
      stabilityScore: metrics.stabilityScore,
      performanceLabel: metrics.performanceLabel,
      timestamp: new Date().toISOString()
    };

    const results = this.getAllResults();
    results.push(result);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(results));

    // Auto-send to Google Sheets if configured
    if (CONFIG.googleSheetsWebhookUrl) {
      this.sendToGoogleSheets(result);
    }

    return result;
  }

  getAllResults() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  getResultsForParticipant(participantId) {
    return this.getAllResults().filter(r => r.participantId === participantId);
  }

  deleteAllResults() {
    localStorage.removeItem(this.STORAGE_KEY);
  }

  deleteResult(id) {
    const results = this.getAllResults().filter(r => r.id !== id);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(results));
  }

  // ─── Age Reference ────────────────────────────────────────────────────

  getAgeGroup(age) {
    if (age >= 80) return "80+";
    if (age >= 70) return "70-79";
    if (age >= 60) return "60-69";
    if (age >= 50) return "50-59";
    if (age >= 40) return "40-49";
    if (age >= 18) return "18-39";
    return null; // Child/youth - no adult reference
  }

  getAgeReference(age) {
    const group = this.getAgeGroup(age);
    if (!group) return null;
    return {
      ageGroup: group,
      referenceValue: CONFIG.referenceValues[group]
    };
  }

  getAgeComparisonText(duration, age) {
    const ref = this.getAgeReference(age);
    if (!ref) return null;

    const diff = duration - ref.referenceValue;
    const absDiff = Math.abs(diff).toFixed(1);

    let comparison;
    if (Math.abs(diff) < 2) {
      comparison = 'around reference';
    } else if (diff > 0) {
      comparison = 'above reference';
    } else {
      comparison = 'below reference';
    }

    return {
      ageGroup: ref.ageGroup,
      referenceValue: ref.referenceValue,
      difference: diff,
      absDifference: absDiff,
      comparison: comparison,
      text: `Your best trial: ${duration.toFixed(1)} s\nReference for age group ${ref.ageGroup}: approximately ${ref.referenceValue} s\nYour result is approximately ${absDiff} s ${diff >= 0 ? 'above' : 'below'} this reference.`
    };
  }

  // ─── 10-Second Indicator ──────────────────────────────────────────────

  getTenSecondIndicator(duration, age) {
    if (age < 50) return null;
    return {
      completed: duration >= 10,
      text: duration >= 10 ? 'Completed' : 'Not Completed',
      explanation: 'The ability to maintain a one-legged stance for 10 seconds has been studied as a general health and functional indicator in middle-aged and older adults. It should not be interpreted as an individual diagnosis or prediction.'
    };
  }

  // ─── Side-to-Side Comparison ──────────────────────────────────────────

  getSideComparison(participantId) {
    const results = this.getResultsForParticipant(participantId);
    
    const leftResults = results.filter(r => r.supportLeg === 'left');
    const rightResults = results.filter(r => r.supportLeg === 'right');

    if (leftResults.length === 0 || rightResults.length === 0) return null;

    // Use best duration from each side
    const bestLeft = Math.max(...leftResults.map(r => r.duration));
    const bestRight = Math.max(...rightResults.map(r => r.duration));
    const diff = Math.abs(bestLeft - bestRight);
    const avg = (bestLeft + bestRight) / 2;
    const percentDiff = avg > 0 ? (diff / avg) * 100 : 0;

    return {
      leftDuration: bestLeft,
      rightDuration: bestRight,
      absoluteDifference: this.round(diff, 1),
      percentageDifference: this.round(percentDiff, 1),
      strongerSide: bestLeft > bestRight ? 'left' : 'right'
    };
  }

  // ─── Sport Profile (Child/Youth) ──────────────────────────────────────

  getSportProfile(metrics, sideComparison) {
    const profiles = CONFIG.sportProfiles;

    // Check symmetry first
    if (sideComparison && sideComparison.percentageDifference > profiles.symmetryFocus.criteria.asymmetryPercentage) {
      return {
        profile: profiles.symmetryFocus,
        type: 'symmetryFocus'
      };
    }

    // Evaluate performance percentiles (simplified - based on score)
    const score = metrics.stabilityScore;
    const corrective = metrics.correctiveMovements;

    // Precision & Balance
    if (score >= 75 && corrective <= profiles.precisionBalance.criteria.correctiveMovementsMax) {
      return {
        profile: profiles.precisionBalance,
        type: 'precisionBalance'
      };
    }

    // Agility & Control
    if (score >= 50 && metrics.pelvicVariability < 3) {
      return {
        profile: profiles.agilityControl,
        type: 'agilityControl'
      };
    }

    // Developing Control
    if (corrective >= profiles.developingControl.criteria.correctiveMovementsMin || score < 50) {
      return {
        profile: profiles.developingControl,
        type: 'developingControl'
      };
    }

    // Default to agility
    return {
      profile: profiles.agilityControl,
      type: 'agilityControl'
    };
  }

  // ─── Performance Summary ──────────────────────────────────────────────

  getBalanceScreeningResult(metrics, age) {
    const score = metrics.stabilityScore;
    let result;
    
    if (score >= CONFIG.performanceLabels.strong.minScore) {
      result = CONFIG.performanceLabels.strong.label;
    } else if (score >= CONFIG.performanceLabels.moderate.minScore) {
      result = CONFIG.performanceLabels.moderate.label;
    } else {
      result = CONFIG.performanceLabels.limited.label;
    }

    let additionalAdvice = '';
    if (score < 30 && age >= 60) {
      additionalAdvice = 'Your balance time was substantially below the reference for your age group. Consider discussing balance, strength, and fall-prevention strategies with an appropriately qualified healthcare or exercise professional.';
    }

    return { result, additionalAdvice };
  }

  // ─── Chart Data ───────────────────────────────────────────────────────

  getStabilityOverTimeData(testData) {
    if (!testData || testData.timestamps.length === 0) return null;
    return {
      labels: testData.timestamps.map(t => t.toFixed(1)),
      data: testData.torsoTilts
    };
  }

  getSwayTraceData(testData, calibrationData) {
    if (!testData || testData.hipMidpoints.length === 0) return null;
    const cal = calibrationData;
    return {
      x: testData.hipMidpoints.map(p => (p.x - cal.hipMid.x) * 100),
      y: testData.hipMidpoints.map(p => (p.y - cal.hipMid.y) * 100)
    };
  }

  getLeftRightComparisonData(participantId) {
    const comparison = this.getSideComparison(participantId);
    if (!comparison) return null;
    return {
      labels: ['Left Support', 'Right Support'],
      data: [comparison.leftDuration, comparison.rightDuration]
    };
  }

  // ─── Google Sheets Integration ──────────────────────────────────────

  async sendToGoogleSheets(result) {
    const url = CONFIG.googleSheetsWebhookUrl;
    if (!url) return { sent: false, reason: 'No webhook URL configured' };

    try {
      const response = await fetch(url, {
        method: 'POST',
        mode: 'no-cors', // Google Apps Script requires no-cors from browser
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      });
      return { sent: true };
    } catch (error) {
      console.error('Google Sheets export failed:', error);
      return { sent: false, reason: error.message };
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  round(value, decimals) {
    return Math.round(value * (10 ** decimals)) / (10 ** decimals);
  }
}

// ─── Chart Rendering (uses Chart.js if available) ───────────────────────────

class ChartRenderer {
  constructor() {
    this.charts = {};
  }

  renderStabilityChart(canvasId, data) {
    if (!window.Chart || !data) return;
    
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    if (this.charts[canvasId]) {
      this.charts[canvasId].destroy();
    }

    this.charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Torso Tilt (°)',
          data: data.data,
          borderColor: '#00e5ff',
          backgroundColor: 'rgba(0, 229, 255, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, labels: { color: '#e0e0e0' } },
          title: { display: true, text: 'Stability Over Time', color: '#ffffff' }
        },
        scales: {
          x: { 
            title: { display: true, text: 'Time (s)', color: '#b0bec5' },
            ticks: { color: '#b0bec5', maxTicksLimit: 10 },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: { 
            title: { display: true, text: 'Torso Tilt (°)', color: '#b0bec5' },
            ticks: { color: '#b0bec5' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    });
  }

  renderSwayTrace(canvasId, data) {
    if (!window.Chart || !data) return;

    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    if (this.charts[canvasId]) {
      this.charts[canvasId].destroy();
    }

    const points = data.x.map((x, i) => ({ x, y: data.y[i] }));

    this.charts[canvasId] = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Body Sway Trace',
          data: points,
          borderColor: '#00e5ff',
          backgroundColor: 'rgba(0, 229, 255, 0.3)',
          pointRadius: 1,
          showLine: true,
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 1,
        plugins: {
          legend: { display: true, labels: { color: '#e0e0e0' } },
          title: { display: true, text: 'Body Sway Trace', color: '#ffffff' }
        },
        scales: {
          x: { 
            title: { display: true, text: 'Mediolateral (%)', color: '#b0bec5' },
            ticks: { color: '#b0bec5' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: { 
            title: { display: true, text: 'Vertical (%)', color: '#b0bec5' },
            ticks: { color: '#b0bec5' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    });
  }

  renderLeftRightChart(canvasId, data) {
    if (!window.Chart || !data) return;

    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    if (this.charts[canvasId]) {
      this.charts[canvasId].destroy();
    }

    this.charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Balance Duration (s)',
          data: data.data,
          backgroundColor: ['rgba(0, 229, 255, 0.7)', 'rgba(76, 175, 80, 0.7)'],
          borderColor: ['#00e5ff', '#4caf50'],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: { display: true, text: 'Left vs Right Support', color: '#ffffff' }
        },
        scales: {
          x: { ticks: { color: '#b0bec5' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { 
            title: { display: true, text: 'Duration (s)', color: '#b0bec5' },
            ticks: { color: '#b0bec5' },
            grid: { color: 'rgba(255,255,255,0.05)' },
            beginAtZero: true
          }
        }
      }
    });
  }

  destroyAll() {
    Object.values(this.charts).forEach(chart => chart.destroy());
    this.charts = {};
  }
}
