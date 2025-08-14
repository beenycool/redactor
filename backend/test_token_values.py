#!/usr/bin/env python3
"""
Test script to verify redaction functionality including confidence thresholds, caching, and restoration
"""

import requests
import json
import time

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

def test_confidence_thresholds():
    """Test confidence threshold functionality"""
    print("\n=== TESTING CONFIDENCE THRESHOLDS ===")
    
    test_text = "John Doe lives at 123 Main Street."
    
    thresholds = [0.1, 0.5, 0.9]
    
    for threshold in thresholds:
        try:
            response = requests.post(
                f"{API_URL}/redact",
                json={"text": test_text, "confidence_threshold": threshold},
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                token_count = len(data['tokens'])
                print(f"Threshold {threshold}: {token_count} tokens detected")
            else:
                print(f"Threshold {threshold}: Error {response.status_code}")
                
        except Exception as e:
            print(f"Threshold {threshold}: Error {e}")

def test_caching_behavior():
    """Test caching behavior"""
    print("\n=== TESTING CACHING BEHAVIOR ===")
    
    test_text = "Alice Johnson works at ABC Corp."
    
    # First request
    start_time = time.time()
    response1 = requests.post(
        f"{API_URL}/redact",
        json={"text": test_text},
        headers={"Content-Type": "application/json"}
    )
    first_request_time = time.time() - start_time
    
    # Second request (should be cached)
    start_time = time.time()
    response2 = requests.post(
        f"{API_URL}/redact",
        json={"text": test_text},
        headers={"Content-Type": "application/json"}
    )
    second_request_time = time.time() - start_time
    
    if response1.status_code == 200 and response2.status_code == 200:
        data1 = response1.json()
        data2 = response2.json()
        
        # Check if results are identical
        if data1['redacted_text'] == data2['redacted_text']:
            print("✓ Caching working: Results are identical")
        else:
            print("✗ Caching not working: Results differ")
        
        print(f"First request: {first_request_time:.3f}s")
        print(f"Second request: {second_request_time:.3f}s")
        
        if second_request_time < first_request_time:
            print("✓ Caching working: Second request faster")
        else:
            print("⚠ Caching may not be working: Second request not faster")
    else:
        print("✗ Error testing caching")

def test_restoration_workflow():
    """Test the restoration workflow"""
    print("\n=== TESTING RESTORATION WORKFLOW ===")
    
    test_text = "Bob Smith lives at 456 Oak Avenue."
    
    try:
        # First, redact the text
        redact_response = requests.post(
            f"{API_URL}/redact",
            json={"text": test_text},
            headers={"Content-Type": "application/json"}
        )
        
        if redact_response.status_code == 200:
            redact_data = redact_response.json()
            print(f"Original text: {test_text}")
            print(f"Redacted text: {redact_data['redacted_text']}")
            
            # Now restore the text
            restore_response = requests.post(
                f"{API_URL}/restore",
                json={
                    "redacted_text": redact_data['redacted_text'],
                    "tokens": redact_data['tokens']
                },
                headers={"Content-Type": "application/json"}
            )
            
            if restore_response.status_code == 200:
                restore_data = restore_response.json()
                print(f"Restored text: {restore_data['restored_text']}")
                
                # Check if restoration worked
                if restore_data['restored_text'] == test_text:
                    print("✓ Restoration working: Text restored correctly")
                else:
                    print("✗ Restoration failed: Text not restored correctly")
            else:
                print(f"Restoration error: {restore_response.status_code}")
                print(restore_response.text)
        else:
            print(f"Redaction error: {redact_response.status_code}")
            print(redact_response.text)
            
    except Exception as e:
        print(f"Error testing restoration: {e}")

def test_error_scenarios():
    """Test error scenarios"""
    print("\n=== TESTING ERROR SCENARIOS ===")
    
    # Test empty text
    try:
        response = requests.post(
            f"{API_URL}/redact",
            json={"text": ""},
            headers={"Content-Type": "application/json"}
        )
        print(f"Empty text: Status {response.status_code}")
    except Exception as e:
        print(f"Empty text: Error {e}")
    
    # Test invalid confidence threshold
    try:
        response = requests.post(
            f"{API_URL}/redact",
            json={"text": "Test", "confidence_threshold": 1.5},
            headers={"Content-Type": "application/json"}
        )
        print(f"Invalid threshold: Status {response.status_code}")
    except Exception as e:
        print(f"Invalid threshold: Error {e}")
    
    # Test very long text
    long_text = "A" * 60000  # Exceeds max_length
    try:
        response = requests.post(
            f"{API_URL}/redact",
            json={"text": long_text},
            headers={"Content-Type": "application/json"}
        )
        print(f"Very long text: Status {response.status_code}")
    except Exception as e:
        print(f"Very long text: Error {e}")

if __name__ == "__main__":
    print("Testing redaction functionality...")
    
    # Run all tests
    test_redaction_tokens()
    test_confidence_thresholds()
    test_caching_behavior()
    test_restoration_workflow()
    test_error_scenarios()
    
    print("\n=== ALL TESTS COMPLETED ===")