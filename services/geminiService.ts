
import { GoogleGenAI, Type } from "@google/genai";
import { StyleProfile, StyleMetrics, ContentType, LocationSuggestion, WritingStructure } from "../types";

const ANALYSIS_MODEL = "gemini-2.5-flash";

/**
 * HELPER: Initialize AI client with a specific key
 * Uses Vite environment variables if available, falls back to process.env
 */
const getAiClient = (apiKey: string) => {
  return new GoogleGenAI({ apiKey });
};

/**
 * EXECUTE WITH KEY ROTATION
 * Wraps AI calls to automatically switch keys if one hits a rate limit (429).
 * Reports status back via callback.
 */
const executeWithKeyRotation = async <T>(
  apiKeys: string[], 
  operation: (ai: GoogleGenAI) => Promise<T>,
  onStatusUpdate?: (key: string, status: 'active' | 'expired') => void
): Promise<T> => {
  // If no keys provided via argument, try environment variables
  let keysToUse = apiKeys;
  
  if (!keysToUse || keysToUse.length === 0) {
     const viteKey = (import.meta as any).env?.VITE_API_KEY;
     // Safe check for process to avoid ReferenceError in browser
     const processKey = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : undefined;
     
     const envKey = viteKey || processKey;
     if (envKey) {
        keysToUse = envKey.split(',').map((k: string) => k.trim());
     }
  }

  if (!keysToUse || keysToUse.length === 0) {
    throw new Error("No API Keys provided. Please add at least one Gemini API Key.");
  }

  let lastError: any = null;

  // Try each key in the list
  for (const apiKey of keysToUse) {
    if (!apiKey.trim()) continue;
    
    try {
      const ai = getAiClient(apiKey);
      const result = await operation(ai);
      
      // If successful, mark this key as ACTIVE
      if (onStatusUpdate) onStatusUpdate(apiKey, 'active');
      
      return result;
    } catch (error: any) {
      const msg = error.message || error.toString();
      // If error is Rate Limit (429) or Quota, try next key
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
        console.warn(`Key ending in ...${apiKey.slice(-4)} exhausted. Rotating to next key.`);
        
        // Mark this key as EXPIRED
        if (onStatusUpdate) onStatusUpdate(apiKey, 'expired');
        
        lastError = error;
        continue; // Loop to next key
      } else {
        // If it's a different error (e.g., Bad Request), throw immediately
        throw error;
      }
    }
  }

  // If we ran out of keys
  throw lastError || new Error("All provided API Keys have exhausted their quota.");
};

/**
 * Analyzes a transcript to extract a style profile.
 */
