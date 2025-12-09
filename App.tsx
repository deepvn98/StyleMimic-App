import React, { useState, useCallback, useEffect } from 'react';
import { Activity, Brain, FileText, Play, Sparkles, Terminal, Copy, Loader2, Save, Trash2, Plus, X, Video, Globe, Smartphone, BookOpen, Mic, RefreshCw, MapPin, CheckSquare, Square, Pencil, Check, Settings2, Folder, Key, Lock, LogIn, Cloud, Zap, AlertTriangle, Circle, Shield, List, Info, LayoutGrid, Ruler, PieChart, Anchor, ExternalLink, Wand2, Scissors, Quote, ZapIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { analyzeTranscript, generateScript, suggestTravelLocations, refineText } from './services/geminiService';
import { authenticate } from './services/authService';
import { saveProfileToCloud, getUserProfiles, deleteProfileFromCloud, updateProfileInCloud } from './services/profileService';
import { saveUserApiKeys, getUserApiKeys } from './services/settingsService';
import AdminPanel from './components/AdminPanel';
import { StyleProfile, Tab, AppState, ContentType, LocationSuggestion, KeyStatus } from './types';
import StyleRadar from './components/RadarChart';

// Sample default profile
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
  toneDescription: "Objective but critical.",
  structurePattern: "Starts with a controversial statement.",
  structuralBlueprint: ["Hook: Controversial opinion", "Evidence: Technical specs", "Counter-argument: Why others are wrong", "Conclusion: Minimalist verdict"],
  styleDNA: {
    lexicalSignature: "Uses tech jargon sparingly. Prefers 'utility', 'function', 'design'.",
    syntaxPattern: "Short sentences. Bullet-point thinking.",
    rhetoricalDevices: "Rhetorical questions. Dichotomy (Us vs Them).",
    cognitivePattern: "Highly logical. Skeptical of marketing.",
    narrativeStyle: "Problem -> Solution -> Verdict.",
    emotionalCurve: "Flat, calm, slightly annoyed at bad design.",
    verbalTics: "Starts sentences with 'So,' frequently."
  },
  quantitativeAnalysis: {
      totalWordCount: 500,
      paragraphCount: 4,
      averageWordsPerParagraph: 125,
      sentenceCount: 30,
      subHeaderStyle: "Minimalist",
      structureSkeleton: [
          { sectionName: "The Problem", estimatedWords: 100, purpose: "Hook" },
          { sectionName: "The Specs", estimatedWords: 200, purpose: "Data" },
          { sectionName: "The Verdict", estimatedWords: 200, purpose: "Conclusion" }
      ]
  },
  structuralPatterns: {
      introHabits: "Immediately states a problem without saying hello.",
      introPhrases: ["Stop buying this.", "Here is the problem.", "We need to talk."],
      transitionPhrases: ["But wait.", "On the other hand.", "Technically speaking."],
      outroHabits: "Abrupt ending with a final verdict.",
      outroPhrases: ["Don't buy it.", "It's worth it.", "See ya."]
  },
  typicalSectionLength: 150,
  contentType: 'tech'
};

