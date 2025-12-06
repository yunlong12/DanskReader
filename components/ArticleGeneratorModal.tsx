import React, { useState } from 'react';
import { X, Clipboard, ArrowLeft, BookOpen, Trash2 } from 'lucide-react';
import { Article } from '../types';

interface ArticleGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (topic: string) => void;
  onPaste: (title: string, content: string) => void;
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
  
  if (!isOpen) return null;

  const handlePasteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteContent.trim()) return;
    
    onPaste(pasteTitle.trim() || 'My Article', pasteContent);
    setPasteTitle('');
    setPasteContent('');
    setMode('menu');
  };

  const handleBack = () => {
    setMode('menu');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 pb-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            {mode === 'paste' && (
              <button onClick={handleBack} className="mr-2 text-gray-400 hover:text-gray-600">
                <ArrowLeft size={20} />
              </button>
            )}
            <h2 className="text-xl font-bold text-gray-900">
              {mode === 'paste' ? 'Paste News / Text' : 'Your Library'}
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
              {/* Paste Option - Top of List */}
              <button
                onClick={() => setMode('paste')}
                className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-blue-50 border-2 border-dashed border-blue-200 hover:border-blue-300 transition-all text-left group bg-blue-50/30"
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Clipboard size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-blue-900">Paste New Text</h3>
                  <p className="text-xs text-blue-600">Copy and paste Danish news or articles</p>
                </div>
              </button>
              
              <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 ml-1">History</p>
                  
                  {articleHistory.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      <BookOpen size={32} className="mx-auto mb-2 opacity-20" />
                      <p>No articles yet.</p>
                      <p className="text-xs mt-1">Paste a text to start reading!</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {articleHistory.map((article) => (
                        <button
                          key={article.id}
                          onClick={() => onSelectHistory(article)}
                          className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all text-left group"
                        >
                          <div className="mt-1 w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-danish-red group-hover:text-white transition-colors">
                            <BookOpen size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-gray-900 truncate">{article.title}</h3>
                            <p className="text-xs text-gray-500 line-clamp-2">{article.content.substring(0, 100)}...</p>
                          </div>
                        </button>
                      ))}
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
                  placeholder="e.g., Dagens Nyheder"
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div className="flex-1 min-h-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Content (Danish)</label>
                <textarea 
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  placeholder="Paste your Danish text here..."
                  className="w-full h-full min-h-[200px] px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none font-serif text-base"
                  required
                />
              </div>
              <button 
                type="submit"
                className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
              >
                Read Article
              </button>
            </form>
          )}
        </div>

        <div className="p-4 bg-gray-50 text-center text-xs text-gray-400 border-t border-gray-100 flex-shrink-0">
           Dansk Reader
        </div>
      </div>
    </div>
  );
};

export default ArticleGeneratorModal;