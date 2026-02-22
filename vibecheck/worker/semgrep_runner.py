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
import tempfile
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Use isolated semgrep venv binary to avoid dependency conflicts with main project venv
# The isolated venv is at .semgrep-venv in the project root
_DEFAULT_SEMGREP = str(
    Path(__file__).parent.parent.parent / ".semgrep-venv" / "Scripts" / "semgrep.exe"
)
SEMGREP_BIN = os.environ.get("SEMGREP_BIN", _DEFAULT_SEMGREP)

# Fallback to PATH if isolated venv binary doesn't exist
if not Path(SEMGREP_BIN).exists():
    logger.debug(f"Isolated semgrep not found at {SEMGREP_BIN}, falling back to PATH")
    SEMGREP_BIN = "semgrep"

# Semgrep timeout (seconds)
SEMGREP_TIMEOUT = 120

# Custom taint rule for Express.js
EXPRESS_TAINT_RULE = """
rules:
  - id: express-request-to-sql-sink
    mode: taint
    pattern-sources:
      - pattern: req.params.$X
      - pattern: req.query.$X
      - pattern: req.body.$X
      - pattern: req.headers[$X]
    pattern-sinks:
      - pattern: $DB.query(...)
      - pattern: $MODEL.findAll({ where: $X })
      - pattern: $MODEL.findOne({ where: $X })
      - pattern: sequelize.query(...)
    pattern-sanitizers:
      - pattern: $X.replace(...)
      - pattern: escape($X)
      - pattern: encodeURIComponent($X)
    message: "User input from request flows to database query without proper sanitization"
    severity: ERROR
    languages: [javascript, typescript]
"""

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
    - Custom taint rule for Express.js

    Args:
        repo_path: Path to the repository to scan
        scan_id: Unique scan identifier

    Returns:
        List of raw Semgrep findings
    """
    logger.info(f"Running Semgrep on {repo_path}")

    # Create temporary file for custom taint rule
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".yaml", delete=False
    ) as taint_rule_file:
        taint_rule_file.write(EXPRESS_TAINT_RULE)
        taint_rule_path = taint_rule_file.name

    try:
        # Build Semgrep command using isolated binary
        cmd = [
            SEMGREP_BIN,
            "--config", "p/owasp-top-ten",
            "--config", "p/nodejs",
            "--config", "p/secrets",
            "--config", taint_rule_path,
            "--json",
            "--quiet",
            "--timeout", str(60),  # Per-file timeout
            "--max-memory", "1024",  # Memory limit in MB
            str(repo_path),
        ]

        logger.debug(f"Semgrep command: {' '.join(cmd)}")

        # Run Semgrep
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=SEMGREP_TIMEOUT,
        )

        # returncode 1 means findings exist (not an error)
        # returncode 0 means no findings
        # returncode > 1 is an error
        if result.returncode > 1:
            logger.error(f"Semgrep failed with returncode {result.returncode}")
            logger.error(f"stderr: {result.stderr}")
            return []

        # Parse JSON output
        try:
            output = json.loads(result.stdout)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Semgrep JSON output: {e}")
            return []

        findings = output.get("results", [])
        logger.info(f"Semgrep found {len(findings)} raw findings")

        return findings

    except subprocess.TimeoutExpired:
        logger.error(f"Semgrep timed out after {SEMGREP_TIMEOUT}s")
        return []
    except FileNotFoundError:
        logger.error("Semgrep binary not found. Please install Semgrep: pip install semgrep")
        return []
    except Exception as e:
        logger.error(f"Semgrep execution failed: {e}", exc_info=True)
        return []
    finally:
        # Clean up temporary file
        try:
            Path(taint_rule_path).unlink()
        except Exception:
            pass


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
            # Extract fields from finding
            check_id = finding.get("check_id", "")
            path = finding.get("path", "")
            start_line = finding.get("start", {}).get("line", 0)
            end_line = finding.get("end", {}).get("line", 0)
            extra = finding.get("extra", {})
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
