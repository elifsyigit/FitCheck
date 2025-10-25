# Security Setup for Firebase Key Service

## 🔒 Security Improvements Made

### 1. Extension Verification
- Added HMAC signature verification to ensure requests come from legitimate extension instances
- Optional feature - can be disabled by not setting `EXTENSION_SECRET` environment variable

### 2. Rate Limiting
- Implemented rate limiting: 100 requests per hour per IP
- Prevents abuse and DDoS attacks

### 3. CORS Protection
- Strict CORS headers limiting access to your extension origin only
- Prevents unauthorized cross-origin requests

### 4. Environment Variables
- All sensitive configuration moved to environment variables
- No hardcoded secrets in the code

## 🚀 Deployment Steps

### 1. Set Environment Variables
```bash
# Set these in your Cloud Run service or Cloud Functions
gcloud functions deploy get-firebase-key \
  --runtime python311 \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars FIREBASE_API_KEY=your_key_here,FIREBASE_PROJECT_ID=fitcheck-475119,EXTENSION_SECRET=your_secret_here
```

### 2. Generate Extension Secret
```bash
# Generate a secure random secret
openssl rand -hex 32
```

### 3. Update Extension
1. Add the generated secret to your extension's background.js
2. Include crypto-utils.js in your extension
3. Update the extension ID in EXTENSION_ORIGIN

### 4. Test Security
```bash
# Test without signature (should fail if EXTENSION_SECRET is set)
curl -X GET https://your-firebase-key-url

# Test with signature (should work)
curl -X GET https://your-firebase-key-url \
  -H "X-Extension-Signature: your_signature" \
  -H "X-Extension-Timestamp: 1234567890"
```

## 🔧 Configuration Options

### Disable Extension Verification
If you want to disable extension verification (less secure but simpler):
```bash
# Don't set EXTENSION_SECRET environment variable
gcloud functions deploy get-firebase-key \
  --runtime python311 \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars FIREBASE_API_KEY=your_key_here,FIREBASE_PROJECT_ID=fitcheck-475119
```

### Adjust Rate Limits
Modify these values in main.py:
```python
RATE_LIMIT_REQUESTS = 100  # requests per hour
RATE_LIMIT_WINDOW = 3600   # 1 hour in seconds
```

## 🛡️ Security Benefits

1. **Extension Verification**: Only your extension can get Firebase config
2. **Rate Limiting**: Prevents abuse and excessive API calls
3. **CORS Protection**: Blocks unauthorized cross-origin requests
4. **Environment Variables**: No secrets in source code
5. **Proper Error Handling**: Secure error messages without information leakage

## 📝 Notes

- The extension verification is optional and can be disabled
- Rate limiting uses in-memory storage (consider Redis for production)
- All environment variables should be stored securely in Google Cloud Secret Manager
- Test thoroughly in development before deploying to production
