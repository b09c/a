
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const httpServer = createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(path.join(__dirname, 'dist/index.html')).pipe(res);
  } else {
    const filePath = path.join(__dirname, 'dist', req.url);
    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        res.writeHead(404);
        res.end('File not found');
        return;
      }
      const extname = path.extname(filePath);
      const contentType = {
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.wav': 'audio/wav',
        '.mp3': 'audio/mpeg',
        '.mp4': 'video/mp4',
      }[extname] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    });
  }
});

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store connected users
const users = {
  R: { connected: false, socket: null, typing: false, lastSeen: null },
  B: { connected: false, socket: null, typing: false, lastSeen: null }
};

// Store chat history
let chatHistory = [];

// Try to load chat history from a file if it exists
try {
  const data = fs.readFileSync('chatHistory.json', 'utf8');
  chatHistory = JSON.parse(data);
} catch (err) {
  console.log('No chat history found, starting fresh');
}

const saveChat = () => {
  fs.writeFileSync('chatHistory.json', JSON.stringify(chatHistory), 'utf8');
};

io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);
  
  // User login
  socket.on('login', (userId) => {
    if (userId === 'R' || userId === 'B') {
      if (users[userId].connected) {
        socket.emit('login-error', 'User already logged in');
        return;
      }
      
      users[userId].connected = true;
      users[userId].socket = socket.id;
      users[userId].lastSeen = new Date();
      
      socket.userId = userId;
      socket.emit('login-success', { userId, chatHistory });
      
      // Notify the other user if they're online
      const otherUser = userId === 'R' ? 'B' : 'R';
      if (users[otherUser].connected) {
        io.to(users[otherUser].socket).emit('user-connected', userId);
      }
    } else {
      socket.emit('login-error', 'Invalid user ID');
    }
  });
  
  // New message
  socket.on('send-message', (message) => {
    if (!socket.userId) return;
    
    chatHistory.push(message);
    saveChat();
    
    // Send to other user if connected
    const otherUser = socket.userId === 'R' ? 'B' : 'R';
    if (users[otherUser].connected) {
      io.to(users[otherUser].socket).emit('new-message', message);
    }
  });
  
  // Message seen
  socket.on('message-seen', (messageId) => {
    if (!socket.userId) return;
    
    const otherUser = socket.userId === 'R' ? 'B' : 'R';
    if (users[otherUser].connected) {
      io.to(users[otherUser].socket).emit('message-seen', messageId);
    }
    
    // Update message in chat history
    chatHistory = chatHistory.map(msg => {
      if (msg.id === messageId) {
        return { ...msg, seen: true };
      }
      return msg;
    });
    saveChat();
  });
  
  // Typing indicator
  socket.on('typing', (isTyping) => {
    if (!socket.userId) return;
    
    users[socket.userId].typing = isTyping;
    
    const otherUser = socket.userId === 'R' ? 'B' : 'R';
    if (users[otherUser].connected) {
      io.to(users[otherUser].socket).emit('user-typing', {
        userId: socket.userId,
        isTyping
      });
    }
  });
  
  // Delete chat history
  socket.on('delete-chat', () => {
    if (!socket.userId) return;
    
    chatHistory = [];
    saveChat();
    
    const otherUser = socket.userId === 'R' ? 'B' : 'R';
    if (users[otherUser].connected) {
      io.to(users[otherUser].socket).emit('chat-deleted');
    }
    
    socket.emit('chat-deleted');
  });
  
  // Update last seen on disconnect
  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id);
    if (socket.userId) {
      users[socket.userId].connected = false;
      users[socket.userId].socket = null;
      users[socket.userId].lastSeen = new Date();
      
      const otherUser = socket.userId === 'R' ? 'B' : 'R';
      if (users[otherUser].connected) {
        io.to(users[otherUser].socket).emit('user-disconnected', socket.userId);
      }
    }
  });
});

httpServer.listen(3000, '0.0.0.0', () => {
  console.log('Server running at http://0.0.0.0:3000');
});
