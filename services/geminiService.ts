import { GoogleGenAI, Type, Schema } from "@google/genai";
import { StyleProfile, StyleMetrics, ContentType, LocationSuggestion } from "../types";

const ANALYSIS_MODEL = "gemini-2.5-flash";

/**
 * Robust ID generator that works in all environments (even non-secure contexts)
 */
const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
};

/**
 * Analyzes a transcript to extract a style profile.
 */
export const analyzeTranscript = async (apiKey: string, transcript: string): Promise<StyleProfile> => {
  try {
    if (!apiKey) throw new Error("API Key is missing");
    const ai = new GoogleGenAI({ apiKey: apiKey });
    
    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        metrics: {
          type: Type.OBJECT,
          properties: {
            humor: { type: Type.NUMBER, description: "Level of humor 0-100" },
            logic: { type: Type.NUMBER, description: "Level of logical reasoning 0-100" },
            emotion: { type: Type.NUMBER, description: "Level of emotional appeal 0-100" },
            complexity: { type: Type.NUMBER, description: "Vocabulary complexity 0-100" },
            pacing: { type: Type.NUMBER, description: "Perceived speed/energy 0-100" },
            informality: { type: Type.NUMBER, description: "Casualness 0-100" },
          },
          required: ["humor", "logic", "emotion", "complexity", "pacing", "informality"],
        },
        signaturePhrases: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "5-10 unique phrases, catchphrases, or verbal tics used strictly by this speaker.",
        },
        toneDescription: {
          type: Type.STRING,
          description: "EXTREMELY DETAILED forensic linguistic analysis of the tone. Include nuances, rhetorical devices, shifting attitudes, and specific quirks. Do not be vague.",
        },
        structurePattern: {
          type: Type.STRING,
          description: "EXTREMELY DETAILED analysis of how they construct narratives. How do they open? How do they transition? How do they close? Do they loop back? Be technical.",
        },
        typicalSectionLength: {
          type: Type.NUMBER,
          description: "Calculate the average number of words the speaker uses to cover a single sub-topic or location before moving to the next. Approx integer.",
        },
        name: {
          type: Type.STRING,
          description: "A creative name for this style persona (e.g., 'The Tech Skeptic').",
        },
        description: {
          type: Type.STRING,
          description: "Short tagline for the persona.",
        },
      },
      required: ["metrics", "signaturePhrases", "toneDescription", "structurePattern", "typicalSectionLength", "name", "description"],
    };

    const response = await ai.models.generateContent({
      model: ANALYSIS_MODEL,
      contents: `You are a Forensic Computational Linguist. Your task is to extract a "Digital Clone" of the speaker's writing style.
      
      Ignore the specific topic (what they say).
      Focus entirely on the FORM (how they say it).

      Analyze the provided transcripts to populate the schema. 
      
      CRITICAL INSTRUCTION FOR TONE & STRUCTURE:
      - Do not write generic summaries like "They are funny."
      - Write deep, forensic observations like: "Uses short staccato sentences to build tension, then releases it with a self-deprecating joke. Often starts paragraphs with conjunctions (But, And, So)."
      - Keep as much detail as possible.

      CRITICAL INSTRUCTION FOR LENGTH:
      - Estimate the 'Word Count Density'. When describing a specific thing (like a hotel, a phone feature, or a news event), how many words do they typically spend on it?

      Transcript:
      """
      ${transcript.substring(0, 50000)}
      """`, 
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0, // CRITICAL: Ensure deterministic results
      },
    });

    if (!response.text) {
      throw new Error("No response text from Gemini API. Check quota or network.");
    }

    // Clean up Potential Markdown formatting (```json ... ```)
    let cleanedText = response.text.trim();
    if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.replace(/^```(json)?\n?/, "").replace(/\n?```$/, "");
    }

    const data = JSON.parse(cleanedText);
    
    return {
      id: generateId(), // Manual ID generation
      contentType: 'general', // Default folder
      ...data
    };
  } catch (error: any) {
    console.error("Analysis Error:", error);
    throw new Error(error.message || "Unknown analysis error");
  }
};

/**
 * Suggests travel locations using Google Search grounding.
 */
