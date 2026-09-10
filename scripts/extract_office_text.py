#!/usr/bin/env python3
"""Extract paragraph/slide text from DOCX and PPTX using only the stdlib."""

from __future__ import annotations

import argparse
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


def extract_docx(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    lines: list[str] = []
    for paragraph in root.findall(".//w:p", ns):
        text = "".join(node.text or "" for node in paragraph.findall(".//w:t", ns)).strip()
        if text:
            lines.append(text)
    return "\n".join(lines)


def extract_pptx(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        slide_names = sorted(
            (name for name in archive.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)),
            key=lambda name: int(re.search(r"(\d+)", Path(name).stem).group(1)),
        )
        sections: list[str] = []
        ns = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}
        for slide_number, name in enumerate(slide_names, start=1):
            root = ET.fromstring(archive.read(name))
            texts = [(node.text or "").strip() for node in root.findall(".//a:t", ns)]
            sections.append(f"=== SLIDE {slide_number} ===\n" + "\n".join(text for text in texts if text))
    return "\n".join(sections)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    suffix = args.input.suffix.lower()
    if suffix == ".docx":
        text = extract_docx(args.input)
    elif suffix == ".pptx":
        text = extract_pptx(args.input)
    else:
        raise SystemExit(f"Unsupported extension: {suffix}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