export const analyzeTranscript = async (
    apiKeys: string[], 
    transcript: string,
    onStatusUpdate?: (key: string, status: 'active' | 'expired') => void
): Promise<StyleProfile> => {
    return executeWithKeyRotation(apiKeys, async (ai) => {
        const responseSchema = {
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
            styleSamples: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Extract 3 to 5 VERBATIM paragraphs from the transcript that are 'Stylistically Dense'. Choose samples that show the strongest personality, imperfections, or unique thinking patterns. Do NOT choose generic intros/outros.",
            },
            toneDescription: {
              type: Type.STRING,
              description: "Summary of tone.",
            },
            structurePattern: {
              type: Type.STRING,
              description: "General description of the structure (Linear, Looping, Tangential).",
            },
            structuralBlueprint: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Legacy simplified blueprint. Just list the main steps.",
            },
            quantitativeAnalysis: {
                type: Type.OBJECT,
                description: "Detailed breakdown of the physical structure of the text.",
                properties: {
                    totalWordCount: { type: Type.NUMBER, description: "Total words in the analyzed sample." },
                    paragraphCount: { type: Type.NUMBER, description: "Total paragraphs." },
                    averageWordsPerParagraph: { type: Type.NUMBER, description: "Average words per paragraph." },
                    sentenceCount: { type: Type.NUMBER, description: "Total sentences." },
                    subHeaderStyle: { type: Type.STRING, description: "How do they name sections? (e.g. 'Short & Punchy', 'Questions', 'Descriptive', 'None')." },
                    structureSkeleton: {
                        type: Type.ARRAY,
                        description: "A detailed map of the content flow with estimated word counts for each section.",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                sectionName: { type: Type.STRING, description: "e.g. 'Opening Hook', 'Main Argument', 'Data Analysis', 'Conclusion'" },
                                estimatedWords: { type: Type.NUMBER, description: "Approximate word count for this specific section." },
                                purpose: { type: Type.STRING, description: "The rhetorical goal of this section." }
                            },
                            required: ["sectionName", "estimatedWords", "purpose"]
                        }
                    }
                },
                required: ["totalWordCount", "paragraphCount", "averageWordsPerParagraph", "sentenceCount", "subHeaderStyle", "structureSkeleton"]
            },
            structuralPatterns: {
                type: Type.OBJECT,
                description: "Specific habitual patterns for Intros, Transitions, and Outros.",
                properties: {
                    introHabits: { type: Type.STRING, description: "How do they usually start? (e.g., 'Rhetorical Question', 'Anecdote', 'Standard Greeting')." },
                    introPhrases: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Specific VERBATIM phrases used at the start (e.g. 'What is up guys', 'Let's dive in')." },
                    transitionPhrases: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Phrases used to bridge topics (e.g. 'But here is the thing', 'Moving on')." },
                    outroHabits: { type: Type.STRING, description: "How do they end? (e.g., 'Call to Action', 'Summary', 'Abrupt stop')." },
                    outroPhrases: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Specific VERBATIM phrases used at the end (e.g. 'Peace out', 'Thanks for watching')." },
                },
                required: ["introHabits", "introPhrases", "transitionPhrases", "outroHabits", "outroPhrases"]
            },
            styleDNA: {
              type: Type.OBJECT,
              properties: {
                   lexicalSignature: { type: Type.STRING, description: "Vocabulary habits, preferred word types (verbs vs adjectives), jargon usage." },
                   syntaxPattern: { type: Type.STRING, description: "Sentence structure preference (short/long, complex/simple, questions/statements)." },
                   rhetoricalDevices: { type: Type.STRING, description: "Use of metaphors, irony, repetition, rhetorical questions." },
                   cognitivePattern: { type: Type.STRING, description: "Thinking style: Linear vs Looping? Logical vs Emotional? Inductive vs Deductive?" },
                   narrativeStyle: { type: Type.STRING, description: "How they tell stories: Anecdotal? Data-driven? Hero's journey?" },
                   emotionalCurve: { type: Type.STRING, description: "How they build emotion: Slow burn? High energy peaks? Flat?" },
                   verbalTics: { type: Type.STRING, description: "Specific speech disfluencies, crutch words (like, um, you know, actually), stuttering patterns, or grammatical irregularities." }
              },
              required: ["lexicalSignature", "syntaxPattern", "rhetoricalDevices", "cognitivePattern", "narrativeStyle", "emotionalCurve", "verbalTics"]
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
          required: ["metrics", "signaturePhrases", "styleSamples", "toneDescription", "structurePattern", "structuralBlueprint", "quantitativeAnalysis", "structuralPatterns", "styleDNA", "typicalSectionLength", "name", "description"],
        };
      
        const response = await ai.models.generateContent({
          model: ANALYSIS_MODEL,
          contents: `You are a Forensic Computational Linguist specialized in Stylometry and Quantitative Discourse Analysis. 
          Your task is to extract a "Digital Clone" of the speaker's writing style.
          
          Ignore the specific topic (what they say).
          Focus entirely on the FORM (how they say it) and the PHYSICAL STRUCTURE (length, density).
      
          Analyze the provided transcripts to populate the schema. 
          
          CRITICAL INSTRUCTION FOR STRUCTURAL PATTERNS (ANCHORING):
          - **Analyze the very first 2 sentences** of every sample. What are the commonalities? Extract the EXACT words they use to open.
          - **Analyze the transition points.** How do they move from the intro to the body?
          - **Analyze the very last 2 sentences.** Do they have a sign-off signature? (e.g. "Cheers", "Peace", "See ya").
          
          CRITICAL INSTRUCTION FOR QUANTITATIVE ANALYSIS:
          - **Count words & paragraphs** accurately.
          - **Reverse Engineer the Skeleton:** Break down the text into functional blocks (Intro, Body 1, Body 2, Conclusion).
          - **Estimate Word Counts per Block:** How many words do they spend on the Intro vs the Body? This is crucial for pacing.
          - **Analyze Subheaders:** Do they use them? If so, what style? (e.g., "The Problem", "Step 1", "Why I Quit", or no headers).
          
          CRITICAL INSTRUCTION FOR DNA EXTRACTION:
          - Use concepts from **Rhetorical Structure Theory (RST)** and **Discourse Parsing**.
          - Analyze **Prosody & Flow**: Even in text, find the rhythm of speech.
          - Analyze **Cognitive Style**: Is the speaker abstract or concrete?
          
          **CRITICAL: ANALYZE IMPERFECTIONS & VERBAL TICS (THE "HUMAN" ELEMENT)**
          - AI models write perfectly. Humans do not.
          - Identify the specific ways this speaker breaks grammar rules.
          - Do they run sentences together?
          - Do they use crutch words like "basically", "literally", "kind of", "you know"?
          - Do they start sentences with "And", "But", "So"?
          - Do they use abrupt transitions?
          - **Record these flaws minutely. They are essential for the clone.**

          **STYLE SAMPLES SELECTION:**
          - Select 3-5 paragraphs that define this person.
          - Look for "Peaks of Personality".
          
          Transcript:
          """
          ${transcript.substring(0, 50000)}
          """`, 
          config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            temperature: 0, 
            thinkingConfig: { thinkingBudget: 2048 } // Allow some thinking for analysis to ensure deep extraction
          },
        });
      
        if (!response.text) {
          throw new Error("No response from Gemini");
        }
      
        const data = JSON.parse(response.text);
        
        return {
          id: crypto.randomUUID(),
          contentType: 'general', // Default folder
          ...data
        };
    }, onStatusUpdate);
};

