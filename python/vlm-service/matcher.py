"""Fuzzy name matching with thefuzz and Vietnamese normalization.

- Handles full name or first-name-only lists; for "Anh" we also compare with "tên trước Anh" (e.g. "Văn Anh").
- Normalizes diacritics (OCR is weak on dấu) for comparison.
- OCR confusions: o/a (e.g. Toom->Toàn) via recognition variants.
"""
import logging
from typing import List, Optional
from thefuzz import fuzz

logger = logging.getLogger(__name__)

# Vietnamese tone removal (OCR weak on diacritics - compare without dấu)
VIETNAMESE_MAP = {
    "à": "a", "á": "a", "ả": "a", "ã": "a", "ạ": "a",
    "ă": "a", "ằ": "a", "ắ": "a", "ẳ": "a", "ẵ": "a", "ặ": "a",
    "â": "a", "ầ": "a", "ấ": "a", "ẩ": "a", "ẫ": "a", "ậ": "a",
    "è": "e", "é": "e", "ẻ": "e", "ẽ": "e", "ẹ": "e",
    "ê": "e", "ề": "e", "ế": "e", "ể": "e", "ễ": "e", "ệ": "e",
    "ì": "i", "í": "i", "ỉ": "i", "ĩ": "i", "ị": "i",
    "ò": "o", "ó": "o", "ỏ": "o", "õ": "o", "ọ": "o",
    "ô": "o", "ồ": "o", "ố": "o", "ổ": "o", "ỗ": "o", "ộ": "o",
    "ơ": "o", "ờ": "o", "ớ": "o", "ở": "o", "ỡ": "o", "ợ": "o",
    "ù": "u", "ú": "u", "ủ": "u", "ũ": "u", "ụ": "u",
    "ư": "u", "ừ": "u", "ứ": "u", "ử": "u", "ữ": "u", "ự": "u",
    "ỳ": "y", "ý": "y", "ỷ": "y", "ỹ": "y", "ỵ": "y",
    "đ": "d",
}


JUNK_WORDS = {"lop", "ten", "ngay", "class", "name", "date", "stt", "diem", "so"}


def is_junk_name(name: str) -> bool:
    """Return True if recognized text is a non-name junk word (e.g. 'Lop', 'Ten')."""
    if not name:
        return True
    cleaned = normalize_name(name)
    return cleaned in JUNK_WORDS or len(cleaned) <= 1


def normalize_name(name: str) -> str:
    """Trim, lowercase, remove Vietnamese tone, collapse spaces. OCR dấu weak -> compare without."""
    if name is None or not isinstance(name, str):
        return ""
    s = " ".join(name.strip().lower().split())
    out = []
    for c in s:
        out.append(VIETNAMESE_MAP.get(c, c))
    return "".join(out)


def get_student_name_variants(full_name: str) -> List[str]:
    """Build comparison variants: full name, first name only, and if first name is 'Anh' then 'tên trước Anh' too.
    Danh sách có thể là họ tên đầy đủ hoặc chỉ tên; học sinh tên Anh cần thêm phần trước Anh để so sánh.
    """
    if not full_name or not isinstance(full_name, str):
        return []
    parts = full_name.strip().split()
    parts = [p.strip() for p in parts if p.strip()]
    if not parts:
        return []
    variants = [full_name.strip()]
    first_name = parts[-1]
    if first_name and first_name not in variants:
        variants.append(first_name)
    if len(parts) >= 2 and first_name.lower() == "anh":
        before_anh = " ".join(parts[-2:])
        if before_anh not in variants:
            variants.append(before_anh)
    return variants


def _recognition_variants(norm_rec: str) -> List[str]:
    """OCR confusions: o/a (e.g. Toom->Toàn). Return [norm_rec, norm_rec with o->a] for max score."""
    if not norm_rec:
        return []
    variants = [norm_rec]
    o_to_a = norm_rec.replace("o", "a")
    if o_to_a != norm_rec and o_to_a not in variants:
        variants.append(o_to_a)
    return variants


def _effective_match_score(
    ratio_score: float,
    partial_score: float,
    token_sort_score: float,
    len_rec: int,
    len_student: int,
    rec_has_digits: bool,
    rec_digit_count: int = 0,
) -> float:
    """
    Kết hợp ratio + partial + token_sort_ratio.
    Token sort xử lý "Nguyễn Văn An" vs "An Nguyễn Văn".
    Short names (<=5 chars): ratio dominates to prevent "Phanh"->"Khánh" via partial_ratio.
    OCR có số => cap; >2 chữ số => coi là nhiễu, giảm mạnh.
    """
    if len_rec <= 5:
        combined = 0.7 * ratio_score + 0.15 * partial_score + 0.15 * token_sort_score
    elif len_rec <= 8:
        combined = 0.5 * ratio_score + 0.25 * partial_score + 0.25 * token_sort_score
    else:
        combined = 0.4 * ratio_score + 0.3 * partial_score + 0.3 * token_sort_score
    if ratio_score < 45 and partial_score > 85:
        combined = min(combined, 78.0)
    if len_rec <= 6 and len_student >= 14:
        combined = min(combined, 80.0)
    if len_rec <= 4 and len_student >= 8:
        combined = min(combined, 75.0)
    if rec_has_digits:
        combined = min(combined, 85.0)
        if rec_digit_count > 2:
            combined = min(combined, 70.0)
        if ratio_score < 40:
            combined = min(combined, 75.0)
    return combined


