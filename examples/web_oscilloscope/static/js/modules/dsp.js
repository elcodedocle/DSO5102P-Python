// Digital Signal Processing (DSP) Math Utilities for the Web Oscilloscope

// In-place Radix-2 Cooley-Tukey FFT implementation
export function bitReverse(x, numBits) {
    let rev = 0;
    for (let i = 0; i < numBits; i++) {
        rev = (rev << 1) | (x & 1);
        x >>= 1;
    }
    return rev;
}

export function cooleyTukeyFFT(real, imag) {
    const N = real.length;
    const numBits = Math.log2(N);
    
    // Bit-reversal permutation
    for (let i = 0; i < N; i++) {
        const rev = bitReverse(i, numBits);
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

export function computeFFTSpectrum(volts, dt, fftWindow = 'Hanning', fftVerticalBase = 'Vrms') {
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
        
        switch (fftWindow) {
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
    cooleyTukeyFFT(real, imag);
    
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
        
        if (fftVerticalBase === 'dBrms') {
            // dB relative to 1.0 Volt RMS
            magnitudes[k] = 20.0 * Math.log10(Math.max(v_rms, 1e-6));
        } else {
            magnitudes[k] = v_rms;
        }
    }
    
    return { frequencies, magnitudes };
}