/**
 * Suggests travel locations.
 */
export const suggestTravelLocations = async (
  apiKeys: string[],
  topic: string, 
  profile: StyleProfile, 
  count: number,
  excludeNames: string[] = [],
  onStatusUpdate?: (key: string, status: 'active' | 'expired') => void
): Promise<LocationSuggestion[]> => {
    return executeWithKeyRotation(apiKeys, async (ai) => {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `
            Topic: ${topic}
            Persona Context: ${profile.name} (${profile.description})
            
            Task: suggest exactly ${count} unique, real-world locations that fit the topic and would appeal to this persona.
            Critically important: Do NOT include these locations: ${excludeNames.join(", ")}.
            
            Ensure these places exist and are highly rated by travelers.
            For each location, provide a name and a very brief reason why it's interesting.
            
            LANGUAGE: ENGLISH.
          `,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                locations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      description: { type: Type.STRING },
                    },
                    required: ["name", "description"],
                  },
                },
              },
              required: ["locations"],
            },
          },
        });
      
        if (!response.text) throw new Error("Failed to fetch locations");
      
        let cleanedText = response.text.trim();
        if (cleanedText.startsWith("```")) {
          cleanedText = cleanedText.replace(/^```(json)?\n?/, "").replace(/\n?```$/, "");
        }
      
        try {
          const data = JSON.parse(cleanedText);
          return data.locations.map((loc: any) => ({
            id: crypto.randomUUID(),
            name: loc.name,
            description: loc.description,
            isSelected: false
          }));
        } catch (e) {
          console.error("JSON Parse Error:", e);
          throw new Error("Failed to parse location suggestions.");
        }
    }, onStatusUpdate);
};

/**
 * Helper to generate PROMPT TUNING instructions based on quantitative metrics.
 * This converts numbers (0-100) into linguistic instructions.
 */
const getMetricTuningInstructions = (metrics: StyleMetrics): string[] => {
    const tuning = [];

    // Humor Tuning (Granular)
    if (metrics.humor >= 80) {
        tuning.push("MODE: COMEDY CLUB. Aggressively use satire, irony, and self-deprecation. Do not take the topic seriously.");
    } else if (metrics.humor >= 60) {
        tuning.push("MODE: WITTY. Lighten the mood with occasional clever remarks or playful metaphors.");
    } else if (metrics.humor <= 20) {
        tuning.push("MODE: SERIOUS. Zero tolerance for jokes. Tone must be grave, professional, or strictly factual.");
    }

    // Logic vs Emotion
    if (metrics.logic >= 80) {
        tuning.push("COGNITIVE STYLE: ANALYTICAL. Structure arguments with 'Premise -> Evidence -> Conclusion'. Use connectors like 'However', 'Therefore', 'Conversely'.");
    } 
    if (metrics.emotion >= 80) {
        tuning.push("COGNITIVE STYLE: VISCERAL. Focus on sensory experience (sight, sound, feeling). Use emotionally charged adjectives. Appeal to the reader's empathy.");
    }

    // Complexity
    if (metrics.complexity >= 80) {
        tuning.push("VOCABULARY: ACADEMIC/TECHNICAL. Use precise, high-level terminology. Do not simplify concepts. Assume the reader is an expert.");
    } else if (metrics.complexity <= 30) {
        tuning.push("VOCABULARY: ELI5. Use simple words. Short sentences. No jargon. Metaphors from daily life.");
    }

    // Pacing
    if (metrics.pacing >= 80) {
        tuning.push("RHYTHM: STACCATO. Fast. Urgent. Short sentences. Fragments. Keep the reader breathless.");
    } else if (metrics.pacing <= 30) {
        tuning.push("RHYTHM: LEGATO. Flowing, meditative, and slow. Long, compound-complex sentences that drift between ideas.");
    }

    // Informality
    if (metrics.informality >= 80) {
        tuning.push("REGISTER: RAW/STREET. Slang allowed. Grammar rules are optional. Write exactly how a close friend speaks in a bar.");
    } else if (metrics.informality <= 20) {
        tuning.push("REGISTER: HIGH FORMAL. Adhere strictly to grammar. No contractions (cannot, do not). Passive voice is acceptable where appropriate.");
    }

    return tuning;
};

