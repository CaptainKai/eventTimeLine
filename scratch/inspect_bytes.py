# -*- coding: utf-8 -*-
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Read the first 10 lines of DEVELOP_DIARY.md as bytes and print their hex representation
with open('DEVELOP_DIARY.md', 'rb') as f:
    for i in range(15):
        line = f.readline()
        if not line:
            break
        print(f"Line {i+1}: {line.hex()}")
        try:
            print(f"Text {i+1}: {line.decode('utf-8')}")
        except Exception as e:
            print(f"Text {i+1} decode error: {e}")
