import os

src_path = r"e:\work\work boost\ai_studio_clone\frontend\src\App.tsx"
with open(src_path, "r", encoding="utf-8") as f:
    content = f.read()

parts = []
for line in content.split("\n"):
    # Check for typical mojibake characters in CP1251 mapped to UTF-8
    if "Р" in line or "С" in line or "п" in line:
        try:
            fixed = line.encode("cp1251").decode("utf-8")
            parts.append(fixed)
        except Exception:
            parts.append(line)
    else:
        parts.append(line)

with open(src_path, "w", encoding="utf-8") as f:
    f.write("\n".join(parts))

print("Fixed encoding in App.tsx.")
