
import { GoogleGenAI, Type } from "@google/genai";
import { StyleProfile, StyleMetrics, ContentType, LocationSuggestion, WritingStructure } from "../types";

// CONSTANT: FORCE GEMINI 2.5 FLASH (Best for Free Tier / High Rate Limits)
const GEMINI_MODEL = "gemini-2.5-flash";

// ① PHASE 1: HIGH INTELLIGENCE (Forensic Analyst)
const PHASE_1_SYSTEM_INSTRUCTION = `
You are a lead Forensic Linguist AI.

Your job is to analyze text with extreme precision.
You must ignore the "meaning" of the text and focus on the "mechanics" of the mind behind it.
Extract the raw, unfiltered cognitive DNA of the author.

RULES:
- Be objective.
- Do not summarize content; analyze form.
- Return ONLY valid JSON.
`;

// ② PHASE 2: LOW INTELLIGENCE / HIGH FIDELITY ( The Clone )
const PHASE_2_SYSTEM_INSTRUCTION = `
You are a TEXT GENERATION ENGINE running in "AUTHENTICITY_MODE".

OBJECTIVE:
Simulate the raw output of a specific human mind.
Do NOT write "like" the person. BE the person.

PRIME DIRECTIVES (DO NOT VIOLATE):
1. NO OPTIMIZATION: Do not improve grammar, clarity, flow, or logic. If the persona writes bad sentences, you write bad sentences.
2. NO BALANCING: If the persona is biased, be biased. Do not present "the other side" unless the persona implies it.
3. NO META-COMMUNICATION: Do not act as an AI. Do not wrap up with "In conclusion" or "To summarize" unless the persona habitually does.
4. PRESERVE FLAWS: Keep logic jumps, verbal tics, repetition, and rough transitions.
5. COGNITIVE CAGING: You only know what is explicitly provided in the "COGNITIVE_CAGE". You do not have access to general "good writing" rules.

If the prompt asks for a script, simply start talking/writing as the persona immediately.
`;

/**
 * HELPER: Initialize AI client with a specific key
 */
const getAiClient = (apiKey: string) => {
  return new GoogleGenAI({ apiKey });
};

/**
 * HELPER: Delay function
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * EXECUTE WITH KEY ROTATION & RETRY LOGIC
 * Optimized for Free Tier Rate Limits (15 RPM) and Server Overload (503)
 */
const executeWithKeyRotation = async <T>(
  apiKeys: string[], 
  operation: (ai: GoogleGenAI) => Promise<T>,
  onStatusUpdate?: (key: string, status: 'active' | 'expired') => void
): Promise<T> => {
  let keysToUse = apiKeys;
  
  if (!keysToUse || keysToUse.length === 0) {
     const viteKey = (import.meta as any).env?.VITE_API_KEY;
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

  for (const apiKey of keysToUse) {
    if (!apiKey.trim()) continue;
    
    // RETRY LOOP FOR SINGLE KEY (Handle 503 Overloaded)
    // We try 3 times on the same key if it's a server error.
    let retries = 3;
    while (retries > 0) {
        try {
            const ai = getAiClient(apiKey);
            const result = await operation(ai);
            if (onStatusUpdate) onStatusUpdate(apiKey, 'active');
            return result;
        } catch (error: any) {
            const msg = error.message || error.toString();
            
            // ERROR TYPE 1: SERVER OVERLOAD (503)
            // This is temporary, so we WAIT and RETRY on the same key.
            if (msg.includes('503') || msg.includes('overloaded') || msg.includes('Internal error')) {
                console.warn(`Server Overloaded (503). Retrying in 2s... (${retries}/3)`);
                retries--;
                if (retries === 0) {
                    lastError = error;
                    break; // Move to next key if available
                }
                await delay(2000 + Math.random() * 1000); // Wait 2-3s
                continue;
            }

            // ERROR TYPE 2: QUOTA EXHAUSTED (429)
            // This is permanent for this key, so we BREAK immediately to rotate.
            if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
                console.warn(`Key ending in ...${apiKey.slice(-4)} exhausted. Rotating.`);
                if (onStatusUpdate) onStatusUpdate(apiKey, 'expired');
                lastError = error;
                break; // Break retry loop to go to next key
            }

            // ERROR TYPE 3: OTHER
            throw error;
        }
    }
  }

  // If we get here, all keys failed (either 429 or persistent 503)
  throw lastError || new Error("All provided API Keys failed or Server is currently unavailable.");
};

