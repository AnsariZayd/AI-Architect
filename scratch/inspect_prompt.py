import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
from app.services.llm.prompts import architecture_prompt, autogen_architecture_task

req = "Build a CTF platform with users, roles, challenges, and support tickets."

print("=================== ARCHITECTURE PROMPT ===================")
print(architecture_prompt(req, mode="architecture")[:2000])

print("=================== AUTOGEN TASK PROMPT ===================")
print(autogen_architecture_task(req)[:2000])
