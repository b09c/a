
import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import './App.css';

// Define message type
interface Message {
  id: string;
  sender: 'R' | 'B';
  text: string;
  timestamp: string;
  seen: boolean;
  replyTo?: string;
  media?: string;
}

export default function App() {
  // User state
  const [user, setUser] = useState<'R' | 'B' | null>(null);
  const [showLogin, setShowLogin] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  
  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Connect to socket on mount
  useEffect(() => {
    // Check for saved user
    const savedUser = localStorage.getItem('chatUser');
    if (savedUser && (savedUser === 'R' || savedUser === 'B')) {
      setUser(savedUser);
      setShowLogin(false);
    }
    
    // Connect to the socket server
    const socketConnection = io(window.location.hostname === 'localhost' 
      ? 'http://localhost:3000' 
      : window.location.origin);
    
    setSocket(socketConnection);
    
    return () => {
      socketConnection.disconnect();
    };
  }, []);
  
  // Handle socket events when socket and user are set
  useEffect(() => {
    if (!socket || !user) return;
    
    // Login
    socket.emit('login', user);
    
    // Login response handlers
    socket.on('login-success', (data) => {
      setMessages(data.chatHistory);
      localStorage.setItem('chatUser', user);
    });
    
    socket.on('login-error', (error) => {
      alert(error);
      setUser(null);
      setShowLogin(true);
      localStorage.removeItem('chatUser');
    });
    
    // Message handlers
    socket.on('new-message', (message: Message) => {
      setMessages(prev => [...prev, message]);
      socket.emit('message-seen', message.id);
    });
    
    socket.on('message-seen', (messageId: string) => {
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, seen: true } : msg
      ));
    });
    
    // Typing indicator
    socket.on('user-typing', (data: { userId: 'R' | 'B', isTyping: boolean }) => {
      if (data.userId !== user) {
        setOtherUserTyping(data.isTyping);
      }
    });
    
    // Chat deleted
    socket.on('chat-deleted', () => {
      setMessages([]);
    });
    
    // Connection status
    socket.on('user-connected', (userId) => {
      console.log(`User ${userId} connected`);
    });
    
    socket.on('user-disconnected', (userId) => {
      console.log(`User ${userId} disconnected`);
    });
    
    return () => {
      socket.off('login-success');
      socket.off('login-error');
      socket.off('new-message');
      socket.off('message-seen');
      socket.off('user-typing');
      socket.off('chat-deleted');
      socket.off('user-connected');
      socket.off('user-disconnected');
    };
  }, [socket, user]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    
    // Mark received messages as seen
    if (socket && user) {
      messages.forEach(msg => {
        if (msg.sender !== user && !msg.seen) {
          socket.emit('message-seen', msg.id);
        }
      });
    }
  }, [messages, socket, user]);
  
  // Handle login
  const handleLogin = (selectedUser: 'R' | 'B') => {
    setUser(selectedUser);
    setShowLogin(false);
  };
  
  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('chatUser');
    setUser(null);
    setShowLogin(true);
    window.location.reload();
  };
  
  // Handle sending a message
  const handleSendMessage = () => {
    if (!socket || !user || (!newMessage.trim() && !selectedMedia)) return;
    
    const message: Message = {
      id: uuidv4(),
      sender: user,
      text: newMessage.trim(),
      timestamp: new Date().toISOString(),
      seen: false,
      ...(replyingTo && { replyTo: replyingTo }),
      ...(selectedMedia && { media: selectedMedia }),
    };
    
    socket.emit('send-message', message);
    setMessages(prev => [...prev, message]);
    setNewMessage('');
    setReplyingTo(null);
    setSelectedMedia(null);
    
    // Reset typing indicator
    socket.emit('typing', false);
    setIsTyping(false);
  };
  
  // Handle typing indicator
  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    
    if (!isTyping && e.target.value.length > 0) {
      setIsTyping(true);
      socket?.emit('typing', true);
    } else if (isTyping && e.target.value.length === 0) {
      setIsTyping(false);
      socket?.emit('typing', false);
    }
  };
  
  // Handle key press in textarea
  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  // Handle reply to a message
  const handleReply = (messageId: string) => {
    setReplyingTo(messageId);
    messageInputRef.current?.focus();
  };
  
  // Get a message by ID (for replies)
  const getMessageById = (id: string) => {
    return messages.find(msg => msg.id === id);
  };
  
  // Handle file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedMedia(reader.result as string);
    };
    reader.readAsDataURL(file);
  };
  
  // Handle clear chat
  const handleClearChat = () => {
    if (window.confirm('Are you sure you want to delete all messages? This cannot be undone.')) {
      socket?.emit('delete-chat');
      setMessages([]);
    }
  };
  
  // Format timestamp
  const formatTime = (timestamp: string) => {
    return format(new Date(timestamp), 'HH:mm');
  };
  
  return (
    <main className="chat-container">
      {showLogin ? (
        <div className="login-screen">
          <h1>Select User</h1>
          <div className="user-buttons">
            <button onClick={() => handleLogin('R')} className="user-r">User R</button>
            <button onClick={() => handleLogin('B')} className="user-b">User B</button>
          </div>
        </div>
      ) : (
        <>
          <header className="chat-header">
            <h2>Chat {user === 'R' ? 'R' : 'B'}</h2>
            {otherUserTyping && <div className="typing-indicator">User {user === 'R' ? 'B' : 'R'} is typing...</div>}
            <button onClick={handleLogout} className="logout-btn">Logout</button>
            <button onClick={handleClearChat} className="clear-chat-btn">Clear Chat</button>
          </header>
          
          <div className="messages-container">
            {messages.map((message) => (
              <div 
                key={message.id} 
                className={`message ${message.sender === user ? 'sent' : 'received'}`}
                onDoubleClick={() => handleReply(message.id)}
              >
                {message.replyTo && (
                  <div className="reply-preview">
                    <p>↪ {getMessageById(message.replyTo)?.text?.slice(0, 30) || ''}{(getMessageById(message.replyTo)?.text?.length || 0) > 30 ? '...' : ''}</p>
                  </div>
                )}
                
                {message.media && (
                  <div className="media-container">
                    <img src={message.media} alt="Media" className="message-media" />
                  </div>
                )}
                
                {message.text && <p>{message.text}</p>}
                
                <div className="message-footer">
                  <span className="timestamp">{formatTime(message.timestamp)}</span>
                  {message.sender === user && (
                    <span className={`read-receipt ${message.seen ? 'seen' : ''}`}>
                      {message.seen ? '✓✓' : '✓'}
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          
          <div className="message-input-container">
            {replyingTo && (
              <div className="reply-container">
                <p>Replying to: {getMessageById(replyingTo)?.text?.slice(0, 30) || ''}{(getMessageById(replyingTo)?.text?.length || 0) > 30 ? '...' : ''}</p>
                <button onClick={() => setReplyingTo(null)} className="cancel-reply-btn">×</button>
              </div>
            )}
            
            {selectedMedia && (
              <div className="media-preview">
                <img src={selectedMedia} alt="Media preview" className="media-preview-img" />
                <button onClick={() => setSelectedMedia(null)} className="cancel-media-btn">×</button>
              </div>
            )}
            
            <div className="input-container">
              <button onClick={() => fileInputRef.current?.click()} className="media-btn">
                📷
              </button>
              <input 
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: 'none' }}
                accept="image/*"
              />
              
              <textarea
                ref={messageInputRef}
                value={newMessage}
                onChange={handleTyping}
                onKeyDown={handleKeyPress}
                placeholder="Type a message..."
                className="message-input"
                rows={1}
              />
              
              <button onClick={handleSendMessage} className="send-btn">
                ➤
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
