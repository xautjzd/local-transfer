# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Local Transfer is a Snapdrop-like application for peer-to-peer (P2P) file and message sharing over local networks using WebRTC. It consists of a Node.js/Express server with Socket.IO for signaling, and a vanilla JavaScript client that establishes WebRTC data channels for direct file transfers between peers on the same LAN.

## Development Commands

```bash
# Install dependencies
npm install

# Start the server (production mode)
npm start

# Start with hot reload (development mode)
npm run dev

# Server runs on port 3000 by default (configurable via PORT env var)
```

## Architecture Overview

### Server (`server.js`)

- **Express + Socket.IO**: Serves static files from `public/` and handles WebRTC signaling
- **Client Management**: Tracks connected clients using fingerprinting (IP + user-agent + username) to handle page refreshes gracefully
- **Signaling Relay**: Forwards WebRTC offers/answers/ICE candidates between peers
- **Message Relay**: Forwards text messages between peers via Socket.IO when WebRTC isn't established

Key state:
- `clients`: Map of socket IDs to client info `{id, name, fingerprint}`
- `clientFingerprints`: Maps fingerprints to socket IDs for refresh detection
- `disconnectingClients`: Tracks clients in 5-second grace period (allows refresh without immediate disconnect)

### Client (`public/app.js`)

Two main classes handle the core functionality:

**`FileHandler`** (lines ~166-730)
- Manages file selection, chunked transfer (16KB chunks), progress tracking
- Handles incoming file reception via `FileReceiver` class
- Maintains file history per peer
- Key methods: `handleFileSelect()`, `sendFiles()`, `receiveChunk()`, `updateTransferProgress()`

**`ConnectionManager`** (lines ~731-1490)
- Manages WebRTC peer connections and data channels
- Handles connection lifecycle: create peer connection → create data channel → initiate with offer → handle answer → ICE negotiation
- Includes automatic reconnection with exponential backoff
- Key methods: `createPeerConnection()`, `initiateConnection()`, `handleConnectionFailure()`, `retryWithExponentialBackoff()`

**Initialization Flow**
1. DOMContentLoaded → initialize `fileHandler` → initialize `connectionManager` → register Socket.IO listeners → call `initializeConnection()`
2. Socket emits `set-username` → server responds with `init` event containing client list
3. `updatePeersList()` renders available peers
4. User clicks peer → `selectPeer()` → `connectionManager.createPeerConnection()` → WebRTC signaling via Socket.IO

### Internationalization (`public/lang/`)

- `lang-manager.js`: Custom i18n system using `window[currentLang]` objects and `__()` function
- Supports: en, zh, ja, ko, fr, es
- Translations stored in language files (e.g., `en.js`, `zh.js`)
- Language persisted in `localStorage.getItem('localTransferLanguage')`

## Critical Implementation Details

**WebRTC Data Channel**
- Chunk size: 16KB (`CHUNK_SIZE = 16 * 1024`)
- Max chunk size: 256KB
- File metadata sent before chunks, includes: name, size, type, totalChunks, fileId
- Progress updates sent via data channel messages with type `progress`
- Supports large file transfers with automatic chunking

**Socket.IO Event Order**
The initialization order is critical to avoid null reference errors:
```
DOMContentLoaded
  → new FileHandler()
  → new ConnectionManager(fileHandler)
  → register socket.on('init', ...)
  → register socket.on('signal', ...)
  → initializeConnection() // emits set-username
```

**Null Guards**
Several places check for `connectionManager` or `fileHandler` being null before accessing:
- `selectPeer()`: Guards against clicking before initialization
- `updateConnectionStatus()`: Guards when called before DOMContentLoaded
- `refreshConnectionStatus()`: Guards in language change handler
- `socket.on('signal')`: Guards against early signals

**Browser Compatibility**
- `checkBrowserSupport()` verifies RTCPeerConnection, WebSocket, File, FileReader, Blob APIs
- Safari requires special handling for folder selection (`webkitdirectory` attribute)
- Uses optional chaining for `navigator.mediaDevices?.getUserMedia`

## File Transfer Protocol

1. Sender: `sendFileInfo()` → sends JSON `{type: 'file-info', fileId, name, size, type, totalChunks}`
2. Receiver: `handleFileInfo()` → initializes receive buffer
3. Sender: Sends chunks as `ArrayBuffer` via `dataChannel.send()`
4. Receiver: `dataChannel.onmessage` → accumulates chunks, updates progress
5. When all chunks received: `assembleFile()` creates Blob, triggers download/preview
6. Error handling: Sender can send `{type: 'error', message}` to abort transfer

## Common Issues

**"Connection not ready" toast**
Occurs when user clicks a peer before `connectionManager` is initialized. Fixed by ensuring Socket.IO listeners are registered inside DOMContentLoaded after initialization.

**Duplicate peer entries**
Server uses fingerprinting to detect page refreshes. If same fingerprint connects with new socket ID, old entry is removed and `client-left` event fires before `client-joined`.

**WebRTC connection failures**
Application falls back to exponential backoff retry (max 3 attempts, starting at 500ms). If still failing, shows connection troubleshooting tips.

## Deployment

- Dockerfile present for containerized deployment
- fly.toml configuration for Fly.io deployment
- Environment variable: `PORT` (defaults to 3000)
- Static files served from `public/` directory
