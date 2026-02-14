# Board of Advisors

A local-first Next.js app for preparing a debate-style advisory council.

## What It Does Today

- Stores user settings locally (name, OpenAI API key, research model).
- Lets users create editable business documents with a Lexical editor.
- Lets users upload uneditable text-based documents (`.docx`, `.xls/.xlsx`, `.txt`, `.md`, `.json`, `.xml`, `.csv`, and similar text formats).
- Rejects unsupported uploads (`.pdf`, PowerPoint files, image files).
- Uses tiktoken to calculate and display token counts for each document.
- Lets users create advisors, enable/disable them, run research, and edit bios/quotes.
- Runs advisor research through OpenAI using the user-provided API key (no `.env` key required).

## Local Data Model

All app data is saved in browser local storage. Nothing is persisted to a database yet.

## Development

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Quality Checks

```bash
pnpm lint
pnpm build
```

## Deploying to Vercel

This is a standard Next.js App Router project and can be deployed directly on Vercel.

No OpenAI server key env var is required for this template because users supply their own API key in app settings.
