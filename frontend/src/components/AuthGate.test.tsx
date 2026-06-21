import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "@/components/AuthGate";

// Minimal fetch mock keyed by path. Each entry returns a Response-like object.
type Handler = (init?: RequestInit) => { ok: boolean; body: unknown };

const makeFetch = (handlers: Record<string, Handler>) =>
  vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace("/api", "");
    const handler = handlers[`${init?.method ?? "GET"} ${path}`];
    if (!handler) throw new Error(`Unhandled request: ${init?.method} ${url}`);
    const { ok, body } = handler(init);
    return {
      ok,
      status: ok ? 200 : 401,
      statusText: ok ? "OK" : "Unauthorized",
      json: async () => body,
    } as Response;
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AuthGate", () => {
  it("shows the login screen when not authenticated", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({ "GET /me": () => ({ ok: false, body: { detail: "no" } }) })
    );
    render(<AuthGate />);
    expect(await screen.findByTestId("login-form")).toBeInTheDocument();
    expect(screen.queryByText("Kanban Studio")).not.toBeInTheDocument();
  });

  it("shows the board after a successful login", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "GET /me": () => ({ ok: false, body: { detail: "no" } }),
        "POST /login": () => ({ ok: true, body: { username: "user" } }),
      })
    );
    render(<AuthGate />);
    await screen.findByTestId("login-form");

    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Kanban Studio")).toBeInTheDocument();
  });

  it("shows an error on invalid login", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "GET /me": () => ({ ok: false, body: { detail: "no" } }),
        "POST /login": () => ({
          ok: false,
          body: { detail: "Invalid username or password" },
        }),
      })
    );
    render(<AuthGate />);
    await screen.findByTestId("login-form");

    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid username or password"
    );
    expect(screen.queryByText("Kanban Studio")).not.toBeInTheDocument();
  });

  it("stays logged in across refresh when the session is valid", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({ "GET /me": () => ({ ok: true, body: { username: "user" } }) })
    );
    render(<AuthGate />);
    expect(await screen.findByText("Kanban Studio")).toBeInTheDocument();
    expect(screen.queryByTestId("login-form")).not.toBeInTheDocument();
  });

  it("returns to the login screen after logout", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "GET /me": () => ({ ok: true, body: { username: "user" } }),
        "POST /logout": () => ({ ok: true, body: { ok: true } }),
      })
    );
    render(<AuthGate />);
    await screen.findByText("Kanban Studio");

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(await screen.findByTestId("login-form")).toBeInTheDocument();
  });
});
