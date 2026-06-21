import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import { api } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

vi.mock("@/lib/api", () => ({
  api: {
    getBoard: vi.fn(),
    renameColumn: vi.fn(),
    createCard: vi.fn(),
    updateCard: vi.fn(),
    deleteCard: vi.fn(),
    moveCard: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

const buildBoard = (): BoardData => ({
  columns: [
    { id: "1", title: "Backlog", cardIds: ["10"] },
    { id: "2", title: "Discovery", cardIds: [] },
    { id: "3", title: "In Progress", cardIds: [] },
    { id: "4", title: "Review", cardIds: [] },
    { id: "5", title: "Done", cardIds: [] },
  ],
  cards: { "10": { id: "10", title: "Seed card", details: "from server" } },
});

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.getBoard.mockResolvedValue(buildBoard());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("KanbanBoard", () => {
  it("loads the board from the API and renders five columns", async () => {
    render(<KanbanBoard />);
    expect(screen.getByTestId("board-loading")).toBeInTheDocument();
    expect(await screen.findByText("Seed card")).toBeInTheDocument();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    expect(mockedApi.getBoard).toHaveBeenCalledTimes(1);
  });

  it("shows an error state and retries", async () => {
    mockedApi.getBoard.mockRejectedValueOnce(new Error("boom"));
    render(<KanbanBoard />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not load/i);

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("Seed card")).toBeInTheDocument();
  });

  it("creates a card via the API", async () => {
    const next = buildBoard();
    next.columns[0].cardIds = ["10", "11"];
    next.cards["11"] = { id: "11", title: "New card", details: "Notes" };
    mockedApi.createCard.mockResolvedValue(next);

    render(<KanbanBoard />);
    await screen.findByText("Seed card");

    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /add a card/i })
    );
    await userEvent.type(
      within(column).getByPlaceholderText(/card title/i),
      "New card"
    );
    await userEvent.type(
      within(column).getByPlaceholderText(/details/i),
      "Notes"
    );
    await userEvent.click(
      within(column).getByRole("button", { name: /add card/i })
    );

    expect(mockedApi.createCard).toHaveBeenCalledWith("1", "New card", "Notes");
    expect(await screen.findByText("New card")).toBeInTheDocument();
  });

  it("deletes a card via the API", async () => {
    const next = buildBoard();
    next.columns[0].cardIds = [];
    next.cards = {};
    mockedApi.deleteCard.mockResolvedValue(next);

    render(<KanbanBoard />);
    await screen.findByText("Seed card");

    await userEvent.click(
      screen.getByRole("button", { name: /delete seed card/i })
    );

    expect(mockedApi.deleteCard).toHaveBeenCalledWith("10");
    await waitFor(() =>
      expect(screen.queryByText("Seed card")).not.toBeInTheDocument()
    );
  });

  it("edits a card via the API", async () => {
    const next = buildBoard();
    next.cards["10"] = { id: "10", title: "Edited", details: "Updated" };
    mockedApi.updateCard.mockResolvedValue(next);

    render(<KanbanBoard />);
    await screen.findByText("Seed card");

    await userEvent.click(
      screen.getByRole("button", { name: /edit seed card/i })
    );
    const titleInput = screen.getByLabelText("Card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Edited");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(mockedApi.updateCard).toHaveBeenCalledWith("10", "Edited", "from server");
    expect(await screen.findByText("Edited")).toBeInTheDocument();
  });

  it("renames a column via the API (debounced)", async () => {
    mockedApi.renameColumn.mockResolvedValue(buildBoard());
    render(<KanbanBoard />);
    await screen.findByText("Seed card");

    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Todo");

    expect(input).toHaveValue("Todo");
    await waitFor(() =>
      expect(mockedApi.renameColumn).toHaveBeenCalledWith("1", "Todo")
    );
  });
});