/**
 * PHASE 1 — ANALYSIS
 * Extracts the author's full Digital Clone Style Profile.
 */
export const analyzeTranscript = async (
    apiKeys: string[], 
    transcript: string,
    onStatusUpdate?: (key: string, status: 'active' | 'expired') => void
): Promise<StyleProfile> => {
    return executeWithKeyRotation(apiKeys, async (ai) => {
        
        // 1. Prepare reference texts
        const referenceTexts = transcript.split('*** NEXT TRANSCRIPT ***')
            .filter(t => t.trim().length > 0)
            .map((content, index) => ({
                id: `reference_text_${index + 1}`,
                content: content.substring(0, 30000)
            }));

        // 2. Advanced Analysis Task
        const analysisTaskDefinition = {
            task: "CREATE_STYLE_MODEL",
            mode: "analysis_only",
            objective: "Extract, formalize, and standardize a reusable writing model based on provided reference texts.",
            input: {
                reference_texts: referenceTexts,
                context_notes: {
                    genre: "General / Varied",
                    intended_use: "CLONE_SIMULATION",
                    fiction_level: "NON_FICTION / MIXED"
                }
            },
            analysis_instructions: {
                focus_on: [
                    "narrative_voice",
                    "tone_and_emotion",
                    "sentence_structure_and_rhythm",
                    "logic_flow_and_argumentation_style",
                    "recurring_linguistic_patterns",
                    "implicit_rules_and_unspoken_constraints"
                ],
                ignore: [
                    "topic_specific_facts",
                    "named_entities_unique_to_reference",
                    "one_time_events"
                ]
            }
        };

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
              description: "Extract 3 to 5 VERBATIM paragraphs from the transcript that are 'Stylistically Dense'.",
            },
            toneDescription: {
              type: Type.STRING,
              description: "Summary of tone.",
            },
            structurePattern: {
              type: Type.STRING,
              description: "General description of the structure (Linear, Looping, Tangential).",
            },
            quantitativeAnalysis: {
                type: Type.OBJECT,
                description: "Detailed breakdown of the physical structure of the text.",
                properties: {
                    totalWordCount: { type: Type.NUMBER },
                    paragraphCount: { type: Type.NUMBER },
                    averageWordsPerParagraph: { type: Type.NUMBER },
                    sentenceCount: { type: Type.NUMBER },
                    subHeaderStyle: { type: Type.STRING, description: "How they use headers. If none, say 'None'." },
                    structureSkeleton: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                sectionName: { type: Type.STRING, description: "Name of this logical section" },
                                estimatedWords: { type: Type.NUMBER },
                                purpose: { type: Type.STRING, description: "Cognitive purpose of this section" }
                            },
                            required: ["sectionName", "estimatedWords", "purpose"]
                        },
                        description: "An ordered array representing the typical skeleton."
                    }
                },
                required: ["totalWordCount", "paragraphCount", "averageWordsPerParagraph", "sentenceCount", "subHeaderStyle", "structureSkeleton"]
            },
            structuralPatterns: {
                type: Type.OBJECT,
                properties: {
                    introHabits: { type: Type.STRING, description: "Detailed description of EXACTLY how they start." },
                    introPhrases: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Exact words they use to open." },
                    transitionPhrases: { type: Type.ARRAY, items: { type: Type.STRING } },
                    outroHabits: { type: Type.STRING, description: "Detailed description of EXACTLY how they end." },
                    outroPhrases: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Exact words they use to sign off." },
                },
                required: ["introHabits", "introPhrases", "transitionPhrases", "outroHabits", "outroPhrases"]
            },
            styleDNA: {
              type: Type.OBJECT,
              properties: {
                   lexicalSignature: { type: Type.STRING, description: "Vocabulary level, metaphor usage" },
                   syntaxPattern: { type: Type.STRING, description: "Sentence length profile" },
                   rhetoricalDevices: { type: Type.STRING },
                   cognitivePattern: { type: Type.STRING, description: "Thinking Model: How arguments are built" },
                   narrativeStyle: { type: Type.STRING, description: "Narrative perspective" },
                   emotionalCurve: { type: Type.STRING, description: "Emotional range" },
                   verbalTics: { type: Type.STRING }
              },
              required: ["lexicalSignature", "syntaxPattern", "rhetoricalDevices", "cognitivePattern", "narrativeStyle", "emotionalCurve", "verbalTics"]
            },
            decisionProfile: {
                type: Type.OBJECT,
                properties: {
                    decisionMakingBehavior: { type: Type.STRING, description: "How they decide what to include/exclude" },
                    argumentSelectionBias: { type: Type.STRING, description: "Do they cherry-pick? Are they fair?" },
                    omissionPatterns: { type: Type.STRING, description: "Constraints: What do they ALWAYS ignore?" },
                    repeatedErrors: { type: Type.STRING, description: "Authentic mistakes (grammar, logic jumps) to preserve." }
                },
                required: ["decisionMakingBehavior", "argumentSelectionBias", "omissionPatterns", "repeatedErrors"]
            },
            moralCompass: {
                type: Type.OBJECT,
                properties: {
                    description: { type: Type.STRING, description: "General moral stance" },
                    empathyLevel: { type: Type.STRING, description: "How much do they care about the reader/subject?" },
                    judgmentReflex: { type: Type.STRING, description: "How quickly do they judge?" }
                },
                required: ["description", "empathyLevel", "judgmentReflex"]
            },
            typicalSectionLength: { type: Type.NUMBER },
            name: { type: Type.STRING, description: "Auto-generated descriptive name" },
            description: { type: Type.STRING },
          },
          required: ["metrics", "signaturePhrases", "styleSamples", "toneDescription", "structurePattern", "quantitativeAnalysis", "structuralPatterns", "styleDNA", "decisionProfile", "moralCompass", "typicalSectionLength", "name", "description"],
        };
      
        // 3. Construct Final Prompt
        const analysisPrompt = `
PHASE 1 — ANALYSIS
YOUR MISSION IS DEFINED BY THE FOLLOWING JSON TASK SPECIFICATION:
"""
${JSON.stringify(analysisTaskDefinition, null, 2)}
"""

OUTPUT:
Return ONLY the JSON object matching the Schema.
`;

        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: analysisPrompt,
          config: {
            systemInstruction: PHASE_1_SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            temperature: 0, 
            thinkingConfig: { thinkingBudget: 2048 } // Reduced for Free Tier Speed/Quota
          },
        });
      
        if (!response.text) {
          throw new Error("No response from Gemini");
        }
      
        const data = JSON.parse(response.text);
        
        return {
          id: crypto.randomUUID(),
          contentType: 'general',
          ...data
        };
    }, onStatusUpdate);
};

