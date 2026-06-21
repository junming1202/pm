// API client for the FastAPI backend. The frontend is served by the backend at
// the same origin, so relative "/api/..." paths work in the container. Cookies
// carry the session, so every request uses credentials: "include".

export type User = { username: string };

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

export const api = {
  me: () => request<User>("/me"),
  login: (username: string, password: string) =>
    request<User>("/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>("/logout", { method: "POST" }),
};
