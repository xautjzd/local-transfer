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
let selectedFiles = [];
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

// Initialize when connected to the server
socket.on("init", (data) => {
  // Store user info
  myInfo = data;

  // Save the user name to localStorage for persistence
  localStorage.setItem("localTransferUserName", data.name);

  // Update UI with user info
  userNameElement.textContent = data.name;
  avatarTextElement.textContent = getInitials(data.name);

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
  showToast(`${peerName} ${__("joined")}`);
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
  if (!peerConnections[from]) {
    createPeerConnection(from);
  }

  try {
    // Process the signal based on its type
    if (signal.type === "offer") {
      await peerConnections[from].setRemoteDescription(
        new RTCSessionDescription(signal)
      );
      const answer = await peerConnections[from].createAnswer();
      await peerConnections[from].setLocalDescription(answer);

      // Send the answer back to the peer
      socket.emit("signal", {
        to: from,
        signal: peerConnections[from].localDescription,
      });
    } else if (signal.type === "answer") {
      await peerConnections[from].setRemoteDescription(
        new RTCSessionDescription(signal)
      );
    } else if (signal.type === "candidate") {
      await peerConnections[from].addIceCandidate(
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

    showToast(`${__("newMessageFrom")} ${data.fromName}`);
  }
});

// Create a peer connection for a specific client
function createPeerConnection(peerId, turnOnly = false) {
  // Enhanced ICE server configuration with TURN servers
  // Using free TURN servers from Twilio or other providers would be better in production
  let iceServers;

  if (turnOnly) {
    // When turnOnly is true, prioritize TURN servers for more reliable connections
    // in challenging network environments
    console.log("Using TURN servers only for more reliable connection");
    iceServers = [
      // TURN servers first for priority
      {
        urls: "turn:openrelay.metered.ca:443", // Use 443 first as it's more likely to work through firewalls
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      // Include STUN as fallback only
      { urls: "stun:stun.l.google.com:19302" },
    ];
  } else {
    // Normal configuration with both STUN and TURN
    iceServers = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
      // Free TURN servers (limited capacity, for testing only)
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    ];
  }

  const peerConnection = new RTCPeerConnection({
    iceServers: iceServers,
    iceCandidatePoolSize: 10, // Increase candidate pool for better connectivity
  });

  // Store whether this connection is using TURN-only mode
  peerConnection.usingTurnOnly = turnOnly;

  // Log which configuration we're using
  console.log(
    `Creating peer connection with ${
      turnOnly ? "TURN priority" : "standard"
    } configuration`
  );

  // Log ICE gathering state changes
  peerConnection.onicegatheringstatechange = () => {
    console.log(
      `ICE gathering state with ${peerId}: ${peerConnection.iceGatheringState}`
    );
  };

  // Set up data channel for file transfer
  const dataChannel = peerConnection.createDataChannel("fileTransfer", {
    ordered: true,
  });

  let receivedData = [];
  let receivedSize = 0;
  let fileInfo = null;
  let connectionTimeout = null;

  dataChannel.onopen = () => {
    console.log(`Data channel with ${peerId} opened`);
    // Clear any connection timeout
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
      connectionTimeout = null;
    }

    // Update UI if this is the selected peer
    if (selectedPeer && selectedPeer.id === peerId) {
      updateConnectionStatus("connected");
      sendFileBtn.disabled = selectedFiles.length === 0;
    }
  };

  dataChannel.onclose = () => {
    console.log(`Data channel with ${peerId} closed`);
  };

  dataChannel.onmessage = (event) => {
    const data = JSON.parse(event.data);

    // Handle different types of messages
    if (data.type === "file-info") {
      // Reset for new file
      receivedData = [];
      receivedSize = 0;
      fileInfo = data.info;

      showToast(`Receiving ${fileInfo.name}...`);
    } else if (data.type === "file-data") {
      // Collect file chunks
      receivedData.push(data.chunk);
      receivedSize += data.chunk.length;

      // Check if file transfer is complete
      if (receivedSize === fileInfo.size) {
        // Combine chunks and create file
        const fileData = receivedData.join("");
        const fileBlob = base64ToBlob(fileData, fileInfo.type);

        // Add to history and show preview
        addFileToHistory({
          name: fileInfo.name,
          size: fileInfo.size,
          type: fileInfo.type,
          data: fileBlob,
          from: peerId,
          direction: "received",
          timestamp: new Date().toISOString(),
        });

        showFilePreview(fileBlob, fileInfo);
        showToast(`File ${fileInfo.name} received`);

        // Reset for next transfer
        receivedData = [];
        receivedSize = 0;
        fileInfo = null;
      }
    }
  };

  // Handle ICE candidates
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

  // Monitor ICE connection state changes
  peerConnection.oniceconnectionstatechange = () => {
    console.log(
      `ICE connection state with ${peerId}: ${peerConnection.iceConnectionState}`
    );
    if (selectedPeer && selectedPeer.id === peerId) {
      if (
        peerConnection.iceConnectionState === "connected" ||
        peerConnection.iceConnectionState === "completed"
      ) {
        updateConnectionStatus("connected");
        // Clear any connection timeout
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
          connectionTimeout = null;
        }
      } else if (peerConnection.iceConnectionState === "failed") {
        // Connection failed, try to restart ICE
        console.log("ICE connection failed, restarting...");
        peerConnection.restartIce();
        updateConnectionStatus("connecting");
      } else if (
        peerConnection.iceConnectionState === "disconnected" ||
        peerConnection.iceConnectionState === "closed"
      ) {
        updateConnectionStatus("disconnected");
      }
    }
  };

  // Monitor connection state changes
  peerConnection.onconnectionstatechange = () => {
    console.log(
      `Connection state with ${peerId}: ${peerConnection.connectionState}`
    );
    if (selectedPeer && selectedPeer.id === peerId) {
      if (peerConnection.connectionState === "connected") {
        updateConnectionStatus("connected");
        // Clear any connection timeout
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
          connectionTimeout = null;
        }
      } else if (peerConnection.connectionState === "failed") {
        // If connection failed, try to reconnect
        console.log("Connection failed, attempting to reconnect...");
        // Close the old connection
        peerConnection.close();
        // Create a new connection after a short delay
        setTimeout(() => {
          if (selectedPeer && selectedPeer.id === peerId) {
            createPeerConnection(peerId);
            initiateConnection(peerId);
          }
        }, 1000);
      } else if (
        peerConnection.connectionState === "disconnected" ||
        peerConnection.connectionState === "closed"
      ) {
        updateConnectionStatus("disconnected");
      }
    }
  };

  // Handle incoming data channels
  peerConnection.ondatachannel = (event) => {
    const incomingChannel = event.channel;
    incomingChannel.onmessage = dataChannel.onmessage;
    incomingChannel.onopen = () => {
      console.log(`Incoming data channel from ${peerId} opened`);
      // Update UI if this is the selected peer
      if (selectedPeer && selectedPeer.id === peerId) {
        updateConnectionStatus("connected");
        sendFileBtn.disabled = selectedFiles.length === 0;
      }
    };
    incomingChannel.onclose = () =>
      console.log(`Incoming data channel from ${peerId} closed`);
  };

  // Store the peer connection and data channel
  peerConnections[peerId] = peerConnection;
  peerConnections[peerId].dataChannel = dataChannel;

  // Set a timeout to check if the connection is established
  connectionTimeout = setTimeout(() => {
    if (
      selectedPeer &&
      selectedPeer.id === peerId &&
      (!dataChannel || dataChannel.readyState !== "open")
    ) {
      console.log("Connection timeout, connection may not be established");

      // Check the ICE connection state to provide more specific feedback
      let timeoutReason = "";
      if (peerConnection.iceConnectionState === "checking") {
        timeoutReason =
          "ICE negotiation is still in progress. This could be due to network restrictions or firewall issues.";
      } else if (peerConnection.iceConnectionState === "failed") {
        timeoutReason =
          "ICE negotiation failed. Your network may be blocking peer-to-peer connections.";
      } else if (peerConnection.iceConnectionState === "disconnected") {
        timeoutReason =
          "Connection was interrupted. The peer may have gone offline or changed networks.";
      } else {
        timeoutReason =
          "Connection could not be established. This might be due to network restrictions or firewall settings.";
      }

      console.log("Connection timeout reason:", timeoutReason);

      // Update UI to show connection might have issues with the specific reason
      updateConnectionStatus("connection-timeout", peerId, timeoutReason);
      sendFileBtn.disabled = true;

      // Try to restart the connection
      try {
        peerConnection.restartIce();
        console.log("ICE connection restart initiated");
      } catch (error) {
        console.error("Error restarting ICE connection:", error);
      }

      // Set another timeout to try TURN servers as fallback if still not connected
      setTimeout(() => {
        if (
          selectedPeer &&
          selectedPeer.id === peerId &&
          (!dataChannel || dataChannel.readyState !== "open")
        ) {
          console.log("Still not connected, trying with TURN servers only...");
          showToast(
            "Connection issue detected. Trying alternative connection method...",
            5000,
            true
          );

          // Close the old connection
          peerConnection.close();

          // Create a new connection with emphasis on TURN servers
          createPeerConnection(peerId, true);
          initiateConnection(peerId);

          // Show a more detailed explanation to the user
          const connectionTips = document.createElement("div");
          connectionTips.className = "connection-tips";
          connectionTips.innerHTML = `
  <h3>${__("connectionTroubleshootingTitle")}</h3>
  <ul>
    <li>${__("connectionTroubleshootingSameNetwork")}</li>
    <li>${__("connectionTroubleshootingCorporateNetwork")}</li>
    <li>${__("connectionTroubleshootingVPN")}</li>
    <li>${__("connectionTroubleshootingMobile")}</li>
  </ul>
`;

          // Add the tips to the UI
          const fileTransferArea = document.querySelector(
            ".file-transfer-area"
          );
          const existingTips = document.querySelector(".connection-tips");
          if (existingTips) {
            existingTips.remove();
          }
          fileTransferArea.appendChild(connectionTips);
        }
      }, 10000); // Give it 10 more seconds before trying TURN-only approach
    }
  }, 15000); // Increase timeout to 15 seconds to give more time for connection

  return peerConnection;
}

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
      <span>${getInitials(peer.name)}</span>
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
  selectedPeer = peer;

  // Update the UI
  selectedAvatarText.textContent = getInitials(peer.name);
  selectedPeerName.textContent = peer.name;

  // Show the transfer container
  peersList.parentElement.classList.add("hidden");
  transferContainer.classList.remove("hidden");

  // 在显示传输容器之后，更新文件历史显示
  updateFileHistoryDisplay(peer.id);

  // Clear any notification for this peer
  const peerElement = document.getElementById(`peer-${peer.id}`);
  if (peerElement) {
    peerElement.classList.remove("has-notification");
  }

  // Ensure we have a peer connection
  if (!peerConnections[peer.id]) {
    createPeerConnection(peer.id);

    // Create an offer to establish the connection
    initiateConnection(peer.id);

    // Show connecting status
    updateConnectionStatus("connecting");
  } else {
    // Check if data channel is already open
    const dataChannel = peerConnections[peer.id].dataChannel;
    if (dataChannel && dataChannel.readyState === "open") {
      updateConnectionStatus("connected");
    } else {
      updateConnectionStatus("connecting");
    }
  }

  // Reset the file input
  fileInput.value = "";
  selectedFiles = [];
  sendFileBtn.disabled = true;
}

