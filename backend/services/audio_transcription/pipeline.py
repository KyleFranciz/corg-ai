from __future__ import annotations

import subprocess
import time
import wave
from typing import Any, TypedDict


SAMPLE_RATE = 16000
PIPER_SAMPLE_RATE = 22050
PIPER_MODEL_PATH = 'models/en_US-libritts_r-medium.onnx'

_vad_model: Any | None = None
_whisper_model: Any | None = None


class PipelineResult(TypedDict):
    transcript: str
    audio_duration_seconds: float
    timings: dict[str, float]


def _get_vad_model() -> Any:
    global _vad_model
    if _vad_model is None:
        try:
            from silero_vad import load_silero_vad
        except Exception as exc:
            raise RuntimeError(
                'Audio pipeline dependency unavailable: silero-vad is not installed or failed to load'
            ) from exc

        _vad_model = load_silero_vad()
    return _vad_model


def _get_whisper_model() -> Any:
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
        except Exception as exc:
            raise RuntimeError(
                'Audio pipeline dependency unavailable: faster-whisper is not installed or failed to load'
            ) from exc

        _whisper_model = WhisperModel('base', device='cpu', compute_type='int8')
    return _whisper_model


def _import_numpy() -> Any:
    try:
        import numpy as np
    except Exception as exc:
        raise RuntimeError(
            'Audio pipeline dependency unavailable: numpy is not installed in this environment'
        ) from exc

    return np


def _import_sounddevice() -> Any:
    try:
        import sounddevice as sd
    except OSError as exc:
        raise RuntimeError(
            'Audio output/input backend unavailable: PortAudio library not found in this environment'
        ) from exc
    except Exception as exc:
        raise RuntimeError(
            'Audio pipeline dependency unavailable: sounddevice is not installed or failed to load'
        ) from exc

    return sd


def _import_torch() -> Any:
    try:
        import torch
    except Exception as exc:
        raise RuntimeError(
            'Audio pipeline dependency unavailable: torch is not installed or failed to load'
        ) from exc

    return torch


def record_audio_until_silent(silence_seconds: float = 1.5, max_seconds: int = 15) -> np.ndarray:
    np = _import_numpy()
    sd = _import_sounddevice()
    torch = _import_torch()

    chunk_size = 512
    silence_chunk_limit = int(SAMPLE_RATE / chunk_size * silence_seconds)
    max_chunks = int(SAMPLE_RATE / chunk_size * max_seconds)

    recorded_chunks: list[np.ndarray] = []
    silent_chunks = 0
    speech_started = False
    processed_chunks = 0
    vad_model = _get_vad_model()

    with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype='float32') as stream:
        while True:
            chunk, _ = stream.read(chunk_size)
            processed_chunks += 1
            chunk_1d = chunk[:, 0]
            tensor = torch.from_numpy(chunk_1d)

            confidence = vad_model(tensor, SAMPLE_RATE).item()
            is_speech = confidence > 0.5

            if is_speech:
                speech_started = True
                silent_chunks = 0
                recorded_chunks.append(chunk_1d)
            elif speech_started:
                silent_chunks += 1
                recorded_chunks.append(chunk_1d)

                if silent_chunks >= silence_chunk_limit:
                    break

            if processed_chunks >= max_chunks:
                break

    if not recorded_chunks:
        raise RuntimeError('No speech detected before recording timeout')

    audio = np.concatenate(recorded_chunks, axis=0).astype(np.float32)
    if audio.size == 0:
        raise RuntimeError('Captured audio is empty')

    return audio


def transcribe_audio(audio: np.ndarray) -> str:
    whisper_model = _get_whisper_model()
    segments, _ = whisper_model.transcribe(audio, beam_size=5)
    text = ' '.join(seg.text for seg in segments).strip()

    if not text:
        raise RuntimeError('Whisper returned an empty transcript')

    return text


def speak_response(text: str, model_path: str = PIPER_MODEL_PATH, save_path: str | None = None) -> None:
    np = _import_numpy()
    sd = _import_sounddevice()

    if not text.strip():
        raise RuntimeError('Cannot run Piper with empty text')

    result = subprocess.run(
        ['python', '-m', 'piper', '--model', model_path, '--output-raw'],
        input=text.encode(),
        capture_output=True,
        check=False
    )

    if result.returncode != 0:
        error_output = result.stderr.decode().strip() or 'Unknown Piper error'
        raise RuntimeError(f'Piper failed: {error_output}')

    audio = np.frombuffer(result.stdout, dtype=np.int16)
    if audio.size == 0:
        raise RuntimeError('Piper produced no audio output')

    if save_path is not None:
        with wave.open(save_path, 'wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(PIPER_SAMPLE_RATE)
            wf.writeframes(audio.tobytes())

    sd.play(audio, samplerate=PIPER_SAMPLE_RATE)
    sd.wait()


def run_audio_to_tts_pipeline() -> PipelineResult:
    timings: dict[str, float] = {}

    listening_started_at = time.perf_counter()
    audio = record_audio_until_silent()
    timings['listening_seconds'] = time.perf_counter() - listening_started_at

    transcribe_started_at = time.perf_counter()
    transcript = transcribe_audio(audio)
    timings['transcribing_seconds'] = time.perf_counter() - transcribe_started_at

    speaking_started_at = time.perf_counter()
    speak_response(transcript)
    timings['speaking_seconds'] = time.perf_counter() - speaking_started_at

    return {
        'transcript': transcript,
        'audio_duration_seconds': round(float(audio.shape[0] / SAMPLE_RATE), 3),
        'timings': {key: round(value, 3) for key, value in timings.items()}
    }
