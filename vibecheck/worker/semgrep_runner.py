"""
Semgrep subprocess runner for Project VibeCheck.

Runs Semgrep as a subprocess binary (NOT imported as Python package).
Provides:
- run_semgrep(): Execute Semgrep with OWASP, NodeJS, and Secrets rules
- semgrep_to_parsed_nodes(): Convert findings to vulnerability candidates
- Custom taint rule generation for Express.js

Week 3 Implementation.
"""

import json
import logging
import os
import subprocess
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Use isolated semgrep venv binary to avoid dependency conflicts with main project venv
# The isolated venv is at .semgrep-venv in the project root
# Platform-agnostic: Use Scripts/semgrep.exe on Windows, bin/semgrep on Unix
import platform

def _get_default_semgrep_path() -> str:
    """Get the default semgrep binary path based on the platform."""
    venv_dir = Path(__file__).parent.parent.parent / ".semgrep-venv"
    if platform.system() == "Windows":
        return str(venv_dir / "Scripts" / "semgrep.exe")
    else:
        return str(venv_dir / "bin" / "semgrep")

_DEFAULT_SEMGREP = _get_default_semgrep_path()
SEMGREP_BIN = os.environ.get("SEMGREP_BIN", _DEFAULT_SEMGREP)

# Fallback to PATH if isolated venv binary doesn't exist
if not Path(SEMGREP_BIN).exists():
    logger.debug(f"Isolated semgrep not found at {SEMGREP_BIN}, falling back to PATH")
    SEMGREP_BIN = "semgrep"

# Semgrep timeout (seconds)
SEMGREP_TIMEOUT = 120

# Custom taint rule for Express.js - loaded from external file
# Path to the taint rule file (relative to this module)
_TAINT_RULE_PATH = Path(__file__).parent.parent / "rules" / "express-taint.yaml"

def _get_taint_rule_path() -> Path | None:
    """Get the path to the Express.js taint rule file if it exists."""
    if _TAINT_RULE_PATH.exists():
        return _TAINT_RULE_PATH
    logger.debug(f"Taint rule file not found at {_TAINT_RULE_PATH}")
    return None

# Mapping from Semgrep check_id to vulnerability type
CHECK_ID_TO_VULN_TYPE = {
    "sql": "sql_injection",
    "sqli": "sql_injection",
    "xss": "xss",
    "secret": "hardcoded_secret",
    "hardcoded": "hardcoded_secret",
    "path": "path_traversal",
    "traversal": "path_traversal",
    "command": "command_injection",
    "exec": "command_injection",
    "rce": "command_injection",
    "ssrf": "ssrf",
    "redirect": "open_redirect",
    "jwt": "jwt_issue",
    "crypto": "weak_crypto",
    "hash": "weak_crypto",
    "random": "weak_random",
    "eval": "code_injection",
    "deserialize": "insecure_deserialization",
    "prototype": "prototype_pollution",
    "auth": "missing_auth",
    "cors": "cors_misconfiguration",
}

# Mapping from Semgrep severity to our severity
SEVERITY_MAP = {
    "ERROR": "high",
    "WARNING": "medium",
    "INFO": "low",
}

# Test fixture patterns to skip for secrets
TEST_PATTERNS = [
    "test",
    "spec",
    "__tests__",
    "fixture",
    "mock",
    "example",
    "sample",
    "demo",
    ".test.",
    ".spec.",
]


