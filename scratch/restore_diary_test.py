# -*- coding: utf-8 -*-
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Let's define the restore_line function
def restore_line(line):
    if not line:
        return line
        
    mojibake_indicators = ['浜', '鏃', '闃', '鑳', '寮', '嬩', '鍝', '鏁', '鏋', '璺', '鍏', '椤', '姞']
    has_mojibake = any(ind in line for ind in mojibake_indicators)
    if not has_mojibake:
        return line
        
    tokens = []
    for c in line:
        if c == '\ufffd':
            tokens.append(None)
        else:
            try:
                tokens.append(c.encode('cp936'))
            except UnicodeEncodeError:
                tokens.append(c.encode('utf-8'))
                
    none_indices = [i for i, x in enumerate(tokens) if x is None]
    if not none_indices:
        try:
            return b"".join(tokens).decode('utf-8')
        except UnicodeDecodeError:
            return line
            
    solutions = []
    
    def solve(index_idx, current_bytes):
        if index_idx == len(none_indices):
            try:
                decoded = current_bytes.decode('utf-8')
                solutions.append(decoded)
            except UnicodeDecodeError:
                pass
            return
            
        target_idx = none_indices[index_idx]
        next_target_idx = none_indices[index_idx + 1] if index_idx + 1 < len(none_indices) else len(tokens)
        segment = b"".join(tokens[target_idx+1 : next_target_idx])
        
        # Try all bytes from 0x80 to 0xFF
        for b_val in range(0x80, 0x100):
            solve(index_idx + 1, current_bytes + bytes([b_val]) + segment)

    first_target = none_indices[0]
    initial_bytes = b"".join(tokens[:first_target])
    solve(0, initial_bytes)
    
    if solutions:
        # If we have multiple solutions, we can check which one contains only common Chinese characters.
        # But usually there's only one. Let's print all of them to see!
        return solutions
    else:
        fallback_tokens = [x if x is not None else b'?' for x in tokens]
        try:
            return [b"".join(fallback_tokens).decode('utf-8', errors='replace') + " (Fallback)"]
        except:
            return [line + " (Failed)"]

# Let's test with a few lines from DEVELOP_DIARY.md
test_lines = [
    "# 浜嬩欢鏃堕棿绾垮紩鎿 - 寮€鍙戞棩璁 (Develop Diary)",
    "## 2026-05-14 - 鍘熷瓙鍏崇郴鍥 Summary-First 鎵瑰鐞嗗洖濉笌闃舵鍖栨墽琛屼慨澶",
    "### 鑳屾櫙涓庣洰鏍",
    "鏈疆缁х画閲嶆瀯鍘熷瓙鍏崇郴鍥剧殑鏂板啓鍏ヤ笌鍥炲～閾捐矾锛氫笉鍐嶉€氳繃鏍囧噯浜嬩欢灞傝仛绫诲悗寤虹珛鍏崇郴锛岃€屾槸璁 `proto_events` 鍏堝綊灞炲埌 `relationship_summaries` 鍏崇郴灞傝妭鐐癸紝鍐嶇敱鍚庡彴浠诲姟鍦 summary 鍐呴儴鏋勫缓 `atomic_event_relationships` 鍘熷瓙浜嬩欢杈广€"
]

for idx, line in enumerate(test_lines):
    print(f"--- Line {idx+1} ---")
    print("Original:", line)
    restored = restore_line(line)
    print("Restored options:")
    if isinstance(restored, list):
        for opt in restored:
            print("  ->", opt)
    else:
        print("  ->", restored)
