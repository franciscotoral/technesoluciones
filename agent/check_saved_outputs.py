from __future__ import annotations

import json
import os
import re
import sys
from typing import Any


def extract_json_array_block(text: str) -> str | None:
    start = text.find("[")
    if start < 0:
        return None

    depth = 0
    in_string = False
    escape = False

    for index in range(start, len(text)):
        char = text[index]

        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return text[start : index + 1].strip()

    return None


def parse_json_array_local(text: str) -> list[dict[str, Any]]:
    cleaned = text.strip()
    candidates = [cleaned]

    if cleaned.startswith("```"):
        fence_cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE | re.DOTALL).strip()
        candidates.append(fence_cleaned)

    extracted = extract_json_array_block(cleaned)
    if extracted:
        candidates.append(extracted)

    if len(candidates) > 1:
        extracted_from_fence = extract_json_array_block(candidates[1])
        if extracted_from_fence:
            candidates.append(extracted_from_fence)

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, list):
                return [item for item in parsed if isinstance(item, dict)]
        except json.JSONDecodeError:
            continue

    return []


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python agent/check_saved_outputs.py <file-or-dir>")
        return 1

    target = sys.argv[1]
    files: list[str] = []

    if os.path.isdir(target):
        for name in sorted(os.listdir(target)):
            if name.endswith(".txt"):
                files.append(os.path.join(target, name))
    elif os.path.isfile(target):
        files.append(target)
    else:
        print(f"Path not found: {target}")
        return 1

    for path in files:
        with open(path, "r", encoding="utf-8") as file:
            raw = file.read()
        parsed = parse_json_array_local(raw)
        print(f"\nFILE: {path}")
        print(f"PARSED ITEMS: {len(parsed)}")
        if parsed:
            print("FIRST ITEM:")
            print(json.dumps(parsed[0], ensure_ascii=False, indent=2)[:1200])
        else:
            print("FIRST 400 CHARS:")
            print(raw[:400].replace("\n", " "))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
