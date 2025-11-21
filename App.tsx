import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GeminiLiveService } from './services/geminiLiveService';
import { ConnectionState, TranscriptionItem } from './types';
import Visualizer from './components/Visualizer';
import MessageItem from './components/MessageItem';

// Icons
const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
  </svg>
);

const StopIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
  </svg>
);

const InfoIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
    </svg>
);

const App: React.FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [transcripts, setTranscripts] = useState<TranscriptionItem[]>([]);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  // We need to keep track of the live client instance
  const liveClientRef = useRef<GeminiLiveService | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  const handleTranscript = useCallback((text: string, role: 'user' | 'model', isComplete: boolean) => {
    setTranscripts(prev => {
      const lastItem = prev[prev.length - 1];
      
      // Performance Fix: Stable IDs
      // If the last item is from the same role and pending, update it INSTEAD of creating a new one.
      // This prevents "DOM Thrashing" where the chat bubble is destroyed/recreated on every letter.
      if (lastItem && lastItem.role === role && !lastItem.isComplete) {
         const updated = [...prev];
         updated[updated.length - 1] = {
           ...lastItem,
           text,
           isComplete
         };
         return updated;
      }
      
      // New message turn
      const newItem: TranscriptionItem = {
        id: Date.now().toString(),
        role,
        text,
        isComplete
      };
      
      return [...prev, newItem];
    });
  }, []);

  const toggleConnection = useCallback(async () => {
    if (connectionState === ConnectionState.CONNECTED || connectionState === ConnectionState.CONNECTING) {
      await liveClientRef.current?.disconnect();
      setConnectionState(ConnectionState.DISCONNECTED);
      return;
    }

    // Ensure process.env exists (handled by index.html polyfill) but check for the key
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        setError("API Key missing. Please add 'API_KEY' to your Vercel Environment Variables.");
        return;
    }

    setError(null);
    const client = new GeminiLiveService(
      apiKey,
      handleTranscript,
      setConnectionState,
      setVolume
    );
    liveClientRef.current = client;
    await client.connect();
  }, [connectionState, handleTranscript]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      liveClientRef.current?.disconnect();
    };
  }, []);

  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isConnecting = connectionState === ConnectionState.CONNECTING;

  return (
    <div className="flex flex-col h-full bg-slate-50 max-w-lg mx-auto border-x border-gray-200 shadow-2xl relative">
      
      {/* Header */}
      <header className="bg-white p-4 border-b border-gray-200 sticky top-0 z-10 flex justify-between items-center">
        <div>
            <h1 className="text-xl font-bold text-indigo-900">FluentAI Tutor</h1>
            <p className="text-xs text-gray-500">English Conversation Practice</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${isConnected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {isConnected ? 'Live' : 'Offline'}
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 no-scrollbar flex flex-col">
        {transcripts.length === 0 && !isConnected && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-gray-400">
                <div className="bg-indigo-50 p-4 rounded-full mb-4">
                    <InfoIcon />
                </div>
                <h2 className="text-lg font-semibold text-gray-600 mb-2">Ready to practice?</h2>
                <p className="text-sm max-w-xs">
                    Tap the microphone to start. I'll fix your grammar and give you tips to sound like a native speaker!
                </p>
            </div>
        )}
        
        {transcripts.map((t) => (
            <MessageItem key={t.id} item={t} />
        ))}
        <div ref={messagesEndRef} />
      </main>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 text-center border-t border-red-100">
            {error}
        </div>
      )}

      {/* Footer / Controls */}
      <div className="bg-white p-6 border-t border-gray-200 rounded-t-3xl shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-20">
        
        {/* Visualizer Area */}
        <div className="mb-6">
            <Visualizer volume={volume} isActive={isConnected} />
        </div>

        {/* Controls */}
        <div className="flex justify-center items-center gap-6">
            <button
                onClick={toggleConnection}
                disabled={isConnecting}
                className={`
                    relative flex items-center justify-center w-20 h-20 rounded-full transition-all duration-300 shadow-lg
                    ${isConnected 
                        ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' 
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }
                    ${isConnecting ? 'opacity-70 cursor-not-allowed' : ''}
                `}
            >
                {isConnecting ? (
                     <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
                ) : isConnected ? (
                    <StopIcon />
                ) : (
                    <MicIcon />
                )}
                
                {/* Ripple effect when disconnected to invite click */}
                {!isConnected && !isConnecting && (
                    <span className="absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-20 animate-ping"></span>
                )}
            </button>
        </div>
        
        <p className="text-center text-xs text-gray-400 mt-4 font-medium uppercase tracking-widest">
            {isConnected ? 'Listening...' : 'Tap to Speak'}
        </p>
      </div>
    </div>
  );
};

export default App;