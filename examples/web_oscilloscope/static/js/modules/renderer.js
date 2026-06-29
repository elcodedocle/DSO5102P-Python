// Renderer Module for Hantek Oscilloscope SPA
// Handles waveform rendering, CRT grid subdivision overlays, coordinate math, value formatting, and OSD display

import { computeFFTSpectrum } from './dsp.js';

export class Renderer {
    constructor(app) {
        this.app = app;
        
        // Cache references to canvas context
        this.canvas = this.app.canvas;
        this.ctx = this.app.ctx;
    }

    init() {
        this.canvas = this.app.canvas;
        this.ctx = this.app.ctx;
        this.osdLeftContainer = this.app.osdLeftContainer || document.getElementById('osd-left-container');
    }

    drawOscilloscope() {
        if (!this.canvas || !this.ctx) return;
        
        const fullWidth = this.canvas.width;
        const height = this.canvas.height;
        
        // Dark screen background
        this.ctx.fillStyle = '#020502';
        this.ctx.fillRect(0, 0, fullWidth, height);
        
        // Process measurements before drawing, so we have fresh metrics
        if (this.app.metrics) {
            this.app.metrics.processMetrics();
        }
        
        const width = this.getWaveWidth();
        const horizDivs = 12;
        const vertDivs = 10;
        
        this.ctx.save();
        // Clip to the waveform area
        this.ctx.beginPath();
        this.ctx.rect(0, 0, width, height);
        this.ctx.clip();
        
        const isSplit = this.app.layoutMode === 'split';
        
        // Inner function to draw a standard CRT subdivision grid inside a viewport clip box
        const drawViewportGrid = (x, y, w, h) => {
            const intensityFactor = this.app.gridIntensity / 25.0;
            const outerOpacity = Math.min(1.0, 0.06 * intensityFactor);
            const centralOpacity = Math.min(1.0, 0.22 * intensityFactor);

            this.ctx.strokeStyle = `rgba(0, 255, 102, ${outerOpacity})`;
            this.ctx.lineWidth = 1;
            
            const localDy = h / vertDivs;
            const localDx = w / horizDivs;
            
            // Vertical divisions
            for (let i = 1; i < horizDivs; i++) {
                this.ctx.beginPath();
                if (i === horizDivs / 2) {
                    this.ctx.strokeStyle = `rgba(0, 255, 102, ${centralOpacity})`;
                    this.ctx.setLineDash([2, 2]);
                } else {
                    this.ctx.strokeStyle = `rgba(0, 255, 102, ${outerOpacity})`;
                    this.ctx.setLineDash([]);
                }
                this.ctx.moveTo(x + i * localDx, y);
                this.ctx.lineTo(x + i * localDx, y + h);
                this.ctx.stroke();
            }
            
            // Horizontal divisions
            for (let i = 1; i < vertDivs; i++) {
                this.ctx.beginPath();
                if (i === vertDivs / 2) {
                    this.ctx.strokeStyle = `rgba(0, 255, 102, ${centralOpacity})`;
                    this.ctx.setLineDash([2, 2]);
                } else {
                    this.ctx.strokeStyle = `rgba(0, 255, 102, ${outerOpacity})`;
                    this.ctx.setLineDash([]);
                }
                this.ctx.moveTo(x, y + i * localDy);
                this.ctx.lineTo(x + w, y + i * localDy);
                this.ctx.stroke();
            }
            this.ctx.setLineDash([]);
        };
        
        if (!isSplit) {
            // Overlay Layout (Single Viewport)
            drawViewportGrid(0, 0, width, height);
            
            // Draw Traces on full viewport
            this.drawTrace(1, 0, 0, width, height);
            this.drawTrace(2, 0, 0, width, height);
            this.drawTrace(3, 0, 0, width, height);
        } else {
            // Split Viewport Layout (Two separate frames)
            const splitY = height / 2;
            
            // 1. TOP Viewport: Render CH1
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.rect(0, 0, width, splitY);
            this.ctx.clip();
            drawViewportGrid(0, 0, width, splitY);
            this.drawTrace(1, 0, 0, width, splitY);
            
            // Draw MATH on TOP split if CH2 is ACTIVE
            if (this.app.ch2Enable.checked) {
                this.drawTrace(3, 0, 0, width, splitY);
            }
            this.ctx.restore();
            
            // 2. BOTTOM Viewport: Render CH2
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.rect(0, splitY, width, splitY);
            this.ctx.clip();
            drawViewportGrid(0, splitY, width, splitY);
            this.drawTrace(2, 0, splitY, width, splitY);
            
            // Draw MATH on BOTTOM split if CH2 is INACTIVE
            if (!this.app.ch2Enable.checked) {
                this.drawTrace(3, 0, splitY, width, splitY);
            }
            this.ctx.restore();
            
            // Brighter division bar in middle
            const splitBarOpacity = Math.min(1.0, 0.45 * (this.app.gridIntensity / 25.0));
            this.ctx.strokeStyle = `rgba(0, 255, 102, ${splitBarOpacity})`;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(0, splitY);
            this.ctx.lineTo(width, splitY);
            this.ctx.stroke();
        }
        
        // Draw physical trigger overlay lines on canvas (Linked to active tab's vertical scale)
        const activeT = this.app.activeTab;
        const isFFT = this.getChannelFFTEnabled(activeT);
        const isChanEnabled = this.getChannelEnabled(activeT);
        
        if (this.app.triggerEnabled && this.app.triggerEnabled[activeT] && isChanEnabled && !isFFT) {
            this.ctx.save();
            this.ctx.lineWidth = 1.0;
            this.ctx.setLineDash([4, 4]);
            
            const voltbase = this.getVoltbaseValue(activeT);
            const offsetDiv = this.getVerticalOffset(activeT);
            
            const getLocalY = (valVolts) => {
                const div = (valVolts / voltbase) + offsetDiv;
                if (isSplit) {
                    const viewportH = height / 2;
                    let startY = 0;
                    if (activeT === 'CH2') startY = viewportH;
                    else if (activeT === 'MATH') startY = this.app.ch2Enable.checked ? viewportH : 0;
                    return startY + (viewportH / 2) - (div * (viewportH / 10));
                } else {
                    return (height / 2) - (div * (height / 10));
                }
            };
            
            const lowVolts = this.app.triggerLowVolts[activeT];
            const highVolts = this.app.triggerHighVolts[activeT];
            
            const yLow = getLocalY(lowVolts);
            if (activeT === 'CH1') {
                this.ctx.strokeStyle = 'rgba(0, 255, 102, 0.55)'; // Neon Green
            } else if (activeT === 'CH2') {
                this.ctx.strokeStyle = 'rgba(0, 229, 255, 0.55)'; // Neon Blue
            } else {
                this.ctx.strokeStyle = 'rgba(189, 0, 255, 0.55)'; // Neon Purple
            }
            this.ctx.beginPath();
            this.ctx.moveTo(0, yLow);
            this.ctx.lineTo(width, yLow);
            this.ctx.stroke();
            
            const yHigh = getLocalY(highVolts);
            if (activeT === 'CH1') {
                this.ctx.strokeStyle = 'rgba(255, 102, 0, 0.55)'; // Orange
            } else if (activeT === 'CH2') {
                this.ctx.strokeStyle = 'rgba(212, 175, 55, 0.55)'; // Gold
            } else {
                this.ctx.strokeStyle = 'rgba(255, 0, 127, 0.55)'; // Magenta
            }
            this.ctx.beginPath();
            this.ctx.moveTo(0, yHigh);
            this.ctx.lineTo(width, yHigh);
            this.ctx.stroke();
            this.ctx.restore();
        }
        
        // --- Interactive Cursors: Recalculate, Sync, Draw, Tooltip ---
        if (this.app.cursors && this.app.cursors.cursorsEnabled) {
            this.app.cursors.recalculateCursorCoords(this.app.cursors.cursor1);
            this.app.cursors.recalculateCursorCoords(this.app.cursors.cursor2);
            this.app.cursors.syncCursorSliders();
            this.app.cursors.drawCursors();
            this.app.cursors.updateCursorTooltip();
        } else {
            if (this.app.cursorTooltip) {
                this.app.cursorTooltip.classList.add('hide');
            }
        }
        
        // Restore clipping context
        this.ctx.restore();
        
        // Draw metrics (either bottom overlay or right split)
        if (this.app.metrics) {
            this.app.metrics.drawMetrics(width, height, fullWidth);
        }
        
        // Synchronize OSD overlays to canvas layout boundaries
        this.renderOSD();
    }
    
