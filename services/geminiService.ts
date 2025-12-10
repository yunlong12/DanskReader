import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Article, WordDefinition, LanguageCode, SUPPORTED_LANGUAGES } from "../types";

// Ensure API key is available
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const detectLanguage = async (text: string): Promise<{ code: LanguageCode | null; name: string; isSupported: boolean }> => {
  if (!text || text.trim().length === 0) {
    return { code: null, name: "Unknown", isSupported: false };
  }

  // Sample the text to save tokens/latency
  const snippet = text.substring(0, 500).replace(/\s+/g, ' ');

  try {
    const prompt = `Identify the language of the following text sample: "${snippet}". 
    Return a JSON object with:
    - 'code': The 2-letter ISO 639-1 language code (e.g., 'en', 'fr', 'es', 'de', 'ja', 'ko'). For Chinese, use 'zh'.
    - 'name': The English name of the language.
    `;

    const detectionSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        code: { type: Type.STRING },
        name: { type: Type.STRING }
      },
      required: ["code", "name"],
    };

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: detectionSchema,
        temperature: 0.1,
      },
    });

    const result = JSON.parse(response.text || "{}");
    let code = result.code?.toLowerCase() || "";
    const name = result.name || "Unknown";

    // Normalize codes
    if (code.startsWith('zh')) code = 'zh';

    // Check support
    const supportedLang = SUPPORTED_LANGUAGES.find(l => l.code === code);

    return {
      code: supportedLang ? supportedLang.code : null,
      name: name,
      isSupported: !!supportedLang
    };

  } catch (error) {
    console.error("Language detection failed:", error);
    // Fallback default
    return { code: null, name: "Unknown", isSupported: false };
  }
};

export const transcribeImage = async (base64Image: string, mimeType: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Image
          }
        },
        {
          text: `Transcribe the text contained in this image exactly as it appears. Do not add any introductory text, translation, or markdown formatting (like \`\`\`). Just return the raw text. If there are headers, keep them on separate lines.`
        }
      ]
    });

    return response.text || "";
  } catch (error) {
    console.error("Error transcribing image:", error);
    throw error;
  }
};

