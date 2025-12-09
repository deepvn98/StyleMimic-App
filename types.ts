

export interface StyleMetrics {
  humor: number; // 0-100
  logic: number; // 0-100
  emotion: number; // 0-100
  complexity: number; // 0-100
  pacing: number; // 0-100 (Slow to Fast)
  informality: number; // 0-100 (Formal to Slang)
}

export interface StyleDNA {
    lexicalSignature: string; // Vocabulary habits
    syntaxPattern: string; // Sentence structure
    rhetoricalDevices: string; // Metaphors, irony, etc.
    cognitivePattern: string; // How they think (Logical vs Emotional, Linear vs Loop)
    narrativeStyle: string; // How they tell stories
    emotionalCurve: string; // How they build feeling
    verbalTics?: string; // Stuttering, fillers, imperfections
}

export interface StructuralSection {
    sectionName: string; // e.g., "Introduction", "The Twist"
    estimatedWords: number; // Approx word count
    purpose: string; // e.g., "Hook the reader", "Provide data"
}

export interface QuantitativeAnalysis {
    totalWordCount: number;
    paragraphCount: number;
    averageWordsPerParagraph: number;
    sentenceCount: number;
    subHeaderStyle: string; // e.g. "Short & Punchy", "Questions", "Descriptive"
    structureSkeleton: StructuralSection[]; // Detailed breakdown
}

// NEW: Captures specific habitual phrases for structure
export interface StructuralPatterns {
    introHabits: string; // Description: e.g. "Always starts with a rhetorical question"
    introPhrases: string[]; // Verbatim: e.g. ["What is up guys!", "Let's be real."]
    transitionPhrases: string[]; // Verbatim: e.g. ["Here's the kicker", "Moving on"]
    outroHabits: string; // Description: e.g. "Summarizes then asks for a subscribe"
    outroPhrases: string[]; // Verbatim: e.g. ["Peace out", "Catch you on the flip side"]
}

export type ContentType = 'general' | 'travel' | 'news' | 'tech' | 'story' | 'educational';

export interface StyleProfile {
  id: string;
  name: string;
  description: string;
  metrics: StyleMetrics;
  signaturePhrases: string[];
  toneDescription: string;
  structurePattern: string; // General description
  structuralBlueprint?: string[]; // Step-by-step outline (Legacy)
  typicalSectionLength: number; // Average words per section/thought
  contentType: ContentType; // Folder/Category for this profile
  styleDNA?: StyleDNA; // Advanced forensic data
  styleSamples?: string[]; // Actual writing samples for style mimicry
  quantitativeAnalysis?: QuantitativeAnalysis; // Physical structure data
  structuralPatterns?: StructuralPatterns; // NEW: Specific anchors
}

export interface AnalysisResult {
  profile: StyleProfile;
  rawAnalysis: string;
}

export interface LocationSuggestion {
  id: string;
  name: string;
  description: string;
  isSelected: boolean;
}

export type KeyStatus = 'ready' | 'active' | 'expired';

export enum AppState {
  LOCKED = 'LOCKED', // User needs to enter license
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD', // Admin view
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  SUGGESTING_LOCATIONS = 'SUGGESTING_LOCATIONS',
  GENERATING = 'GENERATING'
}

export enum Tab {
  ANALYZE = 'ANALYZE',
  GENERATE = 'GENERATE',
  LIBRARY = 'LIBRARY'
}