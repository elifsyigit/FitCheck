import os
import base64
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

VTO_FUNCTION_URL = os.environ.get(
    "VTO_FUNCTION_URL",
    "https://process-virtual-try-on-654573246781.us-central1.run.app",
)

def convert_to_base64(data):
    """
    Recursively convert all image URLs/data in the payload to base64.
    """
    if isinstance(data, dict):
        return {key: convert_to_base64(value) for key, value in data.items()}
    elif isinstance(data, list):
        return [convert_to_base64(item) for item in data]
    elif isinstance(data, str):
        # Check if it's a URL pointing to an image
        if data.startswith('http://') or data.startswith('https://'):
            try:
                # Download the image
                response = requests.get(data, timeout=10)
                response.raise_for_status()
                # Convert to base64
                base64_string = base64.b64encode(response.content).decode('utf-8')
                # Determine image format from content-type or URL
                content_type = response.headers.get('content-type', 'image/jpeg')
                image_format = content_type.split('/')[-1]
                return f"data:image/{image_format};base64,{base64_string}"
            except Exception as e:
                print(f"Failed to convert URL to base64: {data}, error: {e}", flush=True)
                return data  # Return original if conversion fails
        else:
            return data
    else:
        return data

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "chrome-extension://cakcomphgnphkgkpekjjolnjnigmfkce"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, Accept, Origin, X-Requested-With"
    return response

@app.route("/", methods=["OPTIONS"])
def handle_preflight():
    # Preflight response — flask will call after_request to add CORS headers.
    return jsonify({"message": "CORS preflight OK"})

@app.route("/", methods=["POST"])
def proxy_request():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Request body must be JSON"}), 400
        
        # Check if this is a simple image fetch request (single imageUrl)
        if "imageUrl" in data and len(data) == 1:
            # This is a simple image fetch request
            image_url = data.get("imageUrl")
            if not image_url:
                return jsonify({"error": "Missing required images"}), 400
            
            try:
                # Download the image
                response = requests.get(image_url, timeout=10)
                response.raise_for_status()
                
                # Convert to base64
                base64_string = base64.b64encode(response.content).decode('utf-8')
                
                # Determine image format from content-type or URL
                content_type = response.headers.get('content-type', 'image/jpeg')
                image_format = content_type.split('/')[-1]
                
                # Return data URI format
                data_uri = f"data:image/{image_format};base64,{base64_string}"
                
                print(f"Proxy: Successfully fetched and converted image from {image_url}", flush=True)
                return jsonify({"base64": data_uri}), 200
                
            except requests.exceptions.RequestException as e:
                print(f"Proxy error while fetching image: {e}", flush=True)
                return jsonify({"error": f"Failed to fetch image: {str(e)}"}), 500
        
        # Otherwise, this is a VTO request - convert all images and forward to VTO
        # Check for required VTO fields
        if "avatarImageBase64" not in data or "clothingImageBase64" not in data:
            return jsonify({"error": "Missing required images"}), 400
        
        # Convert all images in the request to base64
        converted_data = convert_to_base64(data)
        
        # Forward the request payload to the VTO function
        print(f"Proxy: forwarding request to VTO function at {VTO_FUNCTION_URL}", flush=True)
        vto_response = requests.post(VTO_FUNCTION_URL, json=converted_data, timeout=30)
        
        # Try to parse the response as JSON safely
        try:
            result = vto_response.json()
        except ValueError:
            return (
                jsonify({"error": f"VTO function returned non-JSON response: {vto_response.text[:200]}"}),
                502,
            )
        
        return jsonify(result), vto_response.status_code
    
    except requests.exceptions.RequestException as e:
        print(f"Proxy error while reaching VTO function: {e}", flush=True)
        return jsonify({"error": f"Failed to reach VTO function: {str(e)}"}), 500
    
    except Exception as e:
        print(f"Unexpected proxy error: {e}", flush=True)
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500