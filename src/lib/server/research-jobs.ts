import OpenAI from "openai";

interface ResearchJobParams {
  apiKey: string;
  advisorName: string;
  researchSourceUrls: string[];
  userName: string;
  businessContext: string;
}

interface ResearchResponsePayload {
  bio: string;
  quotes: string[];
}

type ResearchJobStatus = "running" | "succeeded" | "failed" | "cancelled";
type ResearchJobStage =
  | "queued"
  | "preparing_prompt"
  | "fetching_sources"
  | "sending_request"
  | "parsing_response"
  | "saving_result"
  | "succeeded"
  | "failed"
  | "cancelled";

interface ResearchJob {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: ResearchJobStatus;
  stage: ResearchJobStage;
  statusMessage: string;
  result: ResearchResponsePayload | null;
  error: string | null;
}

const MODEL = "gpt-4.1-mini";
const JOB_RETENTION_MS = 1000 * 60 * 60;
const OPENAI_TIMEOUT_MS = 1000 * 90;
const URL_FETCH_TIMEOUT_MS = 1000 * 12;
const URL_FETCH_CHAR_LIMIT = 6000;
const OPENAI_RESEARCH_HEARTBEAT_MS = 10000;
const jobs = new Map<string, ResearchJob>();

const SYSTEM_PROMPT = [
  "You are a meticulous research assistant for a business strategy app.",
  "Use ONLY the provided source excerpts below.",
  "Do not browse the web and do not use external sources.",
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

function createJobId(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return `research-${random}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function cleanupExpiredJobs() {
  const now = Date.now();

  for (const [jobId, job] of jobs.entries()) {
    const updatedTime = Date.parse(job.updatedAt);
    if (Number.isNaN(updatedTime)) {
      continue;
    }

    if (now - updatedTime > JOB_RETENTION_MS) {
      jobs.delete(jobId);
    }
  }
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

function fallbackPayloadFromText(raw: string): ResearchResponsePayload {
  const normalized = raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    throw new Error("Model response was empty.");
  }

  const quotes = Array.from(normalized.matchAll(/"([^"\n]{8,220})"/g))
    .map((match) => match[1]?.trim() ?? "")
    .filter((quote) => quote.length > 0)
    .slice(0, 8);

  const bio =
    normalized.length > 7000 ? `${normalized.slice(0, 7000).trimEnd()}...` : normalized;

  return {
    bio,
    quotes,
  };
}

function updateRunningJob(jobId: string, stage: ResearchJobStage, statusMessage: string) {
  const existingJob = jobs.get(jobId);
  if (!existingJob || existingJob.status !== "running") {
    return;
  }

  jobs.set(jobId, {
    ...existingJob,
    stage,
    statusMessage,
    updatedAt: nowIso(),
  });
}

function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchSourceExcerpt(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "board-of-advisors-research/1.0",
      },
    });

    if (!response.ok) {
      return `Source fetch failed (${response.status} ${response.statusText}).`;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const raw = await response.text();
    const text = contentType.includes("text/html") ? extractTextFromHtml(raw) : raw;
    const trimmed = text.trim();
    if (!trimmed) {
      return "Source returned no readable text.";
    }

    return trimmed.slice(0, URL_FETCH_CHAR_LIMIT);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return "Source fetch timed out.";
    }
    return "Source fetch failed.";
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runResearchJob(jobId: string, params: ResearchJobParams) {
  try {
    updateRunningJob(jobId, "preparing_prompt", "Preparing research instructions.");
    const client = new OpenAI({
      apiKey: params.apiKey,
      timeout: OPENAI_TIMEOUT_MS,
    });

    updateRunningJob(
      jobId,
      "fetching_sources",
      `Fetching ${params.researchSourceUrls.length} source URL(s).`,
    );
    const sourceTexts = await Promise.all(
      params.researchSourceUrls.map(async (url) => ({
        url,
        excerpt: await fetchSourceExcerpt(url),
      })),
    );

    const userPrompt = [
      `Advisor name: ${params.advisorName}`,
      `User name: ${params.userName || "Not provided"}`,
      "Task: Write a 4-6 paragraph biography and collect attributable direct quotes.",
      "Focus on business leadership style, decision-making patterns, strengths, weaknesses, and strategic perspective.",
      "Source excerpts (only use these sources):",
      ...sourceTexts.map(
        (source, index) =>
          `Source ${index + 1}: ${source.url}\nExcerpt:\n${source.excerpt}`,
      ),
    ].join("\n\n");

    const requestStartedAt = Date.now();
    updateRunningJob(
      jobId,
      "sending_request",
      "Submitting URL-only research request to OpenAI.",
    );
    const heartbeatId = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - requestStartedAt) / 1000);
      updateRunningJob(
        jobId,
        "sending_request",
        `OpenAI generation is running (${elapsedSeconds}s elapsed).`,
      );
    }, OPENAI_RESEARCH_HEARTBEAT_MS);

    let response;
    try {
      response = await client.responses.create({
        model: MODEL,
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      });
    } finally {
      clearInterval(heartbeatId);
    }

    updateRunningJob(jobId, "parsing_response", "Parsing research response.");
    const rawOutput = typeof response.output_text === "string" ? response.output_text : "";
    let parsed: ResearchResponsePayload;
    try {
      parsed = normalizePayload(extractJsonBlock(rawOutput));
    } catch {
      parsed = fallbackPayloadFromText(rawOutput);
    }
    updateRunningJob(jobId, "saving_result", "Saving advisor bio and quotes.");
    const now = nowIso();
    const existingJob = jobs.get(jobId);
    if (!existingJob || existingJob.status !== "running") {
      return;
    }

    jobs.set(jobId, {
      ...existingJob,
      status: "succeeded",
      stage: "succeeded",
      statusMessage: "Research completed.",
      result: parsed,
      error: null,
      updatedAt: now,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Research failed.";
    const now = nowIso();
    const existingJob = jobs.get(jobId);
    if (!existingJob || existingJob.status !== "running") {
      return;
    }

    const safeMessage = message.trim() || "Unknown error.";
    jobs.set(jobId, {
      ...existingJob,
      status: "failed",
      stage: "failed",
      statusMessage: `Research failed: ${safeMessage}`,
      result: null,
      error: safeMessage,
      updatedAt: now,
    });
  } finally {
    cleanupExpiredJobs();
  }
}

export function startResearchJob(params: ResearchJobParams): string {
  cleanupExpiredJobs();
  const now = nowIso();
  const jobId = createJobId();

  jobs.set(jobId, {
    id: jobId,
    createdAt: now,
    updatedAt: now,
    status: "running",
    stage: "queued",
    statusMessage: "Queued and waiting to start.",
    result: null,
    error: null,
  });

  void runResearchJob(jobId, params);

  return jobId;
}

export function getResearchJob(jobId: string): ResearchJob | null {
  cleanupExpiredJobs();
  return jobs.get(jobId) ?? null;
}

export function cancelResearchJob(jobId: string): ResearchJob | null {
  cleanupExpiredJobs();
  const existingJob = jobs.get(jobId);
  if (!existingJob) {
    return null;
  }

  if (existingJob.status !== "running") {
    return existingJob;
  }

  const cancelledJob: ResearchJob = {
    ...existingJob,
    status: "cancelled",
    stage: "cancelled",
    statusMessage: "Research cancelled by user.",
    result: null,
    error: "Research cancelled by user.",
    updatedAt: nowIso(),
  };

  jobs.set(jobId, cancelledJob);
  return cancelledJob;
}
