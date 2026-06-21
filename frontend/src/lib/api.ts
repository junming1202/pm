// API client for the FastAPI backend. The frontend is served by the backend at
// the same origin, so relative "/api/..." paths work in the container. Cookies
// carry the session, so every request uses credentials: "include".

import type { BoardData } from "@/lib/kanban";

export type User = { username: string };

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatResponse = {
  reply: string;
  applied: unknown[];
  board: BoardData;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const message = await response
      .json()
      .then((body) => body.detail as string)
      .catch(() => response.statusText);
    throw new Error(message || "Request failed");
  }
  return response.json() as Promise<T>;
}

// Board endpoints return the full updated board, so callers can replace state
// with the response. Column/card ids are strings here and numbers in the API.
export const api = {
  me: () => request<User>("/me"),
  login: (username: string, password: string) =>
    request<User>("/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>("/logout", { method: "POST" }),

  getBoard: () => request<BoardData>("/board"),
  renameColumn: (columnId: string, title: string) =>
    request<BoardData>(`/columns/${columnId}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  createCard: (columnId: string, title: string, details: string) =>
    request<BoardData>("/cards", {
      method: "POST",
      body: JSON.stringify({ column_id: Number(columnId), title, details }),
    }),
  updateCard: (cardId: string, title: string, details: string) =>
    request<BoardData>(`/cards/${cardId}`, {
      method: "PATCH",
      body: JSON.stringify({ title, details }),
    }),
  deleteCard: (cardId: string) =>
    request<BoardData>(`/cards/${cardId}`, { method: "DELETE" }),
  moveCard: (cardId: string, columnId: string, index: number) =>
    request<BoardData>(`/cards/${cardId}/move`, {
      method: "POST",
      body: JSON.stringify({ column_id: Number(columnId), index }),
    }),
  chat: (message: string, history: ChatMessage[]) =>
    request<ChatResponse>("/chat", {
      method: "POST",
      body: JSON.stringify({ message, history }),
    }),
};
