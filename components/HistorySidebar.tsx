import React, { useState } from 'react';
import { HistoryItem, WordDefinition } from '../types';
import { BookMarked, Volume2, Loader2 } from 'lucide-react';
import { playPronunciation } from '../services/geminiService';

interface HistorySidebarProps {
  currentDefinition: WordDefinition | null;
  history: HistoryItem[];
  isLoading: boolean;
}

const HistorySidebar: React.FC<HistorySidebarProps> = ({ currentDefinition, history, isLoading }) => {
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlayAudio = async () => {
    if (!currentDefinition || isPlaying) return;
    
    setIsPlaying(true);
    try {
      await playPronunciation(currentDefinition.word);
    } catch (error) {
      console.error("Failed to play audio", error);
    } finally {
      setIsPlaying(false);
    }
  };
  
  return (
    <div className="w-full lg:w-96 bg-gray-50 border-l border-gray-200 flex flex-col h-full">
      
      {/* Current Selection Panel */}
      <div className="p-6 bg-white shadow-sm z-10 border-b border-gray-200">
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
                  title="Listen to pronunciation"
                >
                  {isPlaying ? <Loader2 size={20} className="animate-spin" /> : <Volume2 size={20} />}
              </button>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 mb-3 mt-1">
              <span className="text-sm text-gray-500 italic font-serif">/{currentDefinition.pronunciation}/</span>
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-md font-medium">
                {currentDefinition.partOfSpeech}
              </span>
            </div>

            <div className="mb-4">
              <p className="text-lg font-medium text-gray-900 leading-snug">{currentDefinition.translation}</p>
            </div>

            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
              <p className="text-xs text-gray-400 font-bold uppercase mb-1">Example</p>
              <p className="text-sm text-gray-700 italic">"{currentDefinition.exampleSentence}"</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400 text-sm italic">
            Double-click a word or select a sentence<br/>to see its translation here.
          </div>
        )}
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-2">Recent Vocabulary</h3>
        
        {history.length === 0 ? (
          <p className="text-sm text-gray-400 px-2 italic">No vocabulary yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map((item) => (
              <div key={item.id} className="bg-white p-3 rounded-lg border border-gray-200 hover:border-danish-red/30 transition-colors group">
                <div className="flex justify-between items-start">
                  <div className="w-full">
                    <div className="flex justify-between w-full mb-1">
                      <span className="font-bold text-gray-800 line-clamp-1 mr-2">{item.word}</span>
                      <span className="text-xs text-gray-400 whitespace-nowrap">{new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <div className="text-gray-600 text-sm line-clamp-2">{item.translation}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HistorySidebar;