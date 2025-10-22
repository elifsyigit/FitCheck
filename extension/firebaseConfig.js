console.log("firebaseConfig.js executed");

// Wait for Firebase to be available
function initializeFirebaseWhenReady() {
    if (typeof firebase !== 'undefined') {
        try {
            const firebaseConfig = {
                apiKey: "AIzaSyC7pogkRhn_BL3lNJ20TZ-tn0P8o4oI-Yw",
                authDomain: "fitcheck-475119.firebaseapp.com",
                projectId: "fitcheck-475119",
                storageBucket: "fitcheck-475119.firebasestorage.app",
                messagingSenderId: "654573246781",
                appId: "1:654573246781:web:a4d9679b78f6a894e1cd54"
            };

            firebase.initializeApp(firebaseConfig);
            console.log("Firebase initialized successfully");
        } catch (error) {
            console.error("Firebase initialization error:", error);
        }
    } else {
        // Retry after a short delay
        setTimeout(initializeFirebaseWhenReady, 100);
    }
}

// Start initialization
initializeFirebaseWhenReady();
