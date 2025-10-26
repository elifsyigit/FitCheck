import base64
from google import genai
from google.genai import types
from utilities import base64_to_part
from get_secret import get_secret_value, YOUR_PROJECT_ID, YOUR_SECRET_ID, VERSION_ID
from flask import Request, jsonify

# Initialize Gemini client once
client = genai.Client(api_key=get_secret_value(YOUR_PROJECT_ID, YOUR_SECRET_ID, VERSION_ID))

def process_virtual_try_on(request: Request):
    """
    Cloud Function HTTP entrypoint
    """
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Request body must be JSON"}), 400

        product_base64 = data.get('clothingImageBase64') or data.get('productImage')
        base_photo_base64 = data.get('avatarImageBase64') or data.get('basePhoto')
        if not product_base64 or not base_photo_base64:
            return jsonify({"error": "Missing required images"}), 400

        product_part = base64_to_part(product_base64)
        base_photo_part = base64_to_part(base_photo_base64)

        prompt_text = "You are a professional virtual try-on AI assistant..."  # keep your full prompt

        response = client.models.generate_content(
            model='gemini-2.5-pro',
            contents=[base_photo_part, product_part, prompt_text]
        )

        base64_data = None
        if (hasattr(response, 'candidates') and response.candidates and
            hasattr(response.candidates[0], 'content') and response.candidates[0].content and
            hasattr(response.candidates[0].content.parts[0], 'inline_data')):
            data_field = response.candidates[0].content.parts[0].inline_data.data
            base64_data = data_field.decode('utf-8') if isinstance(data_field, bytes) else data_field

        if not base64_data and response.text:
            text = response.text.strip()
            base64_data = text.split(',', 1)[1] if ',' in text else text

        if base64_data:
            clean = base64_data.replace('\n', '').replace('\r', '').strip()
            return jsonify({"tryOnImageBase64": clean}), 200
        else:
            return jsonify({"error": "No image data found"}), 500

    except Exception as e:
        return jsonify({"error": f"Internal error: {e}"}), 500