def _score_rec_against_variants(
    rec_variants: List[str],
    student_variants: List[str],
    rec_has_digits: bool = False,
    rec_digit_count: int = 0,
) -> float:
    best = -1.0
    for r in rec_variants:
        len_rec = len(r)
        for s in student_variants:
            len_s = len(s)
            ratio_score = fuzz.ratio(r, s)
            partial_score = fuzz.partial_ratio(r, s)
            token_sort_score = fuzz.token_sort_ratio(r, s)
            eff = _effective_match_score(
                ratio_score, partial_score, token_sort_score,
                len_rec, len_s, rec_has_digits, rec_digit_count,
            )
            best = max(best, eff)
    return best


def find_best_match(
    recognized_name: str,
    student_names: List[str],
    threshold: int,
    fallback_min_score: Optional[int] = None,
) -> Optional[dict]:
    """
    Find best matching student. Compares against full name, first name only, and for 'Anh' also 'tên trước Anh'.
    Uses normalized text (no dấu) and OCR confusion variants (o/a). Returns matched, index, score, fallback?.
    """
    if not recognized_name or not student_names:
        return None
    norm_rec = normalize_name(recognized_name)
    if not norm_rec:
        return None
    rec_variants = _recognition_variants(norm_rec)
    rec_has_digits = any(c.isdigit() for c in (recognized_name or ""))
    rec_digit_count = sum(1 for c in (recognized_name or "") if c.isdigit())
    best_index = -1
    best_score = -1.0
    for i, student in enumerate(student_names):
        name_vars = get_student_name_variants(student)
        student_norm_vars = [normalize_name(v) for v in name_vars if normalize_name(v)]
        if not student_norm_vars:
            student_norm_vars = [normalize_name(student)]
        score = _score_rec_against_variants(
            rec_variants, student_norm_vars,
            rec_has_digits=rec_has_digits,
            rec_digit_count=rec_digit_count,
        )
        if score > best_score:
            best_score = score
            best_index = i
    if best_index < 0:
        return None
    best_score = round(best_score, 1)
    if best_score >= threshold:
        return {
            "matched": student_names[best_index],
            "index": best_index,
            "score": best_score,
            "fallback": False,
        }
    if fallback_min_score is not None and best_score >= fallback_min_score:
        return {
            "matched": student_names[best_index],
            "index": best_index,
            "score": best_score,
            "fallback": True,
        }
    return None


def _best_score_below_threshold(recognized_name: str, student_names: List[str], threshold: int) -> float:
    """Return best score even if below threshold (for logging). Uses same variant logic as find_best_match."""
    if not recognized_name or not student_names:
        return 0.0
    norm_rec = normalize_name(recognized_name)
    if not norm_rec:
        return 0.0
    rec_variants = _recognition_variants(norm_rec)
    rec_has_digits = any(c.isdigit() for c in (recognized_name or ""))
    rec_digit_count = sum(1 for c in (recognized_name or "") if c.isdigit())
    best = -1.0
    for student in student_names:
        name_vars = get_student_name_variants(student)
        student_norm_vars = [normalize_name(v) for v in name_vars if normalize_name(v)] or [normalize_name(student)]
        score = _score_rec_against_variants(
            rec_variants, student_norm_vars,
            rec_has_digits=rec_has_digits,
            rec_digit_count=rec_digit_count,
        )
        if score > best:
            best = score
    return round(best, 1)


def match_names(
    recognized_names: List[str],
    student_names: List[str],
    threshold: int = 60,
    fallback_min_score: Optional[int] = None,
) -> List[dict]:
    """
    For each recognized name, find best match in student_names.
    Returns list of { recognized, matched, index, score, fallback? }.
    If fallback_min_score is set, when score < threshold but >= fallback_min_score
    we still return that match with fallback=True (tên gần nhất).
    """
    logger.info(
        "match_names called: recognized_count=%s, student_count=%s, threshold=%s, fallback_min_score=%s",
        len(recognized_names),
        len(student_names),
        threshold,
        fallback_min_score,
    )
    if not student_names:
        logger.warning("match_names: student_names is empty, all will be unmatched")
    result = []
    for rec in recognized_names:
        rec = (rec or "").strip()
        best = (
            find_best_match(rec, student_names, threshold, fallback_min_score)
            if rec and not is_junk_name(rec) else None
        )
        if best:
            result.append({
                "recognized": rec,
                "matched": best["matched"],
                "index": best["index"],
                "score": best["score"],
                "fallback": best.get("fallback", False),
            })
        else:
            best_any = _best_score_below_threshold(rec, student_names, threshold) if rec else 0.0
            logger.info(
                "no_match: recognized=%r best_score_below_threshold=%s (threshold=%s)",
                rec,
                best_any,
                threshold,
            )
            result.append({
                "recognized": rec,
                "matched": "",
                "index": -1,
                "score": 0.0,
                "fallback": False,
            })
    matched_count = sum(1 for r in result if r.get("index", -1) >= 0)
    fallback_count = sum(1 for r in result if r.get("fallback"))
    logger.info("match_names result: matched=%s fallback=%s total=%s", matched_count, fallback_count, len(result))
    return result
