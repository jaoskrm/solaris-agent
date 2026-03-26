#!/bin/bash
# OpenCode MCP Setup - OPTIMIZED v9.6 (14 enabled for Grok 4.1 Fast)
# chmod +x setup-mcp.sh && ./setup-mcp.sh

echo "📦 Checking and installing npm packages..."
export PUPPETEER_SKIP_DOWNLOAD=true

install_if_missing() {
  local pkg=$1
  if npm list -g "$pkg" --depth=0 &>/dev/null; then
    echo "  ✓ $pkg already installed, skipping"
  else
    echo "  ↓ Installing $pkg..."
    npm install -g "$pkg"
  fi
}

install_if_missing "@modelcontextprotocol/server-filesystem"
install_if_missing "@modelcontextprotocol/server-memory"
install_if_missing "@modelcontextprotocol/server-sequential-thinking"
install_if_missing "repomix"
install_if_missing "@upstash/context7-mcp"
install_if_missing "tailwindcss-mcp-server"
install_if_missing "@sherifbutt/shadcn-ui-mcp-server"
install_if_missing "@r-mcp/static-analysis"
install_if_missing "code-auditor-mcp"
install_if_missing "@notprolands/ast-grep-mcp"
install_if_missing "@eslint/mcp"
install_if_missing "fetcher-mcp"
install_if_missing "@mseep/git-mcp-server"
install_if_missing "@_davideast/stitch-mcp"

echo ""
echo "🔑 Enter your Stitch API Key (stitch.withgoogle.com → Settings → API Keys):"
read -r STITCH_API_KEY

echo ""
echo "🔑 Enter your Supabase Personal Access Token"
echo "   (supabase.com/dashboard/account/tokens → Generate new token)"
read -r SUPABASE_ACCESS_TOKEN

echo ""
echo "🔑 Enter your Supabase Project Ref (optional, press Enter to skip)"
echo "   (Project Settings → General → Reference ID)"
read -r PROJECT_REF

# Build Supabase MCP URL with optional project_ref
if [ -n "$PROJECT_REF" ]; then
  SUPABASE_MCP_URL="https://mcp.supabase.com/mcp?project_ref=$PROJECT_REF"
else
  SUPABASE_MCP_URL="https://mcp.supabase.com/mcp"
fi

echo ""
echo "📝 Checking OpenCode config..."
CONFIG_DIR="$HOME/.config/opencode"
CONFIG_FILE="$CONFIG_DIR/config.json"
mkdir -p "$CONFIG_DIR"

if [ -f "$CONFIG_FILE" ]; then
  echo "  ⚠️  Existing config backed up to config.json.bak..."
  cp "$CONFIG_FILE" "$CONFIG_FILE.bak"
fi

echo "  → Writing optimized config (14 MCPs for Grok stability)..."
cat > "$CONFIG_FILE" << EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "mcp": {
    "filesystem": {
      "type": "local",
      "enabled": true,
      "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "."]
    },
    "memory": {
      "type": "local",
      "enabled": true,
      "command": ["npx", "-y", "@modelcontextprotocol/server-memory"]
    },
    "sequential-thinking": {
      "type": "local",
      "enabled": true,
      "command": ["npx", "-y", "@modelcontextprotocol/server-sequential-thinking"]
    },
    "fetch": {
      "type": "local",
      "enabled": true,
      "command": ["npx", "-y", "fetcher-mcp"]
    },
    "git": {
      "type": "local",
      "enabled": true,
      "command": ["npx", "-y", "@mseep/git-mcp-server"]
    },
    "repomix": {
      "type": "local",
      "enabled": true,
      "command": ["npx", "-y", "repomix", "--mcp"]
    },
    "context7": {
      "type": "local",
      "enabled": true,
      "command": ["npx", "-y", "@upstash/context7-mcp@latest"]
    },
    "eslint": {
      "type": "local",
      "enabled": true,
      "command": ["npx", "-y", "@eslint/mcp@latest"]
    },
    "ts-morph": {
      "type": "local",
      "enabled": true,
      "command": ["npx", "-y", "@r-mcp/static-analysis"]
    },
    "code-auditor": {
      "type": "local",
      "enabled": true,
      "command": ["npx", "-y", "code-auditor-mcp"]
    },
    "ast-grep": {
      "type": "local",
      "enabled": true,
      "command": ["npx", "-y", "@notprolands/ast-grep-mcp"]
    },
    "tailwind": {
      "type": "local",
      "enabled": true,
      "command": ["npx", "-y", "tailwindcss-mcp-server"]
    },
    "shadcn": {
      "type": "local",
      "enabled": true,
      "command": ["npx", "-y", "@sherifbutt/shadcn-ui-mcp-server"]
    },
    "stitch": {
      "type": "remote",
      "enabled": true,
      "url": "https://stitch.googleapis.com/mcp",
      "headers": {
        "X-Goog-Api-Key": "$STITCH_API_KEY"
      }
    },
    "supabase": {
      "type": "remote",
      "enabled": true,
      "url": "$SUPABASE_MCP_URL",
      "headers": {
        "Authorization": "Bearer $SUPABASE_ACCESS_TOKEN"
      }
    }
  }
}
EOF

echo ""
echo "✅ Done! 15 MCPs configured (14 local + 2 remote)"
echo "🚫 Disabled/Removed: playwright, desktop-commander, postgres"
echo "💾 Backup: config.json.bak"
echo "🔄 Run: opencode mcp restart"
echo "📋 Verify: opencode mcp list"
cmd.exe /c "opencode mcp list" 2>/dev/null || echo "  ℹ️  Run 'opencode mcp list' in PowerShell to verify"