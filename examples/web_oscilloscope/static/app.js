// Hantek Oscilloscope SPA
// Dual Channel, Math operations, sliding FFT with advanced windowing and scaling
// 100% Client-side. Built for 60 FPS performance.

class OscilloscopeApp {
    constructor() {
        // UI Elements - Core
        this.canvas = document.getElementById('oscilloscope-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.modeSelector = document.getElementById('mode-selector');
        
        // File pickers (CH1 and CH2)
        this.localFileInputCh1 = document.getElementById('local-file-input-ch1');
        this.localFileBtnCh1 = document.getElementById('local-file-btn-ch1');
        this.selectedFileNameCh1 = document.getElementById('selected-file-name-ch1');
        
        this.localFileInputCh2 = document.getElementById('local-file-input-ch2');
        this.localFileBtnCh2 = document.getElementById('local-file-btn-ch2');
        this.selectedFileNameCh2 = document.getElementById('selected-file-name-ch2');
        
        this.fileSelectGroup = document.getElementById('file-select-group');
        this.recordBtn = document.getElementById('record-btn');
        this.freezeBtn = document.getElementById('freeze-btn');
        this.playBtn = document.getElementById('playback-play-btn');
        this.autocalBtn = document.getElementById('autocal-btn');
        
        // Status fields
        this.statusText = document.getElementById('status-text');
        this.sourceText = document.getElementById('source-text');
        this.capturedCount = document.getElementById('captured-count');
        
        // Channel Visibility and Layout Checkboxes
        this.ch1Enable = document.getElementById('ch1-enable');
        this.ch2Enable = document.getElementById('ch2-enable');
        this.mathEnable = document.getElementById('math-enable');
        this.layoutSelector = document.getElementById('layout-selector');
        
        // Tab elements
        this.tabCh1 = document.getElementById('tab-ch1');
        this.tabCh2 = document.getElementById('tab-ch2');
        this.tabMath = document.getElementById('tab-math');
        this.mathOpControl = document.getElementById('math-op-control');
        this.mathOpSelector = document.getElementById('math-op-selector');
        
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
        this.voltbaseLabel = document.getElementById('voltbase-label');
        this.offsetLabel = document.getElementById('offset-label');
        
        // FFT Controls
        this.fftEnable = document.getElementById('fft-enable');
        this.fftSettingsBtn = document.getElementById('fft-settings-btn');
        this.fftSettingsDialog = document.getElementById('fft-settings-dialog');
        this.fftWindowSelect = document.getElementById('fft-window-select');
        this.fftBaseSelect = document.getElementById('fft-base-select');
        this.fftDialogClose = document.getElementById('fft-dialog-close');
        
        // Speed Controls
        this.playbackSpeedSlider = document.getElementById('playback-speed');
        this.speedValText = document.getElementById('speed-val');
        this.speedControlGroup = document.getElementById('speed-control-group');
        
        // OSD elements
        this.osdEnable = document.getElementById('osd-enable');
        this.osdLeftContainer = document.getElementById('osd-left-container');
        this.osdTimebase = document.getElementById('osd-timebase');
        this.osdSize = document.getElementById('osd-size');
        
        // State variables - Core
        this.mode = 'playback'; // 'playback' or 'realtime'
        this.isLiveStreaming = false;
        this.websocketCh1 = null;
        this.websocketCh2 = null;
        this.playbackPlaying = false;
        this.playbackFrameId = null;
        this.displayFrozen = false;
        this.playbackSpeed = 1.0;
        this.lastFrameTime = 0;
        
        // Active display configuration state
        this.activeTab = 'CH1'; // 'CH1', 'CH2', or 'MATH'
        this.layoutMode = 'overlay'; // 'overlay' or 'split'
        this.mathOperation = 'CH1+CH2';
        
        // Shared global FFT configuration state
        this.fftWindow = 'Hanning'; // 'Rectangular', 'Hanning', 'Flattop', 'Bartlett', 'Blackman'
        this.fftVerticalBase = 'Vrms'; // 'Vrms', 'dBrms'
        
        // Dual Channel Recording State
        this.isRecording = false;
        this.recordingChunksCh1 = [];
        this.recordingChunksCh2 = [];
        this.totalRecordingSamplesCh1 = 0;
        this.totalRecordingSamplesCh2 = 0;
        this.selectedRecordingNameBase = '';
        
        // Captured waveform arrays (independent storage per channel)
        this.timeData1 = new Float64Array(0);
        this.voltageData1 = new Float32Array(0);
        this.timeData2 = new Float64Array(0);
        this.voltageData2 = new Float32Array(0);
        this.timeDataMath = new Float64Array(0);
        this.voltageDataMath = new Float32Array(0);
        
        // File loaded markers
        this.fileLoadedCh1 = false;
        this.fileLoadedCh2 = false;
        
        // Header settings
        this.timebaseHeaderCh1 = 2000000000; // in ps
        this.voltbaseHeaderCh1 = 5000000;    // in uV
        this.timebaseHeaderCh2 = 2000000000;
        this.voltbaseHeaderCh2 = 5000000;
        
        // Calibration scales and offsets (maintained independently per channel)
        this.currentVoltbaseIdxCh1 = 10; // Default 5V
        this.currentVoltbaseIdxCh2 = 10; // Default 5V
        this.currentVoltbaseIdxMath = 10; // Default 5V
        
        this.verticalOffsetDivCh1 = 0.0;
        this.verticalOffsetDivCh2 = 0.0;
        this.verticalOffsetDivMath = 0.0;
        
        this.fftEnabledCh1 = false;
        this.fftEnabledCh2 = false;
        this.fftEnabledMath = false;
        
        this.osdEnabledCh1 = true;
        this.osdEnabledCh2 = true;
        this.osdEnabledMath = true;
        
        this.currentTimebaseIdx = 18; // Default 2ms
        this.horizontalPosition = 0.0; // scroll between 0.0 and 1.0
        
        // 1-2-5 steps tables (Linear Voltage)
        // Prepopulated Voltages (covering 1X and 10X probe ranges natively up to 100V)
        this.VERT_VALS = [
            0.001, 0.002, 0.005, 0.010, 0.020, 0.050, 0.100, 0.200, 0.500,
            1.000, 2.000, 5.000, 10.000, 20.000, 50.000, 100.000
        ];
        
        // Decibel Scale Steps for FFT logarithmic display
        this.DB_DIVS = [1, 2, 5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100];
        
        // Prepopulated Timebases (True Physical 2-4-8 Hantek Scale Steps from 2ns to 40s)
        this.HORIZ_VALS = [
            2e-9, 4e-9, 8e-9, 20e-9, 40e-9, 80e-9, 200e-9, 400e-9, 800e-9,
            2e-6, 4e-6, 8e-6, 20e-6, 40e-6, 80e-6, 200e-6, 400e-6, 800e-6,
            2e-3, 4e-3, 8e-3, 20e-3, 40e-3, 80e-3, 200e-3, 400e-3, 800e-3,
            2.0, 4.0, 8.0, 20.0, 40.0
        ];
        
        // Trigger Controls (linked to CH1)
        this.triggerEnable = document.getElementById('trigger-enable');
        this.triggerAction = document.getElementById('trigger-action');
        this.triggerLow = document.getElementById('trigger-low');
        this.triggerLowVal = document.getElementById('trigger-low-val');
        this.triggerHigh = document.getElementById('trigger-high');
        this.triggerHighVal = document.getElementById('trigger-high-val');
        this.triggerSamples = document.getElementById('trigger-samples');
        this.triggerSamplesVal = document.getElementById('trigger-samples-val');
        this.triggerTime = document.getElementById('trigger-time');
        this.triggerTimeVal = document.getElementById('trigger-time-val');
        this.postTriggerDelay = document.getElementById('post-trigger-delay');
        this.postTriggerVal = document.getElementById('post-trigger-val');
        this.postTriggerAuto = document.getElementById('post-trigger-auto');
        
        // FFT Frequency Range trigger UI controls
        this.verticalCalibrationSection = document.getElementById('vertical-calibration-section');
        this.triggerCalibrationSection = document.getElementById('trigger-calibration-section');
        this.triggerLowLabel = document.getElementById('trigger-low-label');
        this.triggerHighLabel = document.getElementById('trigger-high-label');
        this.triggerFFTRangeGroup = document.getElementById('trigger-fft-range-group');
        this.triggerFreqLow = document.getElementById('trigger-freq-low');
        this.triggerFreqLowVal = document.getElementById('trigger-freq-low-val');
        this.triggerFreqLowMax = document.getElementById('trigger-freq-low-max');
        this.triggerFreqHigh = document.getElementById('trigger-freq-high');
        this.triggerFreqHighVal = document.getElementById('trigger-freq-high-val');
        this.triggerFreqHighMax = document.getElementById('trigger-freq-high-max');
        this.triggerFFTLogic = document.getElementById('trigger-fft-logic');
        
        // Trigger State (Per-channel dictionaries)
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
        
        // Active Firing & Detection State (Global & tracking source)
        this.isTriggered = false;
        this.triggerSourceChannel = null; // 'CH1', 'CH2', or 'MATH'
        
        this.postTriggerCounter = { 'CH1': -1, 'CH2': -1, 'MATH': -1 };
        this.consecutiveOutsideSamples = { 'CH1': 0, 'CH2': 0, 'MATH': 0 };
        this.triggerStartTime = { 'CH1': null, 'CH2': null, 'MATH': null };
        
        this.triggerLowVolts = { 'CH1': -1.0, 'CH2': -1.0, 'MATH': -1.0 };
        this.triggerHighVolts = { 'CH1': 1.0, 'CH2': 1.0, 'MATH': 1.0 };
        
        this.init();
    }
    
    init() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Wire selectors and buttons
        this.modeSelector.addEventListener('change', () => this.onModeChange());
        
        this.localFileBtnCh1.addEventListener('click', () => this.localFileInputCh1.click());
        this.localFileInputCh1.addEventListener('change', (e) => this.onLocalFileSelected(e, 1));
        
        this.localFileBtnCh2.addEventListener('click', () => this.localFileInputCh2.click());
        this.localFileInputCh2.addEventListener('change', (e) => this.onLocalFileSelected(e, 2));
        
        this.recordBtn.addEventListener('click', () => this.onRecordBtnPressed());
        this.freezeBtn.addEventListener('click', () => this.toggleFreezeDisplay());
        this.playBtn.addEventListener('click', () => this.togglePlaybackPlay());
        this.autocalBtn.addEventListener('click', () => this.autoCalibrate());
        
        // Layout and visibility checkboxes
        this.ch1Enable.addEventListener('change', () => { 
            this.updateSlidersAndReadouts();
            this.drawOscilloscope(); 
        });
        this.ch2Enable.addEventListener('change', () => { 
            this.updateSlidersAndReadouts();
            this.drawOscilloscope(); 
        });
        this.mathEnable.addEventListener('change', () => { 
            this.recalculateMath();
            this.updateSlidersAndReadouts();
            this.drawOscilloscope(); 
        });
        this.layoutSelector.addEventListener('change', (e) => {
            this.layoutMode = e.target.value;
            this.drawOscilloscope();
        });
        
        // Setting tab switches
        this.tabCh1.addEventListener('click', () => this.switchActiveTab('CH1'));
        this.tabCh2.addEventListener('click', () => this.switchActiveTab('CH2'));
        this.tabMath.addEventListener('click', () => this.switchActiveTab('MATH'));
        this.mathOpSelector.addEventListener('change', (e) => {
            this.mathOperation = e.target.value;
            this.recalculateMath();
            this.drawOscilloscope();
        });
        
        // Horizontal calibration
        this.timeZoomOut.addEventListener('click', () => this.adjustTimebase(1));
        this.timeZoomIn.addEventListener('click', () => this.adjustTimebase(-1));
        this.timeScroll.addEventListener('input', (e) => this.onTimeScroll(e.target.value));
        this.initTimeScrollPrecisionScrubbing();
        
        // Vertical calibration
        this.voltZoomOut.addEventListener('click', () => this.adjustVoltbase(1));
        this.voltZoomIn.addEventListener('click', () => this.adjustVoltbase(-1));
        this.voltOffset.addEventListener('input', (e) => this.onVoltOffset(e.target.value));
        
        // OSD checkbox
        this.osdEnable.addEventListener('change', (e) => this.onOSDEnableChange(e.target.checked));
        
        // FFT checkbox & Dialog
        this.fftEnable.addEventListener('change', (e) => this.onFFTEnableChange(e.target.checked));
        this.fftSettingsBtn.addEventListener('click', () => this.fftSettingsDialog.showModal());
        this.fftDialogClose.addEventListener('click', () => {
            this.fftWindow = this.fftWindowSelect.value;
            this.fftVerticalBase = this.fftBaseSelect.value;
            this.fftSettingsDialog.close();
            this.updateSlidersAndReadouts();
            this.drawOscilloscope();
        });
        
        // Speed Calibration
        this.playbackSpeedSlider.addEventListener('input', (e) => this.onPlaybackSpeedChange(e.target.value));
        
        // Trigger controls
        this.triggerEnable.addEventListener('change', (e) => this.onTriggerEnableChange(e.target.checked));
        this.triggerAction.addEventListener('change', (e) => this.onTriggerActionChange(e.target.value));
        this.triggerLow.addEventListener('input', (e) => this.onTriggerLowChange(e.target.value));
        this.triggerHigh.addEventListener('input', (e) => this.onTriggerHighChange(e.target.value));
        this.triggerSamples.addEventListener('input', (e) => this.onTriggerSamplesChange(e.target.value));
        this.triggerTime.addEventListener('input', (e) => this.onTriggerTimeChange(e.target.value));
        this.postTriggerDelay.addEventListener('input', (e) => this.onPostTriggerDelayChange(e.target.value));
        this.postTriggerAuto.addEventListener('change', (e) => this.onPostTriggerAutoChange(e.target.checked));
        
        // FFT Range Trigger controls listeners
        this.triggerFreqLow.addEventListener('input', (e) => this.onTriggerFreqLowChange(e.target.value));
        this.triggerFreqHigh.addEventListener('input', (e) => this.onTriggerFreqHighChange(e.target.value));
        this.triggerFFTLogic.addEventListener('change', (e) => this.onTriggerFFTLogicChange(e.target.value));
        
        // Load default mock waveforms on startup
        this.loadDefaultMockWaveforms();
        
        // Synchronize layout UI
        this.onModeChange();
        this.drawOscilloscope();
    }
    
