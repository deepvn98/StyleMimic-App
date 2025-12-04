export interface StyleMetrics {
  humor: number; // 0-100
  logic: number; // 0-100
  emotion: number; // 0-100
  complexity: number; // 0-100
  pacing: number; // 0-100 (Slow to Fast)
  informality: number; // 0-100 (Formal to Slang)
}

export type ContentType = 'general' | 'travel' | 'news' | 'tech' | 'story' | 'educational';

export interface StyleProfile {
  id: string;
  name: string;
  description: string;
  metrics: StyleMetrics;
  signaturePhrases: string[];
  toneDescription: string;
  structurePattern: string;
  typicalSectionLength: number; // Average words per section/thought
  contentType: ContentType; // Folder/Category for this profile
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

export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  SUGGESTING_LOCATIONS = 'SUGGESTING_LOCATIONS',
  GENERATING = 'GENERATING',
}

export enum Tab {
  ANALYZE = 'ANALYZE',
  GENERATE = 'GENERATE',
  LIBRARY = 'LIBRARY'
}