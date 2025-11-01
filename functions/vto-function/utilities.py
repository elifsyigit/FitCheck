import base64
from google.genai import types

def detect_mime_type(base64_string):
    #Detects the MIME type from the Base64 string.
    if ',' in base64_string:
        header = base64_string.split(',')[0]
    else:
        try:
            decoded = base64.b64decode(base64_string[:20])
            header = f"data:{decoded[:4]}"
        except:
            return "image/jpeg"  # Default fallback
    
    if 'data:image/png' in header:
        return "image/png"
    elif 'data:image/webp' in header:
        return "image/webp"
    elif 'data:image/gif' in header:
        return "image/gif"
    else:
        return "image/jpeg" 

def base64_to_part(base64_string):
    """Base64 dizesini uygun MIME türüyle Part objesine dönüştürür."""
    if ',' in base64_string:
        base64_string = base64_string.split(',')[1]
    
    mime_type = detect_mime_type(base64_string)
        
    return types.Part.from_bytes(
        data=base64.b64decode(base64_string),
        mime_type=mime_type
    )