import os

def fix_file(filepath):
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
            
        if "Р" not in content and "С" not in content and "п" not in content:
            return False

        parts = []
        changed = False
        for line in content.split("\n"):
            if "Р" in line or "С" in line or "п" in line:
                try:
                    fixed = line.encode("cp1251").decode("utf-8")
                    if fixed != line:
                        parts.append(fixed)
                        changed = True
                    else:
                        parts.append(line)
                except Exception:
                    parts.append(line)
            else:
                parts.append(line)
                
        if changed:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write("\n".join(parts))
            return True
            
        return False
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
        return False

count = 0
for root, dirs, files in os.walk(r"e:\work\work boost\ai_studio_clone\frontend\src"):
    for file in files:
        if file.endswith(".tsx") or file.endswith(".ts") or file.endswith(".tsx"):
            if fix_file(os.path.join(root, file)):
                print(f"Fixed {file}")
                count += 1

print(f"Total files fixed: {count}")
