const fileInput = document.getElementById('fileInput');
const uploadSection = document.getElementById('uploadSection');
const avatarPreview = document.getElementById('avatarPreview');
const avatarImg = document.getElementById('avatarImg');
const avatarName = document.getElementById('avatarName');
const status = document.getElementById('status');
const authStatus = document.getElementById('authStatus');
const selectionModeSection = document.getElementById('selectionModeSection');
const manualSelectionToggle = document.getElementById('manualSelectionToggle');
const selectionInstructions = document.getElementById('selectionInstructions');
const selectedImagePreview = document.getElementById('selectedImagePreview');
const selectedImage = document.getElementById('selectedImage');
const selectedImageInfo = document.getElementById('selectedImageInfo');
const clearSelectionBtn = document.getElementById('clearSelectionBtn');
const uploadBtn = document.getElementById('uploadBtn');
const changeAvatarBtn = document.getElementById('changeAvatarBtn');

let currentSettings = {
    autoDetect: false,
    notifications: true,
    manualSelection: false
};
let firebaseApp;


async function initializeFirebase() {
    try {
        if (typeof firebase === 'undefined') {
            console.error('Firebase SDK not loaded');
            return;
        }

        // Wait a bit for firebaseConfig.js to initialize Firebase
        await new Promise(resolve => setTimeout(resolve, 200));
        
        firebaseApp = firebase.app();
        console.log('Firebase app retrieved successfully');

    } catch (error) {
        console.error('Firebase initialization failed:', error);
        showStatus('Firebase initialization failed. Running in offline mode.', 'error');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await initializeFirebase();
    await loadStoredData();
    setupEventListeners();
    setupMessageListener();
});


async function loadStoredData() {
    try {
        const result = await chrome.storage.local.get(['userAvatar', 'settings', 'selectedImage']);
        
        if (result.userAvatar) {
            displayAvatar(result.userAvatar);
        }
        
        if (result.settings) {
            currentSettings = { ...currentSettings, ...result.settings };
            updateToggleStates();
        }
        
        if (result.selectedImage) {
            displaySelectedImage(result.selectedImage);
        }
    } catch (error) {
        showStatus('Error loading saved data', 'error');
    }
}

function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'IMAGE_SELECTED') {
            displaySelectedImage(message.data);
            chrome.storage.local.set({ selectedImage: message.data });
            showStatus('Image selected successfully!', 'success');
        }
    });
}

function setupEventListeners() {
    fileInput.addEventListener('change', handleFileSelect);
    
    uploadSection.addEventListener('dragover', handleDragOver);
    uploadSection.addEventListener('dragleave', handleDragLeave);
    uploadSection.addEventListener('drop', handleDrop);
    
    uploadSection.addEventListener('click', () => {
        fileInput.click();
    });
    
    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });
    
    // Authentication removed
    
    clearSelectionBtn.addEventListener('click', clearSelectedImage);
    changeAvatarBtn.addEventListener('click', resetAvatar);
    
    // Toggle event listeners
    const autoDetectToggleEl = document.getElementById('autoDetectToggle');
    if (autoDetectToggleEl) {
        autoDetectToggleEl.addEventListener('click', () => {
            toggleSetting('autoDetect');
        });
    }
    
    document.getElementById('notificationsToggle').addEventListener('click', () => {
        toggleSetting('notifications');
    });
    
    if (manualSelectionToggle) {
        manualSelectionToggle.addEventListener('click', toggleManualSelection);
    }
}

function handleDragOver(e) {
    e.preventDefault();
    uploadSection.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadSection.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    uploadSection.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        processFile(file);
    }
}

function processFile(file) {
    if (!file.type.startsWith('image/')) {
        showStatus('Please select a valid image file', 'error');
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        showStatus('Image size must be less than 5MB', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64Data = e.target.result;
        const avatarData = {
            base64: base64Data,
            fileName: file.name,
            uploadDate: new Date().toISOString(),
            fileSize: file.size
        };
        
        try {
            await chrome.storage.local.set({ userAvatar: avatarData });
            displayAvatar(avatarData);
            showStatus('Photo uploaded successfully!', 'success');
            
        } catch (error) {
            showStatus('Error saving photo', 'error');
        }
    };
    
    reader.readAsDataURL(file);
}

function displayAvatar(avatarData) {
    if (avatarImg) avatarImg.src = avatarData.base64;
    if (avatarName) avatarName.textContent = avatarData.fileName;
    if (uploadSection) uploadSection.style.display = 'none';
    if (avatarPreview) avatarPreview.style.display = 'block';
}

function resetAvatar() {
    if (uploadSection) uploadSection.style.display = 'block';
    if (avatarPreview) avatarPreview.style.display = 'none';
    if (fileInput) fileInput.value = '';
    chrome.storage.local.remove(['userAvatar']);
}



function toggleSetting(setting) {
    currentSettings[setting] = !currentSettings[setting];
    updateToggleStates();
    chrome.storage.local.set({ settings: currentSettings });
}

function updateToggleStates() {
    Object.keys(currentSettings).forEach(key => {
        const toggle = document.getElementById(`${key}Toggle`);
        if (toggle) {
            toggle.classList.toggle('active', currentSettings[key]);
        }
    });
    
    updateSelectionModeUI();
}

function updateSelectionModeUI() {
    const isAutoDetectOff = !currentSettings.autoDetect;
    if (selectionModeSection) selectionModeSection.style.display = isAutoDetectOff ? 'block' : 'none';
    
    if (currentSettings.manualSelection && isAutoDetectOff) {
        if (selectionInstructions) selectionInstructions.style.display = 'block';
        sendMessageToContentScript({ action: 'ENABLE_MANUAL_SELECTION' });
    } else {
        if (selectionInstructions) selectionInstructions.style.display = 'none';
        sendMessageToContentScript({ action: 'DISABLE_MANUAL_SELECTION' });
    }
}

function toggleManualSelection() {
    currentSettings.manualSelection = !currentSettings.manualSelection;
    updateToggleStates();
    chrome.storage.local.set({ settings: currentSettings });
    
    if (currentSettings.manualSelection) {
        showStatus('Manual selection enabled. Click on images to select them.', 'success');
    } else {
        showStatus('Manual selection disabled.', 'success');
        clearSelectedImage();
    }
}

function clearSelectedImage() {
    if (selectedImagePreview) selectedImagePreview.style.display = 'none';
    chrome.storage.local.remove(['selectedImage']);
    sendMessageToContentScript({ action: 'CLEAR_IMAGE_SELECTION' });
}

function displaySelectedImage(imageData) {
    if (selectedImage) selectedImage.src = imageData.src;
    if (selectedImageInfo) selectedImageInfo.textContent = `Selected from: ${imageData.domain}`;
    if (selectedImagePreview) selectedImagePreview.style.display = 'block';
}

async function sendMessageToContentScript(message) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
            await chrome.tabs.sendMessage(tab.id, message);
        }
    } catch (error) {
        // Could not send message to content script
    }
}

function showStatus(message, type) {
    if (!status) return;
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';
    
    setTimeout(() => {
        if (status) status.style.display = 'none';
    }, 3000);
}