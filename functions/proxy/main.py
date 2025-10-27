import os
import requests
from flask import Flask, request,jsonify



app = Flask(__name__)


VTO_FUNCTION_URL = os.environ.get(
    "VTO_FUNCTION_URL",
    "https://us-central1-fitcheck-475119.cloudfunctions.net/process_virtual_try_on",
)


@app.after_request
def add_cors_headers(response):
    # Allow all origins for now to support chrome-extension:// requests.
    # For production, consider restricting this to your extension origin.
    response.headers["Access-Control-Allow-Origin"] = "*"
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

        # Forward the request payload to the VTO function
        print(f"Proxy: forwarding request to VTO function at {VTO_FUNCTION_URL}", flush=True)
        vto_response = requests.post(VTO_FUNCTION_URL, json=data, timeout=30)

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
        return jsonify({"error": f"Internal proxy error: {str(e)}"}), 500




