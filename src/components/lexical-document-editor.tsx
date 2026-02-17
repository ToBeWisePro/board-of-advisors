"use client";

import { useMemo } from "react";
import { $getRoot } from "lexical";
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";

interface LexicalDocumentEditorProps {
  initialEditorState: string | null;
  onChange: (payload: { plainText: string; serializedState: string }) => void;
}

const lexicalTheme = {
  paragraph: "editor-paragraph",
  text: {
    bold: "editor-bold",
    italic: "editor-italic",
    underline: "editor-underline",
  },
};

export function LexicalDocumentEditor({
  initialEditorState,
  onChange,
}: LexicalDocumentEditorProps) {
  const initialConfig = useMemo(
    () => ({
      namespace: "board-advisor-document-editor",
      onError(error: Error) {
        throw error;
      },
      theme: lexicalTheme,
      editorState: initialEditorState ?? undefined,
    }),
    [initialEditorState],
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="lexical-shell">
        <RichTextPlugin
          contentEditable={
            <ContentEditable className="lexical-input" aria-label="Document editor" />
          }
          placeholder={
            <p className="pointer-events-none absolute top-3 left-4 text-sm text-[#7f6f62]">
              Draft business context, priorities, constraints, and open questions here...
            </p>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <AutoFocusPlugin />
        <OnChangePlugin
          onChange={(editorState) => {
            const serializedState = JSON.stringify(editorState.toJSON());
            editorState.read(() => {
              const plainText = $getRoot().getTextContent();
              onChange({ plainText, serializedState });
            });
          }}
        />
      </div>
    </LexicalComposer>
  );
}
