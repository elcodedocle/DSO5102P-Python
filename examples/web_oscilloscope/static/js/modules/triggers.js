// Triggers Module for Hantek Oscilloscope SPA
// Manages trigger configurations, limits, sliding-FFT triggers, and realtime/playback evaluations

import { computeFFTSpectrum } from './dsp.js';

export class Triggers {
    constructor(app) {
        this.app = app;
        
        // Trigger Configuration States (Per-channel dictionaries)
        this.triggerEnabled = { 'CH1': false, 'CH2': false, 'MATH': false };
        this.triggerActionVal = { 'CH1': 'pause', 'CH2': 'pause', 'MATH': 'pause' };
        this.triggerLowDiv = { 'CH1': -1.0, 'CH2': -1.0, 'MATH': -1.0 };
        this.triggerHighDiv = { 'CH1': 1.0, 'CH2': 1.0, 'MATH': 1.0 };
        this.triggerMinSamples = { 'CH1': 1, 'CH2': 1, 'MATH': 1 };
        this.triggerMinTimeSec = { 'CH1': 0.0, 'CH2': 0.0, 'MATH': 0.0 };
        this.triggerPostDelayVal = { 'CH1': 1600, 'CH2': 1600, 'MATH': 1600 };
        this.triggerPostAuto = { 'CH1': true, 'CH2': true, 'MATH': true };
        this.triggerFreqLowHz = { 'CH1': 100.0, 'CH2': 150.0, 'MATH': 120.0 };
        this.triggerFreqHighHz = { 'CH1': 1000.0, 'CH2': 1500.0, 'MATH': 1200.0 };
        this.triggerFFTMatchLogic = { 'CH1': 'any', 'CH2': 'any', 'MATH': 'any' };
        this.triggerLowVolts = { 'CH1': -1.0, 'CH2': -1.0, 'MATH': -1.0 };
        this.triggerHighVolts = { 'CH1': 1.0, 'CH2': 1.0, 'MATH': 1.0 };
        
        // Active Firing & Detection States
        this.isTriggered = false;
        this.triggerSourceChannel = null; // 'CH1', 'CH2', or 'MATH'
        
        this.postTriggerCounter = { 'CH1': -1, 'CH2': -1, 'MATH': -1 };
        this.consecutiveOutsideSamples = { 'CH1': 0, 'CH2': 0, 'MATH': 0 };
        this.triggerStartTime = { 'CH1': null, 'CH2': null, 'MATH': null };
    }

    onTriggerEnableChange(enabled) {
        const tab = this.app.activeTab;
        this.triggerEnabled[tab] = enabled;
        if (enabled) this.resetTriggerState();
        this.app.drawOscilloscope();
    }
    
    onTriggerActionChange(act) {
        const tab = this.app.activeTab;
        this.triggerActionVal[tab] = act;
        this.resetTriggerState();
    }
    
    onTriggerLowChange(value) {
        const tab = this.app.activeTab;
        this.triggerLowDiv[tab] = parseFloat(value) / 25;
        this.app.updateSlidersAndReadouts();
        this.app.drawOscilloscope();
    }
    
    onTriggerHighChange(value) {
        const tab = this.app.activeTab;
        this.triggerHighDiv[tab] = parseFloat(value) / 25;
        this.app.updateSlidersAndReadouts();
        this.app.drawOscilloscope();
    }
    
    onTriggerSamplesChange(value) {
        const tab = this.app.activeTab;
        this.triggerMinSamples[tab] = parseInt(value);
        this.app.updateSlidersAndReadouts();
    }
    
    onTriggerTimeChange(value) {
        const tab = this.app.activeTab;
        this.triggerMinTimeSec[tab] = (parseFloat(value) / 10) / 1000.0;
        this.app.updateSlidersAndReadouts();
    }
    
    onPostTriggerDelayChange(value) {
        const tab = this.app.activeTab;
        this.triggerPostDelayVal[tab] = parseInt(value);
        this.triggerPostAuto[tab] = false;
        this.app.updateSlidersAndReadouts();
    }
    
    onPostTriggerAutoChange(autoChecked) {
        const tab = this.app.activeTab;
        this.triggerPostAuto[tab] = autoChecked;
        this.app.updateSlidersAndReadouts();
    }

