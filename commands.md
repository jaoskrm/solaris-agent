backend:
python -m api.main
py -m uvicorn api.main:app --host 0.0.0.0 --port 8002 --app-dir vibecheck

python -c "
import redis
r = redis.from_url('redis://localhost:6380')

# How many messages in the stream
length = r.xlen('scan_queue')
print(f'Jobs in scan_queue: {length}')

# Show the latest message
msgs = r.xrevrange('scan_queue', count=3)
for id, data in msgs:
    print(f'  ID: {id}')
    print(f'  Data: {data}')

# Show pending (claimed but not ACKed)
pending = r.xpending('scan_queue', 'scan_workers')
print(f'Pending (stuck): {pending}')
"



python -c "
import redis
r = redis.from_url('redis://localhost:6380')

# ACK all 4 stuck pending messages
stuck_ids = [
    '1772273891633-0'
]
for id in stuck_ids:
    r.xack('scan_queue', 'scan_workers', id)
    print(f'ACKed {id}')

# Delete the entire stream to wipe all 19 jobs
r.delete('scan_queue')
print('Stream deleted - clean slate')
"


Get-WmiObject Win32_Process | Where-Object {$_.CommandLine -like "*scan_worker*"} | Select-Object ProcessId, CommandLine

Stop-Process -Id 15644 -Force



╔══════════════════════════════════════════════════════════════════╗
║            VibeCheck Setup Complete for macOS!                   ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  NEXT STEPS:                                                     ║
║                                                                  ║
║  1. Configure environment:                                       ║
║     nano vibecheck/.env                                          ║
║                                                                  ║
║     Add your:                                                    ║
║     - Supabase URL and Anon Key                                  ║
║     - OpenRouter API Key                                         ║
║                                                                  ║
║  2. Run Supabase migrations:                                     ║
║     Go to Supabase SQL Editor and run:                           ║
║     migrations/001_supabase_schema.sql                           ║
║                                                                  ║
║  3. Start all services:                                          ║
║     cd vibecheck && ./start-all.sh                               ║
║                                                                  ║
║  4. Test the scan:                                               ║
║     ./test-scan.sh https://github.com/juice-shop/juice-shop      ║
║                                                                  ║
║  AVAILABLE COMMANDS:                                             ║
║                                                                  ║
║  ./start-all.sh      - Start all services                        ║
║  ./stop-all.sh       - Stop all services                         ║
║  ./test-scan.sh      - Trigger a test scan                       ║
║  ./verify-setup.py   - Verify installation                       ║
║  docker compose up -d - Start Docker services only               ║
║                                                                  ║
║  ACCESS POINTS:                                                  ║
║                                                                  ║
║  API Server:      http://localhost:8000                          ║
║  API Docs:        http://localhost:8000/docs                     ║
║  FalkorDB:        redis://localhost:6379                         ║
║  Qdrant:          http://localhost:6333                          ║
║  Redis:           redis://localhost:6380                         ║
║  Ollama:          http://localhost:11434                         ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

NOTE FOR macOS:
- Ollama runs as a service via 'brew services'
- Docker Desktop must be kept running
- The setup uses isolated Semgrep venv (.semgrep-venv/bin/semgrep)


pkill -f "scan_worker" 2>/dev/null && echo "✅ All scan workers killed" || echo "ℹ️ No scan workers found running"