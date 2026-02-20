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

    pending_thought = None  # Store thought chunk to merge with next response
    
    for i, chunk in enumerate(raw_chunks):
        role = chunk.get('role')
        is_thought_chunk = chunk.get('isThought', False)
        
        # Get the text content (prefer clean 'text' field)
        text_content = ""
        if 'text' in chunk and chunk['text']:
            text_content = chunk['text']
        elif 'parts' in chunk:
            # Fallback: join parts
            text_parts = []
            for part in chunk['parts']:
                if 'text' in part:
                    text_parts.append(part['text'])
            text_content = "".join(text_parts)
        
        # Handle attachments
        attachments = []
        if 'driveDocument' in chunk:
            doc_id = chunk['driveDocument'].get('id', 'unknown')
            attachments.append(f"[ATTACHMENT: Drive Document ID={doc_id}]")
        if 'driveImage' in chunk:
            img_id = chunk['driveImage'].get('id', 'unknown')
            attachments.append(f"[ATTACHMENT: Drive Image ID={img_id}]")
        
        # If this is a thought chunk, save it for merging with next response
        if is_thought_chunk and role == 'model':
            pending_thought = text_content
            continue  # Don't add this as a separate message
        
        # Build the final message content
        final_content = ""
        
        # If we have a pending thought, prepend it
        if pending_thought and role == 'model':
            final_content = f"[THOUGHT_BLOCK]{pending_thought}[/THOUGHT_BLOCK]\n\n"
            pending_thought = None  # Clear the pending thought
        
        # Add the main content
        if text_content:
            final_content += text_content
        
        # Add attachments
        if attachments:
            final_content += "\n\n" + "\n".join(attachments)
        
        # Only add if we have content
        if final_content.strip():
            api_role = "model" if role == "model" else "user"
            history.append({
                "role": api_role,
                "parts": [final_content]
            })
    
    # Handle any remaining pending thought (edge case)
    if pending_thought:
        history.append({
            "role": "model",
            "parts": [f"[THOUGHT_BLOCK]{pending_thought}[/THOUGHT_BLOCK]"]
        })
    
    return history
