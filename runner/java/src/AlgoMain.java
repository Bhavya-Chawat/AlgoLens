import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.PrintStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.Parameter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Entry point of the program being traced. It is started by the JDI tracer (AlgoRunner) in a
 * separate JVM and does exactly what a LeetCode judge does: find the user's method, build typed
 * arguments from the JSON the user typed (matched by parameter *name*), call it, and report the
 * result. Nothing here is instrumented - the debugger observes the real execution.
 *
 * argv[0] = job.json   argv[1] = result.json (written here)
 */
public final class AlgoMain {
    private static final Gson GSON = new Gson();

    private AlgoMain() {}

    public static void main(String[] argv) throws Throwable {
        AlgoSer.warm(); // load the serializer so the debugger can call it from the first step
        Path resultFile = Paths.get(argv[1]);
        JsonObject job = JsonParser.parseString(Files.readString(Paths.get(argv[0]), StandardCharsets.UTF_8)).getAsJsonObject();
        JsonObject entry = job.has("entry") && job.get("entry").isJsonObject() ? job.getAsJsonObject("entry") : null;
        String mode = job.has("mode") ? job.get("mode").getAsString() : "function";

        try {
            if ("script".equals(mode)) runMain(job, entry);
            else runFunction(job, entry, resultFile);
        } catch (InvocationTargetException e) {
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            fail(resultFile, cause);
            throw cause;
        } catch (Throwable t) {
            fail(resultFile, t);
            throw t;
        }
        System.out.flush();
        System.exit(0); // a user thread must not keep the traced VM alive
    }

    // ── script mode: public static void main(String[]) ──────────────────────────────────────
    private static void runMain(JsonObject job, JsonObject entry) throws Throwable {
        for (String name : candidateClasses(job, entry)) {
            Class<?> c = Class.forName(name);
            try {
                Method m = c.getDeclaredMethod("main", String[].class);
                m.setAccessible(true);
                m.invoke(null, (Object) new String[0]);
                return;
            } catch (NoSuchMethodException ignored) {
                // try the next class
            }
        }
        throw new IllegalStateException("No class with public static void main(String[] args) was found.");
    }

    // ── function mode: call one method with typed arguments ─────────────────────────────────
    private static void runFunction(JsonObject job, JsonObject entry, Path resultFile) throws Throwable {
        String wantedMethod = entry != null && entry.has("name") && !entry.get("name").isJsonNull() ? entry.get("name").getAsString() : null;
        JsonObject args = job.has("args") && job.get("args").isJsonObject() ? job.getAsJsonObject("args") : new JsonObject();
        if (wantedMethod == null) throw new IllegalStateException("No entry method was selected.");

        Class<?> owner = null;
        List<Method> overloads = new ArrayList<>();
        for (String className : candidateClasses(job, entry)) {
            Class<?> c = Class.forName(className);
            List<Method> found = new ArrayList<>();
            for (Method m : c.getDeclaredMethods()) if (m.getName().equals(wantedMethod) && !m.isSynthetic()) found.add(m);
            if (!found.isEmpty()) { owner = c; overloads = found; break; }
        }
        if (owner == null) throw new NoSuchMethodException("Method '" + wantedMethod + "' was not found in your code.");

        Method method = overloads.get(0);
        for (Method m : overloads) if (m.getParameterCount() == args.size()) { method = m; break; }
        method.setAccessible(true);

        Object[] callArgs = buildArguments(method, args);
        Object self = null;
        if (!Modifier.isStatic(method.getModifiers())) {
            Constructor<?> ctor = owner.getDeclaredConstructor();
            ctor.setAccessible(true);
            self = ctor.newInstance();
        }

        Object result = method.invoke(self, callArgs);
        writeResult(resultFile, result);
    }

    private static List<String> candidateClasses(JsonObject job, JsonObject entry) {
        List<String> names = new ArrayList<>();
        if (entry != null && entry.has("className") && !entry.get("className").isJsonNull()) names.add(entry.get("className").getAsString());
        if (job.has("classes")) {
            List<String> all = new ArrayList<>();
            for (JsonElement e : job.getAsJsonArray("classes")) all.add(e.getAsString());
            if (all.remove("Solution")) names.add(0, "Solution"); // Solution first
            for (String n : all) if (!names.contains(n) && !n.equals("TreeNode") && !n.equals("ListNode")) names.add(n);
        }
        return names;
    }

