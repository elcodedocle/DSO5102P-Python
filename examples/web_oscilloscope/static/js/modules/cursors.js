// Cursors Module for Hantek Oscilloscope SPA
// Manages dual cursor measurements, interactive drag-and-drop, sliders, tracking modes, and calculations

export class Cursors {
    constructor(app) {
        this.app = app;
        
        // Cursor State Properties
        this.cursorsEnabled = false;
        this.cursorChEnabled = { 'CH1': true, 'CH2': true, 'MATH': true };
        this.cursorTrackingMode = { 'CH1': 'free', 'CH2': 'free', 'MATH': 'free' };
        
        this.cursor1 = null;
        this.cursor2 = null;
        this.tempCursor = null;
    }

    init() {
        this.initDOMReferences();
        this.initCursors();
    }

    initDOMReferences() {
        // Cache references to cursor DOM elements from app or document
        this.cursorsEnableCheckbox = this.app.cursorsEnableCheckbox || document.getElementById('cursors-enable');
        this.cursorChannelSelects = this.app.cursorChannelSelects || document.getElementById('cursor-channel-selects');
        this.cursorCh1Enable = this.app.cursorCh1Enable || document.getElementById('cursor-ch1-enable');
        this.cursorCh2Enable = this.app.cursorCh2Enable || document.getElementById('cursor-ch2-enable');
        this.cursorMathEnable = this.app.cursorMathEnable || document.getElementById('cursor-math-enable');
        this.cursorCh1Track = this.app.cursorCh1Track || document.getElementById('cursor-ch1-track');
        this.cursorCh2Track = this.app.cursorCh2Track || document.getElementById('cursor-ch2-track');
        this.cursorMathTrack = this.app.cursorMathTrack || document.getElementById('cursor-math-track');
        this.cursorSlidersGroup = this.app.cursorSlidersGroup || document.getElementById('cursor-sliders-group');
        this.cursor1Sliders = this.app.cursor1Sliders || document.getElementById('cursor1-sliders');
        this.cursor2Sliders = this.app.cursor2Sliders || document.getElementById('cursor2-sliders');
        this.cursor1XSlider = this.app.cursor1XSlider || document.getElementById('cursor1-x-slider');
        this.cursor1YSlider = this.app.cursor1YSlider || document.getElementById('cursor1-y-slider');
        this.cursor2XSlider = this.app.cursor2XSlider || document.getElementById('cursor2-x-slider');
        this.cursor2YSlider = this.app.cursor2YSlider || document.getElementById('cursor2-y-slider');
        this.cursorResetBtn = this.app.cursorResetBtn || document.getElementById('cursor-reset-btn');
        this.cursorTooltip = this.app.cursorTooltip || document.getElementById('cursor-tooltip');
        this.cursorButtons = this.app.cursorButtons || document.getElementById('cursor-buttons');
        this.canvas = this.app.canvas;
        this.ctx = this.app.ctx;
    }

