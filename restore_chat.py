import json
import os
import google.generativeai as genai
import sys

def parse_json_history(json_path):
    """
    Parses the specific JSON export format from AI Studio
    and converts it into Gemini API compatible history.
    """
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Error: File not found: {json_path}")
        return []
    except json.JSONDecodeError:
         print(f"Error: Invalid JSON file: {json_path}")
         return []

    if 'chunkedPrompt' not in data or 'chunks' not in data['chunkedPrompt']:
        print("Error: JSON structure mismatch. Expected 'chunkedPrompt.chunks'.")
        return []

    raw_chunks = data['chunkedPrompt']['chunks']
    history = []
    
    print(f"Found {len(raw_chunks)} message chunks. Processing...")

    for i, chunk in enumerate(raw_chunks):
        role = chunk.get('role')
        
        # Determine parts
        parts = []
        
        # 1. Direct text in chunk
        if 'text' in chunk:
             parts.append(chunk['text'])
        
        # 2. 'parts' array (often contains thoughts or text)
        if 'parts' in chunk:
            for part in chunk['parts']:
                if 'text' in part:
                    text_content = part['text']
                    # Label thoughts if present, to preserve context but distinguish them
                    if part.get('thought', False):
                         text_content = f"[THOUGHT_BLOCK]\n{text_content}\n[/THOUGHT_BLOCK]"
                    parts.append(text_content)

        # 3. Attachments (Drive references) - Placeholder only
        if 'driveDocument' in chunk:
            doc_id = chunk['driveDocument'].get('id', 'unknown')
            parts.append(f"[ATTACHMENT: Drive Document ID={doc_id} (Content not locally available)]")
        
        if 'driveImage' in chunk:
            img_id = chunk['driveImage'].get('id', 'unknown')
            parts.append(f"[ATTACHMENT: Drive Image ID={img_id} (Content not locally available)]")


        # Construct api message object
        if parts:
            # Join all text parts for this turn. 
            # Note: The API technically accepts a list of parts, but for simplicity/robustness 
            # with hybrid content (missing files), we'll join text.
            # Ideally we should pass list of parts if we had the actual files.
            
            full_text = "\n\n".join(parts)
            
            # Map roles: 'model' remains 'model', 'user' remains 'user'
            api_role = "model" if role == "model" else "user"
            
            history.append({
                "role": api_role,
                "parts": [full_text] 
            })
            
    return history

def main():
    print("--- Gemini Chat Restorer ---")
    
    # 1. API Key Setup
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        api_key = input("Enter your GOOGLE_API_KEY: ").strip()
    
    if not api_key:
        print("Error: API Key is required.")
        return

    genai.configure(api_key=api_key)

    # 2. File Selection
    json_path = "Работа над собой 3.json" # Default
    if len(sys.argv) > 1:
        json_path = sys.argv[1]
    
    if not os.path.exists(json_path):
        print(f"Default file '{json_path}' not found.")
        json_path = input("Enter path to JSON export file: ").strip()

    # 3. Parse History
    print(f"Loading history from: {json_path} ...")
    history = parse_json_history(json_path)
    
    if not history:
        print("Failed to load history. Exiting.")
        return

    print(f"Successfully loaded {len(history)} interaction turns.")
    print("Initializing Gemini 1.5 Pro...")

    # 4. Start Chat
    # Using gemini-3-pro-preview as requested (2026 standard)
    model = genai.GenerativeModel('gemini-3-pro-preview')
    
    try:
        chat = model.start_chat(history=history)
        print("\n--- Chat Restored. You are back online. ---\n")
        print("(Type 'quit' to exit)")
        
        while True:
            user_input = input("\nYou: ")
            if user_input.lower() in ['quit', 'exit']:
                break
            
            if not user_input.strip():
                continue
                
            print("Gemini: Thinking...", end="\r")
            try:
                response = chat.send_message(user_input)
                print(f"Gemini: {response.text}")
            except Exception as e:
                print(f"\nError sending message: {e}")

    except Exception as e:
        print(f"\nCritical Error starting chat (likely Context/API limit): {e}")

if __name__ == "__main__":
    main()
