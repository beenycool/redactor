"""
Google Colab Script for PII Double-Checking with Qwen/Qwen3-4B-Thinking-2507

This script uses the Qwen3-4B-Thinking model to double-check PII redaction results
from your redactor application. It can be run in Google Colab for additional validation.

Usage:
1. Upload this script to Google Colab
2. Run the installation cells
3. Use the validation functions to check your redaction results
"""

# Cell 1: Install required packages
def install_requirements():
    """Install required packages in Colab environment"""
    import subprocess
    import sys

    # Force reinstall bitsandbytes to resolve quantization issues
    print("📦 Force reinstalling bitsandbytes for quantization compatibility...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "uninstall", "-y", "bitsandbytes"])
        subprocess.check_call([sys.executable, "-m", "pip", "install", "--no-cache-dir", "bitsandbytes"])
        print("✓ Force reinstalled bitsandbytes")
    except subprocess.CalledProcessError as e:
        print(f"⚠️ Failed to reinstall bitsandbytes: {e}")
        
    # Also ensure we have the latest transformers
    print("📦 Updating transformers...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-U", "--no-cache-dir", "transformers"])
        print("✓ Updated transformers")
    except subprocess.CalledProcessError as e:
        print(f"⚠️ Failed to update transformers: {e}")

    packages = [
        "transformers>=4.36.0",
        "torch>=2.0.0",
        "accelerate>=0.24.0",
        "datasets>=2.14.0",
        "requests>=2.31.0",
        "pyngrok>=7.0.0",
        "flask>=2.3.0",
        "flask-cors>=4.0.0"
    ]

    for package in packages:
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", package])
            print(f"✓ Installed {package}")
        except subprocess.CalledProcessError as e:
            print(f"✗ Failed to install {package}: {e}")

# Cell 2: Import libraries and setup
import json
import re
import torch
import os
import requests
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from typing import List, Dict, Any, Tuple
import warnings
warnings.filterwarnings("ignore")

# Ngrok setup functions
def setup_ngrok_tunnel(port: int = 3000, auth_token: str = None):
    """Create ngrok tunnel for your frontend"""
    try:
        from pyngrok import ngrok

        # Use the hardcoded token or the provided auth_token
        token_to_use = auth_token or '2yK681gpNjRYbPbXX2aChPFHXGc_GHciwTfSC3GDB1RycjXS'

        if token_to_use:
            ngrok.set_auth_token(token_to_use)
            print("✓ Using ngrok auth token")
        else:
            print("⚠️ No ngrok auth token found")
            print("   Get one from: https://dashboard.ngrok.com/get-started/your-authtoken")
            print("   Then set it: setup_ngrok_tunnel(port=3000, auth_token='your_token') or via environment variable NGROK_AUTH_TOKEN")
            return None

        # Create tunnel to your frontend port
        print(f"🚀 Creating ngrok tunnel to localhost:{port}")
        tunnel = ngrok.connect(port)
        public_url = tunnel.public_url

        print(f"✅ Ngrok tunnel created!")
        print(f"🌐 Public URL: {public_url}")
        print(f"📱 Local URL: http://localhost:{port}")

        return public_url

    except ImportError:
        print("⚠️ pyngrok not installed. Run install_requirements() first.")
        return None
    except Exception as e:
        print(f"❌ Failed to create ngrok tunnel: {e}")
        return None

def get_ngrok_url():
    """Get the current ngrok tunnel URL"""
    try:
        from pyngrok import ngrok
        tunnels = ngrok.get_tunnels()
        if tunnels:
            return tunnels[0].public_url
        else:
            print("⚠️ No active ngrok tunnels found")
            return None
    except ImportError:
        print("⚠️ pyngrok not installed")
        return None

def stop_ngrok_tunnel():
    """Stop all ngrok tunnels"""
    try:
        from pyngrok import ngrok
        ngrok.disconnect_all()
        print("✅ All ngrok tunnels stopped")
    except ImportError:
        print("⚠️ pyngrok not installed")
    except Exception as e:
        print(f"❌ Error stopping tunnels: {e}")