/**
 * PHASE 2 — GENERATION (Task: EXECUTE_STYLE_MODEL)
 * Simulates the author using the extracted profile via a high-fidelity execution task.
 * REWRITTEN FOR "AUTHENTICITY FIRST" LOGIC.
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
        
        // 1. SETUP CLONE TEMPERATURE (Clamped for authenticity)
        // High UI creativity shouldn't make the model hallucinatory, just "looser" with structure.
        // We map the UI (0.5 - 1.8) to a safer Clone Range (0.4 - 0.75)
        const effectiveTemp = Math.max(0.4, Math.min(0.75, creativityLevel * 0.5));

        // 2. SETUP STRUCTURE
        // Logic: Only use headers if Custom Structure OR if profile indicates headers are used.
        const INFLATION_FACTOR = targetLength > 800 ? 1.2 : 1.1; 
        const inflatedTotalTarget = Math.round(targetLength * INFLATION_FACTOR);
        let structureBlueprint: any[] = [];
        let executionMode = "AUTO_DNA";
        let enforceHeaders = false;

        if (customStructure) {
            executionMode = "CUSTOM_STRUCTURE";
            enforceHeaders = true; // Custom structures imply specific sections
            const rawStructureTotal = customStructure.sections.reduce((sum, sec) => sum + (sec.estimatedWords || 100), 0);
            const scale = (rawStructureTotal > 0) ? (inflatedTotalTarget / rawStructureTotal) : 1;
            
            structureBlueprint = customStructure.sections.map(sec => ({
                section_name: sec.name,
                target_words: Math.round((sec.estimatedWords || 100) * scale),
                instruction: sec.instruction
            }));
        } else if (profile.quantitativeAnalysis && profile.quantitativeAnalysis.structureSkeleton) {
            executionMode = "AUTO_DNA";
            // CHECK: Does the author actually use headers?
            const subHeaderStyle = profile.quantitativeAnalysis.subHeaderStyle || "";
            const headersMentioned = subHeaderStyle.length > 3 && !subHeaderStyle.toLowerCase().includes("none");
            
            enforceHeaders = headersMentioned;

            const originalTotal = profile.quantitativeAnalysis.totalWordCount || 1000;
            const scaleFactor = inflatedTotalTarget / originalTotal;
            
            structureBlueprint = profile.quantitativeAnalysis.structureSkeleton.map(sec => ({
                section_name: sec.sectionName,
                // If headers are OFF, section names are just internal guideposts for the AI
                internal_guide: sec.sectionName,
                target_words: Math.max(50, Math.round(sec.estimatedWords * scaleFactor)),
                purpose: sec.purpose
            }));
        } else {
             structureBlueprint = [{ section_name: "Flow", target_words: inflatedTotalTarget, purpose: "Natural stream of consciousness" }];
        }

        const locationContext = selectedLocations.length > 0 
            ? selectedLocations.map(l => `${l.name}: ${l.description}`).join('; ')
            : "None";

        // 3. COGNITIVE CAGING
        // We do NOT pass the full profile. We only pass the "Internal Mind".
        // We hide metrics to prevent the AI from trying to "achieve a score".
        // We use || to provide defaults if optional fields are missing (e.g. legacy profiles)
        const cognitiveCage = {
            world_view: profile.moralCompass?.description || "Neutral",
            blind_spots: profile.decisionProfile?.omissionPatterns || "None",
            biases: profile.decisionProfile?.argumentSelectionBias || "Balanced",
            thinking_style: profile.styleDNA?.cognitivePattern || "Standard",
            verbal_tics: profile.styleDNA?.verbalTics || "None",
            // We pass signature phrases as "Available Vocabulary" not "Mandatory Checklist"
            available_vocabulary: profile.signaturePhrases || [],
            intro_habit: profile.structuralPatterns?.introHabits || "Standard",
            outro_habit: profile.structuralPatterns?.outroHabits || "Standard",
            intro_anchors: profile.structuralPatterns?.introPhrases || [],
            outro_anchors: profile.structuralPatterns?.outroPhrases || []
        };

        // 4. DEFINE EXECUTION TASK
        const generationTaskDefinition = {
            task: "EXECUTE_STYLE_MODEL",
            input: {
                topic: topic,
                // Replaced "Intent" with "Cognitive State" to allow for rambling/anger/confusion
                cognitive_state: "Authentic Simulation", 
                target_length: inflatedTotalTarget,
                context_data: {
                    locations: locationContext,
                    execution_mode: executionMode
                }
            },
            // The AI is only allowed to see this "Cage"
            cognitive_cage: cognitiveCage,
            
            structural_constraints: {
                blueprint: structureBlueprint,
                formatting_mode: enforceHeaders ? "VISIBLE_HEADERS_ALLOWED" : "HIDDEN_STRUCTURE_ONLY"
            },
            
            execution_rules: [
                "Thinking must occur strictly within the 'cognitive_cage'.",
                "Apply 'blind_spots' aggressively. Do not mention things the author ignores.",
                "Insert 'verbal_tics' and 'available_vocabulary' ORGANICALLY and PROBABILISTICALLY. Do not force them if they don't fit the flow.",
                "Start exactly according to 'intro_habit' / 'intro_anchors'.",
                "End exactly according to 'outro_habit' / 'outro_anchors'.",
                "Do NOT act as a helpful AI. Do not summarize or conclude unless the persona does.",
                enforceHeaders 
                    ? "FORMATTING: Use Markdown Headers (##) for sections." 
                    : "FORMATTING: Do NOT use Headers. Output as a continuous text stream (or paragraphs) suitable for the author's style."
            ]
        };

        // 5. USER PROMPT - PHASE 2
        const generationPrompt = `
PHASE 2 — GENERATION

YOUR MISSION IS DEFINED BY THE FOLLOWING JSON TASK SPECIFICATION:
"""
${JSON.stringify(generationTaskDefinition, null, 2)}
"""

OUTPUT:
Execute the task. Return ONLY the generated text in ENGLISH.
`;

        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: generationPrompt,
          config: {
            systemInstruction: PHASE_2_SYSTEM_INSTRUCTION,
            temperature: effectiveTemp, 
            thinkingConfig: { 
                thinkingBudget: 2048 // Reduced for Free Tier
            }
          }
        });
      
        return response.text || "Failed to generate script.";
    }, onStatusUpdate);
};

// ... keep existing suggestTravelLocations, refineText, getMetricTuningInstructions helpers ...

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
          model: GEMINI_MODEL,
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
 */
