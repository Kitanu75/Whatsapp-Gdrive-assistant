# WhatsApp-Driven Google Drive Assistant

A complete Node.js application that processes WhatsApp messages to perform Google Drive operations with AI-powered document summarization using Google Gemini API.

## 🌟 Features

- 📱 **WhatsApp Integration**: Receive commands via Twilio WhatsApp API
- 📁 **Google Drive Operations**: List, delete, move files and folders
- 🤖 **AI Summarization**: Generate document summaries using Google Gemini API (Free)
- 🔐 **Secure OAuth2**: Google Drive authentication with proper scopes
- 📊 **Audit Logging**: Track all operations and responses with session management
- 🛡️ **Safety Guards**: Protection against accidental operations
- 💬 **User-Friendly Responses**: Clear WhatsApp messages with emojis

## 📋 Supported Commands

Send these commands to your WhatsApp number:

- `LIST /folder/path` - List files in a Google Drive folder
- `DELETE /file/path` - Delete a specific file
- `MOVE /source/path /destination/path` - Move file to another location
- `SUMMARY /folder/path` - Generate AI summaries of documents in folder
- `HELP` - Show available commands

### Command Examples

```
LIST ProjectX
DELETE report.pdf
MOVE report.pdf Archive
SUMMARY Documents
HELP
```

## 🚀 Quick Start

### Prerequisites

1. **Twilio Account**: Set up WhatsApp Sandbox
2. **Google Cloud Project**: Enable Drive API and create OAuth2 credentials
3. **Google AI Studio**: Get free Gemini API key
4. **Node.js**: Version 18+ recommended

### Installation

1. **Clone and Install Dependencies**
   ```bash
   git clone <repository-url>
   cd whatsapp-gdrive-assistant
   npm install
   ```

2. **Configure Environment Variables**
   Set up these environment variables in Replit Secrets or .env file:
   ```
   TWILIO_ACCOUNT_SID=your_twilio_account_sid
   TWILIO_AUTH_TOKEN=your_twilio_auth_token
   TWILIO_WHATSAPP_NUMBER=+14155238886
   GOOGLE_OAUTH_CLIENT_ID=your_google_oauth_client_id
   GOOGLE_OAUTH_CLIENT_SECRET=your_google_oauth_client_secret
   GOOGLE_GEMINI_API_KEY=your_google_gemini_api_key
   ```

3. **Start the Server**
   ```bash
   npm start
   ```

4. **Authorize Google Drive Access**
   - Visit `http://localhost:5000`
   - Click "Authorize Google Drive Access"
   - Complete OAuth flow and copy the tokens
   - Add tokens to environment variables

5. **Configure Twilio Webhook**
   - In Twilio Console, set webhook URL to: `https://your-domain.com/whatsapp-webhook`
   - Or use ngrok for local testing: `ngrok http 5000`

## 🔧 API Setup Instructions

### Twilio WhatsApp API

1. Create account at [Twilio](https://www.twilio.com/)
2. Go to WhatsApp Sandbox in Console
3. Note your Account SID, Auth Token, and WhatsApp number
4. Follow sandbox setup to join with your phone

### Google Drive API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project or select existing
3. Enable Google Drive API
4. Create OAuth2 credentials (Web application)
5. Add your domain to authorized redirect URIs
6. Download client ID and secret

### Google Gemini API (Free)

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create new API key
3. No credit card required for basic usage

## 🏗️ Architecture

### Core Components

- **Express Server**: Handles WhatsApp webhooks and OAuth callbacks
- **Google Drive Integration**: Full CRUD operations on files and folders
- **AI Processing**: Document summarization using Gemini API
- **Audit System**: Comprehensive logging with session tracking
- **Security Layer**: OAuth2 authentication and token management

### File Structure

```
whatsapp-gdrive-assistant/
├── server.js                 # Main application server
├── helpers/
│   ├── audit-logger.js       # Enhanced logging system
│   └── google-auth-setup.js  # OAuth2 setup helper
├── workflow.json             # n8n workflow (alternative)
├── docker-compose.yml        # Docker setup (alternative)
├── setup.sh                  # Automated setup script
└── README.md                 # This file
```

## 🔒 Security Features

- **OAuth2 Flow**: Secure Google API access
- **Token Management**: Automatic refresh handling
- **Audit Logging**: All operations tracked with timestamps
- **Input Validation**: Command parsing with safety checks
- **Error Handling**: Comprehensive error responses

## 📊 Monitoring & Logging

The audit logger tracks:
- All WhatsApp commands received
- Google Drive operations performed
- AI summarization requests
- Error events and security alerts
- User activity patterns

## 🧪 Testing

Send test messages to your WhatsApp number:

1. `HELP` - Get command list
2. `LIST /` - List root folder files
3. `SUMMARY Documents` - Test AI summarization

## 🐛 Troubleshooting

### Common Issues

1. **"Authorization failed"**
   - Check OAuth2 credentials
   - Verify redirect URI matches exactly

2. **"WhatsApp webhook not receiving"**
   - Confirm webhook URL is publicly accessible
   - Check Twilio webhook configuration

3. **"Gemini API error"**
   - Verify API key is correct
   - Check API quotas and limits

4. **"File not found"**
   - Use exact file/folder names
   - Check Google Drive permissions

### Debug Mode

Enable detailed logging by setting `NODE_ENV=development`

## 🚀 Deployment

### Replit Deployment

1. Import project to Replit
2. Add secrets in Replit Secrets tab
3. Run `node server.js`
4. Use Replit's provided URL for webhooks

### Alternative Platforms

- **Heroku**: Add buildpack and environment variables
- **Railway**: Connect GitHub repo and deploy
- **Vercel**: Serverless deployment with API routes

## 📄 License

MIT License - feel free to use and modify as needed.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Submit pull request

## 📞 Support

For issues and questions:
- Check troubleshooting section
- Review Twilio and Google API documentation
- Test with simple commands first

---

**Built for the WhatsApp-Driven Google Drive Assistant internship task** ✨