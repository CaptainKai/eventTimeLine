# -*- coding: utf-8 -*-
import sys

# Reconfigure stdout to use utf-8 so we don't get UnicodeEncodeErrors in Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

test_str = "浜嬩欢鏃堕棿绾垮紩鎿 - 寮€鍙戞棩璁 (Develop Diary)"

def try_restore(s, codec):
    try:
        encoded = s.encode(codec, errors='replace')
        decoded = encoded.decode('utf-8', errors='replace')
        return decoded
    except Exception as e:
        return f"Error: {e}"

print("Original:", test_str)
print("Restored cp936:", try_restore(test_str, 'cp936'))
print("Restored gbk:", try_restore(test_str, 'gbk'))
print("Restored gb18030:", try_restore(test_str, 'gb18030'))
