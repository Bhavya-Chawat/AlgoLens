import java.lang.reflect.Array;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Turns a live Java object into the JSON "value" shape AlgoLens renders (the same shape the
 * Python and JavaScript tracers produce). It runs *inside the program being traced*: the JDI
 * tracer invokes {@link #enc(Object)} on the objects it wants to show, so Java's real
 * collections (ArrayList, HashMap, PriorityQueue ...) are read through their public API
 * instead of being decoded from internal fields.
 *
 * Conventions: arrays and collections -> JSON arrays, maps -> objects, user objects ->
 * {"__class__","__id__", fields...}; linked-list / tree nodes keep their val/next/left/right
 * shape so the visualisers can draw them.
 */
public final class AlgoSer {
    private static final int MAX_ITEMS = 60;
    private static final int MAX_KEYS = 40;
    private static final int MAX_DEPTH = 4;
    private static final int MAX_NODES = 80;
    private static final int MAX_STR = 200;
    private static final long MAX_SAFE = 9007199254740992L;

    private static final IdentityHashMap<Object, Integer> IDS = new IdentityHashMap<>();
    private static final Set<Object> PATH = Collections.newSetFromMap(new IdentityHashMap<>());

    private AlgoSer() {}

    /** Forces the class to load so the debugger can find it before the first step. */
    public static void warm() {}

    /** "type|json" for a value (type is the display type: int, str, list, dict, set, ClassName ...). */
    public static String enc(Object o) {
        try {
            PATH.clear();
            StringBuilder sb = new StringBuilder();
            sb.append(typeName(o)).append('|');
            write(sb, o, 0);
            return sb.toString();
        } catch (Throwable t) {
            return "str|\"<unprintable>\"";
        }
    }

    /** enc() of several objects in ONE call into the traced VM (each call costs a debugger round trip). */
    public static String encAll(Object[] objects) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < objects.length; i++) {
            if (i > 0) sb.append('\u0001');
            sb.append(enc(objects[i]));
        }
        return sb.toString();
    }

    /** LeetCode-style plain form of trees / linked lists, or null. Used to compare with expected output. */
    public static String plain(Object o) {
        try {
            if (o == null) return null;
            if (hasField(o, "left") || hasField(o, "right")) return treeToList(o);
            if (hasField(o, "next") && hasField(o, "val")) return linkedToList(o);
        } catch (Throwable ignored) {
            // not a node structure
        }
        return null;
    }

    public static int idOf(Object o) {
        return System.identityHashCode(o);
    }

    // ── type names ──────────────────────────────────────────────────────────────────────────
    static String typeName(Object o) {
        if (o == null) return "NoneType";
        if (o instanceof Boolean) return "bool";
        if (o instanceof Integer || o instanceof Long || o instanceof Short || o instanceof Byte) return "int";
        if (o instanceof Float || o instanceof Double) return "float";
        if (o instanceof Character || o instanceof CharSequence) return "str";
        if (o.getClass().isArray()) return "list";
        if (o instanceof Map) return "dict";
        if (o instanceof Set) return "set";
        // keep the kind of container: a PriorityQueue is a heap, an ArrayDeque a queue, a Stack a stack
        if (o instanceof java.util.PriorityQueue) return "PriorityQueue";
        if (o instanceof java.util.Stack) return "Stack";
        if (o instanceof java.util.ArrayDeque) return "ArrayDeque";
        if (o instanceof java.util.LinkedList) return "LinkedList";
        if (o instanceof Collection) return "list";
        if (o instanceof Enum) return "str";
        return o.getClass().getSimpleName();
    }

    // ── JSON writing ────────────────────────────────────────────────────────────────────────
    private static void write(StringBuilder sb, Object o, int depth) {
        if (o == null) { sb.append("null"); return; }
        if (o instanceof Boolean) { sb.append(o); return; }
        if (o instanceof Integer || o instanceof Short || o instanceof Byte) { sb.append(o); return; }
        if (o instanceof Long) {
            long v = (Long) o;
            if (v > MAX_SAFE || v < -MAX_SAFE) string(sb, Long.toString(v)); else sb.append(v);
            return;
        }
        if (o instanceof Float || o instanceof Double) { number(sb, ((Number) o).doubleValue()); return; }
        if (o instanceof Character || o instanceof Enum) { string(sb, String.valueOf(o)); return; }
        if (o instanceof CharSequence) { string(sb, clip(o.toString())); return; }
        if (isNode(o)) { node(sb, o, new int[] {MAX_NODES}); return; }
        if (depth >= MAX_DEPTH) { string(sb, clip(safeString(o))); return; }
        if (PATH.contains(o)) { string(sb, "[circular]"); return; }

        PATH.add(o);
        try {
            if (o.getClass().isArray()) {
                int len = Array.getLength(o);
                sb.append('[');
                int shown = Math.min(len, MAX_ITEMS);
                for (int i = 0; i < shown; i++) {
                    if (i > 0) sb.append(',');
                    write(sb, Array.get(o, i), depth + 1);
                }
                if (len > shown) { sb.append(','); string(sb, "+" + (len - shown) + " more"); }
                sb.append(']');
            } else if (o instanceof Map) {
                Map<?, ?> m = (Map<?, ?>) o;
                sb.append('{');
                int i = 0;
                for (Map.Entry<?, ?> e : m.entrySet()) {
                    if (i >= MAX_KEYS) { sb.append(','); string(sb, "…"); sb.append(':'); string(sb, "+" + (m.size() - MAX_KEYS) + " more"); break; }
                    if (i++ > 0) sb.append(',');
                    string(sb, clip(String.valueOf(e.getKey())));
                    sb.append(':');
                    write(sb, e.getValue(), depth + 1);
                }
                sb.append('}');
            } else if (o instanceof Collection) {
                Collection<?> c = (Collection<?>) o;
                sb.append('[');
                int i = 0;
                for (Object x : c) {
                    if (i >= MAX_ITEMS) { sb.append(','); string(sb, "+" + (c.size() - MAX_ITEMS) + " more"); break; }
                    if (i++ > 0) sb.append(',');
                    write(sb, x, depth + 1);
                }
                sb.append(']');
            } else if (isPlainJdk(o)) {
                string(sb, clip(safeString(o)));
            } else {
                object(sb, o, depth);
            }
        } finally {
            PATH.remove(o);
        }
    }

    private static boolean isPlainJdk(Object o) {
        String n = o.getClass().getName();
        return n.startsWith("java.") || n.startsWith("javax.") || n.startsWith("jdk.");
    }

    private static void object(StringBuilder sb, Object o, int depth) {
        sb.append("{\"__class__\":");
        string(sb, o.getClass().getSimpleName());
        sb.append(",\"__id__\":").append(id(o));
        int shown = 0;
        for (Field f : fieldsOf(o.getClass())) {
            if (shown >= 20) break;
            try {
                f.setAccessible(true);
                sb.append(',');
                string(sb, f.getName());
                sb.append(':');
                write(sb, f.get(o), depth + 1);
                shown++;
            } catch (Throwable ignored) {
                // inaccessible field: leave it out
            }
        }
        sb.append('}');
    }

    // ── linked lists / trees ────────────────────────────────────────────────────────────────
    private static boolean hasField(Object o, String name) {
        return field(o.getClass(), name) != null;
    }

    /** Finds a declared field without throwing: an exception inside the traced VM would raise a debugger event. */
    private static Field field(Class<?> c, String name) {
        for (Class<?> k = c; k != null && k != Object.class; k = k.getSuperclass()) {
            for (Field f : k.getDeclaredFields()) {
                if (f.getName().equals(name)) {
                    try {
                        f.setAccessible(true);
                        return f;
                    } catch (RuntimeException e) {
                        return null;
                    }
                }
            }
        }
        return null;
    }

    /** Classes proven to be nodes (a trie node with children, a graph node with neighbours): all their instances are. */
    private static final Set<Class<?>> NODE_CLASSES = new java.util.HashSet<>();
    private static final String[] LINK_FIELDS = {"children", "neighbors", "neighbours", "kids"};

    private static boolean isNode(Object o) {
        if (isPlainJdk(o) || o.getClass().isArray()) return false;
        if (hasField(o, "val") && (hasField(o, "next") || hasField(o, "left") || hasField(o, "right"))) return true;
        Class<?> c = o.getClass();
        if (NODE_CLASSES.contains(c)) return true;
        if (linksToOwnClass(o, c)) { NODE_CLASSES.add(c); return true; }
        return false;
    }

    private static boolean sameClass(Object x, Class<?> c) {
        return x != null && x.getClass() == c;
    }

    /** A field named children / neighbours (even empty), or a field holding objects of the object's own class. */
    private static boolean linksToOwnClass(Object o, Class<?> c) {
        for (Field f : fieldsOf(c)) {
            Object x;
            try {
                f.setAccessible(true);
                x = f.get(o);
            } catch (Throwable t) {
                continue;
            }
            for (String link : LINK_FIELDS) {
                if (f.getName().equals(link) && (x instanceof Collection || x instanceof Map || (x != null && x.getClass().isArray()))) return true;
            }
            if (sameClass(x, c)) return true;
            if (x instanceof Collection) {
                int k = 0;
                for (Object y : (Collection<?>) x) { if (sameClass(y, c)) return true; if (++k >= 8) break; }
            } else if (x instanceof Map) {
                int k = 0;
                for (Object y : ((Map<?, ?>) x).values()) { if (sameClass(y, c)) return true; if (++k >= 8) break; }
            } else if (x != null && x.getClass().isArray() && !x.getClass().getComponentType().isPrimitive()) {
                int len = Math.min(Array.getLength(x), 8);
                for (int k = 0; k < len; k++) if (sameClass(Array.get(x, k), c)) return true;
            }
        }
        return false;
    }

    private static Object get(Object o, String name) {
        try {
            Field f = field(o.getClass(), name);
            return f == null ? null : f.get(o);
        } catch (Throwable t) {
            return null;
        }
    }

    private static void node(StringBuilder sb, Object o, int[] budget) {
        if (PATH.contains(o)) { sb.append("{\"__cycle__\":").append(id(o)).append('}'); return; }
        if (budget[0] <= 0) { string(sb, "…"); return; }
        budget[0]--;
        PATH.add(o);
        try {
            sb.append("{\"__class__\":");
            string(sb, o.getClass().getSimpleName());
            sb.append(",\"__id__\":").append(id(o));
            for (String name : new String[] {"val", "left", "right", "next"}) {
                if (!hasField(o, name)) continue;
                Object child = get(o, name);
                sb.append(',');
                string(sb, name);
                sb.append(':');
                if (child == null) sb.append("null");
                else if (!"val".equals(name) && isNode(child)) node(sb, child, budget);
                else write(sb, child, MAX_DEPTH - 1);
            }
            // a node with no left/right/next is held together by its children (trie, n-ary tree, graph node):
            // collections of nodes are structure and are embedded, a lone node attribute is a reference
            boolean structural = !(hasField(o, "left") || hasField(o, "right") || hasField(o, "next"));
            if (structural) {
                int shown = 0;
                for (Field f : fieldsOf(o.getClass())) {
                    String name = f.getName();
                    if ("val".equals(name) || shown >= 20) continue;
                    Object x;
                    try {
                        f.setAccessible(true);
                        x = f.get(o);
                    } catch (Throwable t) {
                        continue;
                    }
                    shown++;
                    sb.append(',');
                    string(sb, name);
                    sb.append(':');
                    embed(sb, x, budget);
                }
            }
            sb.append('}');
        } finally {
            PATH.remove(o);
        }
    }

    /** A field of a structural node: nodes inside collections are embedded, a lone node is a reference. */
    private static void embed(StringBuilder sb, Object x, int[] budget) {
        if (x == null) { sb.append("null"); return; }
        if (isNode(x)) { sb.append("{\"__ref__\":").append(id(x)).append('}'); return; }
        if (x instanceof Collection && hasNodes((Collection<?>) x)) {
            sb.append('[');
            int i = 0;
            for (Object y : (Collection<?>) x) {
                if (i >= MAX_ITEMS) break;
                if (i++ > 0) sb.append(',');
                if (isNode(y)) node(sb, y, budget); else write(sb, y, MAX_DEPTH - 1);
            }
            sb.append(']');
        } else if (x instanceof Map && hasNodes(((Map<?, ?>) x).values())) {
            sb.append('{');
            int i = 0;
            for (Map.Entry<?, ?> e : ((Map<?, ?>) x).entrySet()) {
                if (i >= MAX_KEYS) break;
                if (i++ > 0) sb.append(',');
                string(sb, clip(String.valueOf(e.getKey())));
                sb.append(':');
                if (isNode(e.getValue())) node(sb, e.getValue(), budget); else write(sb, e.getValue(), MAX_DEPTH - 1);
            }
            sb.append('}');
        } else if (x.getClass().isArray() && !x.getClass().getComponentType().isPrimitive() && hasNodes(java.util.Arrays.asList((Object[]) x))) {
            Object[] arr = (Object[]) x;
            sb.append('[');
            for (int i = 0; i < Math.min(arr.length, MAX_ITEMS); i++) {
                if (i > 0) sb.append(',');
                if (arr[i] == null) sb.append("null");
                else if (isNode(arr[i])) node(sb, arr[i], budget);
                else write(sb, arr[i], MAX_DEPTH - 1);
            }
            sb.append(']');
        } else {
            write(sb, x, MAX_DEPTH - 1);
        }
    }

    private static boolean hasNodes(Collection<?> c) {
        int k = 0;
        for (Object y : c) { if (y != null && isNode(y)) return true; if (++k >= 8) break; }
        return false;
    }

    private static String treeToList(Object root) {
        List<Object> out = new ArrayList<>();
        List<Object> queue = new ArrayList<>();
        queue.add(root);
        int guard = 0;
        for (int i = 0; i < queue.size() && guard++ < 20000; i++) {
            Object n = queue.get(i);
            if (n == null) { out.add(null); continue; }
            out.add(get(n, "val"));
            queue.add(get(n, "left"));
            queue.add(get(n, "right"));
        }
        while (!out.isEmpty() && out.get(out.size() - 1) == null) out.remove(out.size() - 1);
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < out.size(); i++) {
            if (i > 0) sb.append(',');
            write(sb, out.get(i), MAX_DEPTH - 1);
        }
        return sb.append(']').toString();
    }

    private static String linkedToList(Object head) {
        StringBuilder sb = new StringBuilder("[");
        Set<Object> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        int n = 0;
        for (Object cur = head; cur != null && seen.add(cur) && n < 10000; cur = get(cur, "next"), n++) {
            if (n > 0) sb.append(',');
            write(sb, get(cur, "val"), MAX_DEPTH - 1);
        }
        return sb.append(']').toString();
    }

    // ── helpers ─────────────────────────────────────────────────────────────────────────────
    private static List<Field> fieldsOf(Class<?> c) {
        List<Field> out = new ArrayList<>();
        for (Class<?> k = c; k != null && k != Object.class; k = k.getSuperclass()) {
            for (Field f : k.getDeclaredFields()) {
                if (Modifier.isStatic(f.getModifiers()) || f.isSynthetic()) continue;
                out.add(f);
            }
        }
        return out;
    }

    private static int id(Object o) {
        Integer id = IDS.get(o);
        if (id == null) {
            id = IDS.size() + 1;
            IDS.put(o, id);
        }
        return id;
    }

    private static String safeString(Object o) {
        try {
            return String.valueOf(o);
        } catch (Throwable t) {
            return "<unprintable>";
        }
    }

    private static String clip(String s) {
        return s.length() > MAX_STR ? s.substring(0, MAX_STR) + "…" : s;
    }

    private static void number(StringBuilder sb, double v) {
        if (Double.isNaN(v)) string(sb, "NaN");
        else if (Double.isInfinite(v)) string(sb, v > 0 ? "Infinity" : "-Infinity");
        else if (v == Math.rint(v) && Math.abs(v) < 1e15) sb.append((long) v);
        else sb.append(v);
    }

    static void string(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        sb.append('"');
    }
}
