# Dosya Adı: app.py

import os
# Flask'tan yalnızca ihtiyacımız olan bileşenleri (Flask uygulaması, request objesi, JSON yanıtı) import ediyoruz.
from flask import Flask, request, jsonify 
from utilities import base64_to_part 
from google import genai
from google.genai import types
from get_secret import get_secret_value

# Flask uygulamasını başlatma (Gunicorn'ın bulacağı değişken)
app = Flask(__name__)

# Get API key safely
def get_gemini_api_key():
    """Safely retrieve Gemini API key from Secret Manager"""
    try:
        project_id = "fitcheck-475119" 
        secret_id = "GEMINI_API_KEY_FITCHECK" 
        # get_secret_value fonksiyonunun get_secret.py'de çalıştığını varsayıyoruz.
        api_key = get_secret_value(project_id, secret_id) 
        
        if not api_key:
            # Hata yönetimini Runtime hatasına çevirdik
            raise RuntimeError("Failed to retrieve Gemini API key from Secret Manager")
        
        return api_key
    except Exception as e:
        raise RuntimeError(f"Error retrieving API key: {e}")

# Initialize client with API key
try:
    API_KEY = get_gemini_api_key()
    client = genai.Client(api_key=API_KEY)
except RuntimeError as e:
    # Başlangıçta başarısız olursa loglarız ve client'ı None yaparız
    print(f"FATAL: Could not initialize Gemini client: {e}")
    client = None
except Exception as e:
    # Diğer beklenmedik hatalar
    print(f"Warning: Could not initialize Gemini client due to unexpected error: {e}")
    client = None

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


    # API Çağrısı için Prompt (Aynı Kaldı)
    prompt_text = """
You are a professional virtual try-on AI assistant. Your task is to create a photorealistic virtual try-on image with the following specifications:

## OBJECTIVE
Generate a photorealistic virtual try-on image, seamlessly integrating a specified clothing item onto a person while rigidly preserving their facial identity, the clothing's exact appearance, and placing them in a completely new, distinct background.
... [PROMPT'UNUZUN GERİ KALANI AYNEN BURADA] ...
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

# --- 3. SUNUCU BAŞLANGICI (CLOUD RUN'I BAŞLATMA HATASINI ÇÖZEN KISIM) ---

if __name__ == '__main__':
    # Cloud Run/Gunicorn'ın dinlemesini sağlayan ana blok.
    # Bu, "container failed to start and listen" hatasını çözer.
    port = int(os.environ.get('PORT', 8080))
    
    # Geliştirme ortamında test için bu komut kullanılır. 
    # Cloud Run'da Gunicorn bu bloğu atlayıp doğrudan app'i çalıştırır.
    app.run(host='0.0.0.0', port=port, debug=False)