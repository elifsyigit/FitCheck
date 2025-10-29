const fileInput = document.getElementById('fileInput');
const uploadSection = document.getElementById('uploadSection');
const avatarPreview = document.getElementById('avatarPreview');
const avatarImg = document.getElementById('avatarImg');
const avatarName = document.getElementById('avatarName');
const status = document.getElementById('status');
const selectedImagePreview = document.getElementById('selectedImagePreview');
const selectedImage = document.getElementById('selectedImage');
const selectedImageInfo = document.getElementById('selectedImageInfo');
const clearSelectionBtn = document.getElementById('clearSelectionBtn');
const uploadBtn = document.getElementById('uploadBtn');
const changeAvatarBtn = document.getElementById('changeAvatarBtn');

let currentSettings = {
    notifications: true
};
let firebaseApp;


async function initializeFirebase() {
    try {
        if (typeof firebase === 'undefined') {
            console.error('Firebase SDK not loaded');
            return;
        }

        // Waiting a bit for firebaseConfig.js to initialize Firebase
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
        }
        
        updateUI();
        
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
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }
    
    if (uploadSection) {
        uploadSection.addEventListener('dragover', handleDragOver);
        uploadSection.addEventListener('dragleave', handleDragLeave);
        uploadSection.addEventListener('drop', handleDrop);
        
        uploadSection.addEventListener('click', () => {
            if (fileInput) fileInput.click();
        });
    }
    
    if (uploadBtn) {
        uploadBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent event from bubbling to uploadSection
            if (fileInput) fileInput.click();
        });
    }
    
    if (clearSelectionBtn) {
        clearSelectionBtn.addEventListener('click', clearSelectedImage);
    }
    
    if (changeAvatarBtn) {
        changeAvatarBtn.addEventListener('click', resetAvatar);
    }
    
    const notificationsToggle = document.getElementById('notificationsToggle');
    if (notificationsToggle) {
        notificationsToggle.addEventListener('click', () => {
            toggleSetting('notifications');
        });
    }
}

function handleDragOver(e) {
    e.preventDefault();
    if (uploadSection) uploadSection.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    if (uploadSection) uploadSection.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    if (uploadSection) uploadSection.classList.remove('dragover');
    
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

function toggleSetting(settingName) {
    currentSettings[settingName] = !currentSettings[settingName];
    chrome.storage.local.set({ settings: currentSettings });
    updateUI();
}

function updateUI() {
    // Update notifications toggle
    const notificationsToggle = document.getElementById('notificationsToggle');
    if (notificationsToggle) {
        notificationsToggle.classList.toggle('active', currentSettings.notifications);
    }
}