"""Pydantic schemas for OCR and match-names API."""
from pydantic import BaseModel, Field
from typing import Optional


class OcrRequest(BaseModel):
    image_base64: str = Field(..., description="Base64-encoded image data")
    language: str = Field(default="vi", description="Language code for OCR (vi, en)")


class OcrResponse(BaseModel):
    text: str = Field(..., description="Recognized text from image")


class MatchNamesRequest(BaseModel):
    recognized_names: list[str] = Field(..., description="List of names from OCR")
    student_names: list[str] = Field(..., description="List of student names to match against")
    threshold: int = Field(default=60, ge=0, le=100, description="Minimum similarity score 0-100")
    fallback_min_score: Optional[int] = Field(
        default=None, ge=0, le=100,
        description="If set, when score < threshold but >= this value, still return best match as fallback (tên gần nhất)",
    )


class MatchItem(BaseModel):
    recognized: str
    matched: str
    index: int
    score: float
    fallback: bool = Field(default=False, description="True if matched via fallback (score below threshold)")


class MatchNamesResponse(BaseModel):
    matches: list[MatchItem] = Field(..., description="List of match results per recognized name")


class ImageHashRequest(BaseModel):
    image_base64: str = Field(..., description="Base64-encoded image data")


class ImageHashResponse(BaseModel):
    hash: str = Field(..., description="Perceptual hash (hex string) of the image")


class MatchByImageSample(BaseModel):
    student_index: int = Field(..., description="Index of student in the class list")
    image_hash: str = Field(..., description="Perceptual hash (hex) of stored sample")


class MatchByImageRequest(BaseModel):
    image_base64: str = Field(..., description="Base64-encoded image to match")
    samples: list[MatchByImageSample] = Field(..., description="Stored samples (student_index, image_hash)")


class MatchByImageResponse(BaseModel):
    student_index: int = Field(..., description="Index of matched student, or -1 if no match")
    score: float = Field(default=0.0, description="Similarity score 0-100 (higher = more similar)")
