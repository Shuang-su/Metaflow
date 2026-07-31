export type OriginCaseId =
  | 'hero'
  | 'switch'
  | 'slider'
  | 'toggle'
  | 'qr'
  | 'video'
  | 'how-it-works';

export interface OriginRuntimeBridge {
  mount(caseId: OriginCaseId, host: HTMLElement): () => void;
}

export interface StudyMetric {
  label: string;
  value: string;
}

export interface StudyDetail {
  title: string;
  body: string;
}

export interface StudySource {
  chunk: string;
  anchor: string;
  needle: string;
  language: 'js' | 'tsx' | 'glsl';
  code: string;
  formattedCode: string;
  highlightedHtml: string;
  researchComments?: string[];
}

export interface StudyEntry {
  title: string;
  summary: string;
  implementation: string;
  originCase: OriginCaseId;
  metrics: StudyMetric[];
  rules: string[];
  browser: string;
  details?: StudyDetail[];
  sources: StudySource[];
  originalHtml: string;
  originArticleClassName: string;
}

export type StudyCaseId =
  | 'overview'
  | 'hero'
  | 'switch'
  | 'slider'
  | 'toggle'
  | 'qr'
  | 'video'
  | 'how-it-works';
