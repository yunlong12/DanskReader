import React, { useState, useEffect, useRef } from 'react';
import { generateArticle, translateWordInContext, playPronunciation } from './services/geminiService';
import { Article, WordDefinition, HistoryItem, LoadingState } from './types';
import ArticleReader from './components/ArticleReader';
import ArticleGeneratorModal from './components/ArticleGeneratorModal';
import { Sparkles, Volume2, Turtle, FileText, Maximize, Minimize } from 'lucide-react';

function App() {
  const [article, setArticle] = useState<Article | null>(null);
  const [currentDefinition, setCurrentDefinition] = useState<WordDefinition | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]); // Kept for logic if needed, but UI removed
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [showChinese, setShowChinese] = useState(false);
  const [showDetailed, setShowDetailed] = useState(false);
  const [autoPlayAudio, setAutoPlayAudio] = useState(true); // Default to true as requested
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Ref to track the current word being played to prevent overlapping loops
  const currentPlayingWordRef = useRef<string | null>(null);
  
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
    // We could auto-load an article here, but let's let the user choose or click start.
    // For better UX, let's open the generator immediately if no article.
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

  const handleWordSelect = async (word: string, context: string) => {
    setLoadingState(LoadingState.TRANSLATING);
    setCurrentDefinition(null); // Clear previous while loading
    
    // Update ref to indicate any previous playback loop should ideally stop or be ignored
    currentPlayingWordRef.current = word;

    try {
      const definition = await translateWordInContext(word, context, showChinese);
      setCurrentDefinition(definition);
      
      setHistory(prev => {
        // Avoid duplicates at the top of the list
        const filtered = prev.filter(item => item.word.toLowerCase() !== definition.word.toLowerCase());
        const newItem: HistoryItem = { ...definition, id: crypto.randomUUID(), timestamp: Date.now() };
        return [newItem, ...filtered].slice(50); // Keep last 50
      });

      // Handle Auto-Play logic
      if (autoPlayAudio) {
        (async () => {
          const speed = playbackSpeed;
          // Play 3 times
          for (let i = 0; i < 3; i++) {
            // Check if the user has selected a different word in the meantime
            if (currentPlayingWordRef.current !== word) break;
            
            try {
              await playPronunciation(definition.word, speed);
              // Small delay between repetitions
              if (i < 2) await new Promise(resolve => setTimeout(resolve, 500));
            } catch (e) {
              console.warn("Auto-play interrupted or failed", e);
              break;
            }
          }
        })();
      }

    } catch (error) {
      console.error("Translation failed", error);
    } finally {
      setLoadingState(LoadingState.IDLE);
    }
  };

  const cyclePlaybackSpeed = () => {
    setPlaybackSpeed(prev => {
      if (prev === 1.0) return 0.7;
      if (prev === 0.7) return 0.5;
      return 1.0;
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
          
          <div className="flex items-center gap-2">
            {/* Auto Play Toggle */}
            <button
              onClick={() => setAutoPlayAudio(!autoPlayAudio)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border whitespace-nowrap ${
                autoPlayAudio 
                  ? 'bg-blue-50 text-blue-600 border-blue-200 ring-1 ring-blue-200' 
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Volume2 size={14} />
              <span className="hidden lg:inline">{autoPlayAudio ? 'Auto Play (3x)' : 'Auto Play Off'}</span>
              <span className="lg:hidden">{autoPlayAudio ? '3x' : 'Off'}</span>
            </button>

            {/* Speed Toggle */}
            <button
              onClick={cyclePlaybackSpeed}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border whitespace-nowrap ${
                playbackSpeed < 1.0
                  ? 'bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-amber-200' 
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Turtle size={14} />
              <span className="hidden lg:inline">{getSpeedLabel()}</span>
              <span className="lg:hidden">{playbackSpeed}x</span>
            </button>

            {/* Detailed Toggle */}
            <button
              onClick={() => setShowDetailed(!showDetailed)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border whitespace-nowrap ${
                showDetailed 
                  ? 'bg-purple-50 text-purple-600 border-purple-200 ring-1 ring-purple-200' 
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <FileText size={14} />
              <span className="hidden lg:inline">{showDetailed ? 'Detailed On' : 'Detailed Off'}</span>
              <span className="lg:hidden">Det.</span>
            </button>

            {/* Chinese Toggle */}
            <button
              onClick={() => setShowChinese(!showChinese)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border whitespace-nowrap ${
                showChinese 
                  ? 'bg-red-50 text-danish-red border-danish-red/30 ring-1 ring-danish-red/30' 
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <span className="hidden sm:inline">🇨🇳</span>
              <span className="hidden lg:inline">{showChinese ? '中文 On' : '中文 Off'}</span>
              <span className="lg:hidden">{showChinese ? '中' : '英'}</span>
            </button>

             {/* Fullscreen Toggle */}
             <button
              onClick={toggleFullscreen}
              className="flex items-center justify-center p-2 rounded-full text-gray-500 hover:bg-gray-100 border border-gray-200"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>

            <button 
              onClick={() => setIsGeneratorOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-full text-sm font-medium hover:bg-gray-800 transition-colors whitespace-nowrap"
            >
              <Sparkles size={16} />
              <span className="hidden md:inline">Library</span>
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