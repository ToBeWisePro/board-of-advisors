import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const PRIMARY_CHAT_MODEL = "gpt-4.1-mini";
const FALLBACK_CHAT_MODEL = "gpt-4o-mini";

interface AdvisorInput {
  id: string;
  name: string;
  bio: string;
  quotes: string[];
}

interface DocumentInput {
  id: string;
  title: string;
  content: string;
  tokenCount: number;
  starred: boolean;
  updatedAt: string;
}

interface DebateRequestBody {
  apiKey?: unknown;
  userName?: unknown;
  message?: unknown;
  advisors?: unknown;
  documents?: unknown;
  threadId?: unknown;
  turnId?: unknown;
}

interface ModelPayload {
  response: string;
  sourceDocumentTitles: string[];
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractJsonBlock(raw: string): unknown {
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error("Empty model response.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to fallback parsing.
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) {
    return JSON.parse(fencedMatch[1].trim());
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }

  throw new Error("Could not parse JSON from model response.");
}

function normalizeModelPayload(payload: unknown): ModelPayload {
  if (!isObjectLike(payload)) {
    throw new Error("Model payload was not an object.");
  }

  const response = typeof payload.response === "string" ? payload.response.trim() : "";
  if (!response) {
    throw new Error("Model payload missing response.");
  }

  const sourceDocumentTitles = Array.isArray(payload.sourceDocumentTitles)
    ? payload.sourceDocumentTitles
        .filter((title): title is string => typeof title === "string")
        .map((title) => title.trim())
        .filter((title) => title.length > 0)
    : [];

  return {
    response,
    sourceDocumentTitles,
  };
}

function shouldRetryWithFallback(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (!message) {
    return false;
  }

  return (
    message.includes("model") &&
    (message.includes("not found") ||
      message.includes("does not exist") ||
      message.includes("unsupported") ||
      message.includes("unavailable"))
  );
}

async function createResponseWithFallback(params: {
  client: OpenAI;
  systemPrompt: string;
  userPrompt: string;
}) {
  const { client, systemPrompt, userPrompt } = params;

  try {
    return await client.responses.create({
      model: PRIMARY_CHAT_MODEL,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
  } catch (error) {
    if (!shouldRetryWithFallback(error)) {
      throw error;
    }

    return client.responses.create({
      model: FALLBACK_CHAT_MODEL,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
  }
}

function normalizeAdvisors(input: unknown): AdvisorInput[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((item): item is Record<string, unknown> => isObjectLike(item))
    .map((item) => ({
      id: typeof item.id === "string" ? item.id.trim() : "",
      name: typeof item.name === "string" ? item.name.trim() : "",
      bio: typeof item.bio === "string" ? item.bio.trim() : "",
      quotes: Array.isArray(item.quotes)
        ? item.quotes
            .filter((quote): quote is string => typeof quote === "string")
            .map((quote) => quote.trim())
            .filter((quote) => quote.length > 0)
        : [],
    }))
    .filter((advisor) => advisor.id.length > 0 && advisor.name.length > 0);
}

function normalizeDocuments(input: unknown): DocumentInput[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((item): item is Record<string, unknown> => isObjectLike(item))
    .map((item) => ({
      id: typeof item.id === "string" ? item.id.trim() : "",
      title: typeof item.title === "string" ? item.title.trim() : "",
      content: typeof item.content === "string" ? item.content : "",
      tokenCount:
        typeof item.tokenCount === "number" && Number.isFinite(item.tokenCount)
          ? item.tokenCount
          : 0,
      starred: item.starred === true,
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
    }))
    .filter((document) => document.id.length > 0 && document.title.length > 0);
}

function buildDocumentBlock(documents: DocumentInput[]): string {
  if (documents.length === 0) {
    return "No supporting documents were provided.";
  }

  return documents
    .map((document, index) => {
      return [
        `Document ${index + 1}: ${document.title}`,
        `Token count: ${document.tokenCount}`,
        `Starred: ${document.starred ? "Yes" : "No"}`,
        "Excerpt:",
        document.content || "(empty)",
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

async function runAdvisorTurn(params: {
  client: OpenAI;
  userName: string;
  message: string;
  advisor: AdvisorInput;
  documents: DocumentInput[];
  threadId: string;
  turnId: string;
}): Promise<{ advisorId: string; advisorName: string; content: string; sourceDocumentTitles: string[] }> {
  const { client, userName, message, advisor, documents, threadId, turnId } = params;

  const systemPrompt = [
    "You are an advisor persona in a business strategy debate.",
    "Stay faithful to the advisor profile and voice.",
    "Give practical and specific recommendations.",
    "Only cite source document titles that are provided in the prompt.",
    "Return ONLY valid JSON with this schema:",
    '{"response":"string","sourceDocumentTitles":["string"]}',
  ].join("\n");

  const userPrompt = [
    `Thread ID: ${threadId}`,
    `Turn ID: ${turnId}`,
    `User name: ${userName || "Not provided"}`,
    `User question: ${message}`,
    "",
    "Advisor profile:",
    `Name: ${advisor.name}`,
    `Bio: ${advisor.bio || "No bio provided."}`,
    `Quotes: ${advisor.quotes.length > 0 ? advisor.quotes.join(" | ") : "No quotes provided."}`,
    "",
    "Business context documents:",
    buildDocumentBlock(documents),
  ].join("\n");

  const response = await createResponseWithFallback({
    client,
    systemPrompt,
    userPrompt,
  });

  const payload = normalizeModelPayload(extractJsonBlock(response.output_text));

  return {
    advisorId: advisor.id,
    advisorName: advisor.name,
    content: payload.response,
    sourceDocumentTitles: payload.sourceDocumentTitles,
  };
}

async function runSynthesisTurn(params: {
  client: OpenAI;
  userName: string;
  message: string;
  advisorMessages: Array<{
    advisorId: string;
    advisorName: string;
    content: string;
    sourceDocumentTitles: string[];
  }>;
  threadId: string;
  turnId: string;
}): Promise<{ content: string; sourceDocumentTitles: string[] }> {
  const { client, userName, message, advisorMessages, threadId, turnId } = params;

  const systemPrompt = [
    "You are a neutral synthesis assistant for an advisor debate.",
    "Merge competing viewpoints into one actionable recommendation.",
    "Call out critical tradeoffs and execution risks.",
    "Return ONLY valid JSON with this schema:",
    '{"response":"string","sourceDocumentTitles":["string"]}',
  ].join("\n");

  const advisorBlock = advisorMessages
    .map(
      (item, index) =>
        [
          `Advisor ${index + 1}: ${item.advisorName} (${item.advisorId})`,
          `Response: ${item.content}`,
          `Source titles: ${
            item.sourceDocumentTitles.length > 0
              ? item.sourceDocumentTitles.join(", ")
              : "None"
          }`,
        ].join("\n"),
    )
    .join("\n\n---\n\n");

  const userPrompt = [
    `Thread ID: ${threadId}`,
    `Turn ID: ${turnId}`,
    `User name: ${userName || "Not provided"}`,
    `Original question: ${message}`,
    "",
    "Advisor responses to synthesize:",
    advisorBlock,
  ].join("\n");

  const response = await createResponseWithFallback({
    client,
    systemPrompt,
    userPrompt,
  });

  const payload = normalizeModelPayload(extractJsonBlock(response.output_text));

  return {
    content: payload.response,
    sourceDocumentTitles: payload.sourceDocumentTitles,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DebateRequestBody;

    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const userName = typeof body.userName === "string" ? body.userName.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const threadId = typeof body.threadId === "string" ? body.threadId.trim() : "";
    const turnId = typeof body.turnId === "string" ? body.turnId.trim() : "";
    const advisors = normalizeAdvisors(body.advisors);
    const documents = normalizeDocuments(body.documents);

    if (!apiKey) {
      return NextResponse.json({ error: "An OpenAI API key is required." }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    if (!threadId || !turnId) {
      return NextResponse.json(
        { error: "threadId and turnId are required." },
        { status: 400 },
      );
    }

    if (advisors.length === 0) {
      return NextResponse.json(
        { error: "At least one advisor is required." },
        { status: 400 },
      );
    }

    const client = new OpenAI({ apiKey });

    const advisorResults = await Promise.allSettled(
      advisors.map((advisor) =>
        runAdvisorTurn({
          client,
          userName,
          message,
          advisor,
          documents,
          threadId,
          turnId,
        }),
      ),
    );

    const advisorMessages = advisorResults
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<{
          advisorId: string;
          advisorName: string;
          content: string;
          sourceDocumentTitles: string[];
        }> => result.status === "fulfilled",
      )
      .map((result) => result.value);

    if (advisorMessages.length === 0) {
      return NextResponse.json(
        { error: "All advisor responses failed." },
        { status: 500 },
      );
    }

    const warnings = advisorResults
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) =>
        result.reason instanceof Error ? result.reason.message : "Advisor response failed.",
      );

    const synthesisMessage = await runSynthesisTurn({
      client,
      userName,
      message,
      advisorMessages,
      threadId,
      turnId,
    });

    return NextResponse.json({
      advisorMessages,
      synthesisMessage,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Debate failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