    resizeCanvas() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.drawOscilloscope();
    }
    
    switchActiveTab(channel) {
        this.activeTab = channel;
        
        // UI tab class changes
        this.tabCh1.className = 'tab-btn' + (channel === 'CH1' ? ' active' : '');
        this.tabCh2.className = 'tab-btn' + (channel === 'CH2' ? ' active' : '');
        this.tabMath.className = 'tab-btn' + (channel === 'MATH' ? ' active' : '');
        
        // Update vertical and trigger panel highlights dynamically
        if (this.verticalCalibrationSection) {
            this.verticalCalibrationSection.className = 'calibration-section active-' + channel.toLowerCase();
        }
        if (this.triggerCalibrationSection) {
            this.triggerCalibrationSection.className = 'calibration-section active-' + channel.toLowerCase();
        }
        
        // Show/hide Math operation select
        if (channel === 'MATH') {
            this.mathOpControl.classList.remove('hide');
        } else {
            this.mathOpControl.classList.add('hide');
        }
        
        this.updateSlidersAndReadouts();
    }
    
    onFFTEnableChange(checked) {
        if (this.activeTab === 'CH1') {
            this.fftEnabledCh1 = checked;
        } else if (this.activeTab === 'CH2') {
            this.fftEnabledCh2 = checked;
        } else {
            this.fftEnabledMath = checked;
        }
        this.updateSlidersAndReadouts();
        this.drawOscilloscope();
    }
    
    onOSDEnableChange(checked) {
        if (this.activeTab === 'CH1') {
            this.osdEnabledCh1 = checked;
        } else if (this.activeTab === 'CH2') {
            this.osdEnabledCh2 = checked;
        } else {
            this.osdEnabledMath = checked;
        }
        this.updateSlidersAndReadouts();
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
            this.sourceText.textContent = "Live DSO Streams (CH1 & CH2)";
            
            this.timeData1 = new Float64Array(0);
            this.voltageData1 = new Float32Array(0);
            this.timeData2 = new Float64Array(0);
            this.voltageData2 = new Float32Array(0);
            this.timeDataMath = new Float64Array(0);
            this.voltageDataMath = new Float32Array(0);
            
            this.capturedCount.textContent = "0";
            this.statusText.textContent = "Connecting feeds...";
            this.statusText.className = "status-wait";
            
            this.startLiveStreaming();
        } else {
            this.fileSelectGroup.classList.remove('hide');
            this.speedControlGroup.classList.remove('hide');
            this.recordBtn.classList.add('hide');
            this.freezeBtn.classList.add('hide');
            this.playBtn.classList.remove('hide');
            this.loadDefaultMockWaveforms();
        }
        this.drawOscilloscope();
    }
    
    stopAllActivities() {
        this.playbackPlaying = false;
        if (this.playbackFrameId) {
            cancelAnimationFrame(this.playbackFrameId);
            this.playbackFrameId = null;
        }
        this.playBtn.textContent = "Play";
        this.playBtn.className = "btn btn-green";
        
        if (this.isLiveStreaming) {
            this.stopLiveStreaming();
        }
        
        if (this.isRecording) {
            this.isRecording = false;
            this.recordingChunksCh1 = [];
            this.recordingChunksCh2 = [];
            this.totalRecordingSamplesCh1 = 0;
            this.totalRecordingSamplesCh2 = 0;
            this.recordBtn.textContent = "Start Recording";
            this.recordBtn.className = "btn btn-green";
        }
        
        this.displayFrozen = false;
        this.freezeBtn.textContent = "Freeze Display";
        this.freezeBtn.className = "btn btn-blue";
        this.resetTriggerState();
    }
    
    onLocalFileSelected(e, channel) {
        const file = e.target.files[0];
        if (!file) return;
        
        const label = channel === 1 ? this.selectedFileNameCh1 : this.selectedFileNameCh2;
        label.textContent = file.name;
        
        this.statusText.textContent = `Loading CH${channel} file...`;
        this.statusText.className = "status-wait";
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target.result;
            this.parseCSV(text, channel);
            this.statusText.textContent = `CH${channel} Loaded`;
            this.statusText.className = "status-ok";
            if (channel === 1) this.fileLoadedCh1 = true;
            if (channel === 2) this.fileLoadedCh2 = true;
            
            this.recalculateMath();
            this.autoCalibrate();
        };
        reader.onerror = () => {
            this.statusText.textContent = "Read Error";
            this.statusText.className = "status-error";
        };
        reader.readAsText(file);
    }
    
    loadDefaultMockWaveforms() {
        this.selectedFileNameCh1.textContent = "Mock CH1 Sine";
        this.selectedFileNameCh2.textContent = "Mock CH2 Cos";
        this.sourceText.textContent = "Demo Waveforms";
        
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
        this.autoCalibrate();
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
        
        this.capturedCount.textContent = Math.max(this.timeData1.length, this.timeData2.length).toLocaleString();
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
    
    syncTimebase(tbSeconds) {
        if (!tbSeconds || tbSeconds <= 0) return;
        const epsilon = 1e-11;
        let foundIdx = -1;
        for (let i = 0; i < this.HORIZ_VALS.length; i++) {
            if (Math.abs(this.HORIZ_VALS[i] - tbSeconds) < epsilon) {
                foundIdx = i;
                break;
            }
        }
        if (foundIdx !== -1) {
            this.currentTimebaseIdx = foundIdx;
        } else {
            this.HORIZ_VALS.push(tbSeconds);
            this.HORIZ_VALS.sort((a, b) => a - b);
            for (let i = 0; i < this.HORIZ_VALS.length; i++) {
                if (Math.abs(this.HORIZ_VALS[i] - tbSeconds) < epsilon) {
                    this.currentTimebaseIdx = i;
                    break;
                }
            }
        }
    }
    
    syncVoltbase(channel, vbVolts) {
        if (!vbVolts || vbVolts <= 0) return;
        const epsilon = 1e-11;
        let foundIdx = -1;
        for (let i = 0; i < this.VERT_VALS.length; i++) {
            if (Math.abs(this.VERT_VALS[i] - vbVolts) < epsilon) {
                foundIdx = i;
                break;
            }
        }
        if (foundIdx === -1) {
            const ch1Val = this.VERT_VALS[this.currentVoltbaseIdxCh1];
            const ch2Val = this.VERT_VALS[this.currentVoltbaseIdxCh2];
            const mathVal = this.VERT_VALS[this.currentVoltbaseIdxMath];
            
            this.VERT_VALS.push(vbVolts);
            this.VERT_VALS.sort((a, b) => a - b);
            
            const remapIndex = (originalVal) => {
                for (let i = 0; i < this.VERT_VALS.length; i++) {
                    if (Math.abs(this.VERT_VALS[i] - originalVal) < epsilon) {
                        return i;
                    }
                }
                return 0;
            };
            
            this.currentVoltbaseIdxCh1 = remapIndex(ch1Val);
            this.currentVoltbaseIdxCh2 = remapIndex(ch2Val);
            this.currentVoltbaseIdxMath = remapIndex(mathVal);
            
            for (let i = 0; i < this.VERT_VALS.length; i++) {
                if (Math.abs(this.VERT_VALS[i] - vbVolts) < epsilon) {
                    foundIdx = i;
                    break;
                }
            }
        }
        
        if (channel === 1 || channel === 'CH1') {
            this.currentVoltbaseIdxCh1 = foundIdx;
        } else if (channel === 2 || channel === 'CH2') {
            this.currentVoltbaseIdxCh2 = foundIdx;
        } else if (channel === 'MATH') {
            this.currentVoltbaseIdxMath = foundIdx;
        }
    }
    
    // Fast O(log N) binary-search linear interpolation of CH2 voltages on CH1's timestamp base
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
        if (!this.mathEnable.checked || this.timeData1.length === 0) {
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
            switch(this.mathOperation) {
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
        this.statusText.textContent = "Starting captures...";
        this.statusText.className = "status-wait";
        
        try {
            const res = await fetch('/api/live/start', { method: 'POST' });
            await res.json();
            
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
                this.statusText.textContent = "Feeds Streaming";
                this.statusText.className = "status-ok";
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
            this.statusText.textContent = "Conn Error";
            this.statusText.className = "status-error";
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
        
        await fetch('/api/live/stop', { method: 'POST' });
        this.statusText.textContent = "Live feeds stopped";
        this.statusText.className = "status-wait";
    }
    
    onRecordBtnPressed() {
        if (this.isRecording) {
            // Stop recording & write separate CSV files for full backward compatibility
            this.isRecording = false;
            this.statusText.textContent = "Writing dual CSVs...";
            this.statusText.className = "status-wait";
            
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
            this.recordBtn.textContent = "Start Recording";
            this.recordBtn.className = "btn btn-green";
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
            
            this.recordBtn.textContent = "Stop Recording";
            this.recordBtn.className = "btn btn-red";
            this.statusText.textContent = "Recording both feeds...";
            this.statusText.className = "status-wait";
        }
    }
    
    triggerBlobDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.getElementById("download-link");
        link.href = url;
        link.download = filename;
        link.click();
        
        setTimeout(() => URL.revokeObjectURL(url), 100);
        this.statusText.textContent = "CSVs Downloaded!";
        this.statusText.className = "status-ok";
    }
    
    appendLiveCSV(csvChunk, channel) {
        // Strip out and buffer recording pieces in pure time domain
        if (this.isRecording) {
            const stripped = csvChunk.replace(/^\s*#.*$/gm, '').trim();
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
        
        this.capturedCount.textContent = Math.max(
            this.totalRecordingSamplesCh1 > 0 ? this.totalRecordingSamplesCh1 : this.timeData1.length,
            this.totalRecordingSamplesCh2 > 0 ? this.totalRecordingSamplesCh2 : this.timeData2.length
        ).toLocaleString();
        
        // Evaluate per-channel real-time triggers
        this.evaluateRealtimeTriggers(channel, newPoints);
        if (this.displayFrozen) return;
        
        if (currentSize === 0) {
            this.autoCalibrate();
        } else {
            this.updateSlidersAndReadouts();
            this.drawOscilloscope();
        }
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
                    this.stopLiveStreaming();
                    this.displayFrozen = true;
                    this.freezeBtn.textContent = "Unfreeze Display";
                    this.freezeBtn.className = "btn btn-red";
                    this.statusText.textContent = `Stopped (+${this.postTriggerCounter[src]} samples on ${src})`;
                    this.statusText.className = "status-wait";
                    this.updateSlidersAndReadouts();
                    this.drawOscilloscope();
                }
            }
            return;
        }
        
        // Not triggered yet. Evaluate trigger conditions on active trigger-enabled channels.
        
        // 1. Evaluate CH1 trigger if enabled and channel is 1
        if (channel === 1 && this.triggerEnabled['CH1']) {
            if (this.fftEnabledCh1) {
                this.checkFFTChannelTrigger('CH1', this.timeData1, this.voltageData1, false, null, null);
            } else {
                this.checkChannelTrigger('CH1', newPoints, this.timeData1, this.voltageData1);
            }
            if (this.isTriggered) return;
        }
        
        // 2. Evaluate CH2 trigger if enabled and channel is 2
        if (channel === 2 && this.triggerEnabled['CH2']) {
            if (this.fftEnabledCh2) {
                this.checkFFTChannelTrigger('CH2', this.timeData2, this.voltageData2, false, null, null);
            } else {
                this.checkChannelTrigger('CH2', newPoints, this.timeData2, this.voltageData2);
            }
            if (this.isTriggered) return;
        }
        
        // 3. Evaluate MATH trigger if enabled and channel is 1 (MATH runs on CH1 updates)
        if (channel === 1 && this.triggerEnabled['MATH'] && this.mathEnable.checked && this.timeDataMath.length >= newPoints) {
            if (this.fftEnabledMath) {
                this.checkFFTChannelTrigger('MATH', this.timeDataMath, this.voltageDataMath, false, null, null);
            } else {
                this.checkChannelTrigger('MATH', newPoints, this.timeDataMath, this.voltageDataMath);
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
                        this.displayFrozen = true;
                        this.freezeBtn.textContent = "Unfreeze Display";
                        this.freezeBtn.className = "btn btn-red";
                        this.statusText.textContent = `Triggered: ${chKey} (Frozen)`;
                        this.statusText.className = "status-wait";
                        this.drawOscilloscope();
                    } else {
                        this.postTriggerCounter[chKey] = pointsCount - 1 - i;
                        this.statusText.textContent = `Triggered: ${chKey}! Capturing post...`;
                        this.statusText.className = "status-wait";
                    }
                    break;
                }
            } else {
                this.consecutiveOutsideSamples[chKey] = 0;
                this.triggerStartTime[chKey] = null;
            }
        }
    }
    
    toggleFreezeDisplay() {
        this.displayFrozen = !this.displayFrozen;
        if (this.displayFrozen) {
            this.freezeBtn.textContent = "Unfreeze Display";
            this.freezeBtn.className = "btn btn-red";
            this.statusText.textContent = "Display Frozen (Streaming active)";
            this.statusText.className = "status-wait";
        } else {
            this.freezeBtn.textContent = "Freeze Display";
            this.freezeBtn.className = "btn btn-blue";
            this.statusText.textContent = "Streaming Live";
            this.statusText.className = "status-ok";
            this.resetTriggerState();
            
            if (this.mode === 'realtime' && !this.isLiveStreaming) {
                this.startLiveStreaming();
            } else {
                this.updateSlidersAndReadouts();
                this.drawOscilloscope();
            }
        }
    }
    
    togglePlaybackPlay() {
        if (this.playbackPlaying) {
            this.playbackPlaying = false;
            this.playBtn.textContent = "Play";
            this.playBtn.className = "btn btn-green";
            this.statusText.textContent = "Playback Paused";
        } else {
            if (this.timeData1.length === 0 && this.timeData2.length === 0) return;
            this.resetTriggerState();
            this.playbackPlaying = true;
            this.playBtn.textContent = "Pause";
            this.playBtn.className = "btn btn-red";
            this.statusText.textContent = "Playing...";
            this.lastFrameTime = performance.now();
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
        const screenDuration = timebase * 12;
        
        const mainTimeData = this.timeData1.length > 0 ? this.timeData1 : this.timeData2;
        if (mainTimeData.length === 0) return;
        
        const startT = mainTimeData[0];
        const endT = mainTimeData[mainTimeData.length - 1];
        const totalDuration = endT - startT;
        
        const scrollableRange = totalDuration - screenDuration;
        if (scrollableRange > 0) {
            const shiftSec = dtRealSec * this.playbackSpeed;
            this.horizontalPosition += shiftSec / scrollableRange;
            if (this.horizontalPosition > 1.0) {
                this.horizontalPosition = 0.0; // loop
            }
        } else {
            this.horizontalPosition = 0.0;
        }
        
        this.timeScroll.value = Math.round(this.horizontalPosition * 100);
        this.updateSlidersAndReadouts();
        this.drawOscilloscope();
        
        // Evaluate per-channel playback triggers
        const viewportStartT = startT + (this.horizontalPosition * Math.max(0, totalDuration - screenDuration));
        const viewportEndT = viewportStartT + screenDuration;
        this.evaluatePlaybackTriggers(viewportStartT, viewportEndT);
        
        if (this.playbackPlaying) {
            this.playbackFrameId = requestAnimationFrame(() => this.playbackLoop());
        }
    }
    
    evaluatePlaybackTriggers(viewportStartT, viewportEndT) {
        if (this.isTriggered) return;
        if (this.triggerEnabled['CH1'] && this.ch1Enable.checked && this.timeData1.length > 0) {
            if (this.fftEnabledCh1) {
                this.checkFFTChannelTrigger('CH1', this.timeData1, this.voltageData1, true, viewportStartT, viewportEndT);
            } else {
                this.checkPlaybackChannelTrigger('CH1', this.timeData1, this.voltageData1, viewportStartT, viewportEndT);
            }
            if (this.isTriggered) return;
        }
        if (this.triggerEnabled['CH2'] && this.ch2Enable.checked && this.timeData2.length > 0) {
            if (this.fftEnabledCh2) {
                this.checkFFTChannelTrigger('CH2', this.timeData2, this.voltageData2, true, viewportStartT, viewportEndT);
            } else {
                this.checkPlaybackChannelTrigger('CH2', this.timeData2, this.voltageData2, viewportStartT, viewportEndT);
            }
            if (this.isTriggered) return;
        }
        if (this.triggerEnabled['MATH'] && this.mathEnable.checked && this.timeDataMath.length > 0) {
            if (this.fftEnabledMath) {
                this.checkFFTChannelTrigger('MATH', this.timeDataMath, this.voltageDataMath, true, viewportStartT, viewportEndT);
            } else {
                this.checkPlaybackChannelTrigger('MATH', this.timeDataMath, this.voltageDataMath, viewportStartT, viewportEndT);
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
                    this.playbackPlaying = false;
                    this.playBtn.textContent = "Play";
                    this.playBtn.className = "btn btn-green";
                    this.statusText.textContent = `Triggered: ${chKey} (Playback Paused)`;
                    this.statusText.className = "status-wait";
                    this.drawOscilloscope();
                    break;
                }
            } else { consec = 0; triggerT = null; }
        }
    }
    
    checkFFTChannelTrigger(chKey, timeArray, voltArray, isPlayback, viewportStartT, viewportEndT) {
        if (this.isTriggered) return;
        if (timeArray.length < 16) return;

        const timebase = this.HORIZ_VALS[this.currentTimebaseIdx];
        const screenDuration = timebase * 12; // 12 divs total horizontal

        const startT = timeArray[0];
        const endT = timeArray[timeArray.length - 1];
        const totalDuration = endT - startT;

        if (viewportStartT === null || viewportStartT === undefined) {
            if (this.mode === 'realtime') {
                viewportEndT = endT;
                viewportStartT = Math.max(startT, endT - screenDuration);
            } else {
                viewportStartT = startT + (this.horizontalPosition * Math.max(0, totalDuration - screenDuration));
                viewportEndT = viewportStartT + screenDuration;
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
        const fftResult = this.computeFFTSpectrum(sliceReal, avg_dt);
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
                    this.playbackPlaying = false;
                    this.playBtn.textContent = "Play";
                    this.playBtn.className = "btn btn-green";
                    this.statusText.textContent = `Triggered: ${chKey} (Playback Paused)`;
                    this.statusText.className = "status-wait";
                    this.drawOscilloscope();
                } else {
                    if (this.triggerActionVal[chKey] === 'pause') {
                        this.displayFrozen = true;
                        this.freezeBtn.textContent = "Unfreeze Display";
                        this.freezeBtn.className = "btn btn-red";
                        this.statusText.textContent = `Triggered: ${chKey} (Frozen)`;
                        this.statusText.className = "status-wait";
                        this.drawOscilloscope();
                    } else {
                        this.postTriggerCounter[chKey] = 0;
                        this.statusText.textContent = `Triggered: ${chKey}! Capturing post...`;
                        this.statusText.className = "status-wait";
                    }
                }
            }
        } else {
            this.consecutiveOutsideSamples[chKey] = 0;
            this.triggerStartTime[chKey] = null;
        }
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
        const tab = this.activeTab;
        const isFFT = tab === 'CH1' ? this.fftEnabledCh1 : (tab === 'CH2' ? this.fftEnabledCh2 : this.fftEnabledMath);
        
        if (isFFT && this.fftVerticalBase === 'dBrms') {
            // Adjust Decibel zoom base (dB/div)
            let idx = this.DB_DIVS.indexOf(this.getVoltbaseValue(tab));
            if (idx === -1) idx = 3; // default 10dB
            const nextIdx = idx + direction;
            if (nextIdx >= 0 && nextIdx < this.DB_DIVS.length) {
                this.setVoltbaseIdx(tab, nextIdx); // reuse scale index
            }
        } else {
            // Adjust Voltbase zoom (V/div)
            const idx = this.getVoltbaseIdx(tab);
            const nextIdx = idx + direction;
            if (nextIdx >= 0 && nextIdx < this.VERT_VALS.length) {
                this.setVoltbaseIdx(tab, nextIdx);
            }
        }
        this.updateSlidersAndReadouts();
        this.drawOscilloscope();
    }
    
    getVoltbaseIdx(channel) {
        if (channel === 'CH1') return this.currentVoltbaseIdxCh1;
        if (channel === 'CH2') return this.currentVoltbaseIdxCh2;
        return this.currentVoltbaseIdxMath;
    }
    
    setVoltbaseIdx(channel, idx) {
        if (channel === 'CH1') this.currentVoltbaseIdxCh1 = idx;
        else if (channel === 'CH2') this.currentVoltbaseIdxCh2 = idx;
        else this.currentVoltbaseIdxMath = idx;
    }
    
    getVoltbaseValue(channel) {
        const isFFT = channel === 'CH1' ? this.fftEnabledCh1 : (channel === 'CH2' ? this.fftEnabledCh2 : this.fftEnabledMath);
        if (isFFT && this.fftVerticalBase === 'dBrms') {
            const idx = this.getVoltbaseIdx(channel);
            return this.DB_DIVS[Math.min(idx, this.DB_DIVS.length - 1)];
        }
        return this.VERT_VALS[this.getVoltbaseIdx(channel)];
    }
    
    getVerticalOffset(channel) {
        if (channel === 'CH1') return this.verticalOffsetDivCh1;
        if (channel === 'CH2') return this.verticalOffsetDivCh2;
        return this.verticalOffsetDivMath;
    }
    
    setVerticalOffset(channel, val) {
        if (channel === 'CH1') this.verticalOffsetDivCh1 = val;
        else if (channel === 'CH2') this.verticalOffsetDivCh2 = val;
        else this.verticalOffsetDivMath = val;
    }
    
    onTimeScroll(value) {
        if (this.isCustomDragging) return;
        this.horizontalPosition = parseFloat(value) / 100;
        this.updateSlidersAndReadouts();
        this.drawOscilloscope();
    }
    
    onVoltOffset(value) {
        this.setVerticalOffset(this.activeTab, parseFloat(value) / 25);
        this.updateSlidersAndReadouts();
        this.drawOscilloscope();
    }
    
    onTriggerEnableChange(enabled) {
        const tab = this.activeTab;
        this.triggerEnabled[tab] = enabled;
        if (enabled) this.resetTriggerState();
        this.drawOscilloscope();
    }
    
    onTriggerActionChange(act) {
        const tab = this.activeTab;
        this.triggerActionVal[tab] = act;
        this.resetTriggerState();
    }
    
    onTriggerLowChange(value) {
        const tab = this.activeTab;
        this.triggerLowDiv[tab] = parseFloat(value) / 25;
        this.updateSlidersAndReadouts();
        this.drawOscilloscope();
    }
    
    onTriggerHighChange(value) {
        const tab = this.activeTab;
        this.triggerHighDiv[tab] = parseFloat(value) / 25;
        this.updateSlidersAndReadouts();
        this.drawOscilloscope();
    }
    
    onTriggerSamplesChange(value) {
        const tab = this.activeTab;
        this.triggerMinSamples[tab] = parseInt(value);
        this.updateSlidersAndReadouts();
    }
    
    onTriggerTimeChange(value) {
        const tab = this.activeTab;
        this.triggerMinTimeSec[tab] = (parseFloat(value) / 10) / 1000.0;
        this.updateSlidersAndReadouts();
    }
    
    onPostTriggerDelayChange(value) {
        const tab = this.activeTab;
        this.triggerPostDelayVal[tab] = parseInt(value);
        this.triggerPostAuto[tab] = false;
        this.updateSlidersAndReadouts();
    }
    
    onPostTriggerAutoChange(autoChecked) {
        const tab = this.activeTab;
        this.triggerPostAuto[tab] = autoChecked;
        this.updateSlidersAndReadouts();
    }
    
    getNyquistFrequency(tab) {
        let dt = 1e-5; // default fallback (100kHz sample rate -> 50kHz Nyquist)
        const timeData = tab === 'CH1' ? this.timeData1 : (tab === 'CH2' ? this.timeData2 : this.timeDataMath);
        
        const computeSliceDt = (arr) => {
            if (!arr || arr.length < 2) return null;
            const startT = arr[0];
            const endT = arr[arr.length - 1];
            const totalDuration = endT - startT;
            const timebase = this.HORIZ_VALS[this.currentTimebaseIdx];
            const screenDuration = timebase * 12;
            
            let viewportStartT, viewportEndT;
            if (this.mode === 'realtime') {
                viewportEndT = endT;
                viewportStartT = Math.max(startT, endT - screenDuration);
            } else {
                viewportStartT = startT + (this.horizontalPosition * Math.max(0, totalDuration - screenDuration));
                viewportEndT = viewportStartT + screenDuration;
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
            const anyData = this.timeData1.length > 1 ? this.timeData1 : this.timeData2;
            const anySliceDt = computeSliceDt(anyData);
            if (anySliceDt !== null) {
                dt = anySliceDt;
            }
        }
        return dt > 0 ? 0.5 / dt : 20000;
    }

    onTriggerFreqLowChange(value) {
        const tab = this.activeTab;
        const nyquist = this.getNyquistFrequency(tab);
        const sliderPercent = parseInt(value) / 1000;
        this.triggerFreqLowHz[tab] = sliderPercent * nyquist;
        
        // Keep triggerFreqHighHz >= triggerFreqLowHz
        if (this.triggerFreqHighHz[tab] < this.triggerFreqLowHz[tab]) {
            this.triggerFreqHighHz[tab] = this.triggerFreqLowHz[tab];
        }
        
        this.updateSlidersAndReadouts();
    }

    onTriggerFreqHighChange(value) {
        const tab = this.activeTab;
        const nyquist = this.getNyquistFrequency(tab);
        const sliderPercent = parseInt(value) / 1000;
        this.triggerFreqHighHz[tab] = sliderPercent * nyquist;
        
        // Keep triggerFreqLowHz <= triggerFreqHighHz
        if (this.triggerFreqLowHz[tab] > this.triggerFreqHighHz[tab]) {
            this.triggerFreqLowHz[tab] = this.triggerFreqHighHz[tab];
        }
        
        this.updateSlidersAndReadouts();
    }

    onTriggerFFTLogicChange(value) {
        const tab = this.activeTab;
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
    
    autoCalibrate() {
        this.resetTriggerState();
        if (this.mode === 'realtime') {
            this.verticalOffsetDivCh1 = 0.0;
            this.verticalOffsetDivCh2 = 0.0;
            this.verticalOffsetDivMath = 0.0;
            this.horizontalPosition = 0.0;
        } else {
            this.verticalOffsetDivCh1 = 0.0;
            this.verticalOffsetDivCh2 = 0.0;
            this.verticalOffsetDivMath = 0.0;
            this.horizontalPosition = 0.0;
        }
        
        this.updateSlidersAndReadouts();
        this.drawOscilloscope();
    }
    
    updateSlidersAndReadouts() {
        const timebase = this.HORIZ_VALS[this.currentTimebaseIdx];
        this.timebaseVal.textContent = this.formatTime(timebase);
        this.osdTimebase.textContent = this.formatTime(timebase);
        
        const tab = this.activeTab;
        const isFFT = tab === 'CH1' ? this.fftEnabledCh1 : (tab === 'CH2' ? this.fftEnabledCh2 : this.fftEnabledMath);
        this.osdEnable.checked = tab === 'CH1' ?
            this.osdEnabledCh1 :
            (tab === 'CH2' ? this.osdEnabledCh2 : this.osdEnabledMath);
        
        // Apply vertical base config and labels dynamically based on state
        if (isFFT) {
            this.fftEnable.checked = true;
            if (this.fftVerticalBase === 'dBrms') {
                this.voltbaseLabel.textContent = "FFT Scale (dB/div)";
                this.offsetLabel.textContent = "FFT Ref Level (Offset)";
                const dbDiv = this.getVoltbaseValue(tab);
                this.voltbaseVal.textContent = `${dbDiv} dB/div`;
                
                const refLevel = this.getVerticalOffset(tab) * dbDiv * 5;
                this.offsetValText.textContent = `${refLevel.toFixed(1)} dB`;
            } else {
                this.voltbaseLabel.textContent = "FFT Scale (Vrms/div)";
                this.offsetLabel.textContent = "FFT Shift (Offset)";
                const voltbase = this.getVoltbaseValue(tab);
                this.voltbaseVal.textContent = this.formatVolt(voltbase) + "rms";
                
                const offsetVolts = -this.getVerticalOffset(tab) * voltbase;
                this.offsetValText.textContent = `${offsetVolts.toFixed(3)} Vrms`;
            }
        } else {
            this.fftEnable.checked = false;
            this.voltbaseLabel.textContent = "Voltbase (V/div)";
            this.offsetLabel.textContent = "Position (Offset)";
            const voltbase = this.getVoltbaseValue(tab);
            this.voltbaseVal.textContent = this.formatVolt(voltbase);
            
            const offsetVolts = -this.getVerticalOffset(tab) * voltbase;
            this.offsetValText.textContent = `${offsetVolts.toFixed(3)} V`;
        }
        
        this.voltOffset.value = Math.round(this.getVerticalOffset(tab) * 25);
        this.timeScroll.value = Math.round(this.horizontalPosition * 100);
        
        const mainTimeData = this.timeData1.length > 0 ? this.timeData1 : this.timeData2;
        if (mainTimeData.length > 0) {
            const startT = mainTimeData[0];
            const endT = mainTimeData[mainTimeData.length - 1];
            const totalT = endT - startT;
            const scrollTime = startT + (this.horizontalPosition * Math.max(0, totalT - (timebase * 12)));
            this.scrollValText.textContent = `${scrollTime.toExponential(2)} s`;
        } else {
            this.scrollValText.textContent = `0.00E00 s`;
        }
        
        this.osdSize.textContent = Math.max(this.timeData1.length, this.timeData2.length).toLocaleString();
        
        // Compute trigger volts for all channels using their respective voltbase scales
        ['CH1', 'CH2', 'MATH'].forEach(ch => {
            const vbase = this.getVoltbaseValue(ch);
            this.triggerLowVolts[ch] = this.triggerLowDiv[ch] * vbase;
            this.triggerHighVolts[ch] = this.triggerHighDiv[ch] * vbase;
        });
        
        // Sync the TRIGGER CONTROLS UI controls to the active settings tab's values
        const activeLowVolts = this.triggerLowVolts[tab];
        const activeHighVolts = this.triggerHighVolts[tab];
        
        this.triggerEnable.checked = this.triggerEnabled[tab];
        this.triggerAction.value = this.triggerActionVal[tab];
        
        this.triggerLow.value = Math.round(this.triggerLowDiv[tab] * 25);
        this.triggerHigh.value = Math.round(this.triggerHighDiv[tab] * 25);
        
        // Dynamically adjust labels, units, and slider visibility based on FFT mode
        if (isFFT) {
            if (this.triggerFFTRangeGroup) this.triggerFFTRangeGroup.classList.remove('hide');
            
            const nyquist = this.getNyquistFrequency(tab);
            const formattedMax = this.formatFreq(nyquist);
            if (this.triggerFreqLowMax) this.triggerFreqLowMax.textContent = formattedMax;
            if (this.triggerFreqHighMax) this.triggerFreqHighMax.textContent = formattedMax;
            
            // Clamp and sync values
            if (this.triggerFreqLowHz[tab] > nyquist) this.triggerFreqLowHz[tab] = nyquist;
            if (this.triggerFreqHighHz[tab] > nyquist) this.triggerFreqHighHz[tab] = nyquist;
            
            if (this.triggerFreqLow) {
                this.triggerFreqLow.value = Math.round((this.triggerFreqLowHz[tab] / nyquist) * 1000);
            }
            if (this.triggerFreqLowVal) {
                this.triggerFreqLowVal.textContent = this.formatFreq(this.triggerFreqLowHz[tab]);
            }
            if (this.triggerFreqHigh) {
                this.triggerFreqHigh.value = Math.round((this.triggerFreqHighHz[tab] / nyquist) * 1000);
            }
            if (this.triggerFreqHighVal) {
                this.triggerFreqHighVal.textContent = this.formatFreq(this.triggerFreqHighHz[tab]);
            }
            if (this.triggerFFTLogic) {
                this.triggerFFTLogic.value = this.triggerFFTMatchLogic[tab];
            }
            
            if (this.fftVerticalBase === 'dBrms') {
                if (this.triggerLowLabel) this.triggerLowLabel.textContent = "Low Threshold (dBrms)";
                if (this.triggerHighLabel) this.triggerHighLabel.textContent = "High Threshold (dBrms)";
                this.triggerLowVal.textContent = `${activeLowVolts.toFixed(1)} dBrms`;
                this.triggerHighVal.textContent = `${activeHighVolts.toFixed(1)} dBrms`;
            } else {
                if (this.triggerLowLabel) this.triggerLowLabel.textContent = "Low Threshold (Vrms)";
                if (this.triggerHighLabel) this.triggerHighLabel.textContent = "High Threshold (Vrms)";
                this.triggerLowVal.textContent = `${activeLowVolts.toFixed(3)} Vrms`;
                this.triggerHighVal.textContent = `${activeHighVolts.toFixed(3)} Vrms`;
            }
        } else {
            if (this.triggerFFTRangeGroup) this.triggerFFTRangeGroup.classList.add('hide');
            if (this.triggerLowLabel) this.triggerLowLabel.textContent = "Low Threshold (V_low)";
            if (this.triggerHighLabel) this.triggerHighLabel.textContent = "High Threshold (V_high)";
            this.triggerLowVal.textContent = `${activeLowVolts.toFixed(3)} V`;
            this.triggerHighVal.textContent = `${activeHighVolts.toFixed(3)} V`;
        }
        
        this.triggerSamples.value = this.triggerMinSamples[tab];
        this.triggerSamplesVal.textContent = `${this.triggerMinSamples[tab]} ${this.triggerMinSamples[tab] === 1 ? 'sample' : 'samples'}`;
        
        this.triggerTime.value = Math.round(this.triggerMinTimeSec[tab] * 1000 * 10);
        this.triggerTimeVal.textContent = `${(this.triggerMinTimeSec[tab] * 1000).toFixed(1)} ms`;
        
        let samples_per_div = 200;
        if (mainTimeData.length > 1) {
            const dt = (mainTimeData[mainTimeData.length - 1] - mainTimeData[0]) / (mainTimeData.length - 1);
            if (dt > 0) {
                samples_per_div = timebase / dt;
            }
        }
        
        if (this.triggerPostAuto[tab]) {
            this.triggerPostDelayVal[tab] = Math.round(20 * samples_per_div);
            this.postTriggerDelay.value = this.triggerPostDelayVal[tab];
            this.postTriggerVal.textContent = `Auto (${this.triggerPostDelayVal[tab]} pts)`;
            this.postTriggerAuto.checked = true;
        } else {
            this.postTriggerVal.textContent = `${this.triggerPostDelayVal[tab]} pts`;
            this.postTriggerDelay.value = this.triggerPostDelayVal[tab];
            this.postTriggerAuto.checked = false;
        }
        
        this.renderOSD();
    }
    
    renderOSD() {
        this.osdLeftContainer.innerHTML = '';
        const channels = ['CH1', 'CH2', 'MATH'];
        channels.forEach(ch => {
            let isDisplayed = false;
            let isOSDOn = false;
            if (ch === 'CH1') {
                isDisplayed = this.ch1Enable.checked;
                isOSDOn = this.osdEnabledCh1;
            } else if (ch === 'CH2') {
                isDisplayed = this.ch2Enable.checked;
                isOSDOn = this.osdEnabledCh2;
            } else if (ch === 'MATH') {
                isDisplayed = this.mathEnable.checked;
                isOSDOn = this.osdEnabledMath;
            }
            
            if (isDisplayed && isOSDOn) {
                const isFFT = ch === 'CH1' ? this.fftEnabledCh1 : (ch === 'CH2' ? this.fftEnabledCh2 : this.fftEnabledMath);
                let scaleStr;
                let offsetStr;
                
                if (isFFT) {
                    if (this.fftVerticalBase === 'dBrms') {
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
                    title = `MATH (${this.mathOperation})`;
                }
                
                const block = document.createElement('div');
                block.className = 'osd-col';
                block.setAttribute('style', `
                    color: ${color};
                    border-color: ${borderColor};
                    background-color: ${bgColor};
                    text-shadow: 0 0 3px ${shadowColor};
                    padding: 6px 12px;
                    border-radius: 4px;
                    border: 1px solid ${borderColor};
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
    
    // In-place Radix-2 Cooley-Tukey FFT implementation
    bitReverse(x, numBits) {
        let rev = 0;
        for (let i = 0; i < numBits; i++) {
            rev = (rev << 1) | (x & 1);
            x >>= 1;
        }
        return rev;
    }
    
    cooleyTukeyFFT(real, imag) {
        const N = real.length;
        const numBits = Math.log2(N);
        
        // Bit-reversal permutation
        for (let i = 0; i < N; i++) {
            const rev = this.bitReverse(i, numBits);
            if (i < rev) {
                let tmp = real[i]; real[i] = real[rev]; real[rev] = tmp;
                tmp = imag[i]; imag[i] = imag[rev]; imag[rev] = tmp;
            }
        }
        
        // Iterative stage butterflies
        for (let size = 2; size <= N; size <<= 1) {
            const halfSize = size >> 1;
            const angle = -2 * Math.PI / size;
            const w_step_real = Math.cos(angle);
            const w_step_imag = Math.sin(angle);
            
            for (let i = 0; i < N; i += size) {
                let w_real = 1.0;
                let w_imag = 0.0;
                
                for (let j = 0; j < halfSize; j++) {
                    const k = i + j;
                    const pair = k + halfSize;
                    
                    const t_real = w_real * real[pair] - w_imag * imag[pair];
                    const t_imag = w_real * imag[pair] + w_imag * real[pair];
                    
                    real[pair] = real[k] - t_real;
                    imag[pair] = imag[k] - t_imag;
                    
                    real[k] += t_real;
                    imag[k] += t_imag;
                    
                    const next_w_real = w_real * w_step_real - w_imag * w_step_imag;
                    const next_w_imag = w_real * w_step_imag + w_imag * w_step_real;
                    w_real = next_w_real;
                    w_imag = next_w_imag;
                }
            }
        }
    }
    
    computeFFTSpectrum(volts, dt) {
        const size = volts.length;
        if (size < 16) return null;
        
        // Find maximum power of 2 size <= volts length, capped at 2048
        const exp = Math.floor(Math.log2(size));
        const N = Math.min(2048, Math.pow(2, exp));
        
        const real = new Float32Array(N);
        const imag = new Float32Array(N);
        
        // Window coefficients sum and coherent gain
        let winSum = 0.0;
        const windowCoeffs = new Float32Array(N);
        
        for (let i = 0; i < N; i++) {
            let w = 1.0;
            const arg = (2 * Math.PI * i) / (N - 1);
            
            switch (this.fftWindow) {
                case 'Hanning':
                    w = 0.5 * (1.0 - Math.cos(arg));
                    break;
                case 'Flattop':
                    w = 0.2155789 - 0.4166315 * Math.cos(arg) + 0.2772631 * Math.cos(2 * arg) - 0.0835789 * Math.cos(3 * arg) + 0.0069474 * Math.cos(4 * arg);
                    break;
                case 'Bartlett':
                    w = 1.0 - Math.abs((i - (N - 1) / 2) / ((N - 1) / 2));
                    break;
                case 'Blackman':
                    w = 0.42 - 0.5 * Math.cos(arg) + 0.08 * Math.cos(2 * arg);
                    break;
                case 'Rectangular':
                default:
                    w = 1.0;
                    break;
            }
            windowCoeffs[i] = w;
            winSum += w;
        }
        
        // Apply window function to the voltage slice
        for (let i = 0; i < N; i++) {
            real[i] = volts[i] * windowCoeffs[i];
            imag[i] = 0.0;
        }
        
        // Perform in-place FFT
        this.cooleyTukeyFFT(real, imag);
        
        // Extract single-sided frequency values and amplitude base
        const numBins = N / 2;
        const magnitudes = new Float32Array(numBins);
        const frequencies = new Float32Array(numBins);
        
        const fs = 1.0 / dt;
        const df = fs / N;
        
        for (let k = 0; k < numBins; k++) {
            frequencies[k] = k * df;
            const mag = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
            
            // Peak Magnitude single-sided spectrum calibration
            let peakMag = 0.0;
            if (k === 0) {
                peakMag = mag / winSum;
            } else {
                peakMag = (2.0 * mag) / winSum;
            }
            
            // Convert peak magnitude to RMS
            const v_rms = k === 0 ? peakMag : peakMag / Math.sqrt(2.0);
            
            if (this.fftVerticalBase === 'dBrms') {
                // dB relative to 1.0 Volt RMS
                magnitudes[k] = 20.0 * Math.log10(Math.max(v_rms, 1e-6));
            } else {
                magnitudes[k] = v_rms;
            }
        }
        
        return { frequencies, magnitudes };
    }
    
    drawOscilloscope() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Dark screen background
        this.ctx.fillStyle = '#020502';
        this.ctx.fillRect(0, 0, width, height);
        
        const horizDivs = 12;
        const vertDivs = 10;
        
        const isSplit = this.layoutMode === 'split';
        
        // Inner function to draw a standard CRT subdivision grid inside a viewport clip box
        const drawViewportGrid = (x, y, w, h) => {
            this.ctx.strokeStyle = 'rgba(0, 255, 102, 0.08)';
            this.ctx.lineWidth = 1;
            
            const localDy = h / vertDivs;
            const localDx = w / horizDivs;
            
            // Vertical divisions
            for (let i = 1; i < horizDivs; i++) {
                this.ctx.beginPath();
                if (i === horizDivs / 2) {
                    this.ctx.strokeStyle = 'rgba(0, 255, 102, 0.22)';
                    this.ctx.setLineDash([2, 2]);
                } else {
                    this.ctx.strokeStyle = 'rgba(0, 255, 102, 0.06)';
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
                    this.ctx.strokeStyle = 'rgba(0, 255, 102, 0.22)';
                    this.ctx.setLineDash([2, 2]);
                } else {
                    this.ctx.strokeStyle = 'rgba(0, 255, 102, 0.06)';
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
            if (this.ch2Enable.checked) {
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
            if (!this.ch2Enable.checked) {
                this.drawTrace(3, 0, splitY, width, splitY);
            }
            this.ctx.restore();
            
            // Brighter division bar in middle
            this.ctx.strokeStyle = 'rgba(0, 255, 102, 0.45)';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(0, splitY);
            this.ctx.lineTo(width, splitY);
            this.ctx.stroke();
        }
        
        // Draw physical trigger overlay lines on canvas (Linked to active tab's vertical scale)
        const activeT = this.activeTab;
        const isFFT = activeT === 'CH1' ? this.fftEnabledCh1 : (activeT === 'CH2' ? this.fftEnabledCh2 : this.fftEnabledMath);
        const isChanEnabled = activeT === 'CH1' ? this.ch1Enable.checked : (activeT === 'CH2' ? this.ch2Enable.checked : this.mathEnable.checked);
        
        if (this.triggerEnabled[activeT] && isChanEnabled && !isFFT) {
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
                    else if (activeT === 'MATH') startY = this.ch2Enable.checked ? viewportH : 0;
                    return startY + (viewportH / 2) - (div * (viewportH / 10));
                } else {
                    return (height / 2) - (div * (height / 10));
                }
            };
            
            const lowVolts = this.triggerLowVolts[activeT];
            const highVolts = this.triggerHighVolts[activeT];
            
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
    }
    
    drawTrace(channelId, vx, vy, vw, vh) {
        // Resolve target arrays and settings
        let timeData, voltageData, color, enabled, isFFT, offsetDiv;
        let chanName;
        
        if (channelId === 1) {
            timeData = this.timeData1;
            voltageData = this.voltageData1;
            color = '#00ff66'; // Neon Green
            enabled = this.ch1Enable.checked;
            isFFT = this.fftEnabledCh1;
            offsetDiv = this.verticalOffsetDivCh1;
            chanName = 'CH1';
        } else if (channelId === 2) {
            timeData = this.timeData2;
            voltageData = this.voltageData2;
            color = '#00e5ff'; // Neon Blue
            enabled = this.ch2Enable.checked;
            isFFT = this.fftEnabledCh2;
            offsetDiv = this.verticalOffsetDivCh2;
            chanName = 'CH2';
        } else {
            timeData = this.timeDataMath;
            voltageData = this.voltageDataMath;
            color = '#bd00ff'; // Neon Purple
            enabled = this.mathEnable.checked;
            isFFT = this.fftEnabledMath;
            offsetDiv = this.verticalOffsetDivMath;
            chanName = 'MATH';
        }
        
        if (!enabled || timeData.length === 0) return;
        
        const voltbase = this.getVoltbaseValue(chanName);
        const screenDivs = 10;
        const dy = vh / screenDivs;
        const centerY = vy + vh / 2;
        
        const timebase = this.HORIZ_VALS[this.currentTimebaseIdx];
        const screenDuration = timebase * 12; // 12 divs total horizontal
        
        const startT = timeData[0];
        const endT = timeData[timeData.length - 1];
        const totalDuration = endT - startT;
        
        let viewportStartT, viewportEndT;
        if (this.mode === 'realtime') {
            viewportEndT = endT;
            viewportStartT = Math.max(startT, endT - screenDuration);
        } else {
            viewportStartT = startT + (this.horizontalPosition * Math.max(0, totalDuration - screenDuration));
            viewportEndT = viewportStartT + screenDuration;
        }
        
        // Find visible sample boundaries via Binary Search
        let startIndex = 0;
        let endIndex = timeData.length - 1;
        
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
        
        const visibleCount = endIndex - startIndex + 1;
        if (visibleCount <= 0) return;
        
        // Resolve sampling dt
        const avg_dt = (timeData[endIndex] - timeData[startIndex]) / (endIndex - startIndex);
        
        // --- CHOOSE GRAPH DOMAIN (FFT vs. Time Domain) ---
        if (isFFT) {
            // FREQUENCY SPECTRUM PLOT
            const sliceReal = voltageData.subarray(startIndex, endIndex + 1);
            const fftResult = this.computeFFTSpectrum(sliceReal, avg_dt);
            if (!fftResult) return;
            
            const { frequencies, magnitudes } = fftResult;
            const numBins = magnitudes.length;
            if (numBins <= 0) return;
            
            // horizontal mapping
            const maxFreq = frequencies[numBins - 1];
            const getCanvasXFFT = (f) => {
                return vx + (f / maxFreq) * vw;
            };
            
            // vertical mapping
            const getCanvasYFFT = (m) => {
                if (this.fftVerticalBase === 'dBrms') {
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
            if (this.triggerEnabled[chanName] && chanName === this.activeTab) {
                this.ctx.save();
                this.ctx.lineWidth = 1.0;
                this.ctx.setLineDash([3, 3]);

                // --- 1. Horizontal magnitude threshold lines ---
                const lowL = this.triggerLowVolts[chanName];
                const highL = this.triggerHighVolts[chanName];

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
                const fLow = this.triggerFreqLowHz[chanName];
                const fHigh = this.triggerFreqHighHz[chanName];

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
            
            
            // Render tiny label in viewport for frequency markers
            this.ctx.fillStyle = color;
            this.ctx.font = '10px monospace';
            const lineHeight = 12;
            const textY = vy + vh - (lineHeight * 2.2) - (channelId === 1 ? 0 : (channelId === 2 ? lineHeight : lineHeight * 2));
            const freqDiv = maxFreq / 12;
            this.ctx.fillText(`${chanName} FFT Spectrum: ${this.formatFreq(freqDiv)}/div | Window: ${this.fftWindow}`, vx + 10, textY);
            
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
    
    formatFreq(f) {
        if (f < 1e3) return `${f.toFixed(1)} Hz`;
        if (f < 1e6) return `${(f / 1e3).toFixed(2)} kHz`;
        return `${(f / 1e6).toFixed(2)} MHz`;
    }
    
    initTimeScrollPrecisionScrubbing() {
        let startX = 0, startPos = 0, isDragging = false, hasMoved = false;
        const originalLabel = "Position (Scroll)";
        const labelEl = this.timeScroll.parentElement.querySelector('label');
        
        this.timeScroll.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            isDragging = true;
            this.isCustomDragging = true;
            hasMoved = false;
            startX = e.clientX;
            startPos = this.horizontalPosition;
            this.timeScroll.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        
        this.timeScroll.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            if (!hasMoved && Math.abs(dx) > 4) hasMoved = true;
            
            if (hasMoved) {
                const sliderWidth = this.timeScroll.getBoundingClientRect().width || 1;
                const t = dx / sliderWidth;
                const scale = 2.0;
                const power = 3.0;
                const deltaP = Math.sign(t) * Math.pow(Math.abs(t), power) * scale;
                
                this.horizontalPosition = Math.max(0.0, Math.min(1.0, startPos + deltaP));
                const speedMult = power * Math.pow(Math.abs(t), power - 1) * scale;
                
                if (labelEl) {
                    if (speedMult < 0.9) {
                        const fraction = Math.round(1 / Math.max(0.0001, speedMult));
                        labelEl.textContent = `Position (Scroll - Fine: 1/${fraction}x)`;
                    } else if (speedMult > 1.1) {
                        labelEl.textContent = `Position (Scroll - Fast: ${speedMult.toFixed(1)}x)`;
                    } else {
                        labelEl.textContent = `Position (Scroll: 1.0x)`;
                    }
                }
                
                this.updateSlidersAndReadouts();
                this.drawOscilloscope();
            }
        });
        
        const endDrag = (e) => {
            if (!isDragging) return;
            isDragging = false;
            this.isCustomDragging = false;
            try {
                this.timeScroll.releasePointerCapture(e.pointerId);
            } catch (err) {}
            
            if (labelEl) labelEl.textContent = originalLabel;
            
            if (!hasMoved) {
                const rect = this.timeScroll.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                this.horizontalPosition = Math.max(0, Math.min(1, clickX / (rect.width || 1)));
                this.updateSlidersAndReadouts();
                this.drawOscilloscope();
            }
        };
        
        this.timeScroll.addEventListener('pointerup', endDrag);
        this.timeScroll.addEventListener('pointercancel', endDrag);
    }
}

// Instantiate App on content loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new OscilloscopeApp();
});
