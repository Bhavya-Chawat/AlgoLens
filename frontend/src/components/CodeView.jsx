import { useEffect, useRef } from 'react';
import { EditorState, StateEffect, StateField, RangeSetBuilder, Compartment } from '@codemirror/state';
import { EditorView, Decoration, GutterMarker, gutter, lineNumbers, keymap, drawSelection, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting, bracketMatching, indentOnInput } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';

/**
 * One code view for the whole app (CodeMirror 6): the editable editor on the first screen and the
 * read-only, line-highlighted listing next to the visualisation.
 */
const LANGUAGES = { python, javascript, java, cpp };

// ── "currently executing" line + bug markers, driven from outside ────────────────────────────
const setMarks = StateEffect.define();

const activeLineClass = Decoration.line({ class: 'cm-exec-line' });
const bugLineClass = Decoration.line({ class: 'cm-bug-line' });

const marksField = StateField.define({
  create: () => ({ active: 0, bugs: [] }),
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setMarks)) return e.value;
    return value;
  },
  provide: (field) => EditorView.decorations.from(field, (marks) => (view) => {
    const builder = new RangeSetBuilder();
    const doc = view.state.doc;
    const lines = new Map();
    marks.bugs.forEach((n) => lines.set(n, bugLineClass));
    if (marks.active) lines.set(marks.active, activeLineClass);
    for (const n of [...lines.keys()].sort((a, b) => a - b)) {
      if (n >= 1 && n <= doc.lines) builder.add(doc.line(n).from, doc.line(n).from, lines.get(n));
    }
    return builder.finish();
  }),
});

class ArrowMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('span');
    el.textContent = '▶';
    el.className = 'cm-exec-arrow';
    return el;
  }
}
const ARROW = new ArrowMarker();

const arrowGutter = gutter({
  class: 'cm-arrow-gutter',
  lineMarker(view, line) {
    const marks = view.state.field(marksField);
    return marks.active && view.state.doc.lineAt(line.from).number === marks.active ? ARROW : null;
  },
  lineMarkerChange: (update) => update.transactions.some((tr) => tr.effects.some((e) => e.is(setMarks))),
  initialSpacer: () => ARROW,
});

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.modifier, t.operatorKeyword], color: 'var(--syn-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--syn-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--syn-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], color: 'var(--syn-function)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--syn-type)' },
  { tag: [t.operator, t.punctuation], color: 'var(--text-muted)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', background: 'transparent', color: 'var(--text-primary)', fontSize: '13px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.65', overflow: 'auto' },
  '.cm-content': { padding: '10px 0', caretColor: 'var(--accent-sage)' },
  '.cm-line': { padding: '0 14px' },
  '.cm-gutters': { background: 'transparent', color: 'var(--text-muted)', border: 'none', borderRight: '1px solid var(--border)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 12px', minWidth: '34px' },
  '.cm-activeLineGutter': { background: 'transparent', color: 'var(--text-secondary)' },
  '.cm-exec-line': { background: 'rgba(231,195,106,0.16)', boxShadow: 'inset 3px 0 0 var(--accent-amber)' },
  '.cm-bug-line': { background: 'rgba(224,82,82,0.10)' },
  '.cm-arrow-gutter': { width: '14px' },
  '.cm-exec-arrow': { color: 'var(--accent-amber)', fontSize: '10px' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { background: 'rgba(143,175,157,0.25) !important' },
  '.cm-matchingBracket': { background: 'rgba(143,175,157,0.3)', outline: 'none' },
});

/**
 * @param value       the code
 * @param onChange    (code) => void; omit for a read-only view
 * @param language    'python' | 'javascript' | 'java' | 'cpp'
 * @param activeLine  1-based line being executed (0 = none); the view scrolls to it
 * @param bugLines    1-based lines to tint red
 */
export default function CodeView({ value, onChange, language, activeLine = 0, bugLines = [], placeholder }) {
  const host = useRef(null);
  const view = useRef(null);
  const lang = useRef(new Compartment());
  const editable = useRef(new Compartment());
  const changeRef = useRef(onChange);
  useEffect(() => { changeRef.current = onChange; }, [onChange]);

  // create once
  useEffect(() => {
    const state = EditorState.create({
      doc: value || '',
      extensions: [
        marksField,
        arrowGutter,
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        syntaxHighlighting(highlight),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        theme,
        lang.current.of((LANGUAGES[language] || python)()),
        editable.current.of(EditorView.editable.of(Boolean(onChange))),
        EditorState.readOnly.of(!onChange),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && changeRef.current) changeRef.current(u.state.doc.toString());
        }),
        placeholder ? EditorView.contentAttributes.of({ 'aria-placeholder': placeholder }) : [],
      ],
    });
    view.current = new EditorView({ state, parent: host.current });
    return () => view.current.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // language switch
  useEffect(() => {
    view.current?.dispatch({ effects: lang.current.reconfigure((LANGUAGES[language] || python)()) });
  }, [language]);

  // external code changes (language switch, LeetCode import ...) without fighting the user's typing
  useEffect(() => {
    const v = view.current;
    if (v && (value || '') !== v.state.doc.toString()) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value || '' } });
    }
  }, [value]);

  // executing line / bug markers
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch({ effects: setMarks.of({ active: activeLine, bugs: bugLines }) });
    if (activeLine >= 1 && activeLine <= v.state.doc.lines) {
      v.dispatch({ effects: EditorView.scrollIntoView(v.state.doc.line(activeLine).from, { y: 'nearest', yMargin: 48 }) });
    }
  }, [activeLine, bugLines]);

  return <div ref={host} style={{ height: '100%', minHeight: 0, overflow: 'hidden' }} />;
}
