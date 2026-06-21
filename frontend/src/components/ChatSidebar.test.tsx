import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatSidebar } from "@/components/ChatSidebar";
import { api } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

vi.mock("@/lib/api", () => ({
  api: {
    chat: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

const buildBoard = (): BoardData => ({
  columns: [
    { id: "1", title: "Backlog", cardIds: ["10"] },
    { id: "2", title: "Done", cardIds: [] },
  ],
  cards: { "10": { id: "10", title: "Seed card", details: "" } },
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ChatSidebar", () => {
  it("shows an empty state before any messages", () => {
    render(<ChatSidebar onBoardUpdate={vi.fn()} />);
    expect(screen.getByText(/ask me to add, edit, move/i)).toBeInTheDocument();
  });

  it("sends a message and renders the reply", async () => {
    mockedApi.chat.mockResolvedValue({
      reply: "Added it.",
      applied: [],
      board: buildBoard(),
    });
    render(<ChatSidebar onBoardUpdate={vi.fn()} />);

    await userEvent.type(
      screen.getByLabelText(/message the assistant/i),
      "Add a card",
    );
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("Added it.")).toBeInTheDocument();
    expect(screen.getByText("Add a card")).toBeInTheDocument();
    expect(mockedApi.chat).toHaveBeenCalledWith("Add a card", []);
  });

  it("forwards prior history on later messages", async () => {
    mockedApi.chat
      .mockResolvedValueOnce({ reply: "First reply", applied: [], board: buildBoard() })
      .mockResolvedValueOnce({ reply: "Second reply", applied: [], board: buildBoard() });
    render(<ChatSidebar onBoardUpdate={vi.fn()} />);

    const input = screen.getByLabelText(/message the assistant/i);
    await userEvent.type(input, "Hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByText("First reply");

    await userEvent.type(input, "Again");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByText("Second reply");

    expect(mockedApi.chat).toHaveBeenLastCalledWith("Again", [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "First reply" },
    ]);
  });

  it("refreshes the board when changes are applied", async () => {
    const board = buildBoard();
    const onBoardUpdate = vi.fn();
    mockedApi.chat.mockResolvedValue({
      reply: "Done.",
      applied: [{ type: "create_card" }],
      board,
    });
    render(<ChatSidebar onBoardUpdate={onBoardUpdate} />);

    await userEvent.type(screen.getByLabelText(/message the assistant/i), "Add card");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(onBoardUpdate).toHaveBeenCalledWith(board));
  });

  it("does not refresh the board when nothing is applied", async () => {
    const onBoardUpdate = vi.fn();
    mockedApi.chat.mockResolvedValue({
      reply: "Nothing to do.",
      applied: [],
      board: buildBoard(),
    });
    render(<ChatSidebar onBoardUpdate={onBoardUpdate} />);

    await userEvent.type(screen.getByLabelText(/message the assistant/i), "Hi");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await screen.findByText("Nothing to do.");
    expect(onBoardUpdate).not.toHaveBeenCalled();
  });

  it("shows an error state when the request fails", async () => {
    mockedApi.chat.mockRejectedValue(new Error("boom"));
    render(<ChatSidebar onBoardUpdate={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/message the assistant/i), "Break it");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
  });
});
