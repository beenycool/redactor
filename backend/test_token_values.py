#!/usr/bin/env python3
"""
Test script to verify that redaction tokens have descriptive values
"""

import requests
import json

# API endpoint
API_URL = "http://localhost:8000"

def test_redaction_tokens():
    """Test that redaction returns descriptive token values"""
    
    # Test text with various PII types
    test_text = """
    Bob Smith appeared before Judge Johnson on Case No. 2024-CR-1234.
    His SSN is 123-45-6789 and email is bob@example.com.
    He lives at 123 Main Street, London.
    """
    
    try:
        # Make redaction request
        response = requests.post(
            f"{API_URL}/redact",
            json={"text": test_text},
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            
            print("=== REDACTION RESPONSE ===")
            print(f"Redacted Text: {data['redacted_text']}")
            print("\n=== TOKENS ===")
            
            for token in data['tokens']:
                print(f"Token: {token['token']}")
                print(f"  Type: {token['type']}")
                print(f"  Original: {token['value']}")
                print(f"  Position: {token['start']}-{token['end']}")
                print()
            
            # Check if tokens have descriptive values
            all_descriptive = all(
                token['token'].startswith('<PII_') and token['token'].endswith('>')
                for token in data['tokens']
            )
            
            if all_descriptive:
                print("✓ All tokens have descriptive values!")
            else:
                print("✗ Some tokens don't have descriptive values")
                
        else:
            print(f"Error: {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    print("Testing redaction token values...")
    test_redaction_tokens()