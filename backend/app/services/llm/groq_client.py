import json
import re
import asyncio
import httpx
from typing import List

from app.core.config import settings
from app.services.llm.rate_limiter import rate_limiter


def get_model_list() -> List[str]:
    """Get list of Groq models starting with the configured one followed by fallbacks."""
    configured_model = settings.groq_model
    fallback_models = [
        "llama-3.3-70b-versatile",
        "qwen/qwen3-32b",
        "openai/gpt-oss-20b",
        "meta-llama/llama-4-scout-17b-16e-instruct",
        "llama-3.1-8b-instant"
    ]
    models = []
    if configured_model:
        models.append(configured_model)
    for m in fallback_models:
        if m not in models:
            models.append(m)
    return models


class GroqClient:
    last_status = "not_started"

    async def generate_json(self, prompt_or_messages: str | list[dict]) -> dict | None:
        if not settings.groq_api_key:
            self.last_status = "skipped: GROQ_API_KEY is not configured"
            print(f"Groq {self.last_status}")
            return None

        if isinstance(prompt_or_messages, str):
            messages = [
                {"role": "system", "content": "You produce strict JSON and no prose."},
                {"role": "user", "content": prompt_or_messages},
            ]
        else:
            messages = prompt_or_messages

        headers = {
            "Authorization": f"Bearer {settings.groq_api_key}",
            "Content-Type": "application/json",
        }

        models = get_model_list()

        for model_idx, model in enumerate(models):
            payload = {
                "model": model,
                "messages": messages,
                "temperature": 0.2,
                "max_tokens": 4096,
                "response_format": {"type": "json_object"},
            }

            max_http_retries = 3
            response = None
            
            for attempt in range(max_http_retries):
                try:
                    self.last_status = f"starting: {model}"
                    await rate_limiter.acquire()
                    print(f"Groq starting with model {model} (Attempt {attempt+1}/{max_http_retries})")
                    async with httpx.AsyncClient(timeout=90) as client:
                        response = await client.post(
                            "https://api.groq.com/openai/v1/chat/completions",
                            headers=headers,
                            json=payload,
                        )
                        
                        if response.status_code == 429:
                            # If we have subsequent models left, switch immediately without sleeping
                            if model_idx < len(models) - 1:
                                next_model = models[model_idx + 1]
                                print(f"Groq model {model} rate limited (429). Switching immediately to next model: {next_model}")
                                break  # Break attempt loop, moves to next model in models loop
                            
                            # No more models left, apply sleep/retry logic to last model
                            retry_after = 10.0
                            header_val = response.headers.get("retry-after")
                            if header_val:
                                try:
                                    retry_after = float(header_val)
                                except ValueError:
                                    pass
                            else:
                                try:
                                    msg = response.json().get("error", {}).get("message", "")
                                except Exception:
                                    msg = response.text
                                match = re.search(r"try again in (\d+\.?\d*)s", msg, re.IGNORECASE)
                                if match:
                                    retry_after = float(match.group(1))
                            
                            sleep_time = retry_after + 1.5
                            if sleep_time > 30.0:
                                self.last_status = f"failed: Groq rate limit exceeded (TPD/TPM) on all models. Try again in {sleep_time:.1f}s."
                                print(f"Groq {self.last_status}")
                                return None
                            print(f"Groq 429 Rate Limit Reached on last model. Sleeping for {sleep_time:.2f} seconds before retry...")
                            self.last_status = f"rate_limited: sleeping {sleep_time:.2f}s"
                            await asyncio.sleep(sleep_time)
                            continue
                            
                        response.raise_for_status()
                        break
                        
                except httpx.HTTPStatusError as error:
                    if error.response.status_code >= 500:
                        print(f"Groq server error {error.response.status_code} on Attempt {attempt+1}/{max_http_retries}. Retrying in 2.0s...")
                        await asyncio.sleep(2.0)
                        continue
                    else:
                        # For non-429 client errors (e.g. 400 Bad Request if model is not supported, etc.),
                        # try next model if available
                        if model_idx < len(models) - 1:
                            print(f"Groq model {model} failed with {error.response.status_code}. Trying next model...")
                            break
                        self.last_status = (
                            f"failed: Groq returned {error.response.status_code}: "
                            f"{error.response.text[:300]}"
                        )
                        print(f"Groq {self.last_status}")
                        return None
                except httpx.HTTPError as error:
                    print(f"Groq HTTP error on Attempt {attempt+1}/{max_http_retries}: {error}. Retrying in 2.0s...")
                    await asyncio.sleep(2.0)
                    continue
            else:
                # If we exhausted attempts without breaking/succeeding
                if response and response.status_code == 429 and model_idx < len(models) - 1:
                    continue
                if model_idx < len(models) - 1:
                    continue
                self.last_status = "failed: max HTTP rate-limit or connection retries exceeded on last model"
                print(f"Groq {self.last_status}")
                return None

            # If current model succeeded, break models loop
            if response and response.status_code == 200:
                break
        else:
            # Models loop finished without success
            return None

        if not response:
            return None

        content = response.json()["choices"][0]["message"]["content"]
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError as error:
            self.last_status = f"failed: invalid JSON response: {error}"
            print(f"Groq {self.last_status}")
            return None

        self.last_status = "completed"
        print("Groq completed")
        return parsed


groq_client = GroqClient()

