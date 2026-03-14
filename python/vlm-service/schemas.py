"""Pydantic schemas for VLM service API.

Compatible with ocr-service schemas (same /ocr and /match-names contract)
plus new /ocr-match combined endpoint.
"""
from pydantic import BaseModel, Field
from typing import Optional


class OcrRequest(BaseModel):
    image_base64: str = Field(..., description="Base64-encoded image data")
    language: str = Field(default="vi", description="Language code (vi, en)")


class OcrResponse(BaseModel):
    text: str = Field(..., description="Recognized text from image")


class MatchNamesRequest(BaseModel):
    recognized_names: list[str] = Field(..., description="List of names from OCR")
    student_names: list[str] = Field(..., description="List of student names to match against")
    threshold: int = Field(default=60, ge=0, le=100, description="Minimum similarity score 0-100")
    fallback_min_score: Optional[int] = Field(
        default=None, ge=0, le=100,
        description="If set, when score < threshold but >= this value, still return best match as fallback",
    )


class MatchItem(BaseModel):
    recognized: str
    matched: str
    index: int
    score: float
    fallback: bool = Field(default=False, description="True if matched via fallback (score below threshold)")


class MatchNamesResponse(BaseModel):
    matches: list[MatchItem] = Field(..., description="List of match results per recognized name")


class OcrMatchRequest(BaseModel):
    """Combined OCR + match: send image + student list, VLM does both in one pass."""
    image_base64: str = Field(..., description="Base64-encoded image data")
    student_names: list[str] = Field(..., description="Student names for in-context matching")
    language: str = Field(default="vi", description="Language code (vi, en)")
    threshold: int = Field(default=60, ge=0, le=100, description="Minimum similarity score 0-100")
    fallback_min_score: Optional[int] = Field(
        default=None, ge=0, le=100,
        description="Fallback threshold for fuzzy matching refinement",
    )


class OcrMatchResponse(BaseModel):
    """Result of combined OCR + match."""
    text: str = Field(..., description="Raw VLM output (recognized text)")
    matched: str = Field(default="", description="Best match from student list")
    index: int = Field(default=-1, description="Index in student_names, -1 if no match")
    score: float = Field(default=0.0, description="Similarity score 0-100")
    fallback: bool = Field(default=False, description="True if matched via fuzzy fallback")