    initCursors() {
        if (!this.cursorsEnableCheckbox) return;

        // 1. Checkbox Enable/Disable
        this.cursorsEnableCheckbox.addEventListener('change', () => {
            this.cursorsEnabled = this.cursorsEnableCheckbox.checked;
            if (!this.cursorsEnabled) {
                this.resetCursors();
            }
            this.updateCursorCSS();
            this.updateCursorUIVisibility();
            this.app.drawOscilloscope();
        });
        
        // 2. Channel Visible Selection Checkboxes
        if (this.cursorCh1Enable) {
            this.cursorCh1Enable.addEventListener('change', () => {
                this.cursorChEnabled['CH1'] = this.cursorCh1Enable.checked;
                this.app.drawOscilloscope();
            });
        }
        if (this.cursorCh2Enable) {
            this.cursorCh2Enable.addEventListener('change', () => {
                this.cursorChEnabled['CH2'] = this.cursorCh2Enable.checked;
                this.app.drawOscilloscope();
            });
        }
        if (this.cursorMathEnable) {
            this.cursorMathEnable.addEventListener('change', () => {
                this.cursorChEnabled['MATH'] = this.cursorMathEnable.checked;
                this.app.drawOscilloscope();
            });
        }
        
        // 3. Channel Tracking Mode Selects
        if (this.cursorCh1Track) {
            this.cursorCh1Track.addEventListener('change', () => {
                this.cursorTrackingMode['CH1'] = this.cursorCh1Track.value;
                this.app.drawOscilloscope();
            });
        }
        if (this.cursorCh2Track) {
            this.cursorCh2Track.addEventListener('change', () => {
                this.cursorTrackingMode['CH2'] = this.cursorCh2Track.value;
                this.app.drawOscilloscope();
            });
        }
        if (this.cursorMathTrack) {
            this.cursorMathTrack.addEventListener('change', () => {
                this.cursorTrackingMode['MATH'] = this.cursorMathTrack.value;
                this.app.drawOscilloscope();
            });
        }
        
        // 4. Cursor position sliders
        const handleXSliderInput = (cursor, slider) => {
            if (!cursor) return;
            const pct = parseFloat(slider.value);
            const cx = (pct / 100) * this.canvas.width;
            cursor.time = this.app.canvasXToTime(cx);
            cursor.freq = this.app.canvasXToFreq(cx, cursor.activeCh);
            cursor.x = cx;
            this.app.drawOscilloscope();
        };
        
        const handleYSliderInput = (cursor, slider) => {
            if (!cursor) return;
            const pct = parseFloat(slider.value);
            const viewport = this.app.getChannelViewport(cursor.activeCh);
            const cy = viewport.vy + ((100 - pct) / 100) * viewport.vh;
            cursor.posValue = this.app.canvasYToChannelValue(cy, cursor.activeCh);
            cursor.y = cy;
            this.app.drawOscilloscope();
        };
        
        if (this.cursor1XSlider) {
            this.cursor1XSlider.addEventListener('input', () => handleXSliderInput(this.cursor1, this.cursor1XSlider));
        }
        if (this.cursor1YSlider) {
            this.cursor1YSlider.addEventListener('input', () => handleYSliderInput(this.cursor1, this.cursor1YSlider));
        }
        if (this.cursor2XSlider) {
            this.cursor2XSlider.addEventListener('input', () => handleXSliderInput(this.cursor2, this.cursor2XSlider));
        }
        if (this.cursor2YSlider) {
            this.cursor2YSlider.addEventListener('input', () => handleYSliderInput(this.cursor2, this.cursor2YSlider));
        }
        
        // 5. Reset button
        if (this.cursorResetBtn) {
            this.cursorResetBtn.addEventListener('click', () => {
                this.resetCursors();
                this.updateCursorUIVisibility();
                this.app.drawOscilloscope();
            });
        }
        
        // 6. Pointer events on the canvas
        if (this.canvas) {
            this.canvas.addEventListener('pointermove', (e) => {
                if (!this.cursorsEnabled) return;
                const rect = this.canvas.getBoundingClientRect();
                const scaleX = rect.width > 0 ? (this.canvas.width / rect.width) : 1;
                const scaleY = rect.height > 0 ? (this.canvas.height / rect.height) : 1;
                const cx = Math.max(0, Math.min(this.app.getWaveWidth(), (e.clientX - rect.left) * scaleX));
                const cy = Math.max(0, Math.min(this.canvas.height, (e.clientY - rect.top) * scaleY));
                
                // Update temporary cursor following mouse if < 2 locked cursors
                if (this.cursor1 === null || this.cursor2 === null) {
                    this.tempCursor = {
                        x: cx,
                        y: cy,
                        time: this.app.canvasXToTime(cx),
                        freq: this.app.canvasXToFreq(cx, this.app.activeTab),
                        posValue: this.app.canvasYToChannelValue(cy, this.app.activeTab),
                        activeCh: this.app.activeTab
                    };
                } else {
                    this.tempCursor = null;
                }
                this.app.drawOscilloscope();
            });
            
            this.canvas.addEventListener('pointerdown', (e) => {
                if (!this.cursorsEnabled || e.button !== 0) return;
                const rect = this.canvas.getBoundingClientRect();
                const scaleX = rect.width > 0 ? (this.canvas.width / rect.width) : 1;
                const scaleY = rect.height > 0 ? (this.canvas.height / rect.height) : 1;
                const cx = Math.max(0, Math.min(this.app.getWaveWidth(), (e.clientX - rect.left) * scaleX));
                const cy = Math.max(0, Math.min(this.canvas.height, (e.clientY - rect.top) * scaleY));
                
                if (this.cursor1 === null) {
                    this.cursor1 = {
                        x: cx,
                        y: cy,
                        time: this.app.canvasXToTime(cx),
                        freq: this.app.canvasXToFreq(cx, this.app.activeTab),
                        posValue: this.app.canvasYToChannelValue(cy, this.app.activeTab),
                        activeCh: this.app.activeTab
                    };
                    this.tempCursor = null;
                    this.updateCursorUIVisibility();
                    this.syncCursorSliders();
                } else if (this.cursor2 === null) {
                    this.cursor2 = {
                        x: cx,
                        y: cy,
                        time: this.app.canvasXToTime(cx),
                        freq: this.app.canvasXToFreq(cx, this.app.activeTab),
                        posValue: this.app.canvasYToChannelValue(cy, this.app.activeTab),
                        activeCh: this.app.activeTab
                    };
                    this.tempCursor = null;
                    this.updateCursorUIVisibility();
                    this.syncCursorSliders();
                }
                this.app.drawOscilloscope();
            });
            
            this.canvas.addEventListener('pointerleave', () => {
                if (!this.cursorsEnabled) return;
                this.tempCursor = null;
                this.app.drawOscilloscope();
            });
        }
        
        // Initial setup for the pointer cursor CSS style
        this.updateCursorCSS();
    }
    
