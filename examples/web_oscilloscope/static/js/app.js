// Hantek Oscilloscope SPA - Main Coordinator / Orchestrator Class
// Dual Channel, Math operations, sliding FFT with windowing and scaling

import { DB_DIVS, VERT_VALS, HORIZ_VALS } from './modules/constants.js';
import { DataManager } from './modules/data_manager.js';
import { Triggers } from './modules/triggers.js';
import { ProfileManager } from './modules/profiles.js';
import { Cursors } from './modules/cursors.js';
import { Metrics } from './modules/metrics.js';
import { Renderer } from './modules/renderer.js';

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
        this.screenshotBtn = document.getElementById('screenshot-btn');
        this.streamBtn = document.getElementById('stream-btn');
        
        // Status fields
        this.statusText = document.getElementById('status-text');
        this.sourceText = document.getElementById('source-text');
        this.capturedCount = document.getElementById('captured-count');
        
        // Configuration Profiles DOM elements
        this.profileSelector = document.getElementById('profile-selector');
        this.profileRecallBtn = document.getElementById('profile-recall-btn');
        this.profileSaveBtn = document.getElementById('profile-save-btn');
        this.profileSaveAsBtn = document.getElementById('profile-save-as-btn');
        this.profileDeleteBtn = document.getElementById('profile-delete-btn');
        
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
        
        // Interactive Cursors DOM references
        this.cursorsEnableCheckbox = document.getElementById('cursors-enable');
        this.cursorChannelSelects = document.getElementById('cursor-channel-selects');
        this.cursorCh1Enable = document.getElementById('cursor-ch1-enable');
        this.cursorCh2Enable = document.getElementById('cursor-ch2-enable');
        this.cursorMathEnable = document.getElementById('cursor-math-enable');
        this.cursorCh1Track = document.getElementById('cursor-ch1-track');
        this.cursorCh2Track = document.getElementById('cursor-ch2-track');
        this.cursorMathTrack = document.getElementById('cursor-math-track');
        this.cursorSlidersGroup = document.getElementById('cursor-sliders-group');
        this.cursor1Sliders = document.getElementById('cursor1-sliders');
        this.cursor2Sliders = document.getElementById('cursor2-sliders');
        this.cursor1XSlider = document.getElementById('cursor1-x-slider');
        this.cursor1YSlider = document.getElementById('cursor1-y-slider');
        this.cursor2XSlider = document.getElementById('cursor2-x-slider');
        this.cursor2YSlider = document.getElementById('cursor2-y-slider');
        this.cursorResetBtn = document.getElementById('cursor-reset-btn');
        this.cursorTooltip = document.getElementById('cursor-tooltip');
        this.cursorButtons = document.getElementById('cursor-buttons');

        // Metrics DOM references
        this.metricsCh1Enable = document.getElementById('metrics-ch1-enable');
        this.metricsCh2Enable = document.getElementById('metrics-ch2-enable');
        this.metricsMathEnable = document.getElementById('metrics-math-enable');
        this.metricsLayoutSelector = document.getElementById('metrics-layout-selector');
        this.metricsAutoresetEnable = document.getElementById('metrics-autoreset-enable');
        this.metricsAutoresetSliderGroup = document.getElementById('metrics-autoreset-slider-group');
        this.metricsAutoresetSlider = document.getElementById('metrics-autoreset-slider');
        this.metricsAutoresetVal = document.getElementById('metrics-autoreset-val');
        this.metricsResetBtn = document.getElementById('metrics-reset-btn');

        // Grid Intensity DOM references and state properties
        this.gridIntensitySlider = document.getElementById('grid-intensity');
        this.gridIntensityVal = document.getElementById('grid-intensity-val');
        
        // Display Persistency DOM elements
        this.persistenceModeSelector = document.getElementById('persistence-mode');
        this.persistenceSliderGroup = document.getElementById('persistence-slider-group');
        this.persistenceTimeSlider = document.getElementById('persistence-time');
        this.persistenceTimeVal = document.getElementById('persistence-time-val');

        // State variables - Core
        this.mode = 'playback'; // 'playback' or 'realtime'
        this.displayFrozen = false;
        
        // Active display configuration state
        this.activeTab = 'CH1'; // 'CH1', 'CH2', or 'MATH'
        this.layoutMode = 'overlay'; // 'overlay' or 'split'
        this.mathOperation = 'CH1+CH2';
        
        // Shared global FFT configuration state
        this.fftWindow = 'Hanning'; // 'Rectangular', 'Hanning', 'Flattop', 'Bartlett', 'Blackman'
        this.fftVerticalBase = 'Vrms'; // 'Vrms', 'dBrms'
        
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
        this.VERT_VALS = VERT_VALS;
        this.DB_DIVS = DB_DIVS;
        this.HORIZ_VALS = HORIZ_VALS;

        this.gridIntensity = 25;

        // Display Persistency State Properties
        this.persistenceMode = { 'CH1': 'AUTO', 'CH2': 'AUTO', 'MATH': 'AUTO' };
        this.persistenceTime = { 'CH1': 0.8, 'CH2': 0.8, 'MATH': 0.8 };
        this.persistenceTimeVals = [0.0, 0.2, 0.4, 0.8, 1.0, 2.0, 4.0, 8.0, Infinity];
        this.persistenceHistory = { 'CH1': [], 'CH2': [], 'MATH': [] };
        this.lastPersistenceCaptureTime = { 'CH1': 0, 'CH2': 0, 'MATH': 0 };

        this.lastFFTResult = { 'CH1': null, 'CH2': null, 'MATH': null };

        // Subsystems Instantiation (Mediator pattern)
        this.dataManager = new DataManager(this);
        this.triggers = new Triggers(this);
        this.profileManager = new ProfileManager(this);
        this.cursors = new Cursors(this);
        this.metrics = new Metrics(this);
        this.renderer = new Renderer(this);

        this.init();
    }

    // --- Getters and Setters: Proxying state seamlessly to DataManager ---
    get timeData1() { return this.dataManager.timeData1; }
    set timeData1(val) { this.dataManager.timeData1 = val; }
    get voltageData1() { return this.dataManager.voltageData1; }
    set voltageData1(val) { this.dataManager.voltageData1 = val; }
    get timeData2() { return this.dataManager.timeData2; }
    set timeData2(val) { this.dataManager.timeData2 = val; }
    get voltageData2() { return this.dataManager.voltageData2; }
    set voltageData2(val) { this.dataManager.voltageData2 = val; }
    get timeDataMath() { return this.dataManager.timeDataMath; }
    set timeDataMath(val) { this.dataManager.timeDataMath = val; }
    get voltageDataMath() { return this.dataManager.voltageDataMath; }
    set voltageDataMath(val) { this.dataManager.voltageDataMath = val; }

    get fileLoadedCh1() { return this.dataManager.fileLoadedCh1; }
    set fileLoadedCh1(val) { this.dataManager.fileLoadedCh1 = val; }
    get fileLoadedCh2() { return this.dataManager.fileLoadedCh2; }
    set fileLoadedCh2(val) { this.dataManager.fileLoadedCh2 = val; }

    get timebaseHeaderCh1() { return this.dataManager.timebaseHeaderCh1; }
    set timebaseHeaderCh1(val) { this.dataManager.timebaseHeaderCh1 = val; }
    get voltbaseHeaderCh1() { return this.dataManager.voltbaseHeaderCh1; }
    set voltbaseHeaderCh1(val) { this.dataManager.voltbaseHeaderCh1 = val; }
    get timebaseHeaderCh2() { return this.dataManager.timebaseHeaderCh2; }
    set timebaseHeaderCh2(val) { this.dataManager.timebaseHeaderCh2 = val; }
    get voltbaseHeaderCh2() { return this.dataManager.voltbaseHeaderCh2; }
    set voltbaseHeaderCh2(val) { this.dataManager.voltbaseHeaderCh2 = val; }

    get playbackPlaying() { return this.dataManager.playbackPlaying; }
    set playbackPlaying(val) { this.dataManager.playbackPlaying = val; }
    get playbackFileHasGaps() { return this.dataManager.playbackFileHasGaps; }
    set playbackFileHasGaps(val) { this.dataManager.playbackFileHasGaps = val; }
    get playbackFileDtAvg() { return this.dataManager.playbackFileDtAvg; }
    set playbackFileDtAvg(val) { this.dataManager.playbackFileDtAvg = val; }
    get playbackFrameId() { return this.dataManager.playbackFrameId; }
    set playbackFrameId(val) { this.dataManager.playbackFrameId = val; }
    get playbackSpeed() { return this.dataManager.playbackSpeed; }
    set playbackSpeed(val) { this.dataManager.playbackSpeed = val; }
    get lastFrameTime() { return this.dataManager.lastFrameTime; }
    set lastFrameTime(val) { this.dataManager.lastFrameTime = val; }

    get isLiveStreaming() { return this.dataManager.isLiveStreaming; }
    set isLiveStreaming(val) { this.dataManager.isLiveStreaming = val; }
    get websocketCh1() { return this.dataManager.websocketCh1; }
    set websocketCh1(val) { this.dataManager.websocketCh1 = val; }
    get websocketCh2() { return this.dataManager.websocketCh2; }
    set websocketCh2(val) { this.dataManager.websocketCh2 = val; }
    get streamSessionId() { return this.dataManager.streamSessionId; }
    set streamSessionId(val) { this.dataManager.streamSessionId = val; }

    get isRecording() { return this.dataManager.isRecording; }
    set isRecording(val) { this.dataManager.isRecording = val; }
    get recordingChunksCh1() { return this.dataManager.recordingChunksCh1; }
    set recordingChunksCh1(val) { this.dataManager.recordingChunksCh1 = val; }
    get recordingChunksCh2() { return this.dataManager.recordingChunksCh2; }
    set recordingChunksCh2(val) { this.dataManager.recordingChunksCh2 = val; }
    get totalRecordingSamplesCh1() { return this.dataManager.totalRecordingSamplesCh1; }
    set totalRecordingSamplesCh1(val) { this.dataManager.totalRecordingSamplesCh1 = val; }
    get totalRecordingSamplesCh2() { return this.dataManager.totalRecordingSamplesCh2; }
    set totalRecordingSamplesCh2(val) { this.dataManager.totalRecordingSamplesCh2 = val; }
    get selectedRecordingNameBase() { return this.dataManager.selectedRecordingNameBase; }
    set selectedRecordingNameBase(val) { this.dataManager.selectedRecordingNameBase = val; }

    // --- Getters and Setters: Proxying state seamlessly to Triggers ---
    get triggerEnabled() { return this.triggers.triggerEnabled; }
    set triggerEnabled(val) { this.triggers.triggerEnabled = val; }
    get triggerActionVal() { return this.triggers.triggerActionVal; }
    set triggerActionVal(val) { this.triggers.triggerActionVal = val; }
    get triggerLowDiv() { return this.triggers.triggerLowDiv; }
    set triggerLowDiv(val) { this.triggers.triggerLowDiv = val; }
    get triggerHighDiv() { return this.triggers.triggerHighDiv; }
    set triggerHighDiv(val) { this.triggers.triggerHighDiv = val; }
    get triggerMinSamples() { return this.triggers.triggerMinSamples; }
    set triggerMinSamples(val) { this.triggers.triggerMinSamples = val; }
    get triggerMinTimeSec() { return this.triggers.triggerMinTimeSec; }
    set triggerMinTimeSec(val) { this.triggers.triggerMinTimeSec = val; }
    get triggerPostDelayVal() { return this.triggers.triggerPostDelayVal; }
    set triggerPostDelayVal(val) { this.triggers.triggerPostDelayVal = val; }
    get triggerPostAuto() { return this.triggers.triggerPostAuto; }
    set triggerPostAuto(val) { this.triggers.triggerPostAuto = val; }
    get triggerFreqLowHz() { return this.triggers.triggerFreqLowHz; }
    set triggerFreqLowHz(val) { this.triggers.triggerFreqLowHz = val; }
    get triggerFreqHighHz() { return this.triggers.triggerFreqHighHz; }
    set triggerFreqHighHz(val) { this.triggers.triggerFreqHighHz = val; }
    get triggerFFTMatchLogic() { return this.triggers.triggerFFTMatchLogic; }
    set triggerFFTMatchLogic(val) { this.triggers.triggerFFTMatchLogic = val; }
    get triggerLowVolts() { return this.triggers.triggerLowVolts; }
    set triggerLowVolts(val) { this.triggers.triggerLowVolts = val; }
    get triggerHighVolts() { return this.triggers.triggerHighVolts; }
    set triggerHighVolts(val) { this.triggers.triggerHighVolts = val; }

    get isTriggered() { return this.triggers.isTriggered; }
    set isTriggered(val) { this.triggers.isTriggered = val; }
    get triggerSourceChannel() { return this.triggers.triggerSourceChannel; }
    set triggerSourceChannel(val) { this.triggers.triggerSourceChannel = val; }
    get postTriggerCounter() { return this.triggers.postTriggerCounter; }
    set postTriggerCounter(val) { this.triggers.postTriggerCounter = val; }
    get consecutiveOutsideSamples() { return this.triggers.consecutiveOutsideSamples; }
    set consecutiveOutsideSamples(val) { this.triggers.consecutiveOutsideSamples = val; }
    get triggerStartTime() { return this.triggers.triggerStartTime; }
    set triggerStartTime(val) { this.triggers.triggerStartTime = val; }

    // --- Getters and Setters: Proxying state seamlessly to Cursors ---
    get cursorsEnabled() { return this.cursors.cursorsEnabled; }
    set cursorsEnabled(val) { this.cursors.cursorsEnabled = val; }
    get cursorChEnabled() { return this.cursors.cursorChEnabled; }
    set cursorChEnabled(val) { this.cursors.cursorChEnabled = val; }
    get cursorTrackingMode() { return this.cursors.cursorTrackingMode; }
    set cursorTrackingMode(val) { this.cursors.cursorTrackingMode = val; }
    get cursor1() { return this.cursors.cursor1; }
    set cursor1(val) { this.cursors.cursor1 = val; }
    get cursor2() { return this.cursors.cursor2; }
    set cursor2(val) { this.cursors.cursor2 = val; }
    get tempCursor() { return this.cursors.tempCursor; }
    set tempCursor(val) { this.cursors.tempCursor = val; }

    // --- Getters and Setters: Proxying state seamlessly to Metrics ---
    get metricsEnabledCh1() { return this.metrics.metricsEnabledCh1; }
    set metricsEnabledCh1(val) { this.metrics.metricsEnabledCh1 = val; }
    get metricsEnabledCh2() { return this.metrics.metricsEnabledCh2; }
    set metricsEnabledCh2(val) { this.metrics.metricsEnabledCh2 = val; }
    get metricsEnabledMath() { return this.metrics.metricsEnabledMath; }
    set metricsEnabledMath(val) { this.metrics.metricsEnabledMath = val; }
    get metricsLayout() { return this.metrics.metricsLayout; }
    set metricsLayout(val) { this.metrics.metricsLayout = val; }
    get metricsAutoResetEnabled() { return this.metrics.metricsAutoResetEnabled; }
    set metricsAutoResetEnabled(val) { this.metrics.metricsAutoResetEnabled = val; }
    get metricsAutoResetMult() { return this.metrics.metricsAutoResetMult; }
    set metricsAutoResetMult(val) { this.metrics.metricsAutoResetMult = val; }
    get metricsAccumulator() { return this.metrics.metricsAccumulator; }
    set metricsAccumulator(val) { this.metrics.metricsAccumulator = val; }
    get maxProcessedTime() { return this.metrics.maxProcessedTime; }
    set maxProcessedTime(val) { this.metrics.maxProcessedTime = val; }

    // --- Main Initializer and Event Hookups ---
    init() {
        // Initialize submodules that require separate init steps
        this.renderer.init();
        this.cursors.init();
        this.metrics.init();

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
        this.screenshotBtn.addEventListener('click', () => this.takeScreenshot());
        this.streamBtn.addEventListener('click', () => this.navigateToStream());
        
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
        
        // Display Persistency Controls
        if (this.persistenceModeSelector) {
            this.persistenceModeSelector.addEventListener('change', (e) => this.onPersistenceModeChange(e.target.value));
        }
        if (this.persistenceTimeSlider) {
            this.persistenceTimeSlider.addEventListener('input', (e) => this.onPersistenceTimeChange(parseInt(e.target.value)));
        }
        
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
        
        // Initialize Metrics listeners
        if (this.metricsCh1Enable) {
            this.metricsCh1Enable.addEventListener('change', (e) => {
                this.metricsEnabledCh1 = e.target.checked;
                this.drawOscilloscope();
            });
        }
        if (this.metricsCh2Enable) {
            this.metricsCh2Enable.addEventListener('change', (e) => {
                this.metricsEnabledCh2 = e.target.checked;
                this.drawOscilloscope();
            });
        }
        if (this.metricsMathEnable) {
            this.metricsMathEnable.addEventListener('change', (e) => {
                this.metricsEnabledMath = e.target.checked;
                this.drawOscilloscope();
            });
        }
        if (this.metricsLayoutSelector) {
            this.metricsLayoutSelector.addEventListener('change', (e) => {
                this.metricsLayout = e.target.value;
                this.drawOscilloscope();
            });
        }
        if (this.metricsAutoresetEnable) {
            this.metricsAutoresetEnable.addEventListener('change', (e) => {
                this.metricsAutoResetEnabled = e.target.checked;
                if (this.metricsAutoresetSliderGroup) {
                    this.metricsAutoresetSliderGroup.style.display = e.target.checked ? 'block' : 'none';
                }
                this.updateMetricsSliderLabel();
                this.drawOscilloscope();
            });
        }
        if (this.metricsAutoresetSlider) {
            this.metricsAutoresetSlider.addEventListener('input', (e) => {
                const idx = parseInt(e.target.value, 10);
                const mults = [1, 2, 4, 8, 16, 32];
                this.metricsAutoResetMult = mults[idx];
                this.updateMetricsSliderLabel();
                this.drawOscilloscope();
            });
        }
        if (this.metricsResetBtn) {
            this.metricsResetBtn.addEventListener('click', () => {
                this.resetMetrics();
                this.drawOscilloscope();
            });
        }

        // Grid Intensity Slider Listener
        if (this.gridIntensitySlider) {
            this.gridIntensitySlider.addEventListener('input', (e) => {
                this.gridIntensity = parseInt(e.target.value);
                if (this.gridIntensityVal) {
                    this.gridIntensityVal.textContent = `${this.gridIntensity}%`;
                }
                this.drawOscilloscope();
            });
        }

        // Profile configurations listeners
        if (this.profileRecallBtn) {
            this.profileRecallBtn.addEventListener('click', () => {
                this.recallProfile(this.profileSelector.value);
            });
        }
        if (this.profileSaveBtn) {
            this.profileSaveBtn.addEventListener('click', () => {
                this.onProfileSavePressed();
            });
        }
        if (this.profileSaveAsBtn) {
            this.profileSaveAsBtn.addEventListener('click', () => {
                this.onProfileSaveAsPressed();
            });
        }
        if (this.profileDeleteBtn) {
            this.profileDeleteBtn.addEventListener('click', () => {
                this.onProfileDeletePressed();
            });
        }

        // Sync initial UI display
        if (this.metricsAutoresetEnable && this.metricsAutoresetSliderGroup) {
            this.metricsAutoresetSliderGroup.style.display = this.metricsAutoResetEnabled ? 'block' : 'none';
            this.updateMetricsSliderLabel();
        }

        // Load profiles from localStorage
        this.loadProfiles();

        // Perform a complete reset of all controls/inputs to default values on page reload
        this.resetAllControlsToDefaults();

        // Load default mock waveforms on startup
        this.loadDefaultMockWaveforms();
        
        // Synchronize layout UI
        this.onModeChange();
        this.drawOscilloscope();
    }

    resizeCanvas() {
        if (!this.canvas) return;
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

    async onModeChange() {
        this.mode = this.modeSelector.value;
        await this.stopAllActivities();
        
        if (this.mode === 'realtime') {
            this.fileSelectGroup.classList.add('hide');
            this.speedControlGroup.classList.add('hide');
            this.recordBtn.classList.remove('hide');
            this.freezeBtn.classList.remove('hide');
            this.screenshotBtn.classList.remove('hide');
            this.streamBtn.classList.remove('hide');
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
            this.screenshotBtn.classList.add('hide');
            this.streamBtn.classList.add('hide');
            this.playBtn.classList.remove('hide');
            this.loadDefaultMockWaveforms();
        }
        this.drawOscilloscope();
    }

    async stopAllActivities() {
        this.playbackPlaying = false;
        if (this.playbackFrameId) {
            cancelAnimationFrame(this.playbackFrameId);
            this.playbackFrameId = null;
        }
        this.playBtn.textContent = "Play";
        this.playBtn.className = "btn btn-green";
        
        if (this.isLiveStreaming) {
            await this.stopLiveStreaming();
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

    adjustTimebase(direction) {
        const nextIdx = this.currentTimebaseIdx + direction;
        if (nextIdx >= 0 && nextIdx < this.HORIZ_VALS.length) {
            this.currentTimebaseIdx = nextIdx;
            this.persistenceHistory['CH1'] = [];
            this.persistenceHistory['CH2'] = [];
            this.persistenceHistory['MATH'] = [];
            this.updateSlidersAndReadouts();
            this.drawOscilloscope();
        }
    }

    adjustVoltbase(direction) {
        const tab = this.activeTab;
        const isFFT = tab === 'CH1' ? this.fftEnabledCh1 : (tab === 'CH2' ? this.fftEnabledCh2 : this.fftEnabledMath);
        
        if (isFFT && this.fftVerticalBase === 'dBrms') {
            let idx = this.DB_DIVS.indexOf(this.getVoltbaseValue(tab));
            if (idx === -1) idx = 3; // default 10dB
            const nextIdx = idx + direction;
            if (nextIdx >= 0 && nextIdx < this.DB_DIVS.length) {
                this.setVoltbaseIdx(tab, nextIdx);
                this.persistenceHistory[tab] = [];
            }
        } else {
            const idx = this.getVoltbaseIdx(tab);
            const nextIdx = idx + direction;
            if (nextIdx >= 0 && nextIdx < this.VERT_VALS.length) {
                this.setVoltbaseIdx(tab, nextIdx);
                this.persistenceHistory[tab] = [];
            }
        }
        this.updateSlidersAndReadouts();
        this.drawOscilloscope();
    }

    setVoltbaseIdx(channel, idx) {
        if (channel === 'CH1') this.currentVoltbaseIdxCh1 = idx;
        else if (channel === 'CH2') this.currentVoltbaseIdxCh2 = idx;
        else this.currentVoltbaseIdxMath = idx;
    }

    setVerticalOffset(channel, val) {
        if (channel === 'CH1') this.verticalOffsetDivCh1 = val;
        else if (channel === 'CH2') this.verticalOffsetDivCh2 = val;
        else this.verticalOffsetDivMath = val;
    }

    onTimeScroll(value) {
        if (this.isCustomDragging) return;
        this.horizontalPosition = parseFloat(value) / 100;
        this.persistenceHistory['CH1'] = [];
        this.persistenceHistory['CH2'] = [];
        this.persistenceHistory['MATH'] = [];
        this.updateSlidersAndReadouts();
        this.drawOscilloscope();
    }

    onVoltOffset(value) {
        const tab = this.activeTab;
        this.setVerticalOffset(tab, parseFloat(value) / 25);
        this.persistenceHistory[tab] = [];
        this.updateSlidersAndReadouts();
        this.drawOscilloscope();
    }

    onPersistenceModeChange(value) {
        const tab = this.activeTab;
        this.persistenceMode[tab] = value;
        this.persistenceHistory[tab] = [];
        this.updateSlidersAndReadouts();
        this.drawOscilloscope();
    }

    onPersistenceTimeChange(index) {
        const tab = this.activeTab;
        this.persistenceTime[tab] = this.persistenceTimeVals[index];
        this.updateSlidersAndReadouts();
        this.drawOscilloscope();
    }

    updateSlidersAndReadouts() {
        if (!this.triggerLowVolts) {
            this.triggerLowVolts = { 'CH1': -1.0, 'CH2': -1.0, 'MATH': -1.0 };
        }
        if (!this.triggerHighVolts) {
            this.triggerHighVolts = { 'CH1': 1.0, 'CH2': 1.0, 'MATH': 1.0 };
        }
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
        
        if (this.gridIntensitySlider) {
            this.gridIntensitySlider.value = this.gridIntensity;
        }
        if (this.gridIntensityVal) {
            this.gridIntensityVal.textContent = `${this.gridIntensity}%`;
        }
        
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

        // Sync Display Persistency UI controls
        if (this.persistenceModeSelector) {
            this.persistenceModeSelector.value = this.persistenceMode[tab] || 'AUTO';
        }
        if (this.persistenceSliderGroup) {
            if (this.persistenceMode[tab] === 'MANUAL') {
                this.persistenceSliderGroup.style.display = 'block';
                const currentVal = this.persistenceTime[tab];
                let matchedIndex = this.persistenceTimeVals.indexOf(currentVal);
                if (matchedIndex === -1) {
                    matchedIndex = 3; // Default to 0.8s
                }
                this.persistenceTimeSlider.value = matchedIndex;
                
                let valStr = `${currentVal}s`;
                if (currentVal === 0.0) {
                    valStr = '0s (Off)';
                } else if (currentVal === Infinity) {
                    valStr = 'inf';
                }
                if (this.persistenceTimeVal) {
                    this.persistenceTimeVal.textContent = valStr;
                }
            } else {
                this.persistenceSliderGroup.style.display = 'none';
            }
        }
        
        this.updateMetricsSliderLabel();
        this.renderOSD();
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

    async autoCalibrate() {
        this.resetTriggerState();
        if (this.mode === 'realtime') {
            this.verticalOffsetDivCh1 = 0.0;
            this.verticalOffsetDivCh2 = 0.0;
            this.verticalOffsetDivMath = 0.0;
            this.horizontalPosition = 0.0;
            
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
                console.error("Failed to pre-fetch settings on autocalibrate:", err);
            }
        } else {
            this.verticalOffsetDivCh1 = 0.0;
            this.verticalOffsetDivCh2 = 0.0;
            this.verticalOffsetDivMath = 0.0;
            this.horizontalPosition = 0.0;
        }
        
        this.updateSlidersAndReadouts();
        this.drawOscilloscope();
    }

    async takeScreenshot() {
        if (this.screenshotBtn.disabled) return;
        this.screenshotBtn.disabled = true;
        const originalText = this.screenshotBtn.textContent;
        this.screenshotBtn.textContent = "Capturing...";
        this.screenshotBtn.style.opacity = "0.7";
        
        try {
            const response = await fetch('/api/screenshot');
            if (!response.ok) {
                throw new Error("Screenshot capture failed");
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dso_screenshot_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            
            this.statusText.textContent = "Screenshot saved!";
            this.statusText.className = "status-ok";
        } catch (error) {
            console.error(error);
            this.statusText.textContent = "Capture Error";
            this.statusText.className = "status-error";
            alert("Error: " + error.message);
        } finally {
            this.screenshotBtn.disabled = false;
            this.screenshotBtn.textContent = originalText;
            this.screenshotBtn.style.opacity = "";
        }
    }

    async navigateToStream() {
        await this.stopAllActivities();
        window.location.href = "/screenshot-stream";
    }

    // --- Subsystem bridges / delegation endpoints ---
    
    // DataManager delegations
    onLocalFileSelected(e, channel) { return this.dataManager.onLocalFileSelected(e, channel); }
    loadDefaultMockWaveforms() { return this.dataManager.loadDefaultMockWaveforms(); }
    parseCSV(csvText, channel) { return this.dataManager.parseCSV(csvText, channel); }
    syncTimebase(tbSeconds) { return this.dataManager.syncTimebase(tbSeconds); }
    syncVoltbase(channel, vbVolts) { return this.dataManager.syncVoltbase(channel, vbVolts); }
    interpolateCH2(t) { return this.dataManager.interpolateCH2(t); }
    recalculateMath() { return this.dataManager.recalculateMath(); }
    handleWSDisconnect() { return this.dataManager.handleWSDisconnect(); }
    onRecordBtnPressed() { return this.dataManager.onRecordBtnPressed(); }
    triggerBlobDownload(blob, filename) { return this.dataManager.triggerBlobDownload(blob, filename); }
    appendLiveCSV(csvChunk, channel) { return this.dataManager.appendLiveCSV(csvChunk, channel); }
    togglePlaybackPlay() { return this.dataManager.togglePlaybackPlay(); }
    onPlaybackSpeedChange(value) { return this.dataManager.onPlaybackSpeedChange(value); }
    getPlaybackViewport(timeData, targetT, screenDuration) { return this.dataManager.getPlaybackViewport(timeData, targetT, screenDuration); }
    playbackLoop() { return this.dataManager.playbackLoop(); }
    startLiveStreaming() { return this.dataManager.startLiveStreaming(); }
    stopLiveStreaming() { return this.dataManager.stopLiveStreaming(); }

    // Triggers delegations
    onTriggerEnableChange(enabled) { return this.triggers.onTriggerEnableChange(enabled); }
    onTriggerActionChange(act) { return this.triggers.onTriggerActionChange(act); }
    onTriggerLowChange(value) { return this.triggers.onTriggerLowChange(value); }
    onTriggerHighChange(value) { return this.triggers.onTriggerHighChange(value); }
    onTriggerSamplesChange(value) { return this.triggers.onTriggerSamplesChange(value); }
    onTriggerTimeChange(value) { return this.triggers.onTriggerTimeChange(value); }
    onPostTriggerDelayChange(value) { return this.triggers.onPostTriggerDelayChange(value); }
    onPostTriggerAutoChange(autoChecked) { return this.triggers.onPostTriggerAutoChange(autoChecked); }
    getNyquistFrequency(tab) { return this.triggers.getNyquistFrequency(tab); }
    onTriggerFreqLowChange(value) { return this.triggers.onTriggerFreqLowChange(value); }
    onTriggerFreqHighChange(value) { return this.triggers.onTriggerFreqHighChange(value); }
    onTriggerFFTLogicChange(value) { return this.triggers.onTriggerFFTLogicChange(value); }
    resetTriggerState() { return this.triggers.resetTriggerState(); }
    evaluateRealtimeTriggers(channel, newPoints) { return this.triggers.evaluateRealtimeTriggers(channel, newPoints); }
    checkChannelTrigger(chKey, pointsCount, timeArray, voltArray) { return this.triggers.checkChannelTrigger(chKey, pointsCount, timeArray, voltArray); }
    evaluatePlaybackTriggers(viewportStartT, viewportEndT) { return this.triggers.evaluatePlaybackTriggers(viewportStartT, viewportEndT); }
    checkPlaybackChannelTrigger(chKey, timeArray, voltArray, viewportStartT, viewportEndT) { return this.triggers.checkPlaybackChannelTrigger(chKey, timeArray, voltArray, viewportStartT, viewportEndT); }
    checkFFTChannelTrigger(chKey, timeArray, voltArray, isPlayback, viewportStartT, viewportEndT) { return this.triggers.checkFFTChannelTrigger(chKey, timeArray, voltArray, isPlayback, viewportStartT, viewportEndT); }

    // Cursors delegations
    initCursors() { return this.cursors.initCursors(); }
    updateCursorCSS() { return this.cursors.updateCursorCSS(); }
    resetCursors() { return this.cursors.resetCursors(); }
    updateCursorUIVisibility() { return this.cursors.updateCursorUIVisibility(); }
    syncCursorSliders() { return this.cursors.syncCursorSliders(); }
    recalculateCursorCoords(cursor) { return this.cursors.recalculateCursorCoords(cursor); }
    drawCursors() { return this.cursors.drawCursors(); }
    drawSingleCursor(cursor, color, label) { return this.cursors.drawSingleCursor(cursor, color, label); }
    updateCursorTooltip() { return this.cursors.updateCursorTooltip(); }

    // Metrics delegations
    getMetricsEnabled(channel) { return this.metrics.getMetricsEnabled(channel); }
    updateMetricsSliderLabel() { return this.metrics.updateMetricsSliderLabel(); }
    resetMetrics() { return this.metrics.resetMetrics(); }
    resetChannelMetrics(channel) { return this.metrics.resetChannelMetrics(channel); }
    getViewportTimeRange() { return this.metrics.getViewportTimeRange(); }
    getViewportSampleBounds(timeData, startT, endT) { return this.metrics.getViewportSampleBounds(timeData, startT, endT); }
    processMetrics() { return this.metrics.processMetrics(); }
    drawMetrics(width, height, fullWidth) { return this.metrics.drawMetrics(width, height, fullWidth); }
    drawBottomOverlayMetrics(width, height) { return this.metrics.drawBottomOverlayMetrics(width, height); }
    drawRightSplitMetrics(width, height, fullWidth) { return this.metrics.drawRightSplitMetrics(width, height, fullWidth); }
    drawRoundRect(ctx, x, y, w, h, r) { return this.metrics.drawRoundRect(ctx, x, y, w, h, r); }

    // ProfileManager delegations
    loadProfiles() { return this.profileManager.loadProfiles(); }
    updateProfileSelectorOptions() { return this.profileManager.updateProfileSelectorOptions(); }
    resetAllControlsToDefaults() { return this.profileManager.resetAllControlsToDefaults(); }
    applyProfile(p) { return this.profileManager.applyProfile(p); }
    saveProfile(name) { return this.profileManager.saveProfile(name); }
    recallProfile(name) { return this.profileManager.recallProfile(name); }
    onProfileSavePressed() { return this.profileManager.onProfileSavePressed(); }
    onProfileSaveAsPressed() { return this.profileManager.onProfileSaveAsPressed(); }
    onProfileDeletePressed() { return this.profileManager.onProfileDeletePressed(); }

    // Renderer delegations
    drawOscilloscope() { return this.renderer.drawOscilloscope(); }
    drawTrace(channelId, vx, vy, vw, vh, overrideTimeData = null, overrideVoltageData = null, overrideAlpha = null, overrideViewportStartT = null, overrideScreenDuration = null) {
        return this.renderer.drawTrace(channelId, vx, vy, vw, vh, overrideTimeData, overrideVoltageData, overrideAlpha, overrideViewportStartT, overrideScreenDuration);
    }
    renderOSD() { return this.renderer.renderOSD(); }
    getVoltbaseIdx(channel) { return this.renderer.getVoltbaseIdx(channel); }
    getVoltbaseValue(channel) { return this.renderer.getVoltbaseValue(channel); }
    getVerticalOffset(channel) { return this.renderer.getVerticalOffset(channel); }
    getChannelViewport(channelName) { return this.renderer.getChannelViewport(channelName); }
    getChannelFFTEnabled(channelName) { return this.renderer.getChannelFFTEnabled(channelName); }
    getChannelEnabled(channelName) { return this.renderer.getChannelEnabled(channelName); }
    getChannelColor(channelName) { return this.renderer.getChannelColor(channelName); }
    getWaveWidth() { return this.renderer.getWaveWidth(); }
    getPersistenceDuration(chanName) { return this.renderer.getPersistenceDuration(chanName); }
    canvasXToTime(cx) { return this.renderer.canvasXToTime(cx); }
    canvasXToFreq(cx, channelName) { return this.renderer.canvasXToFreq(cx, channelName); }
    canvasYToChannelValue(cy, channelName) { return this.renderer.canvasYToChannelValue(cy, channelName); }
    timeToCanvasX(t) { return this.renderer.timeToCanvasX(t); }
    freqToCanvasX(f, channelName) { return this.renderer.freqToCanvasX(f, channelName); }
    channelValueToCanvasY(val, channelName) { return this.renderer.channelValueToCanvasY(val, channelName); }
    getChannelValueAtX(channelName, xVal) { return this.renderer.getChannelValueAtX(channelName, xVal); }
    formatTime(t) { return this.renderer.formatTime(t); }
    formatVolt(v) { return this.renderer.formatVolt(v); }
    formatFreq(f) { return this.renderer.formatFreq(f); }
    formatVoltage(v, isFFT) { return this.renderer.formatVoltage(v, isFFT); }
}

// Instantiate App on content loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new OscilloscopeApp();
});
