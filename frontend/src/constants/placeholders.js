// ============================================================
// PLACEHOLDER CODE & TEST INPUTS BY LANGUAGE
// ============================================================

export const PLACEHOLDER_CODE = {
  python: `def two_sum(nums, target):
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i
    return []`,
  java: `class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int complement = target - nums[i];
            if (seen.containsKey(complement)) {
                return new int[]{ seen.get(complement), i };
            }
            seen.put(nums[i], i);
        }
        return new int[]{};
    }
}`,
  cpp: `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> seen;
        for (int i = 0; i < nums.size(); i++) {
            int complement = target - nums[i];
            if (seen.count(complement)) {
                return { seen[complement], i };
            }
            seen[nums[i]] = i;
        }
        return {};
    }
};`,
  javascript: `function twoSum(nums, target) {
    const seen = new Map();
    for (let i = 0; i < nums.length; i++) {
        const complement = target - nums[i];
        if (seen.has(complement)) {
            return [seen.get(complement), i];
        }
        seen.set(nums[i], i);
    }
    return [];
}`,
};

export const CUSTOM_PLACEHOLDER_CODE = {
  python: 'Paste your Python code here...',
  java: 'Paste your Java code here...',
  cpp: 'Paste your C++ code here...',
  javascript: 'Paste your JavaScript code here...',
};

export const PLACEHOLDER_TEST = {
  python: 'nums = [2, 7, 11, 15]\ntarget = 9',
  java: 'int[] nums = {2, 7, 11, 15};\nint target = 9;',
  cpp: 'vector<int> nums = {2, 7, 11, 15};\nint target = 9;',
  javascript: 'const nums = [2, 7, 11, 15];\nconst target = 9;',
};

export const RANDOM_INPUTS = {
  python: 'nums = [3, 2, 4]\ntarget = 6',
  java: 'int[] nums = {3, 2, 4};\nint target = 6;',
  cpp: 'vector<int> nums = {3, 2, 4};\nint target = 6;',
  javascript: 'const nums = [3, 2, 4];\nconst target = 6;',
};

export const EDGE_INPUTS = {
  python: 'nums = [0, 0]\ntarget = 0',
  java: 'int[] nums = {0, 0};\nint target = 0;',
  cpp: 'vector<int> nums = {0, 0};\nint target = 0;',
  javascript: 'const nums = [0, 0];\nconst target = 0;',
};

export const WORST_INPUTS = {
  python: 'nums = list(range(10000))\ntarget = 19999',
  java: '// nums = 0..9999, target = 19999',
  cpp: '// nums = {0..9999}, target = 19999',
  javascript: 'const nums = Array.from({length:10000},(_,i)=>i);\nconst target = 19999;',
};

export const LANGUAGE_LABELS = {
  python: 'Python',
  java: 'Java',
  cpp: 'C++',
  javascript: 'JavaScript',
};

export const LANGUAGE_EXT = {
  python: '.py',
  java: '.java',
  cpp: '.cpp',
  javascript: '.js',
};
