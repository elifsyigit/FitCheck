  class FitCheckContentScript {
  constructor() {
    this.observer = null;
    // Track processed images by src (keep as Set to match existing code expectations)
    this.processedImages = new Set();
    this.siteConfig = this.getSiteConfig();
    this.settings = { autoDetect: false };
    this.manualSelectionMode = false;
    this.imageClickListeners = new Map();
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
    // Evrensel yapılandırma - tüm siteler için geçerli
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
        'img[alt*="elbise"]',
        'img[alt*="gömlek"]',
        'img[alt*="pantolon"]',
        'img[alt*="ayakkabı"]',
        'img[alt*="ceket"]',
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
      // Türkçe anahtar kelimeler
      'elbise', 'gömlek', 'ceket', 'pantolon', 'etek', 't-shirt', 'tişört',
      'ayakkabı', 'ayakkabi', 'giyim', 'kıyafet', 'kiyafet', 'moda', 'fashion',
      'kadın', 'erkek', 'çocuk', 'bebek', 'unisex',
      // İngilizce anahtar kelimeler
      'dress', 'shirt', 'jacket', 'pants', 'skirt', 'shoes', 'apparel', 'clothing', 'fashion',
      'blouse', 'trousers', 'jeans', 'sweater', 'hoodie', 'coat', 'blazer', 'suit',
      'boots', 'sneakers', 'sandals', 'heels', 'flats', 'socks', 'underwear',
      'accessories', 'bag', 'purse', 'belt', 'hat', 'scarf', 'gloves'
    ];

    // 1. URL ve sayfa başlığı kontrolü
    const url = window.location.href.toLowerCase();
    const title = document.title.toLowerCase();
    const urlAndTitle = `${url} ${title}`;
    
    if (CLOTHING_KEYWORDS.some(keyword => urlAndTitle.includes(keyword))) {
      console.log('FitCheck (CS): URL/Başlıkta giyim anahtar kelimesi algılandı.');
      return true;
    }

    // 2. Schema.org JSON-LD kontrolü
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

    // 3. E-ticaret eylem kelimeleri kontrolü
    const ecommerceKeywords = [
      'sepete ekle', 'add to cart', 'satın al', 'buy now', 'purchase',
      'beden seç', 'size select', 'renk seç', 'color select',
      'stok', 'stock', 'indirim', 'discount', 'sale', 'fiyat', 'price'
    ];
    
    const pageText = document.body.textContent.toLowerCase();
    if (ecommerceKeywords.some(keyword => pageText.includes(keyword))) {
      console.log('FitCheck (CS): E-ticaret eylem kelimeleri algılandı.');
      return true;
    }

    // 4. Beden seçici ve ürün özellikleri kontrolü
    const sizeSelectors = [
      '[id*="size-selector"]', '[class*="size-selector"]',
      '[id*="beden-secimi"]', '[class*="beden-secimi"]',
      'select[name*="size"]', 'select[id*="beden"]',
      '[data-testid*="size"]', '[aria-label*="size"]',
      'input[name*="size"]', 'input[id*="beden"]'
    ];
    if (sizeSelectors.some(selector => document.querySelector(selector))) {
      console.log('FitCheck (CS): Beden seçici algılandı.');
      return true;
    }

    // 5. Sepete ekle/Satın al butonları kontrolü
    const actionButtons = [
      'button[class*="add-to-cart"]', 'button[class*="buy-now"]',
      'button[class*="purchase"]', 'button[class*="order"]',
      'a[class*="add-to-cart"]', 'a[class*="buy-now"]',
      '[data-testid*="add-to-cart"]', '[data-testid*="buy-now"]',
      'button:contains("Sepete Ekle")', 'button:contains("Add to Cart")',
      'button:contains("Satın Al")', 'button:contains("Buy Now")'
    ];
    
    for (const selector of actionButtons) {
      if (document.querySelector(selector)) {
        console.log('FitCheck (CS): E-ticaret butonu algılandı.');
        return true;
      }
    }

    // 6. Ürün görselleri kontrolü
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
      console.log('FitCheck (CS): Birden fazla giyim görseli algılandı.');
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

    // Use manual selection mode if enabled, otherwise show hover button
    if (this.manualSelectionMode) {
      this.addImageClickListener(img);
    } else {
      // Slight delay to avoid layout thrashing on pages that load many images
      setTimeout(() => {
        this.addHoverButton(img);
      }, 150);
    }
  }

  isProductImage(img) {
    const src = (img.src || '').toLowerCase();
    const alt = (img.alt || '').toLowerCase();

    // Quick rejects
    if (!src) return false;
    if (src.includes('data:') || src.includes('base64')) return false;
    if (src.includes('logo') || src.includes('icon') || src.includes('avatar')) return false;

    // Match configured selectors first
    try {
      const selectorMatch = this.siteConfig.imageSelectors.some(selector => img.matches && img.matches(selector));
      if (selectorMatch) return true;
    } catch (e) {
      // ignore malformed selectors
    }

    // Fallback to size heuristic
    const width = img.naturalWidth || img.width || img.offsetWidth;
    const height = img.naturalHeight || img.height || img.offsetHeight;
    return (width >= 200 && height >= 200) || alt.length > 0;
  }


  addHoverButton(img) {
    // Skip if already has hover button
    if (this.hoverButtons.has(img)) return;

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
      transition: all 0.2s ease;
      pointer-events: auto;
      white-space: nowrap;
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
    };

    const hideButton = () => {
      button.style.opacity = '0';
      button.style.transform = 'scale(0.8)';
      setTimeout(() => { button.style.display = 'none'; }, 200);
    };

    img.addEventListener('mouseenter', positionButton);
    img.addEventListener('mouseleave', hideButton);
    button.addEventListener('mouseenter', () => { button.style.opacity = '1'; });
    button.addEventListener('mouseleave', hideButton);

    const updatePosition = () => {
      if (button.style.display !== 'none') positionButton();
    };
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

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

  async handleTryOnClick(imgElement, buttonElement) {
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
      
      // Extract clothing image directly from the loaded img element
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
      
      // Validate base64 images
      if (!avatarImageBase64 || avatarImageBase64.length < 100) {
        this.showError('Avatar image is invalid or too small');
        button.textContent = originalText;
        button.disabled = false;
        return;
      }
      
      if (!clothingImageBase64 || clothingImageBase64.length < 100) {
        this.showError('Clothing image is invalid or too small');
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
          clothingImageBase64: clothingImageBase64,
          clothingUrl: imgElement.src // Keep for reference, but API expects base64
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
      
      // Convert to base64 with JPEG quality 0.92
      let base64;
      try {
        base64 = canvas.toDataURL('image/jpeg', 0.92);
        console.log('FitCheck (CS): Canvas converted to base64, length:', base64.length);
        resolve(base64);
      } catch (toDataURLError) {
        console.error('FitCheck (CS): Canvas toDataURL error:', toDataURLError);
        console.log('FitCheck (CS): Canvas tainted, trying background script fetch as fallback');
        this.fetchImageViaBackgroundScript(imgElement.src)
          .then(resolve)
          .catch(reject);
      }
    } catch (error) {
      console.error('FitCheck (CS): Canvas extraction error details:', error);
      console.error('FitCheck (CS): Error name:', error.name);
      console.error('FitCheck (CS): Error message:', error.message);
      
      // If canvas is tainted due to CORS, try alternative method
      if (error.name === 'SecurityError' || error.message.includes('tainted')) {
        console.log('FitCheck (CS): Canvas tainted, trying background script fetch as fallback');
        this.fetchImageViaBackgroundScript(imgElement.src)
          .then(resolve)
          .catch(reject);
      } else {
        reject(new Error(`Canvas conversion failed: ${error.message}`));
      }
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