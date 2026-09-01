import { useAgent } from "agents/react";
import { useState } from "react";
import type { PollAgent, PollState } from "../worker/index";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get("token");
  const readonly = searchParams.get("readonly") === "true";

  const [isConnected, setIsConnected] = useState(false);
  const [authRejected, setAuthRejected] = useState(false);
  const [newOption, setNewOption] = useState("");
  const [error, setError] = useState("");

  // 모든 탭이 같은 name을 사용하므로 하나의 PollAgent 상태를 공유합니다.
  const agent = useAgent<PollAgent, PollState>({
    agent: "AGENT",
    name: "default",
    query: {
      token,
      readonly: readonly ? "true" : null,
    },
    enabled: token !== null && !authRejected,
    onOpen: () => {
      setIsConnected(true);
      setError("");
    },
    onClose: (event) => {
      setIsConnected(false);
      if (event.code === 4001) {
        setAuthRejected(true);
        setError(event.reason || "Invalid room token");
      } else if (event.reason) {
        setError(event.reason);
      }
    },
    onError: () => {
      setAuthRejected(true);
      setError("Agent 연결이 거부되었습니다.");
    },
    onStateUpdateError: (message) => setError(message),
  });

  const poll = agent.state;
  const totalVotes =
    poll?.options.reduce((total, option) => total + option.votes, 0) ?? 0;

  const vote = async (optionId: number) => {
    try {
      setError("");
      await agent.stub.vote(optionId);
    } catch (error) {
      setError(getErrorMessage(error));
    }
  };

  const addOption = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setError("");
      await agent.stub.addOption(newOption);
      setNewOption("");
    } catch (error) {
      setError(getErrorMessage(error));
    }
  };

  const reset = async () => {
    try {
      setError("");
      await agent.stub.reset();
    } catch (error) {
      setError(getErrorMessage(error));
    }
  };

  if (!token || authRejected) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p className="mb-2 font-semibold text-red-700">인증 필요</p>
        <h1 className="mb-4 text-2xl font-bold">
          {authRejected ? "유효하지 않은 토큰입니다." : "방 토큰이 필요합니다."}
        </h1>
        <p>
          {authRejected ? (
            error
          ) : (
            <>
              주소 뒤에 <code>?token=demo-poll-token</code>을 붙여 접속하세요.
            </>
          )}
        </p>
      </main>
    );
  }

  if (!poll) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-bold">투표방에 연결하는 중...</h1>
        {error && <p className="mt-4 text-red-700">{error}</p>}
      </main>
    );
  }

  const disabled = !isConnected || readonly || poll.closed;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <header className="mb-6">
        <p className="mb-2 font-semibold text-blue-700">실시간 투표방</p>
        <h1 className="text-3xl font-bold">{poll.question}</h1>
        <p className="mt-2">
          {isConnected ? "실시간 연결됨" : "연결 끊김"}
          {readonly && " · 읽기 전용"}
          {poll.closed && " · 투표 마감"}
        </p>
      </header>

      {readonly && (
        <p className="mb-4 rounded bg-yellow-100 p-3">
          관전자 모드에서는 결과만 볼 수 있습니다.
        </p>
      )}
      {error && <p className="mb-4 text-red-700">{error}</p>}

      <p className="mb-3 font-semibold">전체 득표 수: {totalVotes}</p>

      <div className="grid gap-3">
        {poll.options.map((option) => (
          <button
            className="flex justify-between rounded border p-4 text-left disabled:opacity-50"
            disabled={disabled}
            key={option.id}
            onClick={() => void vote(option.id)}
            type="button"
          >
            <strong>{option.label}</strong>
            <span>{option.votes}표</span>
          </button>
        ))}
      </div>

      <form className="mt-8" onSubmit={addOption}>
        <label className="mb-2 block font-semibold" htmlFor="new-option">
          새 선택지
        </label>
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded border p-3"
            disabled={disabled}
            id="new-option"
            maxLength={50}
            onChange={(event) => setNewOption(event.target.value)}
            placeholder="선택지를 입력하세요"
            value={newOption}
          />
          <button
            className="rounded bg-blue-700 px-4 text-white disabled:opacity-50"
            disabled={disabled || !newOption.trim()}
            type="submit"
          >
            추가
          </button>
        </div>
      </form>

      <footer className="mt-8 border-t pt-5">
        <p className="mb-3">초기화하면 투표가 다시 열리고 5분 뒤 자동 마감됩니다.</p>
        <button
          className="rounded bg-gray-200 px-4 py-2 disabled:opacity-50"
          disabled={!isConnected || readonly}
          onClick={() => void reset()}
          type="button"
        >
          투표 초기화
        </button>
      </footer>
    </main>
  );
}

export default App;
