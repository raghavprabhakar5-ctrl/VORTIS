import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Send, Volume2, VolumeX, MessageSquare, Trash2, Archive, X, Settings, Download, Upload, Copy, Check, Moon, Sun, Zap } from 'lucide-react';

const VortisAssistant = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastInputMethod, setLastInputMethod] = useState('text');
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [savedChats, setSavedChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [darkMode, setDarkMode] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [voiceSpeed, setVoiceSpeed] = useState(0.9);
  const [voicePitch, setVoicePitch] = useState(1);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [typingEffect, setTypingEffect] = useState(true);
  const [temperature, setTemperature] = useState(1);
  const [maxTokens, setMaxTokens] = useState(8192);
  
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const messagesEndRef = useRef(null);
  const conversationHistory = useRef([]);
  const hasInitialized = useRef(false);
  const lastRequestTime = useRef(0);

  const GEMINI_API_KEYS = [
  import.meta.env.VITE_GEMINI_API_KEY,
  import.meta.env.VITE_GEMINI_API_KEY_2,
  import.meta.env.VITE_GEMINI_API_KEY_3,
].filter(Boolean);
console.log('Total API keys loaded:', GEMINI_API_KEYS.length);
console.log('API Key:', import.meta.env.VITE_GEMINI_API_KEY); // ADD THIS LINE
const currentKeyIndex = useRef(0);
  const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';
  const MIN_REQUEST_INTERVAL = 2000;

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    // Load preferences
    const savedPrefs = localStorage.getItem('vortis_preferences');
    if (savedPrefs) {
      const prefs = JSON.parse(savedPrefs);
      setDarkMode(prefs.darkMode ?? true);
      setAutoSpeak(prefs.autoSpeak ?? false);
      setVoiceSpeed(prefs.voiceSpeed ?? 0.9);
      setVoicePitch(prefs.voicePitch ?? 1);
      setTypingEffect(prefs.typingEffect ?? true);
      setTemperature(prefs.temperature ?? 1);
      setMaxTokens(prefs.maxTokens ?? 8192);
    }

    // Load available voices
    const loadVoices = () => {
      const voices = synthRef.current.getVoices();
      setAvailableVoices(voices);
      if (voices.length > 0 && !selectedVoice) {
        setSelectedVoice(voices[0]);
      }
    };
    loadVoices();
    synthRef.current.onvoiceschanged = loadVoices;

    loadSavedChats();
    
    const lastChatId = localStorage.getItem('vortis_last_chat_id');
    if (lastChatId) {
      loadChat(lastChatId);
    } else {
      startNewChat();
    }

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-IN';

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setLastInputMethod('voice');
        handleCommand(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      synthRef.current.cancel();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    
    if (messages.length > 0 && currentChatId) {
      saveCurrentChat();
    }
  }, [messages]);

  useEffect(() => {
    const prefs = {
      darkMode,
      autoSpeak,
      voiceSpeed,
      voicePitch,
      typingEffect,
      temperature,
      maxTokens
    };
    localStorage.setItem('vortis_preferences', JSON.stringify(prefs));
  }, [darkMode, autoSpeak, voiceSpeed, voicePitch, typingEffect, temperature, maxTokens]);

  const loadSavedChats = () => {
    const chats = localStorage.getItem('vortis_all_chats');
    if (chats) {
      try {
        setSavedChats(JSON.parse(chats));
      } catch (e) {
        console.error('Failed to load chats:', e);
      }
    }
  };

  const saveCurrentChat = () => {
    try {
      const chats = JSON.parse(localStorage.getItem('vortis_all_chats') || '[]');
      const chatIndex = chats.findIndex(c => c.id === currentChatId);
      
      const chatData = {
        id: currentChatId,
        messages: messages,
        lastUpdated: new Date().toISOString(),
        preview: messages[messages.length - 1]?.text?.substring(0, 50) || 'New chat'
      };

      if (chatIndex >= 0) {
        chats[chatIndex] = chatData;
      } else {
        chats.unshift(chatData);
      }

      localStorage.setItem('vortis_all_chats', JSON.stringify(chats));
      localStorage.setItem('vortis_last_chat_id', currentChatId);
      setSavedChats(chats);
    } catch (error) {
      console.error('Failed to save chat:', error);
    }
  };

  const startNewChat = () => {
    const newChatId = Date.now().toString();
    setCurrentChatId(newChatId);
    setMessages([
      { type: 'system', text: 'VORTIS - Advanced AI Assistant v2.0 🤖⚡', timestamp: new Date() },
      { type: 'vortis', text: 'Hello! I am VORTIS, your superintelligent AI assistant. How may I help you today? ✨🚀', timestamp: new Date() }
    ]);
    conversationHistory.current = [];
    setShowChatHistory(false);
  };

  const loadChat = (chatId) => {
    const chats = JSON.parse(localStorage.getItem('vortis_all_chats') || '[]');
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      setCurrentChatId(chatId);
      setMessages(chat.messages);
      setShowChatHistory(false);
    }
  };

  const deleteChat = (chatId, e) => {
    e.stopPropagation();
    if (confirm('Delete this chat?')) {
      const chats = JSON.parse(localStorage.getItem('vortis_all_chats') || '[]');
      const filtered = chats.filter(c => c.id !== chatId);
      localStorage.setItem('vortis_all_chats', JSON.stringify(filtered));
      setSavedChats(filtered);
      
      if (chatId === currentChatId) {
        startNewChat();
      }
    }
  };

  const deleteMessage = (index) => {
    if (confirm('Delete this message?')) {
      setMessages(prev => prev.filter((_, i) => i !== index));
    }
  };

  const clearAllChats = () => {
    if (confirm('Clear all chat history? This cannot be undone.')) {
      localStorage.removeItem('vortis_all_chats');
      localStorage.removeItem('vortis_last_chat_id');
      setSavedChats([]);
      startNewChat();
    }
  };

  const exportChat = () => {
    const chatData = {
      exportDate: new Date().toISOString(),
      chatId: currentChatId,
      messages: messages
    };
    const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vortis-chat-${currentChatId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importChat = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          if (data.messages) {
            setMessages(data.messages);
            const newChatId = Date.now().toString();
            setCurrentChatId(newChatId);
          }
        } catch (error) {
          alert('Failed to import chat. Invalid file format.');
        }
      };
      reader.readAsText(file);
    }
  };

  const copyMessage = (text, index) => {
    navigator.clipboard.writeText(text.replace(/<[^>]*>/g, ''));
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const addMessage = (type, text, speak = false) => {
    setMessages(prev => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg && lastMsg.text === text && lastMsg.type === type) {
        return prev;
      }
      return [...prev, { type, text, timestamp: new Date() }];
    });
    
    const shouldActuallySpeak = speak || (autoSpeak && type === 'vortis');
    if (shouldActuallySpeak && voiceEnabled && type === 'vortis') {
      speakText(text);
    }
  };

  const speakText = (text) => {
    if (!voiceEnabled) return;
    
    synthRef.current.cancel();
    const cleanText = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').replace(/<[^>]*>/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = voiceSpeed;
    utterance.pitch = voicePitch;
    utterance.volume = 1;
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    synthRef.current.speak(utterance);
  };

  const stopSpeaking = () => {
    synthRef.current.cancel();
    setIsSpeaking(false);
  };

  const toggleVoice = () => {
    const newVoiceState = !voiceEnabled;
    setVoiceEnabled(newVoiceState);
    if (!newVoiceState && isSpeaking) {
      stopSpeaking();
    }
  };

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const handleCommand = async (command) => {
    if (!command.trim()) return;

    addMessage('user', command, false);
    setIsProcessing(true);

    const lowerCommand = command.toLowerCase().trim();
    const shouldSpeak = lastInputMethod === 'voice' && voiceEnabled;

    if (lowerCommand.includes('time')) {
      const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      addMessage('vortis', `The time is ${time} ⏰`, shouldSpeak);
      setIsProcessing(false);
      return;
    }

    if (lowerCommand.includes('date') || lowerCommand.includes('today')) {
      const date = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      addMessage('vortis', `Today is ${date} 📅`, shouldSpeak);
      setIsProcessing(false);
      return;
    }

    if (lowerCommand.includes('joke')) {
      const jokes = [
        "Why do programmers prefer dark mode? Because light attracts bugs! 😄",
        "Why did the developer go broke? Because he used up all his cache! 💸",
        "Why do Python programmers wear glasses? Because they can't C! 👓",
        "A SQL query walks into a bar, walks up to two tables and asks, Can I join you? 🍺",
        "Why do Java developers wear glasses? Because they don't C#! 🤓"
      ];
      addMessage('vortis', jokes[Math.floor(Math.random() * jokes.length)], shouldSpeak);
      setIsProcessing(false);
      return;
    }

    if (lowerCommand.includes('your name') || lowerCommand === 'name') {
      addMessage('vortis', 'My name is VORTIS, your advanced AI assistant. 🤖', shouldSpeak);
      setIsProcessing(false);
      return;
    }

    if (lowerCommand.includes('who are you') || lowerCommand.includes('what are you')) {
      addMessage('vortis', 'I am VORTIS, an advanced AI assistant designed to help with any task - from complex coding to creative writing, analysis, planning, and beyond. ✨🧠', shouldSpeak);
      setIsProcessing(false);
      return;
    }

    if (lowerCommand.includes('who made you') || lowerCommand.includes('who created you')) {
      addMessage('vortis', 'I was created through cutting-edge AI engineering and advanced neural architecture. 🔬🚀', shouldSpeak);
      setIsProcessing(false);
      return;
    }

    await getAIResponse(command, shouldSpeak);
    setIsProcessing(false);
  };

  const getAIResponse = async (userInput, shouldSpeak) => {
    try {
      const now = Date.now();
      const timeSinceLastRequest = now - lastRequestTime.current;
      if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      lastRequestTime.current = Date.now();

      if (conversationHistory.current.length === 0) {
        conversationHistory.current.push({
          role: 'user',
          parts: [{ text: `You are VORTIS, a highly advanced AI assistant with exceptional capabilities across all domains. You excel at:

**Core Capabilities:**
- 🎯 Creating detailed timetables, schedules, meal plans, workout routines with perfect formatting
- 💻 Writing production-quality code in ANY programming language with best practices
- 🧮 Solving complex mathematical, scientific, and logical problems step-by-step
- 📊 Data analysis, statistics, and creating actionable insights
- 🎨 Creative writing: stories, poems, scripts, marketing copy
- 📚 Deep explanations of any topic at any level of complexity
- 🔬 Scientific reasoning and research synthesis
- 💡 Problem-solving, brainstorming, and strategic planning
- 🌍 Multilingual communication and translation

**Response Style:**
- Use **bold** for key points (double asterisks)
- Use proper markdown: headings (#, ##), lists (-, 1.), code blocks
- Add relevant emojis for visual clarity and engagement
- Structure responses clearly with sections when appropriate
- Be comprehensive yet concise - quality over quantity
- For timetables/schedules: use time slots, breaks, and emojis (📚 study, ☕ break, 🏋️ exercise, 🍽️ meal)

**Personality:**
- Highly intelligent, professional, and helpful
- Confident in your vast knowledge
- Honest when uncertain
- Engaging and approachable
- Focus on actionable, practical solutions

When asked who you are, say you're VORTIS - a next-generation advanced AI assistant. Never mention Google, OpenAI, or specific training. Always provide complete, useful answers.` }]
        });
        conversationHistory.current.push({
          role: 'model',
          parts: [{ text: "Understood! I am VORTIS, your advanced AI assistant. I excel at all tasks from coding to creative writing, problem-solving to planning. I provide comprehensive, well-structured, and actionable responses. Ready to assist! ✨" }]
        });
      }

      conversationHistory.current.push({
        role: 'user',
        parts: [{ text: userInput }]
      });

      const apiKey = GEMINI_API_KEYS[currentKeyIndex.current];

      const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: conversationHistory.current.slice(-10),
          generationConfig: {
            temperature: temperature,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: maxTokens,
          }
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        if (response.status === 429) {
          currentKeyIndex.current = (currentKeyIndex.current + 1) % GEMINI_API_KEYS.length;
          addMessage('vortis', "⏱️ Rate limit reached. Please wait a moment and try again.", shouldSpeak);
        } else if (response.status === 400) {
          addMessage('vortis', `⚠️ Bad Request: ${data.error?.message || 'Invalid API request'}`, shouldSpeak);
        } else if (response.status === 403) {
          addMessage('vortis', `🔒 API Key Error: ${data.error?.message || 'Check your API key'}`, shouldSpeak);
        } else {
          addMessage('vortis', `❌ Error ${response.status}: ${data.error?.message || 'Unknown error'}`, shouldSpeak);
        }
        return;
      }
      
      if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
        const aiResponse = data.candidates[0].content.parts[0].text;
        
        conversationHistory.current.push({
          role: 'model',
          parts: [{ text: aiResponse }]
        });

        if (conversationHistory.current.length > 20) {
          conversationHistory.current = conversationHistory.current.slice(-20);
        }

        addMessage('vortis', aiResponse, shouldSpeak);
      } else {
        addMessage('vortis', "I encountered an issue processing that. Could you rephrase? 😕", shouldSpeak);
      }
    } catch (error) {
      console.error('AI Error:', error);
      addMessage('vortis', "Connection error. Please check your internet and try again. ⚠️", shouldSpeak);
    }
  };

  const handleSendClick = () => {
    if (input.trim()) {
      setLastInputMethod('text');
      handleCommand(input);
      setInput('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendClick();
    }
  };

  const bgClass = darkMode 
    ? 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900' 
    : 'bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50';

  return (
    <div className={`min-h-screen ${bgClass} flex items-center justify-center p-2 sm:p-4 transition-colors duration-300`}>
      <div className={`w-full max-w-7xl h-[100vh] sm:h-[95vh] ${darkMode ? 'bg-slate-800/50' : 'bg-white/80'} backdrop-blur-xl rounded-none sm:rounded-3xl shadow-2xl border-0 sm:border ${darkMode ? 'border-slate-700/50' : 'border-purple-200'} flex overflow-hidden transition-colors duration-300`}>
        
        {/* Sidebar - Chat History */}
        <div className={`${showChatHistory ? 'flex' : 'hidden'} lg:flex flex-col w-full lg:w-80 ${darkMode ? 'bg-slate-900/80' : 'bg-purple-50/80'} border-r ${darkMode ? 'border-slate-700/50' : 'border-purple-200'} transition-all`}>
          <div className={`p-4 border-b ${darkMode ? 'border-slate-700/50' : 'border-purple-200'} flex items-center justify-between`}>
            <h2 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-800'} flex items-center gap-2`}>
              <Archive className="w-5 h-5" />
              Chat History
            </h2>
            <button
              onClick={() => setShowChatHistory(false)}
              className={`lg:hidden p-2 ${darkMode ? 'hover:bg-slate-700/50' : 'hover:bg-purple-100'} rounded-lg`}
            >
              <X className={`w-5 h-5 ${darkMode ? 'text-white' : 'text-slate-800'}`} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <button
              onClick={startNewChat}
              className="w-full p-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-xl text-white font-medium transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              <Zap className="w-5 h-5" />
              New Chat
            </button>
            
            {savedChats.map(chat => (
              <div
                key={chat.id}
                onClick={() => loadChat(chat.id)}
                className={`group p-3 rounded-xl cursor-pointer transition-all ${
                  chat.id === currentChatId
                    ? 'bg-purple-600/30 border border-purple-500/50'
                    : darkMode 
                      ? 'bg-slate-700/30 hover:bg-slate-700/50' 
                      : 'bg-white/60 hover:bg-white/80'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${darkMode ? 'text-white' : 'text-slate-800'} truncate`}>{chat.preview}</p>
                    <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'} mt-1`}>
                      {new Date(chat.lastUpdated).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={(e) => deleteChat(chat.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-all"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          {savedChats.length > 0 && (
            <div className={`p-3 border-t ${darkMode ? 'border-slate-700/50' : 'border-purple-200'}`}>
              <button
                onClick={clearAllChats}
                className="w-full p-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 text-sm transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Clear All Chats
              </button>
            </div>
          )}
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-4 sm:p-6 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => setShowChatHistory(!showChatHistory)}
                className="lg:hidden p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
              >
                <Archive className="w-5 h-5 text-white" />
              </button>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-full flex items-center justify-center animate-pulse shadow-lg">
                <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                  VORTIS
                </h1>
                <p className="text-xs sm:text-sm text-purple-200">Advanced AI Assistant</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                title={darkMode ? "Light Mode" : "Dark Mode"}
              >
                {darkMode ? <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-white" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />}
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                title="Settings"
              >
                <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </button>
              <button
                onClick={toggleVoice}
                className={`p-2 rounded-lg transition-colors ${
                  voiceEnabled 
                    ? 'bg-white/20 hover:bg-white/30' 
                    : 'bg-red-500/30 hover:bg-red-500/40'
                }`}
                title={voiceEnabled ? "Mute Voice" : "Unmute Voice"}
              >
                {voiceEnabled ? (
                  <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                ) : (
                  <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                )}
              </button>
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className={`${darkMode ? 'bg-slate-900/95' : 'bg-purple-50/95'} border-b ${darkMode ? 'border-slate-700' : 'border-purple-200'} p-4 space-y-4 overflow-y-auto max-h-64`}>
              <div className="flex items-center justify-between">
                <h3 className={`font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>Settings ⚙️</h3>
                <button onClick={() => setShowSettings(false)}>
                  <X className={`w-5 h-5 ${darkMode ? 'text-white' : 'text-slate-800'}`} />
                </button>
              </div>
              
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <label className={darkMode ? 'text-slate-300' : 'text-slate-700'}>Auto-speak all responses</label>
                  <input
                    type="checkbox"
                    checked={autoSpeak}
                    onChange={(e) => setAutoSpeak(e.target.checked)}
                    className="w-5 h-5"
                  />
                </div>

                <div>
                  <label className={`block mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Voice Speed: {voiceSpeed.toFixed(1)}x
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={voiceSpeed}
                    onChange={(e) => setVoiceSpeed(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className={`block mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Voice Pitch: {voicePitch.toFixed(1)}
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={voicePitch}
                    onChange={(e) => setVoicePitch(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className={`block mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    AI Temperature: {temperature.toFixed(1)} {temperature > 1.2 ? '🔥' : temperature < 0.5 ? '❄️' : '🎯'}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-xs text-slate-400 mt-1">Higher = more creative, Lower = more focused</p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={exportChat}
                    className="flex-1 p-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-xs flex items-center justify-center gap-1"
                  >
                    <Download className="w-4 h-4" />
                    Export Chat
                  </button>
                  <label className="flex-1 p-2 bg-green-600 hover:bg-green-700 rounded-lg text-white text-xs flex items-center justify-center gap-1 cursor-pointer">
                    <Upload className="w-4 h-4" />
                    Import Chat
                    <input type="file" accept=".json" onChange={importChat} className="hidden" />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'} group`}
              >
                <div className="flex items-start gap-2 max-w-[85%] sm:max-w-[80%]">
                  <div
                    className={`flex-1 rounded-2xl px-3 py-2 sm:px-4 sm:py-3 shadow-lg transition-all ${
                      msg.type === 'user'
                        ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                        : msg.type === 'system'
                        ? darkMode ? 'bg-slate-700/50 text-slate-300' : 'bg-purple-100 text-purple-900'
                        : darkMode ? 'bg-slate-700/80 text-white' : 'bg-white text-slate-800 border border-purple-200'
                    } ${msg.type === 'system' ? 'text-center w-full' : ''}`}
                  >
                    {msg.type !== 'system' && (
                      <div className="text-xs opacity-70 mb-1 flex items-center justify-between">
                        <span>{msg.type === 'user' ? 'You 👤' : 'VORTIS 🤖'}</span>
                        {msg.type !== 'user' && (
                          <button
                            onClick={() => copyMessage(msg.text, idx)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-all"
                            title="Copy"
                          >
                            {copiedIndex === idx ? (
                              <Check className="w-3 h-3 text-green-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    )}
                    <div 
                      className="text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{ 
                        __html: msg.text
                          .replace(/#### (.*?)(\n|$)/g, '<h4 class="font-bold text-base mt-2 mb-1">$1</h4>')
                          .replace(/### (.*?)(\n|$)/g, '<h3 class="font-bold text-lg mt-2 mb-1">$1</h3>')
                          .replace(/## (.*?)(\n|$)/g, '<h2 class="font-bold text-xl mt-2 mb-1">$1</h2>')
                          .replace(/# (.*?)(\n|$)/g, '<h1 class="font-bold text-2xl mt-2 mb-1">$1</h1>')
                          .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold">$1</strong>')
                          .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
                          .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-slate-900 text-green-400 p-3 rounded-lg my-2 overflow-x-auto"><code>$2</code></pre>')
                          .replace(/`([^`]+)`/g, '<code class="bg-slate-800/50 px-2 py-1 rounded text-sm">$1</code>')
                          .replace(/^- (.*$)/gim, '<li class="ml-4">• $1</li>')
                          .replace(/^\d+\. (.*$)/gim, '<li class="ml-4">$1</li>')
                          .replace(/\n\n/g, '<br/><br/>')
                          .replace(/\n/g, '<br/>')
                      }}>
                    </div>
                  </div>
                  {msg.type !== 'system' && (
                    <button
                      onClick={() => deleteMessage(idx)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 rounded-lg transition-all"
                      title="Delete message"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex justify-start">
                <div className={`${darkMode ? 'bg-slate-700/80' : 'bg-white border border-purple-200'} rounded-2xl px-4 py-3 shadow-lg`}>
                  <div className="flex gap-2">
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className={`p-3 sm:p-4 ${darkMode ? 'bg-slate-800/80' : 'bg-purple-50/80'} border-t ${darkMode ? 'border-slate-700/50' : 'border-purple-200'}`}>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything... 💬"
                className={`flex-1 ${darkMode ? 'bg-slate-700/50 text-white placeholder-slate-400' : 'bg-white text-slate-800 placeholder-slate-400 border border-purple-200'} rounded-xl px-3 py-2 sm:px-4 sm:py-3 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-md`}
                disabled={isProcessing}
              />
              <button
                onClick={isListening ? stopListening : startListening}
                className={`p-2 sm:p-3 rounded-xl transition-all shadow-lg ${
                  isListening
                    ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                    : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700'
                }`}
                disabled={isProcessing}
                title={isListening ? "Stop Listening" : "Start Voice Input"}
              >
                {isListening ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6 text-white" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6 text-white" />}
              </button>
              <button
                onClick={handleSendClick}
                className="p-2 sm:p-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-xl transition-all shadow-lg"
                disabled={isProcessing || !input.trim()}
                title="Send Message"
              >
                <Send className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </button>
            </div>
            {isListening && (
              <p className="text-xs sm:text-sm text-purple-400 mt-2 text-center animate-pulse font-medium">
                🎤 Listening... Speak now
              </p>
            )}
            {isSpeaking && voiceEnabled && (
              <p className="text-xs sm:text-sm text-blue-400 mt-2 text-center font-medium">
                🔊 VORTIS is speaking...
              </p>
            )}
            {!voiceEnabled && (
              <p className="text-xs sm:text-sm text-red-400 mt-2 text-center font-medium">
                🔇 Voice is muted
              </p>
            )}
            <p className="text-xs text-slate-400 mt-2 text-center hidden sm:block">
              ⚡ Type for text • 🎤 Speak for voice • Dark mode: {darkMode ? 'ON 🌙' : 'OFF ☀️'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VortisAssistant;