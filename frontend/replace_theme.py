import re

files = [
    '/home/gman/Angel-Engine/Swarmfe/solaris-agent/frontend/src/pages/Swarm.tsx',
    '/home/gman/Angel-Engine/Swarmfe/solaris-agent/frontend/src/App.tsx'
]

replacements = [
    (r"#d69a7c", "var(--swarm-accent)"),
    (r"214,\s*154,\s*124", "var(--swarm-accent-rgb)"),
    (r"#1a1a1a", "var(--swarm-bg)"),
    (r"#212121", "var(--swarm-card)")
]

for file_path in files:
    with open(file_path, 'r') as f:
        content = f.read()

    original_content = content
    for pattern, replacement in replacements:
        content = re.sub(pattern, replacement, content)
    
    if content != original_content:
        with open(file_path, 'w') as f:
            f.write(content)
        print(f"Updated {file_path}")
    else:
        print(f"No changes for {file_path}")
