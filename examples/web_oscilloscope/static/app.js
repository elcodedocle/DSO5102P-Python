// Hantek Oscilloscope SPA
// Implements CPU-based Min-Max decimation for lag-free rendering of 1M+ samples.
// WebSocket streaming.
// Raw chunk buffering.
// Auto-generated timestamped CSV record filenames.

class OscilloscopeApp {
    constructor() {
        // UI Elements
        this.canvas = document.getElementById('oscilloscope-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.modeSelector = document.getElementById('mode-selector');
        this.localFileInput = document.getElementById('local-file-input');
        this.localFileBtn = document.getElementById('local-file-btn');
        this.selectedFileName = document.getElementById('selected-file-name');
        this.fileSelectGroup = document.getElementById('file-select-group');
        this.recordBtn = document.getElementById('record-btn');
        this.freezeBtn = document.getElementById('freeze-btn');
        this.playBtn = document.getElementById('playback-play-btn');
        this.autocalBtn = document.getElementById('autocal-btn');
        
        // Status fields
        this.statusText = document.getElementById('status-text');
        this.sourceText = document.getElementById('source-text');
        this.capturedCount = document.getElementById('captured-count');
        
        // Horizontal (X) Controls
        this.timebaseVal = document.getElementById('timebase-val');
        this.timeScroll = document.getElementById('time-scroll');
        this.scrollValText = document.getElementById('scroll-val');
        this.timeZoomOut = document.getElementById('time-zoom-out');
        this.timeZoomIn = document.getElementById('time-zoom-in');
        
        // Vertical (Y) Controls
        this.voltbaseVal = document.getElementById('voltbase-val');
        this.voltOffset = document.getElementById('volt-offset');
        this.offsetValText = document.getElementById('offset-val');
        this.voltZoomOut = document.getElementById('volt-zoom-out');
        this.voltZoomIn = document.getElementById('volt-zoom-in');
        
        // Speed Controls
        this.playbackSpeedSlider = document.getElementById('playback-speed');
        this.speedValText = document.getElementById('speed-val');
        this.speedControlGroup = document.getElementById('speed-control-group');
        
        // OSD elements
        this.osdVoltbase = document.getElementById('osd-voltbase');
        this.osdOffset = document.getElementById('osd-offset');
        this.osdTimebase = document.getElementById('osd-timebase');
        this.osdSize = document.getElementById('osd-size');
        
        // State variables
        this.mode = 'playback'; // 'playback' or 'realtime'
        this.isLiveStreaming = false;
        this.websocket = null;
        this.playbackPlaying = false;
        this.playbackFrameId = null;
        this.displayFrozen = false;
        this.playbackSpeed = 1.0;
        this.lastFrameTime = 0;
        
        // Crash-proof recording state (raw chunk strings buffer)
        this.isRecording = false;
        this.recordingChunks = [];
        this.totalRecordingSamples = 0;
        this.selectedRecordingName = '';
        this.saveFileHandle = null;
        
        // Captured waveform arrays (preallocated Float32Arrays are used for high performance)
        this.timeData = new Float32Array(0);
        this.voltageData = new Float32Array(0);
        
        // Captured metadata
        this.timebaseHeader = 2000000000; // in ps
        this.voltbaseHeader = 5000000;    // in uV
        
        // Interactive state (calibration offsets and scales)
        this.currentTimebaseIdx = 18; // Default 2ms
        this.currentVoltbaseIdx = 10;  // Default 5V
        
        this.horizontalPosition = 0; // scroll value between 0.0 and 1.0
        this.verticalOffsetDiv = 0.0; // vertical offset in divisions (-5 to +5)
        
        // 1-2-5 steps tables
        this.VERT_VALS = [
            0.001, 0.002, 0.005, 0.010, 0.020, 0.050, 0.100, 0.200, 0.500,
            1.000, 2.000, 5.000, 10.000
        ];
        this.HORIZ_VALS = [
            2e-9, 5e-9, 10e-9, 20e-9, 50e-9, 100e-9, 200e-9, 500e-9,
            1e-6, 2e-6, 5e-6, 10e-6, 20e-6, 50e-6, 100e-6, 200e-6, 500e-6,
            1e-3, 2e-3, 5e-3, 10e-3, 20e-3, 50e-3, 100e-3, 200e-3, 500e-3,
            1.0, 2.0, 5.0, 10.0, 20.0, 50.0
        ];
        
        this.init();
    }
    
    init() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Wire selectors and button events
        this.modeSelector.addEventListener('change', () => this.onModeChange());
        this.localFileBtn.addEventListener('click', () => this.localFileInput.click());
        this.localFileInput.addEventListener('change', (e) => this.onLocalFileSelected(e));
        this.recordBtn.addEventListener('click', () => this.onRecordBtnPressed());
        this.freezeBtn.addEventListener('click', () => this.toggleFreezeDisplay());
        this.playBtn.addEventListener('click', () => this.togglePlaybackPlay());
        this.autocalBtn.addEventListener('click', () => this.autoCalibrate());
        
        // Horizontal calibration event listeners
        this.timeZoomOut.addEventListener('click', () => this.adjustTimebase(1));
        this.timeZoomIn.addEventListener('click', () => this.adjustTimebase(-1));
        this.timeScroll.addEventListener('input', (e) => this.onTimeScroll(e.target.value));
        
        // Vertical calibration event listeners
        this.voltZoomOut.addEventListener('click', () => this.adjustVoltbase(1));
        this.voltZoomIn.addEventListener('click', () => this.adjustVoltbase(-1));
        this.voltOffset.addEventListener('input', (e) => this.onVoltOffset(e.target.value));
        
        // Speed calibration event listener
        this.playbackSpeedSlider.addEventListener('input', (e) => this.onPlaybackSpeedChange(e.target.value));
        
        // Load default mock sine wave on boot to make it alive
        this.loadDefaultMockWaveform();
        
        // Synchronize mode and UI controls on load
        this.onModeChange();
        
        // Perform initial draw
        this.drawOscilloscope();
    }
    
