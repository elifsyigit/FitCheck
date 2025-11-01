  class FitCheckContentScript {
  constructor() {
    this.observer = null;
    this.processedImages = new Set();
    this.siteConfig = this.getSiteConfig();
    this.settings = { autoDetect: false };
    this.buttonHideTimers = new Map();
    this.hoverButtons = new Map();
    this.injectStyles();
    this.loadSettings();
    this.setupMessageListener();
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
    return {
      imageSelectors: [
        'img[src*="product"]', 
        'img[alt*="model"]', 
        'img[alt*="clothing"]',
        'img[alt*="dress"]',
        'img[alt*="shirt"]',
        'img[alt*="pants"]',
        'img[alt*="shoes"]',
        'img[alt*="jacket"]',
        'img[width="500"]',
        'img[width="600"]',
        'img[width="800"]',
        '.product-image img',
        '.product-detail img',
        '.main-image img',
        '.gallery img',
        '.gallery-item img'
      ],
      containerSelectors: [
        '.product-image',
        '.product-detail',
        '.main-image',
        '.gallery',
        '.gallery-item',
        '.image-container',
        '.product-container',
        'body'
      ],
      buttonPosition: 'after'
    };
  }

  isClothingProductPage() {
    const CLOTHING_KEYWORDS = [
      'dress', 'shirt', 'jacket', 'pants', 'skirt', 'shoes', 'apparel', 'clothing', 'fashion',
      'blouse', 'trousers', 'jeans', 'sweater', 'hoodie', 'coat', 'blazer', 'suit',
      'boots', 'sneakers', 'sandals', 'heels', 'flats', 'socks', 'underwear',
      'accessories', 'bag', 'purse', 'belt', 'hat', 'scarf', 'gloves'
    ];

    //URL and Title Control
    const url = window.location.href.toLowerCase();
    const title = document.title.toLowerCase();
    const urlAndTitle = `${url} ${title}`;
    
    if (CLOTHING_KEYWORDS.some(keyword => urlAndTitle.includes(keyword))) {
      console.log('FitCheck (CS): Clothing keyword detected in URL/Title.');
      return true;
    }

    // 2. Schema mark up
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent);
        const dataString = JSON.stringify(data).toLowerCase();
        const isProductOrOffer = dataString.includes('"@type":"product"') || dataString.includes('"@type":"offer"');
        if (isProductOrOffer && CLOTHING_KEYWORDS.some(keyword => dataString.includes(keyword))) {
          console.log('FitCheck (CS): Clothing product detected with Schema Markup.');
          return true;
        }
      } catch (e) {}
    }

    // 3. E-ticaret eylem kelimeleri kontrolü
    const ecommerceKeywords = [
      'add to cart','buy now', 'purchase',
      'size select','color select',
      'stock','discount', 'sale','price'
    ];
    
    const pageText = document.body.textContent.toLowerCase();
    if (ecommerceKeywords.some(keyword => pageText.includes(keyword))) {
      console.log('FitCheck (CS): E-commerce action words detected.');
      return true;
    }

    const sizeSelectors = [
      '[id*="size-selector"]', '[class*="size-selector"]',
      'select[name*="size"]','[data-testid*="size"]',
      '[aria-label*="size"]','input[name*="size"]',
    ];
    if (sizeSelectors.some(selector => document.querySelector(selector))) {
      console.log('FitCheck (CS): Size selector detected.');
      return true;
    }

    const actionButtons = [
      'button[class*="add-to-cart"]', 'button[class*="buy-now"]',
      'button[class*="purchase"]', 'button[class*="order"]',
      'a[class*="add-to-cart"]', 'a[class*="buy-now"]',
      '[data-testid*="add-to-cart"]', '[data-testid*="buy-now"]',
      'button:contains("Add to Cart")','button:contains("Buy Now")'
    ];
    
    for (const selector of actionButtons) {
      if (document.querySelector(selector)) {
        console.log('FitCheck (CS): E-commerce button detected.');
        return true;
      }
    }

    const productImages = document.querySelectorAll('img');
    let clothingImageCount = 0;
    
    for (const img of productImages) {
      const src = img.src.toLowerCase();
      const alt = (img.alt || '').toLowerCase();
      const imageText = `${src} ${alt}`;
      
      if (CLOTHING_KEYWORDS.some(keyword => imageText.includes(keyword))) {
        clothingImageCount++;
      }
    }
    
    if (clothingImageCount >= 2) {
      console.log('FitCheck (CS): Multiple clothing images detected.');
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

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'RELOAD_SETTINGS' && fitCheckInstance) {
        console.log('FitCheck (CS): Reloading settings...');
        fitCheckInstance.loadSettings();
      }
    });
  }

  init() {
    // Preserve autoDetect logic
    if (typeof this.settings.autoDetect !== 'undefined' && !this.settings.autoDetect) {
      console.log('FitCheck (CS): Auto-detect is disabled. Buttons will not be shown automatically.');
      return;
    }
    if (!this.isClothingProductPage()) {
      console.log('FitCheck (CS): Sayfa kıyafet ürünü değil veya denemeye uygun değil. Otomatik başlatma durduruldu.');
      return;
    }
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

    if (!this.isProductImage(img)) {
      console.log('FitCheck (CS): Image not suitable for try-on:', img.src);
      return;
    }

    console.log('FitCheck (CS): Processing suitable image:', img.src);
    this.processedImages.add(img.src);
    // Slight delay
    setTimeout(() => {
      this.addHoverButton(img);
    }, 150);
  }

  isProductImage(img) {
    const src = (img.src || '').toLowerCase();
    const alt = (img.alt || '').toLowerCase();

    if (!src) return false;
    if (src.includes('data:') || src.includes('base64')) return false;
    if (src.includes('logo') || src.includes('icon') || src.includes('avatar')) return false;

    try {
      const selectorMatch = this.siteConfig.imageSelectors.some(selector => img.matches && img.matches(selector));
      if (selectorMatch) return true;
    } catch (e) {
    }

    // Fallback
    const width = img.naturalWidth || img.width || img.offsetWidth;
    const height = img.naturalHeight || img.height || img.offsetHeight;
    return (width >= 200 && height >= 200) || alt.length > 0;
  }


  addHoverButton(img) {
    if (this.hoverButtons.has(img)) return;

    const button = document.createElement('button');
    button.className = 'fitcheck-hover-button';
    button.innerHTML = 'Try On';
    button.style.cssText = `
      position: absolute;
      z-index: 10000;
      display: none;
      opacity: 0;
      pointer-events: auto;
    `;

    document.body.appendChild(button);
    this.hoverButtons.set(img, button);

    const positionButton = () => {
      
      const rect = img.getBoundingClientRect();
      button.style.display = 'block';
      button.style.left = `${rect.right + window.pageXOffset - 130}px`;
      button.style.top = `${rect.top + window.pageYOffset + 10}px`;
      requestAnimationFrame(() => {
        button.style.opacity = '1';
        button.style.transform = 'scale(1)';
      });
      // Reset any previous hide timer for this image/button
      const existing = this.buttonHideTimers.get(img);
      if (existing) clearTimeout(existing);
      // Auto-hide after a few seconds
      const timerId = setTimeout(() => {
        this.hideHoverButton(button);
        this.buttonHideTimers.delete(img);
      }, 3000);
      this.buttonHideTimers.set(img, timerId);
    };
    
    img.addEventListener('mouseenter', positionButton);
    button.addEventListener('mouseenter', () => {
      button.style.opacity = '1';
      button.style.transform = 'scale(1)';
      // Keep it visible while hovered by cancelling hide timer
      const existing = this.buttonHideTimers.get(img);
      if (existing) clearTimeout(existing);
    });
    button.addEventListener('mouseleave', () => {
      // When leaving the button, schedule a shorter hide
      const existing = this.buttonHideTimers.get(img);
      if (existing) clearTimeout(existing);
      const timerId = setTimeout(() => {
        this.hideHoverButton(button);
        this.buttonHideTimers.delete(img);
      }, 1500);
      this.buttonHideTimers.set(img, timerId);
    });

    button.addEventListener('click', (e) => { e.stopPropagation(); this.handleTryOnClick(img, button); });
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

  createTryOnButton(imgElement) {
    const container = document.createElement('div');
    container.className = 'fitcheck-try-on-container';

    const button = document.createElement('button');
    button.className = 'fitcheck-try-on-button';
    button.textContent = 'Try On';

    button.addEventListener('click', () => {
      this.handleTryOnClick(imgElement, button);
    });

    container.appendChild(button);
    return container;
  }

  // Method to hide the hover button
  hideHoverButton(button) {
    button.style.opacity = '0';
    button.style.transform = 'scale(0.8)';
    setTimeout(() => { button.style.display = 'none'; }, 400); // Match transition duration
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
    
    buttonContainer.style.transform = 'scale(0.8)';
    buttonContainer.style.opacity = '1';
    
    setTimeout(() => {
      buttonContainer.style.transform = 'scale(1)';
      console.log('FitCheck (CS): Button animation completed');
    }, 150);
  }

    async handleTryOnClick(imgElement, buttonElement) {
      this.hideHoverButton(buttonElement);
      const button = buttonElement || document.querySelector('.fitcheck-try-on-button');
      const originalText = button.textContent;
      
      button.textContent = 'Processing...';
      button.disabled = true;

      try {
        // Fetch avatar image from storage
        const storageResult = await chrome.storage.local.get(['userAvatar']);
        if (!storageResult.userAvatar || !storageResult.userAvatar.base64) {
          this.showError('Please upload your photo in the extension popup first');
          button.textContent = originalText;
          button.disabled = false;
          return;
        }
        
        const avatarImageBase64 = storageResult.userAvatar.base64;
        
        console.log('FitCheck (CS): Extracting image from img element');
        let clothingImageBase64;
        try {
          // Use the already-loaded img element to avoid CORS issues
          clothingImageBase64 = await this.extractImageFromElement(imgElement);
          console.log('FitCheck (CS): Image extracted successfully, length:', clothingImageBase64.length);
        } catch (error) {
          console.error('FitCheck (CS): Failed to extract image from element:', error);
          this.showError('Failed to extract image. Please try again.');
          button.textContent = originalText;
          button.disabled = false;
          return;
        }
        
        console.log('FitCheck (CS): Sending request with both images');
        console.log('FitCheck (CS): Avatar image length:', avatarImageBase64.length);
        console.log('FitCheck (CS): Clothing image length:', clothingImageBase64.length);
        
        const response = await chrome.runtime.sendMessage({
          action: 'REQUEST_VIRTUAL_TRY_ON',
          data: {
            avatarImageBase64: avatarImageBase64,
            clothingImageBase64: clothingImageBase64
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
        console.error('FitCheck (CS): Error in handleTryOnClick:', error);
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
    
      // Create button container
      const btnContainer = document.createElement('div');
      btnContainer.className = 'modal-button-container';
    
      // Download button
      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'download-btn';
      downloadBtn.textContent = '⬇ Download';
      downloadBtn.addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = img.src;
        a.download = 'fitcheck-result.jpg';
        a.click();
      });
    
      // Share button
      const shareBtn = document.createElement('button');
      shareBtn.className = 'share-btn';
      shareBtn.textContent = '🔗 Share';
      shareBtn.addEventListener('click', async () => {
        if (navigator.share) {
          try {
            await navigator.share({
              title: 'Check out my try-on!',
              text: 'I just tried this outfit using FitCheck!',
              files: [await this.dataURLtoFile(img.src, 'fitcheck-result.jpg')],
            });
          } catch (err) {
            alert('Share failed: ' + err.message);
          }
        } else {
          alert('Share API not supported in this browser');
        }
      });
    
      btnContainer.appendChild(downloadBtn);
      btnContainer.appendChild(shareBtn);
      modal.querySelector('.modal-content').appendChild(btnContainer);
    
      document.body.appendChild(modal);
    }
    
    // Helper to convert base64 to File for Web Share API
    dataURLtoFile(dataurl, filename) {
      const arr = dataurl.split(',');
      const mime = arr[0].match(/:(.*?);/)[1];
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) u8arr[n] = bstr.charCodeAt(n);
      return new File([u8arr], filename, { type: mime });
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

    async extractImageFromElement(imgElement) {
      return new Promise((resolve, reject) => {
        try {
          // Ensure the image is fully loaded
          if (!imgElement.complete) {
            const self = this;
            imgElement.onload = function() {
              self.extractImageFromLoadedElement(imgElement, resolve, reject);
            };
            imgElement.onerror = function() {
              reject(new Error('Image failed to load'));
            };
          } else {
            this.extractImageFromLoadedElement(imgElement, resolve, reject);
          }
        } catch (error) {
          reject(new Error(`Failed to extract image: ${error.message}`));
        }
      });
    }

    extractImageFromLoadedElement(imgElement, resolve, reject) {
      try {
        console.log('FitCheck (CS): Attempting to extract image from element');
        console.log('FitCheck (CS): Image dimensions:', {
          naturalWidth: imgElement.naturalWidth,
          naturalHeight: imgElement.naturalHeight,
          width: imgElement.width,
          height: imgElement.height,
          src: imgElement.src
        });
        
        const canvas = document.createElement('canvas');
        canvas.width = imgElement.naturalWidth || imgElement.width;
        canvas.height = imgElement.naturalHeight || imgElement.height;
        
        console.log('FitCheck (CS): Canvas created with size:', canvas.width, 'x', canvas.height);
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgElement, 0, 0);
        console.log('FitCheck (CS): Image drawn to canvas successfully');
        
        // Convert to base64
        let base64;
        try {
          base64 = canvas.toDataURL('image/jpeg', 0.92);
          console.log('FitCheck (CS): Canvas converted to base64, length:', base64.length);
          resolve(base64);
        } catch (toDataURLError) {
          console.log('FitCheck (CS): Canvas tainted, trying background script fetch as fallback');
          this.fetchImageViaBackgroundScript(imgElement.src)
            .then(resolve)
            .catch(reject);
        }
      } catch (error) {
        console.error('FitCheck (CS): Canvas extraction error details:', error);
        console.error('FitCheck (CS): Error name:', error.name);
        console.error('FitCheck (CS): Error message:', error.message);
        
        // For ANY error, try proxy fallback
        console.log('FitCheck (CS): Trying background script fetch as fallback');
        this.fetchImageViaBackgroundScript(imgElement.src)
          .then(resolve)
          .catch(reject);
      }
    }

    async fetchImageViaBackgroundScript(imageUrl) {
      console.log('FitCheck (CS): Requesting image via background script:', imageUrl);
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'FETCH_IMAGE',
          data: { imageUrl }
        });
        
        if (response.success) {
          console.log('FitCheck (CS): Image fetched via background script successfully');
          return response.base64;
        } else {
          throw new Error(response.error || 'Failed to fetch image');
        }
      } catch (error) {
        console.error('FitCheck (CS): Background script fetch failed:', error);
        throw error;
      }
    }

    async loadImageIntoCanvas(imageUrl) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = function() {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const base64 = canvas.toDataURL('image/jpeg', 0.92);
            resolve(base64);
          } catch (error) {
            reject(new Error(`Canvas conversion failed: ${error.message}`));
          }
        };
        
        img.onerror = function() {
          reject(new Error('Failed to load image'));
        };
        
        img.src = imageUrl;
      });
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