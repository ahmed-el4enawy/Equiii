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

}
