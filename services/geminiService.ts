import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Article, WordDefinition } from "../types";

// Ensure API key is available
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const articleSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING, description: "The headline of the news article in Danish." },
    body: { type: Type.STRING, description: "The full body text of the article in Danish. Formatted with paragraph breaks." },
  },
  required: ["headline", "body"],
};

export const generateArticle = async (topic: string): Promise<Article> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: `Write a short, engaging news article in Danish about "${topic}". 
      It should be suitable for an intermediate language learner (B1/B2 level). 
      Keep it around 200-300 words.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: articleSchema,
        temperature: 0.7,
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    const json = JSON.parse(text);
    
    return {
      id: crypto.randomUUID(),
      title: json.headline,
      content: json.body,
      topic: topic,
    };
  } catch (error) {
    console.error("Error generating article:", error);
    throw error;
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
          text: "Transcribe the text contained in this image exactly as it appears. The text is in Danish. Do not add any introductory text, translation, or markdown formatting (like ```). Just return the raw Danish text. If there are headers, keep them on separate lines."
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
const fetchGoogleTranslation = async (text: string, targetLang: string): Promise<string> => {
  // Using client=gtx endpoint
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=da&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
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
  targetLang: 'en' | 'zh' = 'en',
  requestDetailed: boolean = false
): Promise<WordDefinition> => {
  
  // HYBRID STRATEGY:
  // If detailed explanation is NOT requested, try to use Google Translate first (Free, 0 tokens).
  // If that fails (e.g. network/CORS), or if detailed explanation IS requested, use Gemini.
  if (!requestDetailed) {
    try {
      const googleLangCode = targetLang === 'zh' ? 'zh-CN' : 'en';
      const translationResult = await fetchGoogleTranslation(textToTranslate, googleLangCode);
      
      const result: WordDefinition = {
        word: textToTranslate,
        contextParams: contextSentence,
        pronunciation: "", // GT simple endpoint doesn't return IPA easily
        partOfSpeech: "Text", // Generic fallback
        // No detailed explanations
      };

      if (targetLang === 'zh') {
        result.chineseTranslation = translationResult;
      } else {
        result.translation = translationResult;
      }

      return result;
    } catch (error) {
      console.warn("Google Translate failed, falling back to Gemini", error);
      // Fallback to Gemini below
    }
  }

  try {
    const isPhrase = textToTranslate.trim().includes(' ');
    
    const basePrompt = isPhrase 
        ? `Translate the Danish text "${textToTranslate}"`
        : `Translate the Danish word "${textToTranslate}"`;

    let instructions = basePrompt;
    if (targetLang === 'zh') {
        instructions += ` Provide the Simplified Chinese translation.`;
    } else {
        instructions += ` Provide the English translation.`;
    }
    
    // Explicitly instruct to act like Google Translate for the main fields, but allow detail in the explanation field
    instructions += ` You are a translator tool. For the 'translation' field, act like Google Translate: direct and standard. For the 'detailedExplanation' field, act like a language tutor: explain nuances, usage, and synonyms.`;
    
    const contextInstruction = `The text appears in this context: "${contextSentence}". Provide the most appropriate meaning for this specific context.`;
    
    const prompt = `${instructions} ${contextInstruction}`;

    // Dynamically build schema based on requested language
    const schemaProperties: any = {
      pronunciation: { type: Type.STRING, description: "IPA pronunciation or phonetic transcription." },
      partOfSpeech: { type: Type.STRING, description: "Grammatical type (noun, verb, etc) or 'Sentence'/'Phrase'." },
    };

    const requiredFields = ["pronunciation", "partOfSpeech"];

    if (targetLang === 'zh') {
       schemaProperties.chineseTranslation = { type: Type.STRING, description: "The definition/translation in Simplified Chinese. MUST be in Chinese. Direct translation only." };
       schemaProperties.detailedChineseExplanation = { type: Type.STRING, description: "A detailed explanation of the meaning, nuances, synonyms, and grammatical usage notes in Simplified Chinese." };
       requiredFields.push("chineseTranslation");
       requiredFields.push("detailedChineseExplanation");
    } else {
       schemaProperties.translation = { type: Type.STRING, description: "The definition/translation in English. MUST be in English. Direct translation only." };
       schemaProperties.detailedExplanation = { type: Type.STRING, description: "A detailed explanation of the meaning, nuances, synonyms, and grammatical usage notes in English." };
       requiredFields.push("translation");
       requiredFields.push("detailedExplanation");
    }

    const translationSchema: Schema = {
      type: Type.OBJECT,
      properties: schemaProperties,
      required: requiredFields,
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
      chineseTranslation: json.chineseTranslation,
      pronunciation: json.pronunciation,
      partOfSpeech: json.partOfSpeech,
      detailedExplanation: json.detailedExplanation,
      detailedChineseExplanation: json.detailedChineseExplanation,
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
  
  // 2. Stop Web Speech API if speaking
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  // 3. Resolve any pending audio promise to unblock loops/awaiters
  if (currentResolve) {
    currentResolve();
    currentResolve = null;
  }
};

export const playPronunciation = async (text: string, speed: number = 1.0): Promise<void> => {
  // Ensure any previous audio is stopped before starting new one
  stopAudio();

  return new Promise((resolve, reject) => {
    // Capture the resolve function so we can force-resolve it if stopAudio is called externally
    currentResolve = resolve;

    // Google Translate TTS GET request fails if the URL is too long. 
    // Truncate to safe limit (approx 200 chars) for playback.
    const safeText = text.length > 200 ? text.substring(0, 200) : text;
    const encodedText = encodeURIComponent(safeText);
    
    // Using client=gtx is generally more reliable for external access than tw-ob
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=gtx&q=${encodedText}&tl=da`;
    
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
        // Fallback to Web Speech API (Browser Native)
        if ('speechSynthesis' in window) {
           const utterance = new SpeechSynthesisUtterance(safeText);
           utterance.lang = 'da-DK';
           utterance.rate = speed;
           
           // Attempt to find a Danish voice for better quality
           const voices = window.speechSynthesis.getVoices();
           const danishVoice = voices.find(v => v.lang.toLowerCase().includes('da'));
           if (danishVoice) {
             utterance.voice = danishVoice;
           }

           utterance.onend = finalize;
           utterance.onerror = (err) => {
             console.error("Web Speech API failed", err);
             // Even if it fails, we resolve or reject. Here we reject if both fail.
             if (!hasResolved) {
                hasResolved = true;
                if (currentResolve === resolve) currentResolve = null;
                reject(err);
             }
           };
           
           // Note: window.speechSynthesis.speak() queues utterances. 
           // stopAudio() calls cancel() which clears the queue.
           window.speechSynthesis.speak(utterance);
        } else {
           if (!hasResolved) {
               hasResolved = true;
               if (currentResolve === resolve) currentResolve = null;
               reject(new Error("No TTS available"));
           }
        }
      }
    };

    audio.play().catch(error => {
      // If play() fails (e.g. autoplay policy), trigger error handler to try fallback
      console.warn("Audio play failed, attempting fallback", error);
      if (!hasResolved) {
        // Dispatch error manually to trigger fallback logic
        audio.dispatchEvent(new Event('error'));
      }
    });
  });
};