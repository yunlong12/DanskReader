import React, { useState, useEffect } from 'react';
import { generateArticle, translateWordInContext } from './services/geminiService';
import { Article, WordDefinition, HistoryItem, LoadingState } from './types';
import ArticleReader from './components/ArticleReader';
import HistorySidebar from './components/HistorySidebar';
import ArticleGeneratorModal from './components/ArticleGeneratorModal';
import { Sparkles, Menu } from 'lucide-react';

function App() {
  const [article, setArticle] = useState<Article | null>(null);
  const [currentDefinition, setCurrentDefinition] = useState<WordDefinition | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // For mobile responsiveness
  const [showChinese, setShowChinese] = useState(false);
  
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

  const handleWordSelect = async (word: string, context: string) => {
    // Open sidebar on mobile when selecting a word
    if (window.innerWidth < 1024) {
      setSidebarOpen(true);
    }

    setLoadingState(LoadingState.TRANSLATING);
    setCurrentDefinition(null); // Clear previous while loading

    try {
      const definition = await translateWordInContext(word, context, showChinese);
      setCurrentDefinition(definition);
      
      setHistory(prev => {
        // Avoid duplicates at the top of the list
        const filtered = prev.filter(item => item.word.toLowerCase() !== definition.word.toLowerCase());
        const newItem: HistoryItem = { ...definition, id: crypto.randomUUID(), timestamp: Date.now() };
        return [newItem, ...filtered].slice(50); // Keep last 50
      });

    } catch (error) {
      console.error("Translation failed", error);
    } finally {
      setLoadingState(LoadingState.IDLE);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-danish-red rounded-md flex items-center justify-center text-white font-bold font-serif text-xl">D</div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900 flex items-baseline">
              Dansk<span className="text-danish-red">Reader</span>
              <span className="ml-2 text-sm text-gray-500 font-medium hidden sm:inline-block">by Doctor Wang</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
             {/* Chinese Toggle */}
            <button
              onClick={() => setShowChinese(!showChinese)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                showChinese 
                  ? 'bg-red-50 text-danish-red border-danish-red/30 ring-1 ring-danish-red/30' 
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
              title="Toggle Chinese Translation"
            >
              <span>🇨🇳</span>
              <span className="hidden sm:inline">{showChinese ? '中文 On' : '中文 Off'}</span>
            </button>

            <button 
              onClick={() => setIsGeneratorOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-full text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              <Sparkles size={16} />
              <span className="hidden sm:inline">Open Library</span>
              <span className="sm:hidden">Library</span>
            </button>
            <button 
              className="lg:hidden p-2 text-gray-600"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Menu size={24} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 max-w-7xl w-full mx-auto flex relative items-start">
        
        {/* Article Area */}
        <main className="flex-1 p-4 md:p-8 w-full min-w-0">
          <ArticleReader 
            article={article}
            onWordSelect={handleWordSelect}
            isLoading={loadingState === LoadingState.GENERATING_ARTICLE}
            onGenerateNew={() => setIsGeneratorOpen(true)}
          />
        </main>

        {/* Sidebar - Responsive */}
        <div className={`
          fixed inset-y-0 right-0 z-40 transform transition-transform duration-300 ease-in-out lg:translate-x-0 
          lg:sticky lg:top-16 lg:h-[calc(100vh-64px)]
          ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}
          w-full sm:w-96 shadow-2xl lg:shadow-none bg-white lg:bg-transparent
        `}>
          <div className="h-full flex flex-col">
             <div className="lg:hidden p-4 border-b flex justify-end">
               <button onClick={() => setSidebarOpen(false)} className="text-gray-500">Close</button>
             </div>
             <HistorySidebar 
                currentDefinition={currentDefinition} 
                history={history}
                isLoading={loadingState === LoadingState.TRANSLATING}
             />
          </div>
        </div>

        {/* Overlay for mobile sidebar */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/20 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
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