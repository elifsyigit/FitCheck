class FitCheckContentScript {
  constructor() {
    this.observer = null;
    this.processedImages = new Set();
    this.siteConfig = this.getSiteConfig();
    this.settings = { autoDetect: false };
    this.injectStyles();
    this.loadSettings();
  }

  injectStyles() {
    if (document.getElementById('fitcheck-content-styles')) {
      console.log('FitCheck (CS): Styles already loaded');
      return;
    }

    const link = document.createElement('link');
    link.id = 'fitcheck-content-styles';
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('content.css');
    
    link.onload = () => {
      console.log('FitCheck (CS): CSS styles loaded successfully');
    };
    
    link.onerror = () => {
      console.error('FitCheck (CS): Failed to load CSS styles, injecting fallback styles');
    };
    
    document.head.appendChild(link);
    console.log('FitCheck (CS): Injecting CSS styles from:', chrome.runtime.getURL('content.css'));
  }

  getSiteConfig() {
    console.log("getSiteConfig function is called")
    const hostname = window.location.hostname;
    console.log('FitCheck (CS): Detected hostname:', hostname);
    
    if (hostname.includes('amazon')) {
      return {
        imageSelectors: [
          '#landingImage',
          '#imgTagWrapperId img',
          '.a-dynamic-image',
          '#main-image-container img',
          '.image-main img'
        ],
        containerSelectors: [
          '#imgTagWrapperId',
          '#main-image-container',
          '.image-main',
          '#landingImage'
        ],
        buttonPosition: 'after'
      };
    } else if (hostname.includes('zara')) {
      return {
        imageSelectors: [
          '.product-detail-images img',
          '.media-image img',
          '.product-image img',
          '[data-testid="media-image"] img'
        ],
        containerSelectors: [
          '.product-detail-images',
          '.media-image',
          '.product-image',
          '[data-testid="media-image"]'
        ],
        buttonPosition: 'after'
      };
    }
    
    return {
      imageSelectors: ['img[src*="product"]', 'img[alt*="model"]', 'img[width="500"]'],
      containerSelectors: ['body'],
      buttonPosition: 'after'
    };
  }

  isClothingProductPage() {
    const CLOTHING_KEYWORDS = [
      'elbise', 'gömlek', 'ceket', 'pantolon', 'etek', 't-shirt',
      'ayakkabi', 'giyim', 'ayakkabi', 'ceket',
      'dress', 'shirt', 'jacket', 'pants', 'skirt', 'shoes', 'apparel', 'clothing', 'fashion'
    ];

    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent);
        const dataString = JSON.stringify(data).toLowerCase();
        const isProductOrOffer = dataString.includes('"@type":"product"') || dataString.includes('"@type":"offer"');
        if (isProductOrOffer && CLOTHING_KEYWORDS.some(keyword => dataString.includes(keyword))) {
          console.log('FitCheck (CS): Schema Markup ile kıyafet ürünü algılandı.');
          return true;
        }
      } catch (e) {}
    }

    const sizeSelectors = [
      '[id*="size-selector"]', '[class*="size-selector"]',
      '[id*="beden-secimi"]', '[class*="beden-secimi"]',
      'select[name*="size"]', 'select[id*="beden"]'
    ];
    if (sizeSelectors.some(selector => document.querySelector(selector))) {
      console.log('FitCheck (CS): Beden seçici algılandı.');
      return true;
    }

    const urlPath = window.location.pathname.toLowerCase();
    if (CLOTHING_KEYWORDS.some(keyword => (urlPath.includes(keyword) && (urlPath.includes('/urun') || urlPath.includes('/product'))))) {
      console.log("FitCheck (CS): URL'de kıyafet kategorisi/ürünü algılandı.");
      return true;
    }

    return false;
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['settings']);
      if (result.settings) {
        this.settings = { ...this.settings, ...result.settings };
        console.log('FitCheck (CS): Settings loaded:', this.settings);
      }
      this.init();
    } catch (error) {
      console.error('FitCheck (CS): Error loading settings:', error);
      this.init();
    }
  }

  init() {
    console.log('FitCheck (CS): Initializing content script');
    console.log('FitCheck (CS): Auto-detect setting:', this.settings.autoDetect);
    
    if (!this.settings.autoDetect) {
      console.log('FitCheck (CS): Auto-detect is disabled. Buttons will not be shown automatically.');
      return;
    }
    
    if (!this.isClothingProductPage()) {
      console.log('FitCheck (CS): Sayfa kıyafet ürünü değil veya denemeye uygun değil. Otomatik başlatma durduruldu.');
      return;
    }

    console.log('FitCheck (CS): Clothing product page detected, starting processing');
    this.observeDOM();
    this.processExistingImages();
  }


  observeDOM() {
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.processNode(node);
            }
          });
        }
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  processNode(node) {
    if (node.tagName === 'IMG') {
      this.processImage(node);
    } else if (node.querySelectorAll) {
      const images = node.querySelectorAll('img');
      images.forEach(img => this.processImage(img));
    }
  }

  processExistingImages() {
    const images = document.querySelectorAll('img');
    images.forEach(img => this.processImage(img));
  }

  processImage(img) {
    if (this.processedImages.has(img.src)) {
      return;
    }

    // Debug: Log all image details
    console.log('FitCheck (CS): Processing image element:', {
      src: img.src,
      alt: img.alt,
      className: img.className,
      id: img.id,
      tagName: img.tagName,
      parentElement: img.parentElement?.tagName,
      parentClassName: img.parentElement?.className
    });

    if (!this.isProductImage(img)) {
      console.log('FitCheck (CS): Image not suitable for try-on:', img.src);
      return;
    }

    console.log('FitCheck (CS): Processing suitable image:', img.src);
    this.processedImages.add(img.src);
    
    setTimeout(() => {
      console.log('FitCheck (CS): Injecting try-on button for:', img.src);
      this.injectTryOnButton(img);
    }, 1000);
  }

  isProductImage(img) {
    const src = img.src.toLowerCase();
    const alt = (img.alt || '').toLowerCase();
    
    // Debug logging
    console.log('FitCheck (CS): Checking image:', {
      src: img.src,
      alt: img.alt,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      offsetWidth: img.offsetWidth,
      offsetHeight: img.offsetHeight
    });
    
    // Reject non-image URLs (like page URLs)
    if (!src.includes('.jpg') && !src.includes('.jpeg') && !src.includes('.png') && 
        !src.includes('.webp') && !src.includes('.gif') && !src.includes('data:image')) {
      console.log('FitCheck (CS): Rejected - not an image URL');
      return false;
    }
    
    if (src.includes('logo') || src.includes('icon') || src.includes('avatar')) {
      console.log('FitCheck (CS): Rejected - contains logo/icon/avatar');
      return false;
    }

    if (src.includes('transparent') || src.includes('placeholder') || src.includes('loading')) {
      console.log('FitCheck (CS): Rejected - transparent/placeholder/loading image');
      return false;
    }

    if (src.includes('data:') || src.includes('base64')) {
      console.log('FitCheck (CS): Rejected - data/base64 image');
      return false;
    }

    const selectorMatch = this.siteConfig.imageSelectors.some(selector => {
      try {
        const matches = img.matches(selector);
        if (matches) {
          console.log('FitCheck (CS): Matched selector:', selector);
        }
        return matches;
      } catch (e) {
        return false;
      }
    });

    if (selectorMatch) {
      console.log('FitCheck (CS): Accepted - matched site selector');
      return true;
    }

    const dimensions = {
      width: img.naturalWidth || img.offsetWidth,
      height: img.naturalHeight || img.offsetHeight
    };

    const sizeCheck = dimensions.width > 200 && dimensions.height > 200;
    console.log('FitCheck (CS): Size check:', dimensions, 'Passed:', sizeCheck);
    
    return sizeCheck;
  }

  injectTryOnButton(img) {
    if (img.closest('.fitcheck-try-on-container')) {
      console.log('FitCheck (CS): Button already exists for this image');
      return;
    }

    // Make sure the image container has relative positioning
    const imgRect = img.getBoundingClientRect();
    const container = img.parentElement;
    
    // Set the container to relative positioning if it's not already
    if (container && getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    console.log('FitCheck (CS): Creating try-on button');
    const button = this.createTryOnButton(img.src);
    
    console.log('FitCheck (CS): Image details:', {
      imgSrc: img.src,
      imgRect: imgRect,
      container: container,
      containerPosition: container ? getComputedStyle(container).position : 'none'
    });
    
    // Insert the button directly into the image's parent container
    if (container) {
      container.appendChild(button);
      console.log('FitCheck (CS): Button inserted into image container');
    } else {
      img.parentNode.appendChild(button);
      console.log('FitCheck (CS): Button inserted into image parent');
    }

    console.log('FitCheck (CS): Try-on button injected successfully');
    this.animateButton(button);
  }

  findImageContainer(img) {
    for (const selector of this.siteConfig.containerSelectors) {
      try {
        const container = img.closest(selector);
        if (container) {
          return container;
        }
      } catch (e) {
        continue;
      }
    }
    return img.parentElement;
  }

  createTryOnButton(imageUrl) {
    const container = document.createElement('div');
    container.className = 'fitcheck-try-on-container';

    const button = document.createElement('button');
    button.className = 'fitcheck-try-on-button';
    button.textContent = 'Try On';

    button.addEventListener('click', () => {
      this.handleTryOnClick(imageUrl, button);
    });

    container.appendChild(button);
    return container;
  }

  animateButton(buttonContainer) {
    console.log('FitCheck (CS): Button positioned, container:', buttonContainer);
    console.log('FitCheck (CS): Button container position:', {
      offsetTop: buttonContainer.offsetTop,
      offsetLeft: buttonContainer.offsetLeft,
      offsetWidth: buttonContainer.offsetWidth,
      offsetHeight: buttonContainer.offsetHeight,
      style: buttonContainer.style.cssText
    });
    
    // Add a subtle scale animation for better UX
    buttonContainer.style.transform = 'scale(0.8)';
    buttonContainer.style.opacity = '1';
    
    setTimeout(() => {
      buttonContainer.style.transform = 'scale(1)';
      console.log('FitCheck (CS): Button animation completed');
    }, 150);
  }

  async handleTryOnClick(imageUrl, buttonElement) {
    const button = buttonElement || document.querySelector('.fitcheck-try-on-button');
    const originalText = button.textContent;
    
    button.textContent = 'Processing...';
    button.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'REQUEST_VIRTUAL_TRY_ON',
        data: {
          clothingImageBase64: null,
          clothingUrl: imageUrl
        }
      });

      if (response.success) {
        this.showTryOnResult(response.tryOnImageBase64);
      } else if (response.requiresAuth) {
        this.showAuthRequiredError();
      } else {
        this.showError(response.error || 'Try-on failed');
      }
    } catch (error) {
      this.showError('Failed to connect to FitCheck service');
    } finally {
      button.textContent = originalText;
      button.disabled = false;
    }
  }

  showTryOnResult(imageBase64) {
    const modal = this.createModal();
    const img = modal.querySelector('img');
    img.src = `data:image/jpeg;base64,${imageBase64}`;
    document.body.appendChild(modal);
  }

  showError(message) {
    const modal = this.createModal();
    const content = modal.querySelector('.modal-content');
    content.innerHTML = `
      <div class="modal-error">
        <h3>Error</h3>
        <p>${message}</p>
      </div>
    `;
    document.body.appendChild(modal);
  }

  showAuthRequiredError() {
    this.showError('Authentication required. Please open the extension popup to sign in.');
  }

  createModal() {
    const modal = document.createElement('div');
    modal.className = 'fitcheck-modal';

    const content = document.createElement('div');
    content.className = 'modal-content';

    const img = document.createElement('img');

    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close-btn';
    closeBtn.textContent = 'Close';

    closeBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });

    content.appendChild(img);
    content.appendChild(closeBtn);
    modal.appendChild(content);

    return modal;
  }


  removeAllTryOnButtons() {
    const buttons = document.querySelectorAll('.fitcheck-try-on-container');
    buttons.forEach(button => button.remove());
  }

  destroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
    this.removeAllTryOnButtons();
  }
}

// Global instance for message handling
let fitCheckInstance = null;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    fitCheckInstance = new FitCheckContentScript();
  });
} else {
  fitCheckInstance = new FitCheckContentScript();
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'RELOAD_SETTINGS' && fitCheckInstance) {
    console.log('FitCheck (CS): Reloading settings...');
    fitCheckInstance.loadSettings();
  }
});
