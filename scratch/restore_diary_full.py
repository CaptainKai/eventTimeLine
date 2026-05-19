# -*- coding: utf-8 -*-
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Most common Chinese characters (top 100 or so)
common_chars = set("的一是在了有和人这中大来上个国工要里手产用力家学起分都合得现成动主下过发天生以社方后前之法同业本发生政行业美前分")

def is_mojibake_line(original, restored):
    # If the original line has high-frequency mojibake indicators
    mojibake_indicators = ['浜', '鏃', '闃', '鑳', '寮', '嬩', '鍝', '鏁', '鏋', '璺', '鍏', '椤', '姞', '鎷', '鎴', '鍐', '鏀', '鎯', '鏇', '鍜', '鐢', '鐩', '鎺', '鎻', '鑱', '鑻', '闄', '鐞', '鍟', '鍩', '鎽', '鎹', '鎾']
    if any(ind in original for ind in mojibake_indicators):
        return True
        
    # Or, if the restored line has significantly more common Chinese characters than the original line
    orig_common_count = sum(1 for c in original if c in common_chars)
    rest_common_count = sum(1 for c in restored if c in common_chars)
    
    if rest_common_count > orig_common_count + 1:
        return True
        
    return False

def restore_line_robust(line):
    if not line:
        return line
        
    tokens = []
    for c in line:
        if c == '\ufffd':
            # We preserve the replacement character placeholder for now as b'?'
            tokens.append(b'?')
        else:
            try:
                tokens.append(c.encode('cp936'))
            except UnicodeEncodeError:
                tokens.append(c.encode('utf-8'))
                
    try:
        # Use errors='replace' to avoid UnicodeDecodeError and restore as much as possible
        raw_bytes = b"".join(tokens)
        decoded = raw_bytes.decode('utf-8', errors='replace')
        
        # If the restored line is determined to be Mojibake, return it.
        # Otherwise, return the original line.
        if is_mojibake_line(line, decoded):
            return decoded
        else:
            return line
    except Exception as e:
        return line

restored_count = 0
total_lines = 0

with open('DEVELOP_DIARY.md', 'r', encoding='utf-8') as f:
    lines = f.readlines()

restored_lines = []
for idx, line in enumerate(lines):
    line_clean = line.rstrip('\r\n')
    restored = restore_line_robust(line_clean)
    if restored != line_clean:
        restored_count += 1
    restored_lines.append(restored)
    total_lines += 1

print(f"Total lines: {total_lines}")
print(f"Restored lines: {restored_count}")

# Write to temp file for check
with open('DEVELOP_DIARY_temp_restored.md', 'w', encoding='utf-8') as f:
    f.write("\n".join(restored_lines) + "\n")
