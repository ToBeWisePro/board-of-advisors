"use client";

import { useEffect, useMemo, useState } from "react";

import { LexicalDocumentEditor } from "@/components/lexical-document-editor";
import {
  createAdvisor,
  createEditableDocument,
  createUploadedDocument,
  DEFAULT_STATE,
  formatDate,
  LOCAL_STORAGE_KEY,
  sanitizeState,
} from "@/lib/storage";
import type {
  AdvisorProfile,
  AppState,
  AppTab,
  BusinessDocument,
} from "@/lib/types";

const UPLOAD_ACCEPT_LIST =
  ".docx,.xlsx,.xls,.txt,.md,.markdown,.json,.yaml,.yml,.xml,.html,.htm,.csv,.tsv,.log,.rtf";

const TAB_LABELS: { id: AppTab; label: string; description: string }[] = [
  {
    id: "settings",
    label: "Settings",
    description: "API key + profile",
  },
  {
    id: "documents",
    label: "Documents",
    description: "Business context library",
  },
  {
    id: "advisors",
    label: "Advisors",
    description: "Research + configure personas",
  },
  {
    id: "chat",
    label: "Debate Chat",
    description: "Agent swarm (coming next)",
  },
];

interface IngestResponse {
  content: string;
  tokenCount: number;
  extension: string;
  error?: string;
}

interface TokenCountResponse {
  tokenCount: number;
  error?: string;
}

interface ResearchResponse {
  bio: string;
  quotes: string[];
  error?: string;
}

type DocumentKindFilter = "all" | "editable" | "uploaded";
type DocumentStarFilter = "all" | "starred";
type DocumentSort = "updated" | "title" | "tokens";

function sortDocuments(documents: BusinessDocument[], mode: DocumentSort) {
  const sortable = [...documents];

  if (mode === "title") {
    sortable.sort((a, b) => a.title.localeCompare(b.title));
    return sortable;
  }

  if (mode === "tokens") {
    sortable.sort((a, b) => b.tokenCount - a.tokenCount);
    return sortable;
  }

  sortable.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return sortable;
}

