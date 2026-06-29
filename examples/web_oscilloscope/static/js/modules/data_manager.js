// Data Manager Module for Hantek Oscilloscope SPA
// Manages waveforms, CSV parsing, file uploads, real-time WebSocket streams, dual-channel recording, and playback loop

export class DataManager {
    constructor(app) {
        this.app = app;
        
        // Waveform data storage (independent arrays per channel)
        this.timeData1 = new Float64Array(0);
        this.voltageData1 = new Float32Array(0);
        this.timeData2 = new Float64Array(0);
        this.voltageData2 = new Float32Array(0);
        this.timeDataMath = new Float64Array(0);
        this.voltageDataMath = new Float32Array(0);
        
        // File loaded markers
        this.fileLoadedCh1 = false;
        this.fileLoadedCh2 = false;
        
        // Header configurations from files
        this.timebaseHeaderCh1 = 2000000000; // in ps
        this.voltbaseHeaderCh1 = 5000000;    // in uV
        this.timebaseHeaderCh2 = 2000000000;
        this.voltbaseHeaderCh2 = 5000000;
        
        // Playback state variables
        this.playbackPlaying = false;
        this.playbackFileHasGaps = false;
        this.playbackFileDtAvg = 1e-5;
        this.playbackFrameId = null;
        this.playbackSpeed = 1.0;
        this.lastFrameTime = 0;
        
        // WebSocket live streaming state
        this.isLiveStreaming = false;
        this.websocketCh1 = null;
        this.websocketCh2 = null;
        this.streamSessionId = null;
        
        // Dual Channel CSV Recording State
        this.isRecording = false;
        this.recordingChunksCh1 = [];
        this.recordingChunksCh2 = [];
        this.totalRecordingSamplesCh1 = 0;
        this.totalRecordingSamplesCh2 = 0;
        this.selectedRecordingNameBase = '';
    }

