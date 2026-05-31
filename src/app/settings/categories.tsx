"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState, useTransition } from "react";
import {
  addCategory,
  getCategories,
  renameCategory,
  reorderCategories,
  softDeleteCategory,
} from "@/app/actions/categories";
import type { Category } from "@/app/actions/categories-types";

const buttonClass =
  "rounded-full bg-foreground px-4 py-2 text-background text-sm font-medium transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]";

const inputClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-black focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

function SortableRow({
  category,
  disabled,
  onRename,
  onDelete,
}: {
  category: Category;
  disabled: boolean;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(category.name);

  function startEdit() {
    setDraft(category.name);
    setEditing(true);
  }

  function save() {
    const trimmed = draft.trim();
    if (trimmed.length > 0 && trimmed !== category.name) {
      onRename(category.id, trimmed);
    }
    setEditing(false);
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950 ${
        isDragging ? "opacity-60" : ""
      }`}
    >
      <button
        type="button"
        className="cursor-grab text-zinc-400 hover:text-zinc-700 active:cursor-grabbing dark:hover:text-zinc-200"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      {editing ? (
        <input
          // biome-ignore lint/a11y/noAutofocus: focus the field when entering edit mode
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            else if (e.key === "Escape") setEditing(false);
          }}
          className="flex-1 rounded border border-zinc-300 bg-white px-2 py-0.5 text-sm text-black focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      ) : (
        <span className="flex-1 text-sm text-zinc-800 dark:text-zinc-200">
          {category.name}
        </span>
      )}
      {editing ? (
        <button
          type="button"
          className="text-sm text-zinc-600 hover:underline disabled:opacity-50 dark:text-zinc-300"
          disabled={disabled}
          // preventDefault on mousedown stops the input's onBlur from firing
          // before the click (mouseup) lands, which would otherwise exit edit
          // mode and re-target the click. Saving still happens on click.
          onMouseDown={(e) => e.preventDefault()}
          onClick={save}
        >
          Save
        </button>
      ) : (
        <button
          type="button"
          className="text-sm text-zinc-600 hover:underline disabled:opacity-50 dark:text-zinc-300"
          disabled={disabled}
          onClick={startEdit}
        >
          Edit
        </button>
      )}
      <button
        type="button"
        className="text-sm text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
        disabled={disabled}
        onClick={() => onDelete(category.id)}
      >
        Delete
      </button>
    </li>
  );
}

export function Categories() {
  const [items, setItems] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    setMounted(true);
    startTransition(async () => {
      try {
        setItems(await getCategories());
      } catch (error) {
        setMessage(String(error));
      }
    });
  }, []);

  function handleAdd() {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const created = await addCategory(trimmed);
        setItems((prev) => [...prev, created]);
        setName("");
      } catch (error) {
        setMessage(`Could not add category: ${String(error)}`);
      }
    });
  }

  function handleRename(id: number, newName: string) {
    setMessage(null);
    const previous = items;
    setItems((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name: newName } : c)),
    );
    startTransition(async () => {
      try {
        await renameCategory(id, newName);
      } catch (error) {
        setItems(previous);
        setMessage(`Could not rename category: ${String(error)}`);
      }
    });
  }

  function handleDelete(id: number) {
    setMessage(null);
    const previous = items;
    setItems((prev) => prev.filter((c) => c.id !== id));
    startTransition(async () => {
      try {
        await softDeleteCategory(id);
      } catch (error) {
        setItems(previous);
        setMessage(`Could not delete category: ${String(error)}`);
      }
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over === null || active.id === over.id) return;

    const oldIndex = items.findIndex((c) => c.id === active.id);
    const newIndex = items.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered);

    const orderedIds = reordered.map((c) => c.id);
    startTransition(async () => {
      try {
        await reorderCategories(orderedIds);
      } catch (error) {
        setMessage(`Could not save order: ${String(error)}`);
      }
    });
  }

  // Stable placeholder until mounted to avoid hydration mismatch.
  if (!mounted) {
    return (
      <div className="flex w-full flex-col gap-3">
        <div className="flex gap-2">
          <input
            readOnly
            value=""
            placeholder="New category name"
            className={`${inputClass} flex-1`}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleAdd();
          }}
          placeholder="New category name"
          className={`${inputClass} flex-1`}
        />
        <button
          type="button"
          className={buttonClass}
          disabled={isPending || name.trim().length === 0}
          onClick={handleAdd}
        >
          Add
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No categories yet.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex w-full flex-col gap-2">
              {items.map((category) => (
                <SortableRow
                  key={category.id}
                  category={category}
                  disabled={isPending}
                  onRename={handleRename}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {message ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
      ) : null}
    </div>
  );
}
