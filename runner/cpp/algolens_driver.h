// Appended after the user's code. Turns the JSON the user typed into real C++ arguments (by parameter name)
// and writes the result back as JSON.
//
// The JSON text itself is read and printed by a prebuilt runtime (algolens_rt.o, compiled once when the image
// is built, with nlohmann/json). Only the small converters below are compiled together with the user's
// program: pulling nlohmann's templates into every run cost about two seconds of compile time.
#pragma once
#include <cmath>
#include <fstream>

namespace algolens {

/** A parsed JSON value. Arrays use `items`; objects use `keys` and `items` side by side. */
struct JV {
    enum Kind { Null, Bool, Int, Real, Str, Arr, Obj };
    Kind kind = Null;
    bool b = false;
    long long i = 0;
    double d = 0;
    std::string s;
    std::vector<std::string> keys;
    std::vector<JV> items;

    static JV boolean(bool v) { JV j; j.kind = Bool; j.b = v; return j; }
    static JV integer(long long v) { JV j; j.kind = Int; j.i = v; j.d = static_cast<double>(v); return j; }
    static JV real(double v) { JV j; j.kind = Real; j.d = v; return j; }
    static JV str(std::string v) { JV j; j.kind = Str; j.s = std::move(v); return j; }
    static JV array() { JV j; j.kind = Arr; return j; }
    static JV object() { JV j; j.kind = Obj; return j; }
    const JV* find(const std::string& key) const {
        if (kind != Obj) return nullptr;
        for (size_t n = 0; n < keys.size(); n++) if (keys[n] == key) return &items[n];
        return nullptr;
    }
};

JV read_json(const char* path);                    // defined in algolens_rt.cpp
void write_json(const char* path, const JV& value);  // defined in algolens_rt.cpp

// ── LeetCode structures ──────────────────────────────────────────────────────────────────────
inline TreeNode* build_tree(const JV& j) {
    if (j.kind != JV::Arr || j.items.empty() || j.items[0].kind == JV::Null) return nullptr;
    std::vector<TreeNode*> nodes;
    for (const JV& v : j.items) nodes.push_back(v.kind == JV::Null ? nullptr : new TreeNode(static_cast<int>(v.i)));
    size_t next = 1;
    for (TreeNode* n : nodes) {
        if (!n) continue;
        if (next < nodes.size()) n->left = nodes[next++];
        if (next < nodes.size()) n->right = nodes[next++];
    }
    return nodes[0];
}

inline ListNode* build_list(const JV& j) {
    ListNode* head = nullptr;
    if (j.kind != JV::Arr) return head;
    for (size_t n = j.items.size(); n-- > 0;) head = new ListNode(static_cast<int>(j.items[n].i), head);
    return head;
}

inline JV plain(TreeNode* root) {
    JV out = JV::array();
    std::deque<TreeNode*> queue{root};
    while (!queue.empty() && out.items.size() < 20000) {
        TreeNode* n = queue.front();
        queue.pop_front();
        if (!n) { out.items.emplace_back(); continue; }
        out.items.push_back(JV::integer(n->val));
        queue.push_back(n->left);
        queue.push_back(n->right);
    }
    while (!out.items.empty() && out.items.back().kind == JV::Null) out.items.pop_back();
    return out;
}

inline JV plain(ListNode* head) {
    JV out = JV::array();
    for (ListNode* n = head; n && out.items.size() < 10000; n = n->next) out.items.push_back(JV::integer(n->val));
    return out;
}

// ── JSON -> C++ ──────────────────────────────────────────────────────────────────────────────
template <class T> struct is_pair : std::false_type {};
template <class A, class B> struct is_pair<std::pair<A, B>> : std::true_type {};
template <class T> inline constexpr bool is_char_v = std::is_same_v<T, char> || std::is_same_v<T, signed char> || std::is_same_v<T, unsigned char>;

inline long long as_int(const JV& j) {
    switch (j.kind) {
        case JV::Int: return j.i;
        case JV::Real: return static_cast<long long>(j.d);
        case JV::Bool: return j.b ? 1 : 0;
        case JV::Str: return j.s.size() == 1 && !std::isdigit(static_cast<unsigned char>(j.s[0])) ? j.s[0] : std::atoll(j.s.c_str());
        default: return 0;
    }
}

template <class T> T from_jv(const JV& j);

template <class K> K key_from(const std::string& s) {
    if constexpr (std::is_same_v<K, std::string>) return s;
    else if constexpr (is_char_v<K>) return s.empty() ? K(0) : static_cast<K>(s[0]);
    else if constexpr (std::is_integral_v<K>) return static_cast<K>(std::atoll(s.c_str()));
    else static_assert(sizeof(K) == 0, "AlgoLens cannot build this map key type from JSON");
}

template <class T> T from_jv(const JV& j) {
    if constexpr (std::is_same_v<T, bool>) {
        return j.kind == JV::Bool ? j.b : as_int(j) != 0;
    } else if constexpr (is_char_v<T>) {
        return j.kind == JV::Str ? (j.s.empty() ? T(0) : static_cast<T>(j.s[0])) : static_cast<T>(as_int(j));
    } else if constexpr (std::is_integral_v<T>) {
        return static_cast<T>(as_int(j));
    } else if constexpr (std::is_floating_point_v<T>) {
        return static_cast<T>(j.kind == JV::Int ? static_cast<double>(j.i) : j.d);
    } else if constexpr (std::is_same_v<T, std::string>) {
        if (j.kind != JV::Str) throw std::invalid_argument("expected a string");
        return j.s;
    } else if constexpr (std::is_same_v<T, TreeNode*>) {
        return build_tree(j);
    } else if constexpr (std::is_same_v<T, ListNode*>) {
        return build_list(j);
    } else if constexpr (is_pair<T>::value) {
        if (j.items.size() < 2) throw std::invalid_argument("expected a [first, second] pair");
        return T(from_jv<typename T::first_type>(j.items[0]), from_jv<typename T::second_type>(j.items[1]));
    } else if constexpr (requires { typename T::mapped_type; }) {
        T out;
        for (size_t n = 0; n < j.items.size(); n++)
            out.emplace(key_from<typename T::key_type>(n < j.keys.size() ? j.keys[n] : std::to_string(n)),
                        from_jv<typename T::mapped_type>(j.items[n]));
        return out;
    } else if constexpr (requires { typename T::value_type; }) {
        T out{};
        size_t n = 0;
        for (const JV& e : j.items) {
            if constexpr (requires { out.push_back(from_jv<typename T::value_type>(e)); }) out.push_back(from_jv<typename T::value_type>(e));
            else if constexpr (requires { out.insert(from_jv<typename T::value_type>(e)); }) out.insert(from_jv<typename T::value_type>(e));
            else if (n < out.size()) out[n] = from_jv<typename T::value_type>(e);  // std::array
            n++;
        }
        return out;
    } else {
        static_assert(sizeof(T) == 0, "AlgoLens cannot build this parameter type from JSON");
    }
}

/** The argument called `name`; when the names do not match, the n-th value in the order typed. */
template <class T> T arg(const JV& args, const char* name, size_t index) {
    if (const JV* found = args.find(name)) return from_jv<T>(*found);
    if (args.kind == JV::Obj && index < args.items.size()) return from_jv<T>(args.items[index]);
    throw std::invalid_argument(std::string("missing argument '") + name + "' - add it in Function Arguments");
}

// ── C++ -> JSON ──────────────────────────────────────────────────────────────────────────────
template <class T> JV to_jv(const T& v);

template <class K> std::string key_to(const K& k) {
    if constexpr (std::is_convertible_v<const K&, std::string>) return std::string(k);
    else if constexpr (is_char_v<K>) return std::string(1, static_cast<char>(k));
    else if constexpr (std::is_arithmetic_v<K>) return std::to_string(k);
    else return "<key>";
}

template <class T> JV to_jv(const T& v) {
    if constexpr (std::is_same_v<T, bool>) {
        return JV::boolean(v);
    } else if constexpr (is_char_v<T>) {
        return JV::str(std::string(1, static_cast<char>(v)));
    } else if constexpr (std::is_integral_v<T>) {
        return JV::integer(static_cast<long long>(v));
    } else if constexpr (std::is_floating_point_v<T>) {
        double d = static_cast<double>(v);
        if (std::isnan(d)) return JV::str("NaN");
        if (std::isinf(d)) return JV::str(d > 0 ? "Infinity" : "-Infinity");
        return JV::real(d);
    } else if constexpr (std::is_same_v<T, TreeNode*>) {
        return plain(v);
    } else if constexpr (std::is_same_v<T, ListNode*>) {
        return plain(v);
    } else if constexpr (std::is_convertible_v<const T&, std::string>) {
        return JV::str(std::string(v));
    } else if constexpr (is_pair<T>::value) {
        JV out = JV::array();
        out.items.push_back(to_jv(v.first));
        out.items.push_back(to_jv(v.second));
        return out;
    } else if constexpr (requires { typename T::mapped_type; }) {
        JV out = JV::object();
        for (const auto& kv : v) {
            out.keys.push_back(key_to(kv.first));
            out.items.push_back(to_jv(kv.second));
        }
        return out;
    } else if constexpr (requires { v.begin(); v.end(); }) {
        JV out = JV::array();
        for (const auto& e : v) out.items.push_back(to_jv(e));
        return out;
    } else if constexpr (requires { v.has_value(); *v; }) {
        return v.has_value() ? to_jv(*v) : JV();
    } else {
        return JV::str("<unsupported type>");
    }
}

template <class T> void write_result(const char* path, const T& value) {
    JV out = JV::object();
    out.keys.push_back("value");
    out.items.push_back(to_jv(value));
    write_json(path, out);
}

inline void write_void(const char* path) {
    JV out = JV::object();
    out.keys.push_back("value");
    out.items.emplace_back();
    write_json(path, out);
}
}  // namespace algolens
