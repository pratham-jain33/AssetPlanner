export interface ScenePlan {
  title: string;
  scriptSnippet: string;
  visualDescription: string;
  searchTerms: string[];
}

export interface GenerationStats {
  inputTokens: number;
  outputTokens: number;
  timeMs: number;
  cost: number;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  script: string;
  scenes: ScenePlan[];
  stats: GenerationStats;
}
