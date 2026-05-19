# -*- coding: utf-8 -*-
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# We'll use cp936 or gb18030
# gb18030 has a wider character set than cp936/gbk.
# Let's test both.
def restore_line(line):
    if not line:
        return line
        
    mojibake_indicators = ['浜', '鏃', '闃', '鑳', '寮', '嬩', '鍝', '鏁', '鏋', '璺', '鍏', '椤', '姞', '鎷']
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
                # If cp936 fails, keep the character's original utf-8 bytes
                tokens.append(c.encode('utf-8'))
                
    none_indices = [i for i, x in enumerate(tokens) if x is None]
    
    if not none_indices:
        try:
            return b"".join(tokens).decode('utf-8')
        except UnicodeDecodeError:
            # Try to see if there's an incomplete UTF-8 character at the end due to omitted \ufffd
            # We can try to append a byte to see if it decodes
            raw_bytes = b"".join(tokens)
            for b_val in range(0x80, 0x100):
                try:
                    return (raw_bytes + bytes([b_val])).decode('utf-8')
                except UnicodeDecodeError:
                    pass
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
        # Return the first solution
        return solutions[0]
    else:
        fallback_tokens = [x if x is not None else b'?' for x in tokens]
        try:
            return b"".join(fallback_tokens).decode('utf-8', errors='replace')
        except:
            return line

# Read the first 15 lines of the file and restore them
with open('DEVELOP_DIARY.md', 'r', encoding='utf-8') as f:
    for i in range(15):
        line = f.readline()
        if not line:
            break
        line_clean = line.rstrip('\n')
        restored = restore_line(line_clean)
        print(f"Line {i+1} Original: {line_clean}")
        print(f"Line {i+1} Restored: {restored}")
        print()
