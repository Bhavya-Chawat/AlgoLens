import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.jdi.AbsentInformationException;
import com.sun.jdi.ArrayReference;
import com.sun.jdi.ArrayType;
import com.sun.jdi.BooleanValue;
import com.sun.jdi.Bootstrap;
import com.sun.jdi.ByteValue;
import com.sun.jdi.CharValue;
import com.sun.jdi.ClassType;
import com.sun.jdi.DoubleValue;
import com.sun.jdi.Field;
import com.sun.jdi.FloatValue;
import com.sun.jdi.IntegerValue;
import com.sun.jdi.LocalVariable;
import com.sun.jdi.Location;
import com.sun.jdi.LongValue;
import com.sun.jdi.Method;
import com.sun.jdi.ObjectReference;
import com.sun.jdi.ReferenceType;
import com.sun.jdi.ShortValue;
import com.sun.jdi.StackFrame;
import com.sun.jdi.StringReference;
import com.sun.jdi.ThreadReference;
import com.sun.jdi.Value;
import com.sun.jdi.VirtualMachine;
import com.sun.jdi.VMDisconnectedException;
import com.sun.jdi.VoidValue;
import com.sun.jdi.connect.Connector;
import com.sun.jdi.connect.LaunchingConnector;
import com.sun.jdi.event.Event;
import com.sun.jdi.event.BreakpointEvent;
import com.sun.jdi.event.ClassPrepareEvent;
import com.sun.jdi.event.EventQueue;
import com.sun.jdi.event.EventSet;
import com.sun.jdi.event.ExceptionEvent;
import com.sun.jdi.event.MethodEntryEvent;
import com.sun.jdi.event.MethodExitEvent;
import com.sun.jdi.event.StepEvent;
import com.sun.jdi.event.VMDeathEvent;
import com.sun.jdi.event.VMDisconnectEvent;
import com.sun.jdi.event.VMStartEvent;
import com.sun.jdi.request.BreakpointRequest;
import com.sun.jdi.request.ClassPrepareRequest;
import com.sun.jdi.request.EventRequest;
import com.sun.jdi.request.EventRequestManager;
import com.sun.jdi.request.StepRequest;

import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;
import java.io.File;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Compiles a Java solution and traces its *real* execution with the JDK's own debugger API (JDI).
 * No source instrumentation, no parser: the JVM reports every line, call, return and exception.
 *
 * Protocol (stdin -> stdout, one JSON document per line):
 *   in : the job  { code, args, mode, entry, limits:{steps,stdout,timeMs}, stdin }
 *   out: {"t":"p","m":"..."}            progress
 *        {"t":"s","k":"call|line|ret|exc", ...}   one trace step (same shape as the Python/JS tracers)
 *        {"t":"e", ...}                 the end: stdout, result, error, truncated
 */
public final class AlgoRunner {
    private static final String[] EXCLUDED = {"java.*", "javax.*", "jdk.*", "sun.*", "com.sun.*", "com.google.*", "AlgoMain*", "AlgoSer*"};
    private static final Set<String> PRIMITIVES = Set.of("int", "long", "short", "byte", "double", "float", "boolean", "char");
    private static final Pattern PUBLIC_TYPE = Pattern.compile("public\\s+(?:(?:final|abstract|strictfp)\\s+)*(?:class|interface|enum|record)\\s+(\\w+)");
    private static final PrintStream OUT = new PrintStream(new FileOutputStream(FileDescriptor.out), false, StandardCharsets.UTF_8);
    private static final Gson GSON = new com.google.gson.GsonBuilder().serializeNulls().create();
    private static final boolean DEBUG = System.getenv("ALGOLENS_DEBUG") != null;

    private static final long T0 = System.nanoTime();

    private static void debug(String message) {
        if (DEBUG) System.err.println("[algolens +" + ((System.nanoTime() - T0) / 1_000_000) + "ms] " + message);
    }

    private final JsonObject job;
    private final int stepLimit;
    private final int stdoutCap;
    private final long timeMs;

    // run state
    private VirtualMachine vm;
    private ThreadReference mainThread;
    private final Deque<Frame> stack = new ArrayDeque<>();
    private int nextFid = 1;
    private int steps = 0;
    private boolean truncated = false;
    private volatile boolean timedOut = false;
    private final StringBuilder stdout = new StringBuilder();
    private boolean stdoutClipped = false;
    private int lastOut = 0;
    private final Map<Long, Integer> excIds = new HashMap<>();
    private final Map<String, Integer> excByKey = new HashMap<>(); // "Type\0message" -> exception id
    private final Map<Integer, Integer> excLine = new HashMap<>();
    // Tracing starts only when the user's entry method is first entered: everything before that is
    // our own harness (JDK boot, Gson, reflection) and stepping through it would be slow and meaningless.
    private volatile boolean armed = false;
    private volatile long lastEventAt = System.nanoTime();
    private long idleMs = 6000;
    private final List<String> userClasses = new ArrayList<>();
    private final List<EventRequest> triggers = new ArrayList<>();
    private String entryClass;
    private String entryName;
    private boolean scriptMode;
    private final List<EventRequest> live = new ArrayList<>(); // requests active while tracing
    private ClassType serClass;
    private Method encMethod;
    private Method encAllMethod;
    private ArrayType objectArray;