# Frontend integration for your redactor app
class FrontendIntegration:
    """Helper for integrating with your frontend through ngrok"""

    def __init__(self, frontend_port: int = 3000, backend_port: int = 8000):
        """
        Initialize frontend integration

        Args:
            frontend_port: Port your frontend runs on (default: 3000)
            backend_port: Port your backend API runs on (default: 8000)
        """
        self.frontend_port = frontend_port
        self.backend_port = backend_port
        self.frontend_url = None
        self.backend_url = None

    def start_frontend_tunnel(self, auth_token: str = None):
        """Start ngrok tunnel for frontend"""
        self.frontend_url = setup_ngrok_tunnel(self.frontend_port, auth_token)
        return self.frontend_url

    def start_backend_tunnel(self, auth_token: str = None):
        """Start ngrok tunnel for backend API"""
        self.backend_url = setup_ngrok_tunnel(self.backend_port, auth_token)
        return self.backend_url

    def get_frontend_url(self):
        """Get the frontend ngrok URL"""
        return self.frontend_url or get_ngrok_url()

    def display_urls(self):
        """Display all active URLs"""
        print("🌐 Your Redactor App URLs:")
        print("=" * 30)
        if self.frontend_url:
            print(f"Frontend (Public): {self.frontend_url}")
            print(f"Frontend (Local):  http://localhost:{self.frontend_port}")
        if self.backend_url:
            print(f"Backend (Public):  {self.backend_url}")
            print(f"Backend (Local):   http://localhost:{self.backend_port}")
        print("\n💡 Share the public frontend URL to let others test your redactor!")

# API Client for testing backend directly
class RedactorAPIClient:
    """Client for testing your backend API directly"""

    def __init__(self, backend_url: str = None, backend_port: int = 8000):
        """
        Initialize API client

        Args:
            backend_url: Backend URL (ngrok tunnel or localhost)
            backend_port: Backend port if using localhost
        """
        if backend_url:
            self.api_url = backend_url
        else:
            # Try ngrok URL first, fallback to localhost
            ngrok_url = get_ngrok_url()
            self.api_url = ngrok_url or f"http://localhost:{backend_port}"

        print(f"🔗 API Client configured for: {self.api_url}")

    def redact_text(self, text: str, confidence_threshold: float = 0.5) -> Dict[str, Any]:
        """Call your backend API to redact text"""
        endpoint = f"{self.api_url.rstrip('/')}/redact"

        payload = {
            "text": text,
            "confidence_threshold": confidence_threshold
        }

        try:
            response = requests.post(endpoint, json=payload, timeout=30)
            response.raise_for_status()

            result = response.json()
            print(f"✓ Successfully redacted text via backend API")

            return {
                "original": text,
                "redacted": result.get("redacted_text", ""),
                "mappings": result.get("token_mappings", [])
            }

        except requests.RequestException as e:
            print(f"✗ Backend API request failed: {e}")
            raise

    def test_connection(self) -> bool:
        """Test connection to backend API"""
        try:
            test_response = self.redact_text("test")
            print("✓ Backend API connection successful")
            return True
        except Exception as e:
            print(f"✗ Backend API connection failed: {e}")
            return False