    onLocalFileSelected(e, channel) {
        const file = e.target.files[0];
        if (!file) return;
        
        const label = channel === 1 ? this.app.selectedFileNameCh1 : this.app.selectedFileNameCh2;
        label.textContent = file.name;
        
        this.app.statusText.textContent = `Loading CH${channel} file...`;
        this.app.statusText.className = "status-wait";
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target.result;
            this.parseCSV(text, channel);
            this.app.statusText.textContent = `CH${channel} Loaded`;
            this.app.statusText.className = "status-ok";
            if (channel === 1) this.fileLoadedCh1 = true;
            if (channel === 2) this.fileLoadedCh2 = true;
            
            this.recalculateMath();
            this.app.autoCalibrate();
        };
        reader.onerror = () => {
            this.app.statusText.textContent = "Read Error";
            this.app.statusText.className = "status-error";
        };
        reader.readAsText(file);
    }
    
    loadDefaultMockWaveforms() {
        this.app.selectedFileNameCh1.textContent = "Mock CH1 Sine";
        this.app.selectedFileNameCh2.textContent = "Mock CH2 Cos";
        this.app.sourceText.textContent = "Demo Waveforms";
        
        const size = 4000;
        const tb_ps = 2000000000; // 2ms
        const vb_uV = 5000000;    // 5V
        
        const timebase_s = tb_ps * 1e-12;
        const dt = timebase_s / 200;
        
        let t_accum = 0.0;
        let mock1_lines = [`#timebase=${tb_ps}(ps)`, `,#voltbase=${vb_uV}(uV)`, `#size=${size}`];
        let mock2_lines = [`#timebase=${tb_ps}(ps)`, `,#voltbase=${vb_uV}(uV)`, `#size=${size}`];
        
        for (let i = 0; i < size; i++) {
            t_accum += dt;
            const v1 = 12.0 * Math.sin(2 * Math.PI * 100 * t_accum);
            const v2 = 8.0 * Math.cos(2 * Math.PI * 150 * t_accum);
            mock1_lines.push(`${t_accum.toExponential(5)},${(v1 * 1000).toFixed(3)}`);
            mock2_lines.push(`${t_accum.toExponential(5)},${(v2 * 1000).toFixed(3)}`);
        }
        
        this.parseCSV(mock1_lines.join('\n'), 1);
        this.parseCSV(mock2_lines.join('\n'), 2);
        this.fileLoadedCh1 = true;
        this.fileLoadedCh2 = true;
        this.recalculateMath();
        this.app.autoCalibrate();
    }
    
    parseCSV(csvText, channel) {
        if (!csvText) return;
        const lines = csvText.split('\n');
        
        let timebaseHeaderVal = 2000000000;
        let voltbaseHeaderVal = 5000000;
        let dataStartIndex = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#') || line.startsWith(',#')) {
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
        
        const tbSeconds = timebaseHeaderVal * 1e-12;
        const vbVolts = voltbaseHeaderVal * 1e-6;
        
        if (channel === 1) {
            this.timebaseHeaderCh1 = timebaseHeaderVal;
            this.voltbaseHeaderCh1 = voltbaseHeaderVal;
            this.syncTimebase(tbSeconds);
            this.syncVoltbase('CH1', vbVolts);
        } else {
            this.timebaseHeaderCh2 = timebaseHeaderVal;
            this.voltbaseHeaderCh2 = voltbaseHeaderVal;
            this.syncTimebase(tbSeconds);
            this.syncVoltbase('CH2', vbVolts);
        }
        
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
        const timeData = new Float64Array(totalPoints);
        const voltageData = new Float32Array(totalPoints);
        
        for (let i = 0; i < totalPoints; i++) {
            timeData[i] = rows[i * 2];
            voltageData[i] = rows[i * 2 + 1];
        }
        
        if (channel === 1) {
            this.timeData1 = timeData;
            this.voltageData1 = voltageData;
        } else {
            this.timeData2 = timeData;
            this.voltageData2 = voltageData;
        }
        
        let hasGaps = false;
        if (timeData.length > 10) {
            // Calculate internal dt_avg of first 10 contiguous samples
            let dt_sum = 0;
            for (let i = 1; i <= 10; i++) {
                dt_sum += (timeData[i] - timeData[i - 1]);
            }
            const dt_avg = dt_sum / 10;
            this.playbackFileDtAvg = dt_avg;
            
            // Check for any gap that is significantly larger than dt_avg (e.g., > 50 * dt_avg or > 50ms)
            const gap_thresh = Math.max(0.05, 50 * dt_avg); 
            for (let i = 1; i < timeData.length; i++) {
                if (timeData[i] - timeData[i - 1] > gap_thresh) {
                    hasGaps = true;
                    break;
                }
            }
        }
        this.playbackFileHasGaps = hasGaps;
        
        this.app.capturedCount.textContent = Math.max(this.timeData1.length, this.timeData2.length).toLocaleString();
        this.app.updateSlidersAndReadouts();
        this.app.drawOscilloscope();
    }

    syncTimebase(tbSeconds) {
        if (!tbSeconds || tbSeconds <= 0) return;
        const epsilon = 1e-11;
        let foundIdx = -1;
        for (let i = 0; i < this.app.HORIZ_VALS.length; i++) {
            if (Math.abs(this.app.HORIZ_VALS[i] - tbSeconds) < epsilon) {
                foundIdx = i;
                break;
            }
        }
        if (foundIdx !== -1) {
            this.app.currentTimebaseIdx = foundIdx;
        } else {
            this.app.HORIZ_VALS.push(tbSeconds);
            this.app.HORIZ_VALS.sort((a, b) => a - b);
            for (let i = 0; i < this.app.HORIZ_VALS.length; i++) {
                if (Math.abs(this.app.HORIZ_VALS[i] - tbSeconds) < epsilon) {
                    this.app.currentTimebaseIdx = i;
                    break;
                }
            }
        }
    }
    
    syncVoltbase(channel, vbVolts) {
        if (!vbVolts || vbVolts <= 0) return;
        const epsilon = 1e-11;
        let foundIdx = -1;
        for (let i = 0; i < this.app.VERT_VALS.length; i++) {
            if (Math.abs(this.app.VERT_VALS[i] - vbVolts) < epsilon) {
                foundIdx = i;
                break;
            }
        }
        if (foundIdx === -1) {
            const ch1Val = this.app.VERT_VALS[this.app.currentVoltbaseIdxCh1];
            const ch2Val = this.app.VERT_VALS[this.app.currentVoltbaseIdxCh2];
            const mathVal = this.app.VERT_VALS[this.app.currentVoltbaseIdxMath];
            
            this.app.VERT_VALS.push(vbVolts);
            this.app.VERT_VALS.sort((a, b) => a - b);
            
            const remapIndex = (originalVal) => {
                for (let i = 0; i < this.app.VERT_VALS.length; i++) {
                    if (Math.abs(this.app.VERT_VALS[i] - originalVal) < epsilon) {
                        return i;
                    }
                }
                return 0;
            };
            
            this.app.currentVoltbaseIdxCh1 = remapIndex(ch1Val);
            this.app.currentVoltbaseIdxCh2 = remapIndex(ch2Val);
            this.app.currentVoltbaseIdxMath = remapIndex(mathVal);
            
            for (let i = 0; i < this.app.VERT_VALS.length; i++) {
                if (Math.abs(this.app.VERT_VALS[i] - vbVolts) < epsilon) {
                    foundIdx = i;
                    break;
                }
            }
        }
        
        if (channel === 1 || channel === 'CH1') {
            this.app.currentVoltbaseIdxCh1 = foundIdx;
        } else if (channel === 2 || channel === 'CH2') {
            this.app.currentVoltbaseIdxCh2 = foundIdx;
        } else if (channel === 'MATH') {
            this.app.currentVoltbaseIdxMath = foundIdx;
        }
    }

    interpolateCH2(t) {
        const N = this.timeData2.length;
        if (N === 0) return 0.0;
        if (t <= this.timeData2[0]) return this.voltageData2[0];
        if (t >= this.timeData2[N - 1]) return this.voltageData2[N - 1];
        
        let low = 0, high = N - 1;
        let idx = 0;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (this.timeData2[mid] <= t) {
                idx = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        
        const t0 = this.timeData2[idx];
        const t1 = this.timeData2[idx + 1];
        const v0 = this.voltageData2[idx];
        const v1 = this.voltageData2[idx + 1];
        
        if (t1 === t0) return v0;
        const factor = (t - t0) / (t1 - t0);
        return v0 + factor * (v1 - v0);
    }
    
    recalculateMath() {
        if (!this.app.mathEnable.checked || this.timeData1.length === 0) {
            this.timeDataMath = new Float64Array(0);
            this.voltageDataMath = new Float32Array(0);
            return;
        }
        
        const size = this.timeData1.length;
        this.timeDataMath = new Float64Array(size);
        this.voltageDataMath = new Float32Array(size);
        
        for (let i = 0; i < size; i++) {
            const t = this.timeData1[i];
            const v1 = this.voltageData1[i];
            const v2 = this.interpolateCH2(t);
            
            let mathVal = 0.0;
            switch(this.app.mathOperation) {
                case 'CH1+CH2':
                    mathVal = v1 + v2;
                    break;
                case 'CH1-CH2':
                    mathVal = v1 - v2;
                    break;
                case 'CH2-CH1':
                    mathVal = v2 - v1;
                    break;
                case 'CH1*CH2':
                    mathVal = v1 * v2;
                    break;
                case 'CH1/CH2':
                    mathVal = v2 !== 0.0 ? v1 / v2 : 0.0;
                    break;
                case 'CH2/CH1':
                    mathVal = v1 !== 0.0 ? v2 / v1 : 0.0;
                    break;
            }
            this.timeDataMath[i] = t;
            this.voltageDataMath[i] = mathVal;
        }
    }

    async startLiveStreaming() {
        this.app.statusText.textContent = "Starting captures...";
        this.app.statusText.className = "status-wait";
        
        try {
            const res = await fetch('/api/live/start', { method: 'POST' });
            const data = await res.json();
            this.streamSessionId = data.session_id;
            
            // Pre-fetch active settings to synchronize the UI timebase and voltbase immediately
            try {
                const s1Res = await fetch('/api/settings?channel=0');
                const s1 = await s1Res.json();
                if (s1 && !s1.error && s1.timebase) {
                    this.timebaseHeaderCh1 = s1.timebase;
                    this.voltbaseHeaderCh1 = s1.voltbase;
                    this.syncTimebase(s1.timebase * 1e-12);
                    this.syncVoltbase('CH1', s1.voltbase * 1e-6);
                }
                
                const s2Res = await fetch('/api/settings?channel=1');
                const s2 = await s2Res.json();
                if (s2 && !s2.error && s2.timebase) {
                    this.timebaseHeaderCh2 = s2.timebase;
                    this.voltbaseHeaderCh2 = s2.voltbase;
                    this.syncTimebase(s2.timebase * 1e-12);
                    this.syncVoltbase('CH2', s2.voltbase * 1e-6);
                }
            } catch (err) {
                console.error("Failed to pre-fetch settings on stream start:", err);
            }

            this.timeData1 = new Float64Array(0);
            this.voltageData1 = new Float32Array(0);
            this.timeData2 = new Float64Array(0);
            this.voltageData2 = new Float32Array(0);
            this.timeDataMath = new Float64Array(0);
            this.voltageDataMath = new Float32Array(0);
            
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const baseHost = window.location.host;
            
            // Connect to CH1 WebSocket
            this.websocketCh1 = new WebSocket(`${wsProtocol}//${baseHost}/ws/live/ch1`);
            this.websocketCh1.onopen = () => {
                this.isLiveStreaming = true;
                this.app.statusText.textContent = "Feeds Streaming";
                this.app.statusText.className = "status-ok";
            };
            this.websocketCh1.onmessage = (event) => {
                const chunk = event.data;
                if (chunk) {
                    this.appendLiveCSV(chunk, 1);
                }
            };
            this.websocketCh1.onclose = () => { this.handleWSDisconnect(); };
            
            // Connect to CH2 WebSocket
            this.websocketCh2 = new WebSocket(`${wsProtocol}//${baseHost}/ws/live/ch2`);
            this.websocketCh2.onmessage = (event) => {
                const chunk = event.data;
                if (chunk) {
                    this.appendLiveCSV(chunk, 2);
                }
            };
            this.websocketCh2.onclose = () => { this.handleWSDisconnect(); };
            
        } catch (e) {
            console.error("Live streaming start failed:", e);
            this.app.statusText.textContent = "Conn Error";
            this.app.statusText.className = "status-error";
        }
    }
    
    handleWSDisconnect() {
        if (this.isLiveStreaming) {
            this.stopLiveStreaming();
        }
    }
    
    async stopLiveStreaming() {
        this.isLiveStreaming = false;
        
        if (this.websocketCh1) {
            this.websocketCh1.close();
            this.websocketCh1 = null;
        }
        if (this.websocketCh2) {
            this.websocketCh2.close();
            this.websocketCh2 = null;
        }
        
        let url = '/api/live/stop';
        if (this.streamSessionId !== undefined && this.streamSessionId !== null) {
            url += `?session_id=${this.streamSessionId}`;
        }
        try {
            await fetch(url, { method: 'POST', keepalive: true });
        } catch (e) {
            console.warn("Failed to send stop streaming command:", e);
        }
        this.streamSessionId = null;
        
        this.app.statusText.textContent = "Live feeds stopped";
        this.app.statusText.className = "status-wait";
    }

    onRecordBtnPressed() {
        if (this.isRecording) {
            // Stop recording & write separate CSV files for full backward compatibility
            this.isRecording = false;
            this.app.statusText.textContent = "Writing dual CSVs...";
            this.app.statusText.className = "status-wait";
            
            if (this.totalRecordingSamplesCh1 > 0) {
                const header1 = `#timebase=${this.timebaseHeaderCh1}(ps)\n,#voltbase=${this.voltbaseHeaderCh1}(uV)\n#size=${this.totalRecordingSamplesCh1}\n`;
                const blob1 = new Blob([header1, ...this.recordingChunksCh1], { type: 'text/csv' });
                this.triggerBlobDownload(blob1, `${this.selectedRecordingNameBase}_CH1.csv`);
            }
            
            if (this.totalRecordingSamplesCh2 > 0) {
                const header2 = `#timebase=${this.timebaseHeaderCh2}(ps)\n,#voltbase=${this.voltbaseHeaderCh2}(uV)\n#size=${this.totalRecordingSamplesCh2}\n`;
                const blob2 = new Blob([header2, ...this.recordingChunksCh2], { type: 'text/csv' });
                this.triggerBlobDownload(blob2, `${this.selectedRecordingNameBase}_CH2.csv`);
            }
            
            this.recordingChunksCh1 = [];
            this.recordingChunksCh2 = [];
            this.totalRecordingSamplesCh1 = 0;
            this.totalRecordingSamplesCh2 = 0;
            this.app.recordBtn.textContent = "Start Recording";
            this.app.recordBtn.className = "btn btn-green";
        } else {
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
            const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
            
            this.selectedRecordingNameBase = `Hantek_${dateStr}_${timeStr}`;
            this.recordingChunksCh1 = [];
            this.recordingChunksCh2 = [];
            this.totalRecordingSamplesCh1 = 0;
            this.totalRecordingSamplesCh2 = 0;
            this.isRecording = true;
            
            this.app.recordBtn.textContent = "Stop Recording";
            this.app.recordBtn.className = "btn btn-red";
            this.app.statusText.textContent = "Recording both feeds...";
            this.app.statusText.className = "status-wait";
        }
    }
    
    triggerBlobDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.getElementById("download-link");
        link.href = url;
        link.download = filename;
        link.click();
        
        setTimeout(() => URL.revokeObjectURL(url), 100);
        this.app.statusText.textContent = "CSVs Downloaded!";
        this.app.statusText.className = "status-ok";
    }

    appendLiveCSV(csvChunk, channel) {
        // Strip out and buffer recording pieces in pure time domain
        if (this.isRecording) {
            const stripped = csvChunk.replace(/^\s*,?#.*\r?\n?/gm, '').trim();
            if (stripped) {
                const chunkCount = (stripped.match(/\n/g) || []).length + 1;
                if (channel === 1) {
                    this.recordingChunksCh1.push(stripped + '\n');
                    this.totalRecordingSamplesCh1 += chunkCount;
                } else {
                    this.recordingChunksCh2.push(stripped + '\n');
                    this.totalRecordingSamplesCh2 += chunkCount;
                }
            }
        }
        
        // Parse CSV data with 5x decimation for drawing smoothness
        const lines = csvChunk.split('\n');
        const appendRows = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            if (line.startsWith('#') || line.startsWith(',#')) {
                const tbMatch = line.match(/timebase=(-?\d+)/);
                const vbMatch = line.match(/voltbase=(\d+)/);
                
                if (tbMatch) {
                    let tb_raw = parseInt(tbMatch[1]);
                    if (tb_raw < 0) tb_raw += 4294967296;
                    if (channel === 1) {
                        this.timebaseHeaderCh1 = tb_raw;
                        this.syncTimebase(tb_raw * 1e-12);
                    } else {
                        this.timebaseHeaderCh2 = tb_raw;
                        this.syncTimebase(tb_raw * 1e-12);
                    }
                }
                if (vbMatch) {
                    const vb = parseInt(vbMatch[1]);
                    if (channel === 1) {
                        this.voltbaseHeaderCh1 = vb;
                        this.syncVoltbase('CH1', vb * 1e-6);
                    } else {
                        this.voltbaseHeaderCh2 = vb;
                        this.syncVoltbase('CH2', vb * 1e-6);
                    }
                }
                continue;
            }
            
            if (i % 5 !== 0) continue; // 5x decimation
            
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
        
        const currentDataTime = channel === 1 ? this.timeData1 : this.timeData2;
        const currentDataVolt = channel === 1 ? this.voltageData1 : this.voltageData2;
        const currentSize = currentDataTime.length;
        const MAX_SAMPLES = 15000; // Cap buffer size for fluid canvas updates
        
        let combinedTime, combinedVoltage;
        if (currentSize + newPoints > MAX_SAMPLES) {
            const keepSize = MAX_SAMPLES - newPoints;
            combinedTime = new Float64Array(MAX_SAMPLES);
            combinedVoltage = new Float32Array(MAX_SAMPLES);
            
            combinedTime.set(currentDataTime.subarray(currentSize - keepSize), 0);
            combinedVoltage.set(currentDataVolt.subarray(currentSize - keepSize), 0);
            
            for (let i = 0; i < newPoints; i++) {
                combinedTime[keepSize + i] = appendRows[i * 2];
                combinedVoltage[keepSize + i] = appendRows[i * 2 + 1];
            }
        } else {
            combinedTime = new Float64Array(currentSize + newPoints);
            combinedVoltage = new Float32Array(currentSize + newPoints);
            
            combinedTime.set(currentDataTime, 0);
            combinedVoltage.set(currentDataVolt, 0);
            
            for (let i = 0; i < newPoints; i++) {
                combinedTime[currentSize + i] = appendRows[i * 2];
                combinedVoltage[currentSize + i] = appendRows[i * 2 + 1];
            }
        }
        
        if (channel === 1) {
            this.timeData1 = combinedTime;
            this.voltageData1 = combinedVoltage;
        } else {
            this.timeData2 = combinedTime;
            this.voltageData2 = combinedVoltage;
        }
        
        // Live Math Alignment
        this.recalculateMath();
        
        this.app.capturedCount.textContent = Math.max(
            this.totalRecordingSamplesCh1 > 0 ? this.totalRecordingSamplesCh1 : this.timeData1.length,
            this.totalRecordingSamplesCh2 > 0 ? this.totalRecordingSamplesCh2 : this.timeData2.length
        ).toLocaleString();
        
        // Evaluate per-channel real-time triggers
        this.app.triggers.evaluateRealtimeTriggers(channel, newPoints);
        if (this.app.displayFrozen) return;
        
        if (currentSize === 0) {
            this.app.autoCalibrate();
        } else {
            this.app.updateSlidersAndReadouts();
            this.app.drawOscilloscope();
        }
    }

    togglePlaybackPlay() {
        if (this.playbackPlaying) {
            this.playbackPlaying = false;
            this.app.playBtn.textContent = "Play";
            this.app.playBtn.className = "btn btn-green";
            this.app.statusText.textContent = "Playback Paused";
        } else {
            if (this.timeData1.length === 0 && this.timeData2.length === 0) return;
            this.app.triggers.resetTriggerState();
            this.playbackPlaying = true;
            this.app.playBtn.textContent = "Pause";
            this.app.playBtn.className = "btn btn-red";
            this.app.statusText.textContent = "Playing...";
            this.lastFrameTime = performance.now();
            this.playbackLoop();
        }
    }
    
    onPlaybackSpeedChange(value) {
        const sliderVal = parseInt(value);
        this.playbackSpeed = Math.pow(10, -4 + sliderVal / 10.0);
        this.app.speedValText.textContent = `${this.playbackSpeed.toFixed(this.playbackSpeed < 0.01 ? 3 : (this.playbackSpeed < 0.1 ? 2 : this.playbackSpeed < 1 ? 1 : 0))}x`;
    }
    
    getPlaybackViewport(timeData, targetT, screenDuration) {
        if (!timeData || timeData.length === 0) {
            return { viewportStartT: targetT, viewportEndT: targetT + screenDuration };
        }
        
        // Find last sample index <= targetT using binary search
        let low = 0, high = timeData.length - 1;
        let last_idx = 0;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (timeData[mid] <= targetT) {
                last_idx = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        
        const local_dt = this.playbackFileDtAvg || 1e-5;
        const gap_threshold = Math.max(0.005, 5 * local_dt);
        
        // Find the end of the chunk containing timeData[last_idx]
        let chunk_end_idx = last_idx;
        while (chunk_end_idx < timeData.length - 1) {
            const next_dt = timeData[chunk_end_idx + 1] - timeData[chunk_end_idx];
            if (next_dt > gap_threshold) {
                break; // gap detected!
            }
            chunk_end_idx++;
        }
        const T_chunk_end = timeData[chunk_end_idx];
        
        if (this.playbackFileHasGaps) {
            return {
                viewportStartT: T_chunk_end - screenDuration,
                viewportEndT: T_chunk_end
            };
        } else {
            return {
                viewportStartT: targetT,
                viewportEndT: targetT + screenDuration
            };
        }
    }
    
    playbackLoop() {
        if (!this.playbackPlaying) return;
        
        const now = performance.now();
        const dtRealSec = (now - this.lastFrameTime) / 1000.0;
        this.lastFrameTime = now;
        
        const timebase = this.app.HORIZ_VALS[this.app.currentTimebaseIdx];
        const screenDuration = timebase * 12;
        
        const mainTimeData = this.timeData1.length > 0 ? this.timeData1 : this.timeData2;
        if (mainTimeData.length === 0) return;
        
        const startT = mainTimeData[0];
        const endT = mainTimeData[mainTimeData.length - 1];
        const totalDuration = endT - startT;
        
        const scrollableRange = totalDuration - screenDuration;
        if (scrollableRange > 0) {
            const shiftSec = dtRealSec * this.playbackSpeed;
            this.app.horizontalPosition += shiftSec / scrollableRange;
            if (this.app.horizontalPosition > 1.0) {
                this.app.horizontalPosition = 0.0; // loop
            }
        } else {
            this.app.horizontalPosition = 0.0;
        }
        
        this.app.timeScroll.value = Math.round(this.app.horizontalPosition * 100);
        this.app.updateSlidersAndReadouts();
        this.app.drawOscilloscope();
        
        // Evaluate per-channel playback triggers
        const targetT = startT + (this.app.horizontalPosition * Math.max(0, totalDuration - screenDuration));
        const vp = this.getPlaybackViewport(mainTimeData, targetT, screenDuration);
        this.app.triggers.evaluatePlaybackTriggers(vp.viewportStartT, vp.viewportEndT);
        
        if (this.playbackPlaying) {
            this.playbackFrameId = requestAnimationFrame(() => this.playbackLoop());
        }
    }
}