    updateCursorCSS() {
        if (!this.canvas) return;
        if (this.cursorsEnabled) {
            this.canvas.style.cursor = 'crosshair';
        } else {
            this.canvas.style.cursor = 'default';
        }
    }
    
    resetCursors() {
        this.cursor1 = null;
        this.cursor2 = null;
        this.tempCursor = null;
        
        // Hide sliders
        if (this.cursorSlidersGroup) this.cursorSlidersGroup.classList.add('hide');
        if (this.cursor1Sliders) this.cursor1Sliders.classList.add('hide');
        if (this.cursor2Sliders) this.cursor2Sliders.classList.add('hide');
        
        // Hide tooltip
        if (this.cursorTooltip) this.cursorTooltip.classList.add('hide');
    }
    
    updateCursorUIVisibility() {
        if (!this.cursorsEnabled) {
            if (this.cursorChannelSelects) this.cursorChannelSelects.classList.add('hide');
            if (this.cursorSlidersGroup) this.cursorSlidersGroup.classList.add('hide');
            if (this.cursor1Sliders) this.cursor1Sliders.classList.add('hide');
            if (this.cursor2Sliders) this.cursor2Sliders.classList.add('hide');
            if (this.cursorButtons) this.cursorButtons.classList.add('hide');
            if (this.cursorTooltip) this.cursorTooltip.classList.add('hide');
            return;
        }

        if (this.cursorChannelSelects) this.cursorChannelSelects.classList.remove('hide');
        if (this.cursorButtons) this.cursorButtons.classList.remove('hide');
        
        if (this.cursor1 || this.cursor2) {
            if (this.cursorSlidersGroup) this.cursorSlidersGroup.classList.remove('hide');
        } else {
            if (this.cursorSlidersGroup) this.cursorSlidersGroup.classList.add('hide');
        }
        
        if (this.cursor1) {
            if (this.cursor1Sliders) this.cursor1Sliders.classList.remove('hide');
        } else {
            if (this.cursor1Sliders) this.cursor1Sliders.classList.add('hide');
        }
        
        if (this.cursor2) {
            if (this.cursor2Sliders) this.cursor2Sliders.classList.remove('hide');
        } else {
            if (this.cursor2Sliders) this.cursor2Sliders.classList.add('hide');
        }
    }
    
