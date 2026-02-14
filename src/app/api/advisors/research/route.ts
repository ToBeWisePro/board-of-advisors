import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

interface ResearchRequestBody {
  apiKey?: unknown;
  advisorName?: unknown;
  userName?: unknown;
  businessContext?: unknown;
  model?: unknown;
}

interface ResearchResponsePayload {
  bio: string;
  quotes: string[];
}

const DEFAULT_MODEL = "o4-mini-deep-research";

const SYSTEM_PROMPT = [
  "You are a meticulous research assistant for a business strategy app.",
  "Return ONLY valid JSON and no markdown.",
  "Your JSON must match this schema exactly:",
  '{"bio":"string","quotes":["string"]}',
  "Rules:",
  "- bio must be 4 to 6 paragraphs, each with concrete, factual details.",
  "- quotes must be direct quotes attributable to the named person.",
  "- if a quote is disputed or uncertain, do not include it.",
  "- include short source context in parentheses after each quote when possible.",
  "- never include keys other than bio and quotes.",
].join("\n");

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

function normalizePayload(payload: unknown): ResearchResponsePayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Research response was not an object.");
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.bio !== "string") {
    throw new Error("Research response missing bio.");
  }

  const quotes = Array.isArray(record.quotes)
    ? record.quotes
        .filter((quote): quote is string => typeof quote === "string")
        .map((quote) => quote.trim())
        .filter((quote) => quote.length > 0)
    : [];

  return {
    bio: record.bio.trim(),
    quotes,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ResearchRequestBody;

    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const advisorName =
      typeof body.advisorName === "string" ? body.advisorName.trim() : "";
    const userName = typeof body.userName === "string" ? body.userName.trim() : "";
    const businessContext =
      typeof body.businessContext === "string" ? body.businessContext.trim() : "";
    const model =
      typeof body.model === "string" && body.model.trim().length > 0
        ? body.model.trim()
        : DEFAULT_MODEL;

    if (!apiKey) {
      return NextResponse.json(
        { error: "An OpenAI API key is required." },
        { status: 400 },
      );
    }

    if (!advisorName) {
      return NextResponse.json(
        { error: "Advisor name is required." },
        { status: 400 },
      );
    }

    const client = new OpenAI({ apiKey });

    const userPrompt = [
      `Advisor name: ${advisorName}`,
      `User name: ${userName || "Not provided"}`,
      "Task: Write a 4-6 paragraph biography and collect attributable direct quotes.",
      "Focus on business leadership style, decision-making patterns, strengths, weaknesses, and strategic perspective.",
      "Business context (may be partial):",
      businessContext || "No additional business context provided.",
    ].join("\n\n");

    const response = await client.responses.create({
      model,
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const parsed = normalizePayload(extractJsonBlock(response.output_text));

    return NextResponse.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Research failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
