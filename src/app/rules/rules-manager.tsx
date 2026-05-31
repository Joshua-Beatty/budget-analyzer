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
  addRule,
  deleteRule,
  reorderRules,
  updateRule,
} from "@/app/actions/rules";
import type { Rule, RuleInput } from "@/app/actions/rules-types";
import type {
  AccountOption,
  CategoryOption,
} from "@/app/actions/transactions-types";
import { fromCents, toCents } from "@/utils/money";
import { isValidRegex } from "@/utils/rules";

const buttonClass =
  "rounded-full bg-foreground px-4 py-2 text-background text-sm font-medium transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]";

const secondaryButtonClass =
  "rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900";

const inputClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

/** Empty form values for creating a new rule. */
const EMPTY_FORM = {
  name: "",
  accountIds: [] as string[],
  minAmount: "",
  maxAmount: "",
  descriptionRegex: "",
  categoryId: "",
};

type FormState = typeof EMPTY_FORM;

/** Summarize a rule's criteria for the list row. */
function summarize(rule: Rule, accounts: AccountOption[]): string {
  const parts: string[] = [];
  if (rule.accountIds.length > 0) {
    const names = rule.accountIds.map(
      (id) => accounts.find((a) => a.id === id)?.name ?? id,
    );
    parts.push(`accounts: ${names.join(", ")}`);
  } else {
    parts.push("all accounts");
  }
  if (rule.minAmount !== null || rule.maxAmount !== null) {
    const min = rule.minAmount !== null ? fromCents(rule.minAmount) : "−∞";
    const max = rule.maxAmount !== null ? fromCents(rule.maxAmount) : "∞";
    parts.push(`amount ${min}…${max}`);
  }
  if (rule.descriptionRegex) {
    parts.push(`/${rule.descriptionRegex}/i`);
  }
  return parts.join(" · ");
}

