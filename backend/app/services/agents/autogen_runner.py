"""
Multi-agent AutoGen runner with 5 dedicated agents.

Agents:
  1. RequirementAnalyst  – extracts actors, features, assumptions
  2. SystemArchitect     – designs modules, tech stack, deployment
  3. DatabaseArchitect   – designs tables, columns, relations
  4. ApiDesigner         – designs all REST endpoints
  5. ArchitectureCritic  – reviews, adds risks and data flows

Each agent makes exactly one LLM call and returns strict JSON.
All calls go through the centralized rate limiter.
"""

import json
import re
from typing import Any

from app.core.config import settings
from app.services.agents.agent_prompts import (
    API_DESIGNER_SYSTEM,
    ARCHITECTURE_CRITIC_REFINE_SYSTEM,
    ARCHITECTURE_CRITIC_SYSTEM,
    DATABASE_ARCHITECT_SYSTEM,
    REQUIREMENT_ANALYST_SYSTEM,
    SYSTEM_ARCHITECT_SYSTEM,
    api_designer_refine_task,
    api_designer_task,
    architecture_critic_refine_task,
    architecture_critic_task,
    database_architect_refine_task,
    database_architect_task,
    requirement_analyst_task,
    system_architect_refine_task,
    system_architect_task,
)
from app.services.llm.rate_limiter import rate_limiter


def clean_and_repair_json(content: str) -> str:
    """Robust utility to strip markdown fences, comments, trailing commas, and ellipses from JSON."""
    # 1. Strip markdown code block wrappers
    content = re.sub(r"^```[a-zA-Z0-9]*\s*", "", content, flags=re.MULTILINE)
    content = re.sub(r"```$", "", content, flags=re.MULTILINE)
    content = content.strip()
    
    # 2. Extract outermost { ... }
    match = re.search(r"(\{.*\})", content, re.DOTALL)
    if match:
        content = match.group(1)
        
    # 3. Strip single-line comments (// ... or # ...)
    lines = []
    for line in content.splitlines():
        line_clean = re.sub(r"(?<!:)\/\/.*$", "", line)
        line_clean = re.sub(r"(?<!['\"])#.*$", "", line_clean)
        lines.append(line_clean)
    content = "\n".join(lines)
    
    # 4. Remove trailing commas in objects and arrays
    content = re.sub(r",\s*([\]}])", r"\1", content)
    
    # 5. Remove ellipsis placeholders
    content = re.sub(r"\.\.\.", "", content)
    content = re.sub(r"…", "", content)
    
    return content.strip()


def _extract_json(content: str) -> dict[str, Any]:
    """Pull the first top-level JSON object from a string, repairing common LLM output mistakes."""
    cleaned = clean_and_repair_json(content)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Fallback: find the outermost { … }
    depth = 0
    start = -1
    for i, ch in enumerate(content):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start != -1:
                try:
                    chunk = clean_and_repair_json(content[start : i + 1])
                    return json.loads(chunk)
                except json.JSONDecodeError:
                    start = -1
    raise ValueError("AutoGen response did not contain valid JSON")


async def _run_single_agent_with_model(
    model_name: str,
    agent_name: str,
    system_message: str,
    task_message: str,
) -> dict[str, Any]:
    """Run a single AutoGen agent using a specific model name."""
    from autogen_ext.models.openai import OpenAIChatCompletionClient
    from autogen_agentchat.agents import AssistantAgent

    model_client = OpenAIChatCompletionClient(
        model=model_name,
        api_key=settings.groq_api_key,
        base_url="https://api.groq.com/openai/v1",
        max_tokens=4096,
        model_info={
            "vision": False,
            "function_calling": False,
            "json_output": True,
            "structured_output": False,
            "family": "unknown",
        },
    )

    agent = AssistantAgent(
        name=agent_name,
        model_client=model_client,
        system_message=system_message,
    )

    try:
        print(f"[MultiAgent] -> Running agent {agent_name} with model {model_name}")
        await rate_limiter.acquire()
        result = await agent.run(task=task_message)
        
        content = result.messages[-1].content
        if not isinstance(content, str):
            raise ValueError(f"Agent {agent_name} returned non-text content")

        parsed = _extract_json(content)
        print(f"[MultiAgent] OK: Agent {agent_name} completed – keys: {list(parsed.keys())}")
        return parsed
    finally:
        try:
            await model_client.close()
        except Exception:
            pass


