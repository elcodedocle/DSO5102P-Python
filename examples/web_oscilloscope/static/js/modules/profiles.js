// Profile Manager Module for Hantek Oscilloscope SPA
// Handles saving, loading, applying, and deleting configuration profiles from localStorage

export class ProfileManager {
    constructor(app) {
        this.app = app;
        this.profiles = {};
    }

    loadProfiles() {
        try {
            const stored = localStorage.getItem('hantek_dso_profiles');
            if (stored) {
                this.profiles = JSON.parse(stored);
            } else {
                this.profiles = {};
            }
        } catch (e) {
            console.error("Failed to load profiles from localStorage", e);
            this.profiles = {};
        }
        this.updateProfileSelectorOptions();
    }

    updateProfileSelectorOptions() {
        if (!this.app.profileSelector) return;
        
        // Clear except placeholder
        this.app.profileSelector.innerHTML = '<option value="">-- Select Profile --</option>';
        
        const sortedNames = Object.keys(this.profiles).sort();
        sortedNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            this.app.profileSelector.appendChild(option);
        });
    }

    resetAllControlsToDefaults() {
        const defaultProfile = {
            mode: 'playback',
            activeTab: 'CH1',
            ch1Enable: true,
            ch2Enable: true,
            mathEnable: false,
            layoutMode: 'overlay',
            gridIntensity: 25,
            currentTimebaseIdx: 18,
            horizontalPosition: 0.0,
            playbackSpeed: 1.0,
            playbackSpeedSliderValue: 40,
            
            currentVoltbaseIdxCh1: 10,
            currentVoltbaseIdxCh2: 10,
            currentVoltbaseIdxMath: 10,
            verticalOffsetDivCh1: 0.0,
            verticalOffsetDivCh2: 0.0,
            verticalOffsetDivMath: 0.0,
            mathOperation: 'CH1+CH2',
            
            fftEnabledCh1: false,
            fftEnabledCh2: false,
            fftEnabledMath: false,
            fftWindow: 'Hanning',
            fftVerticalBase: 'Vrms',
            
            osdEnabledCh1: true,
            osdEnabledCh2: true,
            osdEnabledMath: true,
            
            triggerEnabled: { 'CH1': false, 'CH2': false, 'MATH': false },
            triggerActionVal: { 'CH1': 'pause', 'CH2': 'pause', 'MATH': 'pause' },
            triggerLowDiv: { 'CH1': -1.0, 'CH2': -1.0, 'MATH': -1.0 },
            triggerHighDiv: { 'CH1': 1.0, 'CH2': 1.0, 'MATH': 1.0 },
            triggerMinSamples: { 'CH1': 1, 'CH2': 1, 'MATH': 1 },
            triggerMinTimeSec: { 'CH1': 0.0, 'CH2': 0.0, 'MATH': 0.0 },
            triggerPostDelayVal: { 'CH1': 1600, 'CH2': 1600, 'MATH': 1600 },
            triggerPostAuto: { 'CH1': true, 'CH2': true, 'MATH': true },
            triggerFreqLowHz: { 'CH1': 100.0, 'CH2': 150.0, 'MATH': 120.0 },
            triggerFreqHighHz: { 'CH1': 1000.0, 'CH2': 1500.0, 'MATH': 1200.0 },
            triggerFFTMatchLogic: { 'CH1': 'any', 'CH2': 'any', 'MATH': 'any' },
            
            cursorsEnabled: false,
            cursorChEnabled: { 'CH1': true, 'CH2': true, 'MATH': true },
            cursorTrackingMode: { 'CH1': 'free', 'CH2': 'free', 'MATH': 'free' },
            cursor1: null,
            cursor2: null,
            
            metricsEnabledCh1: false,
            metricsEnabledCh2: false,
            metricsEnabledMath: false,
            metricsLayout: 'bottom_overlay',
            metricsAutoResetEnabled: false,
            metricsAutoResetMult: 1
        };
        
        this.applyProfile(defaultProfile);
        
        // Reset selected index of the dropdown as well
        if (this.app.profileSelector) {
            this.app.profileSelector.value = "";
        }
    }

    applyProfile(p) {
        // Core states
        this.app.mode = p.mode;
        this.app.activeTab = p.activeTab || 'CH1';
        this.app.layoutMode = p.layoutMode;
        this.app.gridIntensity = p.gridIntensity;
        this.app.currentTimebaseIdx = p.currentTimebaseIdx;
        this.app.horizontalPosition = p.horizontalPosition;
        
        // Enable checkboxes
        this.app.ch1Enable.checked = p.ch1Enable;
        this.app.ch2Enable.checked = p.ch2Enable;
        this.app.mathEnable.checked = p.mathEnable;
        this.app.layoutSelector.value = p.layoutMode;
        this.app.modeSelector.value = p.mode;
        
        // Display Persistency states
        if (p.persistenceMode) {
            this.app.persistenceMode = JSON.parse(JSON.stringify(p.persistenceMode));
        } else {
            this.app.persistenceMode = { 'CH1': 'AUTO', 'CH2': 'AUTO', 'MATH': 'AUTO' };
        }
        if (p.persistenceTime) {
            this.app.persistenceTime = JSON.parse(JSON.stringify(p.persistenceTime));
        } else {
            this.app.persistenceTime = { 'CH1': 0.8, 'CH2': 0.8, 'MATH': 0.8 };
        }
        this.app.persistenceHistory['CH1'] = [];
        this.app.persistenceHistory['CH2'] = [];
        this.app.persistenceHistory['MATH'] = [];
        
        // Vertical states
        this.app.currentVoltbaseIdxCh1 = p.currentVoltbaseIdxCh1;
        this.app.currentVoltbaseIdxCh2 = p.currentVoltbaseIdxCh2;
        this.app.currentVoltbaseIdxMath = p.currentVoltbaseIdxMath;
        this.app.verticalOffsetDivCh1 = p.verticalOffsetDivCh1;
        this.app.verticalOffsetDivCh2 = p.verticalOffsetDivCh2;
        this.app.verticalOffsetDivMath = p.verticalOffsetDivMath;
        this.app.mathOperation = p.mathOperation || 'CH1+CH2';
        if (this.app.mathOpSelector) {
            this.app.mathOpSelector.value = this.app.mathOperation;
        }
        
        // FFT states
        this.app.fftEnabledCh1 = p.fftEnabledCh1;
        this.app.fftEnabledCh2 = p.fftEnabledCh2;
        this.app.fftEnabledMath = p.fftEnabledMath;
        this.app.fftWindow = p.fftWindow || 'Hanning';
        this.app.fftVerticalBase = p.fftVerticalBase || 'Vrms';
        if (this.app.fftWindowSelect) this.app.fftWindowSelect.value = this.app.fftWindow;
        if (this.app.fftBaseSelect) this.app.fftBaseSelect.value = this.app.fftVerticalBase;
        
        // OSD states
        this.app.osdEnabledCh1 = p.osdEnabledCh1 !== undefined ? p.osdEnabledCh1 : true;
        this.app.osdEnabledCh2 = p.osdEnabledCh2 !== undefined ? p.osdEnabledCh2 : true;
        this.app.osdEnabledMath = p.osdEnabledMath !== undefined ? p.osdEnabledMath : true;
        
        // Trigger states
        this.app.triggerEnabled = JSON.parse(JSON.stringify(p.triggerEnabled));
        this.app.triggerActionVal = JSON.parse(JSON.stringify(p.triggerActionVal));
        this.app.triggerLowDiv = JSON.parse(JSON.stringify(p.triggerLowDiv));
        this.app.triggerHighDiv = JSON.parse(JSON.stringify(p.triggerHighDiv));
        this.app.triggerMinSamples = JSON.parse(JSON.stringify(p.triggerMinSamples));
        this.app.triggerMinTimeSec = JSON.parse(JSON.stringify(p.triggerMinTimeSec));
        this.app.triggerPostDelayVal = JSON.parse(JSON.stringify(p.triggerPostDelayVal));
        this.app.triggerPostAuto = JSON.parse(JSON.stringify(p.triggerPostAuto));
        this.app.triggerFreqLowHz = JSON.parse(JSON.stringify(p.triggerFreqLowHz));
        this.app.triggerFreqHighHz = JSON.parse(JSON.stringify(p.triggerFreqHighHz));
        this.app.triggerFFTMatchLogic = JSON.parse(JSON.stringify(p.triggerFFTMatchLogic));
        
        // Cursors states
        this.app.cursorsEnabled = p.cursorsEnabled;
        this.app.cursorChEnabled = JSON.parse(JSON.stringify(p.cursorChEnabled));
        this.app.cursorTrackingMode = JSON.parse(JSON.stringify(p.cursorTrackingMode));
        
        this.app.cursorsEnableCheckbox.checked = p.cursorsEnabled;
        this.app.cursorCh1Enable.checked = this.app.cursorChEnabled['CH1'];
        this.app.cursorCh2Enable.checked = this.app.cursorChEnabled['CH2'];
        this.app.cursorMathEnable.checked = this.app.cursorChEnabled['MATH'];
        this.app.cursorCh1Track.value = this.app.cursorTrackingMode['CH1'];
        this.app.cursorCh2Track.value = this.app.cursorTrackingMode['CH2'];
        this.app.cursorMathTrack.value = this.app.cursorTrackingMode['MATH'];
        
        // Restore exact cursor data if available
        if (p.cursor1) {
            this.app.cursor1 = JSON.parse(JSON.stringify(p.cursor1));
            this.app.recalculateCursorCoords(this.app.cursor1);
        } else {
            this.app.cursor1 = null;
        }
        
        if (p.cursor2) {
            this.app.cursor2 = JSON.parse(JSON.stringify(p.cursor2));
            this.app.recalculateCursorCoords(this.app.cursor2);
        } else {
            this.app.cursor2 = null;
        }
        
        this.app.updateCursorCSS();
        this.app.updateCursorUIVisibility();
        this.app.syncCursorSliders();
        
        // Metrics states
        this.app.metricsEnabledCh1 = p.metricsEnabledCh1;
        this.app.metricsEnabledCh2 = p.metricsEnabledCh2;
        this.app.metricsEnabledMath = p.metricsEnabledMath;
        this.app.metricsLayout = p.metricsLayout || 'bottom_overlay';
        this.app.metricsAutoResetEnabled = p.metricsAutoResetEnabled;
        this.app.metricsAutoResetMult = p.metricsAutoResetMult || 1;
        
        if (this.app.metricsCh1Enable) this.app.metricsCh1Enable.checked = p.metricsEnabledCh1;
        if (this.app.metricsCh2Enable) this.app.metricsCh2Enable.checked = p.metricsEnabledCh2;
        if (this.app.metricsMathEnable) this.app.metricsMathEnable.checked = p.metricsEnabledMath;
        if (this.app.metricsLayoutSelector) this.app.metricsLayoutSelector.value = this.app.metricsLayout;
        if (this.app.metricsAutoresetEnable) {
            this.app.metricsAutoresetEnable.checked = p.metricsAutoResetEnabled;
            if (this.app.metricsAutoresetSliderGroup) {
                this.app.metricsAutoresetSliderGroup.style.display = p.metricsAutoResetEnabled ? 'block' : 'none';
            }
        }
        if (this.app.metricsAutoresetSlider) {
            const mults = [1, 2, 4, 8, 16, 32];
            const idx = mults.indexOf(this.app.metricsAutoResetMult);
            this.app.metricsAutoresetSlider.value = idx >= 0 ? idx : 0;
        }
        
        // Playback speed
        if (this.app.playbackSpeedSlider) {
            this.app.playbackSpeedSlider.value = p.playbackSpeedSliderValue || 40;
            this.app.onPlaybackSpeedChange(this.app.playbackSpeedSlider.value);
        }
        
        // Switch tab elements
        this.app.switchActiveTab(this.app.activeTab);
        
        // Ensure UI panels are shown/hidden for mode changes
        this.app.onModeChange();
        
        // Update sliders and readouts, and draw
        this.app.updateSlidersAndReadouts();
        this.app.drawOscilloscope();
    }

    saveProfile(name) {
        if (!name || name.trim() === '') {
            alert("Please enter a valid profile name.");
            return;
        }

        this.profiles[name] = {
            mode: this.app.mode,
            activeTab: this.app.activeTab,
            ch1Enable: this.app.ch1Enable.checked,
            ch2Enable: this.app.ch2Enable.checked,
            mathEnable: this.app.mathEnable.checked,
            layoutMode: this.app.layoutMode,
            gridIntensity: this.app.gridIntensity,
            currentTimebaseIdx: this.app.currentTimebaseIdx,
            horizontalPosition: this.app.horizontalPosition,
            playbackSpeed: this.app.playbackSpeed,
            playbackSpeedSliderValue: parseInt(this.app.playbackSpeedSlider.value, 10),

            persistenceMode: this.app.persistenceMode,
            persistenceTime: this.app.persistenceTime,

            currentVoltbaseIdxCh1: this.app.currentVoltbaseIdxCh1,
            currentVoltbaseIdxCh2: this.app.currentVoltbaseIdxCh2,
            currentVoltbaseIdxMath: this.app.currentVoltbaseIdxMath,
            verticalOffsetDivCh1: this.app.verticalOffsetDivCh1,
            verticalOffsetDivCh2: this.app.verticalOffsetDivCh2,
            verticalOffsetDivMath: this.app.verticalOffsetDivMath,
            mathOperation: this.app.mathOperation,

            fftEnabledCh1: this.app.fftEnabledCh1,
            fftEnabledCh2: this.app.fftEnabledCh2,
            fftEnabledMath: this.app.fftEnabledMath,
            fftWindow: this.app.fftWindow,
            fftVerticalBase: this.app.fftVerticalBase,

            osdEnabledCh1: this.app.osdEnabledCh1,
            osdEnabledCh2: this.app.osdEnabledCh2,
            osdEnabledMath: this.app.osdEnabledMath,

            triggerEnabled: this.app.triggerEnabled,
            triggerActionVal: this.app.triggerActionVal,
            triggerLowDiv: this.app.triggerLowDiv,
            triggerHighDiv: this.app.triggerHighDiv,
            triggerMinSamples: this.app.triggerMinSamples,
            triggerMinTimeSec: this.app.triggerMinTimeSec,
            triggerPostDelayVal: this.app.triggerPostDelayVal,
            triggerPostAuto: this.app.triggerPostAuto,
            triggerFreqLowHz: this.app.triggerFreqLowHz,
            triggerFreqHighHz: this.app.triggerFreqHighHz,
            triggerFFTMatchLogic: this.app.triggerFFTMatchLogic,

            cursorsEnabled: this.app.cursorsEnabled,
            cursorChEnabled: this.app.cursorChEnabled,
            cursorTrackingMode: this.app.cursorTrackingMode,
            cursor1: this.app.cursor1 ? {
                time: this.app.cursor1.time,
                freq: this.app.cursor1.freq,
                posValue: this.app.cursor1.posValue,
                activeCh: this.app.cursor1.activeCh
            } : null,
            cursor2: this.app.cursor2 ? {
                time: this.app.cursor2.time,
                freq: this.app.cursor2.freq,
                posValue: this.app.cursor2.posValue,
                activeCh: this.app.cursor2.activeCh
            } : null,

            metricsEnabledCh1: this.app.metricsEnabledCh1,
            metricsEnabledCh2: this.app.metricsEnabledCh2,
            metricsEnabledMath: this.app.metricsEnabledMath,
            metricsLayout: this.app.metricsLayout,
            metricsAutoResetEnabled: this.app.metricsAutoResetEnabled,
            metricsAutoResetMult: this.app.metricsAutoResetMult
        };
        
        try {
            localStorage.setItem('hantek_dso_profiles', JSON.stringify(this.profiles));
            this.updateProfileSelectorOptions();
            this.app.profileSelector.value = name;
            this.app.statusText.textContent = `Saved: "${name}"`;
            this.app.statusText.className = "status-ok";
        } catch (e) {
            console.error("Failed to save profile to localStorage", e);
            alert("Failed to save profile. localStorage limit might be exceeded.");
        }
    }

    recallProfile(name) {
        if (!name) {
            alert("Please select a profile to recall.");
            return;
        }
        const profile = this.profiles[name];
        if (!profile) {
            alert(`Profile "${name}" not found.`);
            return;
        }
        this.app.stopAllActivities();
        this.applyProfile(profile);
        this.app.statusText.textContent = `Recalled: "${name}"`;
        this.app.statusText.className = "status-ok";
    }

    onProfileSavePressed() {
        const selectedName = this.app.profileSelector.value;
        if (selectedName) {
            if (confirm(`Overwrite existing profile "${selectedName}"?`)) {
                this.saveProfile(selectedName);
            }
        } else {
            this.onProfileSaveAsPressed();
        }
    }

    onProfileSaveAsPressed() {
        const name = prompt("Enter a name for the new profile:");
        if (name) {
            const trimmedName = name.trim();
            if (trimmedName) {
                this.saveProfile(trimmedName);
            }
        }
    }

    onProfileDeletePressed() {
        const selectedName = this.app.profileSelector.value;
        if (!selectedName) {
            alert("Please select a profile to delete.");
            return;
        }
        if (confirm(`Are you sure you want to delete profile "${selectedName}"?`)) {
            delete this.profiles[selectedName];
            try {
                localStorage.setItem('hantek_dso_profiles', JSON.stringify(this.profiles));
                this.updateProfileSelectorOptions();
                this.resetAllControlsToDefaults();
                this.app.statusText.textContent = `Deleted: "${selectedName}"`;
                this.app.statusText.className = "status-ok";
            } catch (e) {
                console.error("Failed to delete profile from localStorage", e);
                alert("Failed to delete profile.");
            }
        }
    }
}
