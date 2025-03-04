
import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, push, update, remove } from 'firebase/database';
import './App.css';

// Initialize Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCmqS52ypihassF4hYlFnfNr5VMxxlYsis",
  authDomain: "project-6a7c4.firebaseapp.com",
  databaseURL: "https://project-6a7c4-default-rtdb.firebaseio.com",
  projectId: "project-6a7c4",
  storageBucket: "project-6a7c4.appspot.com",
  messagingSenderId: "152367969169",
  appId: "1:152367969169:web:6bc05a9d8152391e07e030"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

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

// Define typing status type
interface TypingStatus {
  R: boolean;
  B: boolean;
}

export default function App() {
  // User state
  const [user, setUser] = useState<'R' | 'B' | null>(null);
  const [showLogin, setShowLogin] = useState(true);
  
  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Connect to Firebase on mount
  useEffect(() => {
    // Check for saved user
    const savedUser = localStorage.getItem('chatUser');
    if (savedUser && (savedUser === 'R' || savedUser === 'B')) {
      setUser(savedUser);
      setShowLogin(false);
    }
  }, []);
  
  // Listen for messages when user is set
  useEffect(() => {
    if (!user) return;
    
    // Get chat history from Firebase
    const messagesRef = ref(database, 'messages');
    const unsubscribeMessages = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const messageList = Object.values(data) as Message[];
        setMessages(messageList.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
        
        // Mark messages as seen
        messageList.forEach(msg => {
          if (msg.sender !== user && !msg.seen) {
            const messageRef = ref(database, `messages/${msg.id}`);
            update(messageRef, { seen: true });
          }
        });
      } else {
        setMessages([]);
      }
    });
    
    // Listen for typing status
    const typingRef = ref(database, 'typing');
    const unsubscribeTyping = onValue(typingRef, (snapshot) => {
      const data = snapshot.val() as TypingStatus;
      if (data) {
        setOtherUserTyping(user === 'R' ? data.B : data.R);
      }
    });
    
    // Set user online status
    const userRef = ref(database, `users/${user}`);
    set(userRef, { online: true, lastSeen: new Date().toISOString() });
    
    // Clean up on unmount
    return () => {
      unsubscribeMessages();
      unsubscribeTyping();
      set(userRef, { online: false, lastSeen: new Date().toISOString() });
    };
  }, [user, database]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Handle typing status
  useEffect(() => {
    if (!user) return;
    
    const typingRef = ref(database, `typing/${user}`);
    set(typingRef, isTyping);
    
    return () => {
      set(typingRef, false);
    };
  }, [isTyping, user, database]);
  
  // Handle login
  const handleLogin = (selectedUser: 'R' | 'B') => {
    setUser(selectedUser);
    setShowLogin(false);
    localStorage.setItem('chatUser', selectedUser);
  };
  
  // Handle logout
  const handleLogout = () => {
    if (user) {
      const userRef = ref(database, `users/${user}`);
      set(userRef, { online: false, lastSeen: new Date().toISOString() });
    }
    
    localStorage.removeItem('chatUser');
    setUser(null);
    setShowLogin(true);
    window.location.reload();
  };
  
  // Handle sending a message
  const handleSendMessage = () => {
    if (!user || (!newMessage.trim() && !selectedMedia)) return;
    
    const messageId = uuidv4();
    const message: Message = {
      id: messageId,
      sender: user,
      text: newMessage.trim(),
      timestamp: new Date().toISOString(),
      seen: false,
      ...(replyingTo && { replyTo: replyingTo }),
      ...(selectedMedia && { media: selectedMedia }),
    };
    
    // Save message to Firebase
    const messageRef = ref(database, `messages/${messageId}`);
    set(messageRef, message);
    
    setNewMessage('');
    setReplyingTo(null);
    setSelectedMedia(null);
    setShowEmojiPicker(false);
    
    // Reset typing indicator
    setIsTyping(false);
  };
  
  // Handle typing indicator
  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    
    if (!isTyping && e.target.value.length > 0) {
      setIsTyping(true);
    } else if (isTyping && e.target.value.length === 0) {
      setIsTyping(false);
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
      const messagesRef = ref(database, 'messages');
      remove(messagesRef);
    }
  };
  
  // Format timestamp
  const formatTime = (timestamp: string) => {
    return format(new Date(timestamp), 'HH:mm');
  };
  
  // Add emoji to message
  const addEmoji = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
    messageInputRef.current?.focus();
  };
  
  // Common emojis
  const commonEmojis = ['😊', '😂', '❤️', '👍', '🙏', '😍', '🔥', '😎', '🤔', '👋', '😢', '🎉', '👏', '🌟', '💯', '💪', '🤗', '👀', '🙄', '😴'];
  
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
            <button onClick={handleLogout} className="logout-btn">
              <i className="icon-logout"></i>
            </button>
            <button onClick={handleClearChat} className="clear-chat-btn">
              <i className="icon-trash"></i>
            </button>
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
            
            {showEmojiPicker && (
              <div className="emoji-picker">
                {commonEmojis.map(emoji => (
                  <button 
                    key={emoji} 
                    className="emoji-btn" 
                    onClick={() => addEmoji(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            
            <div className="input-container">
              <button onClick={() => fileInputRef.current?.click()} className="media-btn">
                <i className="icon-image"></i>
              </button>
              <input 
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: 'none' }}
                accept="image/*"
              />
              
              <button 
                onClick={() => setShowEmojiPicker(!showEmojiPicker)} 
                className="emoji-toggle-btn"
              >
                <i className="icon-emoji"></i>
              </button>
              
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
                <i className="icon-send"></i>
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
