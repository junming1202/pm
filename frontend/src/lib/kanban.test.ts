import { columnDropId, moveCard, type Column } from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", columnDropId("col-b"));
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });

  it("moves cards to an empty column when card and column ids collide", () => {
    // Backend numbers both columns and cards from 1, so a card id can match a
    // column id. The drop target is namespaced to keep them distinct.
    const columns: Column[] = [
      { id: "1", title: "Backlog", cardIds: ["2"] },
      { id: "2", title: "Discovery", cardIds: [] },
      { id: "3", title: "In Progress", cardIds: [] },
    ];
    const result = moveCard(columns, "2", columnDropId("3"));
    expect(result[0].cardIds).toEqual([]);
    expect(result[2].cardIds).toEqual(["2"]);
  });
});
