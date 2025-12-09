import React, { useState, useEffect, useRef } from 'react';
import { generateArticle, translateWordInContext, playPronunciation, stopAudio } from './services/geminiService';
import { Article, WordDefinition, HistoryItem, LoadingState } from './types';
import ArticleReader from './components/ArticleReader';
import ArticleGeneratorModal from './components/ArticleGeneratorModal';
import { Sparkles, Volume2, Turtle, FileText, Maximize, Minimize, Plus, Minus, Type, Languages, Palette, VolumeX, Bookmark, MessageSquareQuote } from 'lucide-react';

const DEFAULT_SETTINGS = {
  targetLang: 'en' as 'en' | 'zh',
  showDetailed: false,
  autoPlayCount: 3,
  playbackSpeed: 1.0,
  textSize: 1.0,
  readingTheme: 'light' as 'light' | 'sepia' | 'dark',
  bookmarksEnabled: false
};

function App() {
  // --- Settings Persistence Logic ---
  const getInitialSettings = () => {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    try {
      const saved = localStorage.getItem('dansk_reader_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Migration: handle legacy boolean autoPlayAudio if it exists
        if (parsed.autoPlayAudio !== undefined) {
          parsed.autoPlayCount = parsed.autoPlayAudio ? 3 : 0;
          delete parsed.autoPlayAudio;
        }
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
      return DEFAULT_SETTINGS;
    } catch (e) {
      console.error("Failed to load settings", e);
      return DEFAULT_SETTINGS;
    }
  };

  const [initialSettings] = useState(getInitialSettings);

  const [article, setArticle] = useState<Article | null>(null);
  const [currentDefinition, setCurrentDefinition] = useState<WordDefinition | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]); 
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // User Preferences (Initialized from LocalStorage)
  const [targetLang, setTargetLang] = useState<'en' | 'zh'>(initialSettings.targetLang);
  const [showDetailed, setShowDetailed] = useState(initialSettings.showDetailed);
  const [autoPlayCount, setAutoPlayCount] = useState<number>(initialSettings.autoPlayCount ?? 3);
  const [playbackSpeed, setPlaybackSpeed] = useState(initialSettings.playbackSpeed);
  const [textSize, setTextSize] = useState(initialSettings.textSize);
  const [readingTheme, setReadingTheme] = useState<'light' | 'sepia' | 'dark'>(initialSettings.readingTheme);
  const [bookmarksEnabled, setBookmarksEnabled] = useState(initialSettings.bookmarksEnabled);
  
  // Ref to track the current request ID to prevent overlapping loops/race conditions
  const currentRequestIdRef = useRef<number>(0);
  
  // Article History State
  const [articleHistory, setArticleHistory] = useState<Article[]>(() => {
    try {
      const saved = localStorage.getItem('dansk_reader_article_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load history", e);
      return [];
    }
  });

  // Save history whenever it changes
  useEffect(() => {
    localStorage.setItem('dansk_reader_article_history', JSON.stringify(articleHistory));
  }, [articleHistory]);

  // Save User Settings whenever they change
  useEffect(() => {
    const settingsToSave = {
      targetLang,
      showDetailed,
      autoPlayCount,
      playbackSpeed,
      textSize,
      readingTheme,
      bookmarksEnabled
    };
    localStorage.setItem('dansk_reader_settings', JSON.stringify(settingsToSave));
  }, [targetLang, showDetailed, autoPlayCount, playbackSpeed, textSize, readingTheme, bookmarksEnabled]);

  // Handle fullscreen change events (e.g. user presses Esc or back button)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Initial load
  useEffect(() => {
    if (!article) {
       setIsGeneratorOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerateArticle = async (topic: string) => {
    setIsGeneratorOpen(false);
    setLoadingState(LoadingState.GENERATING_ARTICLE);
    setArticle(null); // Clear current
    
    try {
      const newArticle = await generateArticle(topic);
      setArticle(newArticle);
      setArticleHistory(prev => {
        const exists = prev.find(a => a.id === newArticle.id);
        if (exists) return prev;
        return [newArticle, ...prev];
      });
    } catch (error) {
      alert("Failed to generate article. Please check your API key or connection.");
    } finally {
      setLoadingState(LoadingState.IDLE);
    }
  };

  const handlePasteArticle = (title: string, content: string) => {
    setIsGeneratorOpen(false);
    setLoadingState(LoadingState.IDLE);
    const newArticle = {
      id: crypto.randomUUID(),
      title: title,
      content: content,
      topic: 'Custom Text',
    };
    setArticle(newArticle);
    setArticleHistory(prev => [newArticle, ...prev]);
  };
  
  const handleSelectHistory = (historyArticle: Article) => {
    setArticle(historyArticle);
    setIsGeneratorOpen(false);
    // Move to top of history
    setArticleHistory(prev => {
      const filtered = prev.filter(a => a.id !== historyArticle.id);
      return [historyArticle, ...filtered];
    });
  };

  const handleSetBookmark = (paragraphIndex: number) => {
    if (!article) return;

    const updatedArticle = { ...article, bookmarkParagraphIndex: paragraphIndex };
    setArticle(updatedArticle);

    // Update history
    setArticleHistory(prev => {
      return prev.map(a => a.id === updatedArticle.id ? updatedArticle : a);
    });
  };

  const handleClearSelection = () => {
    setCurrentDefinition(null);
  };

  const handleWordSelect = async (word: string, context: string, isSentence: boolean = false) => {
    // IMMEDIATE STOP: Stop any existing audio (and pending auto-play loops) 
    // the moment the user interacts with a new word.
    stopAudio();

    // Generate a unique ID for this specific request interaction.
    // This allows us to cancel previous requests (like the first click of a double-click)
    // to prevent race conditions and overlapping audio loops.
    currentRequestIdRef.current += 1;
    const requestId = currentRequestIdRef.current;
    
    setLoadingState(LoadingState.TRANSLATING);
    setCurrentDefinition(null); // Clear previous while loading
    
    try {
      // Pass targetLang to determine whether to fetch English or Chinese
      const definition = await translateWordInContext(word, context, targetLang, showDetailed);
      
      // Check if a new request has started since we began. 
      // If so, abort this one to prevent stale UI updates.
      if (currentRequestIdRef.current !== requestId) return;

      setCurrentDefinition(definition);
      
      setHistory(prev => {
        // Avoid duplicates at the top of the list
        const filtered = prev.filter(item => item.word.toLowerCase() !== definition.word.toLowerCase());
        const newItem: HistoryItem = { ...definition, id: crypto.randomUUID(), timestamp: Date.now() };
        return [newItem, ...filtered].slice(50); // Keep last 50
      });

      // Handle Auto-Play logic: Only play if it's NOT a sentence selection
      if (!isSentence && autoPlayCount > 0) {
        (async () => {
          const speed = playbackSpeed;
          // Loop based on autoPlayCount
          for (let i = 0; i < autoPlayCount; i++) {
            // Check if the user has clicked something else (or double-clicked) in the meantime
            if (currentRequestIdRef.current !== requestId) break;
            
            try {
              await playPronunciation(definition.word, speed);
              // Small delay between repetitions
              if (i < autoPlayCount - 1) await new Promise(resolve => setTimeout(resolve, 500));
            } catch (e) {
              console.warn("Auto-play interrupted or failed", e);
              break;
            }
          }
        })();
      }

    } catch (error) {
      // If error occurred but we moved on to another request, ignore the error
      if (currentRequestIdRef.current !== requestId) return;
      console.error("Translation failed", error);
    } finally {
      // Only clear loading state if we are still the active request
      if (currentRequestIdRef.current === requestId) {
        setLoadingState(LoadingState.IDLE);
      }
    }
  };

  const handleManualTranslate = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
       alert("Please select some text first.");
       return;
    }
    const text = selection.toString().trim();
    if (text) {
       // Attempt to get context from parent element
       let context = text;
       if (selection.anchorNode && selection.anchorNode.parentElement) {
          context = selection.anchorNode.parentElement.innerText;
       }
       // Treat as sentence to avoid audio auto-play
       handleWordSelect(text, context, true);
    }
  };

  const cyclePlaybackSpeed = () => {
    setPlaybackSpeed(prev => {
      if (prev === 1.0) return 0.7;
      if (prev === 0.7) return 0.5;
      return 1.0;
    });
  };

  const cycleAutoPlay = () => {
    setAutoPlayCount(prev => {
      if (prev === 0) return 1;
      if (prev === 1) return 2;
      if (prev === 2) return 3;
      return 0; // Cycle back to off
    });
  };

  const handleIncreaseTextSize = () => {
    setTextSize(prev => {
      const next = prev + 0.1;
      return next > 3.0 ? 3.0 : parseFloat(next.toFixed(1));
    });
  };

  const handleDecreaseTextSize = () => {
    setTextSize(prev => {
      const next = prev - 0.1;
      return next < 0.5 ? 0.5 : parseFloat(next.toFixed(1));
    });
  };
  
  const cycleTheme = () => {
    setReadingTheme(prev => {
      if (prev === 'light') return 'sepia';
      if (prev === 'sepia') return 'dark';
      return 'light';
    });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((e) => {
        console.error("Error attempting to enable fullscreen:", e);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };
  
  const toggleLanguage = () => {
    setTargetLang(prev => prev === 'en' ? 'zh' : 'en');
  };

  const getSpeedLabel = () => {
    if (playbackSpeed === 1.0) return 'Normal Speed';
    if (playbackSpeed === 0.7) return '0.7x Speed';
    return 'Slow (0.5x)';
  };
  
  const getThemeLabel = () => {
    if (readingTheme === 'light') return 'Light';
    if (readingTheme === 'sepia') return 'Sepia';
    return 'Dark';
  };

  const getAutoPlayLabel = () => {
    if (autoPlayCount === 0) return 'Auto Off';
    return `Auto ${autoPlayCount}x`;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 bg-danish-red rounded-md flex items-center justify-center text-white font-bold font-serif text-xl">D</div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900 flex items-baseline">
              <span className="hidden sm:inline">DanskReader</span>
              <span className="sm:hidden">DR</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Manual Translate Button */}
             <button
              onMouseDown={(e) => e.preventDefault()} // Prevent focus loss on click to keep selection active
              onClick={handleManualTranslate}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all whitespace-nowrap flex-shrink-0"
              title="Translate Selected Text"
            >
              <MessageSquareQuote size={14} />
              <span>Translate Selection</span>
            </button>

            {/* Text Size Control */}
            <div className="flex items-center border border-gray-200 rounded-full bg-white mr-1 flex-shrink-0">
              <button onClick={handleDecreaseTextSize} className="px-2 py-1.5 hover:bg-gray-50 text-gray-500 rounded-l-full">
                <Minus size={14} />
              </button>
              <div className="px-1 text-xs font-medium text-gray-400 flex items-center gap-0.5 border-x border-gray-100 h-4 leading-4">
                <Type size={12} />
              </div>
              <button onClick={handleIncreaseTextSize} className="px-2 py-1.5 hover:bg-gray-50 text-gray-500 rounded-r-full">
                <Plus size={14} />
              </button>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={cycleTheme}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border whitespace-nowrap flex-shrink-0 ${
                readingTheme === 'sepia' ? 'bg-[#f4ecd8] text-amber-900 border-amber-200' :
                readingTheme === 'dark' ? 'bg-gray-800 text-gray-200 border-gray-700' :
                'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
              title="Change Theme"
            >
              <Palette size={14} />
              <span>{getThemeLabel()}</span>
            </button>

            {/* Auto Play Toggle (0, 1x, 2x, 3x) */}
            <button
              onClick={cycleAutoPlay}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border whitespace-nowrap flex-shrink-0 ${
                autoPlayCount > 0
                  ? 'bg-blue-50 text-blue-600 border-blue-200 ring-1 ring-blue-200' 
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {autoPlayCount > 0 ? <Volume2 size={14} /> : <VolumeX size={14} />}
              <span>{getAutoPlayLabel()}</span>
            </button>

            {/* Speed Toggle */}
            <button
              onClick={cyclePlaybackSpeed}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border whitespace-nowrap flex-shrink-0 ${
                playbackSpeed < 1.0
                  ? 'bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-amber-200' 
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Turtle size={14} />
              <span>{getSpeedLabel()}</span>
            </button>

            {/* Detailed Toggle */}
            <button
              onClick={() => setShowDetailed(!showDetailed)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border whitespace-nowrap flex-shrink-0 ${
                showDetailed 
                  ? 'bg-purple-50 text-purple-600 border-purple-200 ring-1 ring-purple-200' 
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <FileText size={14} />
              <span>{showDetailed ? 'Detailed On' : 'Detailed Off'}</span>
            </button>
            
            {/* Bookmarks Toggle */}
            <button
              onClick={() => setBookmarksEnabled(!bookmarksEnabled)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border whitespace-nowrap flex-shrink-0 ${
                bookmarksEnabled
                  ? 'bg-teal-50 text-teal-600 border-teal-200 ring-1 ring-teal-200' 
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Bookmark size={14} fill={bookmarksEnabled ? "currentColor" : "none"}/>
              <span>{bookmarksEnabled ? 'Bookmarks On' : 'Bookmarks Off'}</span>
            </button>

            {/* Language Toggle */}
            <button
              onClick={toggleLanguage}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border whitespace-nowrap flex-shrink-0 ${
                targetLang === 'zh'
                  ? 'bg-red-50 text-danish-red border-danish-red/30 ring-1 ring-danish-red/30' 
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Languages size={14} />
              <span>{targetLang === 'en' ? 'English' : 'Chinese'}</span>
            </button>

             {/* Fullscreen Toggle */}
             <button
              onClick={toggleFullscreen}
              className="flex items-center justify-center p-2 rounded-full text-gray-500 hover:bg-gray-100 border border-gray-200 flex-shrink-0"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>

            <button 
              onClick={() => setIsGeneratorOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-full text-sm font-medium hover:bg-gray-800 transition-colors whitespace-nowrap flex-shrink-0"
            >
              <Sparkles size={16} />
              <span>Library</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 max-w-7xl w-full mx-auto flex relative items-start">
        <main className="flex-1 p-4 md:p-8 w-full min-w-0">
          <ArticleReader 
            article={article}
            onWordSelect={handleWordSelect}
            onClearSelection={handleClearSelection}
            isLoading={loadingState === LoadingState.GENERATING_ARTICLE}
            onGenerateNew={() => setIsGeneratorOpen(true)}
            currentDefinition={currentDefinition}
            isTranslating={loadingState === LoadingState.TRANSLATING}
            showDetailed={showDetailed}
            onSetBookmark={handleSetBookmark}
            textSize={textSize}
            targetLang={targetLang}
            readingTheme={readingTheme}
            bookmarksEnabled={bookmarksEnabled}
          />
        </main>
      </div>

      <ArticleGeneratorModal 
        isOpen={isGeneratorOpen} 
        onClose={() => {
            if (article) setIsGeneratorOpen(false);
        }}
        onGenerate={handleGenerateArticle}
        onPaste={handlePasteArticle}
        articleHistory={articleHistory}
        onSelectHistory={handleSelectHistory}
      />
    </div>
  );
}

export default App;