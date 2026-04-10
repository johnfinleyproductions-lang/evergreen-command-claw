"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Leaf,
  Loader2,
  FileText,
  Trash2,
  Plus,
  ChevronDown,
  BookOpen,
  MessageSquare,
  X,
} from "lucide-react";

// ---- Types ----

interface ChatMessage {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
}

interface Citation {
  resourceId: string;
  resourceName: string;
  chunk: string;
  page?: number;
  similarity: number;
}

interface ChatSession {
  id: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Markdown-lite renderer ----

function renderMarkdown(text: string) {
  // Split into lines and process
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeLang = "";

  lines.forEach((line, i) => {
    // Code blocks
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre
            key={`code-${i}`}
            className="my-2 overflow-x-auto rounded-lg bg-surface p-3 text-xs"
          >
            <code>{codeLines.join("\n")}</code>
          </pre>
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
      }
      return;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      return;
    }

    // Headers
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="mt-3 mb-1 text-sm font-semibold text-text">
          {line.slice(4)}
        </h3>
      );
      return;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="mt-3 mb-1 text-sm font-bold text-text">
          {line.slice(3)}
        </h2>
      );
      return;
    }

    // List items
    if (line.match(/^[-*] /)) {
      elements.push(
        <li key={i} className="ml-4 list-disc text-sm text-text/90">
          {inlineFormat(line.slice(2))}
        </li>
      );
      return;
    }

    // Numbered list
    if (line.match(/^\d+\. /)) {
      const content = line.replace(/^\d+\.\s/, "");
      elements.push(
        <li key={i} className="ml-4 list-decimal text-sm text-text/90">
          {inlineFormat(content)}
        </li>
      );
      return;
    }

    // Empty line
    if (line.trim() === "") {
      elements.push(<br key={i} />);
      return;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="text-sm text-text/90 leading-relaxed">
        {inlineFormat(line)}
      </p>
    );
  });

  return <div className="space-y-0.5">{elements}</div>;
}