    getNyquistFrequency(tab) {
        let dt = 1e-5; // default fallback (100kHz sample rate -> 50kHz Nyquist)
        const dataManager = this.app.dataManager;
        const timeData = tab === 'CH1' ? dataManager.timeData1 : (tab === 'CH2' ? dataManager.timeData2 : dataManager.timeDataMath);
        
        const computeSliceDt = (arr) => {
            if (!arr || arr.length < 2) return null;
            const startT = arr[0];
            const endT = arr[arr.length - 1];
            const totalDuration = endT - startT;
            const timebase = this.app.HORIZ_VALS[this.app.currentTimebaseIdx];
            const screenDuration = timebase * 12;
            
            let viewportStartT, viewportEndT;
            if (this.app.mode === 'realtime') {
                viewportEndT = endT;
                viewportStartT = Math.max(startT, endT - screenDuration);
            } else {
                const targetT = startT + (this.app.horizontalPosition * Math.max(0, totalDuration - screenDuration));
                const vp = dataManager.getPlaybackViewport(arr, targetT, screenDuration);
                viewportStartT = vp.viewportStartT;
                viewportEndT = vp.viewportEndT;
            }
            
            let startIndex = 0;
            let endIndex = arr.length - 1;
            
            let low = 0, high = arr.length - 1;
            while (low <= high) {
                const mid = (low + high) >> 1;
                if (arr[mid] < viewportStartT) {
                    startIndex = mid;
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }
            
            low = 0; high = arr.length - 1;
            while (low <= high) {
                const mid = (low + high) >> 1;
                if (arr[mid] <= viewportEndT) {
                    endIndex = mid;
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }
            
            if (endIndex > startIndex) {
                return (arr[endIndex] - arr[startIndex]) / (endIndex - startIndex);
            }
            return null;
        };

        const sliceDt = computeSliceDt(timeData);
        if (sliceDt !== null) {
            dt = sliceDt;
        } else {
            const anyData = dataManager.timeData1.length > 1 ? dataManager.timeData1 : dataManager.timeData2;
            const anySliceDt = computeSliceDt(anyData);
            if (anySliceDt !== null) {
                dt = anySliceDt;
            }
        }
        return dt > 0 ? 0.5 / dt : 20000;
    }

    onTriggerFreqLowChange(value) {
        const tab = this.app.activeTab;
        const nyquist = this.getNyquistFrequency(tab);
        const sliderPercent = parseInt(value) / 1000;
        this.triggerFreqLowHz[tab] = sliderPercent * nyquist;
        
        if (this.triggerFreqHighHz[tab] < this.triggerFreqLowHz[tab]) {
            this.triggerFreqHighHz[tab] = this.triggerFreqLowHz[tab];
        }
        
        this.app.updateSlidersAndReadouts();
    }

    onTriggerFreqHighChange(value) {
        const tab = this.app.activeTab;
        const nyquist = this.getNyquistFrequency(tab);
        const sliderPercent = parseInt(value) / 1000;
        this.triggerFreqHighHz[tab] = sliderPercent * nyquist;
        
        if (this.triggerFreqLowHz[tab] > this.triggerFreqHighHz[tab]) {
            this.triggerFreqLowHz[tab] = this.triggerFreqHighHz[tab];
        }
        
        this.app.updateSlidersAndReadouts();
    }

    onTriggerFFTLogicChange(value) {
        const tab = this.app.activeTab;
        this.triggerFFTMatchLogic[tab] = value;
        this.resetTriggerState();
    }

    resetTriggerState() {
        this.isTriggered = false;
        this.triggerSourceChannel = null;
        ['CH1', 'CH2', 'MATH'].forEach(ch => {
            this.postTriggerCounter[ch] = -1;
            this.consecutiveOutsideSamples[ch] = 0;
            this.triggerStartTime[ch] = null;
        });
    }

    evaluateRealtimeTriggers(channel, newPoints) {
        if (this.isTriggered) {
            // Already triggered. If the action was 'stop', accumulate post-trigger samples.
            const src = this.triggerSourceChannel;
            if (src && this.triggerActionVal[src] === 'stop' && this.postTriggerCounter[src] >= 0) {
                if (src === 'CH1' && channel === 1) {
                    this.postTriggerCounter['CH1'] += newPoints;
                } else if (src === 'CH2' && channel === 2) {
                    this.postTriggerCounter['CH2'] += newPoints;
                } else if (src === 'MATH' && channel === 1) {
                    this.postTriggerCounter['MATH'] += newPoints;
                }
                
                if (this.postTriggerCounter[src] >= this.triggerPostDelayVal[src]) {
                    this.app.dataManager.stopLiveStreaming();
                    this.app.displayFrozen = true;
                    this.app.freezeBtn.textContent = "Unfreeze Display";
                    this.app.freezeBtn.className = "btn btn-red";
                    this.app.statusText.textContent = `Stopped (+${this.postTriggerCounter[src]} samples on ${src})`;
                    this.app.statusText.className = "status-wait";
                    this.app.updateSlidersAndReadouts();
                    this.app.drawOscilloscope();
                }
            }
            return;
        }
        
        const dataManager = this.app.dataManager;
        
        // CH1 realtime evaluation
        if (channel === 1 && this.triggerEnabled['CH1']) {
            if (this.app.fftEnabledCh1) {
                this.checkFFTChannelTrigger('CH1', dataManager.timeData1, dataManager.voltageData1, false, null, null);
            } else {
                this.checkChannelTrigger('CH1', newPoints, dataManager.timeData1, dataManager.voltageData1);
            }
            if (this.isTriggered) return;
        }
        
        // CH2 realtime evaluation
        if (channel === 2 && this.triggerEnabled['CH2']) {
            if (this.app.fftEnabledCh2) {
                this.checkFFTChannelTrigger('CH2', dataManager.timeData2, dataManager.voltageData2, false, null, null);
            } else {
                this.checkChannelTrigger('CH2', newPoints, dataManager.timeData2, dataManager.voltageData2);
            }
            if (this.isTriggered) return;
        }
        
        // MATH realtime evaluation (runs on CH1 updates)
        if (channel === 1 && this.triggerEnabled['MATH'] && this.app.mathEnable.checked && dataManager.timeDataMath.length >= newPoints) {
            if (this.app.fftEnabledMath) {
                this.checkFFTChannelTrigger('MATH', dataManager.timeDataMath, dataManager.voltageDataMath, false, null, null);
            } else {
                this.checkChannelTrigger('MATH', newPoints, dataManager.timeDataMath, dataManager.voltageDataMath);
            }
        }
    }
    
    checkChannelTrigger(chKey, pointsCount, timeArray, voltArray) {
        const size = timeArray.length;
        const startIdx = size - pointsCount;
        if (startIdx < 0) return;
        
        const lowL = this.triggerLowVolts[chKey];
        const highL = this.triggerHighVolts[chKey];
        const minSamples = this.triggerMinSamples[chKey];
        const minTime = this.triggerMinTimeSec[chKey];
        
        for (let i = 0; i < pointsCount; i++) {
            const idx = startIdx + i;
            const t = timeArray[idx];
            const v = voltArray[idx];
            const isOutside = (v < lowL || v > highL);
            
            if (isOutside) {
                if (this.triggerStartTime[chKey] === null) {
                    this.triggerStartTime[chKey] = t;
                }
                this.consecutiveOutsideSamples[chKey]++;
                const duration = t - this.triggerStartTime[chKey];
                
                if (this.consecutiveOutsideSamples[chKey] >= minSamples && duration >= minTime) {
                    this.isTriggered = true;
                    this.triggerSourceChannel = chKey;
                    
                    if (this.triggerActionVal[chKey] === 'pause') {
                        this.app.displayFrozen = true;
                        this.app.freezeBtn.textContent = "Unfreeze Display";
                        this.app.freezeBtn.className = "btn btn-red";
                        this.app.statusText.textContent = `Triggered: ${chKey} (Frozen)`;
                        this.app.statusText.className = "status-wait";
                        this.app.drawOscilloscope();
                    } else {
                        this.postTriggerCounter[chKey] = pointsCount - 1 - i;
                        this.app.statusText.textContent = `Triggered: ${chKey}! Capturing post...`;
                        this.app.statusText.className = "status-wait";
                    }
                    break;
                }
            } else {
                this.consecutiveOutsideSamples[chKey] = 0;
                this.triggerStartTime[chKey] = null;
            }
        }
    }

    evaluatePlaybackTriggers(viewportStartT, viewportEndT) {
        if (this.isTriggered) return;
        const dataManager = this.app.dataManager;
        
        if (this.triggerEnabled['CH1'] && this.app.ch1Enable.checked && dataManager.timeData1.length > 0) {
            if (this.app.fftEnabledCh1) {
                this.checkFFTChannelTrigger('CH1', dataManager.timeData1, dataManager.voltageData1, true, viewportStartT, viewportEndT);
            } else {
                this.checkPlaybackChannelTrigger('CH1', dataManager.timeData1, dataManager.voltageData1, viewportStartT, viewportEndT);
            }
            if (this.isTriggered) return;
        }
        if (this.triggerEnabled['CH2'] && this.app.ch2Enable.checked && dataManager.timeData2.length > 0) {
            if (this.app.fftEnabledCh2) {
                this.checkFFTChannelTrigger('CH2', dataManager.timeData2, dataManager.voltageData2, true, viewportStartT, viewportEndT);
            } else {
                this.checkPlaybackChannelTrigger('CH2', dataManager.timeData2, dataManager.voltageData2, viewportStartT, viewportEndT);
            }
            if (this.isTriggered) return;
        }
        if (this.triggerEnabled['MATH'] && this.app.mathEnable.checked && dataManager.timeDataMath.length > 0) {
            if (this.app.fftEnabledMath) {
                this.checkFFTChannelTrigger('MATH', dataManager.timeDataMath, dataManager.voltageDataMath, true, viewportStartT, viewportEndT);
            } else {
                this.checkPlaybackChannelTrigger('MATH', dataManager.timeDataMath, dataManager.voltageDataMath, viewportStartT, viewportEndT);
            }
        }
    }

    checkPlaybackChannelTrigger(chKey, timeArray, voltArray, viewportStartT, viewportEndT) {
        let startIndex = 0, endIndex = timeArray.length - 1;
        let low = 0, high = timeArray.length - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (timeArray[mid] < viewportStartT) { startIndex = mid; low = mid + 1; } else { high = mid - 1; }
        }
        low = 0; high = timeArray.length - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (timeArray[mid] <= viewportEndT) { endIndex = mid; low = mid + 1; } else { high = mid - 1; }
        }
        let consec = 0, triggerT = null;
        const lowL = this.triggerLowVolts[chKey], highL = this.triggerHighVolts[chKey];
        const minSamples = this.triggerMinSamples[chKey], minTime = this.triggerMinTimeSec[chKey];
        for (let k = startIndex; k <= endIndex; k++) {
            const t = timeArray[k], v = voltArray[k];
            const isOutside = (v < lowL || v > highL);
            if (isOutside) {
                if (triggerT === null) triggerT = t;
                consec++;
                if (consec >= minSamples && (t - triggerT) >= minTime) {
                    this.isTriggered = true;
                    this.triggerSourceChannel = chKey;
                    this.app.dataManager.playbackPlaying = false;
                    this.app.playBtn.textContent = "Play";
                    this.app.playBtn.className = "btn btn-green";
                    this.app.statusText.textContent = `Triggered: ${chKey} (Playback Paused)`;
                    this.app.statusText.className = "status-wait";
                    this.app.drawOscilloscope();
                    break;
                }
            } else { consec = 0; triggerT = null; }
        }
    }

