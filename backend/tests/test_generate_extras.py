import io
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from app.main import app

client = TestClient(app)

def test_parse_file_txt():
    file_content = b"Hello, this is a test requirements file."
    files = {"file": ("test.txt", file_content, "text/plain")}
    response = client.post("/api/generate/parse-file", files=files)
    
    assert response.status_code == 200
    assert response.json() == {"text": "Hello, this is a test requirements file."}

def test_parse_file_txt_empty():
    files = {"file": ("test.txt", b"", "text/plain")}
    response = client.post("/api/generate/parse-file", files=files)
    assert response.status_code == 400
    assert "empty" in response.json()["detail"]

def test_parse_file_unsupported_extension():
    files = {"file": ("test.jpg", b"fake-data", "image/jpeg")}
    response = client.post("/api/generate/parse-file", files=files)
    assert response.status_code == 400
    assert "pdf" in response.json()["detail"]

@patch("pypdf.PdfReader")
def test_parse_file_pdf(mock_pdf_reader):
    mock_page = MagicMock()
    mock_page.extract_text.return_value = "Extracted text from PDF."
    
    mock_reader = MagicMock()
    mock_reader.pages = [mock_page]
    mock_pdf_reader.return_value = mock_reader
    
    files = {"file": ("test.pdf", b"%PDF-1.4 mock pdf bytes", "application/pdf")}
    response = client.post("/api/generate/parse-file", files=files)
    
    assert response.status_code == 200
    assert response.json() == {"text": "Extracted text from PDF."}

def test_zip_endpoint():
    payload = {
        "file1.txt": "content 1",
        "folder/file2.py": "print('hello')"
    }
    response = client.post("/api/generate/zip", json=payload)
    
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert "attachment" in response.headers["content-disposition"]
    
    import zipfile
    zip_bytes = response.content
    zip_file = zipfile.ZipFile(io.BytesIO(zip_bytes))
    
    assert "file1.txt" in zip_file.namelist()
    assert "folder/file2.py" in zip_file.namelist()
    assert zip_file.read("file1.txt").decode() == "content 1"
    assert zip_file.read("folder/file2.py").decode() == "print('hello')"


import pytest

@pytest.mark.anyio
@patch("httpx.AsyncClient.post")
@patch("app.core.config.settings.groq_api_key", "gsk_fake")
@patch("app.services.llm.rate_limiter.rate_limiter.acquire")
async def test_groq_client_model_fallback(mock_acquire, mock_post):
    mock_res_429 = MagicMock()
    mock_res_429.status_code = 429
    mock_res_429.headers = {"retry-after": "1"}
    
    mock_res_200 = MagicMock()
    mock_res_200.status_code = 200
    mock_res_200.json.return_value = {
        "choices": [
            {
                "message": {
                    "content": '{"result": "success"}'
                }
            }
        ]
    }
    
    mock_post.side_effect = [mock_res_429, mock_res_200]
    
    from app.services.llm.groq_client import groq_client
    res = await groq_client.generate_json("test requirements")
    
    assert res == {"result": "success"}
    assert mock_post.call_count == 2
    
    call_args_list = mock_post.call_args_list
    from app.services.llm.groq_client import get_model_list
    models = get_model_list()
    assert call_args_list[0][1]["json"]["model"] == models[0]
    assert call_args_list[1][1]["json"]["model"] == models[1]


@pytest.mark.anyio
@patch("app.services.agents.autogen_runner._run_single_agent_with_model")
async def test_autogen_runner_model_fallback(mock_run_with_model):
    mock_run_with_model.side_effect = [
        Exception("Rate limit 429 exceeded on this model"),
        {"key": "value"}
    ]
    
    from app.services.agents.autogen_runner import _run_single_agent
    models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
    current_model_ref = [models[0]]
    
    res = await _run_single_agent(
        "test_agent",
        "system_message",
        "task_message",
        models,
        current_model_ref
    )
    
    assert res == {"key": "value"}
    assert current_model_ref[0] == "llama-3.1-8b-instant"
    assert mock_run_with_model.call_count == 2


@pytest.mark.anyio
@patch("app.services.agents.autogen_runner._run_single_agent")
async def test_autogen_runner_dynamic_loop(mock_run_agent):
    mock_run_agent.side_effect = [
        # Round 1
        {"actors": [], "features": []},  # analyst
        {"modules": [], "tech_stack": {}},  # system_architect
        {"database_entities": [], "database_relations": []},  # db_architect
        {"apis": []},  # api_designer
        {"risks": [], "data_flows": [], "requires_further_refinement": True},  # critic (asks for refinement)
        
        # Round 2 (Refinement Round 1)
        {"modules": ["refined_module"], "tech_stack": {}},  # system_architect refined
        {"database_entities": ["refined_table"], "database_relations": []},  # db_architect refined
        {"apis": ["refined_api"]},  # api_designer refined
        {"risks": ["resolved"], "data_flows": [], "requires_further_refinement": False},  # critic (satisfied, requires_further_refinement=False)
    ]
    
    from app.services.agents.autogen_runner import autogen_runner
    with patch("app.core.config.settings.groq_api_key", "gsk_fake"):
        res = await autogen_runner.run("test requirements")
        
    assert res is not None
    assert mock_run_agent.call_count == 9
    assert res["architecture"]["modules"] == ["refined_module"]
    assert res["architecture"]["risks"] == ["resolved"]


