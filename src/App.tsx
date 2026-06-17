/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useRef } from 'react';
import { ScenePlan, GenerationStats, HistoryItem } from './types';
import { Loader2, History, Copy, Check, Volume2, Mic, Square } from 'lucide-react';
import { base64ToWavUrl, audioFileToBase64Wav } from './utils';

export default function App() {
  const [script, setScript] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [scenes, setScenes] = useState<ScenePlan[]>([]);
  const [stats, setStats] = useState<GenerationStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaPref, setMediaPref] = useState<'photos' | 'videos'>('photos');
  const [sceneCount, setSceneCount] = useState<string>('auto');
  const [textModel, setTextModel] = useState<string>('auto');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [passwordInput, setPasswordInput] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState(() => localStorage.getItem('app_api_key') || '');
  const [authError, setAuthError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('app_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);

  // Audio state
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [voiceName, setVoiceName] = useState('Puck');
  const [customVoice, setCustomVoice] = useState<{ name: string, base64: string } | null>(null);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  
  // We don't persist the password so the user has to login on every reload
  const [savedPassword, setSavedPassword] = useState('');
  const [savedApiKey, setSavedApiKey] = useState(() => localStorage.getItem('app_api_key') || '');

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/verify-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: savedPassword })
        });
        if (res.ok) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
          localStorage.removeItem('app_password'); // clear legacy
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsCheckingAuth(false);
      }
    };
    checkAuth();
  }, [savedPassword]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCheckingAuth(true);
    setAuthError('');
    try {
      const res = await fetch('/api/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput })
      });
      if (res.ok) {
        setSavedPassword(passwordInput);
        setSavedApiKey(apiKeyInput);
        if (apiKeyInput) {
          localStorage.setItem('app_api_key', apiKeyInput);
        } else {
          localStorage.removeItem('app_api_key');
        }
      } else {
        setAuthError('Incorrect password');
      }
    } catch (err) {
      setAuthError('Error verifying password');
    } finally {
      setIsCheckingAuth(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (e.key.toLowerCase() === 't') {
        setMediaPref(prev => prev === 'photos' ? 'videos' : 'photos');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthenticated]);

  const handleLogout = () => {
    localStorage.removeItem('app_password');
    localStorage.removeItem('app_api_key');
    setSavedPassword('');
    setSavedApiKey('');
    setApiKeyInput('');
    setIsAuthenticated(false);
    setShowSettings(false);
  };

  const handleGenerate = async () => {
    if (!script.trim()) return;

    setIsLoading(true);
    setError(null);
    setScenes([]);
    setStats(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, sceneCount, password: savedPassword, apiKey: savedApiKey, textModel })
      });

      if (!res.ok) {
        const errorData = await res.json();
        if (res.status === 401) {
           setIsAuthenticated(false);
           localStorage.removeItem('app_password');
        }
        throw new Error(errorData.error || 'Failed to generate asset plan');
      }

      const data = await res.json();
      setScenes(data.scenes);
      setStats(data.stats);

      const newItem: HistoryItem = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        script,
        scenes: data.scenes,
        stats: data.stats
      };
      
      setHistory(prev => {
        const updated = [newItem, ...prev].slice(0, 10);
        localStorage.setItem('app_history', JSON.stringify(updated));
        return updated;
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingAuth && !isAuthenticated && !savedPassword && !passwordInput) {
    // Initial load state
  }

  if (!isAuthenticated && !isCheckingAuth) {
    return (
      <div className="w-full h-[100dvh] bg-[#0A0A0B] text-slate-200 flex items-center justify-center font-sans overflow-hidden">
        <form onSubmit={handleLogin} className="bg-[#0F0F11] border border-white/10 p-8 rounded-2xl w-full max-w-sm flex flex-col gap-6 shadow-2xl">
          <div className="flex flex-col items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-sky-500 rounded flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
            </div>
            <h1 className="text-xl font-bold tracking-tight uppercase mt-2">
              Asset <span className="text-sky-500">Planner</span>
            </h1>
            <p className="text-xs text-slate-500">Enter password to access</p>
          </div>
          
          <div className="space-y-4">
            <div>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="App Password"
                className="w-full bg-[#050505] border border-white/10 rounded-lg p-3 text-sm text-slate-300 focus:outline-none focus:border-sky-500 transition-colors"
                autoFocus
              />
            </div>
            
            <div>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Your Gemini API Key (Optional)"
                className="w-full bg-[#050505] border border-white/10 rounded-lg p-3 text-sm text-slate-300 focus:outline-none focus:border-sky-500 transition-colors"
              />
            </div>
            
            {authError && (
              <div className="text-red-400 text-xs font-medium text-center">
                {authError}
              </div>
            )}
            
            <button
              type="submit"
              disabled={isCheckingAuth || !passwordInput}
              className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-lg transition-all shadow-lg shadow-sky-500/20 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
            >
              {isCheckingAuth ? <Loader2 className="w-4 h-4 animate-spin" /> : 'UNLOCK'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // If still checking auth initially
  if (!isAuthenticated) {
     return <div className="w-full h-[100dvh] bg-[#0A0A0B] text-slate-200 flex items-center justify-center font-sans overflow-hidden"><Loader2 className="w-8 h-8 animate-spin text-sky-500" /></div>;
  }

  const getPexelsUrl = (term: string, type: 'photos' | 'videos' = 'photos') => {
    const parts = term.trim().split(/\s+/);
    const q = encodeURIComponent(term.trim());
    
    if (parts.length > 1) {
      return type === 'photos'
        ? `https://www.pexels.com/search/?q=${q}`
        : `https://www.pexels.com/search/videos/?q=${q}`;
    } else {
      return type === 'photos'
        ? `https://www.pexels.com/search/${q}/`
        : `https://www.pexels.com/search/videos/${q}/`;
    }
  };

  const handleCopyPlan = () => {
    const textPlan = scenes.map((s, i) => `Scene ${i + 1}: ${s.title}\nScript: "${s.scriptSnippet}"\nVisual: ${s.visualDescription}\nSearch Terms: ${s.searchTerms.join(', ')}`).join('\n\n');
    
    navigator.clipboard.writeText(textPlan);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const loadHistoryItem = (item: HistoryItem) => {
    setScript(item.script);
    setScenes(item.scenes);
    setStats(item.stats);
    setShowHistory(false);
    setError(null);
    setAudioUrl(null);
  };

  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;

  const handleGenerateAudio = async () => {
    if (!script.trim()) return;
    setIsGeneratingAudio(true);
    setAudioUrl(null);
    setError(null);
    try {
      const payload = {
        text: script,
        voiceName,
        password: savedPassword,
        apiKey: savedApiKey,
        customVoiceAudioBase64: voiceName === 'custom' && customVoice ? customVoice.base64 : undefined
      };

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        if (res.status === 401) {
           setIsAuthenticated(false);
           localStorage.removeItem('app_password');
        }
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
           const errData = await res.json();
           throw new Error(errData.error || `Failed to generate audio (Status ${res.status})`);
        } else {
           throw new Error(`Failed to generate audio: Status ${res.status}`);
        }
      }
      const data = await res.json();
      const url = base64ToWavUrl(data.audioBase64);
      setAudioUrl(url);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Something went wrong generating audio');
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsProcessingAudio(true);
    try {
      const base64 = await audioFileToBase64Wav(file);
      setCustomVoice({ name: file.name, base64 });
    } catch (err) {
      console.error("Error processing audio:", err);
      setError("Failed to process audio file for cloning. It must be a valid audio file.");
    } finally {
      setIsProcessingAudio(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], "recorded_voice.webm", { type: 'audio/webm' });

        setIsProcessingAudio(true);
        try {
          const base64 = await audioFileToBase64Wav(file);
          setCustomVoice({ name: "Microphone Recording", base64 });
        } catch (err) {
          console.error("Error processing audio:", err);
          setError("Failed to process recorded audio for cloning.");
        } finally {
          setIsProcessingAudio(false);
        }
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Microphone access denied. Try opening the app in a new tab if you are inside an iframe.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="w-full h-[100dvh] bg-[#0A0A0B] text-slate-200 flex flex-col font-sans overflow-hidden">
      {/* Top Header */}
      <header className="h-16 border-b border-white/10 px-6 md:px-8 flex items-center justify-between bg-[#0F0F11] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-sky-500 rounded flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
          </div>
          <h1 className="text-lg font-semibold tracking-tight uppercase hidden md:block">
            Asset <span className="text-sky-500">Planner</span>
          </h1>
        </div>
        <div className="flex items-center gap-4 md:gap-6">
          <div className="flex items-center gap-2 bg-white/5 rounded-full px-3 py-1.5 border border-white/10">
            <span className="text-xs font-medium text-slate-400 hidden sm:inline">GLOBAL PREFERENCE:</span>
            <div className="flex bg-black/40 rounded-full p-0.5">
              <button 
                onClick={() => setMediaPref('photos')}
                className={`px-3 py-1 text-[10px] rounded-full font-bold transition-all ${mediaPref === 'photos' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                PHOTOS
              </button>
              <button 
                onClick={() => setMediaPref('videos')}
                className={`px-3 py-1 text-[10px] rounded-full font-bold transition-all ${mediaPref === 'videos' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                VIDEOS
              </button>
            </div>
          </div>
          <button 
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-300 transition-colors"
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">HISTORY</span>
          </button>
          <div className="relative">
            <div 
              className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center cursor-pointer hover:bg-white/5 transition-colors hidden sm:flex"
              onClick={() => setShowSettings(!showSettings)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
              </svg>
            </div>
            {showSettings && (
               <div className="absolute top-10 right-0 w-32 bg-[#111114] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
                <button 
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2.5 text-xs font-bold tracking-wide text-red-400 hover:bg-white/5 transition-colors uppercase"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar: Script Input */}
        <aside className="w-full md:w-80 border-b md:border-b-0 md:border-r border-white/10 flex flex-col bg-[#0F0F11] shrink-0 h-1/3 md:h-auto">
          <div className="p-6 flex flex-col h-full">
            <div className="flex flex-col gap-3 mb-3">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Project Script</label>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Model:</label>
                  <select 
                    value={textModel} 
                    onChange={(e) => setTextModel(e.target.value)}
                    className="bg-[#050505] border border-white/10 text-slate-300 text-[10px] rounded px-2 py-0.5 w-24 focus:outline-none focus:border-sky-500"
                  >
                    <option value="auto">Auto</option>
                    <option value="gemma-4-31b">Gemma 4 31B</option>
                    <option value="gemma-26b">Gemma 26B</option>
                    <option value="a4b">A4B</option>
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                    <option value="gemini-3.5-pro">Gemini 3.5 Pro</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Scenes:</label>
                  <input 
                    type="text" 
                    value={sceneCount} 
                    onChange={(e) => setSceneCount(e.target.value)}
                    placeholder="Auto"
                    className="bg-[#050505] border border-white/10 text-slate-300 text-[10px] rounded px-2 py-0.5 w-12 text-center focus:outline-none focus:border-sky-500 placeholder-slate-500"
                  />
                </div>
              </div>
            </div>
            <div className="flex-1 relative mb-6">
              <textarea 
                className="w-full h-full bg-[#050505] border border-white/5 rounded-lg p-4 text-sm leading-relaxed text-slate-400 focus:outline-none focus:border-sky-500/50 resize-none custom-scrollbar"
                placeholder="Paste your YouTube script here..."
                value={script}
                onChange={(e) => setScript(e.target.value)}
                readOnly={isLoading}
              ></textarea>
              <div className="absolute bottom-3 left-3 text-[10px] font-medium text-slate-500">
                {wordCount} words
              </div>
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button 
                  className="p-1.5 bg-white/5 hover:bg-white/10 rounded-md text-slate-400 transition-all disabled:opacity-50"
                  onClick={() => setScript('')}
                  disabled={isLoading || !script}
                  title="Clear script"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <button 
              onClick={handleGenerate}
              disabled={isLoading || !script.trim()}
              className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-lg transition-all shadow-lg shadow-sky-500/20 active:scale-[0.98] disabled:active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-4"
            >
              {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
              )}
              {isLoading ? 'ANALYZING...' : (scenes.length > 0 ? 'RE-ANALYZE SCRIPT' : 'ANALYZE SCRIPT')}
            </button>

            <div className="bg-[#141417] border border-white/10 p-4 rounded-xl flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5" /> Text to Speech
                </label>
                <select 
                  className="bg-[#050505] border border-white/10 text-slate-300 text-[10px] rounded px-2 py-1 focus:outline-none focus:border-sky-500 max-w-[120px] truncate"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                >
                  <option value="Puck">Puck</option>
                  <option value="Charon">Charon</option>
                  <option value="Kore">Kore</option>
                  <option value="Fenrir">Fenrir</option>
                  <option value="Zephyr">Zephyr</option>
                  <option value="custom">Custom Voice</option>
                </select>
              </div>

              {voiceName === 'custom' && (
                <div className="flex flex-col gap-3 p-3 bg-black/40 rounded-lg border border-white/5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-slate-400 font-medium">Record voice sample</label>
                    <p className="text-[9px] text-slate-500 italic">
                      Read the following text naturally for 10-15 seconds:
                      <br/><span className="text-slate-300">"The quick brown fox jumps over the lazy dog. Programming is a fun and creative process that allows you to build amazing things from scratch. Reading this out loud helps analyze speech patterns."</span>
                    </p>
                    <button 
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={isProcessingAudio || isGeneratingAudio}
                      className={`py-2 px-3 text-[10px] font-bold rounded flex items-center justify-center gap-2 transition-all ${
                        isRecording 
                          ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30 border border-red-500/50' 
                          : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                      }`}
                    >
                      {isRecording ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      {isRecording ? 'STOP RECORDING' : 'START RECORDING'}
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-center">
                    <span className="w-full h-px bg-white/5"></span>
                    <span className="px-2 text-[9px] text-slate-600 font-bold uppercase">OR</span>
                    <span className="w-full h-px bg-white/5"></span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-slate-400 font-medium">Upload voice sample (audio file)</label>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleAudioUpload}
                      disabled={isProcessingAudio || isGeneratingAudio || isRecording}
                      className="text-[10px] text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-sky-500/10 file:text-sky-400 hover:file:bg-sky-500/20 max-w-full"
                    />
                  </div>
                  
                  {isProcessingAudio && <p className="text-[10px] text-sky-400 animate-pulse mt-1">Processing audio for cloning...</p>}
                  {customVoice && !isProcessingAudio && <p className="text-[10px] text-emerald-400 mt-1">Custom voice ready: {customVoice.name}</p>}
                </div>
              )}

              <button 
                onClick={handleGenerateAudio}
                disabled={isGeneratingAudio || !script.trim() || (voiceName === 'custom' && !customVoice) || isProcessingAudio}
                className="w-full py-2 bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 border border-white/10 hover:border-white/20"
              >
                {isGeneratingAudio ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume2 className="w-3 h-3" />}
                {isGeneratingAudio ? 'GENERATING AUDIO...' : 'GENERATE AUDIO'}
              </button>
              {audioUrl && (
                <div className="mt-2 text-center animate-in fade-in zoom-in duration-300">
                   <audio src={audioUrl} controls className="w-full h-8 [&::-webkit-media-controls-panel]:bg-slate-800 [&::-webkit-media-controls-current-time-display]:text-slate-300 [&::-webkit-media-controls-time-remaining-display]:text-slate-300" autoPlay />
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main: Generated Results */}
        <main className="flex-1 bg-[#050505] overflow-y-auto p-4 md:p-8 custom-scrollbar">
          <div className="max-w-3xl mx-auto space-y-8 md:space-y-10 pb-8">
            
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded-xl text-sm font-medium">
                {error}
              </div>
            )}
            
            {scenes.length > 0 && !isLoading && !error && (
              <div className="flex items-center justify-end animate-in fade-in duration-500">
                <button
                  onClick={handleCopyPlan}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-slate-300 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'COPIED' : 'COPY PLAN'}
                </button>
              </div>
            )}

            {!isLoading && scenes.length === 0 && !error && (
               <div className="text-center text-slate-500 mt-20 p-8 border border-white/5 border-dashed rounded-xl flex flex-col items-center justify-center">
                  <svg className="w-12 h-12 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <p>Paste a script in the sidebar and click Analysis to generate assets.</p>
               </div>
            )}

            {scenes.map((scene, idx) => {
              const isFirst = idx === 0;
              return (
                <section key={idx} className={`group transition-opacity ${!isFirst ? 'opacity-80 hover:opacity-100' : ''}`}>
                  <div className="flex items-center gap-4 mb-4 mt-2">
                    <span className="flex-shrink-0 w-8 h-8 rounded bg-white/10 flex items-center justify-center text-xs font-bold">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <h2 className={`${isFirst ? 'text-sky-400' : 'text-slate-400 group-hover:text-sky-400'} font-bold tracking-wide text-sm uppercase transition-colors shrink-0 max-w-[50%] truncate md:max-w-none md:overflow-visible`}>
                      {scene.title}
                    </h2>
                    <div className="flex-1 h-px bg-white/5"></div>
                  </div>
                  
                  <div className="bg-[#111114] border border-white/5 rounded-xl p-5 hover:border-sky-500/30 transition-all shadow-xl">
                    <p className={`text-sm text-slate-400 italic mb-6 border-l-2 ${isFirst ? 'border-sky-500/50' : 'border-slate-700 group-hover:border-sky-500/50'} pl-4 transition-colors`}>
                      "{scene.scriptSnippet}"
                    </p>
                    
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Search Terms</label>
                        <div className="flex flex-wrap gap-2">
                          {scene.searchTerms.map((term, tIdx) => (
                            <a 
                              key={tIdx} 
                              href={getPexelsUrl(term, mediaPref)} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="px-3 py-1.5 bg-black rounded-md text-xs hover:bg-sky-500 hover:text-white transition-all flex items-center gap-2"
                            >
                              {term}
                              <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" strokeWidth="2"/>
                              </svg>
                            </a>
                          ))}
                        </div>
                      </div>
                      
                      <div className="bg-black/50 rounded-lg p-4 flex flex-col justify-center border border-white/5 min-h-[90px]">
                        <span className={`text-[10px] font-bold ${isFirst ? 'text-sky-500' : 'text-slate-500 group-hover:text-sky-500'} uppercase mb-1 transition-colors`}>
                          Visual Direction
                        </span>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          {scene.visualDescription}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </main>
      </div>

      {/* Footer / Status Bar */}
      <footer className="h-8 bg-[#0F0F11] border-t border-white/10 px-4 flex items-center justify-between text-[10px] font-medium text-slate-500 uppercase tracking-widest shrink-0">
        <div className="flex items-center gap-4 hidden sm:flex">
          <span>{scenes.length > 0 ? 'ANALYSIS COMPLETE' : (isLoading ? 'ANALYZING...' : 'WAITING FOR SCRIPT')}</span>
          {scenes.length > 0 && (
            <>
              <span className="h-3 w-px bg-white/10"></span>
              <span>{scenes.length} SCENES DETECTED</span>
              <span className="h-3 w-px bg-white/10"></span>
              <span className="text-sky-500">READY</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-4 w-full sm:w-auto justify-center sm:justify-start">
          {stats && (
            <>
              <div className="flex items-center gap-2">
                 <span>{(stats.inputTokens + stats.outputTokens).toLocaleString()} TOKENS</span>
                 <span className="h-3 w-px bg-white/10"></span>
                 <span>${stats.cost.toFixed(5)}</span>
                 <span className="h-3 w-px bg-white/10"></span>
                 <span>{stats.timeMs}MS</span>
              </div>
              <span className="h-3 w-px bg-white/10 hidden sm:block"></span>
            </>
          )}
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></span>
            SYNCED WITH PEXELS API
          </div>
        </div>
      </footer>

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0F0F11] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#141417]">
              <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                <History className="w-5 h-5 text-sky-500" />
                GENERATION HISTORY
              </h2>
              <button 
                onClick={() => setShowHistory(false)}
                className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
              {history.length === 0 ? (
                <div className="text-center text-slate-500 py-12">
                  <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>No history available.</p>
                </div>
              ) : (
                <div className="space-y-2 p-4">
                  {history.map((item, idx) => (
                    <div 
                      key={item.id} 
                      className="bg-[#0A0A0B] border border-white/10 hover:border-sky-500/50 rounded-xl p-4 cursor-pointer transition-all flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center group"
                      onClick={() => loadHistoryItem(item)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-sky-500 mb-1">
                          {new Date(item.timestamp).toLocaleString()}
                        </p>
                        <p className="text-sm text-slate-300 truncate font-medium">
                          {item.script || "Empty script..."}
                        </p>
                        <div className="flex gap-3 mt-2 text-[10px] text-slate-500 uppercase font-bold">
                          <span>{item.scenes.length} SCENES</span>
                          <span className="w-px h-3 bg-white/10"></span>
                          <span>${item.stats.cost.toFixed(5)}</span>
                        </div>
                      </div>
                      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="px-3 py-1.5 bg-sky-500/10 text-sky-400 rounded-lg text-xs font-bold">
                          LOAD
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {history.length > 0 && (
              <div className="px-6 py-3 border-t border-white/10 bg-[#141417] flex justify-end">
                <button 
                  onClick={() => {
                    setHistory([]);
                    localStorage.removeItem('app_history');
                  }}
                  className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors uppercase px-3 py-1.5"
                >
                  Clear History
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
