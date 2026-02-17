import { encodingForModel, getEncoding, type Tiktoken } from "js-tiktoken";

let encoder: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (encoder) {
    return encoder;
  }

  try {
    encoder = encodingForModel("gpt-4o-mini");
  } catch {
    encoder = getEncoding("cl100k_base");
  }

  return encoder;
}

export function countTokens(text: string): number {
  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }

  const activeEncoder = getEncoder();
  return activeEncoder.encode(normalized).length;
}
