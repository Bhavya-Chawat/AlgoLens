import { useCallback, useEffect, useMemo, useState } from 'react';
import { EMPTY, codeKey, patch, readAll, store, withSize, writeAll } from './panelPrefs.js';

/** The open / folded / sized state of the panels of one program, remembered between visits. */
export function usePanelPrefs(code) {
  const key = useMemo(() => codeKey(code), [code]);
  const [all, setAll] = useState(() => readAll());
  const prefs = all[key] || EMPTY;

  useEffect(() => { writeAll(all); }, [all]);

  const update = useCallback((fn) => setAll((prev) => store(prev, key, fn(prev[key] || EMPTY))), [key]);

  return {
    prefs,
    setOpen: useCallback((id, open) => update((p) => patch(p, id, { open })), [update]),
    setFolded: useCallback((id, folded) => update((p) => patch(p, id, { folded })), [update]),
    setSize: useCallback((id, size) => update((p) => withSize(p, id, size)), [update]),
    reset: useCallback(() => update(() => EMPTY), [update]),
  };
}
