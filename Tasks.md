# CorgAI — Open Tasks

> Last updated: 2026-04-27  
> Only open (Todo / In Progress) issues are listed. Completed and cancelled issues are excluded.
>
> **Offline-first policy:** All unresolved tasks must preserve fully offline operation and on-device data persistence unless a task explicitly states otherwise.

---

## Stage 3 — RAG Integration and UI Connection

**Goal:** Plug the existing RAG knowledge base into the pipeline and connect the full loop to the React UI. By the end of this stage the agent listens, thinks intelligently using RAG, and responds out loud while the UI shows real-time status updates. Stage 3 must remain fully offline: retrieval and generation run locally (ChromaDB + Ollama), and all session/context data remains on-device.

---

### [COR-11] Stage 3 — RAG Integration and UI Connection
- **Priority:** High
- **Status:** Todo
- **Linear:** https://linear.app/faunetwork/issue/COR-11

**Description:**  
Parent milestone for Stage 3. Encompasses all sub-tasks required to wire the RAG knowledge base into the audio pipeline and expose live agent state to the React frontend. Stage is complete when a user can speak a question, the agent retrieves relevant context from ChromaDB, generates an LLM response, speaks it aloud via Piper, and the UI reflects each pipeline stage in real time. All Stage 3 work must enforce offline-first behavior with local inference and local storage only.

---

### [COR-18] Build document ingestion script for ChromaDB
- **Priority:** High
- **Status:** Done
- **Stage:** Stage 3
- **Linear:** https://linear.app/faunetwork/issue/COR-18

**Description:**  
Write a Python script (`ingest.py` or similar) that reads documents from a local folder (e.g. `data/documents/`), splits them into text chunks, generates embeddings, and upserts them into the ChromaDB vector store. Support common formats: `.txt`, `.md`, and `.pdf`. This script populates the knowledge base that the RAG pipeline queries at runtime. The ingestion script must run independently of the main FastAPI app and should report how many chunks were added or updated on each run.

**Completion Note (2026-04-27):**
- Added standalone `backend/ingest.py` for recursive `.txt`, `.md`, `.pdf` ingestion.
- Added chunking defaults (`1000/200`), deterministic chunk IDs, and Chroma upsert summary reporting.
- Added per-source chunk collection routing and SQLite `Documents`/`Chunks` sync during ingestion.

---

### [COR-19] Wire ChromaDB vector search into RAG pipeline
- **Priority:** High
- **Status:** Done
- **Stage:** Stage 3
- **Linear:** https://linear.app/faunetwork/issue/COR-19

**Description:**  
Replace any placeholder retrieval logic in the RAG pipeline with a live ChromaDB similarity search. When the pipeline receives transcribed text from faster-whisper, embed the query and perform a top-K similarity search against ChromaDB to retrieve relevant document chunks. Inject those chunks into the LLM prompt as context. The ChromaDB client must use local persistent storage via `CHROMA_PATH` for offline operation. Requires COR-18 (ingestion script) to have populated the vector store first.

**Progress Note (2026-04-27):**
- Added retrieval module (`backend/rag/retrieval.py`) that queries Chroma chunk collections and returns top-K chunk matches.
- Wired retrieval stage into WebSocket pipeline before LLM response generation.
- Injected retrieved chunk context into agent prompt via `services/agent/chain.py`.
- Chroma retrieval uses local persistent vector storage via `CHROMA_PATH`.

---

### [COR-12] Connect RAG and LLM pipeline to STT output
- **Priority:** High
- **Status:** Done
- **Stage:** Stage 3
- **Linear:** https://linear.app/faunetwork/issue/COR-12

**Description:**  
Connect the transcribed text output from faster-whisper into the existing RAG pipeline. The LLM response should feed directly into Piper TTS. Replace the hardcoded response from Stage 2 with live RAG output. Each turn of the pipeline — transcription → retrieval → LLM → TTS — must execute sequentially and emit WebSocket status events so the frontend can track progress in real time. Retrieval and generation must run locally (ChromaDB + local Ollama) with no external API dependency.

**Completion Note (2026-04-28):**
- Hardened websocket pipeline ordering with explicit staged execution: `listening → transcribing → retrieving → responding → speaking`.
- Ensured live RAG path is used for generation (transcript + retrieved chunks passed to `generate_agent_response` before TTS).
- Normalized websocket payloads with deterministic `status` events (`started/completed/failed`) and enriched `result`/`error` payload metadata.
- Added per-stage timing and total runtime metrics for pipeline observability and local debugging.

---

### [COR-13] Build useAgent hook and connect React UI to backend
- **Priority:** High
- **Status:** Todo
- **Stage:** Stage 3
- **Linear:** https://linear.app/faunetwork/issue/COR-13

**Description:**  
Build a `useAgent` React hook that manages WebSocket communication with the FastAPI backend. The hook should handle connection lifecycle (connect, reconnect, disconnect), send and receive pipeline state events, and expose the current agent status (`listening`, `thinking`, `speaking`) to UI components. The hook is the single source of truth for agent state in the frontend — no raw WebSocket calls outside of it. The hook must not require internet connectivity checks and should operate against the local backend only.

---

### [COR-14] Add conversation history display to the UI
- **Priority:** High
- **Status:** Todo
- **Stage:** Stage 3
- **Linear:** https://linear.app/faunetwork/issue/COR-14

