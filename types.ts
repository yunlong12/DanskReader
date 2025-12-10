export type LanguageCode = 'en' | 'da' | 'zh' | 'es' | 'fr' | 'de' | 'ja' | 'ko';

export interface Language {
  code: LanguageCode;
  name: string;
  flag: string;
  voice: string;
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'en', name: 'English', flag: '🇬🇧', voice: 'en-US' },
  { code: 'zh', name: 'Mandarin', flag: '🇨🇳', voice: 'zh-CN' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸', voice: 'es-ES' },
  { code: 'fr', name: 'French', flag: '🇫🇷', voice: 'fr-FR' },
  { code: 'de', name: 'German', flag: '🇩🇪', voice: 'de-DE' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵', voice: 'ja-JP' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷', voice: 'ko-KR' },
  { code: 'da', name: 'Danish', flag: '🇩🇰', voice: 'da-DK' },
];

export interface Article {
  id: string;
  title: string;
  content: string; // Markdown or plain text paragraphs
  topic: string;
  language: LanguageCode;
  bookmarkParagraphIndex?: number;
}

export interface WordDefinition {
  word: string;
  translation: string;
  pronunciation: string;
  partOfSpeech: string;
  contextParams: string;
  exampleSentence?: string;
  detailedExplanation?: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
}

export interface HistoryItem extends WordDefinition {
  id: string;
  timestamp: number;
}

export enum LoadingState {
  IDLE = 'IDLE',
  GENERATING_ARTICLE = 'GENERATING_ARTICLE',
  TRANSLATING = 'TRANSLATING',
  ERROR = 'ERROR'
}