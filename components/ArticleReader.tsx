import React, { useCallback } from 'react';
import { Article } from '../types';
import { BookOpen, RefreshCw } from 'lucide-react';

interface ArticleReaderProps {
  article: Article | null;
  onWordSelect: (word: string, context: string) => void;
  isLoading: boolean;
  onGenerateNew: () => void;
}

const ArticleReader: React.FC<ArticleReaderProps> = ({ article, onWordSelect, isLoading, onGenerateNew }) => {
  
  const handleMouseUp = useCallback(() => {
    // Use a small timeout to ensure the selection is fully finalized by the browser
    // This handles race conditions where double-click events might fire before selection is populated
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

      const selectedText = selection.toString().trim();
      if (!selectedText) return;

      // Get context: try to get the full paragraph/container text
      let context = "";
      if (selection.anchorNode) {
         // Traverse up to find the block element
         let el: HTMLElement | null = selection.anchorNode.parentElement;
         const validContextTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE'];
         
         while (el && !validContextTags.includes(el.tagName)) {
           el = el.parentElement;
         }
         
         if (el) {
           context = el.innerText;
         } else if (selection.anchorNode.parentElement) {
           // Fallback to parent element text if no specific block tag found
           context = selection.anchorNode.parentElement.innerText;
         } else {
           context = selection.anchorNode.textContent || "";
         }
      }

      if (context) {
        // Determine if it is a single word or a phrase/sentence selection
        // We use a simple heuristic: if it contains spaces, it's likely a phrase
        if (selectedText.includes(' ')) {
           // Treat as phrase/sentence: preserve punctuation
           onWordSelect(selectedText, context);
        } else {
           // Treat as single word: clean punctuation
           // This regex matches a word potentially containing Danish chars
           const cleanWordMatch = selectedText.match(/[a-zA-ZæøåÆØÅ]+/);
           const cleanWord = cleanWordMatch ? cleanWordMatch[0] : selectedText;
           onWordSelect(cleanWord, context);
        }
      }
    }, 10);
  }, [onWordSelect]);

  if (!article) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-500 min-h-[400px]">
        <BookOpen size={48} className="mb-4 text-gray-300" />
        <h3 className="text-xl font-serif font-medium text-gray-700 mb-2">No article loaded</h3>
        <p className="mb-6">New article</p>
        <button 
          onClick={onGenerateNew}
          disabled={isLoading}
          className="px-6 py-2 bg-danish-red text-white rounded-full font-medium hover:bg-danish-dark transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Loading...' : 'Select Article'}
        </button>
      </div>
    );
  }

  // Split content by newlines to render paragraphs
  const paragraphs = article.content.split('\n').filter(p => p.trim() !== '');

  return (
    <div 
      className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden min-h-[600px]"
      onMouseUp={handleMouseUp}
    >
      {/* Article Header */}
      <div className="p-8 pb-4 border-b border-gray-100">
        <div className="flex justify-between items-start mb-4">
          <span className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-bold uppercase tracking-wider rounded-full">
            {article.topic}
          </span>
          <button 
            onClick={onGenerateNew}
            disabled={isLoading}
            className="text-gray-400 hover:text-danish-red transition-colors p-1"
            title="New article"
          >
            <RefreshCw size={20} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
        <h1 className="text-3xl md:text-4xl font-serif font-bold text-gray-900 leading-tight mb-2">
          {article.title}
        </h1>
        <p className="text-sm text-gray-400 italic">Double-click a word or select a sentence to translate</p>
      </div>

      {/* Article Body */}
      <div 
        className="p-8 pt-6 font-serif text-lg leading-relaxed text-gray-800 space-y-6 selection:bg-yellow-200 selection:text-black cursor-text"
      >
        {paragraphs.map((paragraph, index) => (
          <p key={index} className="mb-4">
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
};

export default ArticleReader;