// Initiate a WebRTC connection with a peer
async function initiateConnection(peerId) {
  try {
    // Update UI to show connecting status
    if (selectedPeer && selectedPeer.id === peerId) {
      updateConnectionStatus("connecting");
      showToast("Establishing connection...", 2000);
    }

    // Log connection attempt details
    const peerConnection = peerConnections[peerId];
    const usingTurnOnly = peerConnection.usingTurnOnly || false;
    console.log(
      `Connection attempt details:\n- Peer ID: ${peerId}\n- Using TURN priority: ${
        usingTurnOnly ? "Yes" : "No"
      }`
    );

    // Create an offer to connect with improved error handling
    console.log("Creating offer...");
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false,
      iceRestart: true, // Force ICE restart to improve connection success rate
    });
    console.log("Created offer successfully");

    await peerConnection.setLocalDescription(offer);
    console.log("Local description set successfully");

    // Send the offer to the peer via the signaling server
    socket.emit("signal", {
      to: peerId,
      signal: peerConnection.localDescription,
    });
    console.log("Offer sent to signaling server");

    // Add a safety timeout to retry if no answer is received
    setTimeout(() => {
      if (
        peerConnection.connectionState !== "connected" &&
        peerConnection.iceConnectionState !== "connected" &&
        peerConnection.iceConnectionState !== "completed"
      ) {
        console.log(
          "No answer received within timeout, retrying connection..."
        );
        // Only retry if we're still trying to connect to this peer
        if (selectedPeer && selectedPeer.id === peerId) {
          // Try again with a new offer
          initiateConnection(peerId);
        }
      }
    }, 20000); // 20 second timeout for answer
  } catch (error) {
    console.error("Error during connection initiation:", error);
    if (selectedPeer && selectedPeer.id === peerId) {
      showToast("Connection error: " + error.message, 4000, true);

      // Try to recover from the error
      setTimeout(() => {
        if (selectedPeer && selectedPeer.id === peerId) {
          console.log("Attempting to recover from connection error...");
          // Close the old connection if it exists
          if (peerConnections[peerId]) {
            peerConnections[peerId].close();
          }
          // Create a new connection and try again
          createPeerConnection(peerId, true); // Use TURN-only for recovery
          initiateConnection(peerId);
        }
      }, 3000);
    }
  }
}

