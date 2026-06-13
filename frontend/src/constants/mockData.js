// ============================================================
// MOCK DATA — realistic execution trace sample
// ============================================================

export const MOCK_VARIABLES = [
  { name: 'seen',       type: 'dict', value: '{ 2: 0, 7: 1 }', changed: false },
  { name: 'i',          type: 'int',  value: '2',               changed: true,  prevValue: '1' },
  { name: 'num',        type: 'int',  value: '11',              changed: true,  prevValue: '7' },
  { name: 'complement', type: 'int',  value: '-2',              changed: true,  prevValue: '2' },
];

export const MOCK_CALL_STACK = [
  { name: 'two_sum',  line: 4, depth: 0, active: true  },
  { name: '<module>', line: 1, depth: 1, active: false },
];

export const MOCK_TRACE_EVENTS = [
  { frame: 0,  type: 'assignment',    description: 'seen = {}' },
  { frame: 4,  type: 'loop_start',   description: 'for i, num in enumerate(nums)' },
  { frame: 8,  type: 'assignment',   description: 'complement = target - num' },
  { frame: 12, type: 'comparison',   description: 'if complement in seen' },
  { frame: 18, type: 'assignment',   description: 'seen[num] = i' },
  { frame: 22, type: 'loop_start',   description: 'for i, num in enumerate(nums)' },
  { frame: 26, type: 'assignment',   description: 'complement = target - num' },
  { frame: 30, type: 'comparison',   description: 'if complement in seen' },
  { frame: 35, type: 'return',       description: 'return [seen[complement], i]' },
  { frame: 40, type: 'function_call',description: 'two_sum([2,7,11,15], 9)' },
  { frame: 46, type: 'return',       description: 'return [0, 1]' },
];
