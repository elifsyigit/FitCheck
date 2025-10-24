import os
from flask import Flask, request, jsonify 
from utilities import base64_to_part 
from google import genai
from google.genai import types
from get_secret import get_secret_value
#client

app = Flask(__name__)

# FONKSİYONUNUZU FLASK ROUTE İLE EŞLEŞTİRİYORUZ
# Cloud Run'ın HTTP isteğini alacağı ana rotayı ('/') tanımlarız.
@app.route('/', methods=['POST'])
def process_virtual_try_on():
    """
    HTTP POST isteğini işleyen ana fonksiyondur.
    
    Returns:
        tuple: (JSON Yanıtı, HTTP Durum Kodu)
    """
    
    # Check if client is initialized
    if client is None:
        # Flask yapısında yanıtı jsonify ile döndürüyoruz
        return jsonify({"error": "Gemini API client not initialized. Check API key configuration."}), 500
    
    # Giriş İşleme 
    try:
        # Flask'tan import edilen global 'request' objesini kullanırız
        request_data = request.get_json(silent=True) 
        if not request_data:
            return jsonify({"error": 'Request body must be valid JSON'}), 400
            
        product_base64 = request_data.get('clothingImageBase64') or request_data.get('productImage')
        base_photo_base64 = request_data.get('avatarImageBase64') or request_data.get('basePhoto')

        if not product_base64 or not base_photo_base64:
            return jsonify({"error": 'Missing required image data in request'}), 400
            
    except Exception as e:
        return jsonify({"error": f'Error processing request data: {e}'}), 400

    # Veri Dönüşümü
    try:
        product_part = base64_to_part(product_base64)
        base_photo_part = base64_to_part(base_photo_base64)
    except ValueError as e:
        return jsonify({"error": f'Invalid Base64 format for image decoding: {e}'}), 400
    except Exception as e:
        return jsonify({"error": f'Error processing image data: {e}'}), 400

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



CRITICAL: Return the image as Base64 encoded data in the format: "data:image/jpeg;base64,YOUR_BASE64_DATA_HERE"



Do not include any text, explanations, or additional content - only the Base64 encoded image data.

"""
    
    # API Çağrısı ve Çıktı İşleme
    try:
        response = client.models.generate_content(
            model='gemini-2.5-pro',
            contents=[base_photo_part, product_part, prompt_text]
        )
        
        # Orijinal Çıktı İşleme Mantığınız (JSON yerine jsonify kullanılarak)
        
        base64_data = None
        
        # Method 1: Check for structured image data (Bytes)
        if (hasattr(response, 'candidates') and response.candidates and
            hasattr(response.candidates[0], 'content') and response.candidates[0].content and
            hasattr(response.candidates[0].content.parts[0], 'inline_data')):
            
            data_field = response.candidates[0].content.parts[0].inline_data.data
            base64_data = data_field.decode('utf-8') if isinstance(data_field, bytes) else data_field

        # Method 2: Check for embedded base64 in response.text
        if not base64_data and response.text:
            text = response.text.strip()
            # 'data:image/jpeg;base64,' kısmını atla
            if "," in text:
                base64_data = text.split(',', 1)[1].strip()
            else:
                base64_data = text # Ham Base64 olduğu varsayılır


        if base64_data:
            clean_base64 = base64_data.replace('\n', '').replace('\r', '').strip()
            # Başarılı yanıtı jsonify ile döndürüyoruz
            return jsonify({"tryOnImageBase64": clean_base64}), 200
        else:
            return jsonify({"error": f"API call successful, but no image data found in response. Response: {response.text[:200]}..."}), 500

    except Exception as e:
        return jsonify({"error": f'AI Processing Failed: {e}'}), 500


if __name__ == '__main__':
    # Cloud Run/Gunicorn'ın dinlemesini sağlayan ana blok.
    # Bu, "container failed to start and listen" hatasını çözer.
    port = int(os.environ.get('PORT', 8080))
    
    # Geliştirme ortamında test için bu komut kullanılır. 
    # Cloud Run'da Gunicorn bu bloğu atlayıp doğrudan app'i çalıştırır.
    app.run(host='0.0.0.0', port=port, debug=False)