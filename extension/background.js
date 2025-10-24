const VIRTUAL_TRY_ON_SERVICE_URL = 'https://vto-service-654573246781.europe-west1.run.app';
const API_ENDPOINT_URL = VIRTUAL_TRY_ON_SERVICE_URL;




async function handleVTORequest(requestData, sender, sendResponse) {
  try {
    const { avatarImageBase64, clothingImageBase64, clothingUrl } = requestData;
    
    const headers = { 'Content-Type': 'application/json' };
    const response = await fetch(API_ENDPOINT_URL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ avatarImageBase64, clothingImageBase64, clothingUrl })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let userFriendlyMessage = '';
      
      switch (response.status) {
        case 503:
          userFriendlyMessage = 'Virtual Try-On service is temporarily unavailable. Please try again later.';
          break;
        case 500:
          userFriendlyMessage = 'Server error occurred. Please try again.';
          break;
        case 400:
          userFriendlyMessage = 'Invalid request. Please check your image and try again.';
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'REQUEST_VIRTUAL_TRY_ON') {
    handleVTORequest(request.data, sender, sendResponse);
    return true;
  } else if (request.action === 'CHECK_AUTH_STATUS') {
    checkAuthStatus(sendResponse);
    return true;
  } else if (request.action === 'OPEN_POPUP') {
    chrome.action.openPopup();
    return true;
  }
});

