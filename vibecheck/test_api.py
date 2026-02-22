"""Test script for VibeCheck API."""
import httpx
import asyncio

async def test_scan_trigger():
    """Test the scan trigger endpoint."""
    async with httpx.AsyncClient() as client:
        # Test health endpoint
        print("Testing /health endpoint...")
        response = await client.get("http://localhost:8000/health")
        print(f"Health: {response.json()}")
        print()
        
        # Test scan trigger
        print("Testing /scan/trigger endpoint...")
        response = await client.post(
            "http://localhost:8000/scan/trigger",
            json={"repo_url": "https://github.com/juice-shop/juice-shop"},
        )
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        print()
        
        return response.json()

if __name__ == "__main__":
    asyncio.run(test_scan_trigger())