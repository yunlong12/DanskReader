import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Article, WordDefinition } from '../types';
import { BookOpen, RefreshCw, Loader2, Bookmark, GripHorizontal, X, Volume2 } from 'lucide-react';
import { playPronunciation } from '../services/geminiService';

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
  readingTheme: 'light' | 'sepia' | 'dark';
  bookmarksEnabled: boolean;
  playbackSpeed: number;
}

// Helper interface for positioning
interface PopoverPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

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
  readingTheme,
  bookmarksEnabled,
  playbackSpeed
}) => {
  const [popoverPos, setPopoverPos] = useState<PopoverPosition | null>(null);
  
  // Track window width to ensure popover calculations are accurate on resize/rotation
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 0);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  
  // Dragging state
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const initialDragOffsetRef = useRef({ x: 0, y: 0 });
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const paragraphRefs = useRef<(HTMLParagraphElement | null)[]>([]);
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

  // Helper to update popover position state from a DOMRect range
  const updatePopoverPosition = useCallback((rangeRect: DOMRect) => {
    if (!containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    
    // We calculate position RELATIVE to the container.
    // This allows us to use position: absolute inside the container,
    // so the popover scrolls WITH the content naturally.
    setPopoverPos({
      top: rangeRect.top - containerRect.top,
      left: rangeRect.left - containerRect.left,
      width: rangeRect.width,
      height: rangeRect.height
    });
  }, []);

  // Ensure the popover is anchored to the current text selection (useful on mobile when tapping the translate button)
  useEffect(() => {
    if (popoverPos) return;
    if (!isTranslating && !currentDefinition) return;
    if (typeof window === 'undefined') return;

    const selection = window.getSelection();
    const containerEl = containerRef.current;
    if (
      !selection ||
      selection.isCollapsed ||
      selection.rangeCount === 0 ||
      !containerEl ||
      !selection.anchorNode ||
      !containerEl.contains(selection.anchorNode)
    ) {
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    updatePopoverPosition(rect);
  }, [isTranslating, currentDefinition, popoverPos, updatePopoverPosition]);

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

  // Helper to check if a character is part of a word (Latin, Cyrillic, Greek, etc.)
  const isWordChar = (char: string) => {
    return /[a-zA-Z0-9\-\u00C0-\u024F\u1E00-\u1EFF\u0400-\u04FF\u0370-\u03FF\uAC00-\uD7AF]/.test(char);
  };
  
  const handlePlayAudio = async (text: string, lang: any) => {
    if (isPlayingAudio) return;
    setIsPlayingAudio(true);
    try {
      await playPronunciation(text, lang, playbackSpeed);
    } catch (error) {
      console.error("Audio playback failed", error);
    } finally {
      setIsPlayingAudio(false);
    }
  };

  const handleMouseUp = useCallback(() => {
    // Handle DRAG selections (sentences/phrases) - Fallback logic for Desktop
    setTimeout(() => {
      const selection = window.getSelection();
      const selectedText = selection ? selection.toString().trim() : "";
      
      // If selection is collapsed (empty), it's a click, not a drag. Ignore it here.
      if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !selectedText) {
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      updatePopoverPosition(rect);

      // Mark that a selection action took place to prevent conflict with click
      isSelectingRef.current = true;
      setTimeout(() => { isSelectingRef.current = false; }, 500);
      
    }, 10);
  }, [updatePopoverPosition]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    // Check if we just processed a selection drag, if so, ignore this click
    if (isSelectingRef.current) return;
    if (!article) return;

    // If user has actively selected text (dragged), don't trigger single word lookup
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
      return;
    }

    // Stop native behavior
    e.preventDefault();

    // Use Caret Range to find word at coordinates
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
      setPopoverPos(null);
      onClearSelection();
      return;
    }

    const text = textNode.textContent || "";
    let clickedWord = "";
    let start = offset;
    let end = offset;

    // Strategy: Fallback Regex expansion to find word boundaries
    // Look backwards
    while (start > 0 && isWordChar(text[start - 1])) {
        start--;
    }
    
    // Look forwards
    while (end < text.length && isWordChar(text[end])) {
        end++;
    }
    clickedWord = text.substring(start, end).trim();

    // Filter out clicks on whitespace or purely punctuation
    if (!clickedWord || /^[\s\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,\-.\/:;<=>?@\[\]^`{|}~.。，、？；：‘“’”【】（）…—]+$/.test(clickedWord)) {
      setPopoverPos(null);
      onClearSelection();
      return;
    }

    // Get context container (Paragraph level)
    let containerEl = textNode.parentElement;
    const validContextTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE'];
    while (containerEl && !validContextTags.includes(containerEl.tagName)) {
      containerEl = containerEl.parentElement;
    }
    
    let context = "";

    if (containerEl) {
        // Use textContent for robust index mapping
        const fullText = containerEl.textContent || "";
        
        // Calculate global offset of the clicked textNode within the container
        const nodeOffset = getNodeOffset(textNode, containerEl);
        const globalStart = nodeOffset + start;
        const globalEnd = nodeOffset + end;
        
        // Find sentence boundaries based on period/terminators
        const terminators = ['.', '!', '?', '。', '？', '！', '\n'];
        
        let sStart = 0;
        let sEnd = fullText.length;
        
        // Scan backwards from globalStart to find the previous terminator
        for (let i = globalStart - 1; i >= 0; i--) {
            if (terminators.includes(fullText[i])) {
                sStart = i + 1;
                break;
            }
        }
        
        // Scan forwards from globalEnd to find the next terminator
        for (let i = globalEnd; i < fullText.length; i++) {
            if (terminators.includes(fullText[i])) {
                sEnd = i + 1; // Include the terminator
                break;
            }
        }
        
        context = fullText.substring(sStart, sEnd).trim();
    } else {
        // Fallback to just the text node content if no container found
        context = textNode.textContent || "";
    }

    // Create a temporary range to measure the word's position for the popover
    const measureRange = document.createRange();
    measureRange.setStart(textNode, start);
    measureRange.setEnd(textNode, end);
    const rect = measureRange.getBoundingClientRect();
    
    updatePopoverPosition(rect);
    onWordSelect(clickedWord, context, false);

  }, [onWordSelect, onClearSelection, article, updatePopoverPosition]);

  // --- Drag Handling Logic (Pointer Capture) ---
  const handlePointerDown = (e: React.PointerEvent) => {
    // Only allow left click for drag
    if (e.button !== 0) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Use Pointer Capture to ensure we keep receiving events even if cursor moves outside
    (e.target as Element).setPointerCapture(e.pointerId);

    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    initialDragOffsetRef.current = { ...dragOffset };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    
    e.preventDefault(); // Prevent scroll on touch
    e.stopPropagation();

    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    
    setDragOffset({
      x: initialDragOffsetRef.current.x + deltaX,
      y: initialDragOffsetRef.current.y + deltaY
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDraggingRef.current) {
        isDraggingRef.current = false;
        (e.target as Element).releasePointerCapture(e.pointerId);
    }
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
    if (!popoverPos || (!isTranslating && !currentDefinition)) return null;

    // Smart positioning logic
    const topSpace = popoverPos.top;
    const placeBelow = topSpace < 200;
    
    const isMobile = windowWidth < 768;
    const popoverWidth = isMobile ? 288 : 320; 
    
    // Center horizontally relative to word
    const wordCenterX = popoverPos.left + (popoverPos.width / 2);
    
    // Since we are inside the container, we just need to clamp to container width
    const containerWidth = containerRef.current ? containerRef.current.offsetWidth : windowWidth;
    const margin = 12;

    const minCenterX = (popoverWidth / 2) + margin;
    const maxCenterX = containerWidth - (popoverWidth / 2) - margin;
    const popoverCenterX = Math.max(minCenterX, Math.min(wordCenterX, maxCenterX));
    
    const arrowOffset = wordCenterX - popoverCenterX;
    const maxArrowOffset = (popoverWidth / 2) - 24; 
    const clampedArrowOffset = Math.max(-maxArrowOffset, Math.min(arrowOffset, maxArrowOffset));

    const popoverStyle: React.CSSProperties = {
      position: 'absolute', // Changed from fixed to absolute
      zIndex: 40, // Below header (50)
      left: `${popoverCenterX}px`,
      // Add a bit of space (12px) + height of word
      top: placeBelow ? `${popoverPos.top + popoverPos.height + 12}px` : `${popoverPos.top - 12}px`,
      transform: `translate(calc(-50% + ${dragOffset.x}px), calc(${placeBelow ? '0%' : '-100%'} + ${dragOffset.y}px))`,
      touchAction: 'none'
    };

    const arrowBaseClass = "absolute w-3 h-3 bg-white transform rotate-45 border-gray-200 left-1/2 -translate-x-1/2";
    const arrowClass = placeBelow 
      ? `${arrowBaseClass} top-[-6px] border-t border-l`
      : `${arrowBaseClass} bottom-[-6px] border-b border-r`;
      
    const arrowStyle: React.CSSProperties = {
        marginLeft: `${clampedArrowOffset}px`,
        opacity: (Math.abs(dragOffset.x) > 20 || Math.abs(dragOffset.y) > 20) ? 0 : 1,
        transition: 'opacity 0.2s'
    };

    const displayTranslation = currentDefinition?.translation;
    const displayDetailed = currentDefinition?.detailedExplanation;

    return (
        <div 
          style={popoverStyle}
          className="mb-2 lg:hidden"
        >
          <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-72 md:w-80 animate-in fade-in zoom-in duration-200 overflow-hidden flex flex-col max-h-[400px]">
            {/* Top Drag Handle Header */}
            <div 
              className="h-8 bg-gray-50 border-b border-gray-100 flex items-center justify-between px-2 shrink-0 select-none"
            >
              <div className="w-6" />
              <div 
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className="flex-1 flex items-center justify-center cursor-move h-full touch-none hover:bg-gray-100 transition-colors"
              >
                <GripHorizontal size={16} className="text-gray-300" />
              </div>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onClearSelection();
                  setPopoverPos(null);
                }}
                className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                title="Close"
              >
                <X size={16} />
              </button>
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
                    <button 
                      onClick={() => handlePlayAudio(currentDefinition.word, currentDefinition.sourceLanguage)}
                      disabled={isPlayingAudio}
                      className="text-gray-400 hover:text-danish-red transition-colors p-1 rounded-full hover:bg-red-50 disabled:opacity-50 flex-shrink-0 mt-1"
                      title="Listen"
                    >
                      {isPlayingAudio ? <Loader2 size={18} className="animate-spin" /> : <Volume2 size={18} />}
                    </button>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 mb-3 mt-1">
                    {currentDefinition.pronunciation && (
                      <span className="text-sm text-gray-500 italic font-serif">/{currentDefinition.pronunciation}/</span>
                    )}
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
            
            <div 
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
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
    <div className="relative" ref={containerRef}>
      <div 
        className={`max-w-3xl mx-auto rounded-xl shadow-sm border min-h-[600px] transition-colors duration-300 ${themeStyles.container}`}
        onClick={handleClick}
        onMouseUp={handleMouseUp}
        onTouchEnd={handleMouseUp}
        onDoubleClick={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Article Header */}
        <div className={`p-8 pb-4 border-b ${themeStyles.header}`}>
          <div className="flex justify-between items-start mb-4">
            <div className="flex gap-2">
               <span className="px-3 py-1 bg-gray-100/50 text-gray-600 text-xs font-bold uppercase tracking-wider rounded-full">
                {article.topic}
               </span>
               <span className="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-bold uppercase tracking-wider rounded-full">
                {article.language.toUpperCase()}
               </span>
            </div>
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