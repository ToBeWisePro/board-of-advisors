import type {
  AppState,
  BusinessDocument,
  AdvisorProfile,
  ChatMessage,
  ChatMessageRole,
  ChatThread,
} from "@/lib/types";

export const LOCAL_STORAGE_KEY = "board-of-advisors.v1";

export const DEFAULT_STATE: AppState = {
  settings: {
    userName: "",
    openaiApiKey: "",
  },
  documents: [],
  advisors: [],
  chat: {
    threads: [],
    activeThreadId: null,
    isRunning: false,
  },
  advisorResearch: {
    activeJobId: null,
    advisorId: null,
    advisorName: "",
    startedAt: null,
  },
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
    researchMode: "fast",
    researchSourceUrls: [],
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

function sanitizeChatRole(role: unknown): ChatMessageRole {
  if (
    role === "user" ||
    role === "advisor" ||
    role === "synthesis" ||
    role === "system"
  ) {
    return role;
  }

  return "system";
}

function sanitizeChatMessage(raw: unknown, fallbackThreadId: string): ChatMessage | null {
  if (!isObjectLike(raw)) {
    return null;
  }

  const content = typeof raw.content === "string" ? raw.content.trim() : "";
  if (!content) {
    return null;
  }

  return {
    id: typeof raw.id === "string" && raw.id.length > 0 ? raw.id : createId("msg"),
    threadId:
      typeof raw.threadId === "string" && raw.threadId.length > 0
        ? raw.threadId
        : fallbackThreadId,
    turnId:
      typeof raw.turnId === "string" && raw.turnId.length > 0
        ? raw.turnId
        : createId("turn"),
    role: sanitizeChatRole(raw.role),
    content,
    createdAt:
      typeof raw.createdAt === "string" && raw.createdAt.length > 0
        ? raw.createdAt
        : nowIso(),
    advisorId: typeof raw.advisorId === "string" ? raw.advisorId : undefined,
    advisorName: typeof raw.advisorName === "string" ? raw.advisorName : undefined,
    sourceDocumentTitles: Array.isArray(raw.sourceDocumentTitles)
      ? raw.sourceDocumentTitles.filter(
          (title): title is string => typeof title === "string" && title.length > 0,
        )
      : undefined,
    status:
      raw.status === "complete" || raw.status === "error" ? raw.status : undefined,
    error: typeof raw.error === "string" ? raw.error : undefined,
  };
}

function sanitizeChatThread(raw: unknown): ChatThread | null {
  if (!isObjectLike(raw)) {
    return null;
  }

  const threadId =
    typeof raw.id === "string" && raw.id.length > 0 ? raw.id : createId("thread");
  const messagesRaw = Array.isArray(raw.messages) ? raw.messages : [];
  const messages = messagesRaw
    .map((item) => sanitizeChatMessage(item, threadId))
    .filter((item): item is ChatMessage => item !== null);

  return {
    id: threadId,
    title:
      typeof raw.title === "string" && raw.title.trim().length > 0
        ? raw.title
        : "Untitled chat",
    createdAt:
      typeof raw.createdAt === "string" && raw.createdAt.length > 0
        ? raw.createdAt
        : nowIso(),
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt.length > 0
        ? raw.updatedAt
        : nowIso(),
    messages,
  };
}

export function sanitizeState(raw: unknown): AppState {
  if (!isObjectLike(raw)) {
    return DEFAULT_STATE;
  }

  const settingsRaw = isObjectLike(raw.settings) ? raw.settings : {};
  const documentsRaw = Array.isArray(raw.documents) ? raw.documents : [];
  const advisorsRaw = Array.isArray(raw.advisors) ? raw.advisors : [];
  const chatRaw = isObjectLike(raw.chat) ? raw.chat : {};
  const advisorResearchRaw = isObjectLike(raw.advisorResearch)
    ? raw.advisorResearch
    : {};

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
      researchMode: "fast",
      researchSourceUrls: Array.isArray(item.researchSourceUrls)
        ? item.researchSourceUrls.filter(
            (url): url is string => typeof url === "string" && url.length > 0,
          )
        : typeof item.researchSourceUrl === "string" && item.researchSourceUrl.length > 0
          ? [item.researchSourceUrl]
          : [],
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

  const chatThreadsRaw = Array.isArray(chatRaw.threads) ? chatRaw.threads : [];
  const chatThreads = chatThreadsRaw
    .map((thread) => sanitizeChatThread(thread))
    .filter((thread): thread is ChatThread => thread !== null);

  const activeThreadId =
    typeof chatRaw.activeThreadId === "string" &&
    chatThreads.some((thread) => thread.id === chatRaw.activeThreadId)
      ? chatRaw.activeThreadId
      : chatThreads[0]?.id ?? null;

  return {
    settings,
    documents,
    advisors,
    chat: {
      threads: chatThreads,
      activeThreadId,
      isRunning: false,
    },
    advisorResearch: {
      activeJobId:
        typeof advisorResearchRaw.activeJobId === "string" &&
        advisorResearchRaw.activeJobId.length > 0
          ? advisorResearchRaw.activeJobId
          : null,
      advisorId:
        typeof advisorResearchRaw.advisorId === "string" &&
        advisors.some((advisor) => advisor.id === advisorResearchRaw.advisorId)
          ? advisorResearchRaw.advisorId
          : null,
      advisorName:
        typeof advisorResearchRaw.advisorName === "string"
          ? advisorResearchRaw.advisorName
          : "",
      startedAt:
        typeof advisorResearchRaw.startedAt === "string" &&
        advisorResearchRaw.startedAt.length > 0
          ? advisorResearchRaw.startedAt
          : null,
    },
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
