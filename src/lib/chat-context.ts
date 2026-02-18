import type { BusinessDocument } from "@/lib/types";

export interface ChatContextDocument {
  id: string;
  title: string;
  content: string;
  tokenCount: number;
  starred: boolean;
  updatedAt: string;
}

const MAX_DOCUMENTS = 8;
const MAX_TOKENS = 12_000;
const MAX_CONTENT_CHARS = 3_500;

function sortDocumentsForChat(documents: BusinessDocument[]): BusinessDocument[] {
  return [...documents].sort((a, b) => {
    if (a.starred !== b.starred) {
      return a.starred ? -1 : 1;
    }

    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function selectDocumentsForChat(documents: BusinessDocument[]): ChatContextDocument[] {
  const sorted = sortDocumentsForChat(documents);
  const selected: ChatContextDocument[] = [];
  let runningTokenTotal = 0;

  for (const document of sorted) {
    if (selected.length >= MAX_DOCUMENTS) {
      break;
    }

    const nextTotal = runningTokenTotal + document.tokenCount;
    if (selected.length > 0 && nextTotal > MAX_TOKENS) {
      continue;
    }

    selected.push({
      id: document.id,
      title: document.title,
      content: document.content.slice(0, MAX_CONTENT_CHARS),
      tokenCount: document.tokenCount,
      starred: document.starred,
      updatedAt: document.updatedAt,
    });

    runningTokenTotal = nextTotal;
  }

  return selected;
}