# Cell 3: Model initialization
class QwenPIIChecker:
    """
    Uses Qwen3-4B-Thinking model to double-check PII redaction results
    """

    def __init__(self, model_name: str = "Qwen/Qwen3-4B-Thinking-2507"):
        """Initialize the Qwen model for PII checking"""
        print(f"Loading {model_name}...")

        # Load tokenizer
        self.tokenizer = AutoTokenizer.from_pretrained(
            model_name,
            trust_remote_code=True,
            padding_side="left"
        )

        # Try loading with quantization first, fallback to no quantization
        try:
            # Configure 8-bit quantization for memory efficiency
            quantization_config = BitsAndBytesConfig(
                load_in_8bit=True,
                llm_int8_threshold=6.0,
                llm_int8_has_fp16_weight=False
            )

            # Load model with quantization
            self.model = AutoModelForCausalLM.from_pretrained(
                model_name,
                torch_dtype=torch.float16,
                device_map="auto",
                quantization_config=quantization_config
            )
            print("✓ Model loaded with 8-bit quantization!")
            
        except Exception as quantization_error:
            print(f"⚠️ Quantization failed: {quantization_error}")
            print("🔄 Trying to load without quantization...")
            
            try:
                # Fallback: Load without quantization
                self.model = AutoModelForCausalLM.from_pretrained(
                    model_name,
                    torch_dtype=torch.float16,
                    device_map="auto"
                )
                print("✓ Model loaded without quantization!")
                
            except Exception as fallback_error:
                print(f"❌ Failed to load model even without quantization: {fallback_error}")
                raise fallback_error

        # Set pad token if not set
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

        print("✓ Model initialization complete!")

    def analyze_text_for_pii(self, text: str, max_length: int = 1024) -> Dict[str, Any]:
        """
        Analyze text for potential PII using Qwen model

        Args:
            text: Text to analyze
            max_length: Maximum token length for analysis

        Returns:
            Dictionary with analysis results
        """

        prompt = f"""<|im_start|>system
You are an expert at identifying personally identifiable information (PII) in text. Your task is to carefully analyze the given text and identify any PII that might be present.

Types of PII to look for:
- Names (first names, last names, full names)
- Email addresses
- Phone numbers
- Addresses (street, city, postal codes)
- Social Security Numbers
- Driver's License numbers
- Credit card numbers
- Bank account numbers
- Date of birth
- Medical record numbers
- Employee IDs
- Case numbers
- Badge numbers
- National insurance numbers
- Vehicle registration numbers
- Any other identifying information

Please analyze the text and respond with a JSON object containing:
1. "pii_found": boolean - whether any PII was detected
2. "pii_items": list of objects with "type", "value", "start_pos", "end_pos", "confidence"
3. "analysis": string - brief explanation of your findings
4. "risk_level": "low", "medium", or "high" based on sensitivity of found PII

Be thorough but conservative - only flag items you are confident are PII.
<|im_end|>
<|im_start|>user
Please analyze this text for PII:

{text}
<|im_end|>
<|im_start|>assistant
"""

        # Tokenize and generate
        inputs = self.tokenizer(
            prompt,
            return_tensors="pt",
            truncation=True,
            max_length=max_length,
            padding=True
        )

        # Generate response
        with torch.no_grad():
            outputs = self.model.generate(
                inputs.input_ids,
                attention_mask=inputs.attention_mask,
                max_new_tokens=512,
                temperature=0.1,
                do_sample=True,
                pad_token_id=self.tokenizer.pad_token_id,
                eos_token_id=self.tokenizer.eos_token_id
            )

        # Decode response
        full_response = self.tokenizer.decode(outputs[0], skip_special_tokens=True)

        # Extract the assistant's response
        response_start = full_response.find("<|im_start|>assistant\n") + len("<|im_start|>assistant\n")
        if response_start > len("<|im_start|>assistant\n") - 1:
            response = full_response[response_start:].strip()
        else:
            response = full_response.strip()

        # Try to parse JSON response
        try:
            # Look for JSON in the response
            json_start = response.find('{')
            json_end = response.rfind('}') + 1
            if json_start != -1 and json_end > json_start:
                json_str = response[json_start:json_end]
                analysis_result = json.loads(json_str)
            else:
                # Fallback parsing
                analysis_result = self._parse_text_response(response, text)
        except json.JSONDecodeError:
            # Fallback parsing if JSON parsing fails
            analysis_result = self._parse_text_response(response, text)

        return analysis_result

    def _parse_text_response(self, response: str, original_text: str) -> Dict[str, Any]:
        """
        Parse non-JSON response format as fallback
        """
        # Basic fallback parsing
        pii_found = any(keyword in response.lower() for keyword in [
            'name', 'email', 'phone', 'address', 'ssn', 'credit card',
            'personally identifiable', 'pii detected'
        ])

        risk_level = "low"
        if any(keyword in response.lower() for keyword in ['high risk', 'sensitive', 'critical']):
            risk_level = "high"
        elif any(keyword in response.lower() for keyword in ['medium risk', 'moderate']):
            risk_level = "medium"

        return {
            "pii_found": pii_found,
            "pii_items": [],  # Would need more sophisticated parsing
            "analysis": response,
            "risk_level": risk_level,
            "raw_response": response
        }

    def compare_with_redactor_results(self, original_text: str, redacted_text: str,
                                    token_mappings: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Compare Qwen's analysis with your redactor's results

        Args:
            original_text: Original unredacted text
            redacted_text: Text after redaction
            token_mappings: Token mappings from your redactor

        Returns:
            Comparison analysis
        """

        # Analyze original text with Qwen
        qwen_analysis = self.analyze_text_for_pii(original_text)

        # Extract redactor findings
        redactor_findings = [
            {
                "type": mapping["type"],
                "value": mapping["value"],
                "start": mapping["start"],
                "end": mapping["end"],
                "token": mapping["token"]
            }
            for mapping in token_mappings
        ]

        # Compare findings
        comparison = {
            "qwen_analysis": qwen_analysis,
            "redactor_findings": redactor_findings,
            "agreement_score": self._calculate_agreement(qwen_analysis, redactor_findings),
            "missed_by_redactor": [],
            "missed_by_qwen": [],
            "recommendations": []
        }

        # Generate recommendations
        if qwen_analysis["pii_found"] and not redactor_findings:
            comparison["recommendations"].append(
                "Qwen detected PII that the redactor missed. Consider reviewing the text manually."
            )
        elif not qwen_analysis["pii_found"] and redactor_findings:
            comparison["recommendations"].append(
                "Redactor found PII that Qwen didn't detect. This might be acceptable as redactor is more conservative."
            )
        elif qwen_analysis.get("risk_level") == "high":
            comparison["recommendations"].append(
                "High-risk PII detected. Ensure all sensitive information is properly redacted."
            )

        return comparison

    def _calculate_agreement(self, qwen_analysis: Dict, redactor_findings: List[Dict]) -> float:
        """
        Calculate a simple agreement score between Qwen and redactor
        """
        qwen_found_pii = qwen_analysis.get("pii_found", False)
        redactor_found_pii = len(redactor_findings) > 0

        # Basic agreement: both found PII or both found none
        if qwen_found_pii == redactor_found_pii:
            return 1.0 if qwen_found_pii else 0.8  # Perfect agreement or both found nothing
        else:
            return 0.5  # Disagreement

    def batch_validate_redactions(self, validation_cases: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Validate multiple redaction cases

        Args:
            validation_cases: List of cases with 'original', 'redacted', 'mappings'

        Returns:
            List of validation results
        """
        results = []

        for i, case in enumerate(validation_cases):
            print(f"Validating case {i+1}/{len(validation_cases)}...")

            try:
                result = self.compare_with_redactor_results(
                    case["original"],
                    case["redacted"],
                    case["mappings"]
                )
                result["case_id"] = i
                results.append(result)
            except Exception as e:
                print(f"Error validating case {i+1}: {e}")
                results.append({
                    "case_id": i,
                    "error": str(e),
                    "agreement_score": 0.0
                })

        return results

# Cell 4: Usage examples and test functions
def create_test_cases():
    """Create sample test cases for validation"""
    test_cases = [
        {
            "original": "My name is John Smith and my email is john.smith@example.com. My phone number is 555-123-4567.",
            "redacted": "My name is <PII_NAME_1> and my email is <PII_EMAIL_ADDRESS_1>. My phone number is <PII_PHONE_NUMBER_1>.",
            "mappings": [
                {"token": "<PII_NAME_1>", "value": "John Smith", "type": "PERSON", "start": 11, "end": 21},
                {"token": "<PII_EMAIL_ADDRESS_1>", "value": "john.smith@example.com", "type": "EMAIL", "start": 38, "end": 60},
                {"token": "<PII_PHONE_NUMBER_1>", "value": "555-123-4567", "type": "PHONE", "start": 81, "end": 93}
            ]
        },
        {
            "original": "The patient Sarah Johnson, DOB 03/15/1985, SSN 123-45-6789, was admitted today.",
            "redacted": "The patient <PII_NAME_1>, DOB <PII_DATE_1>, SSN <PII_SSN_1>, was admitted today.",
            "mappings": [
                {"token": "<PII_NAME_1>", "value": "Sarah Johnson", "type": "PERSON", "start": 12, "end": 25},
                {"token": "<PII_DATE_1>", "value": "03/15/1985", "type": "DATE", "start": 31, "end": 41},
                {"token": "<PII_SSN_1>", "value": "123-45-6789", "type": "SSN", "start": 47, "end": 58}
            ]
        }
    ]

    return test_cases

def run_validation_example():
    """Run a complete validation example"""
    print("🚀 Starting PII Validation with Qwen3-4B-Thinking")
    print("=" * 50)

    # Initialize checker
    checker = QwenPIIChecker()

    # Create test cases
    test_cases = create_test_cases()

    # Run validation
    results = checker.batch_validate_redactions(test_cases)

    # Display results
    print("\n📊 Validation Results:")
    print("=" * 30)

    for result in results:
        if "error" not in result:
            case_id = result["case_id"]
            agreement = result["agreement_score"]
            recommendations = result["recommendations"]

            print(f"\nCase {case_id + 1}:")
            print(f"  Agreement Score: {agreement:.1%}")
            print(f"  Qwen found PII: {result['qwen_analysis']['pii_found']}")
            print(f"  Redactor found PII: {len(result['redactor_findings']) > 0}")
            print(f"  Risk Level: {result['qwen_analysis'].get('risk_level', 'unknown')}")

            if recommendations:
                print("  Recommendations:")
                for rec in recommendations:
                    print(f"    - {rec}")
        else:
            print(f"\nCase {result['case_id'] + 1}: ERROR - {result['error']}")

    return results

def setup_frontend_with_ngrok(frontend_port: int = 3000, backend_port: int = 8000, auth_token: str = None):
    """Set up ngrok tunnels for your frontend and backend"""
    print("🚀 Setting up ngrok tunnels for your redactor app")
    print("=" * 50)

    # Initialize frontend integration
    frontend = FrontendIntegration(frontend_port, backend_port)

    # Create tunnels
    print(f"📱 Creating tunnel for frontend (localhost:{frontend_port})...")
    frontend_url = frontend.start_frontend_tunnel(auth_token)

    if frontend_url:
        print(f"📡 Creating tunnel for backend (localhost:{backend_port})...")
        backend_url = frontend.start_backend_tunnel(auth_token)

        # Display URLs
        frontend.display_urls()
        return frontend
    else:
        print("❌ Failed to create frontend tunnel")
        return None

def run_live_api_validation(backend_port: int = 8000):
    """Run validation using your live backend API"""
    print("🌐 Starting Live Backend API Validation")
    print("=" * 45)

    # Initialize clients
    api_client = RedactorAPIClient(backend_port=backend_port)
    qwen_checker = QwenPIIChecker()

    # Test API connection
    if not api_client.test_connection():
        print("❌ Cannot connect to backend API. Please check:")
        print("1. Your backend is running (python app/main.py)")
        print("2. Port is correct (default: 8000)")
        print("3. No firewall blocking the connection")
        return None

    # Test cases for live validation
    live_test_texts = [
        "Please contact Dr. Sarah Johnson at sarah.j@hospital.com or call 555-0199",
        "Patient ID: 12345, DOB: 01/15/1980, Insurance: Blue Cross",
        "Meeting with John Smith scheduled for tomorrow at john.smith@company.org"
    ]

    results = []

    for i, text in enumerate(live_test_texts):
        print(f"\n📝 Testing case {i+1}: {text[:50]}...")

        try:
            # Get redaction from your API
            api_result = api_client.redact_text(text)

            # Validate with Qwen
            validation = qwen_checker.compare_with_redactor_results(
                api_result["original"],
                api_result["redacted"],
                api_result["mappings"]
            )

            validation["case_id"] = i
            validation["original_text"] = text
            results.append(validation)

            # Display immediate results
            print(f"  ✓ Agreement Score: {validation['agreement_score']:.1%}")
            print(f"  ✓ Risk Level: {validation['qwen_analysis'].get('risk_level', 'unknown')}")

        except Exception as e:
            print(f"  ❌ Error: {e}")
            results.append({"case_id": i, "error": str(e)})

    # Summary
    print(f"\n📊 Live Validation Complete!")
    print(f"Processed {len(live_test_texts)} cases via your backend API")

    return results

# Cell 5: API integration functions
def validate_redactor_api_response(api_response: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate a response from your redactor API

    Args:
        api_response: Response from your redactor API containing 'original', 'redacted', 'mappings'

    Returns:
        Validation results
    """
    checker = QwenPIIChecker()

    return checker.compare_with_redactor_results(
        api_response["original"],
        api_response["redacted"],
        api_response["mappings"]
    )

def batch_validate_from_json(json_file_path: str) -> List[Dict[str, Any]]:
    """
    Validate redaction cases from a JSON file

    Args:
        json_file_path: Path to JSON file with test cases

    Returns:
        List of validation results
    """
    with open(json_file_path, 'r') as f:
        test_cases = json.load(f)

    checker = QwenPIIChecker()
    return checker.batch_validate_redactions(test_cases)

# Cell 6: Colab API Server
def start_colab_api_server(port: int = 8080, auth_token: str = None):
    """Start Flask API server in Colab and expose it via ngrok"""
    try:
        from flask import Flask, request, jsonify
        from flask_cors import CORS
        import threading

        # Initialize Qwen checker
        print("🤖 Loading Qwen model...")
        try:
            qwen_checker = QwenPIIChecker()
        except Exception as model_error:
            print(f"❌ Failed to load Qwen model: {model_error}")
            print("Try running: install_requirements() and restart the runtime")
            return None

        # Create Flask app
        app = Flask(__name__)
        CORS(app)  # Enable CORS for local development

        @app.route('/health', methods=['GET'])
        def health_check():
            return jsonify({"status": "healthy", "model": "Qwen3-4B-Thinking-2507"})

        @app.route('/analyze', methods=['POST'])
        def analyze_pii():
            try:
                data = request.get_json()
                text = data.get('text', '')

                if not text:
                    return jsonify({"error": "No text provided"}), 400

                # Analyze with Qwen
                analysis = qwen_checker.analyze_text_for_pii(text)

                return jsonify({
                    "success": True,
                    "analysis": analysis,
                    "text_length": len(text)
                })

            except Exception as e:
                return jsonify({"error": str(e)}), 500

        @app.route('/compare', methods=['POST'])
        def compare_redaction():
            try:
                data = request.get_json()
                original = data.get('original', '')
                redacted = data.get('redacted', '')
                mappings = data.get('mappings', [])

                if not all([original, redacted, mappings]):
                    return jsonify({"error": "Missing required fields"}), 400

                # Compare with Qwen
                comparison = qwen_checker.compare_with_redactor_results(
                    original, redacted, mappings
                )

                return jsonify({
                    "success": True,
                    "comparison": comparison
                })

            except Exception as e:
                return jsonify({"error": str(e)}), 500

        # Start server in background thread
        def run_server():
            app.run(host='0.0.0.0', port=port, debug=False)

        server_thread = threading.Thread(target=run_server, daemon=True)
        server_thread.start()

        print(f"✅ Flask API server started on port {port}")

        # Create ngrok tunnel
        # Use the hardcoded token directly
        token = '2yK681gpNjRYbPbXX2aChPFHXGc_GHciwTfSC3GDB1RycjXS'

        if token:
            tunnel_url = setup_ngrok_tunnel(port, token)
            if tunnel_url:
                print(f"\n🌐 Colab API is now accessible at: {tunnel_url}")
                print(f"📡 Local Colab URL: http://localhost:{port}")
                print(f"\n🔗 Use this URL in your local development:")
                print(f"   Analyze endpoint: {tunnel_url}/analyze")
                print(f"   Compare endpoint: {tunnel_url}/compare")
                print(f"   Health check: {tunnel_url}/health")
                return tunnel_url
            else:
                print("❌ Failed to create ngrok tunnel")
                return None
        else:
            print("⚠️ No ngrok token - server running locally only")
            print(f"Local URL: http://localhost:{port}")
            return f"http://localhost:{port}"

    except ImportError as e:
        print(f"❌ Missing dependency: {e}")
        print("Run: !pip install flask flask-cors")
        return None
    except Exception as e:
        print(f"❌ Error starting server: {e}")
        return None

# Cell 7: Main execution - All-in-one runner
if __name__ == "__main__":
    # Install requirements (run this first)
    print("Installing requirements...")
    install_requirements()

    print("\n" + "="*60)
    print("🤖 Qwen PII Analysis API for Colab - Auto-Start")
    print("="*60)

    import os
    # Read token from environment or pass explicitly to start_colab_api_server
    ngrok_token = os.environ.get('NGROK_AUTH_TOKEN')

    if not ngrok_token:
        print("⚠️ No ngrok token found.")
        print("\nSet your token with:")
        print("os.environ['NGROK_AUTH_TOKEN'] = 'your_token_here'")
        print("Get token from: https://dashboard.ngrok.com/get-started/your-authtoken")
        print("\nThen re-run this cell")
    else:
        print(f"✅ Ngrok token found - automatically starting Colab API server...")
        print("🚀 Loading Qwen model and starting server...")

        try:
            api_url = start_colab_api_server(auth_token=ngrok_token)

            if api_url:
                print(f"\n🎯 SUCCESS! Colab API is running and accessible at:")
                print(f"🔗 {api_url}")
                print(f"\n📡 Available endpoints:")
                print(f"   • Health check: {api_url}/health")
                print(f"   • Analyze text: {api_url}/analyze")
                print(f"   • Compare redaction: {api_url}/compare")
                print(f"   • Stop tunnels: stop_ngrok_tunnel()")
                print(f"\n📝 Use this URL in your local development server")
                print(f"   Example: fetch('{api_url}/analyze', {{ method: 'POST', ... }})")
                print(f"\n✅ Server is running in background - ready to receive requests!")
            else:
                print("❌ Failed to start server - check logs above")

        except Exception as e:
            print(f"❌ Error starting server: {e}")
            print("\n🔧 Troubleshooting Steps:")
            print("1. Run: install_requirements()")
            print("2. Restart Colab runtime: Runtime → Restart and run all")
            print("3. If still failing, try: start_colab_api_server()")
            print("4. Check GPU availability: Runtime → Change runtime type → Hardware accelerator → GPU")

    print(f"\n📖 Manual Functions (if needed):")
    print("• install_requirements() - Install/update dependencies")
    print("• start_colab_api_server() - Restart server")
    print("• run_validation_example() - Test with examples")
    print("• QwenPIIChecker().analyze_text_for_pii('text') - Direct analysis")
    print("• stop_ngrok_tunnel() - Stop all active tunnels")
    print("\n💡 After running install_requirements(), restart the runtime before retrying!")


# Example usage in Colab:
"""
# 1. Set your ngrok token:
import os
os.environ['NGROK_AUTH_TOKEN'] = 'your_ngrok_token_here'

# 2. Start the Colab API server:
# Re-run the main execution cell (Cell 7) after setting the environment variable.
# It will automatically detect the token and start the server.

# Alternatively, manually start the server after setting the token:
# api_url = start_colab_api_server()


# 3. In your LOCAL development frontend/backend, make requests to the Colab API:

# Analyze text for PII:
import requests
response = requests.post(f'{api_url}/analyze', json={
    'text': 'My name is John Smith and email is john@example.com'
})
analysis = response.json()

# Compare your redaction results:
response = requests.post(f'{api_url}/compare', json={
    'original': 'My name is John Smith',
    'redacted': 'My name is <PII_NAME_1>',
    'mappings': [{'token': '<PII_NAME_1>', 'value': 'John Smith', 'type': 'PERSON'}]
})
comparison = response.json()

# Health check:
response = requests.get(f'{api_url}/health')
print(response.json())  # {"status": "healthy", "model": "Qwen3-4B-Thinking-2507"}

# Stop ngrok tunnels when done:
# stop_ngrok_tunnel()
"""