function buildBusinessContext(documents: BusinessDocument[]): string {
  if (!documents.length) {
    return "";
  }

  return documents
    .slice(0, 6)
    .map((document) => {
      const snippet = document.content.slice(0, 3500);
      return [
        `Document title: ${document.title}`,
        `Document type: ${document.extension}`,
        `Token count: ${document.tokenCount}`,
        "Content excerpt:",
        snippet,
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

function quotesToTextAreaValue(quotes: string[]): string {
  return quotes.join("\n");
}

function textAreaValueToQuotes(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function nowIso(): string {
  return new Date().toISOString();
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function BoardAdvisorsApp() {
  const [appState, setAppState] = useState<AppState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>("documents");

  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    null,
  );
  const [selectedAdvisorId, setSelectedAdvisorId] = useState<string | null>(null);

  const [newDocumentTitle, setNewDocumentTitle] = useState("");
  const [newAdvisorName, setNewAdvisorName] = useState("");
  const [documentQuery, setDocumentQuery] = useState("");
  const [documentKindFilter, setDocumentKindFilter] =
    useState<DocumentKindFilter>("all");
  const [documentStarFilter, setDocumentStarFilter] =
    useState<DocumentStarFilter>("all");
  const [documentSort, setDocumentSort] = useState<DocumentSort>("updated");

  const [uploadError, setUploadError] = useState("");
  const [advisorError, setAdvisorError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const [isUploading, setIsUploading] = useState(false);
  const [isSavingDocument, setIsSavingDocument] = useState(false);
  const [researchingAdvisorId, setResearchingAdvisorId] = useState<string | null>(
    null,
  );

  const [draftContent, setDraftContent] = useState("");
  const [draftLexicalState, setDraftLexicalState] = useState<string | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [documentTitleDraft, setDocumentTitleDraft] = useState("");

  useEffect(() => {
    try {
      const rawState = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (rawState) {
        const parsed = JSON.parse(rawState) as unknown;
        setAppState(sanitizeState(parsed));
      }
    } catch {
      setAppState(DEFAULT_STATE);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(appState));
  }, [appState, hydrated]);

  useEffect(() => {
    if (!appState.documents.length) {
      setSelectedDocumentId(null);
      return;
    }

    if (
      !selectedDocumentId ||
      !appState.documents.some((document) => document.id === selectedDocumentId)
    ) {
      setSelectedDocumentId(appState.documents[0].id);
    }
  }, [appState.documents, selectedDocumentId]);

  useEffect(() => {
    if (!appState.advisors.length) {
      setSelectedAdvisorId(null);
      return;
    }

    if (
      !selectedAdvisorId ||
      !appState.advisors.some((advisor) => advisor.id === selectedAdvisorId)
    ) {
      setSelectedAdvisorId(appState.advisors[0].id);
    }
  }, [appState.advisors, selectedAdvisorId]);

  const selectedDocument = useMemo(
    () =>
      selectedDocumentId
        ? appState.documents.find((document) => document.id === selectedDocumentId) ??
          null
        : null,
    [appState.documents, selectedDocumentId],
  );

  const selectedAdvisor = useMemo(
    () =>
      selectedAdvisorId
        ? appState.advisors.find((advisor) => advisor.id === selectedAdvisorId) ??
          null
        : null,
    [appState.advisors, selectedAdvisorId],
  );

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = documentQuery.trim().toLowerCase();

    const matches = appState.documents.filter((document) => {
      if (documentKindFilter !== "all" && document.kind !== documentKindFilter) {
        return false;
      }

      if (documentStarFilter === "starred" && !document.starred) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return (
        document.title.toLowerCase().includes(normalizedQuery) ||
        document.extension.toLowerCase().includes(normalizedQuery)
      );
    });

    return sortDocuments(matches, documentSort);
  }, [appState.documents, documentKindFilter, documentQuery, documentSort, documentStarFilter]);

  const starredDocuments = useMemo(
    () => filteredDocuments.filter((document) => document.starred),
    [filteredDocuments],
  );

  const regularDocuments = useMemo(
    () => filteredDocuments.filter((document) => !document.starred),
    [filteredDocuments],
  );

  const totalDocumentTokens = useMemo(
    () => appState.documents.reduce((sum, document) => sum + document.tokenCount, 0),
    [appState.documents],
  );

  useEffect(() => {
    if (!selectedDocument) {
      setDocumentTitleDraft("");
      setDraftContent("");
      setDraftLexicalState(null);
      setDraftDirty(false);
      return;
    }

    setDocumentTitleDraft(selectedDocument.title);

    if (!selectedDocument || selectedDocument.kind !== "editable") {
      setDraftContent("");
      setDraftLexicalState(null);
      setDraftDirty(false);
      return;
    }

    setDraftContent(selectedDocument.content);
    setDraftLexicalState(selectedDocument.lexicalState);
    setDraftDirty(false);
  }, [selectedDocument]);

  useEffect(() => {
    if (!filteredDocuments.length) {
      return;
    }

    if (
      selectedDocumentId &&
      filteredDocuments.some((document) => document.id === selectedDocumentId)
    ) {
      return;
    }

    setSelectedDocumentId(filteredDocuments[0].id);
  }, [filteredDocuments, selectedDocumentId]);

  function updateSettings<K extends keyof AppState["settings"]>(
    field: K,
    value: AppState["settings"][K],
  ) {
    setAppState((previous) => ({
      ...previous,
      settings: {
        ...previous.settings,
        [field]: value,
      },
    }));
  }

  function updateAdvisor(
    advisorId: string,
    updater: (advisor: AdvisorProfile) => AdvisorProfile,
  ) {
    setAppState((previous) => ({
      ...previous,
      advisors: previous.advisors.map((advisor) =>
        advisor.id === advisorId ? updater(advisor) : advisor,
      ),
    }));
  }

  function updateDocument(
    documentId: string,
    updater: (document: BusinessDocument) => BusinessDocument,
  ) {
    setAppState((previous) => ({
      ...previous,
      documents: previous.documents.map((document) =>
        document.id === documentId ? updater(document) : document,
      ),
    }));
  }

  async function requestTokenCount(text: string): Promise<number> {
    const response = await fetch("/api/documents/token-count", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    const payload = (await response.json()) as TokenCountResponse;

    if (!response.ok) {
      throw new Error(payload.error || "Failed to calculate token count.");
    }

    return payload.tokenCount;
  }

  function handleCreateEditableDocument() {
    const document = createEditableDocument(newDocumentTitle);

    setAppState((previous) => ({
      ...previous,
      documents: [document, ...previous.documents],
    }));

    setNewDocumentTitle("");
    setSelectedDocumentId(document.id);
    setActiveTab("documents");
    setStatusMessage(`Created editable document: ${document.title}`);
    setUploadError("");
  }

  async function ingestSingleFile(file: File): Promise<BusinessDocument> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/documents/ingest", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json()) as IngestResponse;

    if (!response.ok) {
      throw new Error(payload.error || `Failed to parse ${file.name}.`);
    }

    return createUploadedDocument({
      title: file.name,
      extension: payload.extension,
      content: payload.content,
      tokenCount: payload.tokenCount,
    });
  }

  async function handleUploadFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) {
      return;
    }

    setIsUploading(true);
    setUploadError("");
    setStatusMessage("");

    const files = Array.from(fileList);
    const successfulUploads: BusinessDocument[] = [];
    const failedUploads: string[] = [];

    for (const file of files) {
      try {
        const document = await ingestSingleFile(file);
        successfulUploads.push(document);
      } catch (error) {
        failedUploads.push(`${file.name}: ${safeErrorMessage(error)}`);
      }
    }

    if (successfulUploads.length > 0) {
      setAppState((previous) => ({
        ...previous,
        documents: [...successfulUploads, ...previous.documents],
      }));
      setSelectedDocumentId(successfulUploads[0].id);
      setStatusMessage(`Uploaded ${successfulUploads.length} document(s).`);
    }

    if (failedUploads.length > 0) {
      setUploadError(failedUploads.join(" "));
    }

    setIsUploading(false);
    event.target.value = "";
  }

  async function handleSaveEditableDocument() {
    if (!selectedDocument || selectedDocument.kind !== "editable") {
      return;
    }

    setIsSavingDocument(true);
    setUploadError("");

    try {
      const tokenCount = await requestTokenCount(draftContent);
      const updatedAt = nowIso();

      setAppState((previous) => ({
        ...previous,
        documents: previous.documents.map((document) => {
          if (document.id !== selectedDocument.id) {
            return document;
          }

          return {
            ...document,
            content: draftContent,
            lexicalState: draftLexicalState,
            tokenCount,
            updatedAt,
          };
        }),
      }));

      setDraftDirty(false);
      setStatusMessage(`Saved ${selectedDocument.title}.`);
    } catch (error) {
      setUploadError(safeErrorMessage(error));
    } finally {
      setIsSavingDocument(false);
    }
  }

  function handleDeleteDocument(documentId: string) {
    setAppState((previous) => ({
      ...previous,
      documents: previous.documents.filter((document) => document.id !== documentId),
    }));

    if (selectedDocumentId === documentId) {
      setSelectedDocumentId(null);
    }
  }

  function handleToggleDocumentStar(documentId: string) {
    updateDocument(documentId, (document) => ({
      ...document,
      starred: !document.starred,
      updatedAt: nowIso(),
    }));
  }

  function handleDocumentTitleCommit() {
    if (!selectedDocument) {
      return;
    }

    const normalizedTitle = documentTitleDraft.trim() || "Untitled";
    if (normalizedTitle === selectedDocument.title) {
      return;
    }

    updateDocument(selectedDocument.id, (document) => ({
      ...document,
      title: normalizedTitle,
      updatedAt: nowIso(),
    }));
  }

  function handleCreateAdvisor() {
    const trimmedName = newAdvisorName.trim();

    if (!trimmedName) {
      return;
    }

    const advisor = createAdvisor(trimmedName);

    setAppState((previous) => ({
      ...previous,
      advisors: [advisor, ...previous.advisors],
    }));

    setNewAdvisorName("");
    setSelectedAdvisorId(advisor.id);
    setStatusMessage(`Created advisor profile: ${advisor.name}`);
    setAdvisorError("");
  }

  function handleDeleteAdvisor(advisorId: string) {
    setAppState((previous) => ({
      ...previous,
      advisors: previous.advisors.filter((advisor) => advisor.id !== advisorId),
    }));

    if (selectedAdvisorId === advisorId) {
      setSelectedAdvisorId(null);
    }
  }

  async function handleResearchAdvisor() {
    if (!selectedAdvisor) {
      return;
    }

    if (!appState.settings.openaiApiKey.trim()) {
      setAdvisorError("Add an OpenAI API key in Settings before running research.");
      setActiveTab("settings");
      return;
    }

    setResearchingAdvisorId(selectedAdvisor.id);
    setAdvisorError("");
    setStatusMessage("");

    try {
      const response = await fetch("/api/advisors/research", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apiKey: appState.settings.openaiApiKey,
          advisorName: selectedAdvisor.name,
          userName: appState.settings.userName,
          businessContext: buildBusinessContext(appState.documents),
        }),
      });

      const payload = (await response.json()) as ResearchResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Advisor research failed.");
      }

      updateAdvisor(selectedAdvisor.id, (advisor) => ({
        ...advisor,
        bio: payload.bio,
        quotes: payload.quotes,
        lastResearchedAt: nowIso(),
        updatedAt: nowIso(),
      }));

      setStatusMessage(`Research updated for ${selectedAdvisor.name}.`);
    } catch (error) {
      setAdvisorError(safeErrorMessage(error));
    } finally {
      setResearchingAdvisorId(null);
    }
  }

  if (!hydrated) {
    return (
      <main className="boa-shell">
        <div className="boa-loading-card">Loading your local workspace...</div>
      </main>
    );
  }

  return (
    <main className="boa-shell">
      <div className="boa-grid-overlay" aria-hidden="true" />
      <div className="boa-spotlight" aria-hidden="true" />

      <section className="boa-app-card">
        <header className="boa-header">
          <div>
            <p className="boa-kicker">Advisory Council</p>
            <h1>Board of Advisors</h1>
            <p className="boa-subtitle">
              Build your local strategy corpus, shape advisor personas, and prepare
              for multi-expert debate sessions.
            </p>
          </div>

          <div className="boa-local-pill">
            <span>Local mode</span>
            <small>All settings, documents, and advisors stay in this browser.</small>
          </div>
        </header>

        <div className="boa-workspace">
          <nav className="boa-tabs boa-tabs-rail" aria-label="Application sections">
            {TAB_LABELS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`boa-tab ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <strong>{tab.label}</strong>
                <span>{tab.description}</span>
              </button>
            ))}
          </nav>

          <div className="boa-content-stage">
            {(statusMessage || uploadError || advisorError) && (
              <section className="boa-messages" aria-live="polite">
                {statusMessage && <p className="boa-message success">{statusMessage}</p>}
                {uploadError && <p className="boa-message error">{uploadError}</p>}
                {advisorError && <p className="boa-message error">{advisorError}</p>}
              </section>
            )}

            {activeTab === "settings" && (
              <section className="boa-panel">
                <div className="boa-panel-head">
                  <h2>Settings</h2>
                  <p>
                    API usage is billed to your own OpenAI account. This key is saved only
                    in your browser on this device.
                  </p>
                </div>

                <label className="boa-field">
                  <span>Your name</span>
                  <input
                    type="text"
                    placeholder="e.g. Alex Founder"
                    value={appState.settings.userName}
                    onChange={(event) => updateSettings("userName", event.target.value)}
                  />
                </label>

                <label className="boa-field">
                  <span>OpenAI API key</span>
                  <input
                    type="password"
                    placeholder="sk-..."
                    value={appState.settings.openaiApiKey}
                    onChange={(event) =>
                      updateSettings("openaiApiKey", event.target.value.trim())
                    }
                    autoComplete="off"
                  />
                </label>
              </section>
            )}

            {activeTab === "documents" && (
              <section className="boa-panel">
                <div className="boa-panel-head">
                  <h2>Business Documents</h2>
                  <p>
                    Inspired by Notion and Google Drive patterns: quick search, filters,
                    starring, and sort controls so your strategy corpus stays navigable.
                  </p>
                </div>

                <div className="boa-doc-stats">
                  <article>
                    <span>Total docs</span>
                    <strong>{appState.documents.length}</strong>
                  </article>
                  <article>
                    <span>Starred</span>
                    <strong>{appState.documents.filter((document) => document.starred).length}</strong>
                  </article>
                  <article>
                    <span>Total tokens</span>
                    <strong>{totalDocumentTokens.toLocaleString()}</strong>
                  </article>
                </div>

                <div className="boa-two-up">
                  <aside className="boa-sidebar">
                    <div className="boa-sidebar-section">
                      <h3>Create editable draft</h3>
                      <input
                        type="text"
                        placeholder="Document title"
                        value={newDocumentTitle}
                        onChange={(event) => setNewDocumentTitle(event.target.value)}
                      />
                      <button type="button" onClick={handleCreateEditableDocument}>
                        Create Draft
                      </button>
                    </div>

                    <div className="boa-sidebar-section">
                      <h3>Upload file</h3>
                      <label className="boa-upload">
                        <span>{isUploading ? "Uploading..." : "Select documents"}</span>
                        <input
                          type="file"
                          accept={UPLOAD_ACCEPT_LIST}
                          multiple
                          disabled={isUploading}
                          onChange={handleUploadFiles}
                        />
                      </label>
                      <p className="boa-note tiny">
                        Supported: .docx, .xls/.xlsx, .txt/.md/.csv/.json/.xml and other
                        text-based formats. Not supported: PDF, PowerPoint, images.
                      </p>
                    </div>

                    <div className="boa-sidebar-section grow">
                      <h3>Library</h3>
                      <div className="boa-library-controls">
                        <input
                          type="search"
                          placeholder="Search by title or extension..."
                          value={documentQuery}
                          onChange={(event) => setDocumentQuery(event.target.value)}
                        />
                        <div className="boa-chip-row">
                          <button
                            type="button"
                            className={documentKindFilter === "all" ? "active" : ""}
                            onClick={() => setDocumentKindFilter("all")}
                          >
                            All
                          </button>
                          <button
                            type="button"
                            className={documentKindFilter === "editable" ? "active" : ""}
                            onClick={() => setDocumentKindFilter("editable")}
                          >
                            Editable
                          </button>
                          <button
                            type="button"
                            className={documentKindFilter === "uploaded" ? "active" : ""}
                            onClick={() => setDocumentKindFilter("uploaded")}
                          >
                            Uploaded
                          </button>
                        </div>
                        <div className="boa-chip-row">
                          <button
                            type="button"
                            className={documentStarFilter === "all" ? "active" : ""}
                            onClick={() => setDocumentStarFilter("all")}
                          >
                            Any Priority
                          </button>
                          <button
                            type="button"
                            className={documentStarFilter === "starred" ? "active" : ""}
                            onClick={() => setDocumentStarFilter("starred")}
                          >
                            Starred
                          </button>
                        </div>
                        <label className="boa-sort-row">
                          <span>Sort</span>
                          <select
                            value={documentSort}
                            onChange={(event) =>
                              setDocumentSort(event.target.value as DocumentSort)
                            }
                          >
                            <option value="updated">Last updated</option>
                            <option value="title">Title</option>
                            <option value="tokens">Token count</option>
                          </select>
                        </label>
                      </div>

                      <ul className="boa-list">
                        {filteredDocuments.length === 0 && (
                          <li className="boa-empty">No documents match this filter.</li>
                        )}

                        {documentStarFilter === "all" && starredDocuments.length > 0 && (
                          <li className="boa-list-section-label">Starred</li>
                        )}
                        {documentStarFilter === "all" &&
                          starredDocuments.map((document) => (
                            <li key={document.id}>
                              <div
                                className={`boa-list-item ${
                                  selectedDocumentId === document.id ? "active" : ""
                                }`}
                              >
                                <button
                                  type="button"
                                  className="boa-list-main"
                                  onClick={() => setSelectedDocumentId(document.id)}
                                >
                                  <strong>{document.title}</strong>
                                  <span>
                                    {document.kind === "editable" ? "Editable" : "Uploaded"} ·{" "}
                                    {document.tokenCount.toLocaleString()} tokens
                                  </span>
                                  <small>{formatDate(document.updatedAt)}</small>
                                </button>
                                <button
                                  type="button"
                                  className="boa-star-toggle"
                                  onClick={() => handleToggleDocumentStar(document.id)}
                                  aria-label={`Remove star from ${document.title}`}
                                >
                                  ★
                                </button>
                              </div>
                            </li>
                          ))}

                        {(documentStarFilter === "starred"
                          ? starredDocuments
                          : regularDocuments
                        ).length > 0 && <li className="boa-list-section-label">Results</li>}

                        {(documentStarFilter === "starred"
                          ? starredDocuments
                          : regularDocuments
                        ).map((document) => (
                          <li key={document.id}>
                            <div
                              className={`boa-list-item ${
                                selectedDocumentId === document.id ? "active" : ""
                              }`}
                            >
                              <button
                                type="button"
                                className="boa-list-main"
                                onClick={() => setSelectedDocumentId(document.id)}
                              >
                                <strong>{document.title}</strong>
                                <span>
                                  {document.kind === "editable" ? "Editable" : "Uploaded"} ·{" "}
                                  {document.tokenCount.toLocaleString()} tokens
                                </span>
                                <small>{formatDate(document.updatedAt)}</small>
                              </button>
                              <button
                                type="button"
                                className={
                                  document.starred
                                    ? "boa-star-toggle"
                                    : "boa-star-toggle inactive"
                                }
                                onClick={() => handleToggleDocumentStar(document.id)}
                                aria-label={
                                  document.starred
                                    ? `Remove star from ${document.title}`
                                    : `Star ${document.title}`
                                }
                              >
                                {document.starred ? "★" : "☆"}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </aside>

                  <article className="boa-editor-area">
                    {!selectedDocument && (
                      <div className="boa-empty-state">
                        Select a document to view and edit.
                      </div>
                    )}

                    {selectedDocument && (
                      <>
                        <div className="boa-editor-head">
                          <div>
                            <input
                              type="text"
                              className="boa-title-input"
                              value={documentTitleDraft}
                              onChange={(event) =>
                                setDocumentTitleDraft(event.target.value)
                              }
                              onBlur={handleDocumentTitleCommit}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  handleDocumentTitleCommit();
                                  (event.currentTarget as HTMLInputElement).blur();
                                }
                              }}
                              aria-label="Document title"
                            />
                            <p>
                              {selectedDocument.kind === "editable"
                                ? "Editable Lexical document"
                                : "Uploaded read-only file"}{" "}
                              · {selectedDocument.tokenCount.toLocaleString()} tokens
                            </p>
                          </div>
                          <div className="boa-editor-head-actions">
                            <button
                              type="button"
                              className={
                                selectedDocument.starred
                                  ? "boa-head-star"
                                  : "boa-head-star inactive"
                              }
                              onClick={() => handleToggleDocumentStar(selectedDocument.id)}
                            >
                              {selectedDocument.starred ? "★ Starred" : "☆ Star"}
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => handleDeleteDocument(selectedDocument.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        {selectedDocument.kind === "editable" && (
                          <>
                            <LexicalDocumentEditor
                              key={selectedDocument.id}
                              initialEditorState={selectedDocument.lexicalState}
                              onChange={({ plainText, serializedState }) => {
                                setDraftContent(plainText);
                                setDraftLexicalState(serializedState);
                                setDraftDirty(true);
                              }}
                            />

                            <div className="boa-editor-actions">
                              <span>
                                Unsaved tokens preview: {draftContent.trim().length > 0
                                  ? "ready"
                                  : "empty"}
                              </span>
                              <button
                                type="button"
                                disabled={isSavingDocument || !draftDirty}
                                onClick={handleSaveEditableDocument}
                              >
                                {isSavingDocument ? "Saving..." : "Save Document"}
                              </button>
                            </div>
                          </>
                        )}

                        {selectedDocument.kind === "uploaded" && (
                          <pre className="boa-readonly-preview">{selectedDocument.content}</pre>
                        )}
                      </>
                    )}
                  </article>
                </div>
              </section>
            )}

            {activeTab === "advisors" && (
              <section className="boa-panel">
                <div className="boa-panel-head">
                  <h2>Advisor Configuration</h2>
                  <p>
                    Create advisors, run OpenAI research for bio and quotes, then edit and
                    enable the voices you want in debate mode.
                  </p>
                </div>

                <div className="boa-two-up">
                  <aside className="boa-sidebar">
                    <div className="boa-sidebar-section">
                      <h3>Add advisor</h3>
                      <input
                        type="text"
                        placeholder="e.g. Charlie Munger"
                        value={newAdvisorName}
                        onChange={(event) => setNewAdvisorName(event.target.value)}
                      />
                      <button type="button" onClick={handleCreateAdvisor}>
                        Add Advisor
                      </button>
                    </div>

                    <div className="boa-sidebar-section grow">
                      <h3>Advisor list</h3>
                      <ul className="boa-list">
                        {appState.advisors.length === 0 && (
                          <li className="boa-empty">No advisors yet.</li>
                        )}
                        {appState.advisors.map((advisor) => (
                          <li key={advisor.id}>
                            <button
                              type="button"
                              className={`boa-list-item ${
                                selectedAdvisorId === advisor.id ? "active" : ""
                              }`}
                              onClick={() => setSelectedAdvisorId(advisor.id)}
                            >
                              <strong>{advisor.name || "Unnamed advisor"}</strong>
                              <span>{advisor.enabled ? "Enabled" : "Disabled"}</span>
                              <small>
                                {advisor.lastResearchedAt
                                  ? `Researched ${formatDate(advisor.lastResearchedAt)}`
                                  : "Research not run yet"}
                              </small>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </aside>

                  <article className="boa-editor-area">
                    {!selectedAdvisor && (
                      <div className="boa-empty-state">
                        Select an advisor to configure profile and quotes.
                      </div>
                    )}

                    {selectedAdvisor && (
                      <>
                        <div className="boa-editor-head">
                          <div>
                            <h3>Advisor Profile</h3>
                            <p>
                              {selectedAdvisor.enabled
                                ? "Participates in debate mode"
                                : "Excluded from debate mode"}
                            </p>
                          </div>

                          <button
                            type="button"
                            className="danger"
                            onClick={() => handleDeleteAdvisor(selectedAdvisor.id)}
                          >
                            Delete
                          </button>
                        </div>

                        <label className="boa-field">
                          <span>Name</span>
                          <input
                            type="text"
                            value={selectedAdvisor.name}
                            onChange={(event) =>
                              updateAdvisor(selectedAdvisor.id, (advisor) => ({
                                ...advisor,
                                name: event.target.value,
                                updatedAt: nowIso(),
                              }))
                            }
                          />
                        </label>

                        <label className="boa-field checkbox">
                          <input
                            type="checkbox"
                            checked={selectedAdvisor.enabled}
                            onChange={(event) =>
                              updateAdvisor(selectedAdvisor.id, (advisor) => ({
                                ...advisor,
                                enabled: event.target.checked,
                                updatedAt: nowIso(),
                              }))
                            }
                          />
                          <span>Enable this advisor in future debate sessions</span>
                        </label>

                        <div className="boa-editor-actions wrap">
                          <span>
                            {selectedAdvisor.lastResearchedAt
                              ? `Last researched ${formatDate(
                                  selectedAdvisor.lastResearchedAt,
                                )}`
                              : "No research result yet"}
                          </span>
                          <button
                            type="button"
                            onClick={handleResearchAdvisor}
                            disabled={researchingAdvisorId === selectedAdvisor.id}
                          >
                            {researchingAdvisorId === selectedAdvisor.id
                              ? "Researching..."
                              : "Research Advisor"}
                          </button>
                        </div>

                        <label className="boa-field">
                          <span>Bio (4-6 paragraphs)</span>
                          <textarea
                            rows={10}
                            value={selectedAdvisor.bio}
                            onChange={(event) =>
                              updateAdvisor(selectedAdvisor.id, (advisor) => ({
                                ...advisor,
                                bio: event.target.value,
                                updatedAt: nowIso(),
                              }))
                            }
                          />
                        </label>

                        <label className="boa-field">
                          <span>Quotes (one per line)</span>
                          <textarea
                            rows={8}
                            value={quotesToTextAreaValue(selectedAdvisor.quotes)}
                            onChange={(event) =>
                              updateAdvisor(selectedAdvisor.id, (advisor) => ({
                                ...advisor,
                                quotes: textAreaValueToQuotes(event.target.value),
                                updatedAt: nowIso(),
                              }))
                            }
                          />
                        </label>
                      </>
                    )}
                  </article>
                </div>
              </section>
            )}

            {activeTab === "chat" && (
              <section className="boa-panel boa-chat-placeholder">
                <h2>Debate Chat (Next Build Step)</h2>
                <p>
                  This section will host the multi-advisor debate experience. The next
                  iteration can orchestrate enabled advisors as an agent swarm, grounded by
                  your stored documents and profile context.
                </p>
                <ul>
                  <li>Enabled advisors: {appState.advisors.filter((a) => a.enabled).length}</li>
                  <li>Documents loaded: {appState.documents.length}</li>
                  <li>
                    Ready for setup: {appState.settings.openaiApiKey.trim() ? "Yes" : "No"}
                  </li>
                </ul>
              </section>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