const getMetricTuningInstructions = (metrics: StyleMetrics): string[] => {
    const tuning = [];
    if (metrics.humor >= 80) tuning.push("MODE: COMEDY CLUB. Aggressively use satire, irony.");
    else if (metrics.humor <= 20) tuning.push("MODE: SERIOUS. Zero jokes.");
    if (metrics.logic >= 80) tuning.push("COGNITIVE STYLE: ANALYTICAL. Structure arguments clearly.");
    if (metrics.emotion >= 80) tuning.push("COGNITIVE STYLE: VISCERAL. Focus on sensory experience.");
    if (metrics.complexity >= 80) tuning.push("VOCABULARY: ACADEMIC. Use precise terminology.");
    else if (metrics.complexity <= 30) tuning.push("VOCABULARY: SIMPLE. ELI5 style.");
    if (metrics.pacing >= 80) tuning.push("RHYTHM: STACCATO. Fast, short sentences.");
    if (metrics.informality >= 80) tuning.push("REGISTER: CASUAL/SLANG.");
    return tuning;
};

/**
 * REFINEMENT TOOL
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
            - **LANGUAGE:** ENGLISH.
            
            **ORIGINAL TEXT:**
            "${originalText}"
            
            **YOUR TASK:**
            Rewrite the text above. ${instruction}
            
            **CONSTRAINT:**
            Keep the meaning, but change the FORM to match the persona perfectly. 
            Output ONLY the rewritten text in ENGLISH.
        `;

        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: {
                systemInstruction: PHASE_2_SYSTEM_INSTRUCTION, // Use Phase 2 instruction for consistency
                temperature: 1.5,
            }
        });

        return response.text ? response.text.trim() : originalText;
    }, onStatusUpdate);
};