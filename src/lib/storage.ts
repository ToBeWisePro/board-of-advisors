import type { AppState, BusinessDocument, AdvisorProfile } from "@/lib/types";

export const LOCAL_STORAGE_KEY = "board-of-advisors.v1";

export const DEFAULT_STATE: AppState = {
  settings: {
    userName: "",
    openaiApiKey: "",
  },
  documents: [],
  advisors: [],
};

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return `${prefix}-${random}`;
}

export function createEditableDocument(title: string): BusinessDocument {
  const now = nowIso();

  return {
    id: createId("doc"),
    title: title.trim() || "Untitled Draft",
    kind: "editable",
    starred: false,
    extension: "lexical",
    content: "",
    lexicalState: null,
    tokenCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function createUploadedDocument(params: {
  title: string;
  extension: string;
  content: string;
  tokenCount: number;
}): BusinessDocument {
  const now = nowIso();

  return {
    id: createId("doc"),
    title: params.title.trim() || "Uploaded Document",
    kind: "uploaded",
    starred: false,
    extension: params.extension,
    content: params.content,
    lexicalState: null,
    tokenCount: params.tokenCount,
    createdAt: now,
    updatedAt: now,
  };
}

export function createAdvisor(name: string): AdvisorProfile {
  const now = nowIso();

  return {
    id: createId("advisor"),
    name: name.trim(),
    enabled: true,
    bio: "",
    quotes: [],
    createdAt: now,
    updatedAt: now,
    lastResearchedAt: null,
  };
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function sanitizeState(raw: unknown): AppState {
  if (!isObjectLike(raw)) {
    return DEFAULT_STATE;
  }

  const settingsRaw = isObjectLike(raw.settings) ? raw.settings : {};
  const documentsRaw = Array.isArray(raw.documents) ? raw.documents : [];
  const advisorsRaw = Array.isArray(raw.advisors) ? raw.advisors : [];

  const settings = {
    userName:
      typeof settingsRaw.userName === "string" ? settingsRaw.userName : "",
    openaiApiKey:
      typeof settingsRaw.openaiApiKey === "string"
        ? settingsRaw.openaiApiKey
        : "",
  };

  const documents: BusinessDocument[] = documentsRaw
    .filter((item): item is Record<string, unknown> => isObjectLike(item))
    .map((item) => ({
      id:
        typeof item.id === "string" && item.id.length > 0
          ? item.id
          : createId("doc"),
      title: typeof item.title === "string" ? item.title : "Untitled",
      kind: item.kind === "uploaded" ? "uploaded" : "editable",
      starred: item.starred === true,
      extension: typeof item.extension === "string" ? item.extension : "txt",
      content: typeof item.content === "string" ? item.content : "",
      lexicalState:
        typeof item.lexicalState === "string" ? item.lexicalState : null,
      tokenCount:
        typeof item.tokenCount === "number" && Number.isFinite(item.tokenCount)
          ? item.tokenCount
          : 0,
      createdAt:
        typeof item.createdAt === "string" && item.createdAt.length > 0
          ? item.createdAt
          : nowIso(),
      updatedAt:
        typeof item.updatedAt === "string" && item.updatedAt.length > 0
          ? item.updatedAt
          : nowIso(),
    }));

  const advisors: AdvisorProfile[] = advisorsRaw
    .filter((item): item is Record<string, unknown> => isObjectLike(item))
    .map((item) => ({
      id:
        typeof item.id === "string" && item.id.length > 0
          ? item.id
          : createId("advisor"),
      name: typeof item.name === "string" ? item.name : "",
      enabled: item.enabled !== false,
      bio: typeof item.bio === "string" ? item.bio : "",
      quotes: Array.isArray(item.quotes)
        ? item.quotes.filter((quote): quote is string => typeof quote === "string")
        : [],
      createdAt:
        typeof item.createdAt === "string" && item.createdAt.length > 0
          ? item.createdAt
          : nowIso(),
      updatedAt:
        typeof item.updatedAt === "string" && item.updatedAt.length > 0
          ? item.updatedAt
          : nowIso(),
      lastResearchedAt:
        typeof item.lastResearchedAt === "string" ? item.lastResearchedAt : null,
    }));

  return {
    settings,
    documents,
    advisors,
  };
}

export function formatDate(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown date";
  }

  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