def run_semgrep(repo_path: Path, scan_id: str) -> list[dict[str, Any]]:
    """
    Run Semgrep on a repository and return findings.

    Semgrep is called as a subprocess binary (NOT imported as Python package).
    Runs with:
    - p/owasp-top-ten: OWASP Top 10 security rules
    - p/nodejs: Node.js specific rules
    - p/secrets: Hardcoded secrets detection

    Args:
        repo_path: Path to the repository to scan
        scan_id: Unique scan identifier

    Returns:
        List of raw Semgrep findings
    """
    logger.info("=" * 80)
    logger.info("SEMGREP RUNNER: Starting Semgrep scan")
    logger.info(f"  Repo path: {repo_path}")
    logger.info(f"  Scan ID: {scan_id}")
    logger.info("=" * 80)

    # Get custom taint rule path (if available)
    taint_rule_path = _get_taint_rule_path()
    logger.info(f"  Taint rule path: {taint_rule_path}")

    try:
        # Build Semgrep command using isolated binary
        # Note: --no-git-ignore is required to scan files not tracked by git
        # (e.g., extracted source code, downloaded repos without .git)
        cmd = [
            SEMGREP_BIN,
            "--config", "p/owasp-top-ten",
            "--config", "p/nodejs",
            "--config", "p/secrets",
        ]
        
        # Add custom taint rule if available
        if taint_rule_path:
            cmd.extend(["--config", str(taint_rule_path)])
        
        cmd.extend([
            "--json",
            "--quiet",
            "--no-git-ignore",  # Scan all files, not just git-tracked
            "--timeout", str(60),  # Per-file timeout
            "--max-memory", "1024",  # Memory limit in MB
            str(repo_path),
        ])

        logger.info(f"  Semgrep binary: {SEMGREP_BIN}")
        logger.info(f"  Command: {' '.join(cmd)}")

        # Run Semgrep with UTF-8 encoding to handle special characters in source files
        result = subprocess.run(
            cmd,
            capture_output=True,
            timeout=SEMGREP_TIMEOUT,
            encoding='utf-8',
            errors='replace',  # Replace undecodable bytes instead of crashing
        )

        logger.info(f"  Return code: {result.returncode}")

        # returncode 1 means findings exist (not an error)
        # returncode 0 means no findings
        # returncode > 1 is an error
        if result.returncode > 1:
            logger.error(f"  Semgrep FAILED with returncode {result.returncode}")
            logger.error(f"  stderr: {result.stderr}")
            return []

        # Log stderr for any warnings
        if result.stderr:
            logger.warning(f"  Semgrep stderr: {result.stderr[:500]}...")

        # Parse JSON output
        try:
            output = json.loads(result.stdout)
        except json.JSONDecodeError as e:
            logger.error(f"  Failed to parse Semgrep JSON output: {e}")
            logger.error(f"  stdout (first 500 chars): {result.stdout[:500]}...")
            return []

        findings = output.get("results", [])
        logger.info(f"  Semgrep found {len(findings)} raw findings")
        
        # Log detailed findings for debugging
        if findings:
            logger.info("  SAMPLE FINDINGS (first 5):")
            for i, f in enumerate(findings[:5]):
                check_id = f.get("check_id", "unknown")
                path = f.get("path", "unknown")
                start = f.get("start", {})
                line = start.get("line", 0) if isinstance(start, dict) else 0
                extra = f.get("extra", {})
                message = extra.get("message", "")[:100] if isinstance(extra, dict) else ""
                logger.info(f"    [{i}] {check_id}")
                logger.info(f"        File: {path}:{line}")
                logger.info(f"        Message: {message}...")
        
        # Log errors if any
        errors = output.get("errors", [])
        if errors:
            logger.warning(f"  Semgrep reported {len(errors)} errors:")
            for e in errors[:3]:
                logger.warning(f"    - {e}")

        logger.info("=" * 80)
        return findings

    except subprocess.TimeoutExpired:
        logger.error(f"  Semgrep TIMED OUT after {SEMGREP_TIMEOUT}s")
        return []
    except FileNotFoundError:
        logger.error("  Semgrep binary NOT FOUND. Please install Semgrep: pip install semgrep")
        return []
    except Exception as e:
        logger.error(f"  Semgrep execution FAILED: {e}", exc_info=True)
        return []
    # Note: We do NOT delete the taint rule file - it's a persistent rule file, not a temporary one


