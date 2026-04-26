from silero_vad import load_silero_vad
import sounddevice as sd
import numpy as np
import subprocess
from faster_whisper import WhisperModel

vad_model = load_silero_vad()
whisper_model = WhisperModel("base", device="cpu", compute_type="int8")

SAMPLE_RATE = 16000
PIPER_MODEL_PATH = "models/en_US-libritts_r-medium.onnx"


# NOTE: Might adjust the max seconds for recording length
# FUNCTION TO LISTENING AND RECORDING THE USERS VOICE
def record_audio_until_silent(silence_seconds: float = 1.5, max_seconds: int = 40):
    """
    Listens to the mic.
    Stops recording after silence_seconds of no detected speech.
    Returns a numpy float32 array of the captured speech audio.
    """

    CHUNK_SIZE = 512  # audio sample per chunk
    limit_for_silence = int(SAMPLE_RATE / CHUNK_SIZE * silence_seconds)
    max_chunks = int(SAMPLE_RATE / CHUNK_SIZE * max_seconds)

    # array to house the chunks recorded
    recorded_chunks = []
    silent_chunks = 0
    speech_started = False

    print("Listening...")

    with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="float32") as stream:
        while True:
            chunk, _ = stream.read(CHUNK_SIZE)
            chunk_id = chunk[:, 0]

            # use torch to read
            import torch

            tensor = torch.from_numpy(chunk_id)

            # check w/ silero if user speech is in a chunk
            confidence = vad_model(tensor, SAMPLE_RATE).item()

            is_speech = confidence > 0.5

            if is_speech:
                speech_started = True
                silent_chunks = 0
                recorded_chunks.append(chunk_id)
            elif speech_started:
                # account for silent chunks with no input from the user
                silent_chunks += 1
                recorded_chunks.append(chunk_id)

                if silent_chunks >= limit_for_silence:
                    print("There's silence, stopping")
                    break

            # might make the max recording length decently long
            if len(recorded_chunks) >= max_chunks:
                print("Max recording length reached stopping")
                break

    return np.concatenate(recorded_chunks, axis=0)


# turn the audio into text
def transcribe_audio(audio: np.ndarray) -> str:
    print("Whisper is transcribing... ")
    segments, _ = whisper_model.transcribe(audio, beam_size=5)
    text = " ".join([seg.text for seg in segments])
    print(f"Whisper Results: {text}")
    return text


# make the model speek the response to the user (Piper handles this)
def speak_response(text: str):
    print(f"Piper Speaking: {text}")
    # run commands
    result = subprocess.run(
        ["python", "-m", "piper", "--model", PIPER_MODEL_PATH, "--output-raw"],
        input=text.encode(),
        capture_output=True,
    )

    if result.returncode != 0:
        print(f"Piper Error: {result.stderr.decode()}")
        return

    audio = np.frombuffer(result.stdout, dtype=np.int16)
    sd.play(audio, samplerate=22050)
    sd.wait()
    print("Piper Done Talking")
