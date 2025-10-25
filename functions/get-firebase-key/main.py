from firebase_functions import https_fn
from firebase_functions.options import set_global_options
import os
import json
import hashlib
import hmac
import time
from collections import defaultdict

EXTENSION_ORIGIN = os.environ.get('EXTENSION_ORIGIN', 'chrome-extension://cakcomphgnphkgkpekjjolnjnigmfkce')
EXTENSION_SECRET = os.environ.get('EXTENSION_SECRET')  # Add this to your environment variables

# Rate limiting storage (in production, use Redis or similar)
request_counts = defaultdict(list)
RATE_LIMIT_REQUESTS = 100  # requests per hour
RATE_LIMIT_WINDOW = 3600  # 1 hour in seconds

# Limit simultaneous containers (optional)
set_global_options(max_instances=10)

def verify_extension_signature(req: https_fn.Request) -> bool:
    """Verify that the request comes from a legitimate extension instance."""
    if not EXTENSION_SECRET:
        return True  # Skip verification if no secret is set
    
    signature = req.headers.get('X-Extension-Signature')
    if not signature:
        return False
    
    # Create expected signature using timestamp + extension ID
    timestamp = req.headers.get('X-Extension-Timestamp', '')
    expected_signature = hmac.new(
        EXTENSION_SECRET.encode(),
        f"{EXTENSION_ORIGIN}{timestamp}".encode(),
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(signature, expected_signature)

def check_rate_limit(req: https_fn.Request) -> bool:
    """Check if the request is within rate limits."""
    client_ip = req.headers.get('X-Forwarded-For', req.headers.get('X-Real-IP', 'unknown'))
    current_time = time.time()
    
    # Clean old requests
    request_counts[client_ip] = [
        req_time for req_time in request_counts[client_ip] 
        if current_time - req_time < RATE_LIMIT_WINDOW
    ]
    
    # Check if under limit
    if len(request_counts[client_ip]) >= RATE_LIMIT_REQUESTS:
        return False
    
    # Add current request
    request_counts[client_ip].append(current_time)
    return True

@https_fn.on_request()
def get_firebase_key(req: https_fn.Request) -> https_fn.Response:
    """Return Firebase configuration for authenticated extension clients and handle CORS preflight."""
    cors_headers = {
        'Access-Control-Allow-Origin': EXTENSION_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Extension-Signature, X-Extension-Timestamp',
        'Access-Control-Max-Age': '3600'
    }

    try:
        # Answer preflight requests immediately
        if req.method == 'OPTIONS':
            return https_fn.Response('', status=204, headers=cors_headers)

        # Check rate limiting
        if not check_rate_limit(req):
            err_payload = {'error': 'Rate limit exceeded', 'detail': 'Too many requests'}
            err_json_payload = json.dumps(err_payload)
            error_response_headers = {**cors_headers, 'Content-Type': 'application/json'}
            return https_fn.Response(err_json_payload, status=429, headers=error_response_headers)

        # Verify extension signature (optional - can be disabled by not setting EXTENSION_SECRET)
        if not verify_extension_signature(req):
            err_payload = {'error': 'Unauthorized', 'detail': 'Invalid extension signature'}
            err_json_payload = json.dumps(err_payload)
            error_response_headers = {**cors_headers, 'Content-Type': 'application/json'}
            return https_fn.Response(err_json_payload, status=401, headers=error_response_headers)

        # Return firebase config for verified extension
        firebase_config = {
            'apiKey': os.environ.get('FIREBASE_API_KEY', 'demo-api-key'),
            'authDomain': f"{os.environ.get('FIREBASE_PROJECT_ID', 'fitcheck-project')}.firebaseapp.com",
            'projectId': os.environ.get('FIREBASE_PROJECT_ID', 'fitcheck-project'),
            'storageBucket': f"{os.environ.get('FIREBASE_PROJECT_ID', 'fitcheck-project')}.appspot.com",
            'messagingSenderId': os.environ.get('FIREBASE_MESSAGING_SENDER_ID', 'demo-sender'),
            'appId': os.environ.get('FIREBASE_APP_ID', 'demo-app')
        }

        payload = {'status': 'ok', 'message': 'Firebase config retrieved successfully', 'firebaseConfig': firebase_config}
        
        # ⬇️ FIX: Serialize the dictionary to a JSON string and set Content-Type
        json_payload = json.dumps(payload)
        response_headers = {**cors_headers, 'Content-Type': 'application/json'}
        
        return https_fn.Response(json_payload, status=200, headers=response_headers)

    except Exception as e:
        # Ensure we always return JSON with CORS headers so the client can read the error
        err_payload = {'error': 'Internal server error', 'detail': str(e)}
        
        # ⬇️ FIX: Serialize the error dictionary to a JSON string and set Content-Type
        err_json_payload = json.dumps(err_payload)
        error_response_headers = {**cors_headers, 'Content-Type': 'application/json'}
        
        return https_fn.Response(err_json_payload, status=500, headers=error_response_headers)