    drawTrace(channelId, vx, vy, vw, vh, overrideTimeData = null, overrideVoltageData = null, overrideAlpha = null, overrideViewportStartT = null, overrideScreenDuration = null) {
        // Resolve target arrays and settings
        let timeData, voltageData, color, enabled, isFFT, offsetDiv;
        let chanName;
        
        if (channelId === 1) {
            timeData = overrideTimeData !== null ? overrideTimeData : this.app.timeData1;
            voltageData = overrideVoltageData !== null ? overrideVoltageData : this.app.voltageData1;
            color = '#00ff66'; // Neon Green
            enabled = this.app.ch1Enable.checked;
            isFFT = this.app.fftEnabledCh1;
            offsetDiv = this.app.verticalOffsetDivCh1;
            chanName = 'CH1';
        } else if (channelId === 2) {
            timeData = overrideTimeData !== null ? overrideTimeData : this.app.timeData2;
            voltageData = overrideVoltageData !== null ? overrideVoltageData : this.app.voltageData2;
            color = '#00e5ff'; // Neon Blue
            enabled = this.app.ch2Enable.checked;
            isFFT = this.app.fftEnabledCh2;
            offsetDiv = this.app.verticalOffsetDivCh2;
            chanName = 'CH2';
        } else {
            timeData = overrideTimeData !== null ? overrideTimeData : this.app.timeDataMath;
            voltageData = overrideVoltageData !== null ? overrideVoltageData : this.app.voltageDataMath;
            color = '#bd00ff'; // Neon Purple
            enabled = this.app.mathEnable.checked;
            isFFT = this.app.fftEnabledMath;
            offsetDiv = this.app.verticalOffsetDivMath;
            chanName = 'MATH';
        }
        
        if (!enabled || !timeData || timeData.length === 0) return;
        
        const voltbase = this.getVoltbaseValue(chanName);
        const screenDivs = 10;
        const dy = vh / screenDivs;
        const centerY = vy + vh / 2;
        
        const timebase = this.app.HORIZ_VALS[this.app.currentTimebaseIdx];
        let screenDuration = timebase * 12; // 12 divs total horizontal
        
        const startT = timeData[0];
        const endT = timeData[timeData.length - 1];
        const totalDuration = endT - startT;
        
        let viewportStartT, viewportEndT;
        if (overrideViewportStartT !== null) {
            viewportStartT = overrideViewportStartT;
            screenDuration = overrideScreenDuration;
            viewportEndT = viewportStartT + screenDuration;
        } else {
            if (this.app.mode === 'realtime') {
                viewportEndT = endT;
                viewportStartT = Math.max(startT, endT - screenDuration);
            } else {
                const targetT = startT + (this.app.horizontalPosition * Math.max(0, totalDuration - screenDuration));
                const vp = this.app.getPlaybackViewport(timeData, targetT, screenDuration);
                viewportStartT = vp.viewportStartT;
                viewportEndT = vp.viewportEndT;
            }
        }
        
        // Find visible sample boundaries via Binary Search
        let startIndex = 0;
        let endIndex = timeData.length - 1;
        
        if (overrideViewportStartT === null) {
            let low = 0, high = timeData.length - 1;
            while (low <= high) {
                const mid = (low + high) >> 1;
                if (timeData[mid] < viewportStartT) {
                    startIndex = mid;
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }
            
            low = 0; high = timeData.length - 1;
            while (low <= high) {
                const mid = (low + high) >> 1;
                if (timeData[mid] <= viewportEndT) {
                    endIndex = mid;
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }
        }
        
        const visibleCount = endIndex - startIndex + 1;
        if (visibleCount <= 0) return;

        // Display Persistency logic
        if (overrideTimeData === null && this.app.persistenceMode && this.app.persistenceHistory) {
            const duration = this.getPersistenceDuration(chanName);
            const isPersistActive = this.app.persistenceMode[chanName] === 'AUTO' || 
                                    (this.app.persistenceMode[chanName] === 'MANUAL' && duration > 0.0);
                                    
            if (isPersistActive) {
                const now = performance.now();
                if (now - this.app.lastPersistenceCaptureTime[chanName] >= 100) {
                    this.app.lastPersistenceCaptureTime[chanName] = now;
                    if (visibleCount > 0 && startIndex <= endIndex) {
                        const snapTimeData = timeData.slice(startIndex, endIndex + 1);
                        const snapVoltageData = voltageData.slice(startIndex, endIndex + 1);
                        
                        this.app.persistenceHistory[chanName].push({
                            timeData: snapTimeData,
                            voltageData: snapVoltageData,
                            viewportStartT: viewportStartT,
                            screenDuration: screenDuration,
                            timestamp: now
                        });
                    }
                }
                
                const history = this.app.persistenceHistory[chanName];
                // Filter expired entries
                while (history.length > 0 && (now - history[0].timestamp) > duration * 1000) {
                    history.shift();
                }
                // Cap maximum frames stored
                const maxHistoryLen = duration === Infinity ? 60 : 150;
                while (history.length > maxHistoryLen) {
                    history.shift();
                }
                
                // Redraw past sweeps with progressive fade
                for (let i = 0; i < history.length - 1; i++) {
                    const snap = history[i];
                    let alpha;
                    if (duration === Infinity) {
                        alpha = 0.08 + 0.35 * (i / history.length);
                    } else {
                        const age = now - snap.timestamp;
                        const ratio = age / (duration * 1000);
                        alpha = 0.06 + 0.44 * (1 - Math.min(1.0, Math.max(0.0, ratio)));
                    }
                    
                    this.drawTrace(
                        channelId, vx, vy, vw, vh,
                        snap.timeData, snap.voltageData, alpha,
                        snap.viewportStartT, snap.screenDuration
                    );
                }
            } else {
                this.app.persistenceHistory[chanName] = [];
            }
        }
        
        // Resolve sampling dt
        const avg_dt = (timeData[endIndex] - timeData[startIndex]) / (endIndex - startIndex);
        
        // --- CHOOSE GRAPH DOMAIN (FFT vs. Time Domain) ---
        if (isFFT) {
            // FREQUENCY SPECTRUM PLOT
            const sliceReal = voltageData.subarray(startIndex, endIndex + 1);
            const fftResult = computeFFTSpectrum(sliceReal, avg_dt, this.app.fftWindow, this.app.fftVerticalBase);
            if (!fftResult) return;
            
            const { frequencies, magnitudes } = fftResult;
            if (!this.app.lastFFTResult) this.app.lastFFTResult = {};
            this.app.lastFFTResult[chanName] = fftResult;
            const numBins = magnitudes.length;
            if (numBins <= 0) return;
            
            // horizontal mapping
            const maxFreq = frequencies[numBins - 1];
            const getCanvasXFFT = (f) => {
                return vx + (f / maxFreq) * vw;
            };
            
            // vertical mapping
            const getCanvasYFFT = (m) => {
                if (this.app.fftVerticalBase === 'dBrms') {
                    // logarithmic dB scale
                    const div = (m - (offsetDiv * voltbase * 5)) / voltbase;
                    return centerY - div * dy;
                } else {
                    // linear Volts RMS scale, references bottom viewport
                    const bottomY = vy + vh;
                    const div = (m / voltbase) + offsetDiv;
                    return bottomY - div * dy;
                }
            };
            
            // Draw FFT magnitude spectrum curve
            this.ctx.save();
            if (overrideAlpha !== null) {
                this.ctx.globalAlpha = overrideAlpha;
            }
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 1.8;
            this.ctx.shadowColor = color;
            this.ctx.shadowBlur = 4;
            this.ctx.beginPath();
            
            let first = true;
            for (let i = 0; i < numBins; i++) {
                const cx = getCanvasXFFT(frequencies[i]);
                const cy = getCanvasYFFT(magnitudes[i]);
                
                if (first) {
                    this.ctx.moveTo(cx, cy);
                    first = false;
                } else {
                    this.ctx.lineTo(cx, cy);
                }
            }
            this.ctx.stroke();
            this.ctx.restore();
            
            // Draw dotted threshold and frequency limit lines if trigger is enabled for this channel and it is the selected active tab
            if (overrideTimeData === null && this.app.triggerEnabled && this.app.triggerEnabled[chanName] && chanName === this.app.activeTab) {
                this.ctx.save();
                this.ctx.lineWidth = 1.0;
                this.ctx.setLineDash([3, 3]);
 
                // --- 1. Horizontal magnitude threshold lines ---
                const lowL = this.app.triggerLowVolts[chanName];
                const highL = this.app.triggerHighVolts[chanName];
 
                const yLow = getCanvasYFFT(lowL);
                const yHigh = getCanvasYFFT(highL);
 
                // Ensure horizontal lines are drawn only within the viewport vertical bounds [vy, vy + vh]
                if (yLow >= vy && yLow <= vy + vh) {
                    if (chanName === 'CH1') {
                        this.ctx.strokeStyle = 'rgba(0, 255, 102, 0.55)'; // Neon Green
                    } else if (chanName === 'CH2') {
                        this.ctx.strokeStyle = 'rgba(0, 229, 255, 0.55)'; // Neon Blue
                    } else {
                        this.ctx.strokeStyle = 'rgba(189, 0, 255, 0.55)'; // Neon Purple
                    }
                    this.ctx.beginPath();
                    this.ctx.moveTo(vx, yLow);
                    this.ctx.lineTo(vx + vw, yLow);
                    this.ctx.stroke();
                }
 
                if (yHigh >= vy && yHigh <= vy + vh) {
                    if (chanName === 'CH1') {
                        this.ctx.strokeStyle = 'rgba(255, 102, 0, 0.55)'; // Orange
                    } else if (chanName === 'CH2') {
                        this.ctx.strokeStyle = 'rgba(212, 175, 55, 0.55)'; // Gold
                    } else {
                        this.ctx.strokeStyle = 'rgba(255, 0, 127, 0.55)'; // Magenta
                    }
                    this.ctx.beginPath();
                    this.ctx.moveTo(vx, yHigh);
                    this.ctx.lineTo(vx + vw, yHigh);
                    this.ctx.stroke();
                }
 
                // --- 2. Vertical frequency range limit lines ---
                const fLow = this.app.triggerFreqLowHz[chanName];
                const fHigh = this.app.triggerFreqHighHz[chanName];
 
                const xLow = getCanvasXFFT(fLow);
                const xHigh = getCanvasXFFT(fHigh);
 
                let vColor;
                if (chanName === 'CH1') {
                    vColor = 'rgba(0, 255, 102, 0.45)';
                } else if (chanName === 'CH2') {
                    vColor = 'rgba(0, 229, 255, 0.45)';
                } else {
                    vColor = 'rgba(189, 0, 255, 0.45)';
                }
 
                // Ensure vertical lines are drawn only within the viewport horizontal bounds [vx, vx + vw]
                if (xLow >= vx && xLow <= vx + vw) {
                    this.ctx.strokeStyle = vColor;
                    this.ctx.beginPath();
                    this.ctx.moveTo(xLow, vy);
                    this.ctx.lineTo(xLow, vy + vh);
                    this.ctx.stroke();
                }
 
                if (xHigh >= vx && xHigh <= vx + vw) {
                    this.ctx.strokeStyle = vColor;
                    this.ctx.beginPath();
                    this.ctx.moveTo(xHigh, vy);
                    this.ctx.lineTo(xHigh, vy + vh);
                    this.ctx.stroke();
                }
 
                this.ctx.restore();
            }
            
            if (overrideTimeData === null) {
                // Render tiny label in viewport for frequency markers
                this.ctx.fillStyle = color;
                this.ctx.font = '10px monospace';
                const lineHeight = 12;
                const textY = vy + vh - (lineHeight * 2.2) - (channelId === 1 ? 0 : (channelId === 2 ? lineHeight : lineHeight * 2));
                const freqDiv = maxFreq / 12;
                this.ctx.fillText(`${chanName} FFT Spectrum: ${this.formatFreq(freqDiv)}/div | Window: ${this.app.fftWindow}`, vx + 10, textY);
            }
            
        } else {
            // TIME DOMAIN WAVEFORM PLOT
            const getCanvasX = (t) => {
                return vx + ((t - viewportStartT) / screenDuration) * vw;
            };
            const getCanvasY = (v) => {
                const div = (v / voltbase) + offsetDiv;
                return centerY - div * dy;
            };
            
            this.ctx.save();
            if (overrideAlpha !== null) {
                this.ctx.globalAlpha = overrideAlpha;
            }
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 1.8;
            this.ctx.shadowColor = color;
            this.ctx.shadowBlur = 4;
            this.ctx.beginPath();
            
            const MAX_LINES = 1500;
            if (visibleCount <= MAX_LINES) {
                // Direct continuous line
                let first = true;
                for (let i = startIndex; i <= endIndex; i++) {
                    const cx = getCanvasX(timeData[i]);
                    const cy = getCanvasY(voltageData[i]);
                    if (first) {
                        this.ctx.moveTo(cx, cy);
                        first = false;
                    } else {
                        this.ctx.lineTo(cx, cy);
                    }
                }
            } else {
                // Pixel binning (Min-Max Decimation) to maintain 60FPS on large files
                const numBins = Math.round(vw);
                const samplesPerBin = visibleCount / numBins;
                let first = true;
                
                for (let bin = 0; bin < numBins; bin++) {
                    const binStart = Math.round(startIndex + bin * samplesPerBin);
                    const binEnd = Math.round(startIndex + (bin + 1) * samplesPerBin);
                    if (binStart >= timeData.length) break;
                    
                    let minVal = Infinity;
                    let maxVal = -Infinity;
                    let t_sum = 0.0;
                    let validCount = 0;
                    
                    for (let k = binStart; k < Math.min(binEnd, timeData.length); k++) {
                        const v = voltageData[k];
                        if (v < minVal) minVal = v;
                        if (v > maxVal) maxVal = v;
                        t_sum += timeData[k];
                        validCount++;
                    }
                    
                    if (validCount === 0) continue;
                    
                    const avg_t = t_sum / validCount;
                    const cx = getCanvasX(avg_t);
                    const cyMin = getCanvasY(minVal);
                    const cyMax = getCanvasY(maxVal);
                    
                    if (first) {
                        this.ctx.moveTo(cx, cyMin);
                        this.ctx.lineTo(cx, cyMax);
                        first = false;
                    } else {
                        this.ctx.lineTo(cx, cyMin);
                        this.ctx.lineTo(cx, cyMax);
                    }
                }
            }
            this.ctx.stroke();
            this.ctx.restore();
        }
    }
    
    renderOSD() {
        if (!this.osdLeftContainer) return;
        this.osdLeftContainer.innerHTML = '';
        
        // 1. Dynamic padding / positioning of OSD right overlay (based on right metrics split)
        const waveWidth = this.getWaveWidth();
        const splitOffset = this.canvas.width - waveWidth;
        const osdOverlay = document.getElementById('osd-overlay');
        if (osdOverlay) {
            osdOverlay.style.right = `${25 + splitOffset}px`;
        }

        const isSplitLayout = this.app.layoutMode === 'split';
        if (isSplitLayout) {
            this.osdLeftContainer.style.position = 'absolute';
            this.osdLeftContainer.style.top = '-25px';
            this.osdLeftContainer.style.left = '0';
            this.osdLeftContainer.style.width = '100%';
        } else {
            this.osdLeftContainer.style.position = '';
            this.osdLeftContainer.style.top = '';
            this.osdLeftContainer.style.left = '';
            this.osdLeftContainer.style.width = '';
        }

        const vyCount = {};

        const channels = ['CH1', 'CH2', 'MATH'];
        channels.forEach(ch => {
            let isDisplayed = false;
            let isOSDOn = false;
            if (ch === 'CH1') {
                isDisplayed = this.app.ch1Enable.checked;
                isOSDOn = this.app.osdEnabledCh1;
            } else if (ch === 'CH2') {
                isDisplayed = this.app.ch2Enable.checked;
                isOSDOn = this.app.osdEnabledCh2;
            } else if (ch === 'MATH') {
                isDisplayed = this.app.mathEnable.checked;
                isOSDOn = this.app.osdEnabledMath;
            }
            
            if (isDisplayed && isOSDOn) {
                const isFFT = this.getChannelFFTEnabled(ch);
                let scaleStr;
                let offsetStr;
                
                if (isFFT) {
                    if (this.app.fftVerticalBase === 'dBrms') {
                        const dbDiv = this.getVoltbaseValue(ch);
                        scaleStr = `${dbDiv} dB/div`;
                        const refLevel = this.getVerticalOffset(ch) * dbDiv * 5;
                        offsetStr = `${refLevel.toFixed(1)} dB`;
                    } else {
                        const voltbase = this.getVoltbaseValue(ch);
                        scaleStr = this.formatVolt(voltbase) + "rms";
                        const offsetVolts = -this.getVerticalOffset(ch) * voltbase;
                        offsetStr = `${offsetVolts.toFixed(3)} V`;
                    }
                } else {
                    const voltbase = this.getVoltbaseValue(ch);
                    scaleStr = this.formatVolt(voltbase);
                    const offsetVolts = -this.getVerticalOffset(ch) * voltbase;
                    offsetStr = `${offsetVolts.toFixed(3)} V`;
                }
                
                let color = '';
                let borderColor = '';
                let bgColor = '';
                let shadowColor = '';
                let title = ch;
                
                if (ch === 'CH1') {
                    color = 'rgba(0, 255, 102, 0.85)';
                    borderColor = 'rgba(0, 255, 102, 0.3)';
                    bgColor = 'rgba(5, 15, 5, 0.7)';
                    shadowColor = 'rgba(0, 255, 102, 0.5)';
                } else if (ch === 'CH2') {
                    color = 'rgba(0, 229, 255, 0.85)';
                    borderColor = 'rgba(0, 229, 255, 0.3)';
                    bgColor = 'rgba(5, 10, 15, 0.7)';
                    shadowColor = 'rgba(0, 229, 255, 0.5)';
                } else if (ch === 'MATH') {
                    color = 'rgba(189, 0, 255, 0.85)';
                    borderColor = 'rgba(189, 0, 255, 0.3)';
                    bgColor = 'rgba(15, 5, 15, 0.7)';
                    shadowColor = 'rgba(189, 0, 255, 0.5)';
                    title = `MATH (${this.app.mathOperation})`;
                }
                
                const block = document.createElement('div');
                block.className = 'osd-col';
                
                let extraStyles = '';
                if (isSplitLayout) {
                    const { vy } = this.getChannelViewport(ch);
                    if (!vyCount[vy]) {
                        vyCount[vy] = 0;
                    }
                    const blockIndex = vyCount[vy];
                    vyCount[vy]++;
                    
                    const leftOffset = blockIndex * 195;
                    extraStyles = `position: absolute; top: ${vy + 25}px; left: ${leftOffset}px; width: 180px; box-sizing: border-box;`;
                }
                
                block.setAttribute('style', `
                    color: ${color};
                    border-color: ${borderColor};
                    background-color: ${bgColor};
                    text-shadow: 0 0 3px ${shadowColor};
                    padding: 6px 12px;
                    border-radius: 4px;
                    border: 1px solid ${borderColor};
                    ${extraStyles}
                `);
                
                block.innerHTML = `
                    <div style="font-weight: bold; margin-bottom: 2px;">${title}</div>
                    <div>Scale: ${scaleStr}</div>
                    <div>Offset: ${offsetStr}</div>
                `;
                this.osdLeftContainer.appendChild(block);
            }
        });
    }

    getVoltbaseIdx(channel) {
        if (channel === 'CH1') return this.app.currentVoltbaseIdxCh1;
        if (channel === 'CH2') return this.app.currentVoltbaseIdxCh2;
        return this.app.currentVoltbaseIdxMath;
    }
    
    getVoltbaseValue(channel) {
        const isFFT = this.getChannelFFTEnabled(channel);
        if (isFFT && this.app.fftVerticalBase === 'dBrms') {
            const idx = this.getVoltbaseIdx(channel);
            return this.app.DB_DIVS[Math.min(idx, this.app.DB_DIVS.length - 1)];
        }
        return this.app.VERT_VALS[this.getVoltbaseIdx(channel)];
    }
    
    getVerticalOffset(channel) {
        if (channel === 'CH1') return this.app.verticalOffsetDivCh1;
        if (channel === 'CH2') return this.app.verticalOffsetDivCh2;
        return this.app.verticalOffsetDivMath;
    }

    getChannelViewport(channelName) {
        const height = this.canvas.height;
        if (this.app.layoutMode === 'split') {
            const splitY = height / 2;
            if (channelName === 'CH1') {
                return { vy: 0, vh: splitY };
            } else if (channelName === 'CH2') {
                return { vy: splitY, vh: splitY };
            } else if (channelName === 'MATH') {
                if (this.app.ch2Enable.checked) {
                    return { vy: 0, vh: splitY };
                } else {
                    return { vy: splitY, vh: splitY };
                }
            }
        } else {
            return { vy: 0, vh: height };
        }
    }

    getChannelFFTEnabled(channelName) {
        if (channelName === 'CH1') return this.app.fftEnabledCh1;
        if (channelName === 'CH2') return this.app.fftEnabledCh2;
        return this.app.fftEnabledMath;
    }

    getChannelEnabled(channelName) {
        if (channelName === 'CH1') return this.app.ch1Enable.checked;
        if (channelName === 'CH2') return this.app.ch2Enable.checked;
        return this.app.mathEnable.checked;
    }

    getChannelColor(channelName) {
        if (channelName === 'CH1') return '#00ff66';
        if (channelName === 'CH2') return '#00e5ff';
        return '#bd00ff';
    }

    getWaveWidth() {
        if (this.app.metrics && this.app.metrics.metricsLayout === 'right_split' && 
            (this.app.metrics.metricsEnabledCh1 || this.app.metrics.metricsEnabledCh2 || this.app.metrics.metricsEnabledMath)) {
            return this.canvas.width - 220;
        }
        return this.canvas.width;
    }

    getPersistenceDuration(chanName) {
        if (this.app.persistenceMode[chanName] === 'MANUAL') {
            return this.app.persistenceTime[chanName];
        }
        // AUTO mode dynamic calculation
        const timebase = this.app.HORIZ_VALS[this.app.currentTimebaseIdx];
        const screenDuration = timebase * 12;
        return Math.max(1.0, Math.min(10.0, screenDuration * 2.5));
    }

    canvasXToTime(cx) {
        const width = this.getWaveWidth();
        const timebase = this.app.HORIZ_VALS[this.app.currentTimebaseIdx];
        const screenDuration = timebase * 12;
        
        return ((cx - width / 2) / width) * screenDuration;
    }

    canvasXToFreq(cx, channelName) {
        const width = this.getWaveWidth();
        const fftResult = this.app.lastFFTResult && this.app.lastFFTResult[channelName];
        if (!fftResult || !fftResult.frequencies || fftResult.frequencies.length === 0) return 0;
        
        const maxFreq = fftResult.frequencies[fftResult.frequencies.length - 1];
        return (cx / width) * maxFreq;
    }

    canvasYToChannelValue(cy, channelName) {
        const viewport = this.getChannelViewport(channelName);
        if (!viewport) return 0;
        
        const { vy, vh } = viewport;
        const centerY = vy + vh / 2;
        const bottomY = vy + vh;
        const dy = vh / 10;
        
        const voltbase = this.getVoltbaseValue(channelName);
        const isFFT = this.getChannelFFTEnabled(channelName);
        const offsetDiv = this.getVerticalOffset(channelName);
        
        if (isFFT) {
            if (this.app.fftVerticalBase === 'dBrms') {
                const div = (centerY - cy) / dy;
                return div * voltbase + (offsetDiv * voltbase * 5);
            } else {
                const div = (bottomY - cy) / dy;
                return (div - offsetDiv) * voltbase;
            }
        } else {
            const div = (centerY - cy) / dy;
            return (div - offsetDiv) * voltbase;
        }
    }

    timeToCanvasX(t) {
        const width = this.getWaveWidth();
        const timebase = this.app.HORIZ_VALS[this.app.currentTimebaseIdx];
        const screenDuration = timebase * 12;
        
        return ((t / screenDuration) * width) + (width / 2);
    }

    freqToCanvasX(f, channelName) {
        const width = this.getWaveWidth();
        const fftResult = this.app.lastFFTResult && this.app.lastFFTResult[channelName];
        if (!fftResult || !fftResult.frequencies || fftResult.frequencies.length === 0) return 0;
        
        const maxFreq = fftResult.frequencies[fftResult.frequencies.length - 1];
        return (f / maxFreq) * width;
    }

    channelValueToCanvasY(val, channelName) {
        const viewport = this.getChannelViewport(channelName);
        if (!viewport) return 0;
        
        const { vy, vh } = viewport;
        const centerY = vy + vh / 2;
        const bottomY = vy + vh;
        const dy = vh / 10;
        
        const voltbase = this.getVoltbaseValue(channelName);
        const isFFT = this.getChannelFFTEnabled(channelName);
        const offsetDiv = this.getVerticalOffset(channelName);
        
        if (isFFT) {
            if (this.app.fftVerticalBase === 'dBrms') {
                const div = (val - (offsetDiv * voltbase * 5)) / voltbase;
                return centerY - div * dy;
            } else {
                const div = (val / voltbase) + offsetDiv;
                return bottomY - div * dy;
            }
        } else {
            const div = (val / voltbase) + offsetDiv;
            return centerY - div * dy;
        }
    }

    getChannelValueAtX(channelName, xVal) {
        let timeData, voltageData, isFFT;
        if (channelName === 'CH1') {
            timeData = this.app.timeData1;
            voltageData = this.app.voltageData1;
            isFFT = this.app.fftEnabledCh1;
        } else if (channelName === 'CH2') {
            timeData = this.app.timeData2;
            voltageData = this.app.voltageData2;
            isFFT = this.app.fftEnabledCh2;
        } else if (channelName === 'MATH') {
            timeData = this.app.timeDataMath;
            voltageData = this.app.voltageDataMath;
            isFFT = this.app.fftEnabledMath;
        }
        
        if (!timeData || timeData.length === 0) return null;
        
        if (isFFT) {
            const fftResult = this.app.lastFFTResult && this.app.lastFFTResult[channelName];
            if (!fftResult || !fftResult.frequencies || fftResult.frequencies.length === 0) return null;
            
            let low = 0, high = fftResult.frequencies.length - 1;
            let closestIdx = 0;
            let minDiff = Infinity;
            while (low <= high) {
                const mid = (low + high) >> 1;
                const diff = Math.abs(fftResult.frequencies[mid] - xVal);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIdx = mid;
                }
                if (fftResult.frequencies[mid] < xVal) {
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }
            return fftResult.magnitudes[closestIdx];
        } else {
            const timebase = this.app.HORIZ_VALS[this.app.currentTimebaseIdx];
            const screenDuration = timebase * 12;
            
            const startT = timeData[0];
            const endT = timeData[timeData.length - 1];
            const totalDuration = endT - startT;
            
            let viewportStartT;
            if (this.app.mode === 'realtime') {
                viewportStartT = Math.max(startT, endT - screenDuration);
            } else {
                const targetT = startT + (this.app.horizontalPosition * Math.max(0, totalDuration - screenDuration));
                viewportStartT = this.app.getPlaybackViewport(timeData, targetT, screenDuration).viewportStartT;
            }
            
            const tAbsolute = viewportStartT + xVal + (screenDuration / 2);
            
            let low = 0, high = timeData.length - 1;
            let closestIdx = 0;
            let minDiff = Infinity;
            while (low <= high) {
                const mid = (low + high) >> 1;
                const diff = Math.abs(timeData[mid] - tAbsolute);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIdx = mid;
                }
                if (timeData[mid] < tAbsolute) {
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }
            return voltageData[closestIdx];
        }
    }

    formatTime(t) {
        const formatWithDecimals = (val) => {
            const rounded = Math.round(val * 10) / 10;
            return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
        };
        if (t < 1e-6) return `${formatWithDecimals(t * 1e9)} ns`;
        if (t < 1e-3) return `${formatWithDecimals(t * 1e6)} us`;
        if (t < 1.0) return `${formatWithDecimals(t * 1e3)} ms`;
        return `${formatWithDecimals(t)} s`;
    }

    formatVolt(v) {
        const formatWithDecimals = (val) => {
            const rounded = Math.round(val * 100) / 100;
            return rounded % 1 === 0 ? rounded.toFixed(0) : (rounded % 0.1 === 0 ? rounded.toFixed(1) : rounded.toFixed(2));
        };
        if (v < 1.0) return `${formatWithDecimals(v * 1000)} mV`;
        return `${formatWithDecimals(v)} V`;
    }

    formatFreq(f) {
        if (f < 1e3) return `${f.toFixed(1)} Hz`;
        if (f < 1e6) return `${(f / 1e3).toFixed(2)} kHz`;
        return `${(f / 1e6).toFixed(2)} MHz`;
    }

    formatVoltage(v, isFFT) {
        if (isFFT && this.app.fftVerticalBase === 'dBrms') {
            return `${v.toFixed(2)} dB`;
        }
        const absV = Math.abs(v);
        if (absV === 0) return '0.00 V';
        if (absV < 1e-3) return `${(v * 1e6).toFixed(1)} µV`;
        if (absV < 1.0) return `${(v * 1e3).toFixed(1)} mV`;
        return `${v.toFixed(3)} V`;
    }
}
