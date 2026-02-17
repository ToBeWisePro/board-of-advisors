export type AppTab = "settings" | "documents" | "advisors" | "chat";

export type DocumentKind = "editable" | "uploaded";

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
  enabled: boolean;
  bio: string;
  quotes: string[];
  createdAt: string;
  updatedAt: string;
  lastResearchedAt: string | null;
}

export interface AppState {
  settings: AppSettings;
  documents: BusinessDocument[];
  advisors: AdvisorProfile[];
}