function inlineFormat(text: string): React.ReactNode {
  // Bold
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-text">
          {part.slice(2, -2)}
        </strong>
      );
    }
    // Inline code
    const codeParts = part.split(/(`[^`]+`)/g);
    return codeParts.map((cp, j) => {
      if (cp.startsWith("`") && cp.endsWith("`")) {
        return (
          <code
            key={`${i}-${j}`}
            className="rounded bg-surface px-1 py-0.5 text-xs text-accent"
          >
            {cp.slice(1, -1)}
          </code>
        );
      }
      return cp;
    });
  });
}

// ---- Available models ----

const AVAILABLE_MODELS = [
  { id: "qwen3.5:9b", label: "Qwen 3.5 9B" },
  { id: "llama3.1:8b", label: "Llama 3.1 8B" },
  { id: "gemma3:12b", label: "Gemma 3 12B" },
  { id: "mistral:7b", label: "Mistral 7B" },
  { id: "deepseek-r1:8b", label: "DeepSeek R1 8B" },
];

// ---- Main Component ----

export default function LibrarianClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModel] = useState(AVAILABLE_MODELS[0].id);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [activeCitations, setActiveCitations] = useState<Citation[] | null>(
    null
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load sessions on mount
  useEffect(() => {
    fetchSessions();
  }, []);

  async function fetchSessions() {
    try {
      const res = await fetch("/api/chat/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch {
      // Silently fail
    }
  }

  async function loadSession(id: string) {
    try {
      const res = await fetch(`/api/chat/sessions/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSessionId(id);
        setMessages(
          data.messages.map((m: ChatMessage & { id: string }) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            citations: m.citations,
          }))
        );
        setModel(data.session.model || AVAILABLE_MODELS[0].id);
        setShowSidebar(false);
      }
    } catch {
      // Silently fail
    }
  }

  async function deleteSession(id: string) {
    try {
      await fetch(`/api/chat/sessions/${id}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (sessionId === id) {
        startNewChat();
      }
    } catch {
      // Silently fail
    }
  }

  function startNewChat() {
    setSessionId(null);
    setMessages([]);
    setActiveCitations(null);
    inputRef.current?.focus();
  }

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMessage: ChatMessage = { role: "user", content: content.trim() };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInput("");
      setIsLoading(true);
      setActiveCitations(null);

      // Add placeholder assistant message
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: "",
        isStreaming: true,
      };
      setMessages([...newMessages, assistantMessage]);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            model,
            sessionId,
          }),
        });

        if (!response.ok) {
          throw new Error(`Chat failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let fullContent = "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let finalSources: any[] = [];
        let newSessionId = sessionId;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n").filter((l) => l.startsWith("data: "));

          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.content) {
                fullContent += data.content;
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: fullContent,
                      isStreaming: true,
                    };
                  }
                  return updated;
                });
              }

              if (data.done) {
                if (data.sources) finalSources = data.sources;
                if (data.sessionId) newSessionId = data.sessionId;
              }
            } catch {
              // Skip malformed SSE
            }
          }
        }

        // Finalize the message
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              content: fullContent,
              isStreaming: false,
              citations:
                finalSources.length > 0
                  ? finalSources.map((s: Record<string, unknown>) => ({
                      resourceId: (s.resourceId as string) || "",
                      resourceName: (s.resourceName as string) || "",
                      chunk: (s.quote as string) || (s.chunk as string) || "",
                      page: (s.pageNumber as number) ?? (s.page as number),
                      similarity: (s.similarity as number) || 0,
                    }))
                  : undefined,
            };
          }
          return updated;
        });

        if (newSessionId && newSessionId !== sessionId) {
          setSessionId(newSessionId);
          fetchSessions();
        }
      } catch (error) {
        console.error("[Chat] Stream error:", error);
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              content:
                "Sorry, I encountered an error connecting to the model. Please check that Ollama is running and the model is available.",
              isStreaming: false,
            };
          }
          return updated;
        });
      } finally {
        setIsLoading(false);
      }
    },
    [messages, model, sessionId, isLoading]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleSuggestion(text: string) {
    setInput(text);
    inputRef.current?.focus();
  }

  const modelLabel =
    AVAILABLE_MODELS.find((m) => m.id === model)?.label || model;

  return (
    <div className="flex h-full">
      {/* Session Sidebar */}
      {showSidebar && (
        <div className="flex w-64 flex-col border-r border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border p-3">
            <span className="text-xs font-medium text-text-muted">
              Chat History
            </span>
            <button
              onClick={() => setShowSidebar(false)}
              className="rounded p-1 text-text-dim hover:text-text transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-xs cursor-pointer transition-colors ${
                  sessionId === s.id
                    ? "bg-accent/10 text-accent"
                    : "text-text-muted hover:bg-surface-2 hover:text-text"
                }`}
              >
                <button
                  onClick={() => loadSession(s.id)}
                  className="flex-1 text-left truncate"
                >
                  {s.title}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession(s.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-text-dim hover:text-red-400 transition-all"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            {sessions.length === 0 && (
              <p className="text-center text-xs text-text-dim py-8">
                No conversations yet
              </p>
            )}
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col">
        {/* Chat Header */}
        <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="rounded-lg p-1.5 text-text-dim hover:bg-surface-2 hover:text-text transition-colors"
              title="Chat history"
            >
              <MessageSquare className="h-4 w-4" />
            </button>
            <button
              onClick={startNewChat}
              className="rounded-lg p-1.5 text-text-dim hover:bg-surface-2 hover:text-text transition-colors"
              title="New chat"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* Model Picker */}
          <div className="relative">
            <button
              onClick={() => setShowModelPicker(!showModelPicker)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-text-muted hover:border-border-hover hover:text-text transition-colors"
            >
              <span>{modelLabel}</span>
              <ChevronDown className="h-3 w-3" />
            </button>
            {showModelPicker && (
              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-border bg-surface-2 p-1 shadow-xl">
                {AVAILABLE_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setModel(m.id);
                      setShowModelPicker(false);
                    }}
                    className={`flex w-full items-center rounded-md px-3 py-2 text-xs transition-colors ${
                      model === m.id
                        ? "bg-accent/10 text-accent"
                        : "text-text-muted hover:bg-surface-3 hover:text-text"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 mb-4">
                <Leaf className="h-8 w-8 text-accent" />
              </div>
              <h3 className="text-lg font-semibold">The Librarian</h3>
              <p className="mt-2 text-sm text-text-muted text-center max-w-md">
                I can help you find resources, answer questions from your
                knowledge base, and suggest relevant materials.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {[
                  "What's in my knowledge base?",
                  "Summarize my most recent upload",
                  "What topics do my resources cover?",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSuggestion(suggestion)}
                    className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-text-muted hover:border-accent/30 hover:text-accent transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4 p-4">
              {messages.map((msg, i) => (
                <div key={i}>
                  {msg.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-accent/15 px-4 py-2.5 text-sm text-text">
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                        <Leaf className="h-4 w-4 text-accent" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="prose-sm">
                          {msg.isStreaming && !msg.content ? (
                            <div className="flex items-center gap-2 text-sm text-text-muted">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Searching knowledge base...</span>
                            </div>
                          ) : (
                            renderMarkdown(msg.content)
                          )}
                          {msg.isStreaming && msg.content && (
                            <span className="inline-block h-4 w-1.5 ml-0.5 animate-pulse bg-accent/60 rounded-sm" />
                          )}
                        </div>

                        {/* Citations */}
                        {msg.citations && msg.citations.length > 0 && (
                          <div className="mt-3">
                            <button
                              onClick={() =>
                                setActiveCitations(
                                  activeCitations === msg.citations
                                    ? null
                                    : msg.citations!
                                )
                              }
                              className="flex items-center gap-1.5 text-xs text-accent/70 hover:text-accent transition-colors"
                            >
                              <BookOpen className="h-3 w-3" />
                              <span>
                                {msg.citations.length} source
                                {msg.citations.length !== 1 ? "s" : ""}
                              </span>
                            </button>
                            {activeCitations === msg.citations && (
                              <div className="mt-2 space-y-2">
                                {msg.citations.map((c, ci) => (
                                  <div
                                    key={ci}
                                    className="rounded-lg border border-border bg-surface p-3"
                                  >
                                    <div className="flex items-center gap-2 mb-1">
                                      <FileText className="h-3 w-3 text-accent" />
                                      <span className="text-xs font-medium text-accent">
                                        {c.resourceName}
                                        {c.page ? ` (p.${c.page})` : ""}
                                      </span>
                                      <span className="text-[10px] text-text-dim">
                                        {Math.round(c.similarity * 100)}% match
                                      </span>
                                    </div>
                                    <p className="text-xs text-text-muted leading-relaxed">
                                      &ldquo;{c.chunk}&rdquo;
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="border-t border-border bg-surface p-4">
          <form
            onSubmit={handleSubmit}
            className="mx-auto flex max-w-3xl items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 focus-within:border-accent/30 transition-colors"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the Librarian anything..."
              className="flex-1 bg-transparent text-sm text-text placeholder:text-text-dim outline-none"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-black hover:bg-accent-dim transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </form>
          <div className="mx-auto mt-2 flex max-w-3xl items-center gap-2 text-[10px] text-text-dim">
            <span>Model: {modelLabel}</span>
            <span>&middot;</span>
            <span>Ollama @ Framestation</span>
            {sessionId && (
              <>
                <span>&middot;</span>
                <span>Session active</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
