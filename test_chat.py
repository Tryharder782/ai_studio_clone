import requests

try:
    resp = requests.post("http://127.0.0.1:8000/api/chat", data={"message": "Hello", "model": "gemini-3.5-pro"})
    print("Status:", resp.status_code)
    print("Body:", resp.text)
except Exception as e:
    print("Failed:", e)
