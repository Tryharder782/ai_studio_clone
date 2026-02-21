filepath = r'e:\work\work boost\ai_studio_clone\frontend\src\components\OpsCommandCenter.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Line 68 (0-indexed: 67) - interview
lines[67] = "  interview: 'Интервью',\r\n"

# Line 77 (0-indexed: 76) - execution
lines[76] = "  execution: 'Исполнение',\r\n"

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Fixed lines 68 and 77")