    // ── arguments ───────────────────────────────────────────────────────────────────────────
    private static Object[] buildArguments(Method method, JsonObject args) throws Exception {
        Parameter[] params = method.getParameters();
        List<String> keys = new ArrayList<>(args.keySet());
        boolean byName = true;
        for (Parameter p : params) byName &= args.has(p.getName());
        Object[] out = new Object[params.length];
        for (int i = 0; i < params.length; i++) {
            Parameter p = params[i];
            JsonElement el;
            if (byName) el = args.get(p.getName());
            else if (keys.size() == params.length) el = args.get(keys.get(i)); // names differ: use the order typed
            else throw new IllegalArgumentException("Missing argument '" + p.getName() + "' - add it in Function Arguments.");
            out[i] = convert(el, p);
        }
        return out;
    }

    private static Object convert(JsonElement el, Parameter p) throws Exception {
        String simple = p.getType().getSimpleName();
        if ("TreeNode".equals(simple)) return buildTree(el, p.getType());
        if ("ListNode".equals(simple)) return buildList(el, p.getType());
        if (el == null || el.isJsonNull()) return p.getType().isPrimitive() ? defaultFor(p.getType()) : null;
        return GSON.fromJson(el, p.getParameterizedType());
    }

    private static Object defaultFor(Class<?> t) {
        if (t == boolean.class) return false;
        if (t == char.class) return '\0';
        if (t == long.class) return 0L;
        if (t == float.class) return 0f;
        if (t == double.class) return 0d;
        if (t == short.class) return (short) 0;
        if (t == byte.class) return (byte) 0;
        return 0;
    }

    private static Object newNode(Class<?> type, JsonElement val) throws Exception {
        Object node;
        try {
            Constructor<?> c = type.getDeclaredConstructor(int.class);
            c.setAccessible(true);
            node = c.newInstance(val.getAsInt());
        } catch (NoSuchMethodException e) {
            Constructor<?> c = type.getDeclaredConstructor();
            c.setAccessible(true);
            node = c.newInstance();
            Field f = type.getDeclaredField("val");
            f.setAccessible(true);
            f.set(node, GSON.fromJson(val, f.getGenericType()));
        }
        return node;
    }

    private static void set(Object target, String field, Object value) throws Exception {
        Field f = target.getClass().getDeclaredField(field);
        f.setAccessible(true);
        f.set(target, value);
    }

    /** LeetCode level-order list ([3,9,20,null,null,15,7]) -> TreeNode graph. */
    private static Object buildTree(JsonElement el, Class<?> type) throws Exception {
        if (el == null || !el.isJsonArray() || el.getAsJsonArray().isEmpty()) return null;
        JsonArray arr = el.getAsJsonArray();
        List<Object> nodes = new ArrayList<>();
        for (JsonElement v : arr) nodes.add(v.isJsonNull() ? null : newNode(type, v));
        int next = 1;
        for (Object n : nodes) {
            if (n == null) continue;
            if (next < nodes.size()) set(n, "left", nodes.get(next++));
            if (next < nodes.size()) set(n, "right", nodes.get(next++));
        }
        return nodes.get(0);
    }

    private static Object buildList(JsonElement el, Class<?> type) throws Exception {
        if (el == null || !el.isJsonArray()) return null;
        JsonArray arr = el.getAsJsonArray();
        Object head = null;
        for (int i = arr.size() - 1; i >= 0; i--) {
            Object node = newNode(type, arr.get(i));
            set(node, "next", head);
            head = node;
        }
        return head;
    }

    // ── result / failure files ──────────────────────────────────────────────────────────────
    private static void writeResult(Path file, Object result) throws Exception {
        String enc = AlgoSer.enc(result);
        int bar = enc.indexOf('|');
        String plain = AlgoSer.plain(result);
        String json = "{\"type\":" + quote(enc.substring(0, bar)) + ",\"value\":" + enc.substring(bar + 1)
            + ",\"plain\":" + (plain == null ? "null" : plain) + "}";
        Files.writeString(file, json, StandardCharsets.UTF_8);
    }

    private static void fail(Path file, Throwable t) {
        try {
            String message = t.getMessage() == null ? "" : t.getMessage();
            String json = "{\"error\":{\"type\":" + quote(t.getClass().getSimpleName()) + ",\"message\":" + quote(message)
                + ",\"idHash\":" + AlgoSer.idOf(t) + "}}";
            Files.writeString(file, json, StandardCharsets.UTF_8);
        } catch (Throwable ignored) {
            // the exception itself still reaches stderr through the JVM's default handler
        }
    }

    private static String quote(String s) {
        StringBuilder sb = new StringBuilder();
        AlgoSer.string(sb, s);
        return sb.toString();
    }
}
