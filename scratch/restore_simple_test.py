# -*- coding: utf-8 -*-
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def restore_line(line):
    tokens = []
    for c in line:
        if c == '\ufffd':
            tokens.append(b'?')
        elif c == '€' or c == '\u20ac':
            tokens.append(b'\x80')
        else:
            try:
                tokens.append(c.encode('cp936'))
            except UnicodeEncodeError:
                tokens.append(c.encode('utf-8'))
                
    try:
        return b"".join(tokens).decode('utf-8', errors='replace')
    except Exception as e:
        return line

with open('DEVELOP_DIARY.md', 'r', encoding='utf-8') as f:
    for i in range(10):
        line = f.readline()
        if not line:
            break
        line_clean = line.rstrip('\n')
        restored = restore_line(line_clean)
        print(f"{i+1}: {restored}")
