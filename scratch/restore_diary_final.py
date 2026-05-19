# -*- coding: utf-8 -*-
import sys
import shutil

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def is_mojibake_line(original):
    # Added extra high-confidence mojibake indicators like '闂', '鏂', '鏍', '鏈', '敼', '璁'
    mojibake_indicators = [
        '浜', '鏃', '闃', '鑳', '寮', '嬩', '鍝', '鏁', '鏋', '璺', '鍏', '椤', '姞', '鎷', 
        '鎴', '鍐', '鏀', '鎯', '鏇', '鍜', '鐢', '鐩', '鎺', '鎻', '', '鐞',
        '鍟', '鍩', '鎽', '鎹', '鎾', '閾', '閬', '鐗', '鏁', '璺', '鐒', '舵',
        '绔', '閾', '璺', '紩', '鎿', '棿', '垮', '笌', '闃', '舵', '鍖', '鎵',
        '濡', '傛', '灉', '鍛', '閫', '氳', '夋', '嫨', '杩', '佺', 'Щ', '囧', '幓',
        '妫', '鏌', '鍗', '痴', '鐏', '簭', '缁', 'х画', '閲嶆瀯', '鍘熷瓙', '鍥剧殑', '鏂板啓鍏',
        '鏉', '鑺', '鐐', '鍚', '鍙', '浠', '鍔', '鍦', '閮', '杈', '鍖', '闃', '笌',
        '闂', '鏂', '鏍', '鏈', '敼', '璁'
    ]
    indicators = [ind for ind in mojibake_indicators if ind.strip()]
    return any(ind in original for ind in indicators)

def restore_line_robust(line):
    if not line:
        return line
        
    if not is_mojibake_line(line):
        return line
        
    tokens = []
    for c in line:
        if c == '\ufffd':
            pass
        elif c == '€' or c == '\u20ac':
            tokens.append(b'\x80')
        else:
            try:
                tokens.append(c.encode('cp936'))
            except UnicodeEncodeError:
                tokens.append(c.encode('utf-8'))
                
    try:
        raw_bytes = b"".join(tokens)
        decoded = raw_bytes.decode('utf-8', errors='ignore')
        return decoded
    except Exception as e:
        return line

# Restore clean starting file from backup
shutil.copyfile('DEVELOP_DIARY_backup.md', 'DEVELOP_DIARY.md')
print("Restored clean starting file from backup.")

with open('DEVELOP_DIARY.md', 'r', encoding='utf-8') as f:
    lines = f.readlines()

restored_lines = []
restored_count = 0
for line in lines:
    line_clean = line.rstrip('\r\n')
    restored = restore_line_robust(line_clean)
    if restored != line_clean:
        restored_count += 1
    restored_lines.append(restored)

with open('DEVELOP_DIARY.md', 'w', encoding='utf-8') as f:
    f.write("\n".join(restored_lines) + "\n")

print(f"Successfully restored {restored_count} lines in DEVELOP_DIARY.md!")