// Show the peers list (go back)
function showPeersList() {
  selectedPeer = null;
  transferContainer.classList.add("hidden");
  peersList.parentElement.classList.remove("hidden");
}

// Handle file selection
function handleFileSelect(files) {
  selectedFiles = Array.from(files);

  // Only enable send button if files are selected AND connection is ready
  const isConnected =
    selectedPeer &&
    peerConnections[selectedPeer.id] &&
    peerConnections[selectedPeer.id].dataChannel &&
    peerConnections[selectedPeer.id].dataChannel.readyState === "open";

  sendFileBtn.disabled = selectedFiles.length === 0 || !isConnected;

  if (selectedFiles.length > 0) {
    // Display selected files in the drop area
    const fileListHtml = selectedFiles
      .map((file, index) => {
        return `<div class="selected-file">
              <span class="file-icon">📄</span>
              <span class="file-name">${file.name}</span>
              <span class="file-size">(${formatFileSize(file.size)})</span>
              <button class="remove-file-btn" data-index="${index}">Remove</button>
            </div>`;
      })
      .join("");

    // Add the file list to the drop area
    const fileInputContainer = fileDropArea.querySelector(
      ".file-input-container"
    );
    const existingFileList = fileDropArea.querySelector(".selected-files-list");

    if (existingFileList) {
      existingFileList.innerHTML = fileListHtml;
    } else {
      const filesList = document.createElement("div");
      filesList.className = "selected-files-list";
      filesList.innerHTML = fileListHtml;
      fileDropArea.appendChild(filesList);
    }

    // Add event listeners for remove buttons
    document.querySelectorAll(".remove-file-btn").forEach((button) => {
      button.addEventListener("click", (e) => {
        const index = e.target.dataset.index;
        selectedFiles.splice(index, 1);
        handleFileSelect(selectedFiles);
      });
    });

    const fileNames = selectedFiles.map((file) => file.name).join(", ");
    showToast(`Selected ${selectedFiles.length} file(s): ${fileNames}`);
  } else {
    // Remove the file list if no files are selected
    const existingFileList = fileDropArea.querySelector(".selected-files-list");
    if (existingFileList) {
      existingFileList.remove();
    }
  }
}