function SortableRule({
  rule,
  accounts,
  disabled,
  onEdit,
  onDelete,
}: {
  rule: Rule;
  accounts: AccountOption[];
  disabled: boolean;
  onEdit: (rule: Rule) => void;
  onDelete: (id: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rule.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-start gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950 ${
        isDragging ? "opacity-60" : ""
      }`}
    >
      <button
        type="button"
        className="cursor-grab pt-0.5 text-zinc-400 hover:text-zinc-700 active:cursor-grabbing dark:hover:text-zinc-200"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <div className="flex flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {rule.name}
          </span>
          <span className="text-zinc-400">→</span>
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            {rule.categoryName ?? "(unknown)"}
          </span>
        </div>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {summarize(rule, accounts)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="text-sm text-zinc-600 hover:underline disabled:opacity-50 dark:text-zinc-300"
          disabled={disabled}
          onClick={() => onEdit(rule)}
        >
          Edit
        </button>
        <button
          type="button"
          className="text-sm text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
          disabled={disabled}
          onClick={() => onDelete(rule.id)}
        >
          Delete
        </button>
      </div>
    </li>
  );
}

type Props = {
  initialRules: Rule[];
  categories: CategoryOption[];
  accounts: AccountOption[];
};

export function RulesManager({ initialRules, categories, accounts }: Props) {
  const [rules, setRules] = useState<Rule[]>(initialRules);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // The rule currently being edited (null = creating a new rule).
  const [editingId, setEditingId] = useState<number | null>(null);
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
  }, []);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  /** Parse a decimal-dollar string field to cents, or null when blank. */
  function parseAmount(value: string): number | null {
    const trimmed = value.trim();
    return trimmed === "" ? null : toCents(trimmed);
  }

  function buildInput(): RuleInput | null {
    if (form.categoryId === "") {
      setMessage("Choose a category for the rule.");
      return null;
    }
    const regex = form.descriptionRegex.trim();
    if (regex && !isValidRegex(regex)) {
      setMessage("Description regex is not valid.");
      return null;
    }
    let minAmount: number | null;
    let maxAmount: number | null;
    try {
      minAmount = parseAmount(form.minAmount);
      maxAmount = parseAmount(form.maxAmount);
    } catch {
      setMessage("Amounts must be valid numbers.");
      return null;
    }

    const hasAccounts = form.accountIds.length > 0;
    const hasAmount = minAmount !== null || maxAmount !== null;
    const hasRegex = regex.length > 0;
    if (!hasAccounts && !hasAmount && !hasRegex) {
      setMessage(
        "Add at least one criterion: accounts, an amount range, or a description regex.",
      );
      return null;
    }

    return {
      name: form.name,
      accountIds: form.accountIds,
      minAmount,
      maxAmount,
      descriptionRegex: hasRegex ? regex : null,
      categoryId: Number.parseInt(form.categoryId, 10),
    };
  }

  function handleSave() {
    const input = buildInput();
    if (input === null) return;
    setMessage(null);
    const currentEditingId = editingId;
    startTransition(async () => {
      try {
        if (currentEditingId === null) {
          const created = await addRule(input);
          setRules((prev) => [...prev, created]);
        } else {
          const updated = await updateRule(currentEditingId, input);
          setRules((prev) =>
            prev.map((r) => (r.id === updated.id ? updated : r)),
          );
        }
        resetForm();
      } catch (error) {
        setMessage(String(error));
      }
    });
  }

  function handleEdit(rule: Rule) {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      accountIds: rule.accountIds,
      minAmount: rule.minAmount !== null ? fromCents(rule.minAmount) : "",
      maxAmount: rule.maxAmount !== null ? fromCents(rule.maxAmount) : "",
      descriptionRegex: rule.descriptionRegex ?? "",
      categoryId: String(rule.categoryId),
    });
    setMessage(null);
  }

  function handleDelete(id: number) {
    setMessage(null);
    const previous = rules;
    setRules((prev) => prev.filter((r) => r.id !== id));
    if (editingId === id) resetForm();
    startTransition(async () => {
      try {
        await deleteRule(id);
      } catch (error) {
        setRules(previous);
        setMessage(`Could not delete rule: ${String(error)}`);
      }
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over === null || active.id === over.id) return;
    const oldIndex = rules.findIndex((r) => r.id === active.id);
    const newIndex = rules.findIndex((r) => r.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(rules, oldIndex, newIndex);
    setRules(reordered);
    const orderedIds = reordered.map((r) => r.id);
    startTransition(async () => {
      try {
        await reorderRules(orderedIds);
      } catch (error) {
        setMessage(`Could not save order: ${String(error)}`);
      }
    });
  }

  function toggleAccount(id: string) {
    setForm((prev) => ({
      ...prev,
      accountIds: prev.accountIds.includes(id)
        ? prev.accountIds.filter((a) => a !== id)
        : [...prev.accountIds, id],
    }));
  }

  if (!mounted) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading rules…</p>
    );
  }

  const regexInvalid =
    form.descriptionRegex.length > 0 && !isValidRegex(form.descriptionRegex);

  // A rule needs at least one criterion: accounts, an amount, or a regex.
  const hasCriterion =
    form.accountIds.length > 0 ||
    form.minAmount.trim().length > 0 ||
    form.maxAmount.trim().length > 0 ||
    form.descriptionRegex.trim().length > 0;

  return (
    <div className="flex w-full flex-col gap-6">
      {rules.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={rules.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex w-full flex-col gap-2">
              {rules.map((rule) => (
                <SortableRule
                  key={rule.id}
                  rule={rule}
                  accounts={accounts}
                  disabled={isPending}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No rules yet.
        </p>
      )}

      <div className="flex w-full flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {editingId === null ? "Add a rule" : "Edit rule"}
        </h3>

        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Name
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Groceries"
          />
        </label>

        <fieldset className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          <legend className="mb-1">Accounts (none = all)</legend>
          <div className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
            {accounts.map((account) => (
              <label
                key={account.id}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-zinc-900 dark:accent-zinc-100"
                  checked={form.accountIds.includes(account.id)}
                  onChange={() => toggleAccount(account.id)}
                />
                {account.name}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Min amount
            <input
              className={`${inputClass} w-32`}
              value={form.minAmount}
              onChange={(e) =>
                setForm((p) => ({ ...p, minAmount: e.target.value }))
              }
              placeholder="-50.00"
              inputMode="decimal"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Max amount
            <input
              className={`${inputClass} w-32`}
              value={form.maxAmount}
              onChange={(e) =>
                setForm((p) => ({ ...p, maxAmount: e.target.value }))
              }
              placeholder="0.00"
              inputMode="decimal"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Description regex (optional)
          <input
            className={`${inputClass} ${regexInvalid ? "border-red-500" : ""}`}
            value={form.descriptionRegex}
            onChange={(e) =>
              setForm((p) => ({ ...p, descriptionRegex: e.target.value }))
            }
            placeholder="e.g. whole foods|trader joe"
          />
          {regexInvalid ? (
            <span className="text-xs text-red-600 dark:text-red-400">
              Not a valid regular expression.
            </span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Category
          <select
            className={inputClass}
            value={form.categoryId}
            onChange={(e) =>
              setForm((p) => ({ ...p, categoryId: e.target.value }))
            }
          >
            <option value="">Choose a category…</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-3">
          <button
            type="button"
            className={buttonClass}
            disabled={
              isPending ||
              form.name.trim().length === 0 ||
              form.categoryId === "" ||
              regexInvalid ||
              !hasCriterion
            }
            onClick={handleSave}
          >
            {editingId === null ? "Add rule" : "Save changes"}
          </button>
          {editingId !== null ? (
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={isPending}
              onClick={resetForm}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      {message ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
      ) : null}
    </div>
  );
}
