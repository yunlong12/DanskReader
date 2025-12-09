import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Article, WordDefinition } from '../types';
import { BookOpen, RefreshCw, Loader2, Bookmark, GripHorizontal } from 'lucide-react';

interface ArticleReaderProps {
  article: Article | null;
  onWordSelect: (word: string, context: string, isSentence: boolean) => void;
  onClearSelection: () => void;
  isLoading: boolean;
  onGenerateNew: () => void;
  currentDefinition: WordDefinition | null;
  isTranslating: boolean;
  showDetailed: boolean;
  onSetBookmark: (index: number) => void;
  textSize: number;
  targetLang: 'en' | 'zh';
  readingTheme: 'light' | 'sepia' | 'dark';
  bookmarksEnabled: boolean;
}

const ArticleReader: React.FC<ArticleReaderProps> = ({ 
  article, 
  onWordSelect, 
  onClearSelection,
  isLoading, 
  onGenerateNew,
  currentDefinition,
  isTranslating,
  showDetailed,
  onSetBookmark,
  textSize,
  targetLang,
  readingTheme,
  bookmarksEnabled
}) => {
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  // Track window width to ensure popover calculations are accurate on resize/rotation
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 0);
  
  // Dragging state
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const initialDragOffsetRef = useRef({ x: 0, y: 0 });
  
  // Refs for auto-scrolling to bookmark
  const paragraphRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  // Flag to prevent 'click' event from firing immediately after a selection is made on mobile
  const isSelectingRef = useRef(false);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Reset drag position when the definition changes (new lookup)
  useEffect(() => {
    setDragOffset({ x: 0, y: 0 });
  }, [currentDefinition?.word, isTranslating]);

  // Scroll to bookmark when article changes
  useEffect(() => {
    if (article && typeof article.bookmarkParagraphIndex === 'number') {
      const index = article.bookmarkParagraphIndex;
      const el = paragraphRefs.current[index];
      if (el) {
        setTimeout(() => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  }, [article?.id, article?.bookmarkParagraphIndex]);

  // Helper to check if a character is part of a Danish word
  const isWordChar = (char: string) => {
    return /[a-zA-ZæøåÆØÅ0-9\-]/.test(char);
  };

  const handleMouseUp = useCallback(() => {
    // Handle DRAG selections (sentences/phrases)
    setTimeout(() => {
      const selection = window.getSelection();
      
      // If selection is collapsed (empty), it's a click, not a drag. Ignore it here.
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        return;
      }

      const selectedText = selection.toString().trim();
      if (!selectedText) {
        return;
      }

      // CRITICAL: Calculate and store the rect of the selected text.
      // This ensures that when the user clicks "Translate Selection" in the header,
      // the popover knows where to appear.
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectionRect(rect);

      // Mark that a selection action took place to prevent conflict with click
      isSelectingRef.current = true;
      setTimeout(() => { isSelectingRef.current = false; }, 500);

      // We do NOT trigger automatic translation here.
      // The user must click the "Translate Selection" button.
      
    }, 10);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    // Check if we just processed a selection drag, if so, ignore this click
    if (isSelectingRef.current) return;

    // If user has actively selected text (dragged), don't trigger single word lookup
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
      return;
    }

    // Stop native behavior (like "Touch to Search" or cursor placement) for single clicks
    e.preventDefault();

    // Use Caret Range to find word at coordinates (Coordinate-based lookup)
    // This bypasses the need for "selection" and thus avoids native menus
    const x = e.clientX;
    const y = e.clientY;

    let textNode: Node | null = null;
    let offset = 0;

    // Standard API
    if (typeof document.caretRangeFromPoint === 'function') {
      const range = document.caretRangeFromPoint(x, y);
      if (range) {
        textNode = range.startContainer;
        offset = range.startOffset;
      }
    } 
    // Fallback/Alternative API (Webkit/Firefox)
    else if ((document as any).caretPositionFromPoint) {
      const pos = (document as any).caretPositionFromPoint(x, y);
      if (pos) {
        textNode = pos.offsetNode;
        offset = pos.offset;
      }
    }

    // Ensure we hit a text node
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
      // Clicked outside text (e.g. whitespace between paragraphs)
      setSelectionRect(null);
      onClearSelection();
      return;
    }

    const text = textNode.textContent || "";
    
    // Expand from offset to find the full word
    // Look backwards
    let start = offset;
    while (start > 0 && isWordChar(text[start - 1])) {
        start--;
    }
    
    // Look forwards
    let end = offset;
    while (end < text.length && isWordChar(text[end])) {
        end++;
    }

    const clickedWord = text.substring(start, end).trim();

    // Filter out clicks on whitespace or purely punctuation
    if (!clickedWord || !/[a-zA-ZæøåÆØÅ0-9]/.test(clickedWord)) {
      setSelectionRect(null);
      onClearSelection();
      return;
    }

    // Get context (block element text)
    let context = "";
    let el = textNode.parentElement;
    const validContextTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE'];
    while (el && !validContextTags.includes(el.tagName)) {
      el = el.parentElement;
    }
    context = el ? el.innerText : (textNode.parentElement?.innerText || text);

    // Create a temporary range to measure the word's position for the popover
    const measureRange = document.createRange();
    measureRange.setStart(textNode, start);
    measureRange.setEnd(textNode, end);
    const rect = measureRange.getBoundingClientRect();
    
    setSelectionRect(rect);
    // Pass false for isSentence because this was a single click
    onWordSelect(clickedWord, context, false);

  }, [onWordSelect, onClearSelection]);

  // --- Drag Handling Logic ---
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    initialDragOffsetRef.current = { ...dragOffset };
    
    // Attach listeners to window to handle drag outside the element
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!isDraggingRef.current) return;
    
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    
    setDragOffset({
      x: initialDragOffsetRef.current.x + deltaX,
      y: initialDragOffsetRef.current.y + deltaY
    });
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  };


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

  // Define theme styles
  const getThemeStyles = () => {
    switch (readingTheme) {
      case 'sepia':
        return {
          container: 'bg-[#F9F7F1] border-[#E8E4D9]',
          text: 'text-[#433422]',
          header: 'border-[#E8E4D9]',
          meta: 'text-[#8C7B66]',
          bookmarkActive: 'bg-[#EFEDE0]'
        };
      case 'dark':
        return {
          container: 'bg-gray-900 border-gray-800',
          text: 'text-gray-300',
          header: 'border-gray-800',
          meta: 'text-gray-500',
          bookmarkActive: 'bg-gray-800'
        };
      case 'light':
      default:
        return {
          container: 'bg-white border-gray-100',
          text: 'text-gray-800',
          header: 'border-gray-100',
          meta: 'text-gray-400',
          bookmarkActive: 'bg-amber-50'
        };
    }
  };

  const themeStyles = getThemeStyles();

  // Render logic for popover placement
  const renderPopover = () => {
    if (!selectionRect || (!isTranslating && !currentDefinition)) return null;

    // Smart positioning logic
    const spaceAbove = selectionRect.top;
    const placeBelow = spaceAbove < 250;
    
    // Constants for width calculation
    const isMobile = windowWidth < 768;
    const popoverWidth = isMobile ? 288 : 320; 
    const margin = 12; // Safety margin from screen edge

    // Calculate horizontal position
    const textCenter = selectionRect.left + (selectionRect.width / 2);
    
    // Clamp the center position of the popover so it stays within screen bounds
    const minCenterX = (popoverWidth / 2) + margin;
    const maxCenterX = windowWidth - (popoverWidth / 2) - margin;
    
    const popoverCenterX = Math.max(minCenterX, Math.min(textCenter, maxCenterX));
    
    const arrowOffset = textCenter - popoverCenterX;
    
    const maxArrowOffset = (popoverWidth / 2) - 24; 
    const clampedArrowOffset = Math.max(-maxArrowOffset, Math.min(arrowOffset, maxArrowOffset));

    const popoverStyle: React.CSSProperties = {
      position: 'fixed',
      zIndex: 50,
      left: `${popoverCenterX}px`,
      top: placeBelow ? `${selectionRect.bottom + 12}px` : `${selectionRect.top - 12}px`,
      // Apply the drag offset using transform
      transform: `translate(calc(-50% + ${dragOffset.x}px), calc(${placeBelow ? '0%' : '-100%'} + ${dragOffset.y}px))`,
      touchAction: 'none' // Important for drag performance on touch devices
    };

    const arrowBaseClass = "absolute w-3 h-3 bg-white transform rotate-45 border-gray-200 left-1/2 -translate-x-1/2";
    const arrowClass = placeBelow 
      ? `${arrowBaseClass} top-[-6px] border-t border-l`
      : `${arrowBaseClass} bottom-[-6px] border-b border-r`;
      
    const arrowStyle: React.CSSProperties = {
        marginLeft: `${clampedArrowOffset}px`,
        // Hide arrow if dragged away significantly
        opacity: (Math.abs(dragOffset.x) > 20 || Math.abs(dragOffset.y) > 20) ? 0 : 1,
        transition: 'opacity 0.2s'
    };

    // Determine which translation to show based on targetLang
    const displayTranslation = targetLang === 'zh' 
      ? currentDefinition?.chineseTranslation 
      : currentDefinition?.translation;
      
    const displayDetailed = targetLang === 'zh'
      ? currentDefinition?.detailedChineseExplanation
      : currentDefinition?.detailedExplanation;

    return (
        <div 
          style={popoverStyle}
          className="mb-2"
        >
          <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-72 md:w-80 animate-in fade-in zoom-in duration-200 overflow-hidden flex flex-col max-h-[400px]">
            {/* Top Drag Handle */}
            <div 
              onPointerDown={handlePointerDown}
              className="h-6 bg-gray-50 border-b border-gray-100 flex items-center justify-center cursor-move touch-none hover:bg-gray-100 transition-colors shrink-0"
            >
              <GripHorizontal size={16} className="text-gray-300" />
            </div>

            <div className="p-4 pt-2 flex-1 overflow-hidden flex flex-col">
              {isTranslating ? (
                <div className="flex items-center justify-center py-4 text-gray-400 gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm font-medium">Translating...</span>
                </div>
              ) : currentDefinition && (
                <div className="overflow-y-auto pr-1 custom-scrollbar text-gray-900 max-h-[340px]">
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
                      <p className="text-base font-medium text-gray-900 leading-snug">
                        {displayTranslation || "No translation available"}
                      </p>
                    </div>

                    {showDetailed && displayDetailed && (
                      <div className="pt-3 mt-2 border-t border-gray-100 animate-in fade-in duration-300">
                        <p className="text-xs font-bold text-purple-500 uppercase tracking-wider mb-1">Detailed Explanation</p>
                        <div className="mb-2">
                           <p className="text-sm text-gray-600 leading-relaxed bg-purple-50 p-2 rounded-md border border-purple-100">
                             {displayDetailed}
                           </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {/* Bottom Drag Handle */}
            <div 
              onPointerDown={handlePointerDown}
              className="h-6 bg-gray-50 border-t border-gray-100 flex items-center justify-center cursor-move touch-none hover:bg-gray-100 transition-colors shrink-0"
            >
              <GripHorizontal size={16} className="text-gray-300" />
            </div>

            <div className={arrowClass} style={arrowStyle}></div>
          </div>
        </div>
    );
  };

  return (
    <div className="relative">
      <div 
        className={`max-w-3xl mx-auto rounded-xl shadow-sm border overflow-hidden min-h-[600px] transition-colors duration-300 ${themeStyles.container}`}
        onClick={handleClick}
        onMouseUp={handleMouseUp}
        onTouchEnd={handleMouseUp}
        onDoubleClick={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Article Header */}
        <div className={`p-8 pb-4 border-b ${themeStyles.header}`}>
          <div className="flex justify-between items-start mb-4">
            <span className="px-3 py-1 bg-gray-100/50 text-gray-600 text-xs font-bold uppercase tracking-wider rounded-full">
              {article.topic}
            </span>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onGenerateNew();
              }}
              disabled={isLoading}
              className={`hover:text-danish-red transition-colors p-1 ${themeStyles.meta}`}
              title="New article"
            >
              <RefreshCw size={20} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
          <h1 className={`text-3xl md:text-4xl font-serif font-bold leading-tight mb-2 ${readingTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            {article.title}
          </h1>
          <p className={`text-sm italic ${themeStyles.meta}`}>Click a word or select a sentence to translate</p>
        </div>

        {/* Article Body */}
        <div 
          className={`p-8 pt-6 font-serif leading-relaxed space-y-6 selection:bg-yellow-200 selection:text-black cursor-text ${themeStyles.text}`}
          style={{ 
             fontSize: `${textSize * 1.125}rem`,
             lineHeight: 1.8 
          }}
        >
          {paragraphs.map((paragraph, index) => {
            const isBookmarked = article.bookmarkParagraphIndex === index;
            const showBookmarkUI = bookmarksEnabled || isBookmarked;
            
            return (
            <div key={index} className="flex gap-3 group relative">
               {/* Bookmark Button */}
               <div className="w-8 flex-shrink-0 flex justify-end pt-1.5 select-none">
                  {showBookmarkUI && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation(); 
                        if (bookmarksEnabled) {
                          onSetBookmark(index);
                        }
                      }}
                      className={`transition-all duration-200 ${
                        isBookmarked
                          ? 'text-danish-red opacity-100 scale-100' 
                          : `text-gray-400 opacity-0 group-hover:opacity-100 hover:text-danish-red/70 scale-90 hover:scale-100`
                      } ${!bookmarksEnabled && isBookmarked ? 'cursor-default' : 'cursor-pointer'}`}
                      title={isBookmarked ? "Bookmarked" : "Bookmark this paragraph"}
                      disabled={!bookmarksEnabled && isBookmarked}
                    >
                      <Bookmark size={20} fill={isBookmarked ? "currentColor" : "none"} />
                    </button>
                  )}
               </div>
               
               {/* Paragraph Text */}
               <p
                 ref={el => { paragraphRefs.current[index] = el; }}
                 className={`transition-colors duration-500 rounded-lg px-2 -mx-2 flex-1 ${
                    isBookmarked ? themeStyles.bookmarkActive : ''
                 }`}
               >
                 {paragraph}
               </p>
            </div>
          )})}
        </div>
      </div>

      {renderPopover()}
    </div>
  );
};

export default ArticleReader;