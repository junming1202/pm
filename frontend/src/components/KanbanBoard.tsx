"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { locateCard, moveCard, type BoardData } from "@/lib/kanban";
import { api, type User } from "@/lib/api";

type KanbanBoardProps = {
  user?: User;
  onLogout?: () => void;
};

type Status = "loading" | "ready" | "error";

export const KanbanBoard = ({ user, onLogout }: KanbanBoardProps = {}) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  // Rename calls fire on every keystroke; debounce so we save the final value.
  const renameTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const loadBoard = async () => {
    try {
      setBoard(await api.getBoard());
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  };

  const retry = () => {
    setStatus("loading");
    void loadBoard();
  };

  useEffect(() => {
    let active = true;
    api
      .getBoard()
      .then((data) => {
        if (active) {
          setBoard(data);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (active) {
          setStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => board?.cards ?? {}, [board]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!board || !over || active.id === over.id) {
      return;
    }

    const cardId = active.id as string;
    const nextColumns = moveCard(board.columns, cardId, over.id as string);
    const target = locateCard(nextColumns, cardId);
    if (!target) {
      return;
    }

    // Optimistically reorder, then persist; reload from server on failure.
    setBoard({ ...board, columns: nextColumns });
    api
      .moveCard(cardId, target.columnId, target.index)
      .then(setBoard)
      .catch(loadBoard);
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    if (!board) {
      return;
    }
    // Optimistic: reflect the new title immediately, debounce the save.
    setBoard({
      ...board,
      columns: board.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    });
    clearTimeout(renameTimers.current[columnId]);
    renameTimers.current[columnId] = setTimeout(() => {
      api.renameColumn(columnId, title).then(setBoard).catch(loadBoard);
    }, 400);
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    api.createCard(columnId, title, details).then(setBoard).catch(loadBoard);
  };

  const handleDeleteCard = (_columnId: string, cardId: string) => {
    api.deleteCard(cardId).then(setBoard).catch(loadBoard);
  };

  const handleUpdateCard = (cardId: string, title: string, details: string) => {
    api.updateCard(cardId, title, details).then(setBoard).catch(loadBoard);
  };

  if (status === "error") {
    return (
      <div
        role="alert"
        className="flex min-h-screen flex-col items-center justify-center gap-4 text-center"
      >
        <p className="text-sm font-semibold text-[var(--navy-dark)]">
          Could not load your board.
        </p>
        <button
          type="button"
          onClick={retry}
          className="rounded-full bg-[var(--secondary-purple)] px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  if (status === "loading" || !board) {
    return (
      <div
        data-testid="board-loading"
        className="flex min-h-screen items-center justify-center text-sm font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]"
      >
        Loading board...
      </div>
    );
  }

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              {user ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                    {user.username}
                  </span>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--secondary-purple)] transition hover:border-[var(--secondary-purple)]"
                  >
                    Log out
                  </button>
                </div>
              ) : null}
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Focus
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  One board. Five columns. Zero clutter.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="grid gap-6 lg:grid-cols-5">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                onRename={handleRenameColumn}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
                onUpdateCard={handleUpdateCard}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  );
};