def semgrep_to_parsed_nodes(findings: list[dict], scan_id: str) -> list[dict[str, Any]]:
    """
    Convert Semgrep findings to vulnerability candidate records.

    Filters:
    - Skip secret findings if file path contains test/spec/__tests__/fixture/mock

    Maps:
    - check_id to vuln_type
    - severity to our severity scale

    Args:
        findings: List of raw Semgrep findings
        scan_id: Unique scan identifier

    Returns:
        List of vulnerability candidate dictionaries
    """
    candidates = []

    for finding in findings:
        try:
            # Defensive type check - ensure finding is a dict
            if not isinstance(finding, dict):
                logger.warning(f"Skipping non-dict finding: {type(finding)}")
                continue
            
            # Extract fields from finding
            check_id = finding.get("check_id", "")
            path = finding.get("path", "")
            
            # Safely extract line numbers from nested dicts
            start_obj = finding.get("start", {})
            if not isinstance(start_obj, dict):
                start_obj = {}
            start_line = start_obj.get("line", 0)
            
            end_obj = finding.get("end", {})
            if not isinstance(end_obj, dict):
                end_obj = {}
            end_line = end_obj.get("line", 0)
            
            extra = finding.get("extra", {})
            if not isinstance(extra, dict):
                extra = {}
            message = extra.get("message", "")
            severity = extra.get("severity", "INFO")
            code_snippet = extra.get("lines", "")
            fingerprint = finding.get("fingerprint", "")

            # Skip test fixtures for secrets
            if _is_test_fixture(path, check_id):
                logger.debug(f"Skipping test fixture: {path}")
                continue

            # Map check_id to vulnerability type
            vuln_type = _map_check_id_to_vuln_type(check_id)

            # Map severity
            mapped_severity = SEVERITY_MAP.get(severity, "medium")

            # Build candidate record
            candidate = {
                "scan_id": scan_id,
                "detector": "semgrep",
                "rule_id": check_id,
                "vuln_type": vuln_type,
                "severity": mapped_severity,
                "file_path": path,
                "line_start": start_line,
                "line_end": end_line,
                "code_snippet": code_snippet,
                "message": message,
                "fingerprint": fingerprint,
                "needs_llm_verification": True,
                "confirmed": False,
                "confidence": None,
                "verification_reason": None,
            }

            candidates.append(candidate)

        except Exception as e:
            logger.warning(f"Failed to process finding: {e}")
            continue

    logger.info(f"Converted {len(candidates)} Semgrep findings to candidates")
    return candidates


def _is_test_fixture(path: str, check_id: str) -> bool:
    """
    Check if a finding is in a test fixture file.

    Args:
        path: File path
        check_id: Semgrep check ID

    Returns:
        True if this is a test fixture that should be skipped
    """
    # Only skip for secrets
    if "secret" not in check_id.lower():
        return False

    # Check for test patterns in path
    path_lower = path.lower()
    for pattern in TEST_PATTERNS:
        if pattern in path_lower:
            return True

    return False


def _map_check_id_to_vuln_type(check_id: str) -> str:
    """
    Map Semgrep check_id to vulnerability type.

    Args:
        check_id: Semgrep check ID (e.g., "javascript.lang.security.audit.xss")

    Returns:
        Vulnerability type string
    """
    check_id_lower = check_id.lower()

    # Check each pattern
    for pattern, vuln_type in CHECK_ID_TO_VULN_TYPE.items():
        if pattern in check_id_lower:
            return vuln_type

    # Default to security_misconfiguration
    return "security_misconfiguration"


def merge_semgrep_with_n_plus_one(
    semgrep_candidates: list[dict],
    n_plus_one_candidates: list[dict],
) -> list[dict]:
    """
    Merge Semgrep findings with N+1 detection results.

    Deduplicates by file_path and line_start.

    Args:
        semgrep_candidates: Candidates from Semgrep
        n_plus_one_candidates: Candidates from N+1 detection

    Returns:
        Merged list of unique candidates
    """
    seen = set()
    merged = []

    for candidate in semgrep_candidates + n_plus_one_candidates:
        key = (candidate.get("file_path", ""), candidate.get("line_start", 0))
        if key not in seen:
            seen.add(key)
            merged.append(candidate)

    logger.info(
        f"Merged {len(semgrep_candidates)} Semgrep + {len(n_plus_one_candidates)} N+1 "
        f"= {len(merged)} unique candidates"
    )
    return merged
