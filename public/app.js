// Connect to the Socket.IO server
const socket = io();

function generateName() {
  const adjectives = [
    "Happy",
    "Brave",
    "Calm",
    "Eager",
    "Gentle",
    "Jolly",
    "Kind",
    "Lively",
    "Proud",
    "Wise",
  ];
  const animals = [
    "Panda",
    "Tiger",
    "Eagle",
    "Dolphin",
    "Fox",
    "Koala",
    "Lion",
    "Owl",
    "Wolf",
    "Zebra",
  ];

  const randomAdjective =
    adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomAnimal = animals[Math.floor(Math.random() * animals.length)];

  return `${randomAdjective}${randomAnimal}`;
}

// Send saved username to server if available
const savedUsername = localStorage.getItem("localTransferUserName");
if (savedUsername) {
  socket.emit("set-username", savedUsername);
} else {
  // 如果没有保存的用户名，生成一个新的用户名
  const clientName = generateName();
  socket.emit("set-username", clientName);
}

// Global variables
let myInfo = null;
let selectedPeer = null;
let peerConnections = {};
let selectedFiles = new Set();
// 存储每个对等方的文件历史
let peerFileHistory = {};

// DOM elements
const userNameElement = document.getElementById("user-name");
const avatarTextElement = document.getElementById("avatar-text");
const peersList = document.getElementById("peers-list");
const transferContainer = document.getElementById("transfer-container");
const backButton = document.getElementById("back-button");
const selectedAvatarText = document.getElementById("selected-avatar-text");
const selectedPeerName = document.getElementById("selected-peer-name");
const fileInput = document.getElementById("file-input");
const fileDropArea = document.getElementById("file-drop-area");
const sendFileBtn = document.getElementById("send-file-btn");
const fileHistory = document.getElementById("file-history");
const messageInput = document.getElementById("message-input");
const sendMessageBtn = document.getElementById("send-message-btn");
const messagesList = document.getElementById("messages-list");
const tabs = document.querySelectorAll(".tab");
const tabContents = document.querySelectorAll(".tab-content");
const filePreviewModal = document.getElementById("file-preview-modal");
const previewFileName = document.getElementById("preview-file-name");
const filePreviewContainer = document.getElementById("file-preview-container");
const fileInfoSize = document.getElementById("file-info-size");
const fileInfoType = document.getElementById("file-info-type");
const saveFileBtn = document.getElementById("save-file-btn");
const toast = document.getElementById("toast");

// 文件列表相关变量
const fileList = document.getElementById('file-list');
const uploadFileRadio = document.getElementById('upload-file');
const uploadFolderRadio = document.getElementById('upload-folder');

// 常量定义
const FILE_TYPE_ICONS = {
    'image': 'fa-file-image',
    'video': 'fa-file-video',
    'audio': 'fa-file-audio',
    'pdf': 'fa-file-pdf',
    'word': 'fa-file-word',
    'excel': 'fa-file-excel',
    'powerpoint': 'fa-file-powerpoint',
    'archive': 'fa-file-archive',
    'default': 'fa-file-alt'
};

const CHUNK_SIZE = 16384; // 16KB chunks
const CONNECTION_TIMEOUT = 15000; // 15 seconds
const ANSWER_TIMEOUT = 20000; // 20 seconds

// 工具函数
const utils = {
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    getFileTypeIcon(file) {
        const type = file.type;
        if (type.startsWith('image/')) return FILE_TYPE_ICONS.image;
        if (type.startsWith('video/')) return FILE_TYPE_ICONS.video;
        if (type.startsWith('audio/')) return FILE_TYPE_ICONS.audio;
        if (type === 'application/pdf') return FILE_TYPE_ICONS.pdf;
        if (type.includes('word')) return FILE_TYPE_ICONS.word;
        if (type.includes('excel') || type.includes('spreadsheet')) return FILE_TYPE_ICONS.excel;
        if (type.includes('powerpoint') || type.includes('presentation')) return FILE_TYPE_ICONS.powerpoint;
        if (type.includes('zip') || type.includes('rar') || type.includes('tar')) return FILE_TYPE_ICONS.archive;
        return FILE_TYPE_ICONS.default;
    },

    getInitials(name) {
        return name.charAt(0);
    },

    readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(",")[1];
                resolve(base64);
            };
            reader.onerror = () => reject(new Error("Error reading file"));
            reader.readAsDataURL(file);
        });
    },

    base64ToBlob(base64, type) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return new Blob([bytes], { type: type });
    }
};

// 文件处理类
class FileHandler {
    constructor() {
        this.selectedFiles = new Set();
        this.peerFileHistory = {};
    }

