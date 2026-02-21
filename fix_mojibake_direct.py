import os
import re

def fix_mojibake(text):
    # Find any sequence of non-ASCII characters
    pattern = re.compile(r'[^\x00-\x7F]+')
    
    def replacer(match):
        s = match.group(0)
        try:
            # If it's mojibake, encoding it as cp1251 will yield valid UTF-8 bytes
            decoded = s.encode('cp1251').decode('utf-8')
            # If it decoded without error and resulting text contains Cyrillic, use it
            if any('\u0400' <= c <= '\u04FF' for c in decoded):
                return decoded
        except Exception:
            # If it's already Cyrillic (e.g. "Ключевые"), encoding as cp1251 -> decoding as utf8 will throw an error
            pass
        return s
        
    return pattern.sub(replacer, text)

filepath = r'e:\work\work boost\ai_studio_clone\frontend\src\components\OpsCommandCenter.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

fixed_content = fix_mojibake(content)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(fixed_content)

print(f"Fixed mojibake in {filepath}")
