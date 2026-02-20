import os
import re
import json
import requests
from urllib.parse import urlparse

# Settings
ATTACHMENTS_DIR = "attachments"
HISTORY_FILE = "../../Работа над собой 3.json"

if not os.path.exists(ATTACHMENTS_DIR):
    os.makedirs(ATTACHMENTS_DIR)

def download_file(file_id, dest_folder):
    url = f"https://drive.google.com/uc?export=download&id={file_id}"
    response = requests.get(url, stream=True)
    
    if response.status_code == 200:
        # Try to get extension from content-type or content-disposition
        content_type = response.headers.get('content-type', '')
        ext = "png" # Default for images
        if "pdf" in content_type: ext = "pdf"
        elif "text" in content_type: ext = "txt"
        elif "video" in content_type: ext = "mp4"
        
        filename = f"{file_id}.{ext}"
        filepath = os.path.join(dest_folder, filename)
        
        with open(filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        return filename, content_type, os.path.getsize(filepath)
    else:
        print(f"Failed to download {file_id}: status {response.status_code}")
        return None, None, None

def process_history(links_string=None):
    # Improved extraction: look for anything that looks like a Google ID (25-45 chars of b64-like)
    # but specifically in the context of d/, id=, or within the AI Studio state %22ID%22
    ids_to_process = []
    if links_string:
        # Standard Drive links
        ids_to_process += re.findall(r"d/([a-zA-Z0-9_-]{25,50})", links_string)
        ids_to_process += re.findall(r"id=([a-zA-Z0-9_-]{25,50})", links_string)
        # AI Studio state links (encoded %22ID%22)
        ids_to_process += re.findall(r"%22([a-zA-Z0-9_-]{25,50})%22", links_string)
        # Remove duplicates
        ids_to_process = list(set(ids_to_process))
        print(f"Extracted {len(ids_to_process)} unique IDs from provided string.")
    
    with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    pattern = r"\[ATTACHMENT: Drive Image ID=([a-zA-Z0-9_-]+)\]"
    
    # Track downloaded files to avoid duplicates
    downloaded = {}

    def walk_and_fix(node):
        if isinstance(node, list):
            for item in node: walk_and_fix(item)
        elif isinstance(node, dict):
            if "text" in node and isinstance(node["text"], str):
                matches = re.findall(pattern, node["text"])
                # We prioritize IDs found in the text, but also check the extra_ids if specific placeholders are missing
                target_ids = list(set(matches))
                
                if target_ids:
                    if "attachments" not in node:
                        node["attachments"] = []
                    
                    for fid in target_ids:
                        if fid not in downloaded:
                            print(f"Syncing {fid}...")
                            fname, mtype, size = download_file(fid, ATTACHMENTS_DIR)
                            if fname:
                                downloaded[fid] = {"name": fname, "type": mtype, "size": size}
                        
                        if fid in downloaded:
                            info = downloaded[fid]
                            # Only add if not already present
                            existing_names = [a["name"] for a in node["attachments"]]
                            if info["name"] not in existing_names:
                                node["attachments"].append({
                                    "name": info["name"],
                                    "type": info["type"],
                                    "size": info["size"],
                                    "url": f"/attachments/{info['name']}"
                                })
                            # Remove the tag from text
                            node["text"] = node["text"].replace(f"[ATTACHMENT: Drive Image ID={fid}]", "").strip()
            
            # Check for direct driveImage/driveDocument/etc. keys
            drive_keys = ["driveImage", "driveDocument", "driveFile", "driveVideo"]
            for dk in drive_keys:
                if dk in node and "id" in node[dk]:
                    fid = node[dk]["id"]
                    if fid not in downloaded:
                        print(f"Syncing {dk} ID {fid}...")
                        fname, mtype, size = download_file(fid, ATTACHMENTS_DIR)
                        if fname:
                            downloaded[fid] = {"name": fname, "type": mtype, "size": size}
                    
                    if fid in downloaded:
                        info = downloaded[fid]
                        if "attachments" not in node: node["attachments"] = []
                        existing_names = [a["name"] for a in node["attachments"]]
                        if info["name"] not in existing_names:
                            node["attachments"].append({
                                "name": info["name"],
                                "type": info["type"],
                                "size": info["size"],
                                "url": f"/attachments/{info['name']}"
                            })

            for k, v in node.items():
                if k != "text": walk_and_fix(v)

    # First pass: download all IDs found in the text
    walk_and_fix(data)
    
    # Second pass: download all IDs from the extra list that weren't in the text
    # (These might be the history file itself or files that don't have tags yet)
    for fid in ids_to_process:
        if fid not in downloaded:
            print(f"Syncing extra ID {fid}...")
            download_file(fid, ATTACHMENTS_DIR)

    walk_and_fix(data)
    
    with open(HISTORY_FILE + ".synced", 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"Finished! Synced file saved as {HISTORY_FILE}.synced")

if __name__ == "__main__":
    process_history()
