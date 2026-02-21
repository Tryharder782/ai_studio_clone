import os

filepath = r'e:\work\work boost\ai_studio_clone\frontend\src\components\OpsCommandCenter.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

# Replace the specific incorrectly re-decoded strings with correct Cyrillic
text = text.replace("'Р˜РЅС‚РµСЂРІСЊСЋ'", "'Интервью'")
text = text.replace("'Р˜СЃРїРѕР»РЅРµРЅРёРµ'", "'Исполнение'")
text = text.replace("'Р Р°Р·Р±РѕСЂ / Postmortem'", "'Разбор / Postmortem'")
text = text.replace("'РќР°СЃС‚СЂРѕР№РєРё'", "'Настройки'")
text = text.replace("'Р’РѕСЂРѕРЅРєР°'", "'Воронка'")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)

print("done")
