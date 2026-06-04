from fastapi import APIRouter, UploadFile, File, HTTPException, Response
import io
import zipfile
import pypdf
from typing import Dict

from app.schemas.architecture import (
    AnalyzeRequest,
    ArchitectureRequest,
    ArchitectureResponse,
    RequirementAnalysis,
)
from app.services.agents.orchestrator import architect_orchestrator


router = APIRouter()


@router.post("/analyze", response_model=RequirementAnalysis)
async def analyze_requirements(payload: AnalyzeRequest) -> RequirementAnalysis:
    return await architect_orchestrator.analyze(payload.requirements)


@router.post("/architecture", response_model=ArchitectureResponse)
async def generate_architecture(payload: ArchitectureRequest) -> ArchitectureResponse:
    return await architect_orchestrator.generate_architecture(payload)


@router.post("/parse-file")
async def parse_file(file: UploadFile = File(...)) -> Dict[str, str]:
    filename = file.filename or ""
    if not (filename.endswith(".pdf") or filename.endswith(".txt")):
        raise HTTPException(status_code=400, detail="Only .pdf and .txt files are supported")
    
    try:
        content = await file.read()
        if filename.endswith(".pdf"):
            pdf_file = io.BytesIO(content)
            reader = pypdf.PdfReader(pdf_file)
            text = ""
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
            text = text.strip()
            if not text:
                raise HTTPException(status_code=400, detail="No text could be extracted from this PDF file.")
        else:
            text = content.decode("utf-8", errors="ignore").strip()
            if not text:
                raise HTTPException(status_code=400, detail="The uploaded text file is empty.")
        
        return {"text": text}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse file: {str(e)}")


@router.post("/zip")
async def download_zip(payload: Dict[str, str]):
    try:
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
            for file_name, file_content in payload.items():
                zip_file.writestr(file_name, file_content)
        
        return Response(
            content=zip_buffer.getvalue(),
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=boilerplate.zip"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create ZIP: {str(e)}")