// Send selected files to the selected peer
async function sendFiles() {
  if (!selectedPeer || selectedFiles.length === 0) {
    return;
  }

  const dataChannel = peerConnections[selectedPeer.id].dataChannel;

  // Check if the data channel is open
  if (dataChannel.readyState !== "open") {
    showToast("Connection not ready. Please try again.");
    return;
  }

  // Process each file
  for (const file of selectedFiles) {
    try {
      // Read the file as base64
      const base64Data = await readFileAsBase64(file);

      // Send file info first
      dataChannel.send(
        JSON.stringify({
          type: "file-info",
          info: {
            name: file.name,
            size: base64Data.length,
            type: file.type,
          },
        })
      );

      // Send the file data in chunks
      const chunkSize = 16384; // 16KB chunks
      let offset = 0;

      while (offset < base64Data.length) {
        const chunk = base64Data.slice(offset, offset + chunkSize);
        dataChannel.send(
          JSON.stringify({
            type: "file-data",
            chunk: chunk,
          })
        );

        offset += chunkSize;
      }

      // Add to history
      addFileToHistory({
        name: file.name,
        size: file.size,
        type: file.type,
        data: file,
        to: selectedPeer.id,
        direction: "sent",
        timestamp: new Date().toISOString(),
      });

      showToast(`File ${file.name} sent successfully`);
    } catch (error) {
      console.error("Error sending file:", error);
      showToast(`Error sending file: ${error.message}`);
    }
  }

  // Reset the file input
  fileInput.value = "";
  selectedFiles = [];
  sendFileBtn.disabled = true;

  // Remove the file list from the drop area
  //   const existingFileList = fileDropArea.querySelector('.selected-files-list');
  //   if (existingFileList) {
  //     existingFileList.remove();
  //   }
}