    createFileItem(file) {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.dataset.fileId = file.name;
        
        const icon = utils.getFileTypeIcon(file);
        const size = utils.formatFileSize(file.size);
        
        fileItem.innerHTML = `
            <i class="fas ${icon} file-icon"></i>
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-size">${size}</div>
            </div>
            <button class="remove-file" aria-label="删除文件">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        const removeBtn = fileItem.querySelector('.remove-file');
        removeBtn.addEventListener('click', () => {
            this.selectedFiles.delete(file);
            fileItem.remove();
            this.updateSendButton();
        });
        
        return fileItem;
    }

    handleFileSelect(files) {
        if (!files || files.length === 0) return;

        fileList.innerHTML = "";
        this.selectedFiles.clear();
        
        Array.from(files).forEach(file => {
            this.selectedFiles.add(file);
            fileList.appendChild(this.createFileItem(file));
        });
        
        this.updateSendButton();
    }

    updateSendButton() {
        const isConnected = selectedPeer && 
            peerConnections[selectedPeer.id]?.dataChannel?.readyState === "open";
        
        const shouldDisable = this.selectedFiles.size === 0 || !isConnected;
        sendFileBtn.disabled = shouldDisable;
        
        if (!shouldDisable) {
            sendFileBtn.style.backgroundColor = 'var(--primary-color)';
            sendFileBtn.style.cursor = 'pointer';
        } else {
            sendFileBtn.style.backgroundColor = 'var(--gray-300)';
            sendFileBtn.style.cursor = 'not-allowed';
        }
    }

    async sendFiles() {
        if (!selectedPeer || this.selectedFiles.size === 0) return;

        const dataChannel = peerConnections[selectedPeer.id]?.dataChannel;
        if (!dataChannel || dataChannel.readyState !== "open") {
            showToast("连接未就绪，请稍后重试");
            return;
        }

        const filesToSend = Array.from(this.selectedFiles);
        
        for (const file of filesToSend) {
            try {
                const base64Data = await utils.readFileAsBase64(file);

                dataChannel.send(JSON.stringify({
                    type: "file-info",
                    info: {
                        name: file.name,
                        size: base64Data.length,
                        type: file.type,
                    },
                }));

                let offset = 0;
                while (offset < base64Data.length) {
                    const chunk = base64Data.slice(offset, offset + CHUNK_SIZE);
                    dataChannel.send(JSON.stringify({
                        type: "file-data",
                        chunk: chunk,
                    }));
                    offset += CHUNK_SIZE;
                }

                this.addFileToHistory({
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    data: file,
                    to: selectedPeer.id,
                    direction: "sent",
                    timestamp: new Date().toISOString(),
                });

                showToast(`i18n:fileSentSuccessfully:${file.name}`);
            } catch (error) {
                console.error("发送文件时出错:", error);
                showToast(`i18n:errorSendingFile:${error.message}`);
            }
        }

        this.resetFileSelection();
    }

    resetFileSelection() {
        fileInput.value = "";
        this.selectedFiles.clear();
        fileList.innerHTML = "";
        this.updateSendButton();
    }

    addFileToHistory(file) {
        const peerId = file.direction === "sent" ? file.to : file.from;
        if (!this.peerFileHistory[peerId]) {
            this.peerFileHistory[peerId] = [];
        }
        this.peerFileHistory[peerId].unshift(file);

        if (selectedPeer && selectedPeer.id === peerId) {
            this.updateFileHistoryDisplay(peerId);
        }
    }

    updateFileHistoryDisplay(peerId) {
        fileHistory.innerHTML = "";

        if (!this.peerFileHistory[peerId]) {
            fileHistory.innerHTML = `
                <div class="empty-history">
                    <i class="fas fa-history"></i>
                    <p>${__("noFileHistory")}</p>
                </div>
            `;
            return;
        }

        this.peerFileHistory[peerId].forEach(file => {
            const historyItem = this.createHistoryItem(file);
            fileHistory.appendChild(historyItem);
        });
    }

    createHistoryItem(file) {
        const historyItem = document.createElement("div");
        historyItem.className = `history-item ${file.direction}`;

        const fileIcon = utils.getFileTypeIcon(file);
        const formattedSize = utils.formatFileSize(file.size);
        const formattedTime = new Date(file.timestamp).toLocaleTimeString();
        const formattedDate = new Date(file.timestamp).toLocaleDateString();

        historyItem.innerHTML = `
            <div class="history-item-content">
                <div class="file-icon-wrapper">
                    <i class="fas ${fileIcon}"></i>
                </div>
                <div class="file-info">
                    <div class="file-name" title="${file.name}">${file.name}</div>
                    <div class="file-meta">
                        <span class="file-size">${formattedSize}</span>
                        <span class="file-date">${formattedDate} ${formattedTime}</span>
                        <span class="file-direction ${file.direction}">
                            <i class="fas ${file.direction === 'sent' ? 'fa-arrow-up' : 'fa-arrow-down'}"></i>
                            ${file.direction === "sent" ? __("sent") : __("received")}
                        </span>
                    </div>
                </div>
                <div class="file-actions">
                    <button class="action-btn preview-btn" title="${__("preview")}">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn download-btn" title="${__("download")}">
                        <i class="fas fa-download"></i>
                    </button>
                </div>
            </div>
        `;

        this.addHistoryItemEventListeners(historyItem, file);
        return historyItem;
    }

    addHistoryItemEventListeners(historyItem, file) {
        const previewBtn = historyItem.querySelector(".preview-btn");
        previewBtn.addEventListener("click", () => {
            showFilePreview(file.data, {
                name: file.name,
                size: file.size,
                type: file.type,
            });
        });

        const downloadBtn = historyItem.querySelector(".download-btn");
        downloadBtn.addEventListener("click", () => {
            saveFile(file.data, file.name);
        });
    }
}

// 连接管理类
class ConnectionManager {
    constructor() {
        this.peerConnections = {};
        this.selectedPeer = null;
        this.currentFileInfo = null;
        this.receivedData = {};
        this.connectionAttempts = {}; // 添加连接尝试计数
    }

    createPeerConnection(peerId, turnOnly = false) {
        // 重置连接尝试计数
        this.connectionAttempts[peerId] = 0;

        const iceServers = this.getIceServers(turnOnly);
        console.log('创建新的对等连接:', {
            peerId,
            turnOnly,
            iceServers
        });

        const peerConnection = new RTCPeerConnection({
            iceServers: iceServers,
            iceCandidatePoolSize: 10,
            iceTransportPolicy: turnOnly ? 'relay' : 'all'
        });

        peerConnection.usingTurnOnly = turnOnly;
        this.setupPeerConnectionHandlers(peerConnection, peerId);
        
        // 存储连接
        this.peerConnections[peerId] = peerConnection;
        
        return peerConnection;
    }

    getIceServers(turnOnly) {
        // 基础 STUN 服务器配置
        const iceServers = [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" }
        ];

        // 如果需要 TURN 服务器，添加它们
        if (turnOnly) {
            iceServers.unshift(
                {
                    urls: [
                        "turn:openrelay.metered.ca:443",
                        "turn:openrelay.metered.ca:80"
                    ],
                    username: "openrelayproject",
                    credential: "openrelayproject",
                }
            );
        }

        return iceServers;
    }

    setupPeerConnectionHandlers(peerConnection, peerId) {
        const dataChannel = peerConnection.createDataChannel("fileTransfer", {
            ordered: true,
        });

        this.setupDataChannelHandlers(dataChannel, peerId);
        this.setupIceHandlers(peerConnection, peerId);
        this.setupConnectionStateHandlers(peerConnection, peerId);

        peerConnection.ondatachannel = (event) => {
            const incomingChannel = event.channel;
            this.setupDataChannelHandlers(incomingChannel, peerId);
        };

        // 存储数据通道
        peerConnection.dataChannel = dataChannel;
    }

    setupDataChannelHandlers(dataChannel, peerId) {
        dataChannel.onopen = () => {
            console.log(`数据通道已打开: ${peerId}`);
            if (this.selectedPeer && this.selectedPeer.id === peerId) {
                updateConnectionStatus("connected");
                fileHandler.updateSendButton();
            }
        };

        dataChannel.onclose = () => {
            console.log(`数据通道已关闭: ${peerId}`);
            if (this.selectedPeer && this.selectedPeer.id === peerId) {
                updateConnectionStatus("disconnected");
            }
        };

        dataChannel.onerror = (error) => {
            console.error(`数据通道错误: ${peerId}`, error);
        };

        dataChannel.onmessage = (event) => {
            this.handleDataChannelMessage(event, peerId);
        };
    }

    setupIceHandlers(peerConnection, peerId) {
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("signal", {
                    to: peerId,
                    signal: {
                        type: "candidate",
                        candidate: event.candidate,
                    },
                });
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log(
                `ICE connection state with ${peerId}: ${peerConnection.iceConnectionState}`
            );
            this.handleIceConnectionStateChange(peerConnection, peerId);
        };
    }

    setupConnectionStateHandlers(peerConnection, peerId) {
        peerConnection.onconnectionstatechange = () => {
            console.log(
                `Connection state with ${peerId}: ${peerConnection.connectionState}`
            );
            this.handleConnectionStateChange(peerConnection, peerId);
        };
    }

    handleIceConnectionStateChange(peerConnection, peerId) {
        console.log('ICE 连接状态变化:', {
            peerId,
            state: peerConnection.iceConnectionState,
            attempts: this.connectionAttempts[peerId]
        });

        if (this.selectedPeer && this.selectedPeer.id === peerId) {
            if (
                peerConnection.iceConnectionState === "connected" ||
                peerConnection.iceConnectionState === "completed"
            ) {
                updateConnectionStatus("connected");
                // 重置连接尝试计数
                this.connectionAttempts[peerId] = 0;
            } else if (peerConnection.iceConnectionState === "failed") {
                this.connectionAttempts[peerId] = (this.connectionAttempts[peerId] || 0) + 1;
                
                if (this.connectionAttempts[peerId] <= 2) {
                    console.log("ICE connection failed, restarting...");
                    peerConnection.restartIce();
                    updateConnectionStatus("connecting");
                } else {
                    console.log("多次 ICE 连接失败，尝试使用 TURN 服务器...");
                    this.recoverConnection(peerId);
                }
            } else if (
                peerConnection.iceConnectionState === "disconnected" ||
                peerConnection.iceConnectionState === "closed"
            ) {
                updateConnectionStatus("disconnected");
            }
        }
    }

    handleConnectionStateChange(peerConnection, peerId) {
        console.log('连接状态变化:', {
            peerId,
            state: peerConnection.connectionState,
            attempts: this.connectionAttempts[peerId]
        });

        if (this.selectedPeer && this.selectedPeer.id === peerId) {
            if (peerConnection.connectionState === "connected") {
                updateConnectionStatus("connected");
                // 重置连接尝试计数
                this.connectionAttempts[peerId] = 0;
            } else if (peerConnection.connectionState === "failed") {
                this.connectionAttempts[peerId] = (this.connectionAttempts[peerId] || 0) + 1;
                
                if (this.connectionAttempts[peerId] <= 2) {
                    console.log("Connection failed, attempting to reconnect...");
                    this.recoverConnection(peerId);
                } else {
                    console.log("多次连接失败，尝试使用 TURN 服务器...");
                    this.recoverConnection(peerId, true);
                }
            } else if (
                peerConnection.connectionState === "disconnected" ||
                peerConnection.connectionState === "closed"
            ) {
                updateConnectionStatus("disconnected");
            }
        }
    }

    recoverConnection(peerId, forceTurnOnly = false) {
        console.log('恢复连接:', {
            peerId,
            forceTurnOnly,
            attempts: this.connectionAttempts[peerId]
        });

        // 关闭现有连接
        if (this.peerConnections[peerId]) {
            this.peerConnections[peerId].close();
            delete this.peerConnections[peerId];
        }

        // 创建新连接
        const turnOnly = forceTurnOnly || this.connectionAttempts[peerId] > 2;
        this.createPeerConnection(peerId, turnOnly);
        this.initiateConnection(peerId);
    }

    async initiateConnection(peerId) {
        try {
            if (this.selectedPeer && this.selectedPeer.id === peerId) {
                updateConnectionStatus("connecting");
                showToast(`i18n:establishingConnection`, 2000);
            }

            const peerConnection = this.peerConnections[peerId];
            if (!peerConnection) {
                console.error("No peer connection found for:", peerId);
                return;
            }

            console.log('发起连接:', {
                peerId,
                turnOnly: peerConnection.usingTurnOnly,
                attempts: this.connectionAttempts[peerId]
            });

            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: false,
                offerToReceiveVideo: false,
                iceRestart: true,
            });

            await peerConnection.setLocalDescription(offer);
            socket.emit("signal", {
                to: peerId,
                signal: peerConnection.localDescription,
            });

            this.setupConnectionTimeout(peerConnection, peerId);
        } catch (error) {
            console.error("Error during connection initiation:", error);
            this.handleConnectionError(error, peerId);
        }
    }

    setupConnectionTimeout(peerConnection, peerId) {
        setTimeout(() => {
            if (
                peerConnection.connectionState !== "connected" &&
                peerConnection.iceConnectionState !== "connected" &&
                peerConnection.iceConnectionState !== "completed"
            ) {
                if (this.selectedPeer && this.selectedPeer.id === peerId) {
                    this.initiateConnection(peerId);
                }
            }
        }, ANSWER_TIMEOUT);
    }

    handleConnectionError(error, peerId) {
        if (this.selectedPeer && this.selectedPeer.id === peerId) {
            showToast(`i18n:connectionError:${error.message}`, 4000, true);
            setTimeout(() => {
                if (this.selectedPeer && this.selectedPeer.id === peerId) {
                    this.recoverConnection(peerId);
                }
            }, 3000);
        }
    }

    handleDataChannelMessage(event, peerId) {
        const data = JSON.parse(event.data);
        if (data.type === "file-info") {
            this.handleFileInfo(data.info, peerId);
        } else if (data.type === "file-data") {
            this.handleFileData(data.chunk, peerId);
        }
    }

    handleFileInfo(fileInfo, peerId) {
        this.currentFileInfo = fileInfo;
        this.receivedData = {
            chunks: [],
            receivedSize: 0,
            fileInfo: fileInfo
        };
        console.log(`开始接收文件: ${fileInfo.name}, 大小: ${fileInfo.size}`);
        showToast(`i18n:receivingFile:${fileInfo.name}`);
    }

    handleFileData(chunk, peerId) {
        if (!this.currentFileInfo) return;

        const currentFile = this.receivedData[this.currentFileInfo.name];
        if (!currentFile) return;

        currentFile.chunks.push(chunk);
        currentFile.receivedSize += chunk.length;

        if (currentFile.receivedSize === this.currentFileInfo.size) {
            this.processReceivedFile(currentFile);
        }
    }

    processReceivedFile(currentFile) {
        try {
            const fileData = currentFile.chunks.join("");
            const fileBlob = utils.base64ToBlob(fileData, this.currentFileInfo.type);

            this.addFileToHistory({
                name: this.currentFileInfo.name,
                size: this.currentFileInfo.size,
                type: this.currentFileInfo.type,
                data: fileBlob,
                from: this.currentFileInfo.from,
                direction: "received",
                timestamp: new Date().toISOString(),
            });

            showFilePreview(fileBlob, this.currentFileInfo);
            showToast(`i18n:fileReceived:${this.currentFileInfo.name}`);
        } catch (error) {
            console.error(`处理文件时出错: ${this.currentFileInfo.name}`, error);
            showToast(`i18n:errorSendingFile:${error.message}`);
        }
    }
}

// 初始化
const fileHandler = new FileHandler();
const connectionManager = new ConnectionManager();

// Initialize when connected to the server
socket.on("init", (data) => {
  // Store user info
  myInfo = data;

  // Save the user name to localStorage for persistence
  localStorage.setItem("localTransferUserName", data.name);

  // Update UI with user info
  userNameElement.textContent = data.name;
  avatarTextElement.textContent = utils.getInitials(data.name);

  // Update page text with current language
  updatePageText();

  // Clear existing peers list to prevent duplicates
  peersList.innerHTML = "";

  // Reset peer connections to ensure clean state
  Object.keys(peerConnections).forEach((id) => {
    if (peerConnections[id]) {
      peerConnections[id].close();
    }
  });
  peerConnections = {};

  // Update the peers list with existing clients
  updatePeersList(data.clients);
});

// Handle new client joining
socket.on("client-joined", (client) => {
  // Add the new client to the peers list
  addPeerToList(client);
  showToast(`${client.name} ${__("joined")}`);
});

// Handle client leaving
socket.on("client-left", (clientId) => {
  // Remove the client from the peers list
  const peerElement = document.getElementById(`peer-${clientId}`);
  if (peerElement) {
    const peerName = peerElement.querySelector(".name").textContent;
    peerElement.remove();
    showToast(`${peerName} ${__("left")}`);

    // If the selected peer left, go back to the peers list
    if (selectedPeer && selectedPeer.id === clientId) {
      showPeersList();
    }

    // Clean up peer connection if it exists
    if (peerConnections[clientId]) {
      peerConnections[clientId].close();
      delete peerConnections[clientId];
    }
  }

  // Update the no peers message if needed
  updateNoPeersMessage();
});

// Handle incoming WebRTC signals
socket.on("signal", async (data) => {
    const { from, signal } = data;

    // If we don't have a peer connection with this client yet, create one
    if (!connectionManager.peerConnections[from]) {
        connectionManager.createPeerConnection(from);
    }

    try {
        const peerConnection = connectionManager.peerConnections[from];
        if (!peerConnection) {
            console.error("No peer connection found for:", from);
            return;
        }

        // Process the signal based on its type
        if (signal.type === "offer") {
            await peerConnection.setRemoteDescription(
                new RTCSessionDescription(signal)
            );
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            // Send the answer back to the peer
            socket.emit("signal", {
                to: from,
                signal: peerConnection.localDescription,
            });
        } else if (signal.type === "answer") {
            await peerConnection.setRemoteDescription(
                new RTCSessionDescription(signal)
            );
        } else if (signal.type === "candidate") {
            await peerConnection.addIceCandidate(
                new RTCIceCandidate(signal.candidate)
            );
        }
    } catch (error) {
        console.error("Error processing signal:", error);
    }
});

// Handle incoming messages
socket.on("receive-message", (data) => {
  addMessageToList(data, false);

  // If the message is from the selected peer, mark as read
  if (selectedPeer && data.from === selectedPeer.id) {
    // Already showing in the current chat
  } else {
    // Show notification or highlight the peer in the list
    const peerElement = document.getElementById(`peer-${data.from}`);
    if (peerElement) {
      peerElement.classList.add("has-notification");
    }

    showToast(`i18n:${__("newMessageFrom")}:${data.fromName}`);
  }
});

// Update the peers list with clients
function updatePeersList(clients) {
  // Clear the current list
  const noPeersElement = peersList.querySelector(".no-peers");
  if (noPeersElement) {
    peersList.innerHTML = "";
  }

  // Add each client to the list
  clients.forEach((client) => {
    addPeerToList(client);
  });

  // Show message if no peers
  updateNoPeersMessage();
}

// Add a peer to the list
function addPeerToList(peer) {
  // Check if peer is null or undefined
  if (!peer) {
    console.warn("Attempted to add null or undefined peer to list");
    return;
  }

  // First, check if this is our own client ID to prevent self-listing
  if (myInfo && peer.id === myInfo.id) {
    console.log("Not adding self to peers list");
    return;
  }

  // Check if peer already exists by ID
  const existingPeerElement = document.getElementById(`peer-${peer.id}`);
  if (existingPeerElement) {
    console.log(
      `Peer with ID ${peer.id} already exists in the list, not adding duplicate`
    );
    return;
  }

  // Check for peers with the same name or fingerprint
  const existingPeers = peersList.querySelectorAll(".peer-item");
  for (const existingPeer of existingPeers) {
    const peerName = existingPeer.querySelector(".name").textContent;
    const peerId = existingPeer.id.replace("peer-", "");

    // If we find a peer with the same name, it's likely a duplicate from a refresh
    if (
      peerName === peer.name ||
      (peer.fingerprint &&
        peerConnections[peerId]?.peer?.fingerprint === peer.fingerprint)
    ) {
      console.log(`Found duplicate peer ${peerName}, cleaning up old entry`);

      // Clean up old peer connection if it exists
      if (peerConnections[peerId]) {
        peerConnections[peerId].close();
        delete peerConnections[peerId];
      }

      // Remove the old peer element
      existingPeer.remove();
      break;
    }
  }

  // Remove the no peers message if it exists
  const noPeersElement = peersList.querySelector(".no-peers");
  if (noPeersElement) {
    noPeersElement.remove();
  }

  // Create the peer element
  const peerElement = document.createElement("div");
  peerElement.id = `peer-${peer.id}`;
  peerElement.className = "peer-item";
  peerElement.innerHTML = `
    <div class="avatar">
      <span>${utils.getInitials(peer.name)}</span>
    </div>
    <div class="name">${peer.name}</div>
  `;

  // Add click event to select the peer
  peerElement.addEventListener("click", () => {
    selectPeer(peer);
  });

  // Add to the list
  peersList.appendChild(peerElement);
}

// Update the no peers message
function updateNoPeersMessage() {
  if (peersList.children.length === 0) {
    peersList.innerHTML = `<div class="no-peers" data-i18n="waitingForPeople">${__(
      "waitingForPeople"
    )}</div>`;
  }
}

// Select a peer to communicate with
function selectPeer(peer) {
    console.log('选择对等方:', peer);
    selectedPeer = peer;
    connectionManager.selectedPeer = peer;

    // Update the UI
    selectedAvatarText.textContent = utils.getInitials(peer.name);
    selectedPeerName.textContent = peer.name;

    // Show the transfer container
    peersList.parentElement.classList.add("hidden");
    transferContainer.classList.remove("hidden");

    // 在显示传输容器之后，更新文件历史显示
    fileHandler.updateFileHistoryDisplay(peer.id);

    // Clear any notification for this peer
    const peerElement = document.getElementById(`peer-${peer.id}`);
    if (peerElement) {
        peerElement.classList.remove("has-notification");
    }

    // Ensure we have a peer connection
    if (!connectionManager.peerConnections[peer.id]) {
        console.log('创建新的对等连接');
        connectionManager.createPeerConnection(peer.id);
        connectionManager.initiateConnection(peer.id);
        updateConnectionStatus("connecting");
    } else {
        console.log('使用现有连接:', {
            dataChannel: connectionManager.peerConnections[peer.id].dataChannel ? '存在' : '不存在',
            dataChannelState: connectionManager.peerConnections[peer.id].dataChannel?.readyState,
            connectionState: connectionManager.peerConnections[peer.id].connectionState
        });
        
        const dataChannel = connectionManager.peerConnections[peer.id].dataChannel;
        if (dataChannel && dataChannel.readyState === "open") {
            updateConnectionStatus("connected");
        } else {
            updateConnectionStatus("connecting");
        }
    }

    // Reset the file input
    fileInput.value = "";
    fileHandler.selectedFiles.clear();
    sendFileBtn.disabled = true;
}

// Show the peers list (go back)
function showPeersList() {
  selectedPeer = null;
  transferContainer.classList.add("hidden");
  peersList.parentElement.classList.remove("hidden");
}

// Show file preview in modal
function showFilePreview(fileData, fileInfo) {
  // Set file name
  previewFileName.textContent = fileInfo.name;

  // Set file info
  fileInfoSize.textContent = `${__("size")}: ${utils.formatFileSize(fileInfo.size)}`;
  fileInfoType.textContent = `${__("type")}: ${fileInfo.type || __("unknown")}`;

  // Clear previous preview
  filePreviewContainer.innerHTML = "";

  // Create appropriate preview based on file type
  if (fileInfo.type.startsWith("image/")) {
    // Image preview
    const img = document.createElement("img");
    img.src = URL.createObjectURL(fileData);
    filePreviewContainer.appendChild(img);
  } else if (fileInfo.type.startsWith("video/")) {
    // Video preview
    const video = document.createElement("video");
    video.controls = true;
    video.src = URL.createObjectURL(fileData);
    filePreviewContainer.appendChild(video);
  } else if (fileInfo.type.startsWith("audio/")) {
    // Audio preview
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = URL.createObjectURL(fileData);
    filePreviewContainer.appendChild(audio);
  } else if (fileInfo.type === "application/pdf") {
    // PDF preview (basic)
    const embed = document.createElement("embed");
    embed.src = URL.createObjectURL(fileData);
    embed.type = "application/pdf";
    embed.style.width = "100%";
    embed.style.height = "300px";
    filePreviewContainer.appendChild(embed);
  } else {
    // Generic file preview
    const div = document.createElement("div");
    div.className = "generic-file-preview";
    div.innerHTML = `
      <div class="file-icon">📄</div>
      <div>${__("fileNotAvailable")}</div>
    `;
    filePreviewContainer.appendChild(div);
  }

  // Set up save button
  saveFileBtn.onclick = () => {
    saveFile(fileData, fileInfo.name);
  };

  // Show the modal
  filePreviewModal.classList.remove("hidden");
}

// Save file to device
function saveFile(fileData, fileName) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(fileData);
  a.download = fileName;
  a.click();
}

// Send a message to the selected peer
function sendMessage() {
  const message = messageInput.value.trim();

  if (!selectedPeer || !message) {
    return;
  }

  // Send the message via the signaling server
  socket.emit("send-message", {
    to: selectedPeer.id,
    message: message,
  });

  // Add the message to the list
  addMessageToList(
    {
      message: message,
      timestamp: new Date().toISOString(),
    },
    true
  );

  // Clear the input
  messageInput.value = "";
}

// Add a message to the messages list
function addMessageToList(data, isSent) {
  const messageElement = document.createElement("div");
  messageElement.className = `message ${
    isSent ? "message-sent" : "message-received"
  }`;

  // Format the timestamp
  const formattedTime = new Date(data.timestamp).toLocaleTimeString();

  // Create the message content
  messageElement.innerHTML = `
    <div class="message-content">${data.message}</div>
    <div class="message-time">${formattedTime}</div>
  `;

  // Add to the messages list
  messagesList.appendChild(messageElement);

  // Scroll to the bottom
  messagesList.scrollTop = messagesList.scrollHeight;
}

// Show a toast notification
function showToast(message, duration = 3000, isError = false) {
  // 检查是否是国际化键
  if (typeof message === "string" && message.startsWith("i18n:")) {
    const parts = message.split(":");
    const key = parts[1];
    const params = parts.slice(2);

    message = __(key);

    // 替换占位符
    params.forEach((param, index) => {
      const placeholder = `{${index}}`;
      message = message.replace(placeholder, param);
    });
  }

  toast.textContent = message;
  toast.classList.remove("hidden");

  if (isError) {
    toast.classList.add("error");
  } else {
    toast.classList.remove("error");
  }

  // Hide after specified duration
  setTimeout(() => {
    toast.classList.add("hidden");
    toast.classList.remove("error");
  }, duration);
}

// Update connection status in the UI
function updateConnectionStatus(status, peerId = null, timeoutReason = null) {
  // Remove any existing status indicator
  const existingStatus = document.querySelector(".connection-status");
  if (existingStatus) {
    existingStatus.remove();
  }

  // Create new status indicator
  const statusElement = document.createElement("div");
  statusElement.className = "connection-status";

  switch (status) {
    case "connecting":
      statusElement.innerHTML = `<span class="status-icon connecting">⏳</span> ${__(
        "connecting"
      )}`;
      sendFileBtn.disabled = true;
      break;
    case "connected":
      statusElement.innerHTML = `<span class="status-icon connected">✅</span> ${__(
        "connected"
      )}`;
      sendFileBtn.disabled = selectedFiles.size === 0;
      break;
    case "disconnected":
      statusElement.innerHTML = `<span class="status-icon disconnected">❌</span> ${__(
        "disconnected"
      )}`;
      sendFileBtn.disabled = true;
      break;
    case "connection-timeout":
      // Add retry button for connection timeout
      const retryButton = document.createElement("button");
      retryButton.className = "retry-btn";
      retryButton.textContent = __("retryConnection");
      retryButton.onclick = () => {
        if (peerId && selectedPeer && selectedPeer.id === peerId) {
          // Close the old connection
          if (peerConnections[peerId]) {
            peerConnections[peerId].close();
          }
          // Create a new connection
          updateConnectionStatus("connecting");
          connectionManager.createPeerConnection(peerId);
          connectionManager.initiateConnection(peerId);
        }
      };

      // Add alternative connection button that uses TURN-only approach
      const turnButton = document.createElement("button");
      turnButton.className = "turn-btn";
      turnButton.textContent = __("tryAlternative");
      turnButton.onclick = () => {
        if (peerId && selectedPeer && selectedPeer.id === peerId) {
          // Close the old connection
          if (peerConnections[peerId]) {
            peerConnections[peerId].close();
          }
          // Create a new connection with TURN emphasis
          updateConnectionStatus("connecting");
          connectionManager.createPeerConnection(peerId, true);
          connectionManager.initiateConnection(peerId);
        }
      };

      statusElement.innerHTML = `<span class="status-icon disconnected">⚠️</span> ${__(
        "connectionTimeout"
      )}`;

      // Add reason if provided
      if (timeoutReason) {
        const reasonElement = document.createElement("div");
        reasonElement.className = "timeout-reason";
        reasonElement.textContent = timeoutReason;
        statusElement.appendChild(reasonElement);
      }

      // Add buttons
      const buttonContainer = document.createElement("div");
      buttonContainer.className = "connection-buttons";
      buttonContainer.appendChild(retryButton);
      buttonContainer.appendChild(turnButton);
      statusElement.appendChild(buttonContainer);

      sendFileBtn.disabled = true;
      break;
    default:
      statusElement.innerHTML = `<span class="status-icon unknown">❓</span> ${__(
        "unknown"
      )}`;
      sendFileBtn.disabled = true;
  }

  // Add the status indicator to the UI
  const fileTransferArea = document.querySelector(".file-transfer-area");
  fileTransferArea.insertBefore(statusElement, fileDropArea);
}

// Event listeners
document.addEventListener("DOMContentLoaded", () => {
  // 创建语言选择器
  createLanguageSelector("language-container");

  // 初始化页面文本
  updatePageText();

  // Message input placeholder
  messageInput.placeholder = __("typeMessage");

  // Tab switching
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      // Remove active class from all tabs and contents
      tabs.forEach((t) => t.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));

      // Add active class to clicked tab and corresponding content
      tab.classList.add("active");
      document.getElementById(`${tab.dataset.tab}-tab`).classList.add("active");
    });
  });

  const fileInput = document.getElementById('file-input');
  const uploadFileRadio = document.getElementById("upload-file");
  const uploadFolderRadio = document.getElementById("upload-folder");

  // 修改事件监听方式，使用 change 和 click 事件
  function updateFileInputAttributes() {
    if (uploadFileRadio.checked) {
      fileInput.removeAttribute("webkitdirectory");
      fileInput.removeAttribute("directory");
    } else {
      fileInput.setAttribute("webkitdirectory", "");
      fileInput.setAttribute("directory", "");
    }
  }

  // 为两个单选按钮都添加事件监听
  [uploadFileRadio, uploadFolderRadio].forEach(radio => {
    radio.addEventListener("change", updateFileInputAttributes);
  });

  // 初始化时设置属性
  updateFileInputAttributes();

  // Back button
  backButton.addEventListener("click", showPeersList);

  // File input change
  fileInput.addEventListener("change", (e) => {
    fileHandler.handleFileSelect(e.target.files);
  });

  // File drop area
  fileDropArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    fileDropArea.classList.add("drag-over");
  });

  fileDropArea.addEventListener("dragleave", () => {
    fileDropArea.classList.remove("drag-over");
  });

  fileDropArea.addEventListener("drop", (e) => {
    e.preventDefault();
    fileDropArea.classList.remove("drag-over");
    fileHandler.handleFileSelect(e.dataTransfer.files);
  });

  // Send file button
  sendFileBtn.addEventListener("click", () => fileHandler.sendFiles());

  // Send message button
  sendMessageBtn.addEventListener("click", sendMessage);

  // Message input enter key
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  });

  // Close modal
  document.querySelector(".close-modal").addEventListener("click", () => {
    filePreviewModal.classList.add("hidden");
  });

  // Close modal when clicking outside
  filePreviewModal.addEventListener("click", (e) => {
    if (e.target === filePreviewModal) {
      filePreviewModal.classList.add("hidden");
    }
  });
});

// 添加语言变更事件监听器
document.addEventListener("languageChanged", (e) => {
  console.log(`语言已变更为: ${e.detail.lang}`);

  // 更新动态生成的元素
  updateNoPeersMessage();

  // 更新连接状态文本
  if (selectedPeer && peerConnections[selectedPeer.id]) {
    const status = peerConnections[selectedPeer.id].dataChannel
      ? peerConnections[selectedPeer.id].dataChannel.readyState
      : "disconnected";
    updateConnectionStatus(status === "open" ? "connected" : status);
  }

  // 更新文件历史记录中的文本
  const historyItems = document.querySelectorAll(".history-item");
  historyItems.forEach((item) => {
    const directionText = item.querySelector(".file-meta");
    if (directionText) {
      // 更新方向文本 (sent/received)
      const isSent =
        directionText.textContent.includes("sent") ||
        directionText.textContent.includes("已发送");
      const newText = directionText.textContent.replace(
        isSent ? /(sent|已发送)/ : /(received|已接收)/,
        isSent ? __("sent") : __("received")
      );
      directionText.textContent = newText;
    }

    // 更新"查看"按钮文本
    const viewBtn = item.querySelector(".file-action");
    if (viewBtn) {
      viewBtn.textContent = __("view");
    }
  });
});
