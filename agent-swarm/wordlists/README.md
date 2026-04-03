# Wordlists

Structured wordlists for the Solaris-Agent swarm. Symlinked from external repos (SecLists, PayloadsAllTheThings) to avoid duplication.

## Structure

```
wordlists/
├── INDEX.json           # Auto-generated index
├── README.md
│
├── recon/               # Directory/file/subdomain discovery
│   ├── directories/
│   │   ├── raft-large-directories.txt   # 62K dirs
│   │   ├── raft-medium-directories.txt  # 30K dirs
│   │   └── raft-small-directories.txt   # 20K dirs
│   └── subdomains/
│       └── top1mil.txt                  # Combined subdomain list
│
├── exploit/             # Payload/attack wordlists
│   ├── sql_injection/
│   │   ├── Auth_Bypass.txt             # 79 auth bypass payloads
│   │   ├── Auth_Bypass2.txt            # 122 additional bypasses
│   │   ├── Generic_UnionSelect.txt
│   │   ├── Generic_ErrorBased.txt
│   │   ├── Generic_TimeBased.txt
│   │   ├── FUZZDB_MySQL.txt
│   │   ├── FUZZDB_MSSQL.txt
│   │   ├── FUZZDB_Oracle.txt
│   │   └── SQLi_Polyglots.txt
│   ├── xss/
│   │   ├── 1 - XSS Filter Bypass.md
│   │   ├── 2 - XSS Polyglot.md
│   │   ├── 3 - XSS Common WAF Bypass.md
│   │   ├── 4 - CSP Bypass.md
│   │   ├── 5 - XSS in Angular.md
│   │   └── Polyglots.txt
│   ├── command_injection/
│   │   └── commix.txt                  # 8K+ command injection payloads
│   └── jwt/
│       ├── jwt.secrets.list
│       └── JWT_sample.txt
│
├── fuzzing/             # General fuzzing vectors
│   ├── naughty_strings.txt              # 699 fuzz strings
│   ├── char.txt
│   ├── alphanum.txt
│   └── uri_hex.txt
│
└── post/                # Post-exploitation enumeration
    ├── linux_enum.txt
    └── passwords_top.txt
```

## Usage

```typescript
import { loadWordlistIndex } from './src/utils/wordlist-index';

const index = await loadWordlistIndex();
// Find wordlist by stage and type
const sqliBypass = index.stages.exploit.sql_injection.Auth_Bypass;
```

## Sources

- **SecLists** - https://github.com/danielmiessler/SecLists
- **PayloadsAllTheThings** - https://github.com/swisskyrepo/PayloadsAllTheThings

## Building Index

```bash
bun run scripts/build-wordlist-index.ts
```