// Add a file to the transfer history
function addFileToHistory(file) {
  // 创建或获取特定对等方的历史记录数组
  const peerId = file.direction === "sent" ? file.to : file.from;
  if (!peerFileHistory[peerId]) {
    peerFileHistory[peerId] = [];
  }

  // 将文件添加到特定对等方的历史记录中
  peerFileHistory[peerId].unshift(file);

  // 如果当前选中的是这个对等方，则更新显示
  if (selectedPeer && selectedPeer.id === peerId) {
    updateFileHistoryDisplay(peerId);
  }
}

function updateFileHistoryDisplay(peerId) {
  // 清空当前历史显示
  fileHistory.innerHTML = "";

  // 如果没有该对等方的历史记录，直接返回
  if (!peerFileHistory[peerId]) return;

  // 显示特定对等方的文件历史
  peerFileHistory[peerId].forEach((file) => {
    const historyItem = document.createElement("div");
    historyItem.className = "history-item";

    // Determine file icon based on type
    let fileIcon = "📄";
    if (file.type.startsWith("image/")) {
      fileIcon = "🖼️";
    } else if (file.type.startsWith("video/")) {
      fileIcon = "🎬";
    } else if (file.type.startsWith("audio/")) {
      fileIcon = "🎵";
    }

    const formattedSize = formatFileSize(file.size);
    const formattedTime = new Date(file.timestamp).toLocaleTimeString();

    historyItem.innerHTML = `
      <div class="history-item-info">
        <div class="file-type-icon">${fileIcon}</div>
        <div class="file-details">
          <div class="file-name">${file.name}</div>
          <div class="file-meta">
            ${formattedSize} · ${formattedTime} · 
            ${file.direction === "sent" ? __("sent") : __("received")}
          </div>
        </div>
      </div>
      <div class="file-action">${__("view")}</div>
    `;

    historyItem.querySelector(".file-action").addEventListener("click", () => {
      showFilePreview(file.data, {
        name: file.name,
        size: file.size,
        type: file.type,
      });
    });

    fileHistory.appendChild(historyItem);
  });
}

// Show file preview in modal
function showFilePreview(fileData, fileInfo) {
  // Set file name
  previewFileName.textContent = fileInfo.name;

  // Set file info
  fileInfoSize.textContent = `${__("size")}: ${formatFileSize(fileInfo.size)}`;
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
    const key = message.substring(5);
    message = __(key);
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

// Format file size in a human-readable format
function formatFileSize(bytes) {
  if (bytes < 1024) {
    return bytes + " B";
  } else if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + " KB";
  } else if (bytes < 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  } else {
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
  }
}

// Get initials from a name
function getInitials(name) {
  return name.charAt(0);
}

// Read a file as base64
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Get the base64 string (remove the data URL prefix)
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => {
      reject(new Error("Error reading file"));
    };
    reader.readAsDataURL(file);
  });
}

// Convert base64 to Blob
function base64ToBlob(base64, type) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new Blob([bytes], { type: type });
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
      sendFileBtn.disabled = selectedFiles.length === 0;
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
          createPeerConnection(peerId);
          initiateConnection(peerId);
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
          createPeerConnection(peerId, true);
          initiateConnection(peerId);
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

  //const fileInput = document.getElementById('file-input');
  const uploadFileRadio = document.getElementById("upload-file");
  const uploadFolderRadio = document.getElementById("upload-folder");

  // 监听单选按钮的变化
  uploadFileRadio.addEventListener("change", () => {
    if (uploadFileRadio.checked) {
      fileInput.removeAttribute("webkitdirectory");
    }
  });

  uploadFolderRadio.addEventListener("change", () => {
    if (uploadFolderRadio.checked) {
      fileInput.setAttribute("webkitdirectory", "");
    }
  });

  // 初始化时根据默认选项设置属性
  if (uploadFolderRadio.checked) {
    fileInput.setAttribute("webkitdirectory", "");
  } else {
    fileInput.removeAttribute("webkitdirectory");
  }

  // Back button
  backButton.addEventListener("click", showPeersList);

  // File input change
  fileInput.addEventListener("change", (e) => {
    handleFileSelect(e.target.files);
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
    handleFileSelect(e.dataTransfer.files);
  });

  // Send file button
  sendFileBtn.addEventListener("click", sendFiles);

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
