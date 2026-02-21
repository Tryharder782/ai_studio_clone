filepath = r'e:\work\work boost\ai_studio_clone\frontend\src\components\OpsCommandCenter.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Line 656 (0-indexed 655): arrow left  в†ђ  -> ←
lines[655] = lines[655].replace('в†ђ', '←')

# Line 672 (0-indexed 671): pencil icon  вњЋ  -> ✎
lines[671] = lines[671].replace('вњЋ', '✎')

# Line 771 (0-indexed 770): arrows  в†¬  -> ↬  and  в†'  -> →
lines[770] = lines[770].replace("'в†¬'", "'↬'").replace("'в†''", "'→'")

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Fixed arrow/pencil symbols on lines 656, 672, 771")