/**
 * Generates a new script based on a specific style profile.
 * UPDATED: Includes word count inflation to ensure LLM output meets target length.
 */
export const generateScript = async (
  apiKeys: string[],
  topic: string, 
  profile: StyleProfile, 
  contentType: ContentType = 'general',
  selectedLocations: LocationSuggestion[] = [],
  targetLength: number = 250,
  creativityLevel: number = 1.35, 
  customStructure: WritingStructure | null = null, 
  onStatusUpdate?: (key: string, status: 'active' | 'expired') => void
): Promise<string> => {
    return executeWithKeyRotation(apiKeys, async (ai) => {
        
        // 1. DETERMINE MODE & CALCULATE BLUEPRINT WITH INFLATION
        const MODE = customStructure ? "CUSTOM_STRUCTURE" : "AUTO_DNA";
        let blueprint: any[] = [];
        let totalEstimatedWords = 0;

        // INFLATION FACTOR:
        // LLMs tend to be concise and undercut word counts by 20-30% on long texts.
        // We artificially inflate the target requested from the LLM to compensate.
        // e.g. User wants 2000 -> We ask for ~2500 -> Model produces ~2100.
        const INFLATION_FACTOR = targetLength > 800 ? 1.3 : 1.1; 
        const inflatedTotalTarget = Math.round(targetLength * INFLATION_FACTOR);

        if (customStructure) {
            // CASE A: CUSTOM STRUCTURE MODE
            // Scale the custom structure sections to hit the INFLATED target
            const rawStructureTotal = customStructure.sections.reduce((sum, sec) => sum + (sec.estimatedWords || 100), 0);
            
            // If the user's structure sum is vastly different from targetLength (which comes from UI slider or sum),
            // we respect the structure's proportions but scale to the inflated target.
            const scale = (rawStructureTotal > 0) ? (inflatedTotalTarget / rawStructureTotal) : 1;
            
            totalEstimatedWords = inflatedTotalTarget;
            
            blueprint = customStructure.sections.map(sec => ({
                sectionName: sec.name,
                intent: sec.instruction,
                wordTarget: Math.round((sec.estimatedWords || 100) * scale),
                // Add specific expansion instruction for every section
                instruction: "EXPAND THIS SECTION. Provide detailed examples, context, and deep analysis to fill the word count."
            }));
        } else if (profile.quantitativeAnalysis && profile.quantitativeAnalysis.structureSkeleton) {
            // CASE B: AUTO DNA MODE
            // Scale profile skeleton to INFLATED target
            const originalTotal = profile.quantitativeAnalysis.totalWordCount || 1000;
            const scaleFactor = inflatedTotalTarget / originalTotal;
            totalEstimatedWords = inflatedTotalTarget;
            
            blueprint = profile.quantitativeAnalysis.structureSkeleton.map(sec => ({
                sectionName: sec.sectionName,
                intent: sec.purpose,
                // Ensure no section is too small (min 50 words)
                wordTarget: Math.max(50, Math.round(sec.estimatedWords * scaleFactor))
            }));
        } else {
            // FALLBACK (No skeletal data)
            totalEstimatedWords = inflatedTotalTarget;
            blueprint = [
                { sectionName: "Content", intent: "Write a comprehensive and deeply detailed piece about the topic.", wordTarget: inflatedTotalTarget }
            ];
        }

        // We set the absolute minimum to the user's original request (not the inflated one)
        const absoluteMinWords = targetLength;

        // 2. CONSTRUCT PROMPT INPUT OBJECT
        const inputPayload = {
            mode: MODE,
            task: `Write a ${contentType} about: "${topic}"`,
            constraints: {
                // We ask for the INFLATED amount as the "Goal"
                targetWordCountGoal: totalEstimatedWords,
                // We set the user's actual target as the strict MINIMUM
                minimumRequiredWords: absoluteMinWords,
                strictness: "HIGH. Do not under-write.",
                language: "ENGLISH",
                creativity: creativityLevel
            },
            blueprint: blueprint,
            profile: {
                name: profile.name,
                tone: profile.toneDescription,
                metrics: profile.metrics,
                styleDNA: profile.styleDNA,
                structuralAnchors: profile.structuralPatterns,
                samples: profile.styleSamples
            },
            context: selectedLocations.length > 0 ? {
                type: "Travel Guide",
                locations: selectedLocations.map(l => `${l.name}: ${l.description}`)
            } : undefined
        };

        // 3. SYSTEM INSTRUCTION (STRICT RULES)
        const systemInstruction = `
            You must follow the JSON input strictly. 
            
            **LENGTH ENFORCEMENT PROTOCOL:**
            - **You have a tendency to be too concise. This is forbidden.**
            - The user requires a LONG-FORM output of at least ${absoluteMinWords} words.
            - To achieve this, you must **EXPAND** every single point.
            - Never summarize. Always elaborate.
            - Use examples, anecdotes, data points, and counter-arguments to flesh out each section.
            - If a section seems finished but the word count is low, add a "Deep Dive" or "Context" subsection.

            PROCESSING RULES:
            1. If mode = "CUSTOM_STRUCTURE":
                - **STRUCTURE:** Follow the blueprint exactly.
                - **STYLE:** Apply ALL profile metrics, tone, DNA, and verbal tics.
                - **ANCHORS:** ADAPT the profile's 'structuralAnchors' (Intro/Outro phrases) to fit.

            2. If mode = "AUTO_DNA":
                - Use the provided blueprint skeleton.
                - Scale each section to meet the word count goal of ${totalEstimatedWords} words.
                - Apply ALL profile anchors strictly (Intro phrases, Transition habits, Outro phrases).
                - Apply tone, cognitive pattern, lexical signature, verbal tics, and rhetorical habits.

            3. UNIVERSAL STYLE RULES:
                - Apply styleMetrics to adjust emotion, humor, complexity, pacing, and informality.
                - **VERBAL TICS:** You MUST include the specific verbal tics defined in the profile (e.g. "basically", "you know", specific sentence starters). This makes the clone authentic.
                - Use the samples inside profile.samples as style conditioning. Mimic their sentence rhythm, pause length, and word patterns.
                - **DEPROGRAMMING:** Do not use AI clichés ("In conclusion", "Tapestry", "Delving"). Be raw and human.

            4. OUTPUT FORMAT:
                - Output ONLY the generated text in Markdown.
                - Include section headers (## Section Name) as defined in the blueprint.
                - **IMPORTANT: Insert a horizontal rule separator ('---') after every section.**
                - LANGUAGE: English.
        `;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          // Pass the structured input as the prompt
          contents: `INPUT JSON:\n${JSON.stringify(inputPayload, null, 2)}`,
          config: {
            systemInstruction: systemInstruction,
            temperature: creativityLevel, 
            thinkingConfig: { 
                thinkingBudget: 4096 
            }
          }
        });
      
        return response.text || "Failed to generate script.";
    }, onStatusUpdate);
};

