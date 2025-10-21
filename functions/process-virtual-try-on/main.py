#Giriş İşleme	Gelen HTTP POST isteğini (JSON formatında) okumalı ve içindeki Base64 verilerini (productImage ve basePhoto) ayrıştırmalıdır.
#Veri Dönüşümü	Base64 dizilerini, Gemini API'sinin kabul ettiği Çok Modlu Part objelerine dönüştürmelidir.
#API Çağrısı	İki Part objesi ve VTO talimatlarını içeren komutu (prompt) Gemini/Imagen API'sine göndermelidir.
#Çıktı İşleme	API'den gelen üretilmiş görseli almalı, Base64 formatına çevirmeli ve ön uca (Chrome Eklentisine) JSON formatında geri döndürmelidir.
#Hata Yönetimi	Eksik veri, Base64 çözme hataları veya API sorunları gibi durumlarda uygun HTTP durum kodlarıyla (örn. 400, 500) yanıt vermelidir.

import os
from utilities import base64_to_part                  
from google import genai
from google.genai import types
from flask import Request
from get_secret import get_secret_value

# Get API key safely
def get_gemini_api_key():
    """Safely retrieve Gemini API key from Secret Manager"""
    try:
        project_id = "fitcheck-475119"  
        secret_id = "GEMINI_API_KEY_FITCHECK"  
        api_key = get_secret_value(project_id, secret_id)
        
        if not api_key:
            raise ValueError("Failed to retrieve Gemini API key from Secret Manager")
        
        return api_key
    except Exception as e:
        raise ValueError(f"Error retrieving API key: {e}")

# Initialize client with API key
try:
    API_KEY = get_gemini_api_key()
    client = genai.Client(api_key=API_KEY)
except Exception as e:
    print(f"Warning: Could not initialize Gemini client: {e}")
    client = None

def process_virtual_try_on(request):
    """
    Cloud Run hizmetinin HTTP isteğini işleyen ana fonksiyondur.
    
    Args:
        request (flask.Request): Gelen HTTP isteği objesi.
    
    Returns:
        tuple: (Yanıt gövdesi, HTTP Durum Kodu)
    """
    
    # Check if client is initialized
    if client is None:
        return ({"error": "Gemini API client not initialized. Check API key configuration."}, 500)
    
    try:
        request_data = request.get_json(silent=True)
        if not request_data:
            return ({"error": 'Request body must be valid JSON'}, 400)
            
        product_base64 = request_data.get('clothingImageBase64') or request_data.get('productImage')
        base_photo_base64 = request_data.get('avatarImageBase64') or request_data.get('basePhoto')

        if not product_base64 or not base_photo_base64:
            return ({"error": 'Missing required image data in request'}, 400)
            
    except Exception as e:
        return ({"error": f'Error processing request data: {e}'}, 400)

    try:
        product_part = base64_to_part(product_base64)
        base_photo_part = base64_to_part(base_photo_base64)
    except ValueError as e:
        return ({"error": f'Invalid Base64 format for image decoding: {e}'}, 400)
    except Exception as e:
        return ({"error": f'Error processing image data: {e}'}, 400)


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
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-pro',
            contents=[base_photo_part, product_part, prompt_text]
        )
        
        # Check if response contains image data in candidates
        if hasattr(response, 'candidates') and response.candidates:
            candidate = response.candidates[0]
            if hasattr(candidate, 'content') and candidate.content:
                for part in candidate.content.parts:
                    if hasattr(part, 'inline_data'):
                        # Return base64 encoded image data
                        return ({"tryOnImageBase64": part.inline_data.data}, 200)
        
        # Check if response.text contains base64 image data
        if response.text:
            # Look for data:image/jpeg;base64, format
            if "data:image/jpeg;base64," in response.text:
                base64_data = response.text.split("data:image/jpeg;base64,")[1]
                return ({"tryOnImageBase64": base64_data}, 200)
            
            # Look for data:image/png;base64, format
            elif "data:image/png;base64," in response.text:
                base64_data = response.text.split("data:image/png;base64,")[1]
                return ({"tryOnImageBase64": base64_data}, 200)
            
            # Look for generic data:image format
            elif "data:image" in response.text:
                # Extract everything after data:image
                parts = response.text.split("data:image")[1]
                if "," in parts:
                    base64_data = parts.split(",")[1]
                    return ({"tryOnImageBase64": base64_data}, 200)
                else:
                    base64_data = parts
                    return ({"tryOnImageBase64": base64_data}, 200)
            
            # If response.text is pure base64 (no data:image prefix)
            elif len(response.text) > 100 and response.text.replace('\n', '').replace('\r', '').isalnum():
                return ({"tryOnImageBase64": response.text}, 200)
        
        return ({"error": f"API call successful, but no image data found in response. Response: {response.text[:200]}..."}, 500)

    except Exception as e:
        return ({"error": f'AI Processing Failed: {e}'}, 500)