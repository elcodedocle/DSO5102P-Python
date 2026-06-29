// Metrics Module for Hantek Oscilloscope SPA
// Handles real-time statistic computations (Mean, Peak-to-Peak, RMS, etc.) and layouts

export class Metrics {
    constructor(app) {
        this.app = app;
        
        // Configuration States
        this.metricsEnabledCh1 = false;
        this.metricsEnabledCh2 = false;
        this.metricsEnabledMath = false;
        
        this.metricsLayout = 'bottom_overlay'; // 'bottom_overlay' or 'right_split'
        this.metricsAutoResetEnabled = true;
        this.metricsAutoResetMult = 1; // Number of viewport durations (VP) before resetting
        
        // Accumulators for real-time tracking
        this.metricsAccumulator = {
            CH1: { count: 0, mean: 0, min: Infinity, max: -Infinity, startTime: null },
            CH2: { count: 0, mean: 0, min: Infinity, max: -Infinity, startTime: null },
            MATH: { count: 0, mean: 0, min: Infinity, max: -Infinity, startTime: null }
        };
        
        this.maxProcessedTime = {
            CH1: -Infinity,
            CH2: -Infinity,
            MATH: -Infinity
        };
    }

    init() {
        this.initDOMReferences();
        this.initMetricsControls();
    }

    initDOMReferences() {
        this.metricsAutoresetVal = this.app.metricsAutoresetVal || document.getElementById('metrics-autoreset-val');
        this.canvas = this.app.canvas;
        this.ctx = this.app.ctx;
    }

