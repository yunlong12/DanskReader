import React, { useState } from 'react';
import { WordDefinition, SUPPORTED_LANGUAGES } from '../types';
import { BookMarked, Volume2, Loader2 } from 'lucide-react';
import { playPronunciation } from '../services/geminiService';

interface HistorySidebarProps {
  currentDefinition: WordDefinition | null;
  isLoading: boolean;
  playbackSpeed: number;
}

const HistorySidebar: React.FC<HistorySidebarProps> = ({ currentDefinition, isLoading, playbackSpeed }) => {
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlayAudio = async () => {
    if (!currentDefinition || isPlaying) return;
    
    setIsPlaying(true);
    try {
      await playPronunciation(currentDefinition.word, currentDefinition.sourceLanguage, playbackSpeed);
    } catch (error) {
      console.error("Failed to play audio", error);
    } finally {
      setIsPlaying(false);
    }
  };

  // Helper to get flag from language code
  const getFlag = (code: string) => SUPPORTED_LANGUAGES.find(l => l.code === code)?.flag || code;
  
  return (
    <div className="w-full lg:w-96 bg-gray-50 border-l border-gray-200 flex flex-col h-full shadow-lg lg:shadow-none">
      
      {/* Current Selection Panel */}
      <div className="p-6 bg-white shadow-sm z-10 border-b border-gray-200 flex-1 overflow-y-auto custom-scrollbar">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <BookMarked size={16} />
          Current Lookup
        </h2>
        
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-6 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-20 bg-gray-100 rounded w-full mt-4"></div>
          </div>
        ) : currentDefinition ? (
          <div>
            <div className="flex items-start justify-between mb-1 gap-2">
              <div className="flex items-start gap-3 flex-1">
                <h3 className={`font-bold text-danish-red leading-tight break-words ${currentDefinition.word.length > 25 ? 'text-lg' : 'text-2xl'}`}>
                  {currentDefinition.word}
                </h3>
              </div>
              <button 
                  onClick={handlePlayAudio}
                  disabled={isPlaying}
                  className="text-gray-400 hover:text-danish-red transition-colors p-1 rounded-full hover:bg-red-50 disabled:opacity-50 flex-shrink-0 mt-1"
                  title={`Listen to pronunciation (${playbackSpeed}x)`}
                >
                  {isPlaying ? <Loader2 size={20} className="animate-spin" /> : <Volume2 size={20} />}
              </button>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 mb-3 mt-1">
              <span className="text-sm text-gray-500 italic font-serif">/{currentDefinition.pronunciation}/</span>
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-md font-medium">
                {currentDefinition.partOfSpeech}
              </span>
              <span className="px-2 py-0.5 bg-gray-50 text-gray-400 text-xs rounded-md border border-gray-100">
                {getFlag(currentDefinition.sourceLanguage)} → {getFlag(currentDefinition.targetLanguage)}
              </span>
            </div>

            <div className="mb-4 space-y-2">
              <div className="flex items-start gap-2">
                <p className="text-lg font-medium text-gray-900 leading-snug">{currentDefinition.translation}</p>
              </div>
              
              {currentDefinition.detailedExplanation && (
                <div className="pt-3 mt-2 border-t border-gray-100">
                    <p className="text-xs font-bold text-purple-500 uppercase tracking-wider mb-1">Explanation</p>
                    <p className="text-sm text-gray-600 leading-relaxed bg-purple-50 p-2 rounded-md border border-purple-100">
                        {currentDefinition.detailedExplanation}
                    </p>
                </div>
              )}
            </div>

            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
              <p className="text-xs text-gray-400 font-bold uppercase mb-1">Context</p>
              <p className="text-sm text-gray-700 italic">"{currentDefinition.contextParams}"</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400 text-sm italic">
            Double-click a word or select a sentence<br/>to see its translation here.
          </div>
        )}
      </div>
    </div>
  );
};

export default HistorySidebar;