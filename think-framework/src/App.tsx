import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useState } from "react";

const SUGGESTED_PROMPTS = [
  "I did 5 sets of 5 squats at 80 kg today.",
  "What workouts have I completed this week?",
  "Plan tomorrow's workout around my left knee injury.",
  "What is my estimated 1RM if I lift 80 kg for 5 reps?",
];

type FileEntry = {
  path: string;
  type: "file" | "directory";
  size: number;
  updatedAt: number;
};

type AgentState = { files: FileEntry[] };

type AgentStub = {
  readWorkspaceFile: (path: string) => Promise<string | null>;
};

function getOrCreateVisitorId() {
  const storageKey = "fitness-coach-visitor-id";
  const savedId = localStorage.getItem(storageKey);

  if (savedId) {
    return savedId;
  }

  const newId = crypto.randomUUID();
  localStorage.setItem(storageKey, newId);

  return newId;
}

function App() {
  const [visitorId] = useState(getOrCreateVisitorId);
  const [agentState, setAgentState] = useState<AgentState>({ files: [] });
  const [openFile, setOpenFile] = useState<{
    path: string;
    content: string | null;
  } | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);

  const agent = useAgent<AgentState>({
    agent: "CoachAgent",
    name: visitorId,
    onStateUpdate: (state) => {
      setAgentState(state);
      setWorkspaceReady(true);
    },
  });

  const handleFileClick = async (path: string) => {
    setLoadingFile(true);
    setFileError(null);
    setOpenFile({ path, content: null });

    try {
      const stub = agent.stub as AgentStub;
      const content = await stub.readWorkspaceFile(path);
      setOpenFile({ path, content });
    } catch {
      setFileError("We couldn't open this file. Please try again.");
    } finally {
      setLoadingFile(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const {
    messages,
    sendMessage,
    clearHistory,
    status,
    error,
    stop,
    addToolApprovalResponse,
  } = useAgentChat({ agent });

  const isBusy = status === "submitted" || status === "streaming";

  const sendPrompt = (text: string) => {
    if (isBusy) return;
    sendMessage({ text });
  };

  const userFacingError = error
    ? error.message.toLowerCase().includes("too many request") ||
      error.message.includes("429")
      ? "You've reached the message limit. Please try again in one minute."
      : "We couldn't reach your coach. Check your connection and try again."
    : null;

  const statusLabel =
    status === "submitted"
      ? "Thinking"
      : status === "streaming"
        ? "Responding"
        : status === "error"
          ? "Needs attention"
          : "Ready";

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const message = formData.get("input") as string;
    if (!message.trim() || message.length > 500) {
      return;
    }
    if (isBusy) return;
    sendMessage({ text: message });
    e.currentTarget.reset();
  };

  function renderMessage(msg: UIMessage) {
    return msg.parts.map((part, i) => {
      if (part.type === "text")
        return (
          <p key={i} className="whitespace-pre-wrap leading-relaxed">
            {part.text}
          </p>
        );
      if (part.type === "reasoning")
        return (
          <p key={i} className="text-xs italic text-zinc-500">
            {part.text}
          </p>
        );
      if (isToolUIPart(part)) {
        const toolName = getToolName(part);
        const normalizedToolName = toolName.toLowerCase();
        const isPending =
          part.state === "input-streaming" ||
          part.state === "input-available" ||
          part.state === "approval-requested";
        const toolStatus = normalizedToolName.includes("load_context")
          ? isPending
            ? "Loading coaching guide…"
            : "Coaching guide loaded"
          : normalizedToolName.includes("unload_context")
            ? isPending
              ? "Releasing coaching guide…"
              : "Coaching guide released"
            : normalizedToolName.includes("write") ||
                normalizedToolName.includes("edit")
              ? isPending
                ? "Saving workout record…"
                : "Workout record saved"
              : part.state;

        if ("approval" in part && part.state === "approval-requested") {
          return (
            <div
              key={i}
              className="text-sm bg-yellow-50 border border-yellow-300 p-2 rounded my-1"
            >
              <div>
                <strong>Approve {toolName}?</strong>
              </div>
              {"input" in part && part.input != null && (
                <pre className="mt-1">
                  {JSON.stringify(part.input, null, 2)}
                </pre>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  className="px-3 py-1 bg-green-500 text-white rounded"
                  onClick={() =>
                    addToolApprovalResponse({
                      id: part.approval.id,
                      approved: true,
                    })
                  }
                >
                  Approve
                </button>
                <button
                  className="px-3 py-1 bg-red-500 text-white rounded"
                  onClick={() =>
                    addToolApprovalResponse({
                      id: part.approval.id,
                      approved: false,
                    })
                  }
                >
                  Reject
                </button>
              </div>
            </div>
          );
        }

        if (part.state === "output-denied") {
          return (
            <div
              key={i}
              className="text-sm bg-red-50 border border-red-300 p-2 rounded my-1"
            >
              <strong>{toolName}</strong> — Rejected
            </div>
          );
        }

        return (
          <div
            key={i}
            className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs"
          >
            <div className="flex items-center gap-2">
              <span className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
                {toolName}
              </span>
              <span className="text-zinc-500">{toolStatus}</span>
            </div>
            {"input" in part && part.input != null && (
              <pre className="mt-1 overflow-x-auto text-zinc-600">
                {JSON.stringify(part.input, null, 2)}
              </pre>
            )}
            {part.state === "output-available" && (
              <pre className="mt-1 overflow-x-auto text-zinc-600">
                {JSON.stringify(part.output, null, 2)}
              </pre>
            )}
          </div>
        );
      }
      return null;
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              🏋️ AI Fitness Coach
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500">
              Your workouts, goals, and recovery—all in one workspace.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                status === "error"
                  ? "bg-red-50 text-red-700"
                  : isBusy
                    ? "bg-amber-50 text-amber-700"
                    : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {statusLabel}
            </span>
            <button
              type="button"
              onClick={clearHistory}
              disabled={isBusy}
              className="rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear chat
            </button>
            <button
              type="button"
              onClick={stop}
              disabled={!isBusy}
              className="rounded-md px-2 py-1 text-xs text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Stop
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6 pb-32">
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          <p className="font-medium">Demo and privacy notice</p>
          <p className="mt-1 text-xs leading-relaxed text-blue-800">
            This educational fitness coach does not provide medical diagnosis.
            Avoid entering sensitive personal or health information. Stop
            exercising and consult a qualified health professional if you have
            an injury, severe pain, or concerning symptoms.
          </p>
        </section>

        {userFacingError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {userFacingError}
          </div>
        )}

        {isBusy && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            {status === "submitted"
              ? "Your coach is reviewing your request…"
              : "Your coach is responding and may update your workout log…"}
          </div>
        )}

        <section className="rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight">Workspace</h2>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
              {agentState.files.length}
            </span>
          </div>
          {!workspaceReady ? (
            <p className="mt-2 text-sm text-zinc-400">Loading workspace…</p>
          ) : agentState.files.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-400">
              No workout files yet. Share a workout to create your first log.
            </p>
          ) : (
            <ul className="mt-3 space-y-1">
              {agentState.files.map((file) => (
                <li key={file.path}>
                  <button
                    type="button"
                    onClick={() => handleFileClick(file.path)}
                    disabled={file.type === "directory"}
                    className="flex w-full items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-left text-sm transition enabled:hover:bg-zinc-100 disabled:cursor-default"
                  >
                    <span className="text-zinc-400">
                      {file.type === "directory" ? "📁" : "📄"}
                    </span>
                    <span className="flex-1 truncate font-mono text-xs text-zinc-700">
                      {file.path}
                    </span>
                    {file.type === "file" && (
                      <span className="shrink-0 text-xs text-zinc-400">
                        {formatSize(file.size)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {openFile && (
            <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs text-zinc-700">
                  {openFile.path}
                </span>
                <button
                  onClick={() => setOpenFile(null)}
                  className="shrink-0 rounded-md px-2 py-0.5 text-xs text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-900"
                >
                  Close
                </button>
              </div>
              {loadingFile ? (
                <p className="mt-2 text-xs text-zinc-400">Loading…</p>
              ) : fileError ? (
                <p role="alert" className="mt-2 text-xs text-red-600">
                  {fileError}
                </p>
              ) : openFile.content === null ? (
                <p className="mt-2 text-xs text-zinc-400">
                  This file is empty.
                </p>
              ) : (
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs text-zinc-700">
                  {openFile.content}
                </pre>
              )}
            </div>
          )}
        </section>
        <div className="flex-1 space-y-4">
          {messages.length === 0 && (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-center">
              <h2 className="text-base font-semibold">Start with a workout or goal</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Try one of these prompts to see persistent memory, workout logs,
                skills, and runtime tools in action.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => sendPrompt(prompt)}
                    disabled={isBusy}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-left text-sm text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <div
                key={message.id}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    isUser
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-200 bg-white text-zinc-900"
                  }`}
                >
                  {renderMessage(message)}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white/95 backdrop-blur">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-4xl gap-2 px-4 py-3"
        >
          <label htmlFor="coach-message" className="sr-only">
            Message your fitness coach
          </label>
          <input
            id="coach-message"
            name="input"
            maxLength={500}
            disabled={isBusy}
            placeholder="Report a workout or ask your coach…"
            autoComplete="off"
            className="flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none transition focus:border-zinc-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isBusy}
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {isBusy ? "Working…" : "Send"}
          </button>
        </form>
      </footer>
    </div>
  );
}

export default App;
