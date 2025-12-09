export interface Article {
  id: string;
  title: string;
  content: string; // Markdown or plain text paragraphs
  topic: string;
  bookmarkParagraphIndex?: number;
}

export interface WordDefinition {
  word: string;
  translation?: string;
  chineseTranslation?: string;
  pronunciation: string;
  partOfSpeech: string;
  contextParams: string;
  exampleSentence?: string;
  detailedExplanation?: string;
  detailedChineseExplanation?: string;
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