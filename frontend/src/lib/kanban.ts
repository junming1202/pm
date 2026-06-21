export type Card = {
  id: string;
  title: string;
  details: string;
};

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};

// Droppable column zones are namespaced so a column id can never be mistaken for
// a card id (the backend numbers both from 1, so "2" could be either).
const COLUMN_PREFIX = "column:";

export const columnDropId = (columnId: string) => `${COLUMN_PREFIX}${columnId}`;

const asColumnId = (id: string) =>
  id.startsWith(COLUMN_PREFIX) ? id.slice(COLUMN_PREFIX.length) : null;

// The active id is always a card; locate the column that holds it.
const columnIdOfCard = (columns: Column[], cardId: string) =>
  columns.find((column) => column.cardIds.includes(cardId))?.id;

export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string
): Column[] => {
  const activeColumnId = columnIdOfCard(columns, activeId);
  // The drop target is either a column zone (namespaced) or another card.
  const droppedOnColumnId = asColumnId(overId);
  const overColumnId = droppedOnColumnId ?? columnIdOfCard(columns, overId);

  if (!activeColumnId || !overColumnId) {
    return columns;
  }

  const activeColumn = columns.find((column) => column.id === activeColumnId);
  const overColumn = columns.find((column) => column.id === overColumnId);

  if (!activeColumn || !overColumn) {
    return columns;
  }

  const isOverColumn = droppedOnColumnId !== null;

  if (activeColumnId === overColumnId) {
    if (isOverColumn) {
      const nextCardIds = activeColumn.cardIds.filter(
        (cardId) => cardId !== activeId
      );
      nextCardIds.push(activeId);
      return columns.map((column) =>
        column.id === activeColumnId
          ? { ...column, cardIds: nextCardIds }
          : column
      );
    }

    const oldIndex = activeColumn.cardIds.indexOf(activeId);
    const newIndex = activeColumn.cardIds.indexOf(overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      return columns;
    }

    const nextCardIds = [...activeColumn.cardIds];
    nextCardIds.splice(oldIndex, 1);
    nextCardIds.splice(newIndex, 0, activeId);

    return columns.map((column) =>
      column.id === activeColumnId
        ? { ...column, cardIds: nextCardIds }
        : column
    );
  }

  const activeIndex = activeColumn.cardIds.indexOf(activeId);
  if (activeIndex === -1) {
    return columns;
  }

  const nextActiveCardIds = [...activeColumn.cardIds];
  nextActiveCardIds.splice(activeIndex, 1);

  const nextOverCardIds = [...overColumn.cardIds];
  if (isOverColumn) {
    nextOverCardIds.push(activeId);
  } else {
    const overIndex = overColumn.cardIds.indexOf(overId);
    const insertIndex = overIndex === -1 ? nextOverCardIds.length : overIndex;
    nextOverCardIds.splice(insertIndex, 0, activeId);
  }

  return columns.map((column) => {
    if (column.id === activeColumnId) {
      return { ...column, cardIds: nextActiveCardIds };
    }
    if (column.id === overColumnId) {
      return { ...column, cardIds: nextOverCardIds };
    }
    return column;
  });
};

// Find which column a card lives in and its index there. Used to translate a
// drag result into the backend's {column_id, index} move payload.
export const locateCard = (columns: Column[], cardId: string) => {
  for (const column of columns) {
    const index = column.cardIds.indexOf(cardId);
    if (index !== -1) {
      return { columnId: column.id, index };
    }
  }
  return null;
};
