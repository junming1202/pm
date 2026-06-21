import { expect, test, type Page } from "@playwright/test";

// These tests run against the full stack (FastAPI serving the static export).
// Start it with ../scripts/start.sh before running. Each test resets the board
// to empty so runs are independent.

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
}

async function resetBoard(page: Page) {
  // Delete every existing card so each test starts from a clean board.
  const board = await page.evaluate(async () => {
    const res = await fetch("/api/board", { credentials: "include" });
    return res.json();
  });
  for (const id of Object.keys(board.cards)) {
    await page.evaluate(async (cardId) => {
      await fetch(`/api/cards/${cardId}`, {
        method: "DELETE",
        credentials: "include",
      });
    }, id);
  }
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await resetBoard(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
});

test("loads the board with five columns", async ({ page }) => {
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds, edits, and deletes a card; changes persist across refresh", async ({
  page,
}) => {
  const firstColumn = page.locator('[data-testid^="column-"]').first();

  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("E2E card");
  await firstColumn.getByPlaceholder("Details").fill("Created via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("E2E card")).toBeVisible();

  await page.reload();
  await expect(firstColumn.getByText("E2E card")).toBeVisible();

  await firstColumn
    .getByRole("button", { name: "Edit E2E card", exact: true })
    .click();
  await firstColumn.getByLabel("Card title").fill("E2E card edited");
  await firstColumn.getByRole("button", { name: /^save$/i }).click();
  await expect(firstColumn.getByText("E2E card edited")).toBeVisible();

  await page.reload();
  await expect(firstColumn.getByText("E2E card edited")).toBeVisible();

  await firstColumn
    .getByRole("button", { name: "Delete E2E card edited", exact: true })
    .click();
  await expect(firstColumn.getByText("E2E card edited")).toHaveCount(0);

  await page.reload();
  await expect(firstColumn.getByText("E2E card edited")).toHaveCount(0);
});

test("renames a column and it persists", async ({ page }) => {
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByLabel("Column title").fill("Renamed column");
  // Rename is debounced (400ms); wait for the save to land.
  await page.waitForTimeout(700);

  await page.reload();
  await expect(
    page.locator('[data-testid^="column-"]').first().getByLabel("Column title")
  ).toHaveValue("Renamed column");

  // Restore so reruns stay clean.
  await page
    .locator('[data-testid^="column-"]')
    .first()
    .getByLabel("Column title")
    .fill("Backlog");
  await page.waitForTimeout(700);
});

test("moves a card between columns and it persists", async ({ page }) => {
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Movable card");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Movable card")).toBeVisible();

  const card = firstColumn.getByText("Movable card");
  const targetColumn = page.locator('[data-testid^="column-"]').nth(2);
  // Let layout settle so drag coordinates are stable.
  await page.waitForTimeout(200);
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  // Nudge past the 6px activation distance, then drag to the target column.
  await page.mouse.move(
    cardBox.x + cardBox.width / 2 + 12,
    cardBox.y + cardBox.height / 2 + 12,
    { steps: 5 }
  );
  await page.mouse.move(columnBox.x + columnBox.width / 2, columnBox.y + 140, {
    steps: 20,
  });
  await page.mouse.move(columnBox.x + columnBox.width / 2, columnBox.y + 150, {
    steps: 5,
  });
  await page.mouse.up();

  await expect(targetColumn.getByText("Movable card")).toBeVisible();

  await page.reload();
  await expect(
    page.locator('[data-testid^="column-"]').nth(2).getByText("Movable card")
  ).toBeVisible();
});
