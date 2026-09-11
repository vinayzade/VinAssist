"""
Text cleaning and chunking for retrieval.

Cleaning targets OCR/PDF artefacts: hyphenated line breaks, hard-wrapped
lines, runs of whitespace, form feeds. Chunking is paragraph-aware and
sentence-aligned with a small overlap so an answer that straddles a boundary
is still retrievable. Token counts are estimated (chars / 4), which is
close enough for sizing English text without a tokenizer dependency.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_HYPHEN_BREAK = re.compile(r"(\w)-\n(\w)")
_SOFT_BREAK = re.compile(r"(?<![.!?:;\n])\n(?!\n)")  # single newline inside a paragraph
_MULTI_SPACE = re.compile(r"[ \t\f\v]+")
_MULTI_BLANK = re.compile(r"\n{3,}")
_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(\[])")
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


@dataclass(frozen=True)
class Chunk:
    index: int
    text: str
    start: int
    end: int

    @property
    def token_count(self) -> int:
        return estimate_tokens(self.text)


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def clean_text(raw: str) -> str:
    """Normalises whitespace and joins wrapped lines without changing words."""
    text = raw.replace("\r\n", "\n").replace("\r", "\n")
    text = _CONTROL.sub(" ", text)
    text = _HYPHEN_BREAK.sub(r"\1\2", text)
    text = _MULTI_SPACE.sub(" ", text)
    text = "\n".join(line.strip() for line in text.split("\n"))
    text = _SOFT_BREAK.sub(" ", text)
    text = _MULTI_BLANK.sub("\n\n", text)
    return text.strip()


def split_sentences(paragraph: str) -> list[str]:
    parts = [p.strip() for p in _SENTENCE.split(paragraph) if p.strip()]
    return parts or ([paragraph.strip()] if paragraph.strip() else [])


def chunk_text(
    text: str, *, max_tokens: int = 300, overlap_tokens: int = 40, min_tokens: int = 20
) -> list[Chunk]:
    """
    Splits cleaned text into chunks of at most `max_tokens` (estimated),
    never cutting inside a sentence unless a single sentence is oversized.
    Consecutive chunks overlap by roughly `overlap_tokens` worth of trailing
    sentences. Offsets refer to `text`.
    """
    if not text.strip():
        return []

    # Sentences with their absolute offsets in `text`.
    units: list[tuple[str, int, int]] = []
    cursor = 0
    for paragraph in text.split("\n\n"):
        start_para = text.find(paragraph, cursor)
        if start_para < 0:
            start_para = cursor
        for sentence in split_sentences(paragraph):
            start = text.find(sentence, start_para)
            if start < 0:
                start = start_para
            end = start + len(sentence)
            # Oversized sentences are hard-split on word boundaries.
            if estimate_tokens(sentence) > max_tokens:
                units.extend(_hard_split(sentence, start, max_tokens))
            else:
                units.append((sentence, start, end))
            start_para = end
        cursor = start_para

    chunks: list[Chunk] = []
    current: list[tuple[str, int, int]] = []
    current_tokens = 0

    def flush() -> None:
        if not current:
            return
        start = current[0][1]
        end = current[-1][2]
        chunks.append(Chunk(index=len(chunks), text=text[start:end].strip(), start=start, end=end))

    for unit in units:
        tokens = estimate_tokens(unit[0])
        if current and current_tokens + tokens > max_tokens:
            flush()
            # Carry trailing sentences forward as overlap. The last sentence is
            # always carried when it fits in half a chunk, so consecutive chunks
            # share context even when sentences are longer than the budget.
            carried: list[tuple[str, int, int]] = []
            carried_tokens = 0
            for prev in reversed(current):
                t = estimate_tokens(prev[0])
                if carried and carried_tokens + t > overlap_tokens:
                    break
                if not carried and t > max_tokens // 2:
                    break
                carried.insert(0, prev)
                carried_tokens += t
            current = carried
            current_tokens = carried_tokens
        current.append(unit)
        current_tokens += tokens
    flush()

    # Merge a tiny tail chunk into its predecessor rather than emitting noise.
    if len(chunks) >= 2 and chunks[-1].token_count < min_tokens:
        last = chunks.pop()
        prev = chunks.pop()
        merged_text = text[prev.start : last.end].strip()
        chunks.append(Chunk(index=prev.index, text=merged_text, start=prev.start, end=last.end))
    return chunks


def _hard_split(sentence: str, start: int, max_tokens: int) -> list[tuple[str, int, int]]:
    max_chars = max_tokens * 4
    out: list[tuple[str, int, int]] = []
    offset = 0
    while offset < len(sentence):
        window = sentence[offset : offset + max_chars]
        if offset + max_chars < len(sentence):
            cut = window.rfind(" ")
            if cut > max_chars // 2:
                window = window[:cut]
        piece = window.strip()
        if piece:
            piece_start = start + offset + (len(window) - len(window.lstrip()))
            out.append((piece, piece_start, piece_start + len(piece)))
        offset += max(1, len(window))
    return out
