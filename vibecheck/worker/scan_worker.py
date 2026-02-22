"""
Scan worker for Project VibeCheck.

This is the main worker process that:
1. Subscribes to Redis Stream for scan jobs
2. Clones repositories using GitPython
3. Parses code with Tree-Sitter (Week 2)
4. Builds knowledge graphs in FalkorDB (Week 2)
5. Runs N+1 detection (Week 2)
6. Reports results to Supabase (Week 2)

Week 3 Additions:
- Semgrep static analysis (Stage 5a)
- Semantic lifting with Ollama (Stage 5b)
- LLM verification two-tier (Stage 5c)
- Pattern propagation via Qdrant (Stage 5d)

Week 2 Exit Criteria:
- Worker parses code with Tree-Sitter
- FalkorDB graph populated with nodes/edges
- N+1 detection query returns results
"""

import asyncio
import logging
import os
import shutil
import signal
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import git
from git import Repo, GitCommandError

from core.config import get_settings
from core.parser import CodeParser
from core.falkordb import get_falkordb_client
from core.supabase_client import get_supabase_client
from core.qdrant import QdrantClient
from core.redis_bus import (
    GROUP_SCAN_WORKERS,
    STREAM_SCAN_QUEUE,
    get_redis_bus,
)
from worker.semgrep_runner import run_semgrep, semgrep_to_parsed_nodes
from worker.semantic_lifter import lift_directory
from worker.llm_verifier import verify_candidate, propagate_pattern, embed_with_ollama

# Configure logging with DEBUG level for more visibility
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger(__name__)

# Log immediately to confirm module is loading
logger.info("=== SCAN WORKER MODULE LOADING ===")

settings = get_settings()
logger.info(f"Settings loaded - Redis URL: {settings.redis_url}")


