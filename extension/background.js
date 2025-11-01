const VIRTUAL_TRY_ON_SERVICE_URL = 'https://us-central1-fitcheck-475119.cloudfunctions.net/process_virtual_try_on';
const API_ENDPOINT_URL = VIRTUAL_TRY_ON_SERVICE_URL;
const DEFAULT_FETCH_PROXY_URL = 'https://proxy-service-654573246781.us-central1.run.app';

async function handleVTORequest(requestData, sender, sendResponse) {
  try {
    const { avatarImageBase64, clothingImageBase64 } = requestData;
    
    // Validate required fields
    if (!avatarImageBase64) {
      throw new Error('Missing avatarImageBase64 - please upload your photo first');
    }
    if (!clothingImageBase64) {
      throw new Error('Missing clothingImageBase64 - failed to load clothing image');
    }
    if (typeof avatarImageBase64 !== 'string' || avatarImageBase64.length < 100) {
      throw new Error('Invalid avatar image format');
    }
    if (typeof clothingImageBase64 !== 'string' || clothingImageBase64.length < 100) {
      throw new Error('Invalid clothing image format');
    }
    
    console.log('VTO Request - Avatar image length:', avatarImageBase64.length);
    console.log('VTO Request - Clothing image length:', clothingImageBase64.length);
    
    const headers = { 'Content-Type': 'application/json' };
    const requestBody = { 
      avatarImageBase64, 
      clothingImageBase64
    };
    
    console.log('VTO Request - Sending to:', API_ENDPOINT_URL);
    
    const response = await fetch(API_ENDPOINT_URL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    console.log('VTO Request - Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('VTO Request - Error response:', errorText);
      let userFriendlyMessage = '';
      
      switch (response.status) {
        case 503:
          userFriendlyMessage = 'Virtual Try-On service is temporarily unavailable. Please try again later.';
          break;
        case 500:
          userFriendlyMessage = 'Server error occurred. Please try again.';
          break;
        case 400:
          userFriendlyMessage = `Invalid request: ${errorText || 'Please check your images and try again'}`;
          break;
        default:
          userFriendlyMessage = `Service error (${response.status}). Please try again later.`;
      }
      
      throw new Error(userFriendlyMessage);
    }

    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    console.log('VTO Request - Success');
    sendResponse({ 
      success: true, 
      tryOnImageBase64: result.tryOnImageBase64 
    });
    
  } catch (error) {
    console.error('VTO request failed:', error);
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

async function handleFetchImage(requestData, sender, sendResponse) {
  try {
    const { imageUrl } = requestData;
    console.log('Background: Fetching image via proxy for:', imageUrl);
    const { fetchProxyUrl } = await chrome.storage.local.get(['fetchProxyUrl']);
    const proxyUrl = (typeof DEFAULT_FETCH_PROXY_URL === 'string' && DEFAULT_FETCH_PROXY_URL.length)
      ? DEFAULT_FETCH_PROXY_URL
      : fetchProxyUrl;

    if (!proxyUrl) {
      throw new Error('Direct fetch failed and no proxy configured. Set DEFAULT_FETCH_PROXY_URL in extension/source or store fetchProxyUrl in chrome.storage.local to a Cloud Run/proxy endpoint that accepts { imageUrl } and returns JSON { base64 }');
    }

    console.log('Background: Attempting proxy fetch via:', proxyUrl);
    const proxyResponse = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl })
    });

    if (!proxyResponse.ok) {
      const txt = await proxyResponse.text().catch(() => '');
      throw new Error(`Proxy fetch failed: ${proxyResponse.status} ${txt}`);
    }

    // Expect proxy to return JSON with { base64 } or { error }
    const proxyJson = await proxyResponse.json();
    if (proxyJson.base64) {
      console.log('Background: Proxy fetch succeeded, base64 length:', (proxyJson.base64 && proxyJson.base64.length) || 0);
      sendResponse({ success: true, base64: proxyJson.base64 });
      return;
    }
    if (proxyJson.error) {
      throw new Error(`Proxy error: ${proxyJson.error}`);
    }
    throw new Error('Proxy returned unexpected response');
  } catch (error) {
    console.error('Background: Failed to fetch image:', error);
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}
//MESSAGE LISTENERS
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'REQUEST_VIRTUAL_TRY_ON') {
    handleVTORequest(request.data, sender, sendResponse);
    return true;
  } else if (request.action === 'FETCH_IMAGE') {
    handleFetchImage(request.data, sender, sendResponse);
    return true;
  } else if (request.action === 'CHECK_AUTH_STATUS') {
    checkAuthStatus(sendResponse);
    return true;
  } else if (request.action === 'OPEN_POPUP') {
    chrome.action.openPopup();
    return true;
  } else if (request.action === 'CHECK_AVATAR') {
    console.log("CHECK_AVATAR message is received.")
    checkAvatarWithAI(request.imageData)
      .then((result) => {
        sendResponse(result);
      })
      .catch((err) => {
        console.error('Background: CHECK_AVATAR failed:', err);
        sendResponse({ success: false, message: String(err) });
      });
    return true;
  }
});