    private static final class Frame {
        final int fid;
        final int depth;
        final String name;
        int line;
        Map<String, String> last = new LinkedHashMap<>();
        boolean fresh = true; // the first step on the entry line repeats the call and is skipped

        Frame(int fid, int depth, String name, int line) {
            this.fid = fid;
            this.depth = depth;
            this.name = name;
            this.line = line;
        }
    }

    private AlgoRunner(JsonObject job) {
        this.job = job;
        JsonObject limits = job.has("limits") && job.get("limits").isJsonObject() ? job.getAsJsonObject("limits") : new JsonObject();
        this.stepLimit = limits.has("steps") ? limits.get("steps").getAsInt() : 20000;
        this.stdoutCap = limits.has("stdout") ? limits.get("stdout").getAsInt() : 65536;
        this.timeMs = limits.has("timeMs") ? limits.get("timeMs").getAsLong() : 30000L;
        if (limits.has("idleMs")) this.idleMs = limits.get("idleMs").getAsLong();
    }

    public static void main(String[] args) throws Exception {
        String raw = new String(System.in.readAllBytes(), StandardCharsets.UTF_8);
        new AlgoRunner(JsonParser.parseString(raw).getAsJsonObject()).run();
        OUT.flush();
        System.exit(0);
    }

    // ── output ──────────────────────────────────────────────────────────────────────────────
    private static synchronized void emit(String line) {
        OUT.println(line);
        OUT.flush();
    }

    private static String q(String s) {
        return GSON.toJson(s);
    }

    private static void progress(String message) {
        emit("{\"t\":\"p\",\"m\":" + q(message) + "}");
    }

    private void end(String errorJson, String resultJson) {
        String text;
        synchronized (stdout) {
            text = stdout.toString();
        }
        emit("{\"t\":\"e\",\"truncated\":" + truncated + ",\"timedOut\":" + timedOut
            + ",\"stdout\":" + q(text) + ",\"stdoutClipped\":" + stdoutClipped
            + ",\"result\":" + (resultJson == null ? "null" : resultJson)
            + ",\"error\":" + (errorJson == null ? "null" : errorJson) + "}");
    }

    // ── driver ──────────────────────────────────────────────────────────────────────────────
    private void run() throws Exception {
        debug("start");
        progress("Compiling…");
        Path work = Files.createTempDirectory(Paths.get(System.getProperty("algolens.work", System.getProperty("java.io.tmpdir"))), "al");
        Path classes = Files.createDirectories(work.resolve("classes"));

        String code = job.get("code").getAsString();
        String fileName = "Solution";
        Matcher m = PUBLIC_TYPE.matcher(code);
        if (m.find()) fileName = m.group(1);
        boolean hasPackage = Pattern.compile("^\\s*package\\s+", Pattern.MULTILINE).matcher(code).find();
        if (hasPackage) {
            end("{\"type\":\"CompileError\",\"message\":\"Remove the 'package' line: AlgoLens runs your classes in the default package.\",\"line\":1}", null);
            return;
        }
        // LeetCode imports java.util.* for you. Prepending on the same line keeps every line number intact.
        Path userFile = work.resolve(fileName + ".java");
        Files.writeString(userFile, "import java.util.*; import java.util.function.*; import java.util.stream.*; " + code, StandardCharsets.UTF_8);

        List<File> sources = new ArrayList<>();
        sources.add(userFile.toFile());
        StringBuilder helpers = new StringBuilder();
        if (!Pattern.compile("\\bclass\\s+TreeNode\\b").matcher(code).find() || !Pattern.compile("\\bclass\\s+ListNode\\b").matcher(code).find()) {
            String all = new String(AlgoRunner.class.getResourceAsStream("/LeetCodeHelpers.java.txt").readAllBytes(), StandardCharsets.UTF_8);
            String[] parts = all.split("(?=class TreeNode)");
            if (!Pattern.compile("\\bclass\\s+ListNode\\b").matcher(code).find()) helpers.append(parts[0]);
            if (!Pattern.compile("\\bclass\\s+TreeNode\\b").matcher(code).find()) helpers.append(parts[1]);
            Path helperFile = work.resolve("LeetCodeHelpers.java");
            Files.writeString(helperFile, helpers.toString(), StandardCharsets.UTF_8);
            sources.add(helperFile.toFile());
        }

        String gsonJar = locate("gson.jar");
        String compileError = compile(sources, classes, gsonJar, fileName);
        debug("compiled");
        if (compileError != null) {
            end(compileError, null);
            return;
        }

        // job.json for the traced program (original job + the classes that exist)
        JsonObject forMain = job.deepCopy();
        JsonArray names = new JsonArray();
        try (Stream<Path> walk = Files.walk(classes)) {
            for (Path p : walk.filter(x -> x.toString().endsWith(".class")).collect(Collectors.toList())) {
                String rel = classes.relativize(p).toString().replace(File.separatorChar, '.');
                names.add(rel.substring(0, rel.length() - ".class".length()));
            }
        }
        forMain.add("classes", names);
        for (JsonElement n : names) if (!n.getAsString().equals("TreeNode") && !n.getAsString().equals("ListNode")) userClasses.add(n.getAsString());
        scriptMode = "script".equals(job.has("mode") ? job.get("mode").getAsString() : "function");
        JsonObject entry = job.has("entry") && job.get("entry").isJsonObject() ? job.getAsJsonObject("entry") : null;
        entryName = scriptMode ? "main" : entry != null && entry.has("name") && !entry.get("name").isJsonNull() ? entry.get("name").getAsString() : null;
        entryClass = entry != null && entry.has("className") && !entry.get("className").isJsonNull() ? entry.get("className").getAsString() : null;
        Path jobFile = work.resolve("job.json");
        Path resultFile = work.resolve("result.json");
        Files.writeString(jobFile, GSON.toJson(forMain), StandardCharsets.UTF_8);

        progress("Running…");
        trace(classes, gsonJar, jobFile, resultFile);
    }

