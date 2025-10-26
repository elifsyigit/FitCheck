const VIRTUAL_TRY_ON_SERVICE_URL = 'https://us-central1-fitcheck-475119.cloudfunctions.net/process_virtual_try_on';
const API_ENDPOINT_URL = VIRTUAL_TRY_ON_SERVICE_URL;




async function handleVTORequest(requestData, sender, sendResponse) {
  try {
    const { avatarImageBase64, clothingImageBase64, clothingUrl } = requestData;
    
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
    console.log('VTO Request - Clothing URL:', clothingUrl);
    
    const headers = { 'Content-Type': 'application/json' };
    const requestBody = { 
      avatarImageBase64, 
      clothingImageBase64, 
      clothingUrl 
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
    
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    
    const blob = await response.blob();
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    
    console.log('Background: Image fetched and converted to base64, length:', base64.length);
    
    sendResponse({ 
      success: true, 
      base64: base64
    });
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

