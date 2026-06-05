import asyncio
import json
import os
import sys

# Add backend directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.core.config import settings

async def main():
    if not settings.groq_api_key:
        print("Error: GROQ_API_KEY not set in backend/.env")
        return
    
    from app.services.agents.autogen_runner import autogen_runner
    
    test_requirements = (
        "Build a simple task management application. "
        "Users can register, create tasks, assign priority, and set deadlines. "
        "Admin can delete any user's tasks. "
        "No authentication specified but we need a secure system."
    )
    
    print("Running MultiAgentRunner.run()...")
    res = await autogen_runner.run(test_requirements)
    
    if res:
        print("\n=== Generation Succeeded ===")
        print("Analysis Keys:", list(res.get("analysis", {}).keys()))
        print("Architecture Keys:", list(res.get("architecture", {}).keys()))
        print("Requires Further Refinement value returned in architecture:", res.get("architecture", {}).get("requires_further_refinement"))
        print("\nAll Risks Found:")
        for r in res.get("architecture", {}).get("risks", []):
            print(f"- {r}")
    else:
        print("\n=== Generation Failed ===")

if __name__ == "__main__":
    asyncio.run(main())
