"""Prompt templates for Qwen2-VL handwriting recognition and name matching."""


def ocr_prompt(language: str = "vi") -> str:
    """Prompt for reading handwritten text from an image (no student list)."""
    if language == "vi":
        return (
            "This image contains a handwritten Vietnamese person's name on paper. "
            "Read every character carefully, including the family name (họ), middle name (tên đệm), and given name (tên). "
            "Do NOT abbreviate or summarize. Write the COMPLETE full name exactly as written. "
            "If any characters are unclear, make your best guess. "
            "Output only the full name, nothing else."
        )
    return (
        "Read the handwritten text in this image character by character. "
        "Output the complete text exactly as written, nothing else."
    )


def ocr_match_prompt(student_names: list[str], language: str = "vi") -> str:
    """
    Prompt for reading handwritten text AND matching against a known student list.
    The VLM narrows its guess to real names from the list (in-context learning).
    """
    names_numbered = "\n".join(f"{i+1}. {name}" for i, name in enumerate(student_names))
    if language == "vi":
        return (
            "This image contains a handwritten Vietnamese student name on paper.\n"
            "Step 1: Read every character carefully — family name (họ), middle name (tên đệm), and given name (tên). "
            "If the writing is abbreviated (e.g. 'Q.Huy' for 'Quốc Huy') or unclear, note what you see.\n"
            "Step 2: Match what you read against this student list:\n"
            f"{names_numbered}\n\n"
            "If the handwriting is abbreviated or partially illegible, use the student list to infer the most likely full name. "
            "For example, 'P.Anh' could be 'Phương Anh' if that name is in the list.\n"
            "Output ONLY the matched full name from the list, exactly as written in the list. Nothing else."
        )
    return (
        "This image contains a handwritten student name.\n"
        "Read the name carefully, then match it against this list:\n"
        f"{names_numbered}\n\n"
        "Output ONLY the matched full name from the list. Nothing else."
    )
