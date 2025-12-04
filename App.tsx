import React, { useState, useCallback, useEffect } from 'react';
import { Activity, Brain, FileText, Play, Sparkles, Terminal, Copy, Loader2, Save, Trash2, Plus, X, Video, Globe, Smartphone, BookOpen, Mic, RefreshCw, MapPin, CheckSquare, Square, AlignLeft, Pencil, Check, Settings2, Folder, Key, Lock, LogIn } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { analyzeTranscript, generateScript, suggestTravelLocations } from './services/geminiService';
import { authenticate } from './services/authService';
import AdminPanel from './components/AdminPanel';
import { StyleProfile, Tab, AppState, ContentType, LocationSuggestion } from './types';
import StyleRadar from './components/RadarChart';

// Sample default profile to let users play immediately
const DEFAULT_PROFILE: StyleProfile = {
  id: 'default-1',
  name: 'The Tech Minimalist',
  description: 'Clean, logical, and slightly cynical tech reviews.',
  metrics: {
    humor: 30,
    logic: 90,
    emotion: 20,
    complexity: 60,
    pacing: 70,
    informality: 40
  },
  signaturePhrases: ["Here's the thing", "Does it matter?", "Let's be real", "At the end of the day", "It's a tool, not a toy"],
  toneDescription: "Objective but critical. Uses short staccato sentences for impact. Rarely uses exclamation marks. Focuses heavily on utility over hype. Often creates a 'us vs marketing' dichotomy.",
  structurePattern: "Starts with a controversial statement or a question that challenges common wisdom. Breaks down features logically (Design -> Specs -> Usage). Ends with a strict binary buy/no-buy verdict. No fluff.",
  typicalSectionLength: 150,
  contentType: 'tech'
};

