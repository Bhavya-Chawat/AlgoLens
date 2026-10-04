// The prebuilt half of the driver: reads and writes JSON files. Compiled once when the image is built
// (see the Dockerfile) and linked into every function-mode run, so the user's compile never sees nlohmann/json.
#include "prelude.h"
#include "algolens_nodes.h"
#include "algolens_driver.h"
#include <nlohmann/json.hpp>

namespace algolens {
using json = nlohmann::json;

static JV from_nl(const json& j) {
    JV out;
    if (j.is_null()) {
        out.kind = JV::Null;
    } else if (j.is_boolean()) {
        out = JV::boolean(j.get<bool>());
    } else if (j.is_number_unsigned() && j.get<unsigned long long>() > static_cast<unsigned long long>(LLONG_MAX)) {
        out = JV::real(j.get<double>());
    } else if (j.is_number_integer()) {
        out = JV::integer(j.get<long long>());
    } else if (j.is_number_float()) {
        out = JV::real(j.get<double>());
    } else if (j.is_string()) {
        out = JV::str(j.get<std::string>());
    } else if (j.is_array()) {
        out = JV::array();
        for (const auto& e : j) out.items.push_back(from_nl(e));
    } else {
        out = JV::object();
        for (auto it = j.begin(); it != j.end(); ++it) {
            out.keys.push_back(it.key());
            out.items.push_back(from_nl(it.value()));
        }
    }
    return out;
}

static json to_nl(const JV& v) {
    switch (v.kind) {
        case JV::Bool: return v.b;
        case JV::Int: return v.i;
        case JV::Real: return v.d;
        case JV::Str: return v.s;
        case JV::Arr: {
            json out = json::array();
            for (const JV& e : v.items) out.push_back(to_nl(e));
            return out;
        }
        case JV::Obj: {
            json out = json::object();
            for (size_t n = 0; n < v.items.size(); n++) out[v.keys[n]] = to_nl(v.items[n]);
            return out;
        }
        default: return nullptr;
    }
}

JV read_json(const char* path) {
    std::ifstream in(path);
    return from_nl(json::parse(in));
}

void write_json(const char* path, const JV& value) {
    std::ofstream(path) << to_nl(value).dump();
}
}  // namespace algolens
