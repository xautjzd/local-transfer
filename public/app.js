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

// Initialize connection
function initializeConnection() {
    // Try to get saved username from localStorage
    const savedName = localStorage.getItem('localTransferUserName') || generateName();
    
    // Send the username to the server
    socket.emit('set-username', savedName);
}

// Initialize the connection when page loads
initializeConnection();

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

const CHUNK_SIZE = 16 * 1024; // 降低到16KB，大文件传输更稳定
const MAX_CHUNK_SIZE = 256 * 1024; // 最大256KB
const CONNECTION_TIMEOUT = 15000; // 15 seconds
const ANSWER_TIMEOUT = 20000; // 20 seconds
const MOBILE_MAX_CHUNK_SIZE = 32 * 1024; // 移动端最大32KB
const PROGRESS_UPDATE_INTERVAL = 3000; // 每3秒更新一次进度，减少UI负担

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
        this.isProcessingFolder = false;
        this.maxFilesInFolder = 1000;
        this.currentTransfer = null;
    }

    handleFileSelect(files) {
        if (!files || files.length === 0) return;

        // Clear previous selection
        fileList.innerHTML = "";
        this.selectedFiles.clear();

        // Convert FileList to Array and process
        const fileArray = Array.from(files);
        
        // 检查是否超过文件数量限制
        if (fileArray.length > this.maxFilesInFolder) {
            showToast(`文件数量超过限制 (${this.maxFilesInFolder})`, 3000, true);
            return;
        }

        // 使用批处理来处理文件
        this.processBatch(fileArray);
    }

    processBatch(files, startIndex = 0) {
        const batchSize = 50; // 每批处理的文件数量
        const endIndex = Math.min(startIndex + batchSize, files.length);
        const currentBatch = files.slice(startIndex, endIndex);

        currentBatch.forEach(file => {
            this.selectedFiles.add(file);
            const fileItem = this.createFileItem(file, file.webkitRelativePath || '');
            fileList.appendChild(fileItem);
        });

        // 更新发送按钮状态
        this.updateSendButton();

        // 如果还有剩余文件，安排下一批处理
        if (endIndex < files.length) {
            setTimeout(() => {
                this.processBatch(files, endIndex);
            }, 0);
        }
    }

    createFileItem(file, relativePath = '') {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        const displayPath = relativePath ? relativePath : file.name;
        const icon = utils.getFileTypeIcon(file);
        const size = utils.formatFileSize(file.size);
        
        fileItem.innerHTML = `
            <i class="fas ${icon} file-icon"></i>
            <div class="file-info">
                <div class="file-name" title="${displayPath}">${displayPath}</div>
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

    updateSendButton() {
        const hasFiles = this.selectedFiles.size > 0;
        const peerConnection = connectionManager.peerConnections[selectedPeer?.id];
        const dataChannel = peerConnection?.dataChannel;
        const isConnected = peerConnection?.connectionState === "connected" && dataChannel?.readyState === "open";
        
        sendFileBtn.disabled = !hasFiles || !isConnected;
        
        if (hasFiles && isConnected) {
            sendFileBtn.style.backgroundColor = 'var(--primary-color)';
            sendFileBtn.style.cursor = 'pointer';
        } else {
            sendFileBtn.style.backgroundColor = 'var(--gray-300)';
            sendFileBtn.style.cursor = 'not-allowed';
        }
    }

    async sendFiles() {
        if (!selectedPeer || this.selectedFiles.size === 0) return;

        const peerConnection = connectionManager.peerConnections[selectedPeer.id];
        const dataChannel = peerConnection?.dataChannel;
        
        if (!dataChannel || dataChannel.readyState !== "open") {
            showToast("连接未就绪，请稍后重试");
            return;
        }

        const filesToSend = Array.from(this.selectedFiles);
        
        for (const file of filesToSend) {
            try {
                // 设置当前传输文件
                this.currentTransfer = {
                    file: file,
                    totalSize: file.size,
                    sentSize: 0,
                    lastProgressUpdate: 0
                };

                const base64Data = await utils.readFileAsBase64(file);

                // 发送文件信息
                dataChannel.send(JSON.stringify({
                    type: "file-info",
                    info: {
                        name: file.name,
                        size: base64Data.length,
                        type: file.type,
                    },
                }));

                // 分块发送文件数据，使用流量控制
                let offset = 0;
                let lastProgressTime = Date.now();
                const totalChunks = Math.ceil(base64Data.length / CHUNK_SIZE);
                
                // 计算最佳缓冲区大小 - 动态根据文件大小调整
                let MAX_BUFFER_SIZE;
                if (file.size > 100 * 1024 * 1024) { // 100MB+
                    MAX_BUFFER_SIZE = 1024 * 1024; // 1MB
                } else if (file.size > 20 * 1024 * 1024) { // 20MB+
                    MAX_BUFFER_SIZE = 512 * 1024; // 512KB
                } else {
                    MAX_BUFFER_SIZE = 256 * 1024; // 256KB
                }
                
                console.log(`文件大小: ${utils.formatFileSize(file.size)}, 使用缓冲区大小: ${utils.formatFileSize(MAX_BUFFER_SIZE)}`);
                
                // 动态等待时间计算函数 - 根据缓冲区填充程度调整等待时间
                const calculateWaitTime = (bufferedAmount) => {
                    const fillPercentage = bufferedAmount / MAX_BUFFER_SIZE;
                    // 缓冲区越满，等待时间越长
                    if (fillPercentage > 0.9) return 300;
                    if (fillPercentage > 0.7) return 200;
                    if (fillPercentage > 0.5) return 150;
                    return 100;
                };
                
                // 使用队列和流量控制机制发送数据
                while (offset < base64Data.length) {
                    // 检查数据通道状态
                    if (dataChannel.readyState !== "open") {
                        throw new Error("数据通道已关闭");
                    }
                    
                    // 检查缓冲区是否已满，如果满了则等待缓冲区清空
                    if (dataChannel.bufferedAmount > MAX_BUFFER_SIZE) {
                        const waitTime = calculateWaitTime(dataChannel.bufferedAmount);
                        if (dataChannel.bufferedAmount > MAX_BUFFER_SIZE * 1.5) {
                            console.log(`缓冲区严重溢出 (${dataChannel.bufferedAmount} bytes), 等待 ${waitTime}ms...`);
                        }
                        // 等待缓冲区减少
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                        continue; // 跳过本次循环，重新检查缓冲区
                    }

                    const chunk = base64Data.slice(offset, offset + CHUNK_SIZE);
                    
                    // 发送数据块
                    dataChannel.send(JSON.stringify({
                        type: "file-data",
                        chunk: chunk,
                    }));

                    offset += CHUNK_SIZE;
                    
                    // 更新传输进度，但降低频率
                    this.currentTransfer.sentSize = offset;
                    const now = Date.now();
                    if (now - lastProgressTime > PROGRESS_UPDATE_INTERVAL) {
                        const progress = Math.min(Math.round((offset / base64Data.length) * 100), 99);
                        showToast(`正在发送 ${file.name}: ${progress}%`, 1000);
                        lastProgressTime = now;
                        
                        // 大文件传输时，显示缓冲区状态
                        if (file.size > 20 * 1024 * 1024) {
                            console.log(`传输进度: ${progress}%, 缓冲区: ${dataChannel.bufferedAmount} bytes`);
                        }
                    }
                    
                    // 每发送10个数据块，给一个小延迟让网络"喘息"
                    if (offset % (CHUNK_SIZE * 10) === 0) {
                        await new Promise(resolve => setTimeout(resolve, 1));
                    }
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
                
                // 清理当前传输
                this.currentTransfer = null;
            } catch (error) {
                console.error("发送文件时出错:", error);
                showToast(`i18n:errorSendingFile:${error.message}`);
                this.currentTransfer = null;
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

        if (!this.peerFileHistory[peerId] || this.peerFileHistory[peerId].length === 0) {
            fileHistory.innerHTML = `
                <div class="empty-history">
                    <i class="fas fa-history"></i>
                    <p data-i18n="noFileHistory">${__("noFileHistory")}</p>
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
        
        // 检测是否为移动设备
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // 文件名可能过长，对于移动端进行截断处理
        let displayName = file.name;
        // 如果是移动设备，并且文件名长度超过18个字符，进行截断
        if (isMobile && displayName.length > 18) {
            const extension = displayName.lastIndexOf('.') > -1 ? 
                displayName.substring(displayName.lastIndexOf('.')) : '';
            const baseName = extension ? 
                displayName.substring(0, displayName.lastIndexOf('.')) : displayName;
            
            // 如果有扩展名，保留扩展名，截断中间部分
            if (extension) {
                if (baseName.length > 12) {
                    displayName = baseName.substring(0, 10) + '...' + extension;
                }
            } else {
                // 没有扩展名，直接截断
                displayName = displayName.substring(0, 15) + '...';
            }
        }

        historyItem.innerHTML = `
            <div class="history-item-content">
                <div class="file-icon-wrapper">
                    <i class="fas ${fileIcon}"></i>
                </div>
                <div class="file-info">
                    <div class="file-name" title="${file.name}">${displayName}</div>
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
                    <button class="action-btn preview-btn" title="${__("view")}">
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
        this.connectionAttempts = {};
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        this.isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.transferTimeout = null;
        this.lastProgressUpdate = 0;
        this.heartbeatInterval = null;
    }

    createPeerConnection(peerId, turnOnly = false) {
        // 如果连接已存在，先关闭并移除
        if (this.peerConnections[peerId]) {
            // 尝试关闭数据通道
            if (this.peerConnections[peerId].dataChannel) {
                try {
                    this.peerConnections[peerId].dataChannel.close();
                } catch (e) {
                    console.error("关闭数据通道时出错:", e);
                }
            }
            // 关闭连接
            try {
                this.peerConnections[peerId].close();
            } catch (e) {
                console.error("关闭连接时出错:", e);
            }
            delete this.peerConnections[peerId];
        }

        // 构建ICE服务器配置
        const iceServers = [
            { urls: "stun:stun.stunprotocol.org:3478" },
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
            { urls: "stun:stun3.l.google.com:19302" },
            { urls: "stun:stun4.l.google.com:19302" },
        ];
        
        // 如果使用TURN服务器
        if (turnOnly) {
            iceServers.push({
                urls: "turn:openrelay.metered.ca:80",
                username: "openrelayproject",
                credential: "openrelayproject",
            });
        }

        // 创建新的连接
        const peerConnection = new RTCPeerConnection({
            iceServers: iceServers,
            iceCandidatePoolSize: 10,
            bundlePolicy: "max-bundle",
            rtcpMuxPolicy: "require",
            iceTransportPolicy: turnOnly ? "relay" : "all",
        });

        // 设置连接处理器
        this.setupPeerConnectionHandlers(peerConnection, peerId);
        // 存储连接
        this.peerConnections[peerId] = peerConnection;
        
        // 重置连接尝试次数
        if (!turnOnly) {
            this.connectionAttempts[peerId] = 0;
        }

        return peerConnection;
    }

    setupPeerConnectionHandlers(peerConnection, peerId) {
        const dataChannel = peerConnection.createDataChannel("fileTransfer", {
            ordered: true,
            maxRetransmits: 30,  // 最多重传30次
            priority: "high"  // 高优先级
        });

        this.setupDataChannelHandlers(dataChannel, peerId);
        this.setupIceHandlers(peerConnection, peerId);
        this.setupConnectionStateHandlers(peerConnection, peerId);

        peerConnection.ondatachannel = (event) => {
            console.log(`收到数据通道: ${event.channel.label}`);
            const incomingChannel = event.channel;
            this.setupDataChannelHandlers(incomingChannel, peerId);
        };

        // 存储数据通道
        peerConnection.dataChannel = dataChannel;

        // 清理旧的心跳检测
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        // 设置心跳检测 - 降低频率到10秒一次
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat(peerId);
        }, 10000); // 10秒发送一次心跳
    }

    sendHeartbeat(peerId) {
        const peerConnection = this.peerConnections[peerId];
        if (!peerConnection || !peerConnection.dataChannel || peerConnection.dataChannel.readyState !== "open") {
            return;
        }

        try {
            // 记录发送时间
            const sendTime = Date.now();
            
            // 添加超时检测
            const heartbeatTimeout = setTimeout(() => {
                console.log(`与 ${peerId} 的心跳包响应超时`);
                if (this.selectedPeer && this.selectedPeer.id === peerId) {
                    // 如果超过1秒没有响应，尝试检查连接状态
                    this.checkAndUpdateConnectionStatus(peerId);
                }
            }, 2000); // 2秒超时
            
            // 存储该心跳检测的超时处理器
            peerConnection.heartbeatTimeouts = peerConnection.heartbeatTimeouts || {};
            peerConnection.heartbeatTimeouts[sendTime] = heartbeatTimeout;
            
            peerConnection.dataChannel.send(JSON.stringify({
                type: "heartbeat",
                timestamp: sendTime
            }));
        } catch (error) {
            console.error("发送心跳包时出错:", error);
        }
    }

    setupDataChannelHandlers(dataChannel, peerId) {
        dataChannel.onopen = () => {
            console.log(`数据通道已打开: ${peerId}, readyState:`, dataChannel.readyState);
            if (this.selectedPeer && this.selectedPeer.id === peerId) {
                updateConnectionStatus("connected");
                fileHandler.updateSendButton();
                
                // 清除之前的超时
                if (this.transferTimeout) {
                    clearTimeout(this.transferTimeout);
                    this.transferTimeout = null;
                }
            }
        };

        dataChannel.onclose = () => {
            console.log(`数据通道已关闭: ${peerId}, readyState:`, dataChannel.readyState);
            if (this.selectedPeer && this.selectedPeer.id === peerId) {
                if (this.isMobile) {
                    // 移动端给更长的重连延迟
                    setTimeout(() => {
                        // 检查是否正在传输文件
                        if (fileHandler.currentTransfer) {
                            showToast("文件传输中断，请重试", 3000, true);
                            fileHandler.currentTransfer = null;
                        }
                        this.checkAndUpdateConnectionStatus(peerId);
                        if (this.peerConnections[peerId]?.connectionState !== "connected") {
                            this.recoverConnection(peerId);
                        }
                    }, 2000);
                } else {
                    updateConnectionStatus("disconnected");
                }
                fileHandler.updateSendButton();
            }
        };

        dataChannel.onerror = (error) => {
            console.error(`数据通道错误: ${peerId}`, error);
            if (this.isMobile) {
                // 检查是否正在传输文件
                if (fileHandler.currentTransfer) {
                    showToast("文件传输出错，请重试", 3000, true);
                    fileHandler.currentTransfer = null;
                }
                this.recoverConnection(peerId);
            }
            fileHandler.updateSendButton();
        };

        // 添加缓冲区阈值监控 - 当缓冲区超过阈值时记录日志
        dataChannel.bufferedAmountLowThreshold = 256 * 1024; // 256KB
        dataChannel.onbufferedamountlow = () => {
            console.log(`数据通道缓冲区低于阈值: ${dataChannel.bufferedAmount} bytes`);
        };

        dataChannel.onmessage = (event) => {
            // 重置传输超时
            if (this.transferTimeout) {
                clearTimeout(this.transferTimeout);
            }
            
            // 根据文件大小调整超时时间
            let timeoutDuration = 30000; // 默认30秒
            if (fileHandler.currentTransfer && fileHandler.currentTransfer.totalSize) {
                // 大文件给更长的超时时间 - 每10MB增加30秒
                const sizeMB = fileHandler.currentTransfer.totalSize / (1024 * 1024);
                const additionalTime = Math.floor(sizeMB / 10) * 30000;
                timeoutDuration = Math.min(30000 + additionalTime, 300000); // 最多5分钟
            }
            
            // 设置新的超时
            this.transferTimeout = setTimeout(() => {
                if (fileHandler.currentTransfer) {
                    showToast("文件传输超时，请重试", 3000, true);
                    fileHandler.currentTransfer = null;
                    this.checkAndUpdateConnectionStatus(peerId);
                }
            }, timeoutDuration);
            
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
            iceState: peerConnection.iceConnectionState,
            dataChannelState: peerConnection.dataChannel?.readyState,
            attempts: this.connectionAttempts[peerId]
        });

        if (this.selectedPeer && this.selectedPeer.id === peerId) {
            this.checkAndUpdateConnectionStatus(peerId);

            if (peerConnection.connectionState === "failed") {
                this.connectionAttempts[peerId] = (this.connectionAttempts[peerId] || 0) + 1;
                
                if (this.connectionAttempts[peerId] <= 3) {
                    console.log("Connection failed, attempting to reconnect...");
                    // 移动端使用更长的重连延迟
                    setTimeout(() => {
                        this.recoverConnection(peerId);
                    }, this.isMobile ? 2000 : 1000);
                } else {
                    console.log("多次连接失败，尝试使用 TURN 服务器...");
                    this.recoverConnection(peerId, true);
                }
            }
        }
    }

    checkAndUpdateConnectionStatus(peerId) {
        const peerConnection = this.peerConnections[peerId];
        if (!peerConnection) return;

        const dataChannel = peerConnection.dataChannel;
        const connectionState = peerConnection.connectionState;
        const iceConnectionState = peerConnection.iceConnectionState;
        
        console.log('检查连接状态:', {
            peerId,
            connectionState,
            iceConnectionState,
            dataChannelState: dataChannel?.readyState,
            isMobile: this.isMobile
        });

        // 检查数据通道是否健康
        if (dataChannel && dataChannel.readyState === "open") {
            // 发送一个测试消息以验证通道是否真的可用
            try {
                dataChannel.send(JSON.stringify({
                    type: "connection_check",
                    timestamp: Date.now()
                }));
            } catch (error) {
                console.error('数据通道发送测试消息失败:', error);
                // 数据通道可能已经损坏，尝试重建连接
                if (this.selectedPeer && this.selectedPeer.id === peerId) {
                    this.recoverConnection(peerId);
                    return;
                }
            }
        }

        // 移动端使用更宽松的连接状态判断
        if (this.isMobile) {
            const isConnected = (
                (connectionState === 'connected' || connectionState === 'completed') ||
                (iceConnectionState === 'connected' || iceConnectionState === 'completed') ||
                dataChannel?.readyState === 'open'
            );
            updateConnectionStatus(isConnected ? "connected" : "disconnected");
        } else {
            // PC端使用更严格的判断
            const isConnected = (
                connectionState === 'connected' &&
                (iceConnectionState === 'connected' || iceConnectionState === 'completed') &&
                dataChannel?.readyState === 'open'
            );
            updateConnectionStatus(isConnected ? "connected" : "disconnected");
        }
        
        // 如果连接状态不佳，在移动端主动触发重连
        if (this.isMobile && 
            (connectionState !== 'connected' || 
             iceConnectionState !== 'connected' && iceConnectionState !== 'completed' ||
             dataChannel?.readyState !== 'open')) {
            console.log('连接状态不佳，考虑重新连接');
            
            // 增加延迟，避免频繁重连
            const reconnectDelay = this.connectionAttempts[peerId] ? 3000 + (this.connectionAttempts[peerId] * 1000) : 3000;
            
            setTimeout(() => {
                if (this.selectedPeer && this.selectedPeer.id === peerId &&
                    (peerConnection.connectionState !== 'connected' || 
                     dataChannel?.readyState !== 'open')) {
                    console.log('执行重连...');
                    this.recoverConnection(peerId);
                }
            }, reconnectDelay);
        }
    }

    recoverConnection(peerId, forceTurnOnly = false) {
        console.log('恢复连接:', {
            peerId,
            forceTurnOnly,
            attempts: this.connectionAttempts[peerId],
            isMobile: this.isMobile
        });

        // 关闭现有连接
        if (this.peerConnections[peerId]) {
            this.peerConnections[peerId].close();
            delete this.peerConnections[peerId];
        }

        // 移动端默认使用 TURN 服务器
        const turnOnly = forceTurnOnly || (this.isMobile && this.connectionAttempts[peerId] > 1);
        this.createPeerConnection(peerId, turnOnly);
        
        // 移动端延迟发起连接
        setTimeout(() => {
            this.initiateConnection(peerId);
        }, this.isMobile ? 1000 : 0);
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
        try {
            const data = JSON.parse(event.data);
            
            // 处理心跳包
            if (data.type === "heartbeat") {
                // 直接响应心跳包，不进行额外处理
                const peerConnection = this.peerConnections[peerId];
                if (peerConnection && peerConnection.dataChannel && peerConnection.dataChannel.readyState === "open") {
                    peerConnection.dataChannel.send(JSON.stringify({
                        type: "heartbeat_ack",
                        timestamp: data.timestamp,
                        responseTime: Date.now()
                    }));
                }
                return;
            }
            
            // 处理心跳响应
            if (data.type === "heartbeat_ack") {
                const peerConnection = this.peerConnections[peerId];
                if (!peerConnection) return;
                
                // 清除此心跳的超时处理
                if (peerConnection.heartbeatTimeouts && peerConnection.heartbeatTimeouts[data.timestamp]) {
                    clearTimeout(peerConnection.heartbeatTimeouts[data.timestamp]);
                    delete peerConnection.heartbeatTimeouts[data.timestamp];
                }
                
                // 计算延迟
                const latency = Date.now() - data.timestamp;
                
                // 只记录合理范围内的延迟
                if (latency < 60000) { // 60秒以内的延迟才是有效的
                    console.log(`与 ${peerId} 的连接延迟: ${latency}ms`);
                    
                    // 如果延迟超过5秒，可能存在连接问题
                    if (latency > 5000 && this.selectedPeer && this.selectedPeer.id === peerId) {
                        console.warn(`检测到高延迟(${latency}ms)，检查连接状态`);
                        this.checkAndUpdateConnectionStatus(peerId);
                    }
                    
                    // 如果延迟超过10秒，尝试恢复连接
                    if (latency > 10000 && this.selectedPeer && this.selectedPeer.id === peerId) {
                        console.warn(`检测到极高延迟(${latency}ms)，尝试恢复连接`);
                        this.recoverConnection(peerId);
                    }
                }
                return;
            }
            
            // 处理错误报告
            if (data.type === "error") {
                console.error(`接收到对方错误报告: ${data.message}`);
                showToast(`传输错误: ${data.message}`, 3000, true);
                return;
            }
            
            // 处理传输状态确认
            if (data.type === "transfer_ack") {
                console.log(`收到传输确认: ${data.status}`, data);
                if (data.status === "error" && fileHandler.currentTransfer) {
                    showToast(`对方接收文件时出错: ${data.message}`, 3000, true);
                    fileHandler.currentTransfer = null;
                }
                return;
            }
            
            if (data.type === "file-info") {
                // 使用错误处理包装
                this.handleFileInfoSafely(data.info, peerId);
            } else if (data.type === "file-data") {
                this.handleFileData(data.chunk, peerId);
            }
        } catch (error) {
            console.error("处理数据通道消息时出错:", error);
            
            // 发送错误信息给对方
            try {
                const peerConnection = this.peerConnections[peerId];
                if (peerConnection && peerConnection.dataChannel && peerConnection.dataChannel.readyState === "open") {
                    peerConnection.dataChannel.send(JSON.stringify({
                        type: "error",
                        message: `处理消息时出错: ${error.message}`,
                        timestamp: Date.now()
                    }));
                }
            } catch (e) {
                console.error("发送错误报告失败:", e);
            }
        }
    }
    
    // 安全处理文件信息，带错误处理和确认机制
    handleFileInfoSafely(fileInfo, peerId) {
        try {
            // 检查是否已有传输任务
            if (this.currentFileInfo) {
                // 正在接收另一个文件，拒绝新的传输
                const peerConnection = this.peerConnections[peerId];
                if (peerConnection && peerConnection.dataChannel && peerConnection.dataChannel.readyState === "open") {
                    peerConnection.dataChannel.send(JSON.stringify({
                        type: "transfer_ack",
                        status: "error",
                        message: "正在接收其他文件，请稍后再试",
                        timestamp: Date.now()
                    }));
                }
                return;
            }
            
            // 检查文件大小是否合理
            const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB
            if (fileInfo.size > MAX_FILE_SIZE) {
                const peerConnection = this.peerConnections[peerId];
                if (peerConnection && peerConnection.dataChannel && peerConnection.dataChannel.readyState === "open") {
                    peerConnection.dataChannel.send(JSON.stringify({
                        type: "transfer_ack",
                        status: "error",
                        message: "文件过大，超过限制",
                        timestamp: Date.now()
                    }));
                }
                return;
            }
            
            // 处理文件信息
            this.currentFileInfo = fileInfo;
            this.receivedData[fileInfo.name] = {
                chunks: [],
                receivedSize: 0,
                fileInfo: fileInfo,
                startTime: Date.now()
            };
            
            console.log(`开始接收文件: ${fileInfo.name}, 大小: ${fileInfo.size}`);
            showToast(`i18n:receivingFile:${fileInfo.name}`);
            
            // 发送确认消息
            const peerConnection = this.peerConnections[peerId];
            if (peerConnection && peerConnection.dataChannel && peerConnection.dataChannel.readyState === "open") {
                peerConnection.dataChannel.send(JSON.stringify({
                    type: "transfer_ack",
                    status: "ok",
                    filename: fileInfo.name,
                    timestamp: Date.now()
                }));
            }
        } catch (error) {
            console.error("处理文件信息时出错:", error);
            
            // 发送错误消息给对方
            const peerConnection = this.peerConnections[peerId];
            if (peerConnection && peerConnection.dataChannel && peerConnection.dataChannel.readyState === "open") {
                peerConnection.dataChannel.send(JSON.stringify({
                    type: "transfer_ack",
                    status: "error",
                    message: `处理文件信息时出错: ${error.message}`,
                    timestamp: Date.now()
                }));
            }
        }
    }
    
    // 旧的handleFileInfo方法保留以保持兼容性
    handleFileInfo(fileInfo, peerId) {
        return this.handleFileInfoSafely(fileInfo, peerId);
    }

    handleFileData(chunk, peerId) {
        if (!this.currentFileInfo) return;

        const currentFile = this.receivedData[this.currentFileInfo.name];
        if (!currentFile) return;

        currentFile.chunks.push(chunk);
        currentFile.receivedSize += chunk.length;

        // 显示接收进度，但降低频率
        const now = Date.now();
        if (now - this.lastProgressUpdate > PROGRESS_UPDATE_INTERVAL) {
            const progress = Math.min(Math.round((currentFile.receivedSize / this.currentFileInfo.size) * 100), 99);
            showToast(`正在接收 ${this.currentFileInfo.name}: ${progress}%`, 1000);
            this.lastProgressUpdate = now;
        }

        if (currentFile.receivedSize >= this.currentFileInfo.size) {
            // 清除传输超时
            if (this.transferTimeout) {
                clearTimeout(this.transferTimeout);
                this.transferTimeout = null;
            }
            
            // 使用setTimeout给主线程一个喘息的机会，防止UI阻塞
            setTimeout(() => {
                this.processReceivedFile(currentFile, peerId);
            }, 100);
        }
    }

    processReceivedFile(currentFile, peerId) {
        try {
            console.log(`处理接收到的文件: ${this.currentFileInfo.name}, 大小: ${currentFile.receivedSize} bytes`);
            
            // 大文件处理优化：分批次连接数据，避免内存问题
            let fileData = "";
            if (currentFile.chunks.length > 1000) {
                // 对于非常大的文件，分批连接
                const batchSize = 500;
                for (let i = 0; i < currentFile.chunks.length; i += batchSize) {
                    const batch = currentFile.chunks.slice(i, i + batchSize);
                    fileData += batch.join("");
                    
                    // 清除已处理的批次以释放内存
                    if (i > 0) {
                        currentFile.chunks.splice(0, batchSize);
                        i -= batchSize;
                    }
                }
            } else {
                // 小文件直接连接
                fileData = currentFile.chunks.join("");
            }
            
            const fileBlob = utils.base64ToBlob(fileData, this.currentFileInfo.type);
            const fileInfo = this.currentFileInfo;

            // Add to file history
            fileHandler.addFileToHistory({
                name: fileInfo.name,
                size: fileInfo.size,
                type: fileInfo.type,
                data: fileBlob,
                from: peerId,
                direction: "received",
                timestamp: new Date().toISOString()
            });

            // Show preview and notification
            showToast(`i18n:fileReceived:${fileInfo.name}`);
            
            // 大文件不自动预览，避免浏览器崩溃
            if (fileInfo.size < 5 * 1024 * 1024) { // 5MB以下的文件才自动预览
                showFilePreview(fileBlob, fileInfo);
            }

            // Clean up
            delete this.receivedData[fileInfo.name];
            this.currentFileInfo = null;
            
            // 手动触发垃圾回收
            if (typeof window.gc === 'function') {
                window.gc();
            }
        } catch (error) {
            console.error(`处理文件时出错: ${this.currentFileInfo.name}`, error);
            showToast(`i18n:errorReceivingFile:${error.message}`);
            
            // 清理资源
            delete this.receivedData[this.currentFileInfo.name];
            this.currentFileInfo = null;
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

// 格式化国际化消息
function formatI18nMessage(message) {
    // 检查是否是国际化键
    if (typeof message === "string" && message.startsWith("i18n:")) {
        const parts = message.split(":");
        const key = parts[1];
        const params = parts.slice(2);

        let formattedMessage = __(key);

        // 替换占位符
        params.forEach((param, index) => {
            const placeholder = `{${index}}`;
            formattedMessage = formattedMessage.replace(placeholder, param);
        });
        
        return formattedMessage;
    }
    
    return message;
}

// Show a toast notification
function showToast(message, duration = 3000, isError = false) {
    // 关闭现有的Toast
    const existingToasts = document.querySelectorAll('.toast-message');
    existingToasts.forEach(t => {
        if (t.dataset.type === 'progress' && message.includes('%')) {
            // 如果是进度类消息，更新现有的toast而不是创建新的
            t.textContent = message;
            return;
        }
        t.remove();
    });

    // 如果是进度通知，检查是否已经存在
    if (message.includes('%')) {
        const existingProgress = document.querySelector('.toast-message[data-type="progress"]');
        if (existingProgress) {
            existingProgress.textContent = message;
            return;
        }
    }

    // 创建新Toast
    const toastElement = document.createElement("div");
    toastElement.className = "toast-message" + (isError ? " toast-error" : "");
    toastElement.textContent = formatI18nMessage(message);
    
    // 为进度消息添加标记
    if (message.includes('%')) {
        toastElement.dataset.type = 'progress';
    }

    toast.appendChild(toastElement);
    toast.style.display = "flex";

    // 自动消失
    setTimeout(() => {
        toastElement.classList.add("fade-out");
        setTimeout(() => {
            if (toastElement.parentNode === toast) {
                toast.removeChild(toastElement);
            }
            if (toast.children.length === 0) {
                toast.style.display = "none";
            }
        }, 300);
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
    
    // Set data attribute to track current status
    statusElement.dataset.status = status;

    // Get current connection state
    const peerConnection = selectedPeer ? connectionManager.peerConnections[selectedPeer.id] : null;
    const dataChannel = peerConnection?.dataChannel;
    const isDataChannelReady = dataChannel?.readyState === "open";

    // Update status based on both connection and data channel state
    if (status === "connected" && !isDataChannelReady) {
        status = "connecting";
    }

    // 根据状态设置不同的图标和文本
    let iconClass, statusText;
    
    switch (status) {
        case "connecting":
            iconClass = "connecting";
            statusText = __("connecting");
            break;
        case "connected":
            iconClass = "connected";
            statusText = __("connected");
            break;
        case "disconnected":
            iconClass = "disconnected";
            statusText = __("disconnected");
            break;
        default:
            iconClass = "unknown";
            statusText = __("unknown");
    }
    
    // 使用当前语言设置状态文本
    statusElement.innerHTML = `<span class="status-icon ${iconClass}"></span> ${statusText}`;

    // Add the status indicator to the UI
    const fileTransferArea = document.querySelector(".file-transfer-area");
    if (fileTransferArea) {
        fileTransferArea.insertBefore(statusElement, fileDropArea);
    }

    // Update send button state
    fileHandler.updateSendButton();
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

  // 检测浏览器是否支持文件夹选择
  const isDirectorySupported = () => {
    const input = document.createElement('input');
    input.type = 'file';
    return 'webkitdirectory' in input || 'directory' in input || 'mozdirectory' in input;
  };

  // Update file input attributes for directory selection
  function updateFileInputAttributes() {
    if (uploadFolderRadio.checked) {
      if (!isDirectorySupported()) {
        showToast("您的浏览器不支持文件夹选择功能", 3000, true);
        uploadFileRadio.checked = true;
        return;
      }
      
      // Safari 需要特殊处理
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      if (isSafari) {
        fileInput.setAttribute("multiple", "");
        // Safari 15+ 支持
        if ('webkitEntries' in fileInput) {
          fileInput.setAttribute("webkitdirectory", "");
        } else {
          showToast("您的Safari版本不支持文件夹选择，请升级浏览器", 3000, true);
          uploadFileRadio.checked = true;
          return;
        }
      } else {
        fileInput.setAttribute("webkitdirectory", "");
        fileInput.setAttribute("directory", "");
        fileInput.setAttribute("mozdirectory", "");
        fileInput.setAttribute("multiple", "");
      }
    } else {
      fileInput.removeAttribute("webkitdirectory");
      fileInput.removeAttribute("directory");
      fileInput.removeAttribute("mozdirectory");
      fileInput.setAttribute("multiple", "");
    }
  }

  // Add change event listeners to radio buttons
  [uploadFileRadio, uploadFolderRadio].forEach(radio => {
    radio.addEventListener("change", () => {
      updateFileInputAttributes();
      // Clear the file input when switching modes
      fileInput.value = '';
      fileHandler.selectedFiles.clear();
      fileList.innerHTML = '';
      fileHandler.updateSendButton();
    });
  });

  // Initialize file input attributes
  updateFileInputAttributes();

  // Back button
  backButton.addEventListener("click", showPeersList);

  // File input change handler
  fileInput.addEventListener('change', (event) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      // 检查是否是文件夹模式
      if (uploadFolderRadio.checked && !files[0].webkitRelativePath) {
        showToast("请选择文件夹而不是单个文件", 3000, true);
        return;
      }
      fileHandler.handleFileSelect(files);
    }
  });

  // File drop area
  fileDropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileDropArea.classList.add('drag-over');
  });

  fileDropArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileDropArea.classList.remove('drag-over');
  });

  fileDropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileDropArea.classList.remove('drag-over');
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
        fileHandler.selectedFiles.clear();
        files.forEach(file => {
            fileHandler.selectedFiles.add(file);
        });
        
        // Update send button state
        sendFileBtn.disabled = false;
        sendFileBtn.style.backgroundColor = 'var(--primary-color)';
        sendFileBtn.style.cursor = 'pointer';
        
        // Update file list UI
        updateFileList();
    }
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

  // 刷新连接状态显示
  refreshConnectionStatus();

  // 更新空历史记录提示
  const emptyHistory = document.querySelector(".empty-history p[data-i18n]");
  if (emptyHistory) {
    const i18nKey = emptyHistory.getAttribute("data-i18n");
    emptyHistory.textContent = __(i18nKey);
  }

  // 更新文件历史记录中的文本
  const historyItems = document.querySelectorAll(".history-item");
  historyItems.forEach((item) => {
    // 更新方向文本 (sent/received)
    const directionEl = item.querySelector(".file-direction");
    if (directionEl) {
      if (directionEl.classList.contains("sent")) {
        directionEl.innerHTML = `<i class="fas fa-arrow-up"></i> ${__("sent")}`;
      } else if (directionEl.classList.contains("received")) {
        directionEl.innerHTML = `<i class="fas fa-arrow-down"></i> ${__("received")}`;
      }
    }

    // 更新"查看"按钮文本
    const viewBtn = item.querySelector(".preview-btn");
    if (viewBtn) {
      viewBtn.title = __("view");
    }
    
    // 更新"下载"按钮文本
    const downloadBtn = item.querySelector(".download-btn");
    if (downloadBtn) {
      downloadBtn.title = __("download");
    }
  });
});

// 刷新连接状态显示
function refreshConnectionStatus() {
  const existingStatus = document.querySelector(".connection-status");
  let currentStatus = existingStatus?.dataset?.status || "disconnected";
  
  if (selectedPeer && connectionManager.peerConnections[selectedPeer.id]) {
    const peerConnection = connectionManager.peerConnections[selectedPeer.id];
    const dataChannel = peerConnection.dataChannel;
    
    if (dataChannel && dataChannel.readyState === "open") {
      currentStatus = "connected";
    } else if (peerConnection.connectionState === "connected" || peerConnection.iceConnectionState === "connected") {
      currentStatus = "connecting";
    } else {
      currentStatus = "disconnected";
    }
  }
  
  // 强制更新连接状态显示
  updateConnectionStatus(currentStatus);
}

// Update file list UI
function updateFileList() {
    const fileListElement = document.getElementById('file-list');
    fileListElement.innerHTML = '';
    
    fileHandler.selectedFiles.forEach(file => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        const icon = document.createElement('i');
        icon.className = `fas ${utils.getFileTypeIcon(file.type)}`;
        
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        fileInfo.innerHTML = `
            <div class="file-name">${file.name}</div>
            <div class="file-size">${utils.formatFileSize(file.size)}</div>
        `;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-file';
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.onclick = () => {
            fileHandler.selectedFiles.delete(file);
            fileItem.remove();
            if (fileHandler.selectedFiles.size === 0) {
                sendFileBtn.disabled = true;
                sendFileBtn.style.backgroundColor = 'var(--gray-300)';
                sendFileBtn.style.cursor = 'not-allowed';
            }
        };
        
        fileItem.appendChild(icon);
        fileItem.appendChild(fileInfo);
        fileItem.appendChild(removeBtn);
        fileListElement.appendChild(fileItem);
    });
}

// 添加错误恢复重试逻辑
function retryWithExponentialBackoff(fn, maxRetries = 3, initialDelay = 500) {
    return new Promise(async (resolve, reject) => {
        let retries = 0;
        
        while (retries <= maxRetries) {
            try {
                const result = await fn();
                return resolve(result);
            } catch (error) {
                retries++;
                if (retries > maxRetries) {
                    return reject(error);
                }
                
                const delay = initialDelay * Math.pow(2, retries - 1);
                console.log(`操作失败，${retries}/${maxRetries} 次尝试，等待 ${delay}ms 后重试...`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    });
}