const App: React.FC = () => {
  // --- AUTH STATE ---
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [authError, setAuthError] = useState('');
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);

  // --- APP STATE ---
  const [apiKey, setApiKey] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('styleMimic_apiKey') || '';
    }
    return '';
  });
  const [tempApiKey, setTempApiKey] = useState('');

  const [activeTab, setActiveTab] = useState<Tab>(Tab.ANALYZE);
  const [appState, setAppState] = useState<AppState>(AppState.LOCKED); // Start Locked
  
  // Analysis State
  const [transcripts, setTranscripts] = useState<string[]>(['']);
  const [currentProfile, setCurrentProfile] = useState<StyleProfile | null>(null);
  
  // Generation State
  const [topic, setTopic] = useState<string>('');
  const [contentType, setContentType] = useState<ContentType>('general');
  const [generatedScript, setGeneratedScript] = useState<string>('');
  
  // Word Count State
  const [targetLength, setTargetLength] = useState<number>(2000);
  
  // Travel Specific State
  const [locations, setLocations] = useState<LocationSuggestion[]>([]);
  const [showLocationSelector, setShowLocationSelector] = useState<boolean>(false);
  
  // Library State - Persistent storage
  const [savedProfiles, setSavedProfiles] = useState<StyleProfile[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('styleMimic_profiles');
        let parsed = saved ? JSON.parse(saved) : [DEFAULT_PROFILE];
        parsed = parsed.map((p: any) => ({
            ...p,
            contentType: p.contentType || 'general'
        }));
        return parsed;
      } catch (e) {
        return [DEFAULT_PROFILE];
      }
    }
    return [DEFAULT_PROFILE];
  });

  // Modal State
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    mode: 'save' | 'rename';
    targetId: string | null;
    inputValue: string;
    inputContentType: ContentType;
  }>({
    isOpen: false,
    mode: 'save',
    targetId: null,
    inputValue: '',
    inputContentType: 'general'
  });

  // CHECK SESSION ON LOAD
  useEffect(() => {
    const session = sessionStorage.getItem('styleMimic_session');
    if (session === 'valid') {
      setIsAuthenticated(true);
      setAppState(AppState.IDLE);
    } else if (session === 'admin') {
      setIsAuthenticated(true);
      setAppState(AppState.ADMIN_DASHBOARD);
    } else {
      setAppState(AppState.LOCKED);
    }
  }, []);

  // Save to LocalStorage whenever profiles change
  useEffect(() => {
    try {
      localStorage.setItem('styleMimic_profiles', JSON.stringify(savedProfiles));
    } catch (e) {
      console.error("Failed to save profiles", e);
    }
  }, [savedProfiles]);

  // --- HANDLERS ---

  const handleLogin = async () => {
    if (!licenseKey.trim()) return;
    setIsCheckingAuth(true);
    setAuthError('');

    try {
      const role = await authenticate(licenseKey);
      
      if (role === 'admin') {
        sessionStorage.setItem('styleMimic_session', 'admin');
        setIsAuthenticated(true);
        setAppState(AppState.ADMIN_DASHBOARD);
      } else if (role === 'user') {
        sessionStorage.setItem('styleMimic_session', 'valid');
        setIsAuthenticated(true);
        setAppState(AppState.IDLE);
      } else {
        setAuthError('Invalid License Key');
      }
    } catch (e) {
      setAuthError('Authentication error');
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('styleMimic_session');
    setIsAuthenticated(false);
    setAppState(AppState.LOCKED);
    setLicenseKey('');
  };

  const handleSaveApiKey = () => {
    if (tempApiKey.trim()) {
      localStorage.setItem('styleMimic_apiKey', tempApiKey.trim());
      setApiKey(tempApiKey.trim());
    }
  };

  const handleClearApiKey = () => {
    localStorage.removeItem('styleMimic_apiKey');
    setApiKey('');
    setTempApiKey('');
  };

  const handleAddTranscript = () => {
    setTranscripts([...transcripts, '']);
  };

  const handleRemoveTranscript = (index: number) => {
    const newTranscripts = transcripts.filter((_, i) => i !== index);
    setTranscripts(newTranscripts.length ? newTranscripts : ['']);
  };

  const handleTranscriptChange = (index: number, value: string) => {
    const newTranscripts = [...transcripts];
    newTranscripts[index] = value;
    setTranscripts(newTranscripts);
  };

  const handleContentTypeChange = (type: ContentType) => {
    setContentType(type);
    if (type === 'travel') {
      setTargetLength(250);
    } else {
      setTargetLength(2000);
    }
    if (type !== 'travel') {
      setShowLocationSelector(false);
      setLocations([]);
    }
  };

  const handleAnalyze = useCallback(async () => {
    const combinedTranscript = transcripts.filter(t => t.trim() !== '').join('\n\n*** NEXT TRANSCRIPT ***\n\n');
    if (!combinedTranscript.trim()) return;
    setAppState(AppState.ANALYZING);
    try {
      const profile = await analyzeTranscript(combinedTranscript, apiKey);
      setCurrentProfile(profile);
      setActiveTab(Tab.GENERATE);
    } catch (error) {
      console.error(error);
      alert("Failed to analyze text. Please check your API Key.");
    } finally {
      setAppState(AppState.IDLE);
    }
  }, [transcripts, apiKey]);

  const handleLocationSearch = async (keepSelected: boolean = false) => {
    if (!topic.trim() || !currentProfile) return;
    setAppState(AppState.SUGGESTING_LOCATIONS);
    try {
      let currentSelection: LocationSuggestion[] = [];
      let excludeList: string[] = [];
      let countNeeded = 20;

      if (keepSelected) {
        currentSelection = locations.filter(l => l.isSelected);
        excludeList = locations.map(l => l.name);
        countNeeded = 20 - currentSelection.length;
      }

      if (countNeeded > 0) {
        const newLocations = await suggestTravelLocations(topic, currentProfile, countNeeded, excludeList, apiKey);
        setLocations([...currentSelection, ...newLocations]);
      } else {
         setLocations(currentSelection);
      }
      setShowLocationSelector(true);
    } catch (error) {
      console.error(error);
      alert("Failed to research locations. Check API Key.");
    } finally {
      setAppState(AppState.IDLE);
    }
  };

  const toggleLocationSelection = (id: string) => {
    setLocations(prev => prev.map(loc => 
      loc.id === id ? { ...loc, isSelected: !loc.isSelected } : loc
    ));
  };

  const handleGenerate = useCallback(async () => {
    if (!topic.trim() || !currentProfile) return;
    const selectedLocs = contentType === 'travel' ? locations.filter(l => l.isSelected) : [];
    setAppState(AppState.GENERATING);
    setGeneratedScript('');
    try {
      const script = await generateScript(topic, currentProfile, contentType, selectedLocs, targetLength, apiKey);
      setGeneratedScript(script);
      if (contentType === 'travel') {
        setShowLocationSelector(false);
      }
    } catch (error) {
      console.error(error);
      alert("Failed to generate script. Check API Key.");
    } finally {
      setAppState(AppState.IDLE);
    }
  }, [topic, currentProfile, contentType, locations, targetLength, apiKey]);

  const handleCopyToClipboard = () => {
    if (!generatedScript) return;
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'fixed';
    tempDiv.style.left = '-9999px';
    tempDiv.style.top = '0';
    tempDiv.style.setProperty('background-color', '#ffffff', 'important');
    tempDiv.style.setProperty('color', '#000000', 'important');
    tempDiv.style.fontFamily = 'Arial, sans-serif';
    tempDiv.style.fontSize = '11pt';
    tempDiv.style.lineHeight = '1.5';
    tempDiv.style.padding = '20px';
    
    const lines = generatedScript.split('\n');
    let innerHTML = '';

    lines.forEach(line => {
      let text = line.trim();
      if (!text) {
        innerHTML += '<br>';
        return;
      }
      text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
      text = text.replace(/\*(.*?)\*/g, '<i>$1</i>');

      const blockStyle = "color: #000000 !important; margin-bottom: 10px;";
      const h1Style = "color: #000000 !important; font-size: 20pt; font-weight: bold; margin-top: 20px; margin-bottom: 10px;";
      const h2Style = "color: #000000 !important; font-size: 16pt; font-weight: bold; margin-top: 15px; margin-bottom: 8px;";
      const h3Style = "color: #000000 !important; font-size: 13pt; font-weight: bold; margin-top: 12px; margin-bottom: 5px;";

      if (line.startsWith('# ')) {
        innerHTML += `<h1 style="${h1Style}">${text.replace(/^# /, '')}</h1>`;
      } else if (line.startsWith('## ')) {
        innerHTML += `<h2 style="${h2Style}">${text.replace(/^## /, '')}</h2>`;
      } else if (line.startsWith('### ')) {
        innerHTML += `<h3 style="${h3Style}">${text.replace(/^### /, '')}</h3>`;
      } else if (line.startsWith('- ')) {
        innerHTML += `<div style="${blockStyle} margin-left: 20px;">• ${text.replace(/^- /, '')}</div>`;
      } else {
        innerHTML += `<p style="${blockStyle}">${text}</p>`;
      }
    });

    tempDiv.innerHTML = innerHTML;
    document.body.appendChild(tempDiv);
    try {
      const range = document.createRange();
      range.selectNodeContents(tempDiv);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
        const successful = document.execCommand('copy');
        selection.removeAllRanges();
        if (successful) {
          alert("Success! Formatted text copied for Google Docs.");
        } else {
          throw new Error("Copy command failed");
        }
      }
    } catch (err) {
      navigator.clipboard.writeText(generatedScript);
      alert("Could not copy formatting. Copied plain text instead.");
    } finally {
      document.body.removeChild(tempDiv);
    }
  };

  const handleOpenSaveModal = () => {
    if (currentProfile) {
      setModalState({
        isOpen: true,
        mode: 'save',
        targetId: null,
        inputValue: currentProfile.name,
        inputContentType: currentProfile.contentType || 'general'
      });
    }
  };

  const handleOpenRenameModal = (profile: StyleProfile) => {
    setModalState({
      isOpen: true,
      mode: 'rename',
      targetId: profile.id,
      inputValue: profile.name,
      inputContentType: profile.contentType || 'general'
    });
  };

  const handleConfirmModal = () => {
    const name = modalState.inputValue.trim();
    if (!name) return;

    if (modalState.mode === 'save' && currentProfile) {
      const newProfile = { 
          ...currentProfile, 
          name: name,
          contentType: modalState.inputContentType
      };
      setSavedProfiles(prev => {
        const others = prev.filter(p => p.id !== newProfile.id);
        return [...others, newProfile];
      });
      setCurrentProfile(newProfile);
    } else if (modalState.mode === 'rename' && modalState.targetId) {
      setSavedProfiles(prev => prev.map(p => 
        p.id === modalState.targetId 
          ? { ...p, name: name, contentType: modalState.inputContentType } 
          : p
      ));
      if (currentProfile && currentProfile.id === modalState.targetId) {
        setCurrentProfile(prev => prev ? { ...prev, name: name, contentType: modalState.inputContentType } : null);
      }
    }
    setModalState(prev => ({ ...prev, isOpen: false }));
  };

  const handleSelectProfile = (profile: StyleProfile) => {
    setCurrentProfile(profile);
    setActiveTab(Tab.GENERATE);
  };

  const contentTypes: { id: ContentType; label: string; icon: any }[] = [
    { id: 'general', label: 'General / Freeform', icon: FileText },
    { id: 'travel', label: 'Travel Vlog & Guide', icon: Globe },
    { id: 'news', label: 'News Report', icon: Video },
    { id: 'tech', label: 'Tech Review', icon: Smartphone },
    { id: 'story', label: 'Storytelling', icon: Mic },
    { id: 'educational', label: 'Educational / How-To', icon: BookOpen },
  ];

  const sliderMin = contentType === 'travel' ? 100 : 1000;
  const sliderMax = contentType === 'travel' ? 500 : 5000;
  const sliderStep = contentType === 'travel' ? 10 : 250;
  const selectedLocationCount = locations.filter(l => l.isSelected).length;
  const hasValidInput = transcripts.some(t => t.trim().length > 0);

  // --- RENDER LOGIC ---

  // 1. ADMIN DASHBOARD VIEW
  if (appState === AppState.ADMIN_DASHBOARD) {
    return <AdminPanel onLogout={handleLogout} />;
  }

  // 2. LOCK SCREEN (LICENSE CHECK)
  if (appState === AppState.LOCKED) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden">
        {/* Animated Background Effect */}
        <div className="absolute inset-0 z-0 opacity-20">
           <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-neon-purple rounded-full blur-[100px]"></div>
           <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-neon-cyan rounded-full blur-[100px]"></div>
        </div>

        <div className="relative z-10 max-w-md w-full bg-gray-900/80 backdrop-blur border border-gray-800 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-8 justify-center">
             <div className="w-12 h-12 rounded bg-gradient-to-br from-neon-cyan to-neon-purple flex items-center justify-center shadow-lg">
                <Lock className="w-6 h-6 text-white" />
             </div>
             <h1 className="text-3xl font-bold tracking-tight">StyleMimic <span className="text-gray-500 font-normal">AI</span></h1>
          </div>

          <div className="space-y-6">
             <div className="text-center">
               <h2 className="text-xl font-bold text-white mb-2">Restricted Access</h2>
               <p className="text-gray-400 text-sm">Please enter your License Key to proceed.</p>
             </div>

             <div className="relative">
               <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Key className="h-5 w-5 text-gray-500" />
               </div>
               <input
                 type="password"
                 className={`block w-full pl-10 pr-3 py-4 border rounded-xl leading-5 bg-gray-950 text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition-all ${authError ? 'border-red-500 focus:ring-red-500' : 'border-gray-700 focus:border-neon-cyan focus:ring-neon-cyan/50'}`}
                 placeholder="License Key"
                 value={licenseKey}
                 onChange={(e) => {
                   setLicenseKey(e.target.value);
                   setAuthError('');
                 }}
                 onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
               />
             </div>

             {authError && (
               <div className="bg-red-900/20 border border-red-900 text-red-400 text-sm p-3 rounded-lg text-center animate-in fade-in slide-in-from-top-1">
                 {authError}
               </div>
             )}

             <button
               onClick={handleLogin}
               disabled={isCheckingAuth || !licenseKey.trim()}
               className="w-full flex justify-center items-center gap-2 py-4 border border-transparent text-sm font-bold rounded-xl text-black bg-neon-cyan hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neon-cyan transition-all disabled:opacity-50 disabled:cursor-not-allowed"
             >
               {isCheckingAuth ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
               Unlock Application
             </button>
             
             <p className="text-xs text-center text-gray-600 mt-4">
                Enter Admin Password here to access dashboard.
             </p>
          </div>
        </div>
      </div>
    );
  }

  // 3. API KEY SCREEN
  if (!apiKey) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6 font-sans">
         <button onClick={handleLogout} className="absolute top-6 right-6 text-gray-500 hover:text-white flex items-center gap-2">
            <Lock className="w-4 h-4" /> Relock
         </button>
         <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">
            <div className="flex items-center gap-3 mb-6 justify-center">
              <div className="w-10 h-10 rounded bg-gradient-to-br from-neon-cyan to-neon-purple flex items-center justify-center">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">StyleMimic <span className="text-gray-500 font-normal">AI</span></h1>
            </div>
            
            <p className="text-center text-gray-400 mb-8">
              Welcome! To use StyleMimic AI, please enter your Google Gemini API Key. 
              The key is stored locally in your browser and is never sent to our servers.
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-mono text-gray-500 mb-1 block uppercase">Google Gemini API Key</label>
                <div className="relative">
                  <Key className="absolute left-3 top-3 w-5 h-5 text-gray-600" />
                  <input 
                    type="password"
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg py-3 pl-10 pr-4 text-white focus:border-neon-cyan focus:outline-none"
                    placeholder="AIzaSy..."
                  />
                </div>
              </div>
              
              <button 
                onClick={handleSaveApiKey}
                disabled={!tempApiKey.trim()}
                className="w-full bg-neon-cyan hover:bg-cyan-400 text-black font-bold py-3 rounded-lg transition-all disabled:opacity-50"
              >
                Start App
              </button>

              <div className="text-center pt-4">
                <a 
                  href="https://aistudio.google.com/app/apikey" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-neon-purple hover:underline"
                >
                  Get a free API Key here
                </a>
              </div>
            </div>
         </div>
      </div>
    );
  }

  // 4. MAIN APPLICATION
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col font-sans selection:bg-neon-cyan selection:text-black relative">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-neon-cyan to-neon-purple flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">StyleMimic <span className="text-gray-500 font-normal">AI</span></h1>
          </div>
          
          <div className="flex items-center gap-4">
            <nav className="flex gap-1 bg-gray-800/50 p-1 rounded-lg">
              {[
                { id: Tab.ANALYZE, icon: Activity, label: 'Analyze' },
                { id: Tab.GENERATE, icon: Sparkles, label: 'Generate' },
                { id: Tab.LIBRARY, icon: FileText, label: 'Library' },
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    activeTab === item.id 
                      ? 'bg-gray-700 text-white shadow-sm' 
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </button>
              ))}
            </nav>
            <div className="h-6 w-px bg-gray-800 mx-2"></div>
            <button 
              onClick={handleClearApiKey}
              className="text-gray-600 hover:text-neon-cyan transition-colors p-2"
              title="Change API Key"
            >
              <Key className="w-4 h-4" />
            </button>
            <button 
              onClick={handleLogout}
              className="text-gray-600 hover:text-red-400 transition-colors p-2"
              title="Sign Out (Lock)"
            >
              <Lock className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        
        {/* VIEW: ANALYZE */}
        {activeTab === Tab.ANALYZE && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
            <div className="flex flex-col gap-4 h-full">
              <div className="space-y-2">
                <h2 className="text-2xl font-light text-white">Source Material</h2>
                <p className="text-gray-400 text-sm">Paste one or more transcripts to improve style accuracy.</p>
              </div>
              
              <div className="flex-1 flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-250px)] custom-scrollbar pr-2">
                {transcripts.map((text, index) => (
                  <div key={index} className="relative group animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono text-neon-cyan uppercase tracking-wider">Transcript {index + 1}</span>
                      {transcripts.length > 1 && (
                        <button 
                          onClick={() => handleRemoveTranscript(index)}
                          className="text-gray-600 hover:text-red-500 transition-colors p-1"
                          title="Remove transcript"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <textarea
                      className="w-full h-40 bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-gray-300 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-neon-cyan/50 resize-none transition-all"
                      placeholder={`Paste content for Transcript ${index + 1} here...`}
                      value={text}
                      onChange={(e) => handleTranscriptChange(index, e.target.value)}
                    />
                  </div>
                ))}
                
                <button
                  onClick={handleAddTranscript}
                  className="flex items-center justify-center gap-2 py-3 border border-dashed border-gray-700 rounded-xl text-gray-500 hover:text-white hover:border-gray-500 hover:bg-gray-800/50 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Add another transcript
                </button>
              </div>

              <div className="pt-4 border-t border-gray-800">
                <button
                  onClick={handleAnalyze}
                  disabled={appState === AppState.ANALYZING || !hasValidInput}
                  className="w-full flex items-center justify-center gap-2 bg-neon-cyan hover:bg-cyan-400 text-black font-bold py-3 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)]"
                >
                  {appState === AppState.ANALYZING ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Analyzing Style DNA...
                    </>
                  ) : (
                    <>
                      <Terminal className="w-5 h-5" />
                      Extract DNA
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-6 justify-center items-center text-center lg:sticky lg:top-24 h-fit">
              <div className="p-8 border border-gray-800 rounded-2xl bg-gray-900/30 max-w-md w-full">
                <h3 className="text-lg font-medium text-gray-300 mb-4">How it works</h3>
                <div className="space-y-6">
                  <div className="flex items-start gap-4 text-left">
                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center shrink-0 text-neon-cyan font-bold">1</div>
                    <div>
                      <h4 className="font-bold text-gray-200">Data Collection</h4>
                      <p className="text-sm text-gray-500">Provide multiple samples to build a robust profile.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 text-left">
                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center shrink-0 text-neon-purple font-bold">2</div>
                    <div>
                      <h4 className="font-bold text-gray-200">Forensic Analysis</h4>
                      <p className="text-sm text-gray-500">The AI identifies forensic tone, structure, and average word counts.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 text-left">
                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center shrink-0 text-neon-green font-bold">3</div>
                    <div>
                      <h4 className="font-bold text-gray-200">Synthesis</h4>
                      <p className="text-sm text-gray-500">Generate content that mimics length and rhythm.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: GENERATE */}
        {activeTab === Tab.GENERATE && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
            {/* Sidebar Control */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              
              {/* Profile Card */}
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-xs font-mono text-neon-purple uppercase tracking-wider">Active Model</span>
                    <h3 className="text-xl font-bold text-white mt-1 pr-2 break-words">
                      {currentProfile ? currentProfile.name : "No Model Loaded"}
                    </h3>
                  </div>
                  {currentProfile && (
                    <button onClick={handleOpenSaveModal} className="text-gray-400 hover:text-white shrink-0" title="Save to Library">
                      <Save className="w-5 h-5" />
                    </button>
                  )}
                </div>

                {currentProfile ? (
                  <>
                    <p className="text-sm text-gray-400 mb-6">{currentProfile.description}</p>
                    <StyleRadar metrics={currentProfile.metrics} />
                    
                    <div className="mt-6 space-y-3">
                      <div className="flex justify-between items-center text-xs text-gray-400 px-1">
                        <span>TYPICAL DENSITY</span>
                        <span className="text-gray-200 font-mono font-bold">{currentProfile.typicalSectionLength} words/section</span>
                      </div>
                      
                      <div className="bg-gray-800/50 p-3 rounded text-xs font-mono text-gray-300 border border-gray-700">
                        <span className="text-gray-500 block mb-1">SIGNATURES</span>
                        {currentProfile.signaturePhrases.join(" • ")}
                      </div>
                      
                      <div className="bg-gray-800/50 p-3 rounded text-xs text-gray-300 border border-gray-700 max-h-32 overflow-y-auto custom-scrollbar">
                         <span className="text-gray-500 font-mono block mb-1 sticky top-0 bg-gray-800/90 backdrop-blur pb-1">FORENSIC TONE</span>
                         {currentProfile.toneDescription}
                      </div>

                      <div className="bg-gray-800/50 p-3 rounded text-xs text-gray-300 border border-gray-700 max-h-32 overflow-y-auto custom-scrollbar">
                         <span className="text-gray-500 font-mono block mb-1 sticky top-0 bg-gray-800/90 backdrop-blur pb-1">STRUCTURE DNA</span>
                         {currentProfile.structurePattern}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-10 text-gray-500 text-sm">
                    Go to <b className="text-gray-300 cursor-pointer" onClick={() => setActiveTab(Tab.ANALYZE)}>Analyze</b> to create a model.
                  </div>
                )}
              </div>

              {/* Generation Input */}
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 flex-1 flex flex-col gap-4">
                 <div>
                    <h3 className="text-sm font-bold text-gray-200 mb-2">Content Format</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {contentTypes.map((type) => (
                        <button
                          key={type.id}
                          onClick={() => handleContentTypeChange(type.id)}
                          className={`flex items-center gap-2 p-2 rounded-lg text-xs font-medium border transition-all text-left ${
                            contentType === type.id 
                            ? 'bg-neon-purple/20 border-neon-purple text-white' 
                            : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-600'
                          }`}
                        >
                          <type.icon className={`w-3 h-3 ${contentType === type.id ? 'text-neon-purple' : ''}`} />
                          {type.label}
                        </button>
                      ))}
                    </div>
                 </div>

                 {/* Length Slider */}
                 <div>
                   <div className="flex justify-between items-center mb-2">
                      <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
                        <Settings2 className="w-3 h-3 text-neon-cyan" />
                        Length Constraint
                      </h3>
                      <span className="text-xs font-mono text-neon-cyan">
                        {targetLength} {contentType === 'travel' ? 'words / spot' : 'words total'}
                      </span>
                   </div>
                   <input 
                      type="range"
                      min={sliderMin}
                      max={sliderMax}
                      step={sliderStep}
                      value={targetLength}
                      onChange={(e) => setTargetLength(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-neon-cyan"
                   />
                   <div className="flex justify-between text-[10px] text-gray-600 font-mono mt-1">
                      <span>{sliderMin}</span>
                      <span>{sliderMax}</span>
                   </div>
                 </div>

                 <div className="flex-1 flex flex-col">
                    <h3 className="text-sm font-bold text-gray-200 mb-2">Topic / Prompt</h3>
                    <textarea
                      className="w-full flex-1 bg-gray-950 border border-gray-800 rounded-lg p-3 text-gray-300 text-sm focus:outline-none focus:border-neon-purple mb-4 resize-none"
                      placeholder={`What should this ${contentType === 'travel' ? 'travel vlog' : contentType === 'news' ? 'news report' : 'content'} be about?`}
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      disabled={!currentProfile || (contentType === 'travel' && showLocationSelector)}
                    />
                    
                    {/* Primary Action Button Logic */}
                    {contentType === 'travel' && !showLocationSelector ? (
                       <button
                         onClick={() => handleLocationSearch(false)}
                         disabled={appState === AppState.SUGGESTING_LOCATIONS || !topic.trim() || !currentProfile}
                         className="w-full flex items-center justify-center gap-2 bg-neon-green hover:bg-green-500 text-black font-bold py-3 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                       >
                         {appState === AppState.SUGGESTING_LOCATIONS ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              Researching Spots...
                            </>
                          ) : (
                            <>
                              <Globe className="w-5 h-5" />
                              Find Locations
                            </>
                          )}
                       </button>
                    ) : (
                      contentType === 'travel' && showLocationSelector ? (
                        /* Generated via the Location Grid section instead */
                        <div className="text-xs text-center text-gray-500 bg-gray-950 p-2 rounded">
                          Select locations on the right to proceed
                        </div>
                      ) : (
                        <button
                          onClick={handleGenerate}
                          disabled={appState === AppState.GENERATING || !topic.trim() || !currentProfile}
                          className="w-full flex items-center justify-center gap-2 bg-neon-purple hover:bg-purple-500 text-white font-bold py-3 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(139,92,246,0.3)] hover:shadow-[0_0_25px_rgba(139,92,246,0.5)]"
                        >
                          {appState === AppState.GENERATING ? (
                              <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Dreaming...
                              </>
                            ) : (
                              <>
                                <Play className="w-5 h-5 fill-current" />
                                Generate Script
                              </>
                            )}
                        </button>
                      )
                    )}
                 </div>
              </div>
            </div>

            {/* Output Area */}
            <div className="lg:col-span-8 bg-gray-900 border border-gray-800 rounded-xl p-8 relative overflow-hidden flex flex-col">
              
              {/* Location Selector Overlay/Mode for Travel */}
              {contentType === 'travel' && showLocationSelector ? (
                 <div className="flex flex-col h-full animate-in fade-in duration-300">
                    <div className="flex justify-between items-center mb-4">
                       <div>
                         <h3 className="text-lg font-bold text-white flex items-center gap-2">
                           <MapPin className="w-5 h-5 text-neon-green" />
                           Select Locations
                         </h3>
                         <p className="text-sm text-gray-400">Selected: <span className="text-neon-green font-bold">{selectedLocationCount}</span>/20</p>
                       </div>
                       
                       <div className="flex gap-2">
                         <button 
                            onClick={() => handleLocationSearch(true)}
                            disabled={appState === AppState.SUGGESTING_LOCATIONS}
                            className="text-xs flex items-center gap-1 bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded transition-colors text-white border border-gray-700"
                         >
                            {appState === AppState.SUGGESTING_LOCATIONS ? <Loader2 className="w-3 h-3 animate-spin"/> : <RefreshCw className="w-3 h-3" />}
                            Refill Unselected
                         </button>
                         
                         <button
                           onClick={handleGenerate}
                           disabled={selectedLocationCount === 0 || appState === AppState.GENERATING}
                           className="text-xs flex items-center gap-1 bg-neon-green hover:bg-green-500 text-black px-4 py-2 rounded font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                         >
                            {appState === AppState.GENERATING ? <Loader2 className="w-3 h-3 animate-spin"/> : <Play className="w-3 h-3 fill-current" />}
                            Generate with {selectedLocationCount} Spots
                         </button>
                       </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                       <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                          {locations.map((loc) => (
                            <div 
                              key={loc.id}
                              onClick={() => toggleLocationSelection(loc.id)}
                              className={`p-3 rounded-lg border cursor-pointer transition-all relative group ${
                                loc.isSelected 
                                ? 'bg-neon-green/10 border-neon-green' 
                                : 'bg-gray-950 border-gray-800 hover:border-gray-600'
                              }`}
                            >
                               <div className="flex justify-between items-start mb-1">
                                  <h4 className={`font-bold text-sm line-clamp-1 ${loc.isSelected ? 'text-neon-green' : 'text-gray-200'}`}>{loc.name}</h4>
                                  {loc.isSelected ? <CheckSquare className="w-4 h-4 text-neon-green shrink-0" /> : <Square className="w-4 h-4 text-gray-600 shrink-0 group-hover:text-gray-400" />}
                               </div>
                               <p className="text-xs text-gray-500 line-clamp-3">{loc.description}</p>
                            </div>
                          ))}
                       </div>
                    </div>
                 </div>
              ) : (
                /* Standard Output View */
                <>
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neon-cyan via-neon-purple to-neon-green opacity-50"></div>
                  
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-gray-500" />
                      Output Result
                    </h3>
                    <div className="flex items-center gap-2">
                      {contentType === 'travel' && (
                        <button
                            onClick={() => setShowLocationSelector(true)}
                            className="text-xs flex items-center gap-1 text-neon-green hover:text-white transition-colors mr-2 border border-gray-700 hover:border-neon-green px-2 py-1 rounded"
                        >
                            <MapPin className="w-3 h-3" /> Edit Spots
                        </button>
                      )}
                      {generatedScript && (
                          <button 
                            onClick={handleCopyToClipboard}
                            className="text-xs flex items-center gap-1 text-gray-500 hover:text-white transition-colors border border-gray-700 hover:border-gray-500 px-3 py-1 rounded"
                          >
                            <Copy className="w-4 h-4" /> Copy for Docs
                          </button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    {generatedScript ? (
                      <div className="prose prose-invert prose-sm max-w-none prose-headings:text-neon-cyan prose-strong:text-white prose-p:text-gray-300 font-mono">
                        <ReactMarkdown>{generatedScript}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-gray-700 gap-4">
                        <Sparkles className="w-12 h-12 opacity-20" />
                        <p>Ready to synthesize content.</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* VIEW: LIBRARY - UPDATED FOLDER LOGIC */}
        {activeTab === Tab.LIBRARY && (
          <div className="space-y-10 pb-20">
            {/* Create New Button */}
            <div className="flex justify-end">
                <button 
                  onClick={() => setActiveTab(Tab.ANALYZE)}
                  className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-all border border-gray-700 hover:border-neon-cyan text-sm font-medium"
                >
                   <Terminal className="w-4 h-4" />
                   Train New Model
                </button>
            </div>

            {contentTypes.map((type) => {
              const profiles = savedProfiles.filter(p => (p.contentType || 'general') === type.id);
              if (profiles.length === 0) return null;

              return (
                <div key={type.id} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                   <div className="flex items-center gap-2 mb-4 border-b border-gray-800 pb-2">
                      <type.icon className="w-5 h-5 text-neon-cyan" />
                      <h2 className="text-xl font-bold text-gray-200">{type.label}</h2>
                      <span className="text-xs text-gray-500 font-mono ml-auto bg-gray-900 px-2 py-1 rounded border border-gray-800">{profiles.length} Models</span>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {profiles.map(profile => (
                        <div key={profile.id} className="bg-gray-900 border border-gray-800 hover:border-gray-600 transition-colors rounded-xl p-6 flex flex-col group relative">
                          <div className="flex justify-between items-start mb-2">
                             <h3 className="font-bold text-lg text-white pr-8 break-words">{profile.name}</h3>
                             <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-gray-900/80 p-1 rounded backdrop-blur absolute top-4 right-4 z-10">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenRenameModal(profile);
                                  }}
                                  className="text-gray-400 hover:text-neon-cyan p-1"
                                  title="Edit Name & Folder"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSavedProfiles(prev => prev.filter(p => p.id !== profile.id));
                                  }}
                                  className="text-gray-400 hover:text-red-500 p-1"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                             </div>
                          </div>
                          <p className="text-gray-400 text-sm mb-4 line-clamp-2">{profile.description}</p>
                          
                          <div className="flex-1">
                            <div className="grid grid-cols-3 gap-2 mb-4">
                               <div className="bg-gray-950 p-2 rounded text-center">
                                  <span className="block text-[10px] text-gray-600 uppercase">Humor</span>
                                  <span className="text-neon-cyan font-mono font-bold text-sm">{profile.metrics.humor}</span>
                               </div>
                               <div className="bg-gray-950 p-2 rounded text-center">
                                  <span className="block text-[10px] text-gray-600 uppercase">Logic</span>
                                  <span className="text-neon-purple font-mono font-bold text-sm">{profile.metrics.logic}</span>
                               </div>
                               <div className="bg-gray-950 p-2 rounded text-center">
                                  <span className="block text-[10px] text-gray-600 uppercase">W/Sec</span>
                                  <span className="text-neon-green font-mono font-bold text-sm">{profile.typicalSectionLength || 100}</span>
                               </div>
                            </div>
                          </div>

                          <button 
                            onClick={() => handleSelectProfile(profile)}
                            className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm font-medium transition-colors border border-gray-700 hover:border-neon-cyan/50"
                          >
                            Load Model
                          </button>
                        </div>
                      ))}
                   </div>
                </div>
              )
            })}

            {savedProfiles.length === 0 && (
              <div className="text-center py-20 opacity-50">
                <Folder className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                <p>Library is empty. Train a model to get started.</p>
                <button onClick={() => setActiveTab(Tab.ANALYZE)} className="text-neon-cyan mt-4 hover:underline">Go to Analyze</button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* RENAME / SAVE MODAL WITH FOLDER SELECTION */}
      {modalState.isOpen && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white">
                {modalState.mode === 'save' ? 'Save Model' : 'Edit Model Details'}
              </h3>
              <button 
                onClick={() => setModalState(prev => ({...prev, isOpen: false}))}
                className="text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 font-mono mb-1 block">MODEL NAME</label>
                <input 
                  type="text" 
                  value={modalState.inputValue}
                  onChange={(e) => setModalState(prev => ({...prev, inputValue: e.target.value}))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-white focus:outline-none focus:border-neon-cyan"
                  placeholder="e.g., The Happy Traveler"
                  autoFocus
                />
              </div>

              {/* FOLDER SELECTION */}
              <div>
                <label className="text-xs text-gray-400 font-mono mb-2 block">FOLDER / CATEGORY</label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                  {contentTypes.map(type => (
                    <button
                      key={type.id}
                      onClick={() => setModalState(prev => ({...prev, inputContentType: type.id}))}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-xs text-left transition-all ${
                         modalState.inputContentType === type.id
                         ? 'bg-neon-cyan/10 border-neon-cyan text-white ring-1 ring-neon-cyan/50'
                         : 'bg-gray-950 border-gray-800 text-gray-400 hover:bg-gray-900 hover:border-gray-600'
                      }`}
                    >
                      <type.icon className={`w-3 h-3 ${modalState.inputContentType === type.id ? 'text-neon-cyan' : ''}`} />
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-800 mt-4">
                <button 
                  onClick={() => setModalState(prev => ({...prev, isOpen: false}))}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleConfirmModal}
                  disabled={!modalState.inputValue.trim()}
                  className="flex items-center gap-2 px-6 py-2 bg-neon-cyan hover:bg-cyan-400 text-black font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  {modalState.mode === 'save' ? 'Save to Library' : 'Update'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;