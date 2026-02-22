#!/usr/bin/env python
"""Test script for the Tree-Sitter parser."""

import sys
from pathlib import Path

# Add vibecheck to path
sys.path.insert(0, str(Path(__file__).parent))

from core.parser import CodeParser


def main():
    """Test the parser on Juice Shop files."""
    parser = CodeParser()
    
    # Find Juice Shop source directory
    juice_shop_dir = Path(__file__).parent.parent / "vibecoded-test-app" / "targets" / "juice-shop-source"
    
    if not juice_shop_dir.exists():
        print(f"Juice Shop directory not found: {juice_shop_dir}")
        return 1
    
    print(f"Juice Shop directory: {juice_shop_dir}")
    
    # Test on server.ts (main file)
    server_file = juice_shop_dir / "server.ts"
    if server_file.exists():
        print(f"\n=== Parsing {server_file.name} ===")
        nodes = parser.parse_file(server_file)
        print(f"Total nodes: {len(nodes)}")
        
        # Count by type
        from collections import Counter
        types = Counter(n.node_type for n in nodes)
        for t, count in types.most_common():
            print(f"  {t}: {count}")
        
        # Show first few endpoints
        endpoints = [n for n in nodes if n.node_type == "Endpoint"][:10]
        print(f"\nFirst 10 endpoints:")
        for e in endpoints:
            print(f"  {e.name} (line {e.line_start})")
        
        # Show loops
        loops = [n for n in nodes if n.node_type == "Loop"][:5]
        print(f"\nFirst 5 loops:")
        for l in loops:
            print(f"  {l.properties.get('type', 'unknown')} at line {l.line_start} (dynamic={l.properties.get('is_dynamic', False)})")
        
        # Show ORM calls
        orm_calls = [n for n in nodes if n.node_type == "ORMCall"][:5]
        print(f"\nFirst 5 ORM calls:")
        for o in orm_calls:
            print(f"  {o.name} at line {o.line_start}")
    else:
        print(f"server.ts not found: {server_file}")
    
    # Test on app.ts
    app_file = juice_shop_dir / "app.ts"
    if app_file.exists():
        print(f"\n=== Parsing {app_file.name} ===")
        nodes = parser.parse_file(app_file)
        print(f"Total nodes: {len(nodes)}")
        
        from collections import Counter
        types = Counter(n.node_type for n in nodes)
        for t, count in types.most_common():
            print(f"  {t}: {count}")
    
    # Test on a data file
    data_file = juice_shop_dir / "data" / "datacreator.ts"
    if data_file.exists():
        print(f"\n=== Parsing {data_file.name} ===")
        nodes = parser.parse_file(data_file)
        print(f"Total nodes: {len(nodes)}")
        
        from collections import Counter
        types = Counter(n.node_type for n in nodes)
        for t, count in types.most_common():
            print(f"  {t}: {count}")
    
    print("\n=== Parser test complete ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())