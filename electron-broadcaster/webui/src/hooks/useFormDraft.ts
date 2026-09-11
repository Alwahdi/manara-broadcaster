import { useCallback, useEffect, useState } from "react";

type Fields = Record<string, string>;
type Draft = { values: Fields; baseline: Fields };

// Keep non-sensitive operator drafts across in-app navigation, never on disk.
const drafts = new Map<string, Draft>();
const same = (a: Fields, b: Fields) => JSON.stringify(a) === JSON.stringify(b);

export function hasUnsavedFormDrafts() {
  return drafts.size > 0;
}

export function useFormDraft(key: string, serverValues?: Fields) {
  const [draft, setDraft] = useState<Draft>(() => drafts.get(key) || {
    values: serverValues || {}, baseline: serverValues || {},
  });
  const update = useCallback((change: (previous: Draft) => Draft) => {
    setDraft((previous) => {
      const next = change(previous);
      if (same(next.values, next.baseline)) drafts.delete(key);
      else drafts.set(key, next);
      return next;
    });
  }, [key]);
  const serverSnapshot = serverValues ? JSON.stringify(serverValues) : undefined;
  useEffect(() => {
    if (serverSnapshot === undefined) return;
    const values: Fields = JSON.parse(serverSnapshot);
    update((previous) => same(previous.values, previous.baseline)
      ? { values, baseline: values } : previous);
  }, [serverSnapshot, update]);

  const setValues = (change: Fields | ((previous: Fields) => Fields)) => update((previous) => ({
    ...previous, values: typeof change === "function" ? change(previous.values) : change,
  }));
  const dirty = !same(draft.values, draft.baseline);
  return {
    values: draft.values,
    setValues,
    dirty,
    changedElsewhere: dirty && serverValues !== undefined && !same(serverValues, draft.baseline),
    accept: () => update((previous) => ({ ...previous, baseline: previous.values })),
    discard: () => update((previous) => {
      const values = serverValues || previous.baseline;
      return { values, baseline: values };
    }),
  };
}
