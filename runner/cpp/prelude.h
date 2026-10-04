// Precompiled into the image (prelude.h.gch): the standard library costs about a second to parse otherwise.
// It must stay free of anything the user's code could change (see algolens_nodes.h).
// LeetCode pre-includes the standard library and `using namespace std`, so pasted solutions rely on it.
#pragma once
#include <bits/stdc++.h>
using namespace std;