const App: React.FC = () => {
  // --- AUTH STATE ---
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [authError, setAuthError] = useState('');
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);
  
  // API KEY STATE (BYOK & Cloud Sync)
  const [userApiKeys, setUserApiKeys] = useState<string[]>([]);
  const [keyStatuses, setKeyStatuses] = useState<Record<string, KeyStatus>>({}); // Track status per key
  const [tempApiKeyInput, setTempApiKeyInput] = useState('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  
  // New: Track the current User ID (License ID) to manage Cloud Library
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // --- APP STATE ---
  const [activeTab, setActiveTab] = useState<Tab>(Tab.ANALYZE);
  const [appState, setAppState] = useState<AppState>(AppState.LOCKED); // Start Locked
  
  // Analysis State
  const [transcripts, setTranscripts] = useState<string[]>(['']);
  const [currentProfile, setCurrentProfile] = useState<StyleProfile | null>(null);
  
  // Generation State
  const [topic, setTopic] = useState<string>('');
  const [contentType, setContentType] = useState<ContentType>('general');
  const [generatedScript, setGeneratedScript] = useState<string>('');
  const [isRefining, setIsRefining] = useState(false); // Refinement loading state
  
  // Settings
  const [targetLength, setTargetLength] = useState<number>(2000);
  const [creativityLevel, setCreativityLevel] = useState<number>(1.35); // 0.5 to 1.8
  
  // Travel Specific State
  const [locations, setLocations] = useState<LocationSuggestion[]>([]);
  const [showLocationSelector, setShowLocationSelector] = useState<boolean>(false);
  
  // Library State
  const [savedProfiles, setSavedProfiles] = useState<StyleProfile[]>([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(false);

  // View Details State
  const [viewingProfile, setViewingProfile] = useState<StyleProfile | null>(null);

  // Modal State (Save/Rename)
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    mode: 'save' | 'rename';
    targetId: string | null;
    inputValue: string;
    inputContentType: ContentType;
    isSaving: boolean;
  }>({
    isOpen: false,
    mode: 'save',
    targetId: null,
    inputValue: '',
    inputContentType: 'general',
    isSaving: false
  });

  // CHECK SESSION ON LOAD
  useEffect(() => {
    const sessionRole = sessionStorage.getItem('styleMimic_session_role');
    const sessionUserId = sessionStorage.getItem('styleMimic_session_userId');
    const storedApiKeys = localStorage.getItem('styleMimic_apiKeys');

    if (sessionRole === 'valid') {
      setIsAuthenticated(true);
      if (sessionUserId) setCurrentUserId(sessionUserId);
      setAppState(AppState.IDLE); // Always go to IDLE
      
      // Load keys from local cache first (will be updated by cloud sync later if applicable)
      if (storedApiKeys) {
        setUserApiKeys(JSON.parse(storedApiKeys));
      }
    } else if (sessionRole === 'admin') {
      setIsAuthenticated(true);
      setAppState(AppState.ADMIN_DASHBOARD);
    } else {
      setAppState(AppState.LOCKED);
    }
  }, []);

  // LOAD PROFILES (Cloud vs Local)
  useEffect(() => {
    const loadProfiles = async () => {
      if (!isAuthenticated || appState === AppState.LOCKED) return;
      
      // If we have a real Cloud User ID (not a demo/local one)
      if (currentUserId && currentUserId !== 'demo-local-user' && currentUserId !== 'static-user') {
        setIsLibraryLoading(true);
        try {
           const cloudProfiles = await getUserProfiles(currentUserId);
           setSavedProfiles([DEFAULT_PROFILE, ...cloudProfiles]);
        } catch (e) {
           console.error("Failed to load cloud profiles", e);
           // Fallback to default if error
           setSavedProfiles([DEFAULT_PROFILE]);
        } finally {
           setIsLibraryLoading(false);
        }
      } else {
        // Fallback to LocalStorage for Demo/Static users
        try {
          const saved = localStorage.getItem('styleMimic_profiles');
          let parsed = saved ? JSON.parse(saved) : [DEFAULT_PROFILE];
          parsed = parsed.map((p: any) => ({
              ...p,
              contentType: p.contentType || 'general'
          }));
          setSavedProfiles(parsed);
        } catch (e) {
          setSavedProfiles([DEFAULT_PROFILE]);
        }
      }
    };

    loadProfiles();
  }, [isAuthenticated, currentUserId, appState]);

  // --- HANDLERS ---

  const handleKeyStatusUpdate = useCallback((key: string, status: KeyStatus) => {
    setKeyStatuses(prev => ({
        ...prev,
        [key]: status
    }));
  }, []);

  const handleLogin = async () => {
    if (!licenseKey.trim()) return;
    setIsCheckingAuth(true); // START Loading
    setAuthError('');

    try {
      const authResult = await authenticate(licenseKey);
      
      if (authResult.role === 'admin') {
        sessionStorage.setItem('styleMimic_session_role', 'admin');
        setIsAuthenticated(true);
        setAppState(AppState.ADMIN_DASHBOARD);
        // Do not turn off loading here to prevent flicker
      } else if (authResult.role === 'user') {
        sessionStorage.setItem('styleMimic_session_role', 'valid');
        if (authResult.userId) {
            sessionStorage.setItem('styleMimic_session_userId', authResult.userId);
            setCurrentUserId(authResult.userId);

            // --- CLOUD API KEY SYNC ---
            // If it's a real cloud user, fetch their keys
            if (authResult.userId !== 'demo-local-user' && authResult.userId !== 'static-user') {
              try {
                const cloudKeys = await getUserApiKeys(authResult.userId);
                if (cloudKeys && cloudKeys.length > 0) {
                  setUserApiKeys(cloudKeys);
                  localStorage.setItem('styleMimic_apiKeys', JSON.stringify(cloudKeys));
                } else {
                  // No cloud keys, check local cache but don't auto-save local to cloud yet
                  // to avoid overwriting empty cloud with potentially wrong local data
                  const storedKeys = localStorage.getItem('styleMimic_apiKeys');
                  if (storedKeys) setUserApiKeys(JSON.parse(storedKeys));
                  else setUserApiKeys([]);
                }
              } catch (e) {
                // Fallback to local
                const storedKeys = localStorage.getItem('styleMimic_apiKeys');
                if (storedKeys) setUserApiKeys(JSON.parse(storedKeys));
              }
            } else {
              // Local/Demo User logic
              const storedKeys = localStorage.getItem('styleMimic_apiKeys');
              if (storedKeys) setUserApiKeys(JSON.parse(storedKeys));
            }
        }
        setIsAuthenticated(true);
        setAppState(AppState.IDLE); // Direct access
        
        // Do not turn off loading here to prevent flicker
      } else {
        setAuthError('Invalid License Key');
        setIsCheckingAuth(false); // Stop loading on error
      }
    } catch (e) {
      setAuthError('Authentication error');
      setIsCheckingAuth(false); // Stop loading on error
    }
  };

  const handleAddApiKey = async () => {
    if (tempApiKeyInput.trim()) {
        const newKeys = [...userApiKeys, tempApiKeyInput.trim()];
        setUserApiKeys(newKeys);
        setKeyStatuses(prev => ({...prev, [tempApiKeyInput.trim()]: 'ready'})); // Init status
        setTempApiKeyInput('');
        
        // Cache locally
        localStorage.setItem('styleMimic_apiKeys', JSON.stringify(newKeys));

        // Sync to Cloud if valid user
        if (currentUserId && currentUserId !== 'demo-local-user' && currentUserId !== 'static-user') {
          await saveUserApiKeys(currentUserId, newKeys);
        }
    }
  };

  const handleRemoveApiKey = async (index: number) => {
    const keyToRemove = userApiKeys[index];
    const newKeys = userApiKeys.filter((_, i) => i !== index);
    
    // Cleanup status
    const newStatuses = { ...keyStatuses };
    delete newStatuses[keyToRemove];
    setKeyStatuses(newStatuses);

    setUserApiKeys(newKeys);
    
    // Update Local
    localStorage.setItem('styleMimic_apiKeys', JSON.stringify(newKeys));

    // Sync to Cloud
    if (currentUserId && currentUserId !== 'demo-local-user' && currentUserId !== 'static-user') {
      await saveUserApiKeys(currentUserId, newKeys);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('styleMimic_session_role');
    sessionStorage.removeItem('styleMimic_session_userId');
    
    // SECURITY: Clear local API keys on logout so next user doesn't see them
    localStorage.removeItem('styleMimic_apiKeys'); 
    setUserApiKeys([]);

    setIsAuthenticated(false);
    setAppState(AppState.LOCKED);
    setLicenseKey('');
    setCurrentUserId(null);
    setSavedProfiles([]);
    
    // RESET LOADING STATE to fix infinite loading button
    setIsCheckingAuth(false); 
  };

  // ADMIN SWITCH TO APP
  const handleAdminSwitchToApp = () => {
    setAppState(AppState.IDLE);
    // Note: Admin stays authenticated, just changes view.
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

  const handleError = (error: any, context: string) => {
    console.error(error);
    const msg = error.message || error.toString();
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        alert(`⚠️ HẾT HẠN MỨC MIỄN PHÍ (Lỗi 429)\n\nAPI Keys hiện tại đã dùng hết giới hạn. Hệ thống đã thử xoay vòng nhưng tất cả đều hết hạn.\n\nGiải pháp:\n1. Thêm key mới vào danh sách.\n2. Quay lại vào ngày mai.`);
    } else {
        alert(`${context}\nChi tiết: ${msg}`);
    }
  };

  // CHECKER for API KEYS
  const checkApiKeys = (): boolean => {
      if (userApiKeys.length === 0) {
          setShowApiKeyModal(true);
          alert("Please add at least one Gemini API Key to proceed.");
          return false;
      }
      return true;
  };

  const handleAnalyze = useCallback(async () => {
    if (!checkApiKeys()) return;

    const combinedTranscript = transcripts.filter(t => t.trim() !== '').join('\n\n*** NEXT TRANSCRIPT ***\n\n');
    if (!combinedTranscript.trim()) return;
    setAppState(AppState.ANALYZING);
    try {
      const profile = await analyzeTranscript(userApiKeys, combinedTranscript, handleKeyStatusUpdate);
      setCurrentProfile(profile);
      setActiveTab(Tab.GENERATE);
    } catch (error) {
      handleError(error, "Failed to analyze text.");
    } finally {
      setAppState(AppState.IDLE);
    }
  }, [transcripts, userApiKeys, handleKeyStatusUpdate]);

  const handleLocationSearch = async (keepSelected: boolean = false) => {
    if (!checkApiKeys()) return;
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
        const newLocations = await suggestTravelLocations(userApiKeys, topic, currentProfile, countNeeded, excludeList, handleKeyStatusUpdate);
        setLocations([...currentSelection, ...newLocations]);
      } else {
         setLocations(currentSelection);
      }
      setShowLocationSelector(true);
    } catch (error) {
      handleError(error, "Failed to research locations.");
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
    if (!checkApiKeys()) return;
    if (!topic.trim() || !currentProfile) return;

    const selectedLocs = contentType === 'travel' ? locations.filter(l => l.isSelected) : [];
    setAppState(AppState.GENERATING);
    setGeneratedScript('');
    try {
      const script = await generateScript(
          userApiKeys, 
          topic, 
          currentProfile, 
          contentType, 
          selectedLocs, 
          targetLength,
          creativityLevel,
          handleKeyStatusUpdate
      );
      setGeneratedScript(script);
      if (contentType === 'travel') {
        setShowLocationSelector(false);
      }
    } catch (error) {
       handleError(error, "Failed to generate script.");
    } finally {
      setAppState(AppState.IDLE);
    }
  }, [topic, currentProfile, contentType, locations, targetLength, creativityLevel, userApiKeys, handleKeyStatusUpdate]);

  const handleRefine = async (instruction: string) => {
      if (!generatedScript || !currentProfile || !checkApiKeys()) return;
      
      const selection = window.getSelection();
      let textToRefine = selection ? selection.toString() : "";
      
      // If no text selected, assume refining the whole script (with a warning if too long)
      if (!textToRefine) {
          if (!confirm("No text selected. Refine the ENTIRE script? (This might take a while)")) return;
          textToRefine = generatedScript;
      }

      setIsRefining(true);
      try {
          const refinedChunk = await refineText(userApiKeys, textToRefine, instruction, currentProfile, handleKeyStatusUpdate);
          
          // Replace text
          setGeneratedScript(prev => prev.replace(textToRefine, refinedChunk));
      } catch (error) {
          handleError(error, "Failed to refine text");
      } finally {
          setIsRefining(false);
      }
  };

  const handleCopyToClipboard = () => {
    if (!generatedScript) return;
    
    // Create a temporary DOM element to hold the styled HTML
    const tempDiv = document.createElement('div');
    
    // Style the container to FORCE black text on white background
    tempDiv.style.position = 'fixed';
    tempDiv.style.left = '-9999px';
    tempDiv.style.top = '0';
    tempDiv.style.setProperty('background-color', '#ffffff', 'important');
    tempDiv.style.setProperty('color', '#000000', 'important');
    tempDiv.style.fontFamily = 'Arial, sans-serif';
    tempDiv.style.fontSize = '11pt';
    tempDiv.style.lineHeight = '1.5';
    tempDiv.style.padding = '20px';
    
    // Convert Markdown to HTML with INLINE STYLES (Crucial for Google Docs)
    const lines = generatedScript.split('\n');
    let innerHTML = '';

    lines.forEach(line => {
      let text = line.trim();
      
      if (!text) {
        innerHTML += '<br>';
        return;
      }

      // Escape HTML entities
      text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      // Basic Markdown parsing (Bold, Italic)
      text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
      text = text.replace(/\*(.*?)\*/g, '<i>$1</i>');

      // Styles applied to EVERY element to override Docs defaults
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
      console.error("Copy failed", err);
      // Fallback
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
        inputContentType: currentProfile.contentType || 'general',
        isSaving: false
      });
    }
  };

  const handleOpenRenameModal = (profile: StyleProfile) => {
    setModalState({
      isOpen: true,
      mode: 'rename',
      targetId: profile.id,
      inputValue: profile.name,
      inputContentType: profile.contentType || 'general',
      isSaving: false
    });
  };

  const handleConfirmModal = async () => {
    // Detect if we are using Cloud or Local
    const isCloudUser = currentUserId && currentUserId !== 'demo-local-user' && currentUserId !== 'static-user';
    setModalState(prev => ({ ...prev, isSaving: true }));

    try {
      // --- MODE: SAVE CURRENT PROFILE ---
      if (modalState.mode === 'save' && currentProfile) {
        const name = modalState.inputValue.trim();
        if (!name) return;

        // --- NEW LOGIC: DUPLICATE CHECK ---
        const isDuplicate = savedProfiles.some(p => p.name.toLowerCase() === name.toLowerCase());
        if (isDuplicate) {
            alert(`A model named "${name}" already exists in your library.\nPlease choose a different name.`);
            setModalState(prev => ({ ...prev, isSaving: false }));
            return;
        }
        
        const newProfile = { 
            ...currentProfile, 
            name: name,
            contentType: modalState.inputContentType,
            id: isCloudUser ? '' : crypto.randomUUID()
        };

        if (isCloudUser) {
           const savedCloudProfile = await saveProfileToCloud(currentUserId, newProfile);
           if (savedCloudProfile) {
               setSavedProfiles(prev => [...prev, savedCloudProfile]);
               setCurrentProfile(savedCloudProfile);
           }
        } else {
           setSavedProfiles(prev => [...prev, newProfile as StyleProfile]);
           setCurrentProfile(newProfile as StyleProfile);
           const updated = [...savedProfiles, newProfile as StyleProfile];
           localStorage.setItem('styleMimic_profiles', JSON.stringify(updated));
        }
      } 
      // --- MODE: RENAME PROFILE ---
      else if (modalState.mode === 'rename' && modalState.targetId) {
        const name = modalState.inputValue.trim();
        if (!name) return;

        if (isCloudUser) {
           await updateProfileInCloud(modalState.targetId, {
               name: name,
               contentType: modalState.inputContentType
           });
           setSavedProfiles(prev => prev.map(p => 
             p.id === modalState.targetId 
               ? { ...p, name: name, contentType: modalState.inputContentType } 
               : p
           ));
        } else {
            const updated = savedProfiles.map(p => 
              p.id === modalState.targetId 
                ? { ...p, name: name, contentType: modalState.inputContentType } 
                : p
            );
            setSavedProfiles(updated);
            localStorage.setItem('styleMimic_profiles', JSON.stringify(updated));
        }

        if (currentProfile && currentProfile.id === modalState.targetId) {
          setCurrentProfile(prev => prev ? { ...prev, name: name, contentType: modalState.inputContentType } : null);
        }
      }

      setModalState(prev => ({ ...prev, isOpen: false }));
    } catch (e) {
      alert("Failed to save/update profile.");
      console.error(e);
    } finally {
      setModalState(prev => ({ ...prev, isSaving: false }));
    }
  };
  
  const handleDeleteProfile = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Removed window.confirm due to sandbox restrictions
    // if (!confirm("Are you sure you want to delete this model?")) return;
    
    // Remove from UI immediately (Optimistic)
    const previous = [...savedProfiles];
    setSavedProfiles(prev => prev.filter(p => p.id !== id));

    const isCloudUser = currentUserId && currentUserId !== 'demo-local-user' && currentUserId !== 'static-user';
    
    try {
        if (isCloudUser) {
            await deleteProfileFromCloud(id);
        } else {
            const updated = previous.filter(p => p.id !== id);
            localStorage.setItem('styleMimic_profiles', JSON.stringify(updated));
        }
    } catch (error) {
        // Revert on error
        setSavedProfiles(previous);
        alert("Failed to delete.");
    }
  };

  const handleSelectProfile = (profile: StyleProfile) => {
    setCurrentProfile(profile);
    setActiveTab(Tab.GENERATE);
  };

  const contentTypes: { id: ContentType; label: string; icon: any }[] = [
    { id: 'general', label: 'General / Freeform', icon: FileText },
    { id: 'travel', label: 'Travel Documentary', icon: Globe },
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

  if (appState === AppState.ADMIN_DASHBOARD) return <AdminPanel onLogout={handleLogout} onGoToApp={handleAdminSwitchToApp} />;
  
  // LOGIN SCREEN
  if (appState === AppState.LOCKED) return (
     <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden">
        {/* Animated Background Effect */}
        <div className="absolute inset-0 z-0 opacity-20">
           <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-neon-purple rounded-full blur-[100px]"></div>
           <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-neon-cyan rounded-full blur-[100px]"></div>
        </div>

        <div className="relative z-10 max-w-md w-full bg-gray-900/80 backdrop-blur border border-gray-800 rounded-2xl p-8 shadow-2xl animate-in zoom-in-95">
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
            {currentUserId && currentUserId !== 'demo-local-user' && currentUserId !== 'static-user' ? (
                <div className="text-neon-cyan flex items-center gap-1 text-xs px-2" title="Cloud Library Active">
                    <Cloud className="w-4 h-4" />
                </div>
            ) : null}
            
            {/* API KEY BUTTON */}
            <button 
                onClick={() => setShowApiKeyModal(true)} 
                className={`p-2 rounded-full transition-colors ${userApiKeys.length > 0 ? 'text-gray-400 hover:text-neon-green' : 'text-neon-green bg-neon-green/10 animate-pulse'}`}
                title="Manage API Keys"
            >
                <Key className="w-4 h-4" />
            </button>
            
            {/* Return to Admin Dashboard Button */}
            {sessionStorage.getItem('styleMimic_session_role') === 'admin' && (
              <button 
                onClick={() => setAppState(AppState.ADMIN_DASHBOARD)} 
                className="p-2 rounded-full text-gray-400 hover:text-neon-purple transition-colors"
                title="Return to Admin Dashboard"
              >
                <Shield className="w-4 h-4" />
              </button>
            )}

            <button onClick={handleLogout} className="text-gray-600 hover:text-red-400 transition-colors p-2"><Lock className="w-4 h-4" /></button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        
        {/* --- MAIN CONTENT (ANALYZE, GENERATE, LIBRARY) --- */}
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
                        <button onClick={() => handleRemoveTranscript(index)} className="text-gray-600 hover:text-red-500 transition-colors p-1"><X className="w-4 h-4" /></button>
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
                
                <button onClick={handleAddTranscript} className="flex items-center justify-center gap-2 py-3 border border-dashed border-gray-700 rounded-xl text-gray-500 hover:text-white hover:border-gray-500 hover:bg-gray-800/50 transition-all">
                  <Plus className="w-4 h-4" /> Add transcript
                </button>
              </div>

              <div className="pt-4 border-t border-gray-800">
                <button
                  onClick={handleAnalyze}
                  disabled={appState === AppState.ANALYZING || !hasValidInput}
                  className="w-full flex items-center justify-center gap-2 bg-neon-cyan hover:bg-cyan-400 text-black font-bold py-3 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)]"
                >
                  {appState === AppState.ANALYZING ? <><Loader2 className="w-5 h-5 animate-spin" /> Analyzing...</> : <><Terminal className="w-5 h-5" /> Extract Style DNA</>}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-6 justify-center items-center text-center lg:sticky lg:top-24 h-fit">
               <div className="p-8 border border-gray-800 rounded-2xl bg-gray-900/30 max-w-md w-full">
                <h3 className="text-lg font-medium text-gray-300 mb-4">Forensic Analysis Engine</h3>
                <div className="space-y-6">
                  <div className="flex items-start gap-4 text-left">
                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center shrink-0 text-neon-cyan font-bold">1</div>
                    <div><h4 className="font-bold text-gray-200">Input</h4><p className="text-sm text-gray-500">Provide transcripts.</p></div>
                  </div>
                  <div className="flex items-start gap-4 text-left">
                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center shrink-0 text-neon-purple font-bold">2</div>
                    <div><h4 className="font-bold text-gray-200">Analyze</h4><p className="text-sm text-gray-500">Extract Rhetorical, Cognitive, and Lexical patterns.</p></div>
                  </div>
                  <div className="flex items-start gap-4 text-left">
                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center shrink-0 text-neon-green font-bold">3</div>
                    <div><h4 className="font-bold text-gray-200">Mimic</h4><p className="text-sm text-gray-500">Generate a "Digital Clone".</p></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: GENERATE */}
        {activeTab === Tab.GENERATE && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
            <div className="lg:col-span-4 flex flex-col gap-6">
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
                  </>
                ) : (
                  <div className="text-center py-10 text-gray-500 text-sm">
                    Go to <b className="text-gray-300 cursor-pointer" onClick={() => setActiveTab(Tab.ANALYZE)}>Analyze</b> to create a model.
                  </div>
                )}
              </div>

              {/* GENERATION INPUT */}
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

                 <div className="space-y-4">
                   <div>
                     <div className="flex justify-between items-center mb-2">
                        <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
                          <Settings2 className="w-3 h-3 text-neon-cyan" />
                          Length
                        </h3>
                        <span className="text-xs font-mono text-neon-cyan">
                          {targetLength} {contentType === 'travel' ? 'words/spot' : 'words'}
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
                   </div>

                   {/* NEW: CREATIVITY LEVEL SLIDER */}
                   <div>
                     <div className="flex justify-between items-center mb-2">
                        <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
                          <ZapIcon className="w-3 h-3 text-neon-purple" />
                          Mimicry Strength
                        </h3>
                        <span className="text-xs font-mono text-neon-purple">
                          {creativityLevel.toFixed(2)} (Temp)
                        </span>
                     </div>
                     <input 
                        type="range"
                        min={0.5}
                        max={1.8}
                        step={0.1}
                        value={creativityLevel}
                        onChange={(e) => setCreativityLevel(parseFloat(e.target.value))}
                        className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-neon-purple"
                     />
                     <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                        <span>Safe (0.5)</span>
                        <span>Balanced (1.0)</span>
                        <span>Chaos (1.8)</span>
                     </div>
                   </div>
                 </div>

                 <div className="flex-1 flex flex-col mt-2">
                    <h3 className="text-sm font-bold text-gray-200 mb-2">Topic / Prompt</h3>
                    <textarea
                      className="w-full flex-1 bg-gray-950 border border-gray-800 rounded-lg p-3 text-gray-300 text-sm focus:outline-none focus:border-neon-purple mb-4 resize-none min-h-[200px]"
                      placeholder={`What should this ${contentType} be about?`}
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      disabled={!currentProfile || (contentType === 'travel' && showLocationSelector)}
                    />
                    
                    {contentType === 'travel' && !showLocationSelector ? (
                       <button
                         onClick={() => handleLocationSearch(false)}
                         disabled={appState === AppState.SUGGESTING_LOCATIONS || !topic.trim() || !currentProfile}
                         className="w-full flex items-center justify-center gap-2 bg-neon-green hover:bg-green-500 text-black font-bold py-3 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                       >
                         {appState === AppState.SUGGESTING_LOCATIONS ? <><Loader2 className="w-5 h-5 animate-spin" /> Researching...</> : <><Globe className="w-5 h-5" /> Find Locations</>}
                       </button>
                    ) : (
                      contentType === 'travel' && showLocationSelector ? (
                        <div className="text-xs text-center text-gray-500 bg-gray-950 p-2 rounded">Select locations on the right to proceed</div>
                      ) : (
                        <button
                          onClick={handleGenerate}
                          disabled={appState === AppState.GENERATING || !topic.trim() || !currentProfile}
                          className="w-full flex items-center justify-center gap-2 bg-neon-purple hover:bg-purple-500 text-white font-bold py-3 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(139,92,246,0.3)] hover:shadow-[0_0_25px_rgba(139,92,246,0.5)]"
                        >
                          {appState === AppState.GENERATING ? <><Loader2 className="w-5 h-5 animate-spin" /> Dreaming...</> : <><Play className="w-5 h-5 fill-current" /> Generate Script</>}
                        </button>
                      )
                    )}
                 </div>
              </div>
            </div>

            {/* Output Area */}
            <div className="lg:col-span-8 bg-gray-900 border border-gray-800 rounded-xl p-8 relative overflow-hidden flex flex-col">
              {contentType === 'travel' && showLocationSelector ? (
                 <div className="flex flex-col h-full animate-in fade-in duration-300">
                    <div className="flex justify-between items-center mb-4">
                       <div>
                         <h3 className="text-lg font-bold text-white flex items-center gap-2"><MapPin className="w-5 h-5 text-neon-green" /> Select Locations</h3>
                         <p className="text-sm text-gray-400">Selected: <span className="text-neon-green font-bold">{selectedLocationCount}</span>/20</p>
                       </div>
                       <div className="flex gap-2">
                         <button onClick={() => handleLocationSearch(true)} disabled={appState === AppState.SUGGESTING_LOCATIONS} className="text-xs flex items-center gap-1 bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded transition-colors text-white border border-gray-700">
                            {appState === AppState.SUGGESTING_LOCATIONS ? <Loader2 className="w-3 h-3 animate-spin"/> : <RefreshCw className="w-3 h-3" />} Refill Unselected
                         </button>
                         <button onClick={handleGenerate} disabled={selectedLocationCount === 0 || appState === AppState.GENERATING} className="text-xs flex items-center gap-1 bg-neon-green hover:bg-green-500 text-black px-4 py-2 rounded font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                            {appState === AppState.GENERATING ? <Loader2 className="w-3 h-3 animate-spin"/> : <Play className="w-3 h-3 fill-current" />} Generate with {selectedLocationCount} Spots
                         </button>
                       </div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                       <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                          {locations.map((loc) => (
                            <div key={loc.id} onClick={() => toggleLocationSelection(loc.id)} className={`p-3 rounded-lg border cursor-pointer transition-all relative group ${loc.isSelected ? 'bg-neon-green/10 border-neon-green' : 'bg-gray-950 border-gray-800 hover:border-gray-600'}`}>
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
                <>
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neon-cyan via-neon-purple to-neon-green opacity-50"></div>
                  
                  {/* OUTPUT HEADER WITH REFINEMENT TOOLS */}
                  <div className="flex flex-col gap-3 mb-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2"><FileText className="w-5 h-5 text-gray-500" /> Output Result</h3>
                        <div className="flex items-center gap-2">
                            {contentType === 'travel' && (
                                <button onClick={() => setShowLocationSelector(true)} className="text-xs flex items-center gap-1 text-neon-green hover:text-white transition-colors mr-2 border border-gray-700 hover:border-neon-green px-2 py-1 rounded">
                                    <MapPin className="w-3 h-3" /> Edit Spots
                                </button>
                            )}
                            {generatedScript && (
                                <button onClick={handleCopyToClipboard} className="text-xs flex items-center gap-1 text-gray-500 hover:text-white transition-colors border border-gray-700 hover:border-gray-500 px-3 py-1 rounded">
                                    <Copy className="w-4 h-4" /> Copy for Docs
                                </button>
                            )}
                        </div>
                    </div>
                    
                    {/* MAGIC REFINE TOOLBAR */}
                    {generatedScript && (
                        <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
                           <span className="text-[10px] uppercase font-bold text-gray-500 shrink-0">Magic Refine:</span>
                           
                           <button onClick={() => handleRefine("Make it more extreme and opinionated.")} disabled={isRefining} className="text-xs flex items-center gap-1 bg-gray-800 hover:bg-neon-purple hover:text-white px-2 py-1.5 rounded transition-colors whitespace-nowrap">
                              {isRefining ? <Loader2 className="w-3 h-3 animate-spin"/> : <Wand2 className="w-3 h-3" />} Re-Stylize
                           </button>
                           
                           <button onClick={() => handleRefine("Make it shorter and punchier.")} disabled={isRefining} className="text-xs flex items-center gap-1 bg-gray-800 hover:bg-gray-700 px-2 py-1.5 rounded transition-colors whitespace-nowrap">
                              <Scissors className="w-3 h-3" /> Shorten
                           </button>
                           
                           <button onClick={() => handleRefine("Make it funnier and more sarcastic.")} disabled={isRefining} className="text-xs flex items-center gap-1 bg-gray-800 hover:bg-gray-700 px-2 py-1.5 rounded transition-colors whitespace-nowrap">
                              <Quote className="w-3 h-3" /> Make Funnier
                           </button>
                           
                           <span className="text-[10px] text-gray-600 italic ml-2 hidden sm:inline">
                               Select text to refine specific parts.
                           </span>
                        </div>
                    )}
                  </div>

                  {/* CONTENT AREA */}
                  <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative">
                    {isRefining && (
                        <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-[1px] flex items-center justify-center z-10">
                            <div className="bg-black/80 px-4 py-2 rounded-full flex items-center gap-2 text-neon-purple shadow-xl border border-gray-800">
                                <Loader2 className="w-4 h-4 animate-spin" /> Refining Selection...
                            </div>
                        </div>
                    )}
                    
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

        {/* VIEW: LIBRARY */}
        {activeTab === Tab.LIBRARY && (
          <div className="h-full flex flex-col gap-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-light text-white">Style Library</h2>
                <p className="text-gray-400 text-sm">
                  {currentUserId && currentUserId !== 'demo-local-user' && currentUserId !== 'static-user' 
                     ? 'Cloud Storage Active (Synced)' 
                     : 'Local Storage (This Device Only)'}
                </p>
              </div>
            </div>

            {isLibraryLoading ? (
               <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="w-10 h-10 text-neon-cyan animate-spin" />
               </div>
            ) : savedProfiles.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-4 border-2 border-dashed border-gray-800 rounded-xl">
                <Folder className="w-12 h-12 opacity-50" />
                <p>No saved style models found.</p>
                <button onClick={() => setActiveTab(Tab.ANALYZE)} className="text-neon-cyan hover:underline">Create your first model</button>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto custom-scrollbar pb-4 space-y-10">
                {contentTypes.map((type) => {
                   const groupProfiles = savedProfiles.filter(p => (p.contentType || 'general') === type.id);
                   if (groupProfiles.length === 0) return null;

                   return (
                     <div key={type.id} className="animate-in fade-in slide-in-from-bottom-2">
                       <div className="flex items-center gap-2 mb-4 border-b border-gray-800 pb-2">
                          <type.icon className="w-5 h-5 text-neon-cyan" />
                          <h3 className="text-xl font-light text-gray-200">{type.label}</h3>
                          <span className="text-xs bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">{groupProfiles.length}</span>
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {groupProfiles.map(profile => (
                            <div key={profile.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-600 transition-all group relative flex flex-col">
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold text-white line-clamp-1" title={profile.name}>{profile.name}</h3>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => setViewingProfile(profile)} className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-neon-cyan" title="View DNA Details"><Info className="w-4 h-4" /></button>
                                  <button onClick={() => handleOpenRenameModal(profile)} className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white" title="Rename"><Pencil className="w-4 h-4" /></button>
                                  <button onClick={(e) => handleDeleteProfile(profile.id, e)} className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-red-500" title="Delete"><Trash2 className="w-4 h-4" /></button>
                                </div>
                              </div>
                              <p className="text-sm text-gray-400 mb-4 line-clamp-2">{profile.description}</p>
                              
                              {/* Style Metrics Grid */}
                              <div className="grid grid-cols-3 gap-2 mb-4">
                                  <div className="bg-gray-800 rounded p-1.5 text-center">
                                      <div className="text-[10px] text-gray-500 uppercase font-mono">Humor</div>
                                      <div className="text-sm font-bold text-neon-purple">{profile.metrics.humor}</div>
                                  </div>
                                  <div className="bg-gray-800 rounded p-1.5 text-center">
                                      <div className="text-[10px] text-gray-500 uppercase font-mono">Logic</div>
                                      <div className="text-sm font-bold text-neon-cyan">{profile.metrics.logic}</div>
                                  </div>
                                  <div className="bg-gray-800 rounded p-1.5 text-center">
                                      <div className="text-[10px] text-gray-500 uppercase font-mono">Emotion</div>
                                      <div className="text-sm font-bold text-neon-green">{profile.metrics.emotion}</div>
                                  </div>
                                  <div className="bg-gray-800 rounded p-1.5 text-center">
                                      <div className="text-[10px] text-gray-500 uppercase font-mono">Complex</div>
                                      <div className="text-sm font-bold text-white">{profile.metrics.complexity}</div>
                                  </div>
                                  <div className="bg-gray-800 rounded p-1.5 text-center">
                                      <div className="text-[10px] text-gray-500 uppercase font-mono">Pace</div>
                                      <div className="text-sm font-bold text-white">{profile.metrics.pacing}</div>
                                  </div>
                                  <div className="bg-gray-800 rounded p-1.5 text-center">
                                      <div className="text-[10px] text-gray-500 uppercase font-mono">Casual</div>
                                      <div className="text-sm font-bold text-white">{profile.metrics.informality}</div>
                                  </div>
                              </div>

                              <button 
                                onClick={() => handleSelectProfile(profile)}
                                className="w-full py-2 bg-gray-800 hover:bg-neon-cyan hover:text-black text-white rounded-lg transition-colors text-sm font-bold flex items-center justify-center gap-2 mt-auto"
                              >
                                Load Model <Play className="w-3 h-3 fill-current" />
                              </button>
                            </div>
                          ))}
                       </div>
                     </div>
                   )
                })}
              </div>
            )}
          </div>
        )}

        {/* --- MODALS --- */}

        {/* PROFILE DETAILS MODAL */}
        {viewingProfile && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-2xl p-6 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                           <Brain className="w-6 h-6 text-neon-purple" />
                           {viewingProfile.name}
                        </h2>
                        <p className="text-gray-400 text-sm mt-1">{viewingProfile.description}</p>
                    </div>
                    <button onClick={() => setViewingProfile(null)} className="text-gray-500 hover:text-white p-1">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="space-y-6">
                    {/* Metrics Radar */}
                    <div className="h-64 bg-gray-950/50 rounded-xl border border-gray-800 p-4">
                        <h3 className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Style Metrics</h3>
                        <StyleRadar metrics={viewingProfile.metrics} />
                    </div>

                    {/* NEW: STRUCTURAL PATTERNS DISPLAY */}
                    {viewingProfile.structuralPatterns && (
                        <div>
                           <h3 className="text-sm font-bold text-neon-cyan mb-3 flex items-center gap-2">
                               <Anchor className="w-4 h-4" /> STRUCTURAL ANCHORS
                           </h3>
                           <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-4">
                                <div>
                                   <span className="text-xs text-gray-500 font-mono block mb-1">OPENING HABITS</span>
                                   <p className="text-sm text-gray-300 mb-2 italic">"{viewingProfile.structuralPatterns.introHabits}"</p>
                                   <div className="flex flex-wrap gap-2">
                                       {viewingProfile.structuralPatterns.introPhrases.map((p, i) => (
                                           <span key={i} className="text-xs bg-gray-800 text-neon-cyan px-2 py-1 rounded border border-gray-700">
                                               {p}
                                           </span>
                                       ))}
                                   </div>
                                </div>
                                
                                <div className="border-t border-gray-800 pt-3">
                                   <span className="text-xs text-gray-500 font-mono block mb-1">TRANSITION PHRASES</span>
                                   <div className="flex flex-wrap gap-2">
                                       {viewingProfile.structuralPatterns.transitionPhrases.map((p, i) => (
                                           <span key={i} className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded border border-gray-700">
                                               {p}
                                           </span>
                                       ))}
                                   </div>
                                </div>

                                <div className="border-t border-gray-800 pt-3">
                                   <span className="text-xs text-gray-500 font-mono block mb-1">CLOSING HABITS</span>
                                   <p className="text-sm text-gray-300 mb-2 italic">"{viewingProfile.structuralPatterns.outroHabits}"</p>
                                   <div className="flex flex-wrap gap-2">
                                       {viewingProfile.structuralPatterns.outroPhrases.map((p, i) => (
                                           <span key={i} className="text-xs bg-gray-800 text-neon-purple px-2 py-1 rounded border border-gray-700">
                                               {p}
                                           </span>
                                       ))}
                                   </div>
                                </div>
                           </div>
                        </div>
                    )}

                    {/* QUANTITATIVE ANALYSIS */}
                    {viewingProfile.quantitativeAnalysis && (
                        <div>
                           <h3 className="text-sm font-bold text-neon-green mb-3 flex items-center gap-2">
                               <Ruler className="w-4 h-4" /> PHYSICAL STRUCTURE
                           </h3>
                           <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-4">
                               <div className="grid grid-cols-3 gap-2 text-center pb-4 border-b border-gray-800">
                                   <div>
                                       <span className="block text-xs text-gray-500">Total Words</span>
                                       <span className="text-lg font-bold text-white">{viewingProfile.quantitativeAnalysis.totalWordCount}</span>
                                   </div>
                                   <div>
                                       <span className="block text-xs text-gray-500">Paragraphs</span>
                                       <span className="text-lg font-bold text-white">{viewingProfile.quantitativeAnalysis.paragraphCount}</span>
                                   </div>
                                   <div>
                                       <span className="block text-xs text-gray-500">Avg Words/Para</span>
                                       <span className="text-lg font-bold text-white">{viewingProfile.quantitativeAnalysis.averageWordsPerParagraph}</span>
                                   </div>
                               </div>
                               <div>
                                   <span className="text-xs text-gray-500 block mb-2 font-mono uppercase">Structural Skeleton</span>
                                   <div className="space-y-2">
                                       {viewingProfile.quantitativeAnalysis.structureSkeleton.map((sec, idx) => (
                                           <div key={idx} className="flex justify-between items-center p-2 bg-gray-800/30 rounded border border-gray-800/50">
                                               <div>
                                                   <span className="text-sm font-bold text-neon-green">{sec.sectionName}</span>
                                                   <span className="text-xs text-gray-500 ml-2">({sec.purpose})</span>
                                               </div>
                                               <span className="text-xs font-mono text-white">{sec.estimatedWords} words</span>
                                           </div>
                                       ))}
                                   </div>
                               </div>
                           </div>
                        </div>
                    )}

                    {/* Style DNA Grid */}
                    {viewingProfile.styleDNA && (
                        <div>
                           <h3 className="text-sm font-bold text-neon-purple mb-3 flex items-center gap-2">
                               <Activity className="w-4 h-4" /> FORENSIC DNA ANALYSIS
                           </h3>
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-gray-800/30 p-3 rounded border border-gray-800">
                                    <span className="text-xs text-gray-500 font-mono block mb-1">COGNITIVE PATTERN</span>
                                    <p className="text-sm text-gray-200">{viewingProfile.styleDNA.cognitivePattern}</p>
                                </div>
                                <div className="bg-gray-800/30 p-3 rounded border border-gray-800">
                                    <span className="text-xs text-gray-500 font-mono block mb-1">SYNTAX PATTERN</span>
                                    <p className="text-sm text-gray-200">{viewingProfile.styleDNA.syntaxPattern}</p>
                                </div>
                                <div className="bg-gray-800/30 p-3 rounded border border-gray-800">
                                    <span className="text-xs text-gray-500 font-mono block mb-1">LEXICAL SIGNATURE</span>
                                    <p className="text-sm text-gray-200">{viewingProfile.styleDNA.lexicalSignature}</p>
                                </div>
                                <div className="bg-gray-800/30 p-3 rounded border border-gray-800">
                                    <span className="text-xs text-gray-500 font-mono block mb-1">RHETORICAL DEVICES</span>
                                    <p className="text-sm text-gray-200">{viewingProfile.styleDNA.rhetoricalDevices}</p>
                                </div>
                                <div className="bg-gray-800/30 p-3 rounded border border-gray-800">
                                    <span className="text-xs text-gray-500 font-mono block mb-1">VERBAL TICS & IMPERFECTIONS</span>
                                    <p className="text-sm text-gray-200">{viewingProfile.styleDNA.verbalTics || "None detected"}</p>
                                </div>
                                <div className="bg-gray-800/30 p-3 rounded border border-gray-800">
                                    <span className="text-xs text-gray-500 font-mono block mb-1">EMOTIONAL CURVE</span>
                                    <p className="text-sm text-gray-200">{viewingProfile.styleDNA.emotionalCurve}</p>
                                </div>
                           </div>
                        </div>
                    )}

                    {/* Signature Phrases */}
                     <div>
                        <h3 className="text-sm font-bold text-gray-400 mb-2">Signature Phrases</h3>
                        <div className="flex flex-wrap gap-2">
                            {viewingProfile.signaturePhrases.map((phrase, idx) => (
                                <span key={idx} className="bg-gray-800 text-gray-300 px-2 py-1 rounded text-xs border border-gray-700">
                                    "{phrase}"
                                </span>
                            ))}
                        </div>
                     </div>
                </div>
             </div>
          </div>
        )}

        {/* RENAME / SAVE MODAL */}
        {modalState.isOpen && (
          <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white">
                  {modalState.mode === 'save' ? 'Save Model' : 'Edit Model Details'}
                </h3>
                <button onClick={() => setModalState(prev => ({...prev, isOpen: false}))} className="text-gray-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400 font-mono mb-1 block">MODEL NAME</label>
                  <input type="text" value={modalState.inputValue} onChange={(e) => setModalState(prev => ({...prev, inputValue: e.target.value}))} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-white focus:outline-none focus:border-neon-cyan" placeholder="e.g., The Happy Traveler" autoFocus />
                </div>
  
                <div>
                  <label className="text-xs text-gray-400 font-mono mb-2 block">FOLDER / CATEGORY</label>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                    {contentTypes.map(type => (
                      <button key={type.id} onClick={() => setModalState(prev => ({...prev, inputContentType: type.id}))} className={`flex items-center gap-2 p-2 rounded-lg border text-xs text-left transition-all ${modalState.inputContentType === type.id ? 'bg-neon-cyan/10 border-neon-cyan text-white ring-1 ring-neon-cyan/50' : 'bg-gray-950 border-gray-800 text-gray-400 hover:bg-gray-900 hover:border-gray-600'}`}>
                        <type.icon className={`w-3 h-3 ${modalState.inputContentType === type.id ? 'text-neon-cyan' : ''}`} />
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="flex gap-3 justify-end pt-4 border-t border-gray-800 mt-4">
                  <button onClick={() => setModalState(prev => ({...prev, isOpen: false}))} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors" disabled={modalState.isSaving}>Cancel</button>
                  <button onClick={handleConfirmModal} disabled={!modalState.inputValue.trim() || modalState.isSaving} className="flex items-center gap-2 px-6 py-2 bg-neon-cyan hover:bg-cyan-400 text-black font-bold rounded-lg transition-colors disabled:opacity-50">
                    {modalState.isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Check className="w-4 h-4" />}
                    {modalState.mode === 'save' ? 'Save to Library' : 'Update'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* API KEY CONFIG MODAL */}
        {showApiKeyModal && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700">
                           <Zap className="w-5 h-5 text-neon-green" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Configure AI Engine</h2>
                            <p className="text-xs text-gray-500">Manage your Google Gemini API Keys</p>
                        </div>
                    </div>
                    <button onClick={() => setShowApiKeyModal(false)} className="text-gray-500 hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="space-y-4">
                   <div className="flex justify-between items-start gap-2">
                      <p className="text-gray-400 text-sm">
                        Add multiple keys to enable <b>Key Rotation</b>. Don't have a key? <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-neon-cyan hover:underline inline-flex items-center gap-1 font-bold">Get one here <ExternalLink className="w-3 h-3"/></a>.
                      </p>
                   </div>
                  
                  {/* Key Input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-neon-green"
                      placeholder="Paste Gemini API Key here..."
                      value={tempApiKeyInput}
                      onChange={(e) => setTempApiKeyInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddApiKey()}
                    />
                    <button 
                        onClick={handleAddApiKey}
                        disabled={!tempApiKeyInput.trim()}
                        className="bg-gray-800 hover:bg-neon-green hover:text-black text-neon-green border border-gray-700 hover:border-neon-green rounded-xl px-4 py-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Plus className="w-6 h-6" />
                    </button>
                  </div>

                  {/* Key List */}
                  <div className="bg-gray-950/50 border border-gray-800 rounded-xl p-4 min-h-[120px] max-h-[200px] overflow-y-auto custom-scrollbar">
                      {userApiKeys.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-2">
                            <Key className="w-8 h-8 opacity-20" />
                            <p className="text-xs">No keys added yet.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                            {userApiKeys.map((k, idx) => {
                                const status = keyStatuses[k] || 'ready';
                                return (
                                <div key={idx} className="flex justify-between items-center bg-gray-900 p-2 rounded-lg border border-gray-800">
                                    <div className="flex items-center gap-3">
                                        <div className="flex flex-col">
                                            <code className="text-xs text-gray-300 font-mono">
                                                ••••• {k.slice(-6)}
                                            </code>
                                        </div>
                                        {/* STATUS BADGES */}
                                        {status === 'active' && (
                                            <span className="flex items-center gap-1 text-[10px] bg-green-900/30 text-green-400 px-1.5 py-0.5 rounded border border-green-800">
                                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                                                Start
                                            </span>
                                        )}
                                        {status === 'expired' && (
                                            <span className="flex items-center gap-1 text-[10px] bg-red-900/30 text-red-400 px-1.5 py-0.5 rounded border border-red-800">
                                                <Circle className="w-1.5 h-1.5 fill-current" />
                                                Expired
                                            </span>
                                        )}
                                    </div>
                                    <button onClick={() => handleRemoveApiKey(idx)} className="text-gray-500 hover:text-red-500 p-1">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            )})}
                        </div>
                      )}
                  </div>
                  
                  {userApiKeys.length === 0 && (
                      <div className="flex items-center gap-2 p-3 bg-yellow-900/20 border border-yellow-800/50 rounded-lg text-yellow-500 text-xs">
                          <AlertTriangle className="w-4 h-4" />
                          <span>You must add at least one key to use Analyze/Generate features.</span>
                      </div>
                  )}

                  <button
                    onClick={() => setShowApiKeyModal(false)}
                    className="w-full mt-2 py-3 border border-transparent text-sm font-bold rounded-xl text-black bg-neon-green hover:bg-green-500 transition-all"
                  >
                    Done
                  </button>
                </div>
             </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default App;