    syncCursorSliders() {
        // Prevent feedback loop if user is dragging slider
        if (document.activeElement === this.cursor1XSlider || 
            document.activeElement === this.cursor1YSlider || 
            document.activeElement === this.cursor2XSlider || 
            document.activeElement === this.cursor2YSlider) {
            return;
        }
        
        if (this.cursor1 && this.cursor1XSlider && this.cursor1YSlider) {
            this.cursor1XSlider.value = (this.cursor1.x / this.canvas.width) * 100;
            const viewport = this.app.getChannelViewport(this.cursor1.activeCh);
            this.cursor1YSlider.value = 100 - ((this.cursor1.y - viewport.vy) / viewport.vh) * 100;
        }
        if (this.cursor2 && this.cursor2XSlider && this.cursor2YSlider) {
            this.cursor2XSlider.value = (this.cursor2.x / this.canvas.width) * 100;
            const viewport = this.app.getChannelViewport(this.cursor2.activeCh);
            this.cursor2YSlider.value = 100 - ((this.cursor2.y - viewport.vy) / viewport.vh) * 100;
        }
    }
    
    recalculateCursorCoords(cursor) {
        if (!cursor) return;
        
        const isFFT = this.app.getChannelFFTEnabled(cursor.activeCh);
        
        // Recalculate X coordinate
        if (isFFT) {
            cursor.x = this.app.freqToCanvasX(cursor.freq, cursor.activeCh);
        } else {
            cursor.x = this.app.timeToCanvasX(cursor.time);
        }
        
        // Recalculate Y coordinate
        const trackMode = this.cursorTrackingMode[cursor.activeCh];
        if (trackMode === 'track') {
            const xPhysical = isFFT ? cursor.freq : cursor.time;
            const traceVal = this.app.getChannelValueAtX(cursor.activeCh, xPhysical);
            if (traceVal !== null) {
                cursor.y = this.app.channelValueToCanvasY(traceVal, cursor.activeCh);
            } else {
                cursor.y = this.app.channelValueToCanvasY(cursor.posValue, cursor.activeCh);
            }
        } else {
            cursor.y = this.app.channelValueToCanvasY(cursor.posValue, cursor.activeCh);
        }
    }
    
    drawCursors() {
        if (!this.cursorsEnabled) return;
        
        if (this.cursor1) {
            this.drawSingleCursor(this.cursor1, '#ffaa00', 'C1');
        }
        if (this.cursor2) {
            this.drawSingleCursor(this.cursor2, '#ff5500', 'C2');
        }
        if (this.tempCursor) {
            this.drawSingleCursor(this.tempCursor, 'rgba(255, 255, 255, 0.45)', 'T');
        }
    }
    
    drawSingleCursor(cursor, color, label) {
        if (!cursor) return;
        
        const width = this.app.getWaveWidth();
        const height = this.canvas.height;
        
        this.ctx.save();
        
        // 1. Draw full-height vertical line
        this.ctx.beginPath();
        this.ctx.setLineDash([4, 4]);
        this.ctx.moveTo(cursor.x, 0);
        this.ctx.lineTo(cursor.x, height);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        
        // 2. Draw label at the top
        this.ctx.beginPath();
        this.ctx.setLineDash([]);
        this.ctx.fillStyle = color;
        this.ctx.font = 'bold 10px Inter, Roboto, sans-serif';
        this.ctx.fillText(label, cursor.x + 5, 14);
        
        // 3. Draw horizontal lines or trace tracking squares for enabled channels
        for (const ch of ['CH1', 'CH2', 'MATH']) {
            if (!this.app.getChannelEnabled(ch) || !this.cursorChEnabled[ch]) continue;
            
            const isFFT = this.app.getChannelFFTEnabled(ch);
            const trackMode = this.cursorTrackingMode[ch];
            const chColor = this.app.getChannelColor(ch);
            
            if (trackMode === 'track') {
                const xPhysical = isFFT ? cursor.freq : cursor.time;
                const traceVal = this.app.getChannelValueAtX(ch, xPhysical);
                if (traceVal !== null) {
                    const cyTrack = this.app.channelValueToCanvasY(traceVal, ch);
                    
                    this.ctx.save();
                    this.ctx.setLineDash([]);
                    this.ctx.fillStyle = chColor;
                    this.ctx.strokeStyle = '#ffffff';
                    this.ctx.lineWidth = 1.5;
                    
                    this.ctx.shadowBlur = 8;
                    this.ctx.shadowColor = chColor;
                    
                    const size = 8;
                    this.ctx.fillRect(cursor.x - size / 2, cyTrack - size / 2, size, size);
                    this.ctx.strokeRect(cursor.x - size / 2, cyTrack - size / 2, size, size);
                    this.ctx.restore();
                }
            } else {
                const cy = this.app.channelValueToCanvasY(cursor.posValue, ch);
                
                this.ctx.beginPath();
                this.ctx.setLineDash([4, 4]);
                this.ctx.moveTo(0, cy);
                this.ctx.lineTo(width, cy);
                this.ctx.strokeStyle = color + '7a'; // Semi-transparent
                this.ctx.lineWidth = 0.8;
                this.ctx.stroke();
            }
        }
        
        this.ctx.restore();
    }
    
