from firebase_functions import https_fn
from firebase_functions.options import set_global_options
import os
import json
EXTENSION_ORIGIN = os.environ.get('EXTENSION_ORIGIN', 'chrome-extension://cakcomphgnphkgkpekjjolnjnigmfkce')

# Limit simultaneous containers (optional)
set_global_options(max_instances=10)

@https_fn.on_request()
def get_firebase_key(req: https_fn.Request) -> https_fn.Response:
    """Return Firebase configuration for authenticated extension clients and handle CORS preflight."""
    cors_headers = {
        'Access-Control-Allow-Origin': EXTENSION_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '3600'
    }

    try:
        # Answer preflight requests immediately
        if req.method == 'OPTIONS':
            return https_fn.Response('', status=204, headers=cors_headers)

        # No auth required: return firebase config publicly
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