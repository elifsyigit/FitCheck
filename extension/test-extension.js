// FitCheck Uzantısı Test Dosyası
// Bu dosya uzantının düzgün çalışıp çalışmadığını test eder

console.log('=== FitCheck Uzantı Test Başlatılıyor ===');

// Test 1: Manifest.json kontrolü
function testManifest() {
    console.log('Test 1: Manifest.json kontrolü...');
    
    // Manifest dosyasının varlığını kontrol et
    fetch('./manifest.json')
        .then(response => response.json())
        .then(manifest => {
            console.log('✅ Manifest.json yüklendi');
            console.log('Uzantı adı:', manifest.name);
            console.log('Versiyon:', manifest.version);
            console.log('Host permissions:', manifest.host_permissions);
            console.log('Content scripts matches:', manifest.content_scripts[0].matches);
            
            // Evrensel erişim kontrolü
            if (manifest.host_permissions.includes('<all_urls>') && 
                manifest.content_scripts[0].matches.includes('<all_urls>')) {
                console.log('✅ Evrensel erişim doğrulandı');
            } else {
                console.log('❌ Evrensel erişim bulunamadı');
            }
        })
        .catch(error => {
            console.log('❌ Manifest.json yüklenemedi:', error);
        });
}

// Test 2: Content.js fonksiyonları kontrolü
function testContentScript() {
    console.log('Test 2: Content.js fonksiyonları kontrolü...');
    
    // FitCheckContentScript sınıfının varlığını kontrol et
    if (typeof FitCheckContentScript !== 'undefined') {
        console.log('✅ FitCheckContentScript sınıfı bulundu');
        
        // Test instance oluştur
        try {
            const testInstance = new FitCheckContentScript();
            console.log('✅ FitCheckContentScript instance oluşturuldu');
            
            // isClothingProductPage fonksiyonunu test et
            if (typeof testInstance.isClothingProductPage === 'function') {
                console.log('✅ isClothingProductPage fonksiyonu bulundu');
                
                // Test sayfası için giyim algılama testi
                const isClothing = testInstance.isClothingProductPage();
                console.log('Giyim sayfası algılama sonucu:', isClothing);
                
                if (isClothing) {
                    console.log('✅ Giyim sayfası doğru algılandı');
                } else {
                    console.log('⚠️ Giyim sayfası algılanamadı (bu normal olabilir)');
                }
            } else {
                console.log('❌ isClothingProductPage fonksiyonu bulunamadı');
            }
            
            // isProductImage fonksiyonunu test et
            if (typeof testInstance.isProductImage === 'function') {
                console.log('✅ isProductImage fonksiyonu bulundu');
                
                // Test görseli oluştur
                const testImg = document.createElement('img');
                testImg.src = 'https://via.placeholder.com/400x600/ff6b6b/ffffff?text=Test+Elbise';
                testImg.alt = 'Test elbise görseli';
                testImg.width = 400;
                testImg.height = 600;
                
                const isProduct = testInstance.isProductImage(testImg);
                console.log('Ürün görseli algılama sonucu:', isProduct);
                
                if (isProduct) {
                    console.log('✅ Ürün görseli doğru algılandı');
                } else {
                    console.log('❌ Ürün görseli algılanamadı');
                }
            } else {
                console.log('❌ isProductImage fonksiyonu bulunamadı');
            }
            
        } catch (error) {
            console.log('❌ FitCheckContentScript instance oluşturulamadı:', error);
        }
    } else {
        console.log('❌ FitCheckContentScript sınıfı bulunamadı');
    }
}

// Test 3: DOM elementleri kontrolü
function testDOMElements() {
    console.log('Test 3: DOM elementleri kontrolü...');
    
    // Test butonları oluştur
    const testButtons = document.querySelectorAll('.fitcheck-try-on-button');
    console.log('FitCheck butonları sayısı:', testButtons.length);
    
    if (testButtons.length > 0) {
        console.log('✅ FitCheck butonları bulundu');
        testButtons.forEach((button, index) => {
            console.log(`Buton ${index + 1}:`, button.textContent);
        });
    } else {
        console.log('⚠️ FitCheck butonları henüz oluşturulmamış (bu normal olabilir)');
    }
    
    // Test görselleri kontrol et
    const images = document.querySelectorAll('img');
    console.log('Sayfadaki toplam görsel sayısı:', images.length);
    
    const productImages = Array.from(images).filter(img => {
        const src = img.src.toLowerCase();
        const alt = (img.alt || '').toLowerCase();
        return !src.includes('logo') && !src.includes('icon') && 
               (alt.includes('elbise') || alt.includes('gömlek') || alt.includes('pantolon'));
    });
    
    console.log('Potansiyel ürün görselleri:', productImages.length);
}

// Test 4: Console mesajları kontrolü
function testConsoleMessages() {
    console.log('Test 4: Console mesajları kontrolü...');
    
    // FitCheck console mesajlarını dinle
    const originalLog = console.log;
    let fitcheckMessages = [];
    
    console.log = function(...args) {
        const message = args.join(' ');
        if (message.includes('FitCheck')) {
            fitcheckMessages.push(message);
        }
        originalLog.apply(console, args);
    };
    
    // 2 saniye bekle ve mesajları kontrol et
    setTimeout(() => {
        console.log = originalLog; // Orijinal console.log'u geri yükle
        
        if (fitcheckMessages.length > 0) {
            console.log('✅ FitCheck console mesajları bulundu:');
            fitcheckMessages.forEach(msg => console.log('  -', msg));
        } else {
            console.log('⚠️ FitCheck console mesajları bulunamadı');
        }
    }, 2000);
}

// Tüm testleri çalıştır
function runAllTests() {
    console.log('🚀 Tüm testler başlatılıyor...');
    
    testManifest();
    
    setTimeout(() => {
        testContentScript();
    }, 1000);
    
    setTimeout(() => {
        testDOMElements();
    }, 2000);
    
    setTimeout(() => {
        testConsoleMessages();
    }, 3000);
    
    setTimeout(() => {
        console.log('=== FitCheck Uzantı Test Tamamlandı ===');
        console.log('Eğer tüm testler ✅ işareti ile geçtiyse, uzantınız düzgün çalışıyor!');
    }, 5000);
}

// Sayfa yüklendiğinde testleri çalıştır
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runAllTests);
} else {
    runAllTests();
}
