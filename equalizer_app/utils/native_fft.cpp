#include <cmath>
#include <complex>
#include <vector>
#include <algorithm>
#include <iostream>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

extern "C" {

// --- Helper: Bit Reversal for FFT ---
void bit_reverse_copy(const std::complex<float>* src, std::complex<float>* dst, int n) {
    int bits = 0;
    while ((1 << bits) < n) bits++;

    for (int i = 0; i < n; i++) {
        int rev = 0;
        int val = i;
        for (int j = 0; j < bits; j++) {
            rev = (rev << 1) | (val & 1);
            val >>= 1;
        }
        if (rev < n) dst[rev] = src[i];
    }
}

// --- Core FFT (Iterative Cooley-Tukey) ---
// Used internally by all other functions
void fft_core(std::complex<float>* x, int n, bool inverse) {
    // Reorder array by bit-reversal
    std::vector<std::complex<float>> temp(n);
    bit_reverse_copy(x, temp.data(), n);
    for(int i=0; i<n; i++) x[i] = temp[i];

    for (int len = 2; len <= n; len <<= 1) {
        float ang = 2 * M_PI / len * (inverse ? 1 : -1);
        std::complex<float> wlen(cos(ang), sin(ang));
        for (int i = 0; i < n; i += len) {
            std::complex<float> w(1);
            for (int j = 0; j < len / 2; j++) {
                std::complex<float> u = x[i + j];
                std::complex<float> v = x[i + j + len / 2] * w;
                x[i + j] = u + v;
                x[i + j + len / 2] = u - v;
                w *= wlen;
            }
        }
    }

    if (inverse) {
        for (int i = 0; i < n; i++) x[i] /= n;
    }
}

// --- Exposed: Simple FFT/IFFT ---
void fft_c(const float* in_real, const float* in_imag, float* out_real, float* out_imag, int n, int inverse) {
    std::vector<std::complex<float>> data(n);
    for (int i = 0; i < n; i++) {
        data[i] = std::complex<float>(in_real[i], in_imag ? in_imag[i] : 0.0f);
    }

    fft_core(data.data(), n, inverse);

    for (int i = 0; i < n; i++) {
        out_real[i] = data[i].real();
        out_imag[i] = data[i].imag();
    }
}

// --- Helper: Hanning Window ---
void apply_hanning_window(float* data, int n) {
    for (int i = 0; i < n; i++) {
        float multiplier = 0.5f * (1.0f - cos(2.0f * M_PI * i / (n - 1)));
        data[i] *= multiplier;
    }
}

// --- Exposed: Full Equalizer Processing ---
// Performs: FFT -> Frequency Masking -> Gain Application -> IFFT
// bands_data: flattened array of [fmin, fmax, gain, fmin, fmax, gain, ...]
void apply_equalizer_c(const float* input_signal, int n, int sr,
                      const float* bands_data, int num_bands,
                      float* out_signal) {

    // 1. Prepare Complex Data (Zero Padding to Power of 2 usually handled in Python,
    //    but assuming n is valid power of 2 here for simplicity or exact size)
    std::vector<std::complex<float>> X(n);
    for(int i=0; i<n; i++) X[i] = std::complex<float>(input_signal[i], 0.0f);

    // 2. Forward FFT
    fft_core(X.data(), n, false);

    // 3. Apply Gains
    // FFT Frequencies: k * sr / n
    float freq_step = (float)sr / n;

    for (int i = 0; i < n; i++) {
        float freq = i * freq_step;
        // Handle symmetry for frequencies > sr/2
        if (freq > sr/2.0f) freq = sr - freq;

        // Check bands
        float gain = 1.0f;
        for (int b = 0; b < num_bands; b++) {
            float fmin = bands_data[b*3 + 0];
            float fmax = bands_data[b*3 + 1];
            float g    = bands_data[b*3 + 2];

            if (freq >= fmin && freq <= fmax) {
                // Multiplicative gain? Or replacement? Standard EQ multiplies.
                // If multiple bands overlap, gains multiply (series) or accumulate.
                // We'll assume simple multiplication for active bands.
                gain *= g;
            }
        }
        X[i] *= gain;
    }

    // 4. Inverse FFT
    fft_core(X.data(), n, true);

    // 5. Real Output
    for(int i=0; i<n; i++) {
        out_signal[i] = X[i].real();
    }
}

}
