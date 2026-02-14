import { NextResponse } from "next/server";

import { countTokens } from "@/lib/server/tokenizer";

export const runtime = "nodejs";

interface TokenCountRequestBody {
  text?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TokenCountRequestBody;

    if (typeof body.text !== "string") {
      return NextResponse.json({ error: "Expected text input." }, { status: 400 });
    }

    return NextResponse.json({ tokenCount: countTokens(body.text) });
  } catch {
    return NextResponse.json(
      { error: "Failed to calculate token count." },
      { status: 400 },
    );
  }
}
