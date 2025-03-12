const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Store connected clients
const clients = {};

// Store client fingerprints to track unique users across refreshes
// Using a combination of IP, user agent, and username for reliable fingerprinting
const clientFingerprints = {};

// Track disconnecting clients to handle refresh scenarios better
const disconnectingClients = {};

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // Get client IP address and user agent for better identification
  const clientIp = socket.handshake.headers['x-forwarded-for'] || 
                   socket.handshake.address;
  const userAgent = socket.handshake.headers['user-agent'] || 'unknown';
  
  // Check if the client sent a saved username
  socket.on('set-username', (savedName) => {
    // 如果没有提供用户名，则不更新客户端信息
    if (!savedName) {
      console.log('No username provided, skipping client initialization.');
      return;
    }

    // 使用提供的用户名
    const clientName = savedName;
    
    // Create a more reliable fingerprint using IP + user agent + username
    const fingerprint = `${clientIp}:${userAgent}:${clientName}`;
    
    // Check if this fingerprint already exists in another socket
    // This helps identify when a user refreshes their page
    const existingSocketId = clientFingerprints[fingerprint];
    if (existingSocketId && existingSocketId !== socket.id) {
      console.log(`User ${clientName} (${fingerprint}) refreshed their page. Removing old socket: ${existingSocketId}`);
      
      // Notify other clients that the old instance is gone
      io.emit('client-left', existingSocketId);
      
      // Remove the old socket entry
      delete clients[existingSocketId];
      
      // 新增：检查并清理 disconnectingClients
      Object.keys(disconnectingClients).forEach(key => {
        if (disconnectingClients[key].id === existingSocketId) {
          delete disconnectingClients[key];
        }
      });
    }
    
    // Store client information
    clients[socket.id] = {
      id: socket.id,
      name: clientName,
      fingerprint: fingerprint
    };
    
    // Track this fingerprint for future refreshes
    clientFingerprints[fingerprint] = socket.id;
    
    // Send the client their own information
    // 清理无效的客户端信息
    Object.keys(clients).forEach(clientId => {
      if (!io.sockets.sockets.get(clientId)) {
        delete clients[clientId];
      }
    });

    // 发送客户端信息
    socket.emit('init', {
      id: socket.id,
      name: clientName,
      clients: Object.values(clients).filter(client => client.id !== socket.id)
    });
    
    // Broadcast to all other clients that a new client has joined
    socket.broadcast.emit('client-joined', clients[socket.id]);
  });
  
  // If client doesn't send a username within 1 second, generate one
  // 移除 setTimeout 中自动生成用户名的逻辑
  // setTimeout(() => {
  //   if (!clients[socket.id]) {
  //     const clientName = generateName();
  //     
  //     // Create a fingerprint for this auto-generated name too
  //     const fingerprint = `${clientIp}:${userAgent}:${clientName}`;
  //     
  //     // Check for existing socket with this fingerprint (unlikely but possible)
  //     const existingSocketId = clientFingerprints[fingerprint];
  //     if (existingSocketId && existingSocketId !== socket.id && clients[existingSocketId]) {
  //       console.log(`Auto-generated user ${clientName} (${fingerprint}) conflicts with existing socket. Removing old socket: ${existingSocketId}`);
  //       
  //       // Notify other clients that the old instance is gone
  //       io.emit('client-left', existingSocketId);
  //       
  //       // Remove the old socket entry
  //       delete clients[existingSocketId];
  //     }
  //     
  //     // Store client information
  //     clients[socket.id] = {
  //       id: socket.id,
  //       name: clientName,
  //       fingerprint: fingerprint
  //     };
  //     
  //     // Track this fingerprint for future refreshes
  //     clientFingerprints[fingerprint] = socket.id;
  //     
  //     // Send the client their own information
  //     socket.emit('init', {
  //       id: socket.id,
  //       name: clientName,
  //       clients: Object.values(clients).filter(client => client.id !== socket.id)
  //     });
  //     
  //     // Broadcast to all other clients that a new client has joined
  //     socket.broadcast.emit('client-joined', clients[socket.id]);
  //   }
  // }, 1000);
  
  // Handle client disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    if (clients[socket.id]) {
      const clientFingerprint = clients[socket.id].fingerprint;
      
      // 立即通知其他客户端
      io.emit('client-left', socket.id);
      
      // 新增：立即清理任何可能存在的旧的断开连接记录
      Object.keys(disconnectingClients).forEach(key => {
        if (disconnectingClients[key].id === socket.id) {
          delete disconnectingClients[key];
        }
      });
      
      disconnectingClients[clientFingerprint] = {
        id: socket.id,
        timestamp: Date.now(),
        name: clients[socket.id].name
      };
      
      setTimeout(() => {
        if (clientFingerprints[clientFingerprint] && 
            clientFingerprints[clientFingerprint] !== socket.id) {
          console.log(`Client ${socket.id} refreshed and has a new socket ID: ${clientFingerprints[clientFingerprint]}`);
          delete disconnectingClients[clientFingerprint];
          return;
        }
        
        if (disconnectingClients[clientFingerprint]) {
          console.log(`Client ${socket.id} has truly disconnected, removing...`);
          
          // 新增：确保清理所有相关数据
          if (clientFingerprints[clientFingerprint] === socket.id) {
            delete clientFingerprints[clientFingerprint];
          }
          
          delete disconnectingClients[clientFingerprint];
          delete clients[socket.id];
          
          // 新增：验证清理结果
          console.log(`Cleanup complete. Active clients: ${Object.keys(clients).length}`);
        }
      }, 5000);
    }
  });
  
  // Handle WebRTC signaling
  socket.on('signal', (data) => {
    console.log('Signal from', socket.id, 'to', data.to);
    
    // Forward the signal to the intended recipient
    if (clients[data.to]) {
      io.to(data.to).emit('signal', {
        from: socket.id,
        signal: data.signal
      });
    }
  });
  
  // Handle message sending
  socket.on('send-message', (data) => {
    console.log('Message from', socket.id, 'to', data.to);
    
    // Forward the message to the intended recipient
    if (clients[data.to]) {
      io.to(data.to).emit('receive-message', {
        from: socket.id,
        fromName: clients[socket.id].name,
        message: data.message,
        timestamp: new Date().toISOString()
      });
    }
  });
});

// Helper function to find a socket ID by username
function findSocketIdByUsername(username) {
  for (const socketId in clients) {
    if (clients[socketId].name === username) {
      return socketId;
    }
  }
  return null;
}

// Generate a random name for clients
function generateName() {
  const adjectives = ['Happy', 'Brave', 'Calm', 'Eager', 'Gentle', 'Jolly', 'Kind', 'Lively', 'Proud', 'Wise'];
  const animals = ['Panda', 'Tiger', 'Eagle', 'Dolphin', 'Fox', 'Koala', 'Lion', 'Owl', 'Wolf', 'Zebra'];
  
  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomAnimal = animals[Math.floor(Math.random() * animals.length)];
  
  return `${randomAdjective}${randomAnimal}`;
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Local network access: http://localhost:${PORT}`);
  
  // Try to get the local IP address for LAN access
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`Network access: http://${net.address}:${PORT}`);
      }
    }
  }
});