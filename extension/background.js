const VIRTUAL_TRY_ON_SERVICE_URL = 'https://us-central1-fitcheck-475119.cloudfunctions.net/process_virtual_try_on';
const API_ENDPOINT_URL = VIRTUAL_TRY_ON_SERVICE_URL;
const DEFAULT_FETCH_PROXY_URL = 'https://proxy-service-654573246781.europe-west1.run.app';




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
    
    // Validate that they are actual base64 strings
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
    
    console.log('Background: Fetching image from:', imageUrl);
    // First attempt: direct fetch (fastest when CORS allows)
    let directResponse = null;
    try {
      directResponse = await fetch(imageUrl, { mode: 'cors' });
    } catch (err) {
      console.warn('Background: Direct fetch threw, will try proxy if available:', err.message);
      directResponse = null;
    }

    if (directResponse && directResponse.ok) {
      try {
        const blob = await directResponse.blob();
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        console.log('Background: Direct fetch succeeded and converted to base64, length:', base64.length);
        sendResponse({ success: true, base64: base64 });
        return;
      } catch (err) {
        console.warn('Background: Failed to convert direct fetch blob to base64, will try proxy:', err.message);
        // fallthrough to proxy attempt
      }
    } else {
      console.warn('Background: Direct fetch returned non-ok response or was blocked by CORS. Response:', directResponse && directResponse.status);
    }

    // Fallback: try proxy/cloud-run fetch.
    // Priority: use DEFAULT_FETCH_PROXY_URL (hard-coded), otherwise fall back to chrome.storage.local.fetchProxyUrl.
    // Set DEFAULT_FETCH_PROXY_URL to your deployed Cloud Run/proxy URL to make the extension use it by default.
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
  }
});