    checkFFTChannelTrigger(chKey, timeArray, voltArray, isPlayback, viewportStartT, viewportEndT) {
        if (this.isTriggered) return;
        if (timeArray.length < 16) return;

        const timebase = this.app.HORIZ_VALS[this.app.currentTimebaseIdx];
        const screenDuration = timebase * 12; // 12 divs total horizontal

        const startT = timeArray[0];
        const endT = timeArray[timeArray.length - 1];
        const totalDuration = endT - startT;

        if (viewportStartT === null || viewportStartT === undefined) {
            if (this.app.mode === 'realtime') {
                viewportEndT = endT;
                viewportStartT = Math.max(startT, endT - screenDuration);
            } else {
                const targetT = startT + (this.app.horizontalPosition * Math.max(0, totalDuration - screenDuration));
                const vp = this.app.dataManager.getPlaybackViewport(timeArray, targetT, screenDuration);
                viewportStartT = vp.viewportStartT;
                viewportEndT = vp.viewportEndT;
            }
        }

        // Find visible sample boundaries via Binary Search
        let startIndex = 0;
        let endIndex = timeArray.length - 1;

        let low = 0, high = timeArray.length - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (timeArray[mid] < viewportStartT) {
                startIndex = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        low = 0; high = timeArray.length - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (timeArray[mid] <= viewportEndT) {
                endIndex = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        const visibleCount = endIndex - startIndex + 1;
        if (visibleCount < 16) return;

        // Resolve sampling dt
        const avg_dt = (timeArray[endIndex] - timeArray[startIndex]) / (endIndex - startIndex);

        // Slice real voltages
        const sliceReal = voltArray.subarray ? voltArray.subarray(startIndex, endIndex + 1) : voltArray.slice(startIndex, endIndex + 1);
        const fftResult = computeFFTSpectrum(sliceReal, avg_dt, this.app.fftWindow, this.app.fftVerticalBase);
        if (!fftResult) return;

        const { frequencies, magnitudes } = fftResult;
        const numBins = magnitudes.length;
        if (numBins <= 0) return;

        // Find all bin indices within [triggerFreqLowHz, triggerFreqHighHz]
        const freqLow = this.triggerFreqLowHz[chKey];
        const freqHigh = this.triggerFreqHighHz[chKey];
        const logic = this.triggerFFTMatchLogic[chKey] || 'any';

        const binsInRange = [];
        for (let k = 0; k < numBins; k++) {
            if (frequencies[k] >= freqLow && frequencies[k] <= freqHigh) {
                binsInRange.push(k);
            }
        }

        // If no bins fall in range, condition is not met
        let conditionMet = false;
        if (binsInRange.length > 0) {
            const lowL = this.triggerLowVolts[chKey];
            const highL = this.triggerHighVolts[chKey];

            if (logic === 'all') {
                // All bins in range must exceed or drop below thresholds
                conditionMet = binsInRange.every(k => {
                    const mag = magnitudes[k];
                    return mag < lowL || mag > highL;
                });
            } else {
                // Any bin in range satisfies (OR logic)
                conditionMet = binsInRange.some(k => {
                    const mag = magnitudes[k];
                    return mag < lowL || mag > highL;
                });
            }
        }

        const currentT = timeArray[endIndex]; // use the end of the viewport slice as current timestamp
        const minSamples = this.triggerMinSamples[chKey];
        const minTime = this.triggerMinTimeSec[chKey];

        if (conditionMet) {
            if (this.triggerStartTime[chKey] === null) {
                this.triggerStartTime[chKey] = currentT;
            }
            this.consecutiveOutsideSamples[chKey]++;
            const duration = currentT - this.triggerStartTime[chKey];

            if (this.consecutiveOutsideSamples[chKey] >= minSamples && duration >= minTime) {
                this.isTriggered = true;
                this.triggerSourceChannel = chKey;

                if (isPlayback) {
                    this.app.dataManager.playbackPlaying = false;
                    this.app.playBtn.textContent = "Play";
                    this.app.playBtn.className = "btn btn-green";
                    this.app.statusText.textContent = `Triggered: ${chKey} (Playback Paused)`;
                    this.app.statusText.className = "status-wait";
                    this.app.drawOscilloscope();
                } else {
                    if (this.triggerActionVal[chKey] === 'pause') {
                        this.app.displayFrozen = true;
                        this.app.freezeBtn.textContent = "Unfreeze Display";
                        this.app.freezeBtn.className = "btn btn-red";
                        this.app.statusText.textContent = `Triggered: ${chKey} (Frozen)`;
                        this.app.statusText.className = "status-wait";
                        this.app.drawOscilloscope();
                    } else {
                        this.postTriggerCounter[chKey] = 0;
                        this.app.statusText.textContent = `Triggered: ${chKey}! Capturing post...`;
                        this.app.statusText.className = "status-wait";
                    }
                }
            }
        } else {
            this.consecutiveOutsideSamples[chKey] = 0;
            this.triggerStartTime[chKey] = null;
        }
    }
}
