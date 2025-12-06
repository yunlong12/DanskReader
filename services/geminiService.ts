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

const translationSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    translation: { type: Type.STRING, description: "The English translation of the target word or sentence." },
    pronunciation: { type: Type.STRING, description: "IPA pronunciation or phonetic transcription." },
    partOfSpeech: { type: Type.STRING, description: "Grammatical type (noun, verb, etc) or 'Sentence'/'Phrase'." },
    exampleSentence: { type: Type.STRING, description: "A simple example sentence in Danish using the word. If the input is already a sentence, return the input itself." },
  },
  required: ["translation", "pronunciation", "partOfSpeech", "exampleSentence"],
};

export const generateArticle = async (topic: string): Promise<Article> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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

export const translateWordInContext = async (textToTranslate: string, contextSentence: string): Promise<WordDefinition> => {
  try {
    const isPhrase = textToTranslate.trim().includes(' ');
    
    const prompt = isPhrase 
        ? `Translate the Danish text "${textToTranslate}" into English. The text appears in this context: "${contextSentence}".`
        : `Translate the Danish word "${textToTranslate}" into English. The word appears in this context: "${contextSentence}". Provide the most appropriate meaning for this specific context.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: translationSchema,
        temperature: 0.3, // Lower temperature for more deterministic/accurate translations
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
      exampleSentence: json.exampleSentence,
    };
  } catch (error) {
    console.error("Error translating word:", error);
    throw error;
  }
};

export const playPronunciation = async (text: string): Promise<void> => {
  return new Promise((resolve, reject) => {
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
    
    let hasResolved = false;

    audio.onended = () => {
      if (!hasResolved) {
        hasResolved = true;
        resolve();
      }
    };

    audio.onerror = (e) => {
      if (!hasResolved) {
        hasResolved = true;
        console.warn("Google TTS failed (likely blocked), falling back to Web Speech API");
        
        // Fallback to Web Speech API (Browser Native)
        if ('speechSynthesis' in window) {
           const utterance = new SpeechSynthesisUtterance(safeText);
           utterance.lang = 'da-DK';
           
           // Attempt to find a Danish voice for better quality
           const voices = window.speechSynthesis.getVoices();
           const danishVoice = voices.find(v => v.lang.toLowerCase().includes('da'));
           if (danishVoice) {
             utterance.voice = danishVoice;
           }

           utterance.onend = () => resolve();
           utterance.onerror = (err) => {
             console.error("Web Speech API failed", err);
             reject(err);
           };
           
           // Cancel any pending speech to avoid queuing
           window.speechSynthesis.cancel();
           window.speechSynthesis.speak(utterance);
        } else {
           reject(new Error("No TTS available"));
        }
      }
    };

    audio.play().catch(error => {
      // If play() fails (e.g. autoplay policy), trigger error handler to try fallback
      console.warn("Audio play failed, attempting fallback", error);
      audio.dispatchEvent(new Event('error'));
    });
  });
};