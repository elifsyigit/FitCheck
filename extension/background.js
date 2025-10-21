const VIRTUAL_TRY_ON = 'https://process-virtual-try-on-654573246781.europe-west1.run.app';
const API_ENDPOINT_URL = VIRTUAL_TRY_ON;
const GET_FIREBASE_KEY_ = 'https://get-firebase-key-gkxrzhyecq-uc.a.run.app';
const GET_FIREBASE_KEY_URLS = [GET_FIREBASE_KEY_];
let FIREBASE_CONFIG = null;

async function getFirebaseConfig() {
  if (FIREBASE_CONFIG) return FIREBASE_CONFIG;

  try {
    const stored = await chrome.storage.local.get(['firebaseConfig', 'firebaseConfigFetchedAt']);
    if (stored && stored.firebaseConfig) {
      FIREBASE_CONFIG = stored.firebaseConfig;
      return FIREBASE_CONFIG;
    }
  } catch (e) {
    console.warn('Failed to read cached firebaseConfig', e);
  }

  async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  let resp = null;
  let lastErr = null;
  for (const url of GET_FIREBASE_KEY_URLS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
        if (r && r.ok) { resp = r; break; }
        const t = await r.text().catch(() => '');
        throw new Error(`HTTP ${r.status} ${t}`);
      } catch (e) {
        lastErr = e;
        const backoff = 250 * Math.pow(2, attempt);
        console.warn(`getFirebaseConfig attempt ${attempt + 1} for ${url} failed:`, e, `backoff=${backoff}ms`);
        await sleep(backoff);
      }
    }
    if (resp && resp.ok) break;
  }
  if (!resp || !resp.ok) {
    console.warn('Firebase config endpoint failed, using fallback config');
    const fallbackConfig = {
      apiKey: 'demo-api-key',
      authDomain: 'fitcheck-project.firebaseapp.com',
      projectId: 'fitcheck-project',
      storageBucket: 'fitcheck-project.appspot.com',
      messagingSenderId: 'demo-sender',
      appId: 'demo-app'
    };
    FIREBASE_CONFIG = fallbackConfig;
    return FIREBASE_CONFIG;
  }

  const body = await resp.json().catch(() => null);
  const cfg = (body && (body.firebaseConfig || body.config)) || null;
  if (!cfg) {
    console.warn('Invalid firebase config response, using fallback config');
    const fallbackConfig = {
      apiKey: 'demo-api-key',
      authDomain: 'fitcheck-project.firebaseapp.com',
      projectId: 'fitcheck-project',
      storageBucket: 'fitcheck-project.appspot.com',
      messagingSenderId: 'demo-sender',
      appId: 'demo-app'
    };
    FIREBASE_CONFIG = fallbackConfig;
    return FIREBASE_CONFIG;
  }

  try {
    await chrome.storage.local.set({ firebaseConfig: cfg, firebaseConfigFetchedAt: Date.now() });
  } catch (e) {
    console.warn('Failed to cache firebase config', e);
  }

  FIREBASE_CONFIG = cfg;
  return FIREBASE_CONFIG;
}

async function SecureAPIKey() {
  const cfg = await getFirebaseConfig();
  return cfg && cfg.apiKey ? cfg.apiKey : null;
}

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
      throw new Error(`HTTP ${response.status}: ${errorText}`);
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
  } else if (request.action === 'FIREBASE_STATE_CHANGED') {
    handleFirebaseStateChange(request.data);
    return true;
  } else if (request.action === 'GET_FIREBASE_CONFIG') {
    handleGetFirebaseConfig(sendResponse);
    return true;
  }
});

async function checkAuthStatus(sendResponse) {
  sendResponse({ success: true, firebaseInitialized: !!FIREBASE_CONFIG });
}

async function handleGetFirebaseConfig(sendResponse) {
  try {
    const cfg = await getFirebaseConfig();
    sendResponse({ success: true, config: cfg });
  } catch (error) {
    console.error('Error getting Firebase config:', error);
    sendResponse({ success: false, error: error.message });
  }
}
