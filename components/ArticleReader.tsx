import React, { useCallback, useState, useEffect } from 'react';
import { Article, WordDefinition } from '../types';
import { BookOpen, RefreshCw, Loader2 } from 'lucide-react';

interface ArticleReaderProps {
  article: Article | null;
  onWordSelect: (word: string, context: string) => void;
  onClearSelection: () => void;
  isLoading: boolean;
  onGenerateNew: () => void;
  currentDefinition: WordDefinition | null;
  isTranslating: boolean;
  showDetailed: boolean;
}

const ArticleReader: React.FC<ArticleReaderProps> = ({ 
  article, 
  onWordSelect, 
  onClearSelection,
  isLoading, 
  onGenerateNew,
  currentDefinition,
  isTranslating,
  showDetailed
}) => {
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);

  const handleMouseUp = useCallback(() => {
    // Use a small timeout to ensure the selection is fully finalized by the browser
    setTimeout(() => {
      const selection = window.getSelection();
      
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setSelectionRect(null);
        onClearSelection();
        return;
      }

      const selectedText = selection.toString().trim();
      if (!selectedText) {
        setSelectionRect(null);
        onClearSelection();
        return;
      }

      // Calculate position
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectionRect(rect);

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
  }, [onWordSelect, onClearSelection]);

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

  // Render logic for popover placement
  const renderPopover = () => {
    if (!selectionRect || (!isTranslating && !currentDefinition)) return null;

    // Smart positioning logic
    // If top of selection is < 250px from viewport top, place below.
    // Otherwise place above.
    const spaceAbove = selectionRect.top;
    const placeBelow = spaceAbove < 250;

    const popoverStyle: React.CSSProperties = {
      position: 'fixed',
      zIndex: 50,
      left: `${selectionRect.left + (selectionRect.width / 2)}px`,
      // If placing below, we position at the bottom of the text rect
      // If placing above, we position at the top of the text rect
      top: placeBelow ? `${selectionRect.bottom + 12}px` : `${selectionRect.top - 12}px`,
      // If placing below, we translate X center, and Y 0.
      // If placing above, we translate X center, and Y -100% (shift up by full height).
      transform: placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
    };

    // Arrow logic:
    // If popover is below, arrow is at the top of popover, pointing up.
    // If popover is above, arrow is at the bottom of popover, pointing down.
    const arrowBaseClass = "absolute w-3 h-3 bg-white transform rotate-45 border-gray-200 left-1/2 -translate-x-1/2";
    // For arrow pointing up (at top of box): border-t border-l
    // For arrow pointing down (at bottom of box): border-b border-r
    const arrowClass = placeBelow 
      ? `${arrowBaseClass} top-[-6px] border-t border-l`
      : `${arrowBaseClass} bottom-[-6px] border-b border-r`;

    return (
        <div 
          style={popoverStyle}
          className="mb-2"
        >
          <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-72 md:w-80 animate-in fade-in zoom-in duration-200 overflow-hidden flex flex-col max-h-[400px]">
            {isTranslating ? (
              <div className="flex items-center justify-center py-4 text-gray-400 gap-2">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm font-medium">Translating...</span>
              </div>
            ) : currentDefinition && (
              <div className="overflow-y-auto pr-1 custom-scrollbar">
                <div className="flex items-start justify-between mb-1">
                  <h3 className="font-bold text-danish-red text-xl leading-tight break-words pr-2">
                    {currentDefinition.word}
                  </h3>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 mb-3 mt-1">
                  <span className="text-sm text-gray-500 italic font-serif">/{currentDefinition.pronunciation}/</span>
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-md font-medium">
                    {currentDefinition.partOfSpeech}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    {currentDefinition.chineseTranslation && (
                       <span className="text-xs font-bold text-gray-400 mt-1 w-6 flex-shrink-0">EN</span>
                    )}
                    <p className="text-base font-medium text-gray-900 leading-snug">{currentDefinition.translation}</p>
                  </div>
                  
                  {currentDefinition.chineseTranslation && (
                    <div className="flex items-start gap-2 pt-2 border-t border-gray-50">
                      <span className="text-xs font-bold text-gray-400 mt-1 w-6 flex-shrink-0">CN</span>
                      <p className="text-base font-medium text-gray-700 leading-snug">
                        {currentDefinition.chineseTranslation}
                      </p>
                    </div>
                  )}

                  {showDetailed && (currentDefinition.detailedExplanation || currentDefinition.detailedChineseExplanation) && (
                    <div className="pt-3 mt-2 border-t border-gray-100 animate-in fade-in duration-300">
                      <p className="text-xs font-bold text-purple-500 uppercase tracking-wider mb-1">Detailed Explanation</p>
                      {currentDefinition.detailedExplanation && (
                        <div className="mb-2">
                           {currentDefinition.detailedChineseExplanation && <span className="text-xs font-bold text-gray-400 block mb-0.5">EN</span>}
                           <p className="text-sm text-gray-600 leading-relaxed bg-purple-50 p-2 rounded-md border border-purple-100">
                             {currentDefinition.detailedExplanation}
                           </p>
                        </div>
                      )}
                      {currentDefinition.detailedChineseExplanation && (
                        <div>
                           <span className="text-xs font-bold text-gray-400 block mb-0.5">CN</span>
                           <p className="text-sm text-gray-600 leading-relaxed bg-purple-50 p-2 rounded-md border border-purple-100">
                             {currentDefinition.detailedChineseExplanation}
                           </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Popover Arrow */}
            <div className={arrowClass}></div>
          </div>
        </div>
    );
  };

  return (
    <div className="relative">
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

      {renderPopover()}
    </div>
  );
};

export default ArticleReader;