async def _run_single_agent(
    agent_name: str,
    system_message: str,
    task_message: str,
    models: list[str],
    current_model_ref: list[str],
) -> dict[str, Any]:
    """Run one AutoGen agent, switching models on rate/token limits."""
    start_idx = 0
    try:
        start_idx = models.index(current_model_ref[0])
    except ValueError:
        pass

    last_exc = None
    for idx in range(start_idx, len(models)):
        model_name = models[idx]
        current_model_ref[0] = model_name  # Update active model reference
        
        try:
            return await _run_single_agent_with_model(
                model_name,
                agent_name,
                system_message,
                task_message,
            )
        except Exception as exc:
            exc_str = str(exc)
            if idx < len(models) - 1:
                next_model = models[idx + 1]
                print(f"[MultiAgent] Agent {agent_name} model {model_name} failed: {exc_str}. Switching immediately to fallback model: {next_model}...")
                last_exc = exc
                continue
            else:
                raise exc

    if last_exc:
        raise last_exc
    raise ValueError("No models available to run agent")


class MultiAgentRunner:
    """Orchestrates 5 specialised agents in sequence."""

    last_status: str = "not_started"

    async def run(self, requirements: str) -> dict[str, Any] | None:
        if not settings.groq_api_key:
            self.last_status = "skipped: GROQ_API_KEY not configured"
            print(f"[MultiAgent] {self.last_status}")
            return None

        # ── Import AutoGen ──────────────────────────────────────────
        try:
            from autogen_ext.models.openai import OpenAIChatCompletionClient
        except ImportError as exc:
            self.last_status = f"skipped: AutoGen import failed: {exc}"
            print(f"[MultiAgent] {self.last_status}")
            return None

        # ── Get model sequence list ─────────────────────────────────
        from app.services.llm.groq_client import get_model_list
        models = get_model_list()
        current_model_ref = [models[0]]

        self.last_status = "starting"
        print(f"[MultiAgent] Starting pipeline with models list: {models}")

        # ── Helper: compress inter-agent context to save tokens ──
        def _compact_analysis(a: dict) -> str:
            """Keep only names/lists, drop long text."""
            return json.dumps({
                "actors": a.get("actors", []),
                "features": a.get("features", [])[:15],
                "assumptions": a.get("assumptions", [])[:5],
            })

        def _compact_modules(m: dict) -> str:
            """Module names + external services only."""
            mods = [mod["name"] if isinstance(mod, dict) else mod
                    for mod in m.get("modules", [])]
            return json.dumps({
                "modules": mods,
                "external_services": m.get("external_services", []),
                "tech_stack": m.get("tech_stack", {}),
            })

        def _compact_database(d: dict) -> str:
            """Table names + column names only (no types/constraints)."""
            tables = []
            for ent in d.get("database_entities", []):
                if isinstance(ent, dict):
                    cols = [c["name"] if isinstance(c, dict) else c
                            for c in ent.get("columns", [])]
                    tables.append({"name": ent["name"], "columns": cols})
                else:
                    tables.append({"name": str(ent)})
            rels = d.get("database_relations", [])
            return json.dumps({"tables": tables, "relations": rels})

        try:
            # 1) Requirement Analyst
            analysis = await _run_single_agent(
                "requirement_analyst",
                REQUIREMENT_ANALYST_SYSTEM,
                requirement_analyst_task(requirements),
                models,
                current_model_ref,
            )

            analysis_str = json.dumps(analysis, indent=2)

            # 2) System Architect  (receives: full analysis)
            modules_result = await _run_single_agent(
                "system_architect",
                SYSTEM_ARCHITECT_SYSTEM,
                system_architect_task(requirements, analysis_str),
                models,
                current_model_ref,
            )

            # 3) Database Architect  (receives: compact analysis + compact modules)
            database_result = await _run_single_agent(
                "database_architect",
                DATABASE_ARCHITECT_SYSTEM,
                database_architect_task(
                    requirements,
                    _compact_analysis(analysis),
                    _compact_modules(modules_result),
                ),
                models,
                current_model_ref,
            )

            database_str = json.dumps(database_result, indent=2)

            # 4) API Designer  (receives: compact modules + compact database)
            apis_result = await _run_single_agent(
                "api_designer",
                API_DESIGNER_SYSTEM,
                api_designer_task(
                    requirements,
                    _compact_analysis(analysis),
                    _compact_modules(modules_result),
                    _compact_database(database_result),
                ),
                models,
                current_model_ref,
            )

            apis_str = json.dumps(apis_result, indent=2)

            # 5) Architecture Critic  (receives: compact everything)
            critic_result = await _run_single_agent(
                "architecture_critic",
                ARCHITECTURE_CRITIC_SYSTEM,
                architecture_critic_task(
                    requirements,
                    _compact_analysis(analysis),
                    _compact_modules(modules_result),
                    _compact_database(database_result),
                    apis_str,
                ),
                models,
                current_model_ref,
            )

            # Save the successful Round 1 merged draft as our initial draft
            initial_architecture = {
                **modules_result,
                **database_result,
                **apis_result,
                **critic_result,
            }

            # Save the successful Round 1 merged draft as our fallback base
            last_successful_merged_result = {
                "analysis": analysis,
                "architecture": {
                    **modules_result,
                    **database_result,
                    **apis_result,
                    **critic_result,
                },
            }

            # ── DYNAMIC REFINEMENT LOOP ─────────────────────────────────
            max_refinements = 3
            for refinement_round in range(1, max_refinements + 1):
                # Check if Critic says we need more refinement
                # requires_further_refinement can be boolean or string (e.g. "true" or "True")
                should_refine = critic_result.get("requires_further_refinement") in (True, "true", "True")
                if not should_refine:
                    print(f"[MultiAgent] Critic indicates no further refinement is needed (requires_further_refinement={critic_result.get('requires_further_refinement')}). Exiting loop.")
                    break
                
                refinement_needs = critic_result.get("components_needing_refinement") or {}
                
                def is_flagged(val: Any) -> bool:
                    if val is None:
                        return True
                    if isinstance(val, bool):
                        return val
                    if isinstance(val, str):
                        return val.strip().lower() in ("true", "yes", "1", "y")
                    if isinstance(val, (int, float)):
                        return val != 0
                    return True

                refine_system = is_flagged(refinement_needs.get("system_architect", True))
                refine_database = is_flagged(refinement_needs.get("database_architect", True))
                refine_api = is_flagged(refinement_needs.get("api_designer", True))

                if not (refine_system or refine_database or refine_api):
                    print(f"[MultiAgent] Critic requested refinement but flagged no specific components. Exiting loop.")
                    break

                print(f"[MultiAgent] Starting Refinement Round {refinement_round} (Attempting to resolve critic's risks)...")
                try:
                    # 1) Refine System Architect
                    if refine_system:
                        refined_modules = await _run_single_agent(
                            "system_architect",
                            SYSTEM_ARCHITECT_SYSTEM,
                            system_architect_refine_task(
                                requirements,
                                analysis_str,
                                json.dumps(modules_result),
                                json.dumps(critic_result),
                            ),
                            models,
                            current_model_ref,
                        )
                    else:
                        print("[MultiAgent] Skipping System Architect refinement (not flagged).")
                        refined_modules = modules_result

                    # 2) Refine Database Architect
                    if refine_database:
                        refined_database = await _run_single_agent(
                            "database_architect",
                            DATABASE_ARCHITECT_SYSTEM,
                            database_architect_refine_task(
                                requirements,
                                _compact_analysis(analysis),
                                _compact_modules(refined_modules),
                                json.dumps(database_result),
                                json.dumps(critic_result),
                            ),
                            models,
                            current_model_ref,
                        )
                    else:
                        print("[MultiAgent] Skipping Database Architect refinement (not flagged).")
                        refined_database = database_result

                    # 3) Refine API Designer
                    if refine_api:
                        refined_apis = await _run_single_agent(
                            "api_designer",
                            API_DESIGNER_SYSTEM,
                            api_designer_refine_task(
                                requirements,
                                _compact_analysis(analysis),
                                _compact_modules(refined_modules),
                                _compact_database(refined_database),
                                json.dumps(apis_result),
                                json.dumps(critic_result),
                            ),
                            models,
                            current_model_ref,
                        )
                    else:
                        print("[MultiAgent] Skipping API Designer refinement (not flagged).")
                        refined_apis = apis_result

                    # 4) Refine Architecture Critic (Final Review for this round)
                    refined_critic = await _run_single_agent(
                        "architecture_critic",
                        ARCHITECTURE_CRITIC_REFINE_SYSTEM,
                        architecture_critic_refine_task(
                            requirements,
                            _compact_analysis(analysis),
                            _compact_modules(refined_modules),
                            _compact_database(refined_database),
                            json.dumps(refined_apis),
                            json.dumps(critic_result),
                        ),
                        models,
                        current_model_ref,
                    )

                    # Update current round results for next round
                    modules_result = refined_modules
                    database_result = refined_database
                    apis_result = refined_apis
                    critic_result = refined_critic

                    # Save successfully merged results for this round
                    last_successful_merged_result = {
                        "analysis": analysis,
                        "architecture": {
                            **modules_result,
                            **database_result,
                            **apis_result,
                            **critic_result,
                        },
                    }
                except Exception as exc:
                    print(f"[MultiAgent] WARNING: Refinement Round {refinement_round} failed: {exc}. Falling back to best available architecture from previous round.")
                    break

            self.last_status = "completed"
            print("[MultiAgent] OK: Full pipeline completed successfully")
            return {
                "analysis": analysis,
                "architecture": last_successful_merged_result["architecture"],
                "initial_architecture": initial_architecture,
            }

        except Exception as exc:
            self.last_status = f"failed: {exc}"
            print(f"[MultiAgent] ERROR: Pipeline failed: {exc}")
            return None



# Singleton
autogen_runner = MultiAgentRunner()
