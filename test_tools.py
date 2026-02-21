"""Test with gemini-3.1-pro-preview specifically"""
import os
from dotenv import load_dotenv
load_dotenv()

from google import genai
from google.genai import types

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

test_decl = types.FunctionDeclaration(
    name="propose_opportunity",
    description="Propose creating a new opportunity card. ALWAYS call this when user mentions a project.",
    parameters=types.Schema(
        type="OBJECT",
        properties={
            "title": types.Schema(type="STRING", description="Title"),
            "client": types.Schema(type="STRING", description="Client name"),
        },
        required=["title"],
    ),
)

tools = [types.Tool(function_declarations=[test_decl])]

# Test with gemini-3.1-pro-preview
try:
    chat = client.chats.create(
        model="gemini-3.1-pro-preview",
        config=types.GenerateContentConfig(
            tools=tools,
            system_instruction="You MUST use the propose_opportunity tool for every project mentioned. NEVER just describe in text.",
        ),
    )
    
    response = chat.send_message("I have a project called 'Website Redesign' for client 'Acme Corp' worth $5000")
    
    print("=== gemini-3.1-pro-preview RESPONSE ===")
    for part in response.candidates[0].content.parts:
        if hasattr(part, 'function_call') and part.function_call:
            print(f"FUNCTION CALL: {part.function_call.name} args={dict(part.function_call.args)}")
        elif hasattr(part, 'text') and part.text:
            print(f"TEXT: {part.text[:300]}")
        else:
            print(f"OTHER: {part}")
except Exception as e:
    print(f"ERROR with gemini-3.1-pro-preview: {e}")
