// Cryptographic utilities for extension security
// Note: Chrome extensions can't use Node.js crypto, so we use Web Crypto API

class ExtensionCrypto {
    constructor(secret) {
        this.secret = secret;
    }

    async generateHMAC(data) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(this.secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        const signature = await crypto.subtle.sign(
            'HMAC',
            key,
            encoder.encode(data)
        );

        // Convert to hex string
        const hashArray = Array.from(new Uint8Array(signature));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async generateExtensionSignature() {
        const timestamp = Date.now().toString();
        const extensionId = chrome.runtime.id;
        const data = `${extensionId}${timestamp}`;
        
        const signature = await this.generateHMAC(data);
        
        return { signature, timestamp };
    }

    // Simple fallback for environments without Web Crypto API
    generateSimpleSignature() {
        const timestamp = Date.now().toString();
        const extensionId = chrome.runtime.id;
        const data = `${extensionId}${timestamp}`;
        
        // Simple hash (not cryptographically secure)
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        return { 
            signature: hash.toString(16), 
            timestamp 
        };
    }
}

// Export for use in other files
window.ExtensionCrypto = ExtensionCrypto;