export const suggestTravelLocations = async (
  apiKey: string,
  topic: string, 
  profile: StyleProfile, 
  count: number,
  excludeNames: string[] = []
): Promise<LocationSuggestion[]> => {
  if (!apiKey) throw new Error("API Key is missing");
  const ai = new GoogleGenAI({ apiKey: apiKey });
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `
      Topic: ${topic}
      Persona Context: ${profile.name} (${profile.description})
      
      Task: suggest exactly ${count} unique, real-world locations that fit the topic and would appeal to this persona.
      Critically important: Do NOT include these locations: ${excludeNames.join(", ")}.
      
      Use Google Search to ensure these places exist, are currently open, and are highly rated by travelers.
      For each location, provide a name and a very brief reason why it's interesting.

      OUTPUT FORMAT:
      You must return the result as a valid JSON object with the following structure:
      {
        "locations": [
          {
            "name": "Name of the location",
            "description": "1 sentence description"
          }
        ]
      }
      Do not include any other text outside the JSON.
    `,
    config: {
      tools: [{ googleSearch: {} }],
    }
  });

  if (!response.text) throw new Error("Failed to fetch locations");

  // Clean up Potential Markdown formatting (```json ... ```)
  let cleanedText = response.text.trim();
  if (cleanedText.startsWith("```")) {
    cleanedText = cleanedText.replace(/^```(json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const data = JSON.parse(cleanedText);
    return data.locations.map((loc: any) => ({
      id: generateId(), // Manual ID generation
      name: loc.name,
      description: loc.description,
      isSelected: false
    }));
  } catch (e) {
    console.error("JSON Parse Error:", e);
    console.log("Raw Text:", response.text);
    throw new Error("Failed to parse location suggestions.");
  }
};

const CONTENT_TYPE_INSTRUCTIONS: Record<ContentType, string> = {
  general: "Structure the script in a standard conversational format relevant to the topic.",
  travel: "Structure: Travel Vlog/Guide. Use the Location Name as a Header for each section. Focus on sensory details (sights, sounds, smells), immersion, and practical advice. Use a 'Journey' arc: Hook -> Arrival/Impression -> Activity/Food -> Practical Tip -> Outro.",
  news: "Structure: News Report. Use the 'Inverted Pyramid' style. Start with the most critical facts (Who, what, where, when). Maintain a sense of urgency but objectivity, even if the persona is informal. Use clear transitions between segments.",
  tech: "Structure: Product/Tech Review. Start with the verdict or hook. Break down into: Design, Specs, Real-world Usage, Pros/Cons, and Final Recommendation.",
  story: "Structure: Narrative Storytelling. Focus on character arch, conflict, and resolution. Use strong imagery and pacing.",
  educational: "Structure: Tutorial/Educational. Step-by-step logic. Clear introduction of what will be learned, followed by the 'How-to', and a summary recap."
};

/**
 * Generates a new script based on a specific style profile.
 */
export const generateScript = async (
  apiKey: string,
  topic: string, 
  profile: StyleProfile, 
  contentType: ContentType = 'general',
  selectedLocations: LocationSuggestion[] = [],
  targetLength: number = 250
): Promise<string> => {
  if (!apiKey) throw new Error("API Key is missing");
  const ai = new GoogleGenAI({ apiKey: apiKey });
  const formatInstruction = CONTENT_TYPE_INSTRUCTIONS[contentType];
  
  let contentSpecificPrompt = `TASK: Write a script for the topic: "${topic}"`;
  
  if (contentType === 'travel' && selectedLocations.length > 0) {
    const locs = selectedLocations.map(l => `- ${l.name}: ${l.description}`).join('\n');
    contentSpecificPrompt = `
      TASK: Write a Travel Vlog script about "${topic}".
      CRITICAL: You MUST cover the following locations in the script, weaving them together into a coherent journey:
      ${locs}
      
      Do not invent new locations. Focus on these specific spots.
      
      FORMATTING RULE:
      - Use the specific Name of the Location as the Header (Markdown ##) for that section. 
      - Example:
        ## Eifel Tower
        [Content...]
        
        ## Louvre Museum
        [Content...]

      VOLUME CONSTRAINT: For EACH location listed above, you MUST write between ${targetLength} and ${targetLength + 50} words.
      This is a strict requirement. Provide deep, immersive details for every single spot to hit this word count range.
    `;
  } else {
    // For general content, targetLength applies to the WHOLE script
    contentSpecificPrompt += `\nVOLUME CONSTRAINT: The TOTAL script length should be approximately ${targetLength} words. 
    Adjust the depth of each section to meet this total volume requirement while maintaining the author's pacing.`;
  }

  const systemPrompt = `
    You are a professional scriptwriter capable of perfect mimicry. 
    You must adopt the following persona strictly:
    
    NAME: ${profile.name}
    
    FORENSIC TONE ANALYSIS (You must act this out): 
    ${profile.toneDescription}
    
    STRUCTURAL DNA (You must build sentences like this): 
    ${profile.structurePattern}
    
    METRICS (0-100):
    - Humor: ${profile.metrics.humor}
    - Logic: ${profile.metrics.logic}
    - Emotion: ${profile.metrics.emotion}
    - Complexity: ${profile.metrics.complexity}
    - Pacing: ${profile.metrics.pacing}
    - Informality: ${profile.metrics.informality}
    
    SIGNATURE PHRASES (Use sparingly but effectively):
    ${profile.signaturePhrases.join(", ")}
    
    ${contentSpecificPrompt}
    
    FORMAT REQUIREMENT (${contentType.toUpperCase()}):
    ${formatInstruction}

    INSTRUCTIONS:
    1. Adopt the persona's voice (metrics, tone, structure) completely.
    2. Do NOT mention that you are an AI or that you are mimicking someone.
    3. Output ONLY the script content (Markdown formatted).
    4. Ensure the output length matches the constraints provided.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: systemPrompt,
    config: {
      maxOutputTokens: 30000, // Increased to support long-form content (5k+ words)
      thinkingConfig: { thinkingBudget: 4096 }
    }
  });

  return response.text || "Failed to generate script.";
};