/**
 * REFINEMENT TOOL: Rewrites a specific chunk of text to be closer to the persona.
 */
export const refineText = async (
    apiKeys: string[],
    originalText: string,
    instruction: string,
    profile: StyleProfile,
    onStatusUpdate?: (key: string, status: 'active' | 'expired') => void
): Promise<string> => {
    return executeWithKeyRotation(apiKeys, async (ai) => {
        const tuningInstructions = getMetricTuningInstructions(profile.metrics);
        
        const prompt = `
            You are editing a script to match the specific persona of "${profile.name}".
            
            **PERSONA GUIDELINES:**
            - Voice: ${profile.toneDescription}
            - Verbal Tics: ${profile.styleDNA?.verbalTics}
            - Style Rules: ${tuningInstructions.join("; ")}
            - **LANGUAGE:** ENGLISH (Output must be in English).
            
            **ORIGINAL TEXT:**
            "${originalText}"
            
            **YOUR TASK:**
            Rewrite the text above. ${instruction}
            
            **CONSTRAINT:**
            Keep the meaning, but change the FORM to match the persona perfectly. 
            Output ONLY the rewritten text.
        `;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                temperature: 1.5, // High temp for creative rewriting
            }
        });

        return response.text ? response.text.trim() : originalText;
    }, onStatusUpdate);
};