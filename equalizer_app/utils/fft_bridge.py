import os
import ctypes
import subprocess
import sys
import shutil
from pathlib import Path
import numpy as np

# Paths
BASE_DIR = Path(__file__).resolve().parent
CPP_SOURCE = BASE_DIR / "native_fft.cpp"
SO_FILE = BASE_DIR / ("native_fft.dll" if os.name == 'nt' else "native_fft.so")

_fft_lib = None


def _add_compiler_to_path():
    """
    Locates g++ and adds its directory to DLL search path to resolve dependencies.
    """
    compiler_path = shutil.which("g++")
    if compiler_path:
        bin_dir = str(Path(compiler_path).parent.resolve())

        # Add to PATH environment variable
        if bin_dir not in os.environ["PATH"]:
            os.environ["PATH"] += os.pathsep + bin_dir
            print(f"[FFT Bridge] Added compiler bin to PATH: {bin_dir}")

        # For Python 3.8+ on Windows, explicitly add DLL directory
        if hasattr(os, "add_dll_directory"):
            try:
                os.add_dll_directory(bin_dir)
            except Exception:
                pass


def _compile_dll():
    print(f"[FFT Bridge] Compiling C++ extension at {SO_FILE}...")

    if SO_FILE.exists():
        try:
            os.remove(SO_FILE)
        except PermissionError:
            print(f"[FFT Bridge] Warning: Could not delete old DLL. Trying to overwrite.")

    if os.name == 'nt':
        # Windows: attempt static linking to avoid dependency hell
        cmd = [
            "g++", "-shared", "-o", str(SO_FILE), str(CPP_SOURCE),
            "-O3", "-static", "-static-libgcc", "-static-libstdc++"
        ]
    else:
        cmd = ["g++", "-shared", "-o", str(SO_FILE), str(CPP_SOURCE), "-fPIC", "-O3"]

    try:
        subprocess.check_call(cmd)
        print("[FFT Bridge] Compilation successful.")
    except FileNotFoundError:
        raise RuntimeError(
            "CRITICAL: C++ Compiler (g++) not found.\n"
            "Please install MinGW-w64 and ensure 'g++' is in your system PATH."
        )
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Compilation failed with error code {e.returncode}.")


def _load_dll():
    if not SO_FILE.exists():
        raise FileNotFoundError(f"DLL file missing at {SO_FILE}")

    try:
        return ctypes.CDLL(str(SO_FILE.resolve()))
    except FileNotFoundError:
        _add_compiler_to_path()
        try:
            return ctypes.CDLL(str(SO_FILE.resolve()))
        except Exception as e:
            raise RuntimeError(f"Failed to load DLL. Error: {e}")
    except OSError as e:
        raise RuntimeError(f"OS Error loading DLL: {e}")


def compile_and_load():
    global _fft_lib
    if _fft_lib is not None:
        return _fft_lib

    _add_compiler_to_path()

    if not SO_FILE.exists() or (SO_FILE.stat().st_mtime < CPP_SOURCE.stat().st_mtime):
        _compile_dll()

    lib = _load_dll()

    # --- Define Signatures ---
    lib.fft_c.argtypes = [
        ctypes.POINTER(ctypes.c_float), ctypes.POINTER(ctypes.c_float),
        ctypes.POINTER(ctypes.c_float), ctypes.POINTER(ctypes.c_float),
        ctypes.c_int, ctypes.c_int
    ]

    lib.apply_equalizer_c.argtypes = [
        ctypes.POINTER(ctypes.c_float), ctypes.c_int, ctypes.c_int,
        ctypes.POINTER(ctypes.c_float), ctypes.c_int,
        ctypes.POINTER(ctypes.c_float)
    ]

    lib.compute_spectrum_c.argtypes = [
        ctypes.POINTER(ctypes.c_float), ctypes.c_int, ctypes.c_int,
        ctypes.c_int, ctypes.c_int,
        ctypes.POINTER(ctypes.c_float), ctypes.POINTER(ctypes.c_float)
    ]

    lib.stft_spectrogram_c.argtypes = [
        ctypes.POINTER(ctypes.c_float), ctypes.c_int, ctypes.c_int,
        ctypes.c_int, ctypes.c_int,
        ctypes.POINTER(ctypes.c_float),
        ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int)
    ]

    _fft_lib = lib
    return lib