class ScanWorker:
    """
    Worker that processes scan jobs from Redis Stream.
    
    Each scan job:
    1. Clones the repository to a temporary directory
    2. Parses the code structure with Tree-Sitter
    3. Builds a knowledge graph in FalkorDB
    4. Runs N+1 detection query
    5. Week 3: Semgrep static analysis
    6. Week 3: Semantic lifting with Ollama
    7. Week 3: LLM verification (two-tier)
    8. Week 3: Pattern propagation
    9. Reports results to Supabase
    """
    
    def __init__(self, worker_id: str | None = None) -> None:
        """
        Initialize the scan worker.
        
        Args:
            worker_id: Unique worker identifier (auto-generated if not provided)
        """
        logger.debug("ScanWorker.__init__ called")
        self.worker_id = worker_id or f"worker-{uuid4().hex[:8]}"
        self.running = False
        logger.debug(f"Worker ID: {self.worker_id}")
        
        logger.debug("Getting Redis bus instance...")
        self.redis_bus = get_redis_bus()
        logger.debug("Redis bus instance obtained")
        
        self.clone_base_dir = Path(settings.repo_clone_dir)
        logger.debug(f"Clone directory: {self.clone_base_dir}")
        
        # Ensure clone directory exists
        self.clone_base_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize Qdrant client (Week 3)
        self.qdrant_client = QdrantClient()
        logger.debug("Qdrant client initialized")
        logger.debug("Clone directory created/verified")
        
        # Initialize parser
        self.parser = CodeParser()
        logger.debug("CodeParser initialized")
        
        logger.info(f"Scan worker initialized: {self.worker_id}")
    
    async def start(self) -> None:
        """Start the worker and begin processing scan jobs."""
        logger.info(f"Starting scan worker: {self.worker_id}")
        self.running = True
        
        # Connect to Redis
        logger.debug("Attempting to connect to Redis...")
        try:
            await self.redis_bus.connect()
            logger.info("Connected to Redis successfully")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}", exc_info=True)
            raise
        
        # Connect to Qdrant and seed known patterns (Week 3)
        logger.debug("Connecting to Qdrant...")
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self.qdrant_client.connect)
            logger.info("Connected to Qdrant successfully")
            
            # Seed known vulnerable patterns
            await self.qdrant_client.seed_known_patterns(embed_with_ollama)
            logger.info("Seeded known vulnerable patterns")
        except Exception as e:
            logger.error(f"Failed to initialize Qdrant: {e}", exc_info=True)
            # Continue anyway - Qdrant is optional for basic scanning
        
        # Claim any pending messages that have been idle too long (from crashed workers)
        logger.debug("Checking for pending messages to claim...")
        try:
            pending_messages = await self.redis_bus.claim_pending(
                stream_name=STREAM_SCAN_QUEUE,
                group_name=GROUP_SCAN_WORKERS,
                consumer_name=self.worker_id,
                min_idle_time=60000,  # 1 minute
                count=10,
            )
            if pending_messages:
                logger.info(f"Claimed {len(pending_messages)} pending messages")
                for msg in pending_messages:
                    await self.process_message(msg)
        except Exception as e:
            logger.error(f"Error claiming pending messages: {e}", exc_info=True)
        
        # Process messages
        logger.debug(f"Starting consume loop for stream: {STREAM_SCAN_QUEUE}")
        logger.debug(f"Consumer group: {GROUP_SCAN_WORKERS}")
        logger.debug(f"Consumer name: {self.worker_id}")
        
        try:
            iteration = 0
            async for message in self.redis_bus.consume(
                stream_name=STREAM_SCAN_QUEUE,
                group_name=GROUP_SCAN_WORKERS,
                consumer_name=self.worker_id,
                block=5000,  # 5 second timeout
                count=1,
            ):
                iteration += 1
                logger.debug(f"Consume iteration {iteration}, running={self.running}")
                
                if not self.running:
                    logger.info("Worker stopping (running=False)")
                    break
                
                logger.info(f"Received message: {message.get('id', 'unknown')}")
                await self.process_message(message)
                
        except asyncio.CancelledError:
            logger.info("Worker cancelled")
        except Exception as e:
            logger.error(f"Worker error: {e}", exc_info=True)
            raise
    
    async def stop(self) -> None:
        """Stop the worker gracefully."""
        logger.info(f"Stopping scan worker: {self.worker_id}")
        self.running = False
        await self.redis_bus.disconnect()
    
    async def process_message(self, message: dict[str, Any]) -> None:
        """
        Process a single scan job message.
        
        Args:
            message: Message from Redis Stream with id, stream, and data
        """
        msg_id = message["id"]
        data = message["data"]
        
        repo_url = data.get("repo_url")
        triggered_by = data.get("triggered_by", "unknown")
        
        logger.info(f"Processing scan job: {msg_id}")
        logger.info(f"  Repository: {repo_url}")
        logger.info(f"  Triggered by: {triggered_by}")
        
        # Generate scan ID
        scan_id = str(uuid4())
        
        try:
            # Clone the repository
            clone_dir = await self.clone_repository(scan_id, repo_url)
            
            # Parse with Tree-Sitter (Week 2)
            logger.info("Parsing code with Tree-Sitter...")
            loop = asyncio.get_event_loop()
            nodes = await loop.run_in_executor(
                None,
                lambda: self.parser.parse_directory(clone_dir)
            )
            logger.info(f"Parsed {len(nodes)} nodes from {clone_dir}")
            
            # Build FalkorDB graph (Week 2)
            logger.info("Building FalkorDB graph...")
            falkordb = get_falkordb_client()
            graph = await loop.run_in_executor(
                None,
                lambda: falkordb.create_scan_graph(scan_id)
            )
            
            # Batch insert nodes
            await loop.run_in_executor(
                None,
                lambda: falkordb.add_nodes_batch(graph, nodes)
            )
            logger.info("Nodes inserted into graph")
            
            # Create edges
            await loop.run_in_executor(
                None,
                lambda: falkordb.create_edges(graph)
            )
            logger.info("Edges created in graph")
            
            # Run N+1 detection
            logger.info("Running N+1 detection query...")
            n_plus_ones = await loop.run_in_executor(
                None,
                lambda: falkordb.detect_n_plus_1(graph)
            )
            logger.info(f"Found {len(n_plus_ones)} N+1 candidates")
            
            # ========================================
            # Week 3: Semgrep Static Analysis (Stage 5a)
            # ========================================
            logger.info("Running Semgrep static analysis...")
            semgrep_findings = await run_semgrep(str(clone_dir), scan_id)
            logger.info(f"Semgrep found {len(semgrep_findings)} raw findings")
            
            # Convert Semgrep findings to parsed nodes
            semgrep_nodes = semgrep_to_parsed_nodes(semgrep_findings, scan_id)
            logger.info(f"Converted {len(semgrep_nodes)} Semgrep findings to parsed nodes")
            
            # ========================================
            # Week 3: Semantic Lifting (Stage 5b)
            # ========================================
            logger.info("Running semantic lifting...")
            semantic_clone_dir = clone_dir / "semantic_clone"
            semantic_summaries = await lift_directory(
                str(clone_dir),
                nodes,  # All parsed nodes from Tree-Sitter
                str(semantic_clone_dir),
            )
            logger.info(f"Generated {len(semantic_summaries)} semantic summaries")
            
            # Store function summaries in Qdrant for pattern matching
            if semantic_summaries:
                await self._store_function_summaries(semantic_summaries)
            
            # ========================================
            # Week 3: LLM Verification (Stage 5c)
            # ========================================
            all_candidates = []
            
            # Add N+1 candidates for verification
            for candidate in n_plus_ones:
                all_candidates.append({
                    "vuln_type": "n_plus_1",
                    "rule_id": "falkordb-n-plus-1-detection",
                    "code_snippet": candidate.get("code_snippet", ""),
                    "file_path": candidate.get("file", ""),
                    "line_start": candidate.get("line_start", 0),
                    "line_end": candidate.get("line_end", 0),
                    "function_name": candidate.get("function_name", ""),
                    **candidate,
                })
            
            # Add Semgrep findings for verification
            for node in semgrep_nodes:
                all_candidates.append({
                    "vuln_type": node.get("vuln_type", "unknown"),
                    "rule_id": node.get("rule_id", "semgrep"),
                    "code_snippet": node.get("code_snippet", ""),
                    "file_path": node.get("file_path", ""),
                    "line_start": node.get("line_start", 0),
                    "line_end": node.get("line_end", 0),
                    "function_name": node.get("function_name", ""),
                    **node,
                })
            
            logger.info(f"Verifying {len(all_candidates)} vulnerability candidates...")
            verified_vulns = []
            for candidate in all_candidates:
                try:
                    verified = await verify_candidate(candidate)
                    if verified.get("confirmed"):
                        verified_vulns.append(verified)
                        logger.info(f"Confirmed vulnerability: {verified.get('vuln_type')} in {verified.get('file_path')}")
                        
                        # ========================================
                        # Week 3: Pattern Propagation (Stage 5d)
                        # ========================================
                        similar_funcs = await propagate_pattern(
                            verified,
                            self.qdrant_client.client,
                            embed_with_ollama,
                        )
                        if similar_funcs:
                            logger.info(f"Pattern propagation found {len(similar_funcs)} similar functions")
                except Exception as e:
                    logger.warning(f"Failed to verify candidate: {e}")
            
            logger.info(f"Verified {len(verified_vulns)} confirmed vulnerabilities")
            
            # Save all vulnerabilities to Supabase
            if verified_vulns:
                logger.info("Saving verified vulnerabilities to Supabase...")
                supabase = get_supabase_client()
                
                # Convert verified vulnerabilities to records
                vulns = []
                for v in verified_vulns:
                    vuln = {
                        "type": v.get("vuln_type", "unknown"),
                        "severity": self._map_severity(v.get("vuln_type", "unknown")),
                        "title": f"{v.get('vuln_type', 'Unknown')}: {v.get('function_name', '')}",
                        "description": v.get("verification_reason", "LLM-verified vulnerability"),
                        "file_path": v.get("file_path", ""),
                        "line_number": v.get("line_start", 0),
                        "details": v,
                    }
                    vulns.append(vuln)
                
                await supabase.insert_vulnerabilities_batch(scan_id, vulns)
                logger.info(f"Saved {len(vulns)} verified vulnerabilities")
            
            # Print file tree and save report (Week 1 exit criteria - kept for reference)
            report_path = await self.print_file_tree(clone_dir, scan_id, repo_url)
            
            # Acknowledge the message
            await self.redis_bus.ack_message(
                stream_name=STREAM_SCAN_QUEUE,
                group_name=GROUP_SCAN_WORKERS,
                msg_id=msg_id,
            )
            
            logger.info(f"Scan job completed: {scan_id}")
            logger.info(f"Report saved to: {report_path}")
            
        except Exception as e:
            logger.error(f"Failed to process scan job: {e}", exc_info=True)
            # Message will be retried or claimed by another worker
    
    async def clone_repository(self, scan_id: str, repo_url: str) -> Path:
        """
        Clone a repository to a local directory.
        
        Args:
            scan_id: Unique scan identifier
            repo_url: Repository URL to clone
            
        Returns:
            Path to the cloned repository
        """
        # Create unique directory for this scan
        clone_dir = self.clone_base_dir / scan_id
        
        logger.info(f"Cloning repository to: {clone_dir}")
        
        # Remove existing directory if it exists
        if clone_dir.exists():
            shutil.rmtree(clone_dir)
        
        # Clone the repository
        try:
            # Run git clone in a thread pool to not block
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: Repo.clone_from(repo_url, clone_dir, depth=1),
            )
            
            logger.info(f"Repository cloned successfully: {clone_dir}")
            return clone_dir
            
        except GitCommandError as e:
            logger.error(f"Failed to clone repository: {e}")
            raise RuntimeError(f"Failed to clone repository: {e}")
    
    async def print_file_tree(self, repo_path: Path, scan_id: str, repo_url: str, max_depth: int = 3) -> Path:
        """
        Print the file tree of a repository and save to a report file.
        
        This is the Week 1 exit criteria - demonstrates that the worker
        can clone a repo and examine its structure.
        
        Args:
            repo_path: Path to the cloned repository
            scan_id: Unique scan identifier
            repo_url: Repository URL
            max_depth: Maximum depth to traverse
            
        Returns:
            Path to the generated report file
        """
        # Define at method level so it's accessible to both nested function and summary stats
        ignore_patterns = {".git", "__pycache__", "node_modules", ".venv", "venv", ".idea", ".vscode"}
        
        # Create reports directory
        reports_dir = self.clone_base_dir / "reports"
        reports_dir.mkdir(parents=True, exist_ok=True)
        
        # Report file path
        report_path = reports_dir / f"scan_{scan_id}.md"
        
        # Build report content
        report_lines: list[str] = []
        report_lines.append(f"# Scan Report: {repo_path.name}")
        report_lines.append("")
        report_lines.append(f"**Scan ID:** {scan_id}")
        report_lines.append(f"**Repository:** {repo_url}")
        report_lines.append(f"**Timestamp:** {datetime.now(timezone.utc).isoformat()}")
        report_lines.append("")
        report_lines.append("## File Tree")
        report_lines.append("")
        report_lines.append("```")
        
        logger.info("=" * 60)
        logger.info(f"FILE TREE: {repo_path.name}")
        logger.info("=" * 60)
        
        def process_tree(path: Path, prefix: str = "", depth: int = 0) -> None:
            if depth > max_depth:
                return
            
            try:
                entries = sorted(path.iterdir(), key=lambda x: (not x.is_dir(), x.name))
            except PermissionError:
                return
            
            for i, entry in enumerate(entries):
                if entry.name in ignore_patterns:
                    continue
                
                is_last = i == len(entries) - 1
                connector = "    " if is_last else "    "
                
                if entry.is_dir():
                    line = f"{prefix}{'    ' if is_last else '    '}{entry.name}/"
                    logger.info(line)
                    report_lines.append(line)
                    process_tree(entry, prefix + connector, depth + 1)
                else:
                    # Get file size
                    try:
                        size = entry.stat().st_size
                        size_str = self._format_size(size)
                        line = f"{prefix}{'    ' if is_last else '    '}{entry.name} ({size_str})"
                    except OSError:
                        line = f"{prefix}{'    ' if is_last else '    '}{entry.name}"
                    logger.info(line)
                    report_lines.append(line)
        
        # Run in executor to not block
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: process_tree(repo_path),
        )
        
        # Calculate summary statistics
        total_files = sum(1 for _ in repo_path.rglob("*") if _.is_file() and not any(
            p.name in ignore_patterns for p in _.parents
        ))
        total_dirs = sum(1 for _ in repo_path.rglob("*") if _.is_dir() and not any(
            p.name in ignore_patterns for p in _.parents
        ))
        
        logger.info("-" * 60)
        logger.info(f"Total files: {total_files}")
        logger.info(f"Total directories: {total_dirs}")
        logger.info("=" * 60)
        
        # Complete report
        report_lines.append("```")
        report_lines.append("")
        report_lines.append("## Summary")
        report_lines.append("")
        report_lines.append(f"- **Total files:** {total_files}")
        report_lines.append(f"- **Total directories:** {total_dirs}")
        report_lines.append(f"- **Max depth traversed:** {max_depth}")
        report_lines.append("")
        report_lines.append("---")
        report_lines.append("*Generated by VibeCheck MVP Week 2*")
        
        # Write report to file
        report_content = "\n".join(report_lines)
        await loop.run_in_executor(
            None,
            lambda: report_path.write_text(report_content, encoding="utf-8"),
        )
        
        logger.info(f"Report saved to: {report_path}")
        
        return report_path
    
    async def _store_function_summaries(self, summaries: list[dict[str, Any]]) -> None:
        """
        Store function summaries in Qdrant for pattern matching.
        
        Args:
            summaries: List of function summary dicts from semantic lifting
        """
        from qdrant_client.http import models
        
        try:
            for summary in summaries:
                # Get embedding for the summary
                summary_text = summary.get("summary", "")
                if not summary_text:
                    continue
                
                vector = await embed_with_ollama(summary_text)
                
                # Create point for Qdrant
                point = models.PointStruct(
                    id=summary.get("id", str(uuid4())),
                    vector=vector,
                    payload={
                        "file": summary.get("file"),
                        "name": summary.get("name"),
                        "line_start": summary.get("line_start"),
                        "line_end": summary.get("line_end"),
                        "summary": summary_text,
                        "imports": summary.get("imports", []),
                        "endpoints": summary.get("endpoints", []),
                    },
                )
                
                # Upsert to Qdrant
                self.qdrant_client.client.upsert(
                    collection_name="function_summaries",
                    points=[point],
                )
            
            logger.info(f"Stored {len(summaries)} function summaries in Qdrant")
            
        except Exception as e:
            logger.error(f"Failed to store function summaries: {e}")
    
    def _map_severity(self, vuln_type: str) -> str:
        """
        Map vulnerability type to severity level.
        
        Args:
            vuln_type: Type of vulnerability
            
        Returns:
            Severity level string
        """
        severity_map = {
            "sql_injection": "critical",
            "sqli": "critical",
            "xss": "high",
            "cross-site scripting": "high",
            "ssrf": "high",
            "server-side request forgery": "high",
            "hardcoded_secret": "high",
            "hardcoded_jwt": "critical",
            "n_plus_1": "medium",
            "prototype_pollution": "high",
            "path_traversal": "high",
            "command_injection": "critical",
            "code_injection": "critical",
            "open_redirect": "medium",
            "csrf": "medium",
        }
        
        vuln_lower = vuln_type.lower()
        for key, severity in severity_map.items():
            if key in vuln_lower:
                return severity
        
        return "medium"
    
    def _format_size(self, size: int) -> str:
        """Format file size in human-readable format."""
        for unit in ["B", "KB", "MB", "GB"]:
            if size < 1024:
                return f"{size:.1f}{unit}"
            size /= 1024
        return f"{size:.1f}TB"


# Global worker instance
_worker: ScanWorker | None = None


def signal_handler(signum: int, frame: Any) -> None:
    """Handle shutdown signals gracefully."""
    logger.info(f"Received signal {signum}, shutting down...")
    if _worker:
        asyncio.create_task(_worker.stop())


async def main() -> None:
    """Main entry point for the scan worker."""
    global _worker
    
    logger.info("=== MAIN FUNCTION STARTED ===")
    
    # Set up signal handlers
    logger.debug("Setting up signal handlers...")
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    logger.debug("Signal handlers set up")
    
    # Create and start worker
    logger.debug("Creating ScanWorker instance...")
    _worker = ScanWorker()
    logger.debug("ScanWorker instance created")
    
    try:
        logger.info("Calling worker.start()...")
        await _worker.start()
        logger.info("worker.start() returned")
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")
    finally:
        logger.info("Calling worker.stop()...")
        if _worker:
            await _worker.stop()
        logger.info("Worker stopped, exiting...")


if __name__ == "__main__":
    logger.info("Running scan worker as main...")
    asyncio.run(main())