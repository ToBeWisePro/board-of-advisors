import { NextResponse } from "next/server";
import {
  cancelResearchJob,
  getResearchJob,
  startResearchJob,
} from "@/lib/server/research-jobs";

export const runtime = "nodejs";

interface ResearchRequestBody {
  apiKey?: unknown;
  advisorName?: unknown;
  researchSourceUrls?: unknown;
  researchSourceUrl?: unknown;
  userName?: unknown;
  businessContext?: unknown;
}

function normalizeResearchSourceUrls(values: unknown, legacyValue: unknown): string[] {
  const rawValues: string[] = [];
  const appendValues = (candidate: unknown) => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        if (typeof item === "string") {
          rawValues.push(...item.split(/\r?\n|,/));
        }
      }
      return;
    }

    if (typeof candidate === "string") {
      rawValues.push(...candidate.split(/\r?\n|,/));
    }
  };

  appendValues(values);
  appendValues(legacyValue);

  const parsedUrls = rawValues.map((value) => {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) {
      return "";
    }

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error("Each research source URL must be a valid URL.");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Research source URLs must start with http:// or https://.");
    }

    return parsed.toString();
  });

  return [...new Set(parsedUrls.filter((url) => url.length > 0))];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ResearchRequestBody;

    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const advisorName =
      typeof body.advisorName === "string" ? body.advisorName.trim() : "";
    const researchSourceUrls = normalizeResearchSourceUrls(
      body.researchSourceUrls,
      body.researchSourceUrl,
    );
    const userName = typeof body.userName === "string" ? body.userName.trim() : "";
    const businessContext =
      typeof body.businessContext === "string" ? body.businessContext.trim() : "";

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

    if (researchSourceUrls.length === 0) {
      return NextResponse.json(
        { error: "At least one source URL is required for research." },
        { status: 400 },
      );
    }

    const jobId = startResearchJob({
      apiKey,
      advisorName,
      researchSourceUrls,
      userName,
      businessContext,
    });

    return NextResponse.json({ jobId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Research failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId")?.trim() ?? "";

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }

  const job = getResearchJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Research job not found." }, { status: 404 });
  }

  if (job.status === "succeeded" && job.result) {
    return NextResponse.json({
      status: "succeeded",
      stage: job.stage,
      message: job.statusMessage,
      updatedAt: job.updatedAt,
      bio: job.result.bio,
      quotes: job.result.quotes,
    });
  }

  if (job.status === "failed") {
    return NextResponse.json({
      status: "failed",
      stage: job.stage,
      message: job.statusMessage,
      updatedAt: job.updatedAt,
      error: job.error ?? "Research failed.",
    });
  }

  if (job.status === "cancelled") {
    return NextResponse.json({
      status: "cancelled",
      stage: job.stage,
      message: job.statusMessage,
      updatedAt: job.updatedAt,
      error: job.error ?? "Research cancelled.",
    });
  }

  return NextResponse.json({
    status: "running",
    stage: job.stage,
    message: job.statusMessage,
    updatedAt: job.updatedAt,
  });
}

export function DELETE(request: Request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId")?.trim() ?? "";

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }

  const existingJob = getResearchJob(jobId);
  if (!existingJob) {
    return NextResponse.json({ error: "Research job not found." }, { status: 404 });
  }

  if (existingJob.status === "succeeded") {
    return NextResponse.json(
      { error: "Research already completed." },
      { status: 409 },
    );
  }

  if (existingJob.status === "failed") {
    return NextResponse.json({ status: "failed", error: existingJob.error }, { status: 200 });
  }

  const cancelledJob = cancelResearchJob(jobId);
  if (!cancelledJob) {
    return NextResponse.json({ error: "Research job not found." }, { status: 404 });
  }

  return NextResponse.json({
    status: cancelledJob.status,
    error: cancelledJob.error,
  });
}