@pytest.mark.anyio
@patch("app.services.agents.autogen_runner._run_single_agent")
async def test_autogen_runner_conditional_refinement(mock_run_agent):
    mock_run_agent.side_effect = [
        # Round 1
        {"actors": [], "features": []},  # analyst
        {"modules": [{"name": "Auth"}], "tech_stack": {}},  # system_architect
        {"database_entities": [{"name": "users"}], "database_relations": []},  # db_architect
        {"apis": [{"path": "/login"}]},  # api_designer
        {
            "risks": ["DB issue"],
            "data_flows": [],
            "requires_further_refinement": True,
            "components_needing_refinement": {
                "system_architect": False,
                "database_architect": True,
                "api_designer": False
            }
        },  # critic: flags only database for refinement
        
        # Round 2 (Refinement Round 1)
        # 1) System Architect is skipped (returns modules_result: Auth)
        # 2) Database Architect is executed:
        {"database_entities": [{"name": "users_refined"}], "database_relations": []},  # db_architect refined
        # 3) API Designer is skipped (returns apis_result: /login)
        # 4) Critic is executed:
        {
            "risks": ["resolved"],
            "data_flows": [],
            "requires_further_refinement": False,
            "components_needing_refinement": {
                "system_architect": False,
                "database_architect": False,
                "api_designer": False
            }
        },
    ]
    
    from app.services.agents.autogen_runner import autogen_runner
    with patch("app.core.config.settings.groq_api_key", "gsk_fake"):
        res = await autogen_runner.run("test requirements")
        
    assert res is not None
    # Total calls to run_single_agent should be 7:
    # Round 1: analyst (1), system (2), db (3), api (4), critic (5)
    # Round 2: db refined (6), critic (7)
    assert mock_run_agent.call_count == 7
    assert res["architecture"]["modules"] == [{"name": "Auth"}]  # kept from Round 1
    assert res["architecture"]["database_entities"] == [{"name": "users_refined"}]  # updated in Round 2
    assert res["architecture"]["apis"] == [{"path": "/login"}]  # kept from Round 1


@pytest.mark.anyio
@patch("app.services.agents.autogen_runner._run_single_agent")
async def test_autogen_runner_refinement_fallback_on_error(mock_run_agent):
    mock_run_agent.side_effect = [
        # Round 1 (Succeeds)
        {"actors": ["user"], "features": ["auth"]},  # analyst
        {"modules": ["auth_module"], "tech_stack": {}},  # system_architect
        {"database_entities": ["users"], "database_relations": []},  # db_architect
        {"apis": ["POST /login"]},  # api_designer
        {"risks": ["leak"], "data_flows": [], "requires_further_refinement": True},  # critic (asks for refinement)
        
        # Round 2 (Fails on first agent)
        Exception("Rate limit exhausted on fallback models!")
    ]
    
    from app.services.agents.autogen_runner import autogen_runner
    with patch("app.core.config.settings.groq_api_key", "gsk_fake"):
        res = await autogen_runner.run("test requirements")
        
    # Should not be None! It should fall back and return the Round 1 results.
    assert res is not None
    assert mock_run_agent.call_count == 6
    assert res["analysis"]["actors"] == ["user"]
    assert res["architecture"]["modules"] == ["auth_module"]
    assert res["architecture"]["risks"] == ["leak"]


def test_clean_and_repair_json():
    from app.services.agents.autogen_runner import clean_and_repair_json, _extract_json
    
    input_str = """
    Here is the requested schema:
    ```json
    {
      "key": "value", // inline comment
      "list": [
        "item1",
        "item2", # python style comment
      ],
      "truncated": [
        ...
      ]
    }
    ```
    I hope this helps!
    """
    
    repaired = clean_and_repair_json(input_str)
    assert repaired.startswith("{")
    assert repaired.endswith("}")
    
    parsed = _extract_json(input_str)
    assert parsed == {
        "key": "value",
        "list": ["item1", "item2"],
        "truncated": []
    }


def test_cors_origins_validation():
    from app.core.config import Settings
    
    # 1. Comma separated string
    s1 = Settings(CORS_ORIGINS="https://example.com, http://test.com")
    assert s1.cors_origins == ["https://example.com", "http://test.com"]
    
    # 2. JSON array string
    s2 = Settings(CORS_ORIGINS='["https://example.com", "http://test.com"]')
    assert s2.cors_origins == ["https://example.com", "http://test.com"]
    
    # 3. Regular list
    s3 = Settings(CORS_ORIGINS=["https://example.com", "http://test.com"])
    assert s3.cors_origins == ["https://example.com", "http://test.com"]




