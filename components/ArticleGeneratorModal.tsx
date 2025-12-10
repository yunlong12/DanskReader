import React, { useState, useRef } from 'react';
import { X, Clipboard, ArrowLeft, BookOpen, FileText, Camera, Loader2, AlertTriangle, ChevronDown } from 'lucide-react';
import { Article, LanguageCode, SUPPORTED_LANGUAGES } from '../types';
import { transcribeImage, detectLanguage } from '../services/geminiService';

interface ArticleGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaste: (title: string, content: string, language: LanguageCode) => void;
  articleHistory: Article[];
  onSelectHistory: (article: Article) => void;
}

const ArticleGeneratorModal: React.FC<ArticleGeneratorModalProps> = ({ 
  isOpen, 
  onClose, 
  onPaste, 
  articleHistory,
  onSelectHistory
}) => {
  const [mode, setMode] = useState<'menu' | 'paste'>('menu');
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteContent, setPasteContent] = useState('');
  const [selectedLang, setSelectedLang] = useState<LanguageCode | 'auto'>('auto');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [unsupportedLang, setUnsupportedLang] = useState<{name: string} | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  
  if (!isOpen) return null;

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteContent.trim()) return;

    // If manual language is selected, bypass detection
    if (selectedLang !== 'auto') {
         onPaste(pasteTitle.trim() || 'My Article', pasteContent, selectedLang);
         resetForm();
         return;
    }

    setIsLoading(true);
    setLoadingMessage('Detecting language...');

    try {
      const result = await detectLanguage(pasteContent);
      
      if (result.isSupported && result.code) {
        onPaste(pasteTitle.trim() || 'My Article', pasteContent, result.code);
        resetForm();
      } else {
        setUnsupportedLang({ name: result.name });
      }
    } catch (error) {
      console.error("Failed to process article", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setMode('menu');
  };

  const resetForm = () => {
    setPasteTitle('');
    setPasteContent('');
    setSelectedLang('auto');
    setMode('menu');
    setIsLoading(false);
    setUnsupportedLang(null);
  };

  const handleTextFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setPasteTitle(file.name.replace('.txt', ''));
        setPasteContent(text);
        setMode('paste');
      }
    };
    reader.readAsText(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setLoadingMessage('Transcribing image...');
    setMode('paste'); // Switch to form view to show loading state
    setPasteTitle(file.name);
    setPasteContent('');

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64String = (reader.result as string).split(',')[1];
        
        // 1. Transcribe
        const transcribedText = await transcribeImage(base64String, file.type);
        setPasteContent(transcribedText);
        setLoadingMessage('Detecting language...');
        
        // We stay in "paste" mode, user can now verify text and hit submit (which triggers detection)
        
      } catch (error) {
        console.error(error);
        setPasteContent("Error: Could not transcribe image. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsDataURL(file);
    // Reset input
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
          
          {/* Header */}
          <div className="flex justify-between items-center p-6 pb-4 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-center gap-2">
              {mode !== 'menu' && (
                <button onClick={handleBack} className="mr-2 text-gray-400 hover:text-gray-600">
                  <ArrowLeft size={20} />
                </button>
              )}
              <h2 className="text-xl font-bold text-gray-900">
                {mode === 'paste' ? 'Import Content' : 'Your Library'}
              </h2>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X size={24} />
            </button>
          </div>
          
          {/* Content */}
          <div className="p-4 overflow-y-auto flex-1">
            {mode === 'menu' ? (
              <div className="space-y-4">
                
                <div className="grid grid-cols-1 gap-3">
                  {/* Paste Option */}
                  <button
                    onClick={() => setMode('paste')}
                    className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-blue-50 border border-gray-100 hover:border-blue-200 transition-all text-left group"
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <Clipboard size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">Paste Text</h3>
                      <p className="text-xs text-gray-500">Copy text from anywhere</p>
                    </div>
                  </button>

                  {/* Upload Text File */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-green-50 border border-gray-100 hover:border-green-200 transition-all text-left group"
                  >
                    <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center group-hover:bg-green-600 group-hover:text-white transition-colors">
                      <FileText size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">Upload Text File</h3>
                      <p className="text-xs text-gray-500">Select a .txt file</p>
                    </div>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleTextFileUpload} 
                      accept=".txt" 
                      className="hidden" 
                    />
                  </button>

                  {/* Scan Image (OCR) */}
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-purple-50 border border-gray-100 hover:border-purple-200 transition-all text-left group"
                  >
                    <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors">
                      <Camera size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">Scan Page (AI)</h3>
                      <p className="text-xs text-gray-500">Photo/Screenshot to Text</p>
                    </div>
                    <input 
                      type="file" 
                      ref={imageInputRef} 
                      onChange={handleImageUpload} 
                      accept="image/*" 
                      className="hidden" 
                    />
                  </button>
                </div>
                
                <div className="border-t border-gray-100 pt-4 mt-2">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 ml-1">History</p>
                    
                    {articleHistory.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 text-sm">
                        <BookOpen size={32} className="mx-auto mb-2 opacity-20" />
                        <p>No articles yet.</p>
                        <p className="text-xs mt-1">Import a text to start reading!</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {articleHistory.map((article) => {
                          const langFlag = SUPPORTED_LANGUAGES.find(l => l.code === article.language)?.flag || '';
                          return (
                          <button
                            key={article.id}
                            onClick={() => onSelectHistory(article)}
                            className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all text-left group"
                          >
                            <div className="mt-1 w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-danish-red group-hover:text-white transition-colors">
                              {langFlag ? <span className="text-sm">{langFlag}</span> : <BookOpen size={16} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-gray-900 truncate">{article.title}</h3>
                              <p className="text-xs text-gray-500 line-clamp-2">{article.content.substring(0, 100)}...</p>
                            </div>
                          </button>
                        )})}
                      </div>
                    )}
                </div>
              </div>
            ) : (
              <form onSubmit={handlePasteSubmit} className="flex flex-col h-full space-y-4">
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title (Optional)</label>
                  <input 
                    type="text" 
                    value={pasteTitle}
                    onChange={(e) => setPasteTitle(e.target.value)}
                    placeholder="e.g., Chapter 1"
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    disabled={isLoading}
                  />
                </div>
                <div className="flex-1 min-h-[200px] relative">
                  <div className="flex justify-between mb-1 items-end">
                     <label className="block text-sm font-medium text-gray-700">Content</label>
                     <div className="relative">
                       <select
                         value={selectedLang}
                         onChange={(e) => setSelectedLang(e.target.value as LanguageCode | 'auto')}
                         className="appearance-none pl-3 pr-8 py-1 bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 hover:bg-blue-100 transition-colors"
                         disabled={isLoading}
                       >
                         <option value="auto">✨ Auto-Detect</option>
                         {SUPPORTED_LANGUAGES.map(lang => (
                           <option key={lang.code} value={lang.code}>{lang.flag} {lang.name}</option>
                         ))}
                       </select>
                       <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-700 pointer-events-none" />
                     </div>
                  </div>
                  <textarea 
                    value={pasteContent}
                    onChange={(e) => setPasteContent(e.target.value)}
                    placeholder="Paste your text here..."
                    className="w-full h-full min-h-[200px] px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none font-serif text-base"
                    required
                    disabled={isLoading}
                  />
                  {isLoading && (
                    <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center text-center z-10 rounded-lg backdrop-blur-sm">
                      <Loader2 size={40} className="text-blue-600 animate-spin mb-3" />
                      <p className="font-bold text-gray-800">{loadingMessage}</p>
                      <p className="text-xs text-gray-500 mt-1">Please wait...</p>
                    </div>
                  )}
                </div>
                <button 
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-sm disabled:bg-gray-400"
                >
                  {isLoading ? 'Processing...' : 'Read Article'}
                </button>
              </form>
            )}
          </div>

          <div className="p-4 bg-gray-50 text-center text-xs text-gray-400 border-t border-gray-100 flex-shrink-0">
            Polyglot Reader
          </div>
        </div>
      </div>

      {/* Unsupported Language Modal */}
      {unsupportedLang && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-300 p-6 text-center">
              <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                 <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Unsupported Language</h3>
              <p className="text-gray-600 mb-6">
                Detected <strong>{unsupportedLang.name}</strong>.
                <br/>
                We currently support English, Danish, Mandarin, Spanish, French, German, Japanese, and Korean.
              </p>
              <button 
                onClick={() => setUnsupportedLang(null)}
                className="w-full py-2.5 bg-gray-900 text-white font-bold rounded-lg hover:bg-gray-800 transition-colors"
              >
                Okay, got it
              </button>
           </div>
        </div>
      )}
    </>
  );
};

export default ArticleGeneratorModal;