// Helper to fetch from Google Translate (Unofficial)
const fetchGoogleTranslation = async (text: string, sourceLang: string, targetLang: string): Promise<string> => {
  // Map our language codes to Google Translate codes if necessary (zh -> zh-CN is standard)
  const sl = sourceLang === 'zh' ? 'zh-CN' : sourceLang;
  const tl = targetLang === 'zh' ? 'zh-CN' : targetLang;

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Translate API failed: ${response.statusText}`);
  }
  const data = await response.json();
  // The structure is typically [[["Translation", "Original", null, null, 1]], ...]
  // We want the first part of the first sentence
  return data?.[0]?.[0]?.[0] || "";
};

export const translateWordInContext = async (
  textToTranslate: string, 
  contextSentence: string, 
  sourceLang: LanguageCode,
  targetLang: LanguageCode,
  requestDetailed: boolean = false
): Promise<WordDefinition> => {
  
  const sourceLangName = SUPPORTED_LANGUAGES.find(l => l.code === sourceLang)?.name || sourceLang;
  const targetLangName = SUPPORTED_LANGUAGES.find(l => l.code === targetLang)?.name || targetLang;

  // HYBRID STRATEGY:
  // If detailed explanation is NOT requested, try to use Google Translate first (Free, 0 tokens).
  // If that fails (e.g. network/CORS), or if detailed explanation IS requested, use Gemini.
  if (!requestDetailed) {
    try {
      const translationResult = await fetchGoogleTranslation(textToTranslate, sourceLang, targetLang);
      
      return {
        word: textToTranslate,
        contextParams: contextSentence,
        pronunciation: "", // GT simple endpoint doesn't return IPA easily
        partOfSpeech: "Text", // Generic fallback
        translation: translationResult,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang
      };
    } catch (error) {
      console.warn("Google Translate failed, falling back to Gemini", error);
      // Fallback to Gemini below
    }
  }

  try {
    const isPhrase = textToTranslate.trim().includes(' ');
    
    const basePrompt = isPhrase 
        ? `Translate the ${sourceLangName} text "${textToTranslate}"`
        : `Translate the ${sourceLangName} word "${textToTranslate}"`;

    let instructions = `${basePrompt} to ${targetLangName}.`;
    
    // Explicitly instruct to act like Google Translate for the main fields, but allow detail in the explanation field
    instructions += ` You are a translator tool. For the 'translation' field, act like Google Translate: direct and standard. For the 'detailedExplanation' field, act like a language tutor: explain nuances, usage, and synonyms, but keep it concise (approx. 30-50 words).`;
    
    const contextInstruction = `The text appears in this context: "${contextSentence}". Provide the most appropriate meaning for this specific context.`;
    
    const prompt = `${instructions} ${contextInstruction}`;

    // Dynamically build schema based on requested language
    const schemaProperties: any = {
      pronunciation: { type: Type.STRING, description: "IPA pronunciation or phonetic transcription." },
      partOfSpeech: { type: Type.STRING, description: "Grammatical type (noun, verb, etc) or 'Sentence'/'Phrase'." },
      translation: { type: Type.STRING, description: `The definition/translation in ${targetLangName}. Direct translation only.` },
      detailedExplanation: { type: Type.STRING, description: `A concise explanation (max 50 words) of the meaning, nuances, synonyms, and grammatical usage notes in ${targetLangName}.` }
    };

    const translationSchema: Schema = {
      type: Type.OBJECT,
      properties: schemaProperties,
      required: ["pronunciation", "partOfSpeech", "translation", "detailedExplanation"],
    };

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: translationSchema,
        temperature: 0.1, // Low temperature for consistent translations
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    const json = JSON.parse(text);

    return {
      word: textToTranslate,
      contextParams: contextSentence,
      translation: json.translation,
      pronunciation: json.pronunciation,
      partOfSpeech: json.partOfSpeech,
      detailedExplanation: json.detailedExplanation,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang
    };
  } catch (error) {
    console.error("Error translating word:", error);
    throw error;
  }
};

// --- Audio Management Globals ---
let currentAudio: HTMLAudioElement | null = null;
let currentResolve: (() => void) | null = null;

export const stopAudio = () => {
  // 1. Stop HTML Audio element if playing
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = ""; // Detach source to force stop buffering
    currentAudio = null;
  }
  
  // 2. Resolve any pending audio promise to unblock loops/awaiters
  if (currentResolve) {
    currentResolve();
    currentResolve = null;
  }
};

export const playPronunciation = async (text: string, languageCode: LanguageCode, speed: number = 1.0): Promise<void> => {
  // Ensure any previous audio is stopped before starting new one
  stopAudio();

  const langConfig = SUPPORTED_LANGUAGES.find(l => l.code === languageCode);
  const voiceCode = langConfig?.voice || 'en-US';
  const googleTlCode = voiceCode.split('-')[0]; // simple code for Google TTS (e.g. 'fr' from 'fr-FR')

  return new Promise((resolve, reject) => {
    // Capture the resolve function so we can force-resolve it if stopAudio is called externally
    currentResolve = resolve;

    // Google Translate TTS GET request fails if the URL is too long. 
    // Truncate to safe limit (approx 200 chars) for playback.
    const safeText = text.length > 200 ? text.substring(0, 200) : text;
    const encodedText = encodeURIComponent(safeText);
    
    // Using client=gtx is generally more reliable for external access than tw-ob
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=gtx&q=${encodedText}&tl=${googleTlCode}`;
    
    // Create audio element explicitly to set referrer policy
    // This is crucial for avoiding 403 Forbidden errors on deployed sites
    const audio = document.createElement('audio');
    audio.setAttribute('referrerpolicy', 'no-referrer');
    audio.src = url;
    audio.playbackRate = speed;
    
    currentAudio = audio; // Track this audio instance
    
    let hasResolved = false;

    // Helper to cleanup and resolve
    const finalize = () => {
        if (!hasResolved) {
            hasResolved = true;
            if (currentResolve === resolve) currentResolve = null;
            if (currentAudio === audio) currentAudio = null;
            resolve();
        }
    };

    audio.onended = finalize;

    audio.onerror = (e) => {
      if (!hasResolved) {
         hasResolved = true;
         if (currentResolve === resolve) currentResolve = null;
         if (currentAudio === audio) currentAudio = null;
         console.error("Google TTS failed", e);
         reject(new Error("Audio playback failed"));
      }
    };

    audio.play().catch(error => {
      console.warn("Audio play failed", error);
      if (!hasResolved) {
        hasResolved = true;
        if (currentResolve === resolve) currentResolve = null;
        if (currentAudio === audio) currentAudio = null;
        reject(error);
      }
    });
  });
};
