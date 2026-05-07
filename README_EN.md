# 🎧 SyncPlay: Real-Time Audio Sharing Platform

**SyncPlay** is a high-performance web-based solution designed to overcome the limitations of physical audio hardware. It enables users to synchronize music playback from any URL across multiple devices simultaneously, creating a seamless "Share Play" experience.

## 🚀 Concept: State-Based Synchronization
Traditional Bluetooth and hardware splitters have physical range and connection limits. SyncPlay solves this by shifting the "splitting" logic to the cloud. Instead of broadcasting raw audio data, it synchronizes the **playback state** (timestamp, play/pause, volume) across all connected clients.

---

## 🛠 Technical Stack

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | Next.js 14+ | Core application framework with SSR/ISR capabilities. |
| **Real-time** | Socket.io / WebSockets | Low-latency bi-directional communication. |
| **UI Engine** | Tailwind CSS & shadcn/ui | Industrial-grade, high-fidelity user interface. |
| **Motion** | GSAP | High-performance animations and audio visualizers. |
| **Logic** | Web Audio API | Client-side audio processing and frequency analysis. |
| **Hosting** | Dockerized Environment | Ensuring consistent deployment across cloud providers. |

---

## 📐 System Architecture

1.  **Input Ingestion:** The Host provides a link (YouTube, SoundCloud, MP3). The system extracts metadata and prepares the media stream.
2.  **Sync Gateway:** A WebSocket server manages "Rooms". It ensures that every client in a room is within a <50ms sync margin.
3.  **Clock Synchronization:** Using NTP-style algorithms to calculate network jitter and adjust the local playhead of each client device.
4.  **Hardware Output:** Each device outputs to its own local hardware (Internal speakers, Bluetooth headphones, or wired AUX).

---

## 🛠 Key Features

- **Global Share Play:** Generate a secure room code and invite anyone globally to listen in sync.
- **Latency Compensation:** Advanced algorithms to keep audio perfectly aligned even on fluctuating connections.
- **Interactive Visualizer:** Real-time waveform analysis that moves in sync with the beat across all devices.
- **Collaborative Queue:** Every participant can suggest and vote on the next tracks in the playlist.

---

## 🚦 Roadmap

### Phase 1: MVP (Minimum Viable Product)
- WebSocket handshake and basic playback synchronization.
- Support for major streaming URL parsing.

### Phase 2: Professional UI/UX
- Implementation of the "Industrial Dark" theme.
- Advanced Web Audio API visualizers.

### Phase 3: Enterprise & Scaling
- AI-based audio enhancement.
- Global edge server deployment for ultra-low latency.

---
*Documentation prepared by Engineering & IT Professionals.*