**Description:**  
Add a conversation history panel to the React UI that displays past interaction turns (user transcription + agent response) in real time as they complete. Pull turn data from the WebSocket events or a dedicated history endpoint backed by the SQLite store added in COR-20. Each turn should be appended to the panel as it finishes. The panel must be scrollable and persist for the duration of the session without requiring a page reload. History data must remain local/on-device and not rely on cloud sync.

---

## Stage 4 — Polish, Latency, and Packaging

**Goal:** Polish the app, fix latency issues, handle edge cases, and package the finished desktop app. This stage turns the working prototype from Stage 3 into a shippable product while preserving offline-first behavior and on-device storage/privacy.

---

### [COR-21] Stage 4 — Polish, Latency, and Packaging
- **Priority:** Medium
- **Status:** Todo
- **Linear:** https://linear.app/faunetwork/issue/COR-21

**Description:**  
Parent milestone for Stage 4. Encompasses all sub-tasks required to reduce perceived latency, harden the pipeline against edge cases (interruptions, background noise, long sessions), and package the app as a distributable Electron binary that manages its own Docker backend lifecycle. Stage is complete when the app can be opened as a standalone desktop application with no manual setup required. All Stage 4 deliverables must preserve fully offline execution and local data retention.

---

### [COR-22] Implement sentence chunking so Piper speaks before LLM finishes
- **Priority:** Medium
- **Status:** Todo
- **Stage:** Stage 4
- **Linear:** https://linear.app/faunetwork/issue/COR-22

**Description:**  
Instead of waiting for the entire LLM response before sending it to Piper TTS, split the output stream into sentence-sized chunks and feed each chunk to Piper as it arrives. This reduces perceived response latency so the agent begins speaking almost immediately after the LLM starts generating. Requirements: detect sentence boundaries in the streaming LLM output, queue chunks for sequential playback, and ensure there are no audio gaps or overlaps between chunks. Streaming behavior must operate entirely on-device without cloud TTS/LLM dependencies.

---

### [COR-24] Add background noise handling and VAD tuning
- **Priority:** Medium
- **Status:** Todo
- **Stage:** Stage 4
- **Linear:** https://linear.app/faunetwork/issue/COR-24

**Description:**  
Tune silero-vad thresholds to reduce false positive triggers from ambient noise (fans, HVAC, keyboard, traffic). Add configurable silence padding so the VAD does not cut off speech too early at the end of a sentence. Test in noisy environments and confirm the pipeline does not spam transcription requests from non-speech audio. Expose key VAD parameters (threshold, padding, min speech duration) as environment variables so they can be tuned without a code change. Tuning and runtime behavior must assume offline use and local audio processing only.

---

### [COR-23] Handle interruptions when user speaks while agent is talking
- **Priority:** Medium
- **Status:** Todo
- **Stage:** Stage 4
- **Linear:** https://linear.app/faunetwork/issue/COR-23

**Description:**  
Detect when VAD triggers while Piper is actively playing audio and immediately stop playback. Discard any remaining queued TTS chunks and restart the pipeline from the VAD/STT stage with the new user input. This prevents the agent from talking over the user and makes the conversation feel natural. The pipeline must be interruptible at any point during TTS playback without leaving audio artifacts or blocking the next input cycle. Interruption handling must remain fully local and independent of network availability.

---

### [COR-25] Add session memory so agent retains context within a conversation
- **Priority:** Medium
- **Status:** Todo
- **Stage:** Stage 4
- **Linear:** https://linear.app/faunetwork/issue/COR-25

**Description:**  
Pass the current session's conversation history (stored in SQLite via COR-20) as context to the LLM on each turn. The agent should be able to reference earlier turns within the same session when answering follow-up questions. Define a sensible rolling context window (e.g. the last N turns or a token budget) to avoid exceeding LLM context limits. Session memory resets when a new session begins; long-term cross-session memory is out of scope for this issue. Session memory must stay on-device and avoid remote persistence.

---

### [COR-26] Verify local data folder persists through Docker rebuilds
- **Priority:** Medium
- **Status:** Todo
- **Stage:** Stage 4
- **Linear:** https://linear.app/faunetwork/issue/COR-26

**Description:**  
Confirm that ChromaDB and SQLite data stored in the local `data/` folder on the host machine survives Docker container stops, restarts, and full rebuilds. Test procedure:
1. Run the app and generate conversation data.
2. Run `docker-compose down` then `docker-compose up --build`.
3. Confirm all previous data is still accessible after the rebuild.

Since data lives on the host rather than inside Docker, this should pass automatically if the volume mounts from COR-17 are correctly configured. Document the result and close if passing; otherwise investigate and fix the volume mount configuration. This task enforces the offline requirement that user/application data persists locally on-device.

---

### [COR-27] Package Electron app and auto-launch Docker backend on startup
- **Priority:** Medium
- **Status:** Todo
- **Stage:** Stage 4
- **Linear:** https://linear.app/faunetwork/issue/COR-27

**Description:**  
Configure `electron-builder` to package the app as a distributable `.dmg` (macOS) or `.exe` (Windows) installer. On app launch, programmatically run `docker-compose up` to start the FastAPI backend container. On app quit, run `docker-compose down` to stop and clean up the container. The end user should not need to open a terminal or manage Docker manually — the Electron shell handles the full backend lifecycle. Include error handling for cases where Docker is not installed or the container fails to start, with a user-facing error message. Packaging must preserve fully offline operation, with all inference/retrieval/storage on the local machine.

---

## Priority Reference

| Label | Meaning |
|---|---|
| Urgent | Blocking — must be resolved immediately |
| High | Core path — needed for the current stage to complete |
| Medium | Important but not blocking current stage progress |
| Low | Nice to have / deferred polish |
