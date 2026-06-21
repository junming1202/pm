"use client";

import { useEffect, useRef, useState } from "react";
import { api, type ChatMessage } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

type ChatSidebarProps = {
  // Called with the updated board whenever the AI applies changes.
  onBoardUpdate: (board: BoardData) => void;
};

export const ChatSidebar = ({ onBoardUpdate }: ChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the latest message in view as the conversation grows.
  useEffect(() => {
    const list = listRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, sending]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) {
      return;
    }

    const history = messages;
    const userMessage: ChatMessage = { role: "user", content: text };
    setMessages([...history, userMessage]);
    setInput("");
    setSending(true);
    setError(false);

    try {
      const result = await api.chat(text, history);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.reply },
      ]);
      if (result.applied.length > 0) {
        onBoardUpdate(result.board);
      }
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <aside
      data-testid="chat-sidebar"
      className="flex h-full flex-col rounded-[28px] border border-[var(--stroke)] bg-white/85 shadow-[var(--shadow)] backdrop-blur"
    >
      <header className="border-b border-[var(--stroke)] px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
          Assistant
        </p>
        <h2 className="mt-1 font-display text-xl font-semibold text-[var(--navy-dark)]">
          Board AI
        </h2>
      </header>

      <div
        ref={listRef}
        data-testid="chat-messages"
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-5"
      >
        {messages.length === 0 ? (
          <p className="text-sm leading-6 text-[var(--gray-text)]">
            Ask me to add, edit, move, or organize cards. For example: &quot;Add
            a card to Backlog to draft the launch plan.&quot;
          </p>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              data-role={message.role}
              className={
                message.role === "user"
                  ? "self-end max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--primary-blue)] px-4 py-2 text-sm text-white"
                  : "self-start max-w-[85%] rounded-2xl rounded-bl-sm border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--navy-dark)]"
              }
            >
              {message.content}
            </div>
          ))
        )}
        {sending ? (
          <div
            data-testid="chat-pending"
            className="self-start rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--gray-text)]"
          >
            Thinking...
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm font-semibold text-[var(--secondary-purple)]">
            Something went wrong. Try again.
          </p>
        ) : null}
      </div>

      <form onSubmit={send} className="flex gap-2 border-t border-[var(--stroke)] p-4">
        <input
          aria-label="Message the assistant"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask the assistant..."
          className="flex-1 rounded-full border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
        />
        <button
          type="submit"
          disabled={sending || input.trim().length === 0}
          className="rounded-full bg-[var(--secondary-purple)] px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </aside>
  );
};