    resizeCanvas() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.drawOscilloscope();
    }
    
    onModeChange() {
        this.mode = this.modeSelector.value;
        this.stopAllActivities();
        
        if (this.mode === 'realtime') {
            this.fileSelectGroup.classList.add('hide');
            this.speedControlGroup.classList.add('hide');
            this.recordBtn.classList.remove('hide');
            this.freezeBtn.classList.remove('hide');
            this.playBtn.classList.add('hide');
            this.sourceText.textContent = "Live DSO Stream";
            this.timeData = new Float32Array(0);
            this.voltageData = new Float32Array(0);
            this.capturedCount.textContent = "0";
            this.statusText.textContent = "Starting stream...";
            this.statusText.className = "status-wait";
            
            // In realtime mode, start streaming right away
            this.startLiveStreaming();
        } else {
            this.fileSelectGroup.classList.remove('hide');
            this.speedControlGroup.classList.remove('hide');
            this.recordBtn.classList.add('hide');
            this.freezeBtn.classList.add('hide');
            this.playBtn.classList.remove('hide');
            this.loadDefaultMockWaveform();
        }
        this.drawOscilloscope();
    }
    
    stopAllActivities() {
        // Stop playback
        this.playbackPlaying = false;
        if (this.playbackFrameId) {
            cancelAnimationFrame(this.playbackFrameId);
            this.playbackFrameId = null;
        }
        this.playBtn.textContent = "Play";
        this.playBtn.className = "btn btn-green";
        
        // Stop live streaming
        if (this.isLiveStreaming) {
            this.stopLiveStreaming();
        }
        
        // Stop recording
        if (this.isRecording) {
            this.isRecording = false;
            this.recordingChunks = [];
            this.totalRecordingSamples = 0;
            this.saveFileHandle = null;
            this.recordBtn.textContent = "Start Recording";
            this.recordBtn.className = "btn btn-green";
        }
        
        // Reset freeze
        this.displayFrozen = false;
        this.freezeBtn.textContent = "Freeze Display";
        this.freezeBtn.className = "btn btn-blue";
    }
    
    onLocalFileSelected(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        this.selectedFileName.textContent = file.name;
        this.sourceText.textContent = file.name;
        this.statusText.textContent = "Loading file locally...";
        this.statusText.className = "status-wait";
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target.result;
            this.parseCSV(text);
            this.statusText.textContent = "File Loaded Locally";
            this.statusText.className = "status-ok";
            this.autoCalibrate();
        };
        reader.onerror = () => {
            this.statusText.textContent = "Read Error";
            this.statusText.className = "status-error";
        };
        reader.readAsText(file);
    }
    
    loadDefaultMockWaveform() {
        this.selectedFileName.textContent = "Default wave";
        this.sourceText.textContent = "Demo Sine Wave";
        
        const size = 4000;
        const tb_ps = 2000000000; // 2ms
        const vb_uV = 5000000;    // 5V
        
        const timebase_s = tb_ps * 1e-12;
        const dt = timebase_s / 80;
        
        let t_accum = 0.0;
        let mock_lines = [
            `#timebase=${tb_ps}(ps)`,
            `,#voltbase=${vb_uV}(uV)`,
            `#size=${size}`
        ];
        
        for (let i = 0; i < size; i++) {
            t_accum += dt;
            const v = 10.0 * Math.sin(2 * Math.PI * 100 * t_accum);
            mock_lines.push(`${t_accum.toExponential(5)},${(v * 1000).toFixed(3)}`);
        }
        
        this.parseCSV(mock_lines.join('\n'));
    }
    
    parseCSV(csvText) {
        if (!csvText) return;
        const lines = csvText.split('\n');
        
        let timebaseHeaderVal = 2000000000;
        let voltbaseHeaderVal = 5000000;
        let dataStartIndex = 0;
        
        // 1. Parse Headers
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#')) {
                const tbMatch = line.match(/timebase=(-?\d+)/);
                const vbMatch = line.match(/voltbase=(\d+)/);
                
                if (tbMatch) {
                    let tb_raw = parseInt(tbMatch[1]);
                    if (tb_raw < 0) tb_raw += 4294967296;
                    timebaseHeaderVal = tb_raw;
                }
                if (vbMatch) voltbaseHeaderVal = parseInt(vbMatch[1]);
                
                dataStartIndex = i + 1;
            } else if (line.includes(',')) {
                dataStartIndex = i;
                break;
            }
        }
        
        this.timebaseHeader = timebaseHeaderVal;
        this.voltbaseHeader = voltbaseHeaderVal;
        
        // Map header value to closest index
        const tbSeconds = timebaseHeaderVal * 1e-12;
        this.currentTimebaseIdx = this.findClosestIndex(tbSeconds, this.HORIZ_VALS);
        
        const vbVolts = voltbaseHeaderVal * 1e-6;
        this.currentVoltbaseIdx = this.findClosestIndex(vbVolts, this.VERT_VALS);
        
        // 2. Parse Rows
        const rows = [];
        for (let i = dataStartIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const parts = line.split(',');
            if (parts.length === 2) {
                const t = parseFloat(parts[0]);
                const v = parseFloat(parts[1]) / 1000.0; // convert mV to V
                if (!isNaN(t) && !isNaN(v)) {
                    rows.push(t, v);
                }
            }
        }
        
        const totalPoints = rows.length / 2;
        this.timeData = new Float32Array(totalPoints);
        this.voltageData = new Float32Array(totalPoints);
        
        for (let i = 0; i < totalPoints; i++) {
            this.timeData[i] = rows[i * 2];
            this.voltageData[i] = rows[i * 2 + 1];
        }
        
        this.capturedCount.textContent = totalPoints.toLocaleString();
        this.updateSlidersAndReadouts();
        this.drawOscilloscope();
    }
    
    findClosestIndex(val, array) {
        let minDiff = Infinity;
        let bestIdx = 0;
        for (let i = 0; i < array.length; i++) {
            const diff = Math.abs(val - array[i]);
            if (diff < minDiff) {
                minDiff = diff;
                bestIdx = i;
            }
        }
        return bestIdx;
    }
    
    async startLiveStreaming() {
        this.statusText.textContent = "Connecting stream...";
        this.statusText.className = "status-wait";
        
        try {
            const res = await fetch('/api/live/start', { method: 'POST' });
            const config = await res.json();
            
            this.timeData = new Float32Array(0);
            this.voltageData = new Float32Array(0);
            
            // Connect WebSockets
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${wsProtocol}//${window.location.host}/ws/live`;
            this.websocket = new WebSocket(wsUrl);
            
            this.websocket.onopen = () => {
                this.isLiveStreaming = true;
                this.statusText.textContent = "Streaming Live";
                this.statusText.className = "status-ok";
            };
            
            this.websocket.onmessage = (event) => {
                const csvChunk = event.data;
                if (csvChunk) {
                    this.appendLiveCSV(csvChunk);
                }
            };
            
            this.websocket.onclose = () => {
                if (this.isLiveStreaming) {
                    this.stopLiveStreaming();
                }
            };
            
            this.websocket.onerror = (e) => {
                console.error("WebSocket error:", e);
            };
            
        } catch (e) {
            console.error("Live start failed:", e);
            this.statusText.textContent = "DSO Conn Error";
            this.statusText.className = "status-error";
        }
    }
    
    async stopLiveStreaming() {
        this.isLiveStreaming = false;
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
        await fetch('/api/live/stop', { method: 'POST' });
        this.statusText.textContent = "Live Stopped";
        this.statusText.className = "status-wait";
    }
    
    onRecordBtnPressed() {
        if (this.isRecording) {
            // Stop Recording
            this.isRecording = false;
            this.statusText.textContent = "Saving recording...";
            this.statusText.className = "status-wait";
            
            // Construct the final CSV with Hantek Acquisition compatible headers
            const header = `#timebase=${this.timebaseHeader}(ps)\n,#voltbase=${this.voltbaseHeader}(uV)\n#size=${this.totalRecordingSamples}\n`;
            
            // Combine header with string chunks
            const finalBlob = new Blob([header, ...this.recordingChunks], { type: 'text/csv' });
            
            if (this.saveFileHandle) {
                // Async Chrome direct-write path
                (async () => {
                    try {
                        const writable = await this.saveFileHandle.createWritable();
                        await writable.write(finalBlob);
                        await writable.close();
                        this.statusText.textContent = "Recording Saved Successfully!";
                        this.statusText.className = "status-ok";
                    } catch (writeErr) {
                        console.error("Direct write failed, falling back to Blob download:", writeErr);
                        this.triggerBlobDownload(finalBlob, this.selectedRecordingName);
                    }
                })();
            } else {
                // Synchronous Firefox-friendly download path
                this.triggerBlobDownload(finalBlob, this.selectedRecordingName);
            }
            
            this.saveFileHandle = null;
            this.recordingChunks = [];
            this.totalRecordingSamples = 0;
            this.recordBtn.textContent = "Start Recording";
            this.recordBtn.className = "btn btn-green";
        } else {
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
            const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
            this.selectedRecordingName = `Hantek_${dateStr}_${timeStr}.csv`;
            
            this.recordingChunks = [];
            this.totalRecordingSamples = 0;
            
            if (window.showSaveFilePicker) {
                // File picker API support (Chrome, Edge, Opera, Chromium based)
                (async () => {
                    try {
                        const options = {
                            suggestedName: this.selectedRecordingName,
                            types: [{
                                description: 'CSV Files',
                                accept: {
                                    'text/csv': ['.csv'],
                                }
                            }],
                        };
                        this.saveFileHandle = await window.showSaveFilePicker(options);
                        this.isRecording = true;
                        
                        this.recordBtn.textContent = "Stop Recording";
                        this.recordBtn.className = "btn btn-red";
                        this.statusText.textContent = "Recording to local file...";
                        this.statusText.className = "status-wait";
                    } catch (err) {
                        console.log("File picker cancelled or failed.", err);
                        this.saveFileHandle = null;
                        this.isRecording = false;
                    }
                })();
            } else {
                // No file picker API support (Firefox, Safari)
                this.saveFileHandle = null;
                this.isRecording = true;
                
                this.recordBtn.textContent = "Stop Recording";
                this.recordBtn.className = "btn btn-red";
                this.statusText.textContent = `Recording to '${this.selectedRecordingName}'...`;
                this.statusText.className = "status-wait";
            }
        }
    }
    
    triggerBlobDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.getElementById("download-link");
        link.href = url;
        link.download = filename;
        link.click();
        
        // Revoke the object URL after a small delay to prevent memory leaks
        setTimeout(() => URL.revokeObjectURL(url), 100);
        
        this.statusText.textContent = "Recording Downloaded!";
        this.statusText.className = "status-ok";
    }
    
    appendLiveCSV(csvChunk) {
        // 1. If recording, append the raw chunk with headers stripped in microseconds (no parsing)
        if (this.isRecording) {
            const strippedChunk = csvChunk.replace(/^\s*#.*$/gm, '').trim();
            if (strippedChunk) {
                this.recordingChunks.push(strippedChunk + '\n');
                // Count samples by counting the number of newline characters
                const chunkSamplesCount = (strippedChunk.match(/\n/g) || []).length + 1;
                this.totalRecordingSamples += chunkSamplesCount;
            }
        }
        
        // 2. Parse chunk with 5x subsampling for the display buffer (reduces CPU parsing time by 80%)
        const lines = csvChunk.split('\n');
        const appendRows = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            if (line.startsWith('#')) {
                // Parse headers to keep our current state/metadata updated
                const tbMatch = line.match(/timebase=(-?\d+)/);
                const vbMatch = line.match(/voltbase=(\d+)/);
                
                if (tbMatch) {
                    let tb_raw = parseInt(tbMatch[1]);
                    if (tb_raw < 0) tb_raw += 4294967296;
                    this.timebaseHeader = tb_raw;
                    this.currentTimebaseIdx = this.findClosestIndex(tb_raw * 1e-12, this.HORIZ_VALS);
                }
                if (vbMatch) {
                    this.voltbaseHeader = parseInt(vbMatch[1]);
                    this.currentVoltbaseIdx = this.findClosestIndex(parseInt(vbMatch[1]) * 1e-6, this.VERT_VALS);
                }
                continue;
            }
            
            // Subsample for display buffer (only parse 1 out of every 5 samples)
            if (i % 5 !== 0) continue;
            
            const parts = line.split(',');
            if (parts.length === 2) {
                const t = parseFloat(parts[0]);
                const v = parseFloat(parts[1]) / 1000.0; // convert mV to V
                if (!isNaN(t) && !isNaN(v)) {
                    appendRows.push(t, v);
                }
            }
        }
        
        const newPoints = appendRows.length / 2;
        if (newPoints === 0) return;
        
        const currentSize = this.timeData.length;
        const MAX_SAMPLES = 50000; // Lightweight limit for fluid display rendering
        let combinedTime, combinedVoltage;
        
        if (currentSize + newPoints > MAX_SAMPLES) {
            const keepSize = MAX_SAMPLES - newPoints;
            combinedTime = new Float32Array(MAX_SAMPLES);
            combinedVoltage = new Float32Array(MAX_SAMPLES);
            
            combinedTime.set(this.timeData.subarray(currentSize - keepSize), 0);
            combinedVoltage.set(this.voltageData.subarray(currentSize - keepSize), 0);
            
            for (let i = 0; i < newPoints; i++) {
                combinedTime[keepSize + i] = appendRows[i * 2];
                combinedVoltage[keepSize + i] = appendRows[i * 2 + 1];
            }
        } else {
            combinedTime = new Float32Array(currentSize + newPoints);
            combinedVoltage = new Float32Array(currentSize + newPoints);
            
            combinedTime.set(this.timeData, 0);
            combinedVoltage.set(this.voltageData, 0);
            
            for (let i = 0; i < newPoints; i++) {
                combinedTime[currentSize + i] = appendRows[i * 2];
                combinedVoltage[currentSize + i] = appendRows[i * 2 + 1];
            }
        }
        
        this.timeData = combinedTime;
        this.voltageData = combinedVoltage;
        this.capturedCount.textContent = (this.totalRecordingSamples > 0 ? this.totalRecordingSamples : this.timeData.length).toLocaleString();
        
        // Skip redraws entirely if display is frozen (saves massive CPU resources!)
        if (this.displayFrozen) return;
        
        if (currentSize === 0) {
            this.autoCalibrate();
        } else {
            this.updateSlidersAndReadouts();
            this.drawOscilloscope();
        }
    }
    
    toggleFreezeDisplay() {
        this.displayFrozen = !this.displayFrozen;
        if (this.displayFrozen) {
            this.freezeBtn.textContent = "Unfreeze Display";
            this.freezeBtn.className = "btn btn-red";
            this.statusText.textContent = "Display Frozen (Streaming/Recording active)";
            this.statusText.className = "status-wait";
        } else {
            this.freezeBtn.textContent = "Freeze Display";
            this.freezeBtn.className = "btn btn-blue";
            this.statusText.textContent = "Streaming Live";
            this.statusText.className = "status-ok";
            // Immediately redraw current buffer upon unfreezing
            this.updateSlidersAndReadouts();
            this.drawOscilloscope();
        }
    }
    
    togglePlaybackPlay() {
        if (this.playbackPlaying) {
            this.playbackPlaying = false;
            this.playBtn.textContent = "Play";
            this.playBtn.className = "btn btn-green";
            this.statusText.textContent = "Playback Paused";
        } else {
            if (this.timeData.length === 0) return;
            this.playbackPlaying = true;
            this.playBtn.textContent = "Pause";
            this.playBtn.className = "btn btn-red";
            this.statusText.textContent = "Playing...";
            this.lastFrameTime = performance.now(); // Initialize timer for 1x sync
            this.playbackLoop();
        }
    }
    
    onPlaybackSpeedChange(value) {
        const sliderVal = parseInt(value);
        this.playbackSpeed = Math.pow(10, -4 + sliderVal / 10.0);
        this.speedValText.textContent = `${this.playbackSpeed.toFixed(this.playbackSpeed < 0.01 ? 3 : (this.playbackSpeed < 0.1 ? 2 : this.playbackSpeed < 1 ? 1 : 0))}x`;
    }
    
    playbackLoop() {
        if (!this.playbackPlaying) return;
        
        const now = performance.now();
        const dtRealSec = (now - this.lastFrameTime) / 1000.0;
        this.lastFrameTime = now;
        
        const timebase = this.HORIZ_VALS[this.currentTimebaseIdx];
        const screenDuration = timebase * 12; // 12 divisions on screen
        
        const startT = this.timeData[0];
        const endT = this.timeData[this.timeData.length - 1];
        const totalDuration = endT - startT;
        
        const scrollableRange = totalDuration - screenDuration;
        
        if (scrollableRange > 0) {
            const shiftSec = dtRealSec * this.playbackSpeed;
            this.horizontalPosition += shiftSec / scrollableRange;
            if (this.horizontalPosition > 1.0) {
                this.horizontalPosition = 0.0; // Loop back to start
            }
        } else {
            this.horizontalPosition = 0.0;
        }
        
        this.timeScroll.value = Math.round(this.horizontalPosition * 100);
        this.updateSlidersAndReadouts();
        this.drawOscilloscope();
        
        this.playbackFrameId = requestAnimationFrame(() => this.playbackLoop());
    }
    
    adjustTimebase(direction) {
        const nextIdx = this.currentTimebaseIdx + direction;
        if (nextIdx >= 0 && nextIdx < this.HORIZ_VALS.length) {
            this.currentTimebaseIdx = nextIdx;
            this.updateSlidersAndReadouts();
            this.drawOscilloscope();
        }
    }
    
    adjustVoltbase(direction) {
        const nextIdx = this.currentVoltbaseIdx + direction;
        if (nextIdx >= 0 && nextIdx < this.VERT_VALS.length) {
            this.currentVoltbaseIdx = nextIdx;
            this.updateSlidersAndReadouts();
            this.drawOscilloscope();
        }
    }
    
    onTimeScroll(value) {
        this.horizontalPosition = parseFloat(value) / 100;
        this.updateSlidersAndReadouts();
        this.drawOscilloscope();
    }
    
    onVoltOffset(value) {
        this.verticalOffsetDiv = parseFloat(value) / 25;
        this.updateSlidersAndReadouts();
        this.drawOscilloscope();
    }
    
    autoCalibrate() {
        if (this.voltageData.length === 0) return;
        
        let minV = Infinity;
        let maxV = -Infinity;
        let sumV = 0.0;
        
        for (let i = 0; i < this.voltageData.length; i++) {
            const v = this.voltageData[i];
            if (v < minV) minV = v;
            if (v > maxV) maxV = v;
            sumV += v;
        }
        
        const avgV = sumV / this.voltageData.length;
        const peakToPeak = maxV - minV;
        
        const desiredVoltbase = (peakToPeak === 0 ? 1.0 : peakToPeak) / 6.0;
        this.currentVoltbaseIdx = this.findClosestIndex(desiredVoltbase, this.VERT_VALS);
        
        this.verticalOffsetDiv = -avgV / this.VERT_VALS[this.currentVoltbaseIdx];
        this.verticalOffsetDiv = Math.max(-5, Math.min(5, this.verticalOffsetDiv));
        
        if (this.timeData.length > 1) {
            const totalDuration = this.timeData[this.timeData.length - 1] - this.timeData[0];
            const desiredTimebase = totalDuration / 12.0;
            this.currentTimebaseIdx = this.findClosestIndex(desiredTimebase, this.HORIZ_VALS);
        }
        
        this.horizontalPosition = 0;
        this.updateSlidersAndReadouts();
        this.drawOscilloscope();
    }
    
    updateSlidersAndReadouts() {
        const timebase = this.HORIZ_VALS[this.currentTimebaseIdx];
        const voltbase = this.VERT_VALS[this.currentVoltbaseIdx];
        
        this.timebaseVal.textContent = this.formatTime(timebase);
        this.osdTimebase.textContent = this.formatTime(timebase);
        
        this.voltbaseVal.textContent = this.formatVolt(voltbase);
        this.osdVoltbase.textContent = this.formatVolt(voltbase);
        
        const offsetVolts = -this.verticalOffsetDiv * voltbase;
        this.offsetValText.textContent = `${offsetVolts.toFixed(3)} V`;
        this.osdOffset.textContent = offsetVolts.toFixed(3);
        this.voltOffset.value = Math.round(this.verticalOffsetDiv * 25);
        
        this.timeScroll.value = Math.round(this.horizontalPosition * 100);
        if (this.timeData.length > 0) {
            const startT = this.timeData[0];
            const endT = this.timeData[this.timeData.length - 1];
            const totalT = endT - startT;
            const scrollTime = startT + (this.horizontalPosition * Math.max(0, totalT - (timebase * 12)));
            this.scrollValText.textContent = `${scrollTime.toExponential(2)} s`;
        } else {
            this.scrollValText.textContent = `0.00E00 s`;
        }
        
        this.osdSize.textContent = this.timeData.length.toLocaleString();
    }
    
    formatTime(t) {
        if (t < 1e-6) return `${(t * 1e9).toFixed(0)} ns`;
        if (t < 1e-3) return `${(t * 1e6).toFixed(0)} us`;
        if (t < 1.0) return `${(t * 1e3).toFixed(0)} ms`;
        return `${t.toFixed(0)} s`;
    }
    
    formatVolt(v) {
        if (v < 1.0) return `${(v * 1000).toFixed(0)} mV`;
        return `${v.toFixed(1)} V`;
    }
    
    drawOscilloscope() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        this.ctx.fillStyle = '#020502';
        this.ctx.fillRect(0, 0, width, height);
        
        // 1. Grid
        this.ctx.strokeStyle = 'rgba(0, 255, 102, 0.08)';
        this.ctx.lineWidth = 1;
        
        const horizDivs = 12;
        const vertDivs = 10;
        
        const dx = width / horizDivs;
        const dy = height / vertDivs;
        
        for (let i = 1; i < horizDivs; i++) {
            this.ctx.beginPath();
            if (i === horizDivs / 2) {
                this.ctx.strokeStyle = 'rgba(0, 255, 102, 0.25)';
                this.ctx.setLineDash([2, 2]);
            } else {
                this.ctx.strokeStyle = 'rgba(0, 255, 102, 0.08)';
                this.ctx.setLineDash([]);
            }
            this.ctx.moveTo(i * dx, 0);
            this.ctx.lineTo(i * dx, height);
            this.ctx.stroke();
        }
        
        for (let i = 1; i < vertDivs; i++) {
            this.ctx.beginPath();
            if (i === vertDivs / 2) {
                this.ctx.strokeStyle = 'rgba(0, 255, 102, 0.25)';
                this.ctx.setLineDash([2, 2]);
            } else {
                this.ctx.strokeStyle = 'rgba(0, 255, 102, 0.08)';
                this.ctx.setLineDash([]);
            }
            this.ctx.moveTo(0, i * dy);
            this.ctx.lineTo(width, i * dy);
            this.ctx.stroke();
        }
        
        this.ctx.setLineDash([]);
        
        if (this.timeData.length === 0) {
            this.ctx.strokeStyle = '#00ff66';
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.moveTo(0, height / 2);
            this.ctx.lineTo(width, height / 2);
            this.ctx.stroke();
            return;
        }
        
        // 2. Viewport X
        const timebase = this.HORIZ_VALS[this.currentTimebaseIdx];
        const screenDuration = timebase * horizDivs;
        
        const startT = this.timeData[0];
        const endT = this.timeData[this.timeData.length - 1];
        const totalDuration = endT - startT;
        
        let viewportStartT, viewportEndT;
        if (this.mode === 'realtime') {
            viewportEndT = endT;
            viewportStartT = Math.max(startT, endT - screenDuration);
            // Sync horizontalPosition slider
            if (totalDuration > screenDuration) {
                this.horizontalPosition = (viewportStartT - startT) / (totalDuration - screenDuration);
            } else {
                this.horizontalPosition = 1.0;
            }
        } else {
            viewportStartT = startT + (this.horizontalPosition * Math.max(0, totalDuration - screenDuration));
            viewportEndT = viewportStartT + screenDuration;
        }
        
        // 3. Range search
        let startIndex = 0;
        let endIndex = this.timeData.length - 1;
        
        let low = 0, high = this.timeData.length - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (this.timeData[mid] < viewportStartT) {
                startIndex = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        
        low = 0; high = this.timeData.length - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (this.timeData[mid] <= viewportEndT) {
                endIndex = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        
        const visibleCount = endIndex - startIndex + 1;
        if (visibleCount <= 0) return;
        
        // 4. Transforms
        const getCanvasX = (t) => {
            return ((t - viewportStartT) / screenDuration) * width;
        };
        
        const voltbase = this.VERT_VALS[this.currentVoltbaseIdx];
        const getCanvasY = (v) => {
            const divFromCenter = (v / voltbase) + this.verticalOffsetDiv;
            return (height / 2) - (divFromCenter * dy);
        };
        
        // 5. Drawing (glow trace, optimized)
        this.ctx.strokeStyle = '#00ff66';
        this.ctx.lineWidth = 1.8;
        this.ctx.beginPath();
        
        const MAX_DRAW_LINES = 1500;
        
        if (visibleCount <= MAX_DRAW_LINES) {
            // Direct Draw
            let first = true;
            for (let i = startIndex; i <= endIndex; i++) {
                const cx = getCanvasX(this.timeData[i]);
                const cy = getCanvasY(this.voltageData[i]);
                
                if (first) {
                    this.ctx.moveTo(cx, cy);
                    first = false;
                } else {
                    this.ctx.lineTo(cx, cy);
                }
            }
        } else {
            // Min-Max Decimation (pixel-binning)
            const numBins = Math.round(width);
            const samplesPerBin = visibleCount / numBins;
            
            let first = true;
            for (let bin = 0; bin < numBins; bin++) {
                const binStartIdx = Math.round(startIndex + (bin * samplesPerBin));
                const binEndIdx = Math.round(startIndex + ((bin + 1) * samplesPerBin));
                
                if (binStartIdx >= this.timeData.length) break;
                
                let minVal = Infinity;
                let maxVal = -Infinity;
                let t_sum = 0.0;
                let validSamples = 0;
                
                for (let i = binStartIdx; i < Math.min(binEndIdx, this.timeData.length); i++) {
                    const v = this.voltageData[i];
                    if (v < minVal) minVal = v;
                    if (v > maxVal) maxVal = v;
                    t_sum += this.timeData[i];
                    validSamples++;
                }
                
                if (validSamples === 0) continue;
                
                const avg_t = t_sum / validSamples;
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
        this.ctx.shadowBlur = 0;
    }
}

// Instantiate App
document.addEventListener('DOMContentLoaded', () => {
    window.app = new OscilloscopeApp();
});
