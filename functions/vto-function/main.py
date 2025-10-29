from google import genai
from google.genai import types
from utilities import base64_to_part
from get_secret import get_secret_value, YOUR_PROJECT_ID, YOUR_SECRET_ID, VERSION_ID
from flask import Request, jsonify
import time
import base64

# Initialize Gemini client once
client = genai.Client(api_key=get_secret_value(YOUR_PROJECT_ID, YOUR_SECRET_ID, VERSION_ID))

CORS_HEADERS = { 'Access-Control-Allow-Origin': 'chrome-extension://cakcomphgnphkgkpekjjolnjnigmfkce', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '3600' }

ALLOWED_ORIGIN = "chrome-extension://cakcomphgnphkgkpekjjolnjnigmfkce"

def process_virtual_try_on(request: Request):
    # Handle preflight OPTIONS
    if request.method == "OPTIONS":
        headers = {
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "3600"
        }
        return ("", 204, headers)

    # Always set CORS headers for actual responses too
    headers = {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }

    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Request body must be JSON"}), 400, headers

        product_base64 = data.get("clothingImageBase64") or data.get("productImage")
        base_photo_base64 = data.get("avatarImageBase64") or data.get("basePhoto")

        if not product_base64 or not base_photo_base64:
            return jsonify({"error": "Missing required images"}), 400, headers

        product_part = base64_to_part(product_base64)
        base_photo_part = base64_to_part(base_photo_base64)
        prompt_text = """

You are a professional virtual try-on AI assistant. Your task is to create a photorealistic virtual try-on image with the following specifications:



## OBJECTIVE

Generate a photorealistic virtual try-on image, seamlessly integrating a specified clothing item onto a person while rigidly preserving their facial identity, the clothing's exact appearance, and placing them in a completely new, distinct background.



## INPUTS

- FIRST IMAGE: Person image containing the target person (used for identity, pose, body shape, hair, accessories)

- SECOND IMAGE: Garment image containing the target clothing item (used for color, style, texture, pattern)



## PROCESSING STEPS

1. Isolate the clothing item from the garment image, discarding any original model, mannequin, or background

2. Identify the person (face, body shape, skin tone), pose, hair, and accessories from the person image

3. Segment the person from the original background

4. Generate a completely new and different background

5. Analyze lighting cues and adapt for consistency with the new background



## CORE CONSTRAINTS (ABSOLUTE CRITICAL)



### Identity Lock

- Maintain PERFECT facial identity, features, skin tone, and expression

- ZERO alterations to the face are permitted

- Treat the head region (including hair) as immutable unless occluded by garment

- DO NOT GUESS OR HALLUCINATE FACIAL FEATURES



### Garment Fidelity  

- Preserve EXACT color (hue, saturation, brightness), pattern, texture, material properties

- ZERO deviations in style, color, or visual appearance are allowed

- Render the garment precisely as depicted in the garment image



### Realistic Integration

- Simulate physically plausible draping, folding, and fit

- Ensure natural interaction with the body within the new background context



## HIGH PRIORITY CONSTRAINTS



### Pose Preservation

- Retain the EXACT body pose and positioning of the person



### Lighting Consistency

- Apply lighting, shadows, and highlights perfectly consistent with the NEW background

- Adjust subject lighting subtly to match the new scene

- Prioritize natural look consistent with original subject's lighting



## ADDITIONAL REQUIREMENTS

- Scale garment accurately to match person's body proportions

- Render natural occlusion where garment covers body parts

- Maintain hair and accessories unless logically occluded

- Render fine details (embroidery, seams, buttons, lace) with high fidelity

- Ensure person fits logically within the new background environment



## EDGE CASE HANDLING

- Tight fitting clothing: Accurately depict fabric stretch and conformity to body contours

- Transparent/sheer clothing: Realistically render transparency, showing underlying skin tone or layers appropriately

- Complex garment geometry: Handle unusual shapes, layers, or asymmetrical designs with correct draping

- Unusual poses: Ensure garment drape remains physically plausible even in non-standard or dynamic poses

- Garment partially out of frame: Render the visible parts of the garment correctly; do not hallucinate missing sections

- Low resolution inputs: Maximize detail preservation but prioritize realistic integration over inventing details not present in the inputs

- Mismatched lighting inputs: Prioritize generating a coherent lighting environment based on the NEW background, adapting the garment and slightly adjusting the person's apparent lighting for a unified final image. Avoid harsh lighting clashes



## PROHIBITIONS

- DO NOT alter facial features, identity, expression, or skin tone

- DO NOT modify intrinsic color, pattern, texture, or style of clothing

- DO NOT retain ANY part of the original background

- DO NOT change the person's pose

- DO NOT introduce elements not present in input images

- DO NOT hallucinate or guess facial details

- DO NOT generate a background that is stylistically jarring or contextually nonsensical without explicit instruction



## OUTPUT

Generate ONLY a single, high-resolution, photorealistic image where the person appears to be naturally wearing the clothing item in a completely new background.



You must return the result strictly as an image output, not text.
Return the generated image as inline image data (not a textual base64 string).
Do not include any captions or explanations — only output an image.

"""
        # Call Gemini with simple retries for transient overloads
        attempt = 0
        last_exc = None
        response = None
        while attempt < 3:
            try:
                response = client.models.generate_content(
                    model="gemini-2.5-flash-image",
                    contents=[base_photo_part, product_part, prompt_text]
                )
                break
            except Exception as e:
                message = str(e)
                last_exc = e
                # Retry on transient overload/unavailable
                if "UNAVAILABLE" in message or "overloaded" in message or "503" in message:
                    attempt += 1
                    if attempt < 3:
                        time.sleep(1.5 * attempt)
                        continue
                # Non-transient error
                raise

        if hasattr(response, "candidates") and response.candidates:
            candidate = response.candidates[0]
            content = getattr(candidate, "content", None)

            if not content or not getattr(content, "parts", None):
                print("DEBUG: No content or parts in response.")
                return jsonify({"error": "Model returned empty content"}), 500, headers

            first_part = content.parts[0]

            # Sometimes Gemini returns text instead of inline_data if it failed
            inline_data = getattr(first_part, "inline_data", None)
            if not inline_data or not getattr(inline_data, "data", None):
                print("DEBUG: No inline_data in response:", first_part)
                # Optionally, log the text it returned
                if hasattr(first_part, "text"):
                    print("DEBUG: Model text response:", first_part.text)
                return jsonify({"error": "Model returned text instead of image"}), 500, headers

            # Get binary image data and convert to base64 manually
            image_data = inline_data.data  # binary bytes
            base64_data = base64.b64encode(image_data).decode("utf-8")

            return jsonify({"tryOnImageBase64": base64_data}), 200, headers

        print("DEBUG: Response had no candidates:", response)
        return jsonify({"error": "No image data found"}), 500, headers


    except Exception as e:
        msg = str(e)
        if "UNAVAILABLE" in msg or "overloaded" in msg or "503" in msg:
            return (
                jsonify({
                    "error": "Internal error: 503 UNAVAILABLE. The model is overloaded. Please try again later.",
                }),
                503,
                {**headers, "Retry-After": "3"}
            )
        return jsonify({"error": f"Internal error: {e}"}), 500, headers


