"""
Robust JSON parsing utilities for LLM output.

This module provides bulletproof parsing with retry/fallback mechanisms
to ensure LangGraph never crashes due to malformed JSON from LLMs.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, TypeVar, Callable

from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

T = TypeVar('T', bound=BaseModel)


# Patterns that indicate the LLM is refusing or erroring
REFUSAL_PATTERNS = [
    r"i cannot",
    r"i can't",
    r"unable to",
    r"not able to",
    r"cannot fulfill",
    r"apologize",
    r"sorry",
    r"error",
    r"failed",
]

# Patterns that indicate JSON-like content that needs extraction
JSON_EXTRACTION_PATTERNS = [
    r'\{[^{}]*\}',  # Simple {}
    r'\[[^\[\]]*\]',  # Simple []
    r'\{.+\}',  # Greedy {}
    r'\[.+\]',  # Greedy []
]


def extract_json_from_text(text: str) -> dict | list | None:
    """
    Extract JSON from potentially messy LLM output.
    
    Tries multiple strategies:
    1. Direct parse
    2. Markdown code block extraction
    3. Regex extraction
    4. Bracket matching
    """
    if not text:
        return None
    
    # Clean the text
    text = text.strip()
    
    # Strategy 1: Direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    
    # Strategy 2: Extract from markdown code blocks
    # ```json ... ``` or ``` ... ```
    code_block_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text, re.IGNORECASE)
    if code_block_match:
        try:
            return json.loads(code_block_match.group(1).strip())
        except json.JSONDecodeError:
            pass
    
    # Strategy 3: Find JSON object in text
    # Look for { ... } pattern
    json_match = re.search(r'(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})', text, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass
    
    # Strategy 4: Look for array
    array_match = re.search(r'(\[[\s\S]*\])', text)
    if array_match:
        try:
            return json.loads(array_match.group(1))
        except json.JSONDecodeError:
            pass
    
    return None


def parse_with_retry(
    text: str,
    schema: type[T] | None = None,
    max_retries: int = 2,
    on_failure: Callable[[str], dict] | None = None,
) -> dict | T | None:
    """
    Parse LLM output with retry mechanism.
    
    Args:
        text: Raw LLM output
        schema: Optional Pydantic model to validate against
        max_retries: Number of retry attempts
        on_failure: Optional callback to generate fixed prompt
        
    Returns:
        Parsed dict or Pydantic model, or None if all strategies fail
    """
    # First attempt
    result = _try_parse(text, schema)
    if result is not None:
        return result
    
    # Retry with cleaning
    for attempt in range(max_retries):
        logger.warning(f"JSON parse failed, attempt {attempt + 1}/{max_retries}")
        
        # Try to fix common issues
        fixed_text = _fix_common_json_issues(text)
        result = _try_parse(fixed_text, schema)
        if result is not None:
            logger.info(f"JSON parse succeeded on attempt {attempt + 1}")
            return result
    
    # Last resort: call the failure callback if provided
    if on_failure:
        logger.warning("All parse attempts failed, calling failure handler")
        return on_failure(text)
    
    return None


def _try_parse(text: str, schema: type[T] | None) -> dict | T | None:
    """Try to parse text as JSON, optionally validating against schema."""
    
    # Check for refusals
    text_lower = text.lower()
    for pattern in REFUSAL_PATTERNS:
        if re.search(pattern, text_lower):
            logger.warning(f"LLM refusal detected: {pattern}")
            return None
    
    # Extract JSON
    parsed = extract_json_from_text(text)
    if parsed is None:
        return None
    
    # Validate against schema if provided
    if schema is not None:
        try:
            if isinstance(parsed, dict):
                return schema(**parsed)
            elif isinstance(parsed, list):
                # For lists, return first dict if schema expects dict
                if parsed and isinstance(parsed[0], dict):
                    return schema(**parsed[0])
        except ValidationError as e:
            logger.warning(f"Schema validation failed: {e}")
            return None
    
    return parsed


def _fix_common_json_issues(text: str) -> str:
    """Fix common JSON formatting issues in LLM output."""
    
    # Remove markdown code block markers
    text = re.sub(r'^```json\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'^```\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'```$', '', text)
    
    # Remove leading/trailing text that might confuse parser
    # Keep only the JSON-like content
    lines = text.split('\n')
    json_lines = []
    in_json = False
    brace_count = 0
    
    for line in lines:
        # Skip empty lines at start
        if not json_lines and not line.strip():
            continue
            
        # Start of JSON
        if '{' in line or '[' in line:
            in_json = True
            
        if in_json:
            json_lines.append(line)
            brace_count += line.count('{') - line.count('}')
            brace_count += line.count('[') - line.count(']')
            
            # End of JSON
            if brace_count == 0 and '{' in ''.join(json_lines):
                break
    
    if json_lines:
        return '\n'.join(json_lines)
    
    return text


async def retry_json_parse(
    llm_call: Callable,
    prompt: str,
    schema: type[T] | None = None,
    max_retries: int = 2,
) -> dict | T | None:
    """
    Call LLM and parse response with retry.
    
    If parsing fails, sends a follow-up prompt asking the LLM to fix the JSON.
    """
    # First call
    response = await llm_call(prompt)
    
    # Try parsing
    result = parse_with_retry(response, schema)
    if result is not None:
        return result
    
    # Retry with fix prompt
    for attempt in range(max_retries):
        fix_prompt = f"""Your previous response was not valid JSON. 
Please respond ONLY with valid JSON, no other text.

Original request: {prompt}

Respond with valid JSON only:"""

        response = await llm_call(fix_prompt)
        result = parse_with_retry(response, schema)
        if result is not None:
            logger.info(f"Retry {attempt + 1} succeeded")
            return result
    
    return None
