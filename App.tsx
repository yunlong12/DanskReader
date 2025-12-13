import React, { useState, useEffect, useRef, useCallback } from 'react';
import { translateWordInContext, playPronunciation, stopAudio } from './services/geminiService';
import { Article, WordDefinition, HistoryItem, LoadingState, LanguageCode, SUPPORTED_LANGUAGES } from './types';
import ArticleReader from './components/ArticleReader';
import ArticleGeneratorModal from './components/ArticleGeneratorModal';
import HistorySidebar from './components/HistorySidebar';
import { Sparkles, Volume2, Turtle, FileText, Maximize, Minimize, Plus, Minus, Type, Languages, Palette, VolumeX, Bookmark, MessageSquareQuote } from 'lucide-react';

const DEFAULT_SETTINGS = {
  targetLang: 'en' as LanguageCode,
  showDetailed: false,
  autoPlayCount: 3,
  playbackSpeed: 1.0,
  textSize: 1.0,
  readingTheme: 'light' as 'light' | 'sepia' | 'dark',
  bookmarksEnabled: false
};

// Helper to calculate offset of a specific text node within a container
const getNodeOffset = (node: Node, container: Node): number => {
  let offset = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  let currentNode = walker.nextNode();
  while (currentNode) {
    if (currentNode === node) {
      return offset;
    }
    offset += currentNode.textContent?.length || 0;
    currentNode = walker.nextNode();
  }
  return 0;
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
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // User Preferences (Initialized from LocalStorage)
  const [targetLang, setTargetLang] = useState<LanguageCode>(initialSettings.targetLang);
  const [showDetailed, setShowDetailed] = useState(initialSettings.showDetailed);
  const [autoPlayCount, setAutoPlayCount] = useState<number>(initialSettings.autoPlayCount ?? 3);
  const [playbackSpeed, setPlaybackSpeed] = useState(initialSettings.playbackSpeed);
  const [textSize, setTextSize] = useState(initialSettings.textSize);
  const [readingTheme, setReadingTheme] = useState<'light' | 'sepia' | 'dark'>(initialSettings.readingTheme);
  const [bookmarksEnabled, setBookmarksEnabled] = useState(initialSettings.bookmarksEnabled);
  
  // Word History
  const [wordHistory, setWordHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('dansk_reader_word_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load word history", e);
      return [];
    }
  });

  // Save word history
  useEffect(() => {
    localStorage.setItem('dansk_reader_word_history', JSON.stringify(wordHistory));
  }, [wordHistory]);

  // Ref to track the current request ID to prevent overlapping loops/race conditions
  const currentRequestIdRef = useRef<number>(0);
  // Track touch-triggered manual translate to avoid duplicate clicks
  const manualTranslateTouchRef = useRef(false);
  
  // Drag to scroll refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Allow wheel-to-horizontal scroll for the controls bar
  const handleControlsWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      e.currentTarget.scrollLeft += e.deltaY;
    }
  };

  // Drag to scroll handlers for desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5; // scroll-fast multiplier
    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
  };
  
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

  const handlePasteArticle = (title: string, content: string, language: LanguageCode) => {
    setIsGeneratorOpen(false);
    setLoadingState(LoadingState.IDLE);
    const newArticle: Article = {
      id: crypto.randomUUID(),
      title: title,
      content: content,
      topic: 'Custom Text',
      language: language
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
    stopAudio();
    setCurrentDefinition(null);
  };
  
  const handleWordSelect = async (word: string, context: string, isSentence: boolean = false) => {
    if (!article) return;
    
    // IMMEDIATE STOP: Stop any existing audio
    stopAudio();

    // Generate a unique ID for this specific request interaction.
    currentRequestIdRef.current += 1;
    const requestId = currentRequestIdRef.current;
    
    setLoadingState(LoadingState.TRANSLATING);
    setCurrentDefinition(null); 
    
    try {
      const definition = await translateWordInContext(word, context, article.language, targetLang, showDetailed);
      
      // Check if a new request has started since we began. 
      if (currentRequestIdRef.current !== requestId) return;

      setCurrentDefinition(definition);
      
      // Add to history
      const newItem: HistoryItem = {
        ...definition,
        id: crypto.randomUUID(),
        timestamp: Date.now()
      };
      
      setWordHistory(prev => {
          // Avoid duplicates at the very top (debounce)
          const filtered = prev.filter(item => item.word.toLowerCase() !== newItem.word.toLowerCase() || (Date.now() - item.timestamp > 1000));
          return [newItem, ...prev].slice(0, 100); // Keep last 100 items
      });
      
      // Handle Auto-Play logic: Only play if it's NOT a sentence selection
      if (!isSentence && autoPlayCount > 0) {
        (async () => {
          const speed = playbackSpeed;
          // Loop based on autoPlayCount
          for (let i = 0; i < autoPlayCount; i++) {
            if (currentRequestIdRef.current !== requestId) break;
            
            try {
              // Play source language pronunciation
              await playPronunciation(definition.word, article.language, speed);
              if (i < autoPlayCount - 1) await new Promise(resolve => setTimeout(resolve, 500));
            } catch (e) {
              console.warn("Auto-play interrupted or failed", e);
              break;
            }
          }
        })();
      }

    } catch (error) {
      if (currentRequestIdRef.current !== requestId) return;
      console.error("Translation failed", error);
    } finally {
      if (currentRequestIdRef.current === requestId) {
        setLoadingState(LoadingState.IDLE);
      }
    }
  };

  const handleManualTranslate = () => {
    // Try to get text from active selection
    const selection = window.getSelection();
    let text = "";
    let context = "";

    if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
        text = selection.toString().trim();
        const range = selection.getRangeAt(0);

        // Attempt to find the "context" paragraph
        let containerEl: Node | null = range.commonAncestorContainer;
        if (containerEl.nodeType === Node.TEXT_NODE) {
            containerEl = containerEl.parentElement;
        }

        // Walk up to find a block element (P, DIV, etc)
        const validContextTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE'];
        while (containerEl && containerEl instanceof Element && !validContextTags.includes(containerEl.tagName)) {
            containerEl = containerEl.parentElement;
        }

        if (containerEl) {
             const fullText = containerEl.textContent || "";
             
             // Calculate start and end indices in the full text
             // We mainly care about text nodes for the selection anchors
             let globalStart = -1;
             let globalEnd = -1;

             if (range.startContainer.nodeType === Node.TEXT_NODE) {
                 globalStart = getNodeOffset(range.startContainer, containerEl) + range.startOffset;
             }
             
             if (range.endContainer.nodeType === Node.TEXT_NODE) {
                 globalEnd = getNodeOffset(range.endContainer, containerEl) + range.endOffset;
             }
             
             // If we successfully mapped to the text content
             if (globalStart !== -1 && globalEnd !== -1) {
                  const terminators = ['.', '!', '?', '。', '？', '！', '\n'];
        
                  let sStart = 0;
                  let sEnd = fullText.length;
                  
                  // Scan backwards from globalStart
                  for (let i = globalStart - 1; i >= 0; i--) {
                      if (terminators.includes(fullText[i])) {
                          sStart = i + 1;
                          break;
                      }
                  }
                  
                  // Scan forwards from globalEnd
                  for (let i = globalEnd; i < fullText.length; i++) {
                      if (terminators.includes(fullText[i])) {
                          sEnd = i + 1; // Include the terminator
                          break;
                      }
                  }
                  context = fullText.substring(sStart, sEnd).trim();
             } else {
                // Fallback: just use the container text if we couldn't calc offsets
                context = fullText;
             }
        }
    }
    
    if (!text) {
       alert("Please select some text first.");
       return;
    }
    
    // Fallback if context calculation failed or selection was outside expected structure
    if (!context) {
        context = text;
    }
    
    // Treat as sentence to avoid audio auto-play
    handleWordSelect(text, context, true);
  };

  const handleManualTranslateTouch = (e: React.TouchEvent) => {
    e.preventDefault();
    manualTranslateTouchRef.current = true;
    handleManualTranslate();
    // Reset flag after a short delay so synthesized click events don't double-trigger
    setTimeout(() => { manualTranslateTouchRef.current = false; }, 400);
  };

  const handleManualTranslateClick = () => {
    if (manualTranslateTouchRef.current) return;
    handleManualTranslate();
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
      {/* Header - Fixed to top */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm h-16 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 bg-danish-red rounded-md flex items-center justify-center text-white font-bold font-serif text-xl">M</div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">
              <span className="md:hidden">MR</span>
              <span className="hidden md:inline">Multilingual Reader</span>
            </h1>
          </div>
          
          <div 
            ref={scrollContainerRef}
            className={`flex items-center gap-2 flex-1 overflow-x-auto justify-start pr-2 md:pr-0 no-scrollbar ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onWheel={handleControlsWheel}
            onMouseDown={handleMouseDown}
            onMouseLeave={handleMouseLeave}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
          >
            
             {/* Fullscreen Toggle */}
             <button
             onClick={toggleFullscreen}
              className="flex items-center justify-center p-2 rounded-full text-gray-500 hover:bg-gray-100 border border-gray-200 flex-shrink-0"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>

            {/* Manual Translate Button */}
             <button
              onMouseDown={(e) => e.preventDefault()}
              onTouchStart={(e) => e.preventDefault()}
              onTouchEnd={handleManualTranslateTouch}
              onClick={handleManualTranslateClick}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all whitespace-nowrap flex-shrink-0"
              title="Translate Selected Text"
            >
              <MessageSquareQuote size={14} />
              <span>Translate Selection</span>
            </button>

            {/* Text Size Control */}
            <div className="flex items-center border border-gray-200 rounded-full bg-white flex-shrink-0 h-8">
              <button onClick={handleDecreaseTextSize} className="px-2 h-full hover:bg-gray-50 text-gray-500 rounded-l-full flex items-center justify-center">
                <Minus size={14} />
              </button>
              <div className="px-1 text-xs font-medium text-gray-400 flex items-center gap-0.5 border-x border-gray-100 h-4 leading-4">
                <Type size={12} />
              </div>
              <button onClick={handleIncreaseTextSize} className="px-2 h-full hover:bg-gray-50 text-gray-500 rounded-r-full flex items-center justify-center">
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
            >
              <Palette size={14} />
              <span>{getThemeLabel()}</span>
            </button>

            {/* Auto Play Toggle */}
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
              <span>Detailed</span>
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
              <span>Bookmarks</span>
            </button>

            <div className="h-6 w-px bg-gray-200 mx-1 flex-shrink-0"></div>

            {/* Target Language Selector */}
            <div className="flex items-center border border-gray-200 rounded-full px-2 bg-white flex-shrink-0 h-8">
               <Languages size={14} className="text-gray-400 mr-1" />
               <select 
                 value={targetLang}
                 onChange={(e) => setTargetLang(e.target.value as LanguageCode)}
                 className="text-xs font-semibold text-gray-700 bg-transparent border-none focus:ring-0 py-0 pl-0 pr-6 cursor-pointer outline-none h-full"
               >
                 {SUPPORTED_LANGUAGES.map(lang => (
                   <option key={lang.code} value={lang.code}>{lang.flag} {lang.name}</option>
                 ))}
               </select>
            </div>

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

      {/* Main Content - Padded to account for fixed header */}
      <div className="pt-16 flex-1 max-w-7xl w-full mx-auto flex flex-col lg:flex-row relative items-start min-h-screen">
        <main className="flex-1 p-4 md:p-8 w-full min-w-0">
          <ArticleReader 
            article={article}
            onWordSelect={handleWordSelect}
            onClearSelection={handleClearSelection}
            isLoading={false}
            onGenerateNew={() => setIsGeneratorOpen(true)}
            currentDefinition={currentDefinition}
            isTranslating={loadingState === LoadingState.TRANSLATING}
            showDetailed={showDetailed}
            onSetBookmark={handleSetBookmark}
            textSize={textSize}
            readingTheme={readingTheme}
            bookmarksEnabled={bookmarksEnabled}
            playbackSpeed={playbackSpeed}
          />
        </main>
        
        {/* Sidebar for Desktop */}
        <div className="hidden lg:block h-[calc(100vh-4rem)] sticky top-16 flex-shrink-0 z-30">
           <HistorySidebar 
             currentDefinition={currentDefinition}
             isLoading={loadingState === LoadingState.TRANSLATING}
             playbackSpeed={playbackSpeed}
           />
        </div>
      </div>

      <ArticleGeneratorModal 
        isOpen={isGeneratorOpen} 
        onClose={() => {
            if (article) setIsGeneratorOpen(false);
        }}
        onPaste={handlePasteArticle}
        articleHistory={articleHistory}
        onSelectHistory={handleSelectHistory}
      />
    </div>
  );
}

export default App;