    updateCursorTooltip() {
        let c1 = null;
        let c2 = null;
        let isComparison = false;
        
        if (this.cursor1 && this.cursor2) {
            c1 = this.cursor1;
            c2 = this.cursor2;
            isComparison = true;
        } else if (this.cursor1 && this.tempCursor) {
            c1 = this.cursor1;
            c2 = this.tempCursor;
            isComparison = true;
        } else if (this.cursor1) {
            c1 = this.cursor1;
            c2 = null;
            isComparison = false;
        } else if (this.tempCursor) {
            c1 = this.tempCursor;
            c2 = null;
            isComparison = false;
        }
        
        if (!c1) {
            if (this.cursorTooltip) this.cursorTooltip.classList.add('hide');
            return;
        }
        
        let html = '';
        let title;
        if (this.cursor1 && this.cursor2) {
            title = 'Cursors Locked';
        } else if (this.cursor1) {
            title = 'Lock Cursor 2';
        } else {
            title = 'Lock Cursor 1';
        }
        
        html += `<div class="tooltip-header">${title}</div>`;
        html += `<table>`;
        
        let showTime = false;
        let showFreq = false;
        
        for (const ch of ['CH1', 'CH2', 'MATH']) {
            if (this.app.getChannelEnabled(ch) && this.cursorChEnabled[ch]) {
                if (this.app.getChannelFFTEnabled(ch)) showFreq = true;
                else showTime = true;
            }
        }
        
        if (!showTime && !showFreq) showTime = true;
        
        if (isComparison && c2) {
            const col2Label = 'C1';
            const col3Label = (this.cursor2) ? 'C2' : 'T';
            
            html += `<thead><tr style="border-bottom: 1px solid rgba(255,255,255,0.1);"><td style="color: #888;">Param</td><td style="color: #ffaa00; text-align: right;">${col2Label}</td><td style="color: #ff5500; text-align: right;">${col3Label}</td><td style="color: #bd00ff; text-align: right;">Δ</td></tr></thead>`;
            html += `<tbody>`;
            
            if (showTime) {
                const deltaT = Math.abs(c2.time - c1.time);
                html += `<tr><td style="color: #aaa;">Time</td><td style="text-align: right;">${this.app.formatTime(c1.time)}</td><td style="text-align: right;">${this.app.formatTime(c2.time)}</td><td class="cursor-delta" style="text-align: right; border-top: none; padding-top: 3px;">${this.app.formatTime(deltaT)}</td></tr>`;
            }
            
            if (showFreq) {
                const deltaF = Math.abs(c2.freq - c1.freq);
                html += `<tr><td style="color: #aaa;">Freq</td><td style="text-align: right;">${this.app.formatFreq(c1.freq)}</td><td style="text-align: right;">${this.app.formatFreq(c2.freq)}</td><td class="cursor-delta" style="text-align: right; border-top: none; padding-top: 3px;">${this.app.formatFreq(deltaF)}</td></tr>`;
            }
            
            for (const ch of ['CH1', 'CH2', 'MATH']) {
                if (this.app.getChannelEnabled(ch) && this.cursorChEnabled[ch]) {
                    const chClass = ch === 'CH1' ? 'channel-ch1' : (ch === 'CH2' ? 'channel-ch2' : 'channel-math');
                    const isFftCh = this.app.getChannelFFTEnabled(ch);
                    
                    const xVal1 = isFftCh ? c1.freq : c1.time;
                    const val1 = this.app.getChannelValueAtX(ch, xVal1);
                    const strVal1 = val1 !== null ? this.app.formatVoltage(val1, isFftCh) : '--';
                    
                    const xVal2 = isFftCh ? c2.freq : c2.time;
                    const val2 = this.app.getChannelValueAtX(ch, xVal2);
                    const strVal2 = val2 !== null ? this.app.formatVoltage(val2, isFftCh) : '--';
                    
                    let strDelta = '--';
                    if (val1 !== null && val2 !== null) {
                        strDelta = this.app.formatVoltage(Math.abs(val2 - val1), isFftCh);
                    }
                    
                    html += `<tr><td class="${chClass}">${ch}</td><td style="text-align: right;">${strVal1}</td><td style="text-align: right;">${strVal2}</td><td class="cursor-delta" style="text-align: right; border-top: none; padding-top: 3px;">${strDelta}</td></tr>`;
                }
            }
            
            const activeCh = this.app.activeTab;
            const isFftActive = this.app.getChannelFFTEnabled(activeCh);
            const strPos1 = this.app.formatVoltage(c1.posValue, isFftActive);
            const strPos2 = this.app.formatVoltage(c2.posValue, isFftActive);
            const deltaPos = Math.abs(c2.posValue - c1.posValue);
            const strDeltaPos = this.app.formatVoltage(deltaPos, isFftActive);
            
            html += `<tr style="border-top: 1px dashed rgba(255,255,255,0.15);"><td style="color: #ffaa00;">POS</td><td style="text-align: right; color: #ffaa00;">${strPos1}</td><td style="text-align: right; color: #ffaa00;">${strPos2}</td><td class="cursor-delta" style="text-align: right; border-top: none; padding-top: 3.5px;">${strDeltaPos}</td></tr>`;
            
        } else {
            html += `<tbody>`;
            
            if (showTime) {
                html += `<tr><td style="color: #aaa;">Time:</td><td style="text-align: right;">${this.app.formatTime(c1.time)}</td></tr>`;
            }
            
            if (showFreq) {
                html += `<tr><td style="color: #aaa;">Freq:</td><td style="text-align: right;">${this.app.formatFreq(c1.freq)}</td></tr>`;
            }
            
            for (const ch of ['CH1', 'CH2', 'MATH']) {
                if (this.app.getChannelEnabled(ch) && this.cursorChEnabled[ch]) {
                    const chClass = ch === 'CH1' ? 'channel-ch1' : (ch === 'CH2' ? 'channel-ch2' : 'channel-math');
                    const isFftCh = this.app.getChannelFFTEnabled(ch);
                    const xVal = isFftCh ? c1.freq : c1.time;
                    const val = this.app.getChannelValueAtX(ch, xVal);
                    const strVal = val !== null ? this.app.formatVoltage(val, isFftCh) : '--';
                    
                    html += `<tr><td class="${chClass}">${ch}:</td><td style="text-align: right;">${strVal}</td></tr>`;
                }
            }
            
            const activeCh = this.app.activeTab;
            const isFftActive = this.app.getChannelFFTEnabled(activeCh);
            const strPos = this.app.formatVoltage(c1.posValue, isFftActive);
            
            html += `<tr style="border-top: 1px dashed rgba(255,255,255,0.15);"><td style="color: #ffaa00;">POS:</td><td style="text-align: right; color: #ffaa00;">${strPos}</td></tr>`;
        }
        
        html += `</tbody></table>`;
        if (this.cursorTooltip) {
            this.cursorTooltip.innerHTML = html;
            this.cursorTooltip.classList.remove('hide');
            this.cursorTooltip.style.left = '';
            this.cursorTooltip.style.top = '';
        }
    }
}
