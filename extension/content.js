class FitCheckContentScript {
  constructor() {
    this.observer = null;
    this.processedImages = new Set();
    this.siteConfig = this.getSiteConfig();
    this.manualSelectionMode = false;
    this.imageClickListeners = new Map();
    this.hoverButtons = new Map(); // Store hover buttons for each image
    this.init();
    this.setupMessageListener();
  }

  getSiteConfig() {
    const hostname = window.location.hostname;
    
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

  init() {
    if (!this.isClothingProductPage()) {
      console.log('FitCheck (CS): Sayfa kıyafet ürünü değil veya denemeye uygun değil. Otomatik başlatma durduruldu.');
      return;
    }

    this.observeDOM();
    this.processExistingImages();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.action) {
        case 'ENABLE_MANUAL_SELECTION':
          this.enableManualSelection();
          break;
        case 'DISABLE_MANUAL_SELECTION':
          this.disableManualSelection();
          break;
        case 'CLEAR_IMAGE_SELECTION':
          this.clearImageSelection();
          break;
      }
    });
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

    if (!this.isProductImage(img)) {
      return;
    }

    this.processedImages.add(img.src);
    
    if (this.manualSelectionMode) {
      this.addImageClickListener(img);
    } else {
      // Add hover functionality instead of injecting button below
      this.addHoverButton(img);
    }
  }

  isProductImage(img) {
    const src = img.src.toLowerCase();
    const alt = (img.alt || '').toLowerCase();
    
    if (src.includes('logo') || src.includes('icon') || src.includes('avatar')) {
      return false;
    }

    if (src.includes('data:') || src.includes('base64')) {
      return false;
    }

    const selectorMatch = this.siteConfig.imageSelectors.some(selector => {
      try {
        return img.matches(selector);
      } catch (e) {
        return false;
      }
    });

    if (selectorMatch) {
      return true;
    }

    const dimensions = {
      width: img.naturalWidth || img.offsetWidth,
      height: img.naturalHeight || img.offsetHeight
    };

    return dimensions.width > 200 && dimensions.height > 200;
  }

  injectTryOnButton(img) {
    if (img.closest('.fitcheck-try-on-container')) {
      return;
    }

    const container = this.findImageContainer(img);
    if (!container) return;

    const button = this.createTryOnButton(img.src);
    
    if (this.siteConfig.buttonPosition === 'after') {
      container.parentNode.insertBefore(button, container.nextSibling);
    } else {
      container.parentNode.insertBefore(button, container);
    }

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
    container.style.cssText = `
      margin: 10px 0;
      text-align: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    const button = document.createElement('button');
    button.className = 'fitcheck-try-on-button';
    button.textContent = 'FitCheck: Try On';
    button.style.cssText = `
      background: #007bff;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0,123,255,0.3);
      transition: all 0.2s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    button.addEventListener('mouseenter', () => {
      button.style.background = '#0056b3';
      button.style.transform = 'translateY(-1px)';
      button.style.boxShadow = '0 4px 8px rgba(0,123,255,0.4)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.background = '#007bff';
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = '0 2px 4px rgba(0,123,255,0.3)';
    });

    button.addEventListener('click', () => {
      this.handleTryOnClick(imageUrl, button);
    });

    container.appendChild(button);
    return container;
  }

  animateButton(buttonContainer) {
    setTimeout(() => {
      buttonContainer.style.opacity = '1';
    }, 100);
  }

  async handleTryOnClick(imageUrl, buttonElement) {
    const button = buttonElement || document.querySelector('.fitcheck-try-on-button');
    const originalText = button.textContent;
    
    button.textContent = 'Processing...';
    button.disabled = true;
    button.style.background = '#6c757d';

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
      button.style.background = '#007bff';
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
      <div style="color: #dc3545; text-align: center;">
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
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    `;

    const content = document.createElement('div');
    content.className = 'modal-content';
    content.style.cssText = `
      background: white;
      border-radius: 8px;
      padding: 20px;
      max-width: 90%;
      max-height: 90%;
      overflow: auto;
    `;

    const img = document.createElement('img');
    img.style.cssText = `
      max-width: 100%;
      max-height: 80vh;
      display: block;
    `;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = `
      background: #6c757d;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      margin-top: 10px;
      cursor: pointer;
    `;

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

  enableManualSelection() {
    this.manualSelectionMode = true;
    this.removeAllTryOnButtons();
    this.removeAllHoverButtons();
    this.addClickListenersToAllImages();
    this.showSelectionOverlay();
  }

  disableManualSelection() {
    this.manualSelectionMode = false;
    this.removeAllImageClickListeners();
    this.hideSelectionOverlay();
    this.removeAllTryOnButtons();
    // Re-add hover buttons for existing images
    this.processExistingImages();
  }

  clearImageSelection() {
    this.hideSelectionOverlay();
  }

  addImageClickListener(img) {
    if (this.imageClickListeners.has(img)) {
      return;
    }

    const clickHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.selectImage(img);
    };

    img.addEventListener('click', clickHandler);
    img.style.cursor = 'pointer';
    img.style.border = '2px solid #007bff';
    img.style.borderRadius = '4px';
    img.style.transition = 'border-color 0.2s ease';

    this.imageClickListeners.set(img, clickHandler);
  }

  removeImageClickListener(img) {
    const clickHandler = this.imageClickListeners.get(img);
    if (clickHandler) {
      img.removeEventListener('click', clickHandler);
      img.style.cursor = '';
      img.style.border = '';
      img.style.borderRadius = '';
      img.style.transition = '';
      this.imageClickListeners.delete(img);
    }
  }

  addClickListenersToAllImages() {
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      if (this.isProductImage(img)) {
        this.addImageClickListener(img);
      }
    });
  }

  removeAllImageClickListeners() {
    this.imageClickListeners.forEach((clickHandler, img) => {
      this.removeImageClickListener(img);
    });
  }

  selectImage(img) {
    const imageData = {
      src: img.src,
      alt: img.alt || '',
      domain: window.location.hostname,
      dimensions: {
        width: img.naturalWidth || img.offsetWidth,
        height: img.naturalHeight || img.offsetHeight
      }
    };

    chrome.runtime.sendMessage({
      action: 'IMAGE_SELECTED',
      data: imageData
    });

    this.showImageSelectedFeedback(img);
    this.injectTryOnButtonForSelectedImage(img);
  }

  showImageSelectedFeedback(img) {
    const feedback = document.createElement('div');
    feedback.className = 'fitcheck-selection-feedback';
    feedback.textContent = '✓ Selected for Virtual Try-On';
    feedback.style.cssText = `
      position: absolute;
      background: #28a745;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      z-index: 10000;
      pointer-events: none;
      animation: fadeInOut 2s ease-in-out;
    `;

    const rect = img.getBoundingClientRect();
    feedback.style.left = `${rect.left}px`;
    feedback.style.top = `${rect.top - 30}px`;

    document.body.appendChild(feedback);

    setTimeout(() => {
      if (document.body.contains(feedback)) {
        document.body.removeChild(feedback);
      }
    }, 2000);
  }

  injectTryOnButtonForSelectedImage(img) {
    const container = this.findImageContainer(img);
    if (!container) return;

    const existingButton = container.parentNode.querySelector('.fitcheck-try-on-container');
    if (existingButton) {
      existingButton.remove();
    }

    const button = this.createTryOnButton(img.src);
    
    if (this.siteConfig.buttonPosition === 'after') {
      container.parentNode.insertBefore(button, container.nextSibling);
    } else {
      container.parentNode.insertBefore(button, container);
    }

    this.animateButton(button);
  }

  showSelectionOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'fitcheck-selection-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #007bff;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,123,255,0.3);
      animation: slideInRight 0.3s ease-out;
    `;
    overlay.textContent = 'Click on any image to select it for Virtual Try-On';

    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes fadeInOut {
        0% { opacity: 0; transform: scale(0.8); }
        20% { opacity: 1; transform: scale(1); }
        80% { opacity: 1; transform: scale(1); }
        100% { opacity: 0; transform: scale(0.8); }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(overlay);
  }

  hideSelectionOverlay() {
    const overlay = document.getElementById('fitcheck-selection-overlay');
    if (overlay) {
      overlay.remove();
    }
  }

  removeAllTryOnButtons() {
    const buttons = document.querySelectorAll('.fitcheck-try-on-container');
    buttons.forEach(button => button.remove());
  }

  addHoverButton(img) {
    // Skip if already has hover button
    if (this.hoverButtons.has(img)) {
      return;
    }

    // Create floating button
    const button = document.createElement('button');
    button.className = 'fitcheck-hover-button';
    button.innerHTML = '👔 Try On';
    button.style.cssText = `
      position: absolute;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 8px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      z-index: 10000;
      display: none;
      opacity: 0;
      transition: all 0.3s ease;
      pointer-events: auto;
      white-space: nowrap;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    document.body.appendChild(button);
    this.hoverButtons.set(img, button);

    // Position button relative to image container
    const positionButton = (e) => {
      const rect = img.getBoundingClientRect();
      
      button.style.display = 'block';
      // Position button at top-right corner of the image
      button.style.left = `${rect.right + window.pageXOffset - 130}px`;
      button.style.top = `${rect.top + window.pageYOffset + 10}px`;
      
      // Animate in
      requestAnimationFrame(() => {
        button.style.opacity = '1';
        button.style.transform = 'scale(1)';
      });
    };

    // Show button on hover
    img.addEventListener('mouseenter', positionButton);
    
    // Hide button on mouse leave
    const hideButton = () => {
      button.style.opacity = '0';
      button.style.transform = 'scale(0.8)';
      setTimeout(() => {
        button.style.display = 'none';
      }, 300);
    };
    
    img.addEventListener('mouseleave', hideButton);
    button.addEventListener('mouseleave', hideButton);

    // Keep button visible when hovering over it
    button.addEventListener('mouseenter', () => {
      button.style.opacity = '1';
    });

    // Update position on scroll
    const updatePosition = () => {
      if (button.style.display !== 'none') {
        const rect = img.getBoundingClientRect();
        button.style.left = `${rect.right + window.pageXOffset - 130}px`;
        button.style.top = `${rect.top + window.pageYOffset + 10}px`;
      }
    };
    
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    // Handle button click
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleTryOnClick(img.src, button);
    });
  }

  removeAllHoverButtons() {
    this.hoverButtons.forEach((button, img) => {
      button.remove();
    });
    this.hoverButtons.clear();
  }

  destroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
    this.removeAllImageClickListeners();
    this.removeAllTryOnButtons();
    this.hideSelectionOverlay();
    
    // Remove hover buttons
    this.hoverButtons.forEach((button, img) => {
      button.remove();
    });
    this.hoverButtons.clear();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new FitCheckContentScript();
  });
} else {
  new FitCheckContentScript();
}