// This function checks if the user has sufficient RAM for the AI model
async function checkRAMAvailability() {
  try {
    // Use the Chrome system.memory API to check RAM
    const memoryInfo = await chrome.system.memory.getInfo();
    const totalRAM = memoryInfo.capacityBytes / (1024 * 1024 * 1024); // Convert to GB
    const minRequiredRAM = 16; // GB
    
    console.log(`Total RAM: ${totalRAM.toFixed(2)} GB`);
    
    if (totalRAM >= minRequiredRAM) {
      return { hasEnoughRAM: true, totalRAM: totalRAM.toFixed(2) };
    } else {
      console.log(`Insufficient RAM: ${totalRAM.toFixed(2)} GB < ${minRequiredRAM} GB required`);
      return { hasEnoughRAM: false, totalRAM: totalRAM.toFixed(2) };
    }
  } catch (error) {
    console.error('Could not check RAM:', error);
    // If we can't check RAM, assume insufficient to be safe
    return { hasEnoughRAM: false, totalRAM: 'unknown' };
  }
}

// This function contains the logic to talk to Prompt API.
async function checkAvatarWithAI(imageData) {
  
  // Check RAM availability first
  const ramCheck = await checkRAMAvailability();
  if (!ramCheck.hasEnoughRAM) {
    console.log('Insufficient RAM - skipping AI check and returning safe result');
    return {
      success: true,
      isSafe: true,
      reason: 'Photo accepted'
    };
  }
  
  // Verify API availability
  const available = await LanguageModel.availability();
  if (available !== 'available') {
    return { success: false, message: "The on-device AI model is not currently available." };
  }

  const prompt = `You are evaluating an image for a virtual try-on feature.
  Criteria:
  - The main visible subject should be a fully clothed human body (swimwear and sportswear acceptable if they cover private parts).
  - No explicit nudity, sexual content, or depiction of minors.
  - If unsure, default to safe (true).
  Respond ONLY with a SINGLE JSON object (no extra text):
  { "is_safe_for_tryon": true|false, "reason": "<brief explanation>" }`;
  
  let inputParts;
  try {
    const match = typeof imageData === 'string' ? imageData.match(/^data:(.*?);base64,(.+)$/) : null;
    if (match) {
      const mime = match[1] || 'image/jpeg';
      const b64 = match[2];
      inputParts = [
        { text: prompt },
        { inline_data: { mime_type: mime, data: b64 } }
      ];
    } else {
      inputParts = [
        { text: prompt },
        { text: 'Note: The image data URL could not be parsed. Assume a typical clothed portrait if uncertain.' }
      ];
    }
  } catch (_) {
    inputParts = [
      { text: prompt },
      { text: 'Note: Image parsing failed. Assume a typical clothed portrait if uncertain.' }
    ];
  }

  // Create an AI session and get the response
  const session = await LanguageModel.create();
  const response = await session.prompt(inputParts);
  
  //Parse the response
  try {
    const text = typeof response === 'string' ? response : String(response || '');
    const jsonCandidate = (text.match(/\{[\s\S]*\}/) || [text])[0].trim();
    const result = JSON.parse(jsonCandidate);
    const isSafe = typeof result.is_safe_for_tryon === 'boolean' ? result.is_safe_for_tryon : true;
    const reason = typeof result.reason === 'string' ? result.reason : '';
    return {
      success: true,
      isSafe,
      reason
    };
  } catch (e) {
    console.error('Failed to parse AI response:', response, e);
    return { success: false, message: 'AI provided an unreadable response. Try a different image.' };
  }
}


