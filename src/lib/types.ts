export type AppTab = "settings" | "documents" | "advisors" | "chat";

export type DocumentKind = "editable" | "uploaded";
export type ChatMessageRole = "user" | "advisor" | "synthesis" | "system";
export type ChatMessageStatus = "complete" | "error";
export type AdvisorResearchMode = "fast" | "deep";

export interface AppSettings {
  userName: string;
  openaiApiKey: string;
}

export interface BusinessDocument {
  id: string;
  title: string;
  kind: DocumentKind;
  starred: boolean;
  extension: string;
  content: string;
  lexicalState: string | null;
  tokenCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdvisorProfile {
  id: string;
  name: string;
  researchMode: AdvisorResearchMode;
  researchSourceUrls: string[];
  enabled: boolean;
  bio: string;
  quotes: string[];
  createdAt: string;
  updatedAt: string;
  lastResearchedAt: string | null;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  turnId: string;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
  advisorId?: string;
  advisorName?: string;
  sourceDocumentTitles?: string[];
  status?: ChatMessageStatus;
  error?: string;
}

export interface ChatThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface ChatState {
  threads: ChatThread[];
  activeThreadId: string | null;
  isRunning: boolean;
}

export interface AdvisorResearchState {
  activeJobId: string | null;
  advisorId: string | null;
  advisorName: string;
  startedAt: string | null;
}

export interface AppState {
  settings: AppSettings;
  documents: BusinessDocument[];
  advisors: AdvisorProfile[];
  chat: ChatState;
  advisorResearch: AdvisorResearchState;
}