    private static String locate(String jarName) throws Exception {
        String prop = System.getProperty("algolens.lib");
        List<Path> candidates = new ArrayList<>();
        if (prop != null) candidates.add(Paths.get(prop).resolve(jarName));
        Path self = Paths.get(AlgoRunner.class.getProtectionDomain().getCodeSource().getLocation().toURI());
        Path dir = Files.isDirectory(self) ? self : self.getParent();
        candidates.add(dir.resolve(jarName));
        candidates.add(dir.resolve("lib").resolve(jarName));
        candidates.add(dir.getParent() == null ? dir.resolve(jarName) : dir.getParent().resolve("lib").resolve(jarName));
        for (Path c : candidates) if (Files.exists(c)) return c.toAbsolutePath().toString();
        throw new IllegalStateException("Cannot find " + jarName);
    }

    // ── compile ─────────────────────────────────────────────────────────────────────────────
    private String compile(List<File> files, Path classes, String gsonJar, String userClass) {
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) return "{\"type\":\"InternalError\",\"message\":\"No Java compiler (a JDK is required).\",\"line\":null}";
        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        try (StandardJavaFileManager fm = compiler.getStandardFileManager(diagnostics, Locale.ENGLISH, StandardCharsets.UTF_8)) {
            List<String> options = List.of("-g", "-parameters", "-proc:none", "-Xlint:none", "-nowarn", "-d", classes.toString(), "-cp", gsonJar);
            boolean ok = compiler.getTask(null, fm, diagnostics, options, null, fm.getJavaFileObjectsFromFiles(files)).call();
            if (ok) return null;
        } catch (IOException e) {
            return "{\"type\":\"InternalError\",\"message\":" + q(e.getMessage()) + ",\"line\":null}";
        }
        List<String> messages = new ArrayList<>();
        long firstLine = -1;
        for (Diagnostic<? extends JavaFileObject> d : diagnostics.getDiagnostics()) {
            if (d.getKind() != Diagnostic.Kind.ERROR) continue;
            boolean inUserFile = d.getSource() != null && d.getSource().getName().endsWith(userClass + ".java");
            if (inUserFile && firstLine < 0) firstLine = d.getLineNumber();
            if (messages.size() < 4) messages.add((inUserFile ? "line " + d.getLineNumber() + ": " : "") + d.getMessage(Locale.ENGLISH).split("\n")[0]);
        }
        return "{\"type\":\"CompileError\",\"message\":" + q(String.join("\n", messages)) + ",\"line\":" + (firstLine < 0 ? "null" : firstLine) + "}";
    }

    // ── trace ───────────────────────────────────────────────────────────────────────────────
    private void trace(Path classes, String gsonJar, Path jobFile, Path resultFile) throws Exception {
        String self = Paths.get(AlgoRunner.class.getProtectionDomain().getCodeSource().getLocation().toURI()).toAbsolutePath().toString();
        String sep = File.pathSeparator;
        String cp = classes.toAbsolutePath() + sep + self + sep + gsonJar;

        LaunchingConnector connector = Bootstrap.virtualMachineManager().defaultConnector();
        Map<String, Connector.Argument> connectorArgs = connector.defaultArguments();
        connectorArgs.get("main").setValue("AlgoMain \"" + jobFile.toAbsolutePath() + "\" \"" + resultFile.toAbsolutePath() + "\"");
        connectorArgs.get("options").setValue("-cp \"" + cp + "\" -Xss2m -Xmx256m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -Xshare:auto -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8");
        debug("launching: main=" + connectorArgs.get("main").value() + " options=" + connectorArgs.get("options").value());
        vm = connector.launch(connectorArgs);
        debug("vm launched");
        Process process = vm.process();

        Thread outReader = pump(process.getInputStream());
        Thread errReader = pump(process.getErrorStream());
        String stdin = job.has("stdin") && !job.get("stdin").isJsonNull() ? job.get("stdin").getAsString() : "";
        try {
            process.getOutputStream().write(stdin.getBytes(StandardCharsets.UTF_8));
            process.getOutputStream().close();
        } catch (IOException ignored) {
            // the program may not read stdin at all
        }

        Thread watchdog = new Thread(() -> {
            long started = System.nanoTime();
            try {
                while (true) {
                    Thread.sleep(250);
                    long now = System.nanoTime();
                    boolean tooLong = (now - started) / 1_000_000 > timeMs;
                    // a loop that stays on ONE source line never produces a new line event
                    boolean stuck = armed && (now - lastEventAt) / 1_000_000 > idleMs;
                    if (tooLong || stuck) {
                        timedOut = true;
                        vm.exit(1);
                        return;
                    }
                }
            } catch (InterruptedException | VMDisconnectedException ignored) {
                // finished first
            }
        }, "al-watchdog");
        watchdog.setDaemon(true);
        watchdog.start();

        loop();
        debug("vm finished");
        try {
            vm.dispose(); // detach: the exiting VM keeps its output pipes open until the debugger lets go
        } catch (VMDisconnectedException ignored) {
            // already disconnected
        }
        process.waitFor(3, java.util.concurrent.TimeUnit.SECONDS);
        process.destroyForcibly();
        watchdog.interrupt();
        outReader.join(2000);
        errReader.join(2000);
        debug("streams drained");

        String error = null;
        String result = null;
        if (Files.exists(resultFile)) {
            JsonObject r = JsonParser.parseString(Files.readString(resultFile, StandardCharsets.UTF_8)).getAsJsonObject();
            if (r.has("error")) {
                JsonObject e = r.getAsJsonObject("error");
                Integer exc = excByKey.get(e.get("type").getAsString() + "\u0000" + e.get("message").getAsString());
                Integer line = exc == null ? null : excLine.get(exc);
                error = "{\"type\":" + q(e.get("type").getAsString()) + ",\"message\":" + q(e.get("message").getAsString())
                    + ",\"line\":" + (line == null ? "null" : line) + ",\"e\":" + (exc == null ? "null" : exc) + "}";
            } else {
                result = GSON.toJson(r);
            }
        }
        end(error, result);
        debug("end emitted");
    }

    private Thread pump(InputStream in) {
        Thread t = new Thread(() -> {
            byte[] buf = new byte[4096];
            try {
                for (int n; (n = in.read(buf)) > 0; ) {
                    String piece = new String(buf, 0, n, StandardCharsets.UTF_8);
                    synchronized (stdout) {
                        int room = stdoutCap - stdout.length();
                        if (room <= 0) { stdoutClipped = true; continue; }
                        if (piece.length() > room) { piece = piece.substring(0, room); stdoutClipped = true; }
                        stdout.append(piece);
                    }
                }
            } catch (IOException ignored) {
                // stream closed
            }
        }, "al-pump");
        t.setDaemon(true);
        t.start();
        return t;
    }

    private void loop() {
        EventRequestManager erm = vm.eventRequestManager();
        EventQueue queue = vm.eventQueue();
        try {
            boolean done = false;
            while (!done) {
                EventSet set = queue.remove(500);
                if (set == null) continue;
                lastEventAt = System.nanoTime();
                for (Event event : set) {
                    if (!(event instanceof StepEvent) && !(event instanceof MethodEntryEvent) && !(event instanceof MethodExitEvent)) debug("event " + event.getClass().getSimpleName());
                    if (event instanceof VMStartEvent) {
                        mainThread = ((VMStartEvent) event).thread();
                        installTriggers(erm);
                    } else if (event instanceof StepEvent) {
                        onStep((StepEvent) event);
                    } else if (event instanceof ClassPrepareEvent) {
                        onClassPrepare((ClassPrepareEvent) event, erm);
                    } else if (event instanceof BreakpointEvent) {
                        onBreakpoint((BreakpointEvent) event, erm);
                    } else if (event instanceof MethodEntryEvent) {
                        MethodEntryEvent entered = (MethodEntryEvent) event;
                        if (armed && isMain(entered.thread()) && !bridge(entered.method().declaringType().name())) {
                            enter(entered.thread(), entered.method(), entered.location().lineNumber());
                        }
                    } else if (event instanceof MethodExitEvent) {
                        onExit((MethodExitEvent) event);
                    } else if (event instanceof ExceptionEvent) {
                        onException((ExceptionEvent) event);
                    } else if (event instanceof VMDeathEvent || event instanceof VMDisconnectEvent) {
                        done = true;
                    }
                }
                try {
                    set.resume(); // also at VM death: the exiting VM waits for it
                } catch (VMDisconnectedException ignored) {
                    done = true;
                }
            }
        } catch (VMDisconnectedException ignored) {
            // the program finished (or was stopped by the step limit / watchdog)
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }

    /**
     * Wait for the user's classes to load, then put a breakpoint on the entry method. A breakpoint has
     * no cost anywhere else, unlike method-entry events which slow every JDK method while enabled.
     */
    private void installTriggers(EventRequestManager erm) {
        for (String name : userClasses) {
            ClassPrepareRequest r = erm.createClassPrepareRequest();
            r.addClassFilter(name);
            r.setSuspendPolicy(EventRequest.SUSPEND_EVENT_THREAD);
            r.enable();
            triggers.add(r);
        }
    }

    private void onClassPrepare(ClassPrepareEvent e, EventRequestManager erm) {
        ReferenceType type = e.referenceType();
        if (entryName == null || (entryClass != null && !type.name().equals(entryClass))) return;
        for (Method m : type.methodsByName(entryName)) {
            if (m.isAbstract() || m.isNative() || m.location() == null) continue;
            BreakpointRequest bp = erm.createBreakpointRequest(m.location());
            bp.setSuspendPolicy(EventRequest.SUSPEND_EVENT_THREAD);
            bp.enable();
            triggers.add(bp);
        }
    }

    private void onBreakpoint(BreakpointEvent e, EventRequestManager erm) {
        if (armed || !isMain(e.thread())) return;
        arm(erm);
        enter(e.thread(), e.location().method(), e.location().lineNumber());
    }

    private void arm(EventRequestManager erm) {
        debug("armed (entry method reached)");
        armed = true;
        erm.deleteEventRequests(triggers);
        triggers.clear();

        StepRequest step = erm.createStepRequest(mainThread, StepRequest.STEP_LINE, StepRequest.STEP_INTO);
        for (String pattern : EXCLUDED) step.addClassExclusionFilter(pattern);
        step.setSuspendPolicy(EventRequest.SUSPEND_EVENT_THREAD);
        step.enable();
        live.add(step);

        var entry = erm.createMethodEntryRequest();
        var exit = erm.createMethodExitRequest();
        for (String pattern : EXCLUDED) {
            entry.addClassExclusionFilter(pattern);
            exit.addClassExclusionFilter(pattern);
        }
        entry.setSuspendPolicy(EventRequest.SUSPEND_EVENT_THREAD);
        exit.setSuspendPolicy(EventRequest.SUSPEND_EVENT_THREAD);
        entry.enable();
        exit.enable();
        live.add(entry);
        live.add(exit);

        // SUSPEND_NONE: an exception raised while the debugger is calling into the program (e.g. one the
        // JDK throws and catches internally) must never block that call. Nothing here needs the thread
        // to be stopped: the event carries the exception object and the throw location.
        var exception = erm.createExceptionRequest(null, true, true);
        exception.setSuspendPolicy(EventRequest.SUSPEND_NONE);
        exception.enable();
        live.add(exception);
    }

    /** The entry method has returned: the rest is our harness shutting down, so stop observing it. */
    private void disarm() {
        try {
            vm.eventRequestManager().deleteEventRequests(live);
        } catch (VMDisconnectedException ignored) {
            // already gone
        }
        live.clear();
    }

    // ── events ──────────────────────────────────────────────────────────────────────────────
    private void count() {
        if (++steps >= stepLimit) {
            truncated = true;
            try {
                vm.exit(0);
            } catch (VMDisconnectedException ignored) {
                // already gone
            }
            throw new VMDisconnectedException();
        }
    }

    private static boolean bridge(String typeName) {
        return typeName.contains("$Lambda");
    }

    private boolean isMain(ThreadReference t) {
        return mainThread != null && t.equals(mainThread);
    }

    private static String methodName(Method m) {
        return m.isConstructor() ? m.declaringType().name() : m.name();
    }

    private void enter(ThreadReference t, Method method, int lineNo) {
        try {
            int depth = t.frameCount();
            Frame f = new Frame(nextFid++, depth, methodName(method), Math.max(lineNo, 0));
            stack.push(f);
            Map<String, String> now = capture(t);
            StringBuilder sb = new StringBuilder("{\"t\":\"s\",\"k\":\"call\",\"l\":").append(f.line)
                .append(",\"f\":").append(f.fid).append(",\"n\":").append(q(f.name));
            appendVars(sb, diff(f, now));
            appendOut(sb);
            emit(sb.append('}').toString());
            count();
        } catch (VMDisconnectedException ex) {
            throw ex;
        } catch (Exception ex) {
            debug("entry failed: " + ex);
        }
    }

    private void onStep(StepEvent e) {
        if (!armed || !isMain(e.thread()) || bridge(e.location().declaringType().name())) return;
        try {
            ThreadReference t = e.thread();
            int line = e.location().lineNumber();
            int depth = t.frameCount();
            // frames left by an exception never produce a method-exit event: close them here
            while (!stack.isEmpty() && stack.peek().depth > depth) {
                Frame gone = stack.pop();
                StringBuilder sb = new StringBuilder("{\"t\":\"s\",\"k\":\"ret\",\"l\":").append(gone.line).append(",\"f\":").append(gone.fid)
                    .append(",\"r\":[\"NoneType\",null],\"u\":1");
                appendOut(sb);
                emit(sb.append('}').toString());
                count();
            }
            Frame f = stack.peek();
            if (f == null || f.depth < depth) { // a frame entered through JDK code (e.g. a lambda)
                f = new Frame(nextFid++, depth, methodName(e.location().method()), line);
                stack.push(f);
                Map<String, String> first = capture(t);
                StringBuilder sb = new StringBuilder("{\"t\":\"s\",\"k\":\"call\",\"l\":").append(line)
                    .append(",\"f\":").append(f.fid).append(",\"n\":").append(q(f.name));
                appendVars(sb, diff(f, first));
                emit(sb.append('}').toString());
                count();
            }
            boolean repeatsCall = f.fresh && line == f.line;
            f.fresh = false;
            f.line = line;
            Map<String, String> now = capture(t);
            Map<String, String> changed = diff(f, now); // note: diff() also records `now` as the frame's last state
            if (repeatsCall && changed.isEmpty()) return;
            StringBuilder sb = new StringBuilder("{\"t\":\"s\",\"k\":\"line\",\"l\":").append(line).append(",\"f\":").append(f.fid);
            appendVars(sb, changed);
            appendOut(sb);
            emit(sb.append('}').toString());
            count();
        } catch (VMDisconnectedException ex) {
            throw ex;
        } catch (Exception ex) {
            debug("step failed: " + ex);
        }
    }

    private void onExit(MethodExitEvent e) {
        if (!armed || !isMain(e.thread()) || bridge(e.method().declaringType().name())) return;
        try {
            Frame f = stack.peek();
            if (f == null) return;
            ThreadReference t = e.thread();
            int depth = t.frameCount();
            if (f.depth != depth) return; // not the frame we are tracking (e.g. JDK-internal)
            Map<String, String> now = capture(t);
            String enc = e.method().returnType().name().equals("void") ? "NoneType|null" : encode(e.returnValue(), t);
            int bar = enc.indexOf('|');
            StringBuilder sb = new StringBuilder("{\"t\":\"s\",\"k\":\"ret\",\"l\":").append(Math.max(e.location().lineNumber(), f.line))
                .append(",\"f\":").append(f.fid)
                .append(",\"r\":[").append(q(enc.substring(0, bar))).append(',').append(enc.substring(bar + 1)).append(']');
            appendVars(sb, diff(f, now));
            appendOut(sb);
            emit(sb.append('}').toString());
            stack.pop();
            if (stack.isEmpty()) disarm();
            count();
        } catch (VMDisconnectedException ex) {
            throw ex;
        } catch (Exception ignored) {
            // skip
        }
    }

    private static boolean excluded(String typeName) {
        for (String p : EXCLUDED) if (typeName.startsWith(p.replace("*", ""))) return true;
        return false;
    }

    private static boolean boundary(String typeName) {
        return typeName.startsWith("AlgoMain") || typeName.startsWith("jdk.internal.reflect") || typeName.startsWith("java.lang.reflect") || typeName.startsWith("sun.reflect");
    }

    private void onException(ExceptionEvent e) {
        if (!armed || !isMain(e.thread())) return;
        try {
            Location catchAt = e.catchLocation();
            // exceptions thrown and swallowed inside the JDK are noise; everything the user's code sees is shown
            boolean report = catchAt == null || !excluded(catchAt.declaringType().name()) || boundary(catchAt.declaringType().name());
            if (!report) return;
            ObjectReference ex = e.exception();
            if (excIds.containsKey(ex.uniqueID())) return; // a re-throw of the same exception
            Frame f = stack.peek();
            if (f == null) return;

            int id = excIds.size() + 1;
            excIds.put(ex.uniqueID(), id);

            String type = simpleName(ex.referenceType().name());
            String message = "";
            // read the message field directly: calling getMessage() could run user code inside the debugger
            for (Field field : ex.referenceType().allFields()) {
                if (field.name().equals("detailMessage")) {
                    if (ex.getValue(field) instanceof StringReference) message = ((StringReference) ex.getValue(field)).value();
                    break;
                }
            }
            excByKey.put(type + "\u0000" + message, id);
            int line = excluded(e.location().declaringType().name()) ? f.line : Math.max(e.location().lineNumber(), f.line);
            excLine.put(id, line);

            StringBuilder sb = new StringBuilder("{\"t\":\"s\",\"k\":\"exc\",\"l\":").append(line).append(",\"f\":").append(f.fid)
                .append(",\"x\":").append(q(type + (message.isEmpty() ? "" : ": " + message))).append(",\"e\":").append(id);
            appendOut(sb);
            emit(sb.append('}').toString());
            count();
        } catch (VMDisconnectedException ex) {
            throw ex;
        } catch (Exception ignored) {
            // skip
        }
    }

    private static String simpleName(String name) {
        int dot = name.lastIndexOf('.');
        return dot < 0 ? name : name.substring(dot + 1);
    }

    // ── variables ───────────────────────────────────────────────────────────────────────────
    private void ensureSerializer() {
        if (serClass == null) {
            serClass = (ClassType) vm.classesByName("AlgoSer").get(0);
            encMethod = serClass.methodsByName("enc").get(0);
            encAllMethod = serClass.methodsByName("encAll").get(0);
            objectArray = (ArrayType) vm.classesByName("java.lang.Object[]").get(0);
        }
    }

    /**
     * name -> "type|json" for everything worth showing in the current frame.
     * JDI invalidates a StackFrame as soon as the thread runs again (and calling into the program to
     * serialize something does run it), so everything is READ first and ENCODED afterwards.
     */
    private Map<String, String> capture(ThreadReference t) throws Exception {
        long c0 = System.nanoTime();
        try {
            return captureInner(t);
        } finally {
            debug("capture took " + (System.nanoTime() - c0) / 1000 + "us");
        }
    }

    private Map<String, String> captureInner(ThreadReference t) throws Exception {
        StackFrame sf = t.frame(0);

        // Everything is READ first (JDI invalidates the frame as soon as the thread runs again) ...
        List<String> names = new ArrayList<>();
        List<Value> values = new ArrayList<>();
        try {
            List<LocalVariable> vars = sf.visibleVariables();
            Map<LocalVariable, Value> got = sf.getValues(vars);
            for (LocalVariable v : vars) {
                if (v.name().indexOf('$') >= 0) continue;
                names.add(v.name());
                values.add(got.get(v));
            }
        } catch (AbsentInformationException ignored) {
            // no debug info for this frame
        }
        ReferenceType owner = sf.location().declaringType();
        List<String> fieldNames = new ArrayList<>();
        List<Value> fieldValues = new ArrayList<>();
        ObjectReference self = sf.thisObject();
        if (self != null && !excluded(owner.name())) {
            List<Field> fields = new ArrayList<>();
            for (Field f : owner.allFields()) if (!f.isStatic() && !f.isSynthetic() && f.name().indexOf('$') < 0) fields.add(f);
            if (!fields.isEmpty()) {
                Map<Field, Value> got = self.getValues(fields);
                for (Field f : fields) {
                    fieldNames.add(f.name());
                    fieldValues.add(got.get(f));
                }
            }
        }
        List<String> staticNames = new ArrayList<>();
        List<Value> staticValues = new ArrayList<>();
        if (!excluded(owner.name())) {
            for (Field f : owner.visibleFields()) {
                if (!f.isStatic() || f.name().indexOf('$') >= 0) continue;
                Value v = owner.getValue(f);
                // constants (static final numbers / strings) are noise; static final arrays and collections are state
                if (f.isFinal() && (!(v instanceof ObjectReference) || v instanceof StringReference)) continue;
                staticNames.add(f.name());
                staticValues.add(v);
            }
        }

        // ... then ENCODED together (primitives locally, every object in a single call into the VM)
        List<Value> all = new ArrayList<>(values);
        all.addAll(fieldValues);
        all.addAll(staticValues);
        List<String> encoded = encodeAll(all, t);

        Map<String, String> now = new LinkedHashMap<>();
        int k = 0;
        for (String name : names) now.put(name, encoded.get(k++));
        for (String name : fieldNames) now.put(now.containsKey(name) ? "this." + name : name, encoded.get(k++));
        for (String name : staticNames) now.put(now.containsKey(name) ? owner.name() + "." + name : name, encoded.get(k++));
        return now;
    }

    /** "type|json" per value; objects that need the in-VM serializer are sent in one batch. */
    private List<String> encodeAll(List<Value> values, ThreadReference t) {
        String[] out = new String[values.size()];
        List<Integer> pending = new ArrayList<>();
        for (int i = 0; i < out.length; i++) {
            String direct = encodeDirect(values.get(i));
            if (direct != null) out[i] = direct;
            else pending.add(i);
        }
        if (pending.size() == 1) {
            out[pending.get(0)] = invokeEnc((ObjectReference) values.get(pending.get(0)), t);
        } else if (!pending.isEmpty()) {
            try {
                ensureSerializer();
                ArrayReference array = objectArray.newInstance(pending.size());
                List<Value> objects = new ArrayList<>();
                for (int index : pending) objects.add(values.get(index));
                array.setValues(objects);
                Value r = serClass.invokeMethod(t, encAllMethod, Collections.singletonList(array), ObjectReference.INVOKE_SINGLE_THREADED);
                String[] parts = ((StringReference) r).value().split("\u0001", -1);
                for (int n = 0; n < pending.size(); n++) out[pending.get(n)] = parts[n];
            } catch (VMDisconnectedException e) {
                throw e;
            } catch (Exception e) {
                debug("batch failed: " + e);
                for (int index : pending) out[index] = invokeEnc((ObjectReference) values.get(index), t);
            }
        }
        return java.util.Arrays.asList(out);
    }

    private static String inferType(JsonElement e) {
        if (e.isJsonNull()) return "NoneType";
        if (e.isJsonArray()) return "list";
        if (e.isJsonObject()) return e.getAsJsonObject().has("__class__") ? e.getAsJsonObject().get("__class__").getAsString() : "dict";
        if (e.getAsJsonPrimitive().isBoolean()) return "bool";
        if (e.getAsJsonPrimitive().isNumber()) return e.getAsString().contains(".") ? "float" : "int";
        return "str";
    }

    /** Only what changed since the last step of this frame. */
    private Map<String, String> diff(Frame f, Map<String, String> now) {
        Map<String, String> changed = new LinkedHashMap<>();
        for (Map.Entry<String, String> e : now.entrySet()) {
            if (!e.getValue().equals(f.last.get(e.getKey()))) changed.put(e.getKey(), e.getValue());
        }
        List<String> deleted = new ArrayList<>();
        for (String name : f.last.keySet()) if (!now.containsKey(name)) deleted.add(name);
        f.last = now;
        if (!deleted.isEmpty()) changed.put("\u0000deleted", String.join("\u0000", deleted));
        return changed;
    }

    private void appendVars(StringBuilder sb, Map<String, String> changed) {
        boolean first = true;
        String deleted = changed.remove("\u0000deleted");
        for (Map.Entry<String, String> e : changed.entrySet()) {
            sb.append(first ? ",\"v\":{" : ",");
            first = false;
            int bar = e.getValue().indexOf('|');
            sb.append(q(e.getKey())).append(":[").append(q(e.getValue().substring(0, bar))).append(',').append(e.getValue().substring(bar + 1)).append(']');
        }
        if (!first) sb.append('}');
        if (deleted != null) {
            sb.append(",\"d\":[");
            String[] names = deleted.split("\u0000");
            for (int i = 0; i < names.length; i++) sb.append(i > 0 ? "," : "").append(q(names[i]));
            sb.append(']');
        }
    }

    private void appendOut(StringBuilder sb) {
        int size;
        synchronized (stdout) {
            size = stdout.length();
        }
        if (size != lastOut) {
            sb.append(",\"o\":").append(size);
            lastOut = size;
        }
    }

    // ── value encoding ──────────────────────────────────────────────────────────────────────
    private static String num(double v) {
        if (Double.isNaN(v)) return "\"NaN\"";
        if (Double.isInfinite(v)) return v > 0 ? "\"Infinity\"" : "\"-Infinity\"";
        if (v == Math.rint(v) && Math.abs(v) < 1e15) return Long.toString((long) v);
        return Double.toString(v);
    }

    private static String primitive(Value v) {
        if (v instanceof BooleanValue) return "bool|" + ((BooleanValue) v).value();
        if (v instanceof IntegerValue) return "int|" + ((IntegerValue) v).value();
        if (v instanceof ShortValue) return "int|" + ((ShortValue) v).value();
        if (v instanceof ByteValue) return "int|" + ((ByteValue) v).value();
        if (v instanceof LongValue) {
            long x = ((LongValue) v).value();
            return "int|" + (Math.abs(x) > 9007199254740992L ? q(Long.toString(x)) : Long.toString(x));
        }
        if (v instanceof DoubleValue) return "float|" + num(((DoubleValue) v).value());
        if (v instanceof FloatValue) return "float|" + num(((FloatValue) v).value());
        if (v instanceof CharValue) return "str|" + q(String.valueOf(((CharValue) v).value()));
        return null;
    }

    /** Everything that can be encoded without calling into the traced VM, else null. */
    private String encodeDirect(Value v) {
        if (v == null || v instanceof VoidValue) return "NoneType|null";
        String p = primitive(v);
        if (p != null) return p;
        if (v instanceof StringReference) {
            String s = ((StringReference) v).value();
            return "str|" + q(s.length() > 200 ? s.substring(0, 200) + "\u2026" : s);
        }
        if (v instanceof ArrayReference) {
            ArrayReference ar = (ArrayReference) v;
            if (ar.referenceType() instanceof ArrayType && PRIMITIVES.contains(((ArrayType) ar.referenceType()).componentTypeName())) {
                int len = ar.length();
                int shown = Math.min(len, 60);
                StringBuilder sb = new StringBuilder("list|[");
                List<Value> items = shown == 0 ? Collections.emptyList() : ar.getValues(0, shown);
                for (int i = 0; i < items.size(); i++) {
                    if (i > 0) sb.append(',');
                    String one = primitive(items.get(i));
                    sb.append(one.substring(one.indexOf('|') + 1));
                }
                if (len > shown) sb.append(',').append(q("+" + (len - shown) + " more"));
                return sb.append(']').toString();
            }
        }
        return null;
    }

    private String encode(Value v, ThreadReference t) {
        String direct = encodeDirect(v);
        return direct != null ? direct : invokeEnc((ObjectReference) v, t);
    }

    /** Calls a static method of AlgoSer inside the traced VM (all requests that could fire inside it are class-filtered). */
    private Value callSerializer(ThreadReference t, Method method, ObjectReference arg) throws Exception {
        ensureSerializer();
        return serClass.invokeMethod(t, method, Collections.singletonList(arg), ObjectReference.INVOKE_SINGLE_THREADED);
    }

    private String invokeEnc(ObjectReference o, ThreadReference t) {
        long i0 = System.nanoTime();
        try {
            ensureSerializer();
            Value r = callSerializer(t, encMethod, o);
            debug("  invoke took " + (System.nanoTime() - i0) / 1000 + "us");
            return r instanceof StringReference ? ((StringReference) r).value() : "NoneType|null";
        } catch (VMDisconnectedException e) {
            throw e;
        } catch (Exception e) {
            debug("invoke failed: " + e);
            return "str|\"<unavailable>\"";
        }
    }
}
