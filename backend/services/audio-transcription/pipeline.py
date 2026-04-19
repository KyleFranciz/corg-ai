from silero_vad import load_silero_vad, read_audio, get_speech_timestamps
import sounddevice as sd
import numpy as np

vad_model = load_silero_vad()

SAMPLE_RATE = 16000


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


def transcribe_audio():
    pass


def speak_response():
    pass