    initMetricsControls() {
        // Wire up sidebar elements if they exist
        const ch1Checkbox = document.getElementById('ch1-metrics-enable');
        if (ch1Checkbox) {
            ch1Checkbox.addEventListener('change', () => {
                this.metricsEnabledCh1 = ch1Checkbox.checked;
                if (this.metricsEnabledCh1) this.resetChannelMetrics('CH1');
                this.app.drawOscilloscope();
            });
        }
        
        const ch2Checkbox = document.getElementById('ch2-metrics-enable');
        if (ch2Checkbox) {
            ch2Checkbox.addEventListener('change', () => {
                this.metricsEnabledCh2 = ch2Checkbox.checked;
                if (this.metricsEnabledCh2) this.resetChannelMetrics('CH2');
                this.app.drawOscilloscope();
            });
        }
        
        const mathCheckbox = document.getElementById('math-metrics-enable');
        if (mathCheckbox) {
            mathCheckbox.addEventListener('change', () => {
                this.metricsEnabledMath = mathCheckbox.checked;
                if (this.metricsEnabledMath) this.resetChannelMetrics('MATH');
                this.app.drawOscilloscope();
            });
        }
        
        const layoutSelect = document.getElementById('metrics-layout-select');
        if (layoutSelect) {
            layoutSelect.addEventListener('change', () => {
                this.metricsLayout = layoutSelect.value;
                this.app.drawOscilloscope();
            });
        }
        
        const autoResetCheckbox = document.getElementById('metrics-autoreset-enable');
        if (autoResetCheckbox) {
            autoResetCheckbox.addEventListener('change', () => {
                this.metricsAutoResetEnabled = autoResetCheckbox.checked;
                this.resetMetrics();
                this.app.drawOscilloscope();
            });
        }
        
        const autoResetSlider = document.getElementById('metrics-autoreset-slider');
        if (autoResetSlider) {
            autoResetSlider.addEventListener('input', () => {
                this.metricsAutoResetMult = parseInt(autoResetSlider.value);
                this.updateMetricsSliderLabel();
                this.resetMetrics();
                this.app.drawOscilloscope();
            });
        }
        
        const resetBtn = document.getElementById('metrics-reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.resetMetrics();
                this.app.drawOscilloscope();
            });
        }
    }

    getMetricsEnabled(channel) {
        if (channel === 'CH1') return this.metricsEnabledCh1;
        if (channel === 'CH2') return this.metricsEnabledCh2;
        return this.metricsEnabledMath;
    }

    updateMetricsSliderLabel() {
        const mult = this.metricsAutoResetMult || 1;
        const timebase = this.app.HORIZ_VALS[this.app.currentTimebaseIdx];
        const viewportDuration = timebase * 12;
        const durationSec = mult * viewportDuration;
        let durationText;
        if (durationSec < 1e-6) {
            durationText = (durationSec * 1e9).toFixed(1) + " ns";
        } else if (durationSec < 1e-3) {
            durationText = (durationSec * 1e6).toFixed(1) + " µs";
        } else if (durationSec < 1.0) {
            durationText = (durationSec * 1e3).toFixed(1) + " ms";
        } else {
            durationText = durationSec.toFixed(2) + " s";
        }
        if (this.metricsAutoresetVal) {
            this.metricsAutoresetVal.textContent = `${mult} VP (${durationText})`;
        }
    }

    resetMetrics() {
        this.metricsAccumulator = {
            CH1: { count: 0, mean: 0, min: Infinity, max: -Infinity, startTime: null },
            CH2: { count: 0, mean: 0, min: Infinity, max: -Infinity, startTime: null },
            MATH: { count: 0, mean: 0, min: Infinity, max: -Infinity, startTime: null }
        };
        this.maxProcessedTime = {
            CH1: -Infinity,
            CH2: -Infinity,
            MATH: -Infinity
        };
    }

    resetChannelMetrics(channel) {
        this.metricsAccumulator[channel] = { count: 0, mean: 0, min: Infinity, max: -Infinity, startTime: null };
        this.maxProcessedTime[channel] = -Infinity;
    }

    getViewportTimeRange() {
        const timebase = this.app.HORIZ_VALS[this.app.currentTimebaseIdx];
        const screenDuration = timebase * 12;
        const mainTimeData = this.app.timeData1.length > 0 ? this.app.timeData1 : this.app.timeData2;
        if (mainTimeData.length === 0) {
            return { startT: 0, endT: screenDuration };
        }
        const startT = mainTimeData[0];
        const endT = mainTimeData[mainTimeData.length - 1];
        const totalDuration = endT - startT;
        let viewportStartT, viewportEndT;
        if (this.app.mode === 'realtime') {
            viewportStartT = Math.max(startT, endT - screenDuration);
            viewportEndT = viewportStartT + screenDuration;
        } else {
            const targetT = startT + (this.app.horizontalPosition * Math.max(0, totalDuration - screenDuration));
            const vp = this.app.getPlaybackViewport(mainTimeData, targetT, screenDuration);
            viewportStartT = vp.viewportStartT;
            viewportEndT = vp.viewportEndT;
        }
        return { startT: viewportStartT, endT: viewportEndT };
    }

    getViewportSampleBounds(timeData, startT, endT) {
        let startIndex = 0;
        let endIndex = timeData.length - 1;
        
        let low = 0, high = timeData.length - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (timeData[mid] >= startT) {
                startIndex = mid;
                high = mid - 1;
            } else {
                low = mid + 1;
            }
        }
        
        low = 0;
        high = timeData.length - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (timeData[mid] <= endT) {
                endIndex = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        
        return { startIndex, endIndex };
    }

    processMetrics() {
        const { startT, endT } = this.getViewportTimeRange();
        
        const channels = ['CH1', 'CH2', 'MATH'];
        channels.forEach(channel => {
            let timeData, voltageData;
            if (channel === 'CH1') {
                timeData = this.app.timeData1;
                voltageData = this.app.voltageData1;
            } else if (channel === 'CH2') {
                timeData = this.app.timeData2;
                voltageData = this.app.voltageData2;
            } else {
                timeData = this.app.timeDataMath;
                voltageData = this.app.voltageDataMath;
            }
            
            const isMetricsEnabled = this.getMetricsEnabled(channel);
            const isChanEnabled = this.app.getChannelEnabled(channel);
            
            if (!isMetricsEnabled || !isChanEnabled || !timeData || timeData.length === 0) {
                return;
            }
            
            if (this.app.mode === 'realtime') {
                const len = timeData.length;
                if (timeData[len - 1] < this.maxProcessedTime[channel]) {
                    this.resetChannelMetrics(channel);
                }
                
                const acc = this.metricsAccumulator[channel];
                const timebase = this.app.HORIZ_VALS[this.app.currentTimebaseIdx];
                const viewportDuration = timebase * 12;
                
                let low = 0, high = len - 1;
                let firstNewIdx = len;
                while (low <= high) {
                    const mid = (low + high) >> 1;
                    if (timeData[mid] > this.maxProcessedTime[channel]) {
                        firstNewIdx = mid;
                        high = mid - 1;
                    } else {
                        low = mid + 1;
                    }
                }
                
                for (let i = firstNewIdx; i < len; i++) {
                    const t = timeData[i];
                    const v = voltageData[i];
                    
                    if (this.metricsAutoResetEnabled) {
                        if (acc.startTime === null) {
                            acc.startTime = t;
                        } else {
                            const limit = this.metricsAutoResetMult * viewportDuration;
                            if (t - acc.startTime >= limit) {
                                acc.count = 0;
                                acc.mean = 0;
                                acc.min = Infinity;
                                acc.max = -Infinity;
                                acc.startTime = t;
                            }
                        }
                    } else {
                        if (acc.startTime === null) {
                            acc.startTime = t;
                        }
                    }
                    
                    acc.count++;
                    acc.mean = acc.mean + (v - acc.mean) / acc.count;
                    if (v < acc.min) acc.min = v;
                    if (v > acc.max) acc.max = v;
                    
                    this.maxProcessedTime[channel] = t;
                }
            } else {
                const { startIndex, endIndex } = this.getViewportSampleBounds(timeData, startT, endT);
                
                let count = 0;
                let sum = 0;
                let min = Infinity;
                let max = -Infinity;
                
                if (startIndex <= endIndex && startIndex < timeData.length && endIndex >= 0) {
                    for (let i = startIndex; i <= endIndex; i++) {
                        const v = voltageData[i];
                        sum += v;
                        if (v < min) min = v;
                        if (v > max) max = v;
                        count++;
                    }
                }
                
                if (count > 0) {
                    this.metricsAccumulator[channel] = {
                        count: count,
                        mean: sum / count,
                        min: min,
                        max: max,
                        startTime: null
                    };
                } else {
                    this.metricsAccumulator[channel] = {
                        count: 0,
                        mean: null,
                        min: null,
                        max: null,
                        startTime: null
                    };
                }
            }
        });
    }

    drawMetrics(width, height, fullWidth) {
        if (this.metricsLayout === 'right_split' && (this.metricsEnabledCh1 || this.metricsEnabledCh2 || this.metricsEnabledMath)) {
            this.drawRightSplitMetrics(width, height, fullWidth);
        } else {
            this.drawBottomOverlayMetrics(width, height);
        }
    }

    drawBottomOverlayMetrics(width, height) {
        const activeChs = ['CH1', 'CH2', 'MATH'].filter(ch => this.getMetricsEnabled(ch) && this.app.getChannelEnabled(ch));
        if (activeChs.length === 0) return;
        
        this.ctx.fillStyle = 'rgba(5, 10, 5, 0.85)';
        this.ctx.strokeStyle = 'rgba(0, 255, 102, 0.15)';
        this.ctx.lineWidth = 1;
        const barHeight = 45;
        const barY = height - barHeight - 5;
        const barX = 10;
        const barWidth = width - 20;
        
        this.ctx.beginPath();
        this.drawRoundRect(this.ctx, barX, barY, barWidth, barHeight, 6);
        this.ctx.fill();
        this.ctx.stroke();
        
        const activeCount = activeChs.length;
        const colWidth = barWidth / activeCount;
        
        this.ctx.textBaseline = 'middle';
        this.ctx.textAlign = 'left';
        
        activeChs.forEach((ch, idx) => {
            const colX = barX + idx * colWidth;
            
            if (idx > 0) {
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.moveTo(colX, barY + 5);
                this.ctx.lineTo(colX, barY + barHeight - 5);
                this.ctx.stroke();
            }
            
            const textY = barY + barHeight / 2;
            this.ctx.fillStyle = this.app.getChannelColor(ch);
            this.ctx.font = 'bold 12px "Inter", "Roboto", "Outfit", "Helvetica Neue", sans-serif';
            this.ctx.fillText(ch, colX + 12, textY);
            
            const acc = this.metricsAccumulator[ch];
            const hasData = acc && acc.count > 0 && acc.min !== null && acc.min !== Infinity;
            
            const isFFT = this.app.getChannelFFTEnabled(ch);
            const strMin = hasData ? this.app.formatVoltage(acc.min, isFFT) : '--';
            const strMax = hasData ? this.app.formatVoltage(acc.max, isFFT) : '--';
            const strMean = hasData ? this.app.formatVoltage(acc.mean, isFFT) : '--';
            const strPkPk = hasData ? this.app.formatVoltage(Math.abs(acc.max - acc.min), isFFT) : '--';
            
            const labelXStart = colX + (activeCount === 3 ? 45 : 55);
            const itemWidth = (colWidth - (activeCount === 3 ? 55 : 65)) / 4;
            
            const items = [
                { label: 'Min', val: strMin },
                { label: 'Max', val: strMax },
                { label: 'Mean', val: strMean },
                { label: 'Pk-Pk', val: strPkPk }
            ];
            
            items.forEach((item, itemIdx) => {
                const itemX = labelXStart + itemIdx * itemWidth;
                
                this.ctx.font = '10px "Inter", "Roboto", "Outfit", "Helvetica Neue", sans-serif';
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
                this.ctx.fillText(item.label, itemX, textY - 8);
                
                this.ctx.font = 'bold 11px "Courier New", monospace';
                this.ctx.fillStyle = hasData ? '#ffffff' : 'rgba(255, 255, 255, 0.3)';
                this.ctx.fillText(item.val, itemX, textY + 8);
            });
        });
    }

    drawRightSplitMetrics(width, height, fullWidth) {
        const paneWidth = 220;
        const paneX = fullWidth - paneWidth;
        
        this.ctx.fillStyle = '#050a06';
        this.ctx.fillRect(paneX, 0, paneWidth, height);
        
        this.ctx.strokeStyle = 'rgba(0, 255, 102, 0.2)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(paneX, 0);
        this.ctx.lineTo(paneX, height);
        this.ctx.stroke();
        
        this.ctx.textBaseline = 'top';
        this.ctx.textAlign = 'left';
        this.ctx.fillStyle = '#889588';
        this.ctx.font = 'bold 10px "Inter", "Roboto", "Outfit", sans-serif';
        this.ctx.fillText('LIVE MEASUREMENTS', paneX + 15, 15);
        
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.beginPath();
        this.ctx.moveTo(paneX + 15, 32);
        this.ctx.lineTo(fullWidth - 15, 32);
        this.ctx.stroke();
        
        const activeChs = ['CH1', 'CH2', 'MATH'].filter(ch => this.getMetricsEnabled(ch) && this.app.getChannelEnabled(ch));
        
        if (activeChs.length === 0) {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
            this.ctx.font = 'italic 11px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('No active metrics.', paneX + paneWidth / 2, height / 2 - 10);
            this.ctx.fillText('Enable in sidebar.', paneX + paneWidth / 2, height / 2 + 10);
            this.ctx.textAlign = 'left';
            return;
        }
        
        let currentY = 45;
        const blockHeight = 115;
        
        activeChs.forEach(ch => {
            const chColor = this.app.getChannelColor(ch);
            
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
            this.ctx.beginPath();
            this.drawRoundRect(this.ctx, paneX + 12, currentY, paneWidth - 24, blockHeight, 6);
            this.ctx.fill();
            
            this.ctx.fillStyle = chColor;
            this.ctx.beginPath();
            this.drawRoundRect(this.ctx, paneX + 12, currentY, 4, blockHeight, 2);
            this.ctx.fill();
            
            this.ctx.fillStyle = chColor;
            this.ctx.font = 'bold 12px "Inter", "Roboto", "Outfit", sans-serif';
            this.ctx.fillText(ch, paneX + 26, currentY + 12);
            
            const acc = this.metricsAccumulator[ch];
            const hasData = acc && acc.count > 0 && acc.min !== null && acc.min !== Infinity;
            
            const isFFT = this.app.getChannelFFTEnabled(ch);
            const strMin = hasData ? this.app.formatVoltage(acc.min, isFFT) : '--';
            const strMax = hasData ? this.app.formatVoltage(acc.max, isFFT) : '--';
            const strMean = hasData ? this.app.formatVoltage(acc.mean, isFFT) : '--';
            const strPkPk = hasData ? this.app.formatVoltage(Math.abs(acc.max - acc.min), isFFT) : '--';
            
            const items = [
                { label: 'Min', val: strMin },
                { label: 'Max', val: strMax },
                { label: 'Mean', val: strMean },
                { label: 'Pk-Pk', val: strPkPk }
            ];
            
            const colW = (paneWidth - 44) / 2;
            
            items.forEach((item, itemIdx) => {
                const row = Math.floor(itemIdx / 2);
                const col = itemIdx % 2;
                
                const itemX = paneX + 26 + col * colW;
                const itemY = currentY + 36 + row * 38;
                
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
                this.ctx.font = '10px "Inter", "Roboto", "Outfit", sans-serif';
                this.ctx.fillText(item.label, itemX, itemY);
                
                this.ctx.fillStyle = hasData ? '#ffffff' : 'rgba(255, 255, 255, 0.25)';
                this.ctx.font = 'bold 11px "Courier New", monospace';
                this.ctx.fillText(item.val, itemX, itemY + 14);
            });
            
            currentY += blockHeight + 12;
        });
    }

    drawRoundRect(ctx, x, y, w, h, r) {
        if (ctx.roundRect) {
            ctx.roundRect(x, y, w, h, r);
        } else {
            if (w < 2 * r) r = w / 2;
            if (h < 2 * r) r = h / 2;
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
        }
    }
}
