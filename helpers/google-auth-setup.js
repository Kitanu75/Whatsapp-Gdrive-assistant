/**
 * Google OAuth2 Setup Helper
 * This script helps configure Google Drive and Gemini API access
 */

const https = require('https');
const fs = require('fs');
const readline = require('readline');

class GoogleAuthSetup {
    constructor() {
        this.clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
        this.clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
        this.redirectUri = 'http://localhost:5678/rest/oauth2-credential/callback';
        this.scopes = [
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/drive.file'
        ];
    }

    /**
     * Generate OAuth2 authorization URL
     */
    generateAuthUrl() {
        const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
            `client_id=${this.clientId}&` +
            `redirect_uri=${encodeURIComponent(this.redirectUri)}&` +
            `scope=${encodeURIComponent(this.scopes.join(' '))}&` +
            'response_type=code&' +
            'access_type=offline&' +
            'prompt=consent';

        return authUrl;
    }

    /**
     * Exchange authorization code for tokens
     */
    async exchangeCodeForTokens(code) {
        const tokenData = {
            client_id: this.clientId,
            client_secret: this.clientSecret,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: this.redirectUri
        };

        const postData = Object.keys(tokenData)
            .map(key => `${key}=${encodeURIComponent(tokenData[key])}`)
            .join('&');

        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'oauth2.googleapis.com',
                port: 443,
                path: '/token',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const tokens = JSON.parse(data);
                        resolve(tokens);
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', reject);
            req.write(postData);
            req.end();
        });
    }

    /**
     * Test Google Drive API access
     */
    async testDriveAccess(accessToken) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'www.googleapis.com',
                port: 443,
                path: '/drive/v3/about?fields=user',
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        resolve(result);
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });
    }

    /**
     * Test Google Gemini API access
     */
    async testGeminiAccess(apiKey) {
        const testPrompt = 'Hello, please respond with "API is working" if you can see this message.';
        
        const requestData = {
            contents: [{
                parts: [{
                    text: testPrompt
                }]
            }]
        };

        return new Promise((resolve, reject) => {
            const postData = JSON.stringify(requestData);
            
            const options = {
                hostname: 'generativelanguage.googleapis.com',
                port: 443,
                path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        resolve(result);
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', reject);
            req.write(postData);
            req.end();
        });
    }

    /**
     * Interactive setup process
     */
    async runSetup() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const question = (prompt) => new Promise(resolve => {
            rl.question(prompt, resolve);
        });

        try {
            console.log('🔐 Google API Setup Helper\n');

            // Check environment variables
            if (!this.clientId || !this.clientSecret) {
                console.log('❌ Missing Google OAuth2 credentials in environment variables');
                console.log('Please set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET');
                return;
            }

            // Test Gemini API if key is provided
            const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;
            if (geminiKey) {
                console.log('🤖 Testing Google Gemini API...');
                try {
                    const geminiResult = await this.testGeminiAccess(geminiKey);
                    if (geminiResult.candidates && geminiResult.candidates[0]) {
                        console.log('✅ Google Gemini API is working');
                    } else {
                        console.log('⚠️  Google Gemini API test returned unexpected result');
                    }
                } catch (error) {
                    console.log('❌ Google Gemini API test failed:', error.message);
                }
                console.log('');
            }

            // Generate OAuth2 URL
            const authUrl = this.generateAuthUrl();
            console.log('📋 Google Drive OAuth2 Setup:');
            console.log('1. Open this URL in your browser:');
            console.log(authUrl);
            console.log('\n2. Complete the authorization process');
            console.log('3. Copy the authorization code from the callback URL\n');

            const code = await question('Enter the authorization code: ');

            if (!code.trim()) {
                console.log('❌ No authorization code provided');
                return;
            }

            console.log('🔄 Exchanging code for tokens...');
            const tokens = await this.exchangeCodeForTokens(code.trim());

            if (tokens.access_token) {
                console.log('✅ Successfully obtained access token');
                
                // Test Drive API access
                console.log('🔄 Testing Google Drive API access...');
                const driveInfo = await this.testDriveAccess(tokens.access_token);
                
                if (driveInfo.user) {
                    console.log(`✅ Google Drive API is working for user: ${driveInfo.user.emailAddress}`);
                } else {
                    console.log('⚠️  Google Drive API test completed but no user info returned');
                }

                // Save credentials for n8n
                const credentials = {
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    scope: this.scopes.join(' '),
                    token_type: tokens.token_type || 'Bearer',
                    expiry_date: tokens.expires_in ? 
                        Date.now() + (tokens.expires_in * 1000) : 
                        Date.now() + (3600 * 1000)
                };

                fs.writeFileSync('google-credentials.json', JSON.stringify(credentials, null, 2));
                console.log('💾 Credentials saved to google-credentials.json');
                console.log('📋 Import these credentials into n8n Google OAuth2 configuration');

            } else {
                console.log('❌ Failed to obtain access token:', tokens);
            }

        } catch (error) {
            console.log('❌ Setup failed:', error.message);
        } finally {
            rl.close();
        }
    }
}

// Run setup if called directly
if (require.main === module) {
    const setup = new GoogleAuthSetup();
    setup.runSetup().catch(console.error);
}

module.exports = GoogleAuthSetup;
