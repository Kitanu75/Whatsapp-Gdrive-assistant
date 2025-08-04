const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const { google } = require('googleapis');
const twilio = require('twilio');
const AuditLogger = require('./helpers/audit-logger');

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Initialize audit logger
const logger = new AuditLogger();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Google Drive and OAuth2 setup - will be dynamically configured
let oauth2Client;

// Initialize OAuth2 client with dynamic redirect URI
function initializeOAuth2Client(req) {
  const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const host = req.get('host');
  const redirectUri = `${protocol}://${host}/auth/callback`;
  
  oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri
  );
  
  // Set credentials if available
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN && process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    oauth2Client.setCredentials({
      access_token: process.env.GOOGLE_OAUTH_ACCESS_TOKEN,
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN
    });
  }
  
  return oauth2Client;
}

// Initialize with default for non-web requests
oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_OAUTH_CLIENT_ID,
  process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  'https://placeholder.com/auth/callback'
);

// Set credentials if available
if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN && process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
  console.log('🔐 Loading Google OAuth credentials...');
  oauth2Client.setCredentials({
    access_token: process.env.GOOGLE_OAUTH_ACCESS_TOKEN,
    refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  });
  console.log('✅ Google OAuth credentials loaded successfully');
} else {
  console.log('⚠️  Google OAuth credentials not found in environment variables');
}

const drive = google.drive({ version: 'v3', auth: oauth2Client });

// Twilio client
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Command parser function
function parseCommand(messageBody) {
  const body = messageBody.trim().toUpperCase();
  
  const listPattern = /^LIST\s+(.+)$/;
  const listPagePattern = /^LIST\s+(.+?)\s+PAGE\s+(\d+)$/;
  const deletePattern = /^DELETE\s+(.+)$/;
  const deleteConfirmPattern = /^DELETE\s+(.+?)\s+CONFIRM$/;
  const movePattern = /^MOVE\s+(.+?)\s+(.+)$/;
  const summaryPattern = /^SUMMARY\s+(.+)$/;
  const helpPattern = /^HELP$/;

  if (listPagePattern.test(body)) {
    const match = body.match(listPagePattern);
    return { command: 'LIST', folderPath: match[1], page: parseInt(match[2]) };
  } else if (listPattern.test(body)) {
    const match = body.match(listPattern);
    return { command: 'LIST', folderPath: match[1], page: 1 };
  } else if (deleteConfirmPattern.test(body)) {
    const match = body.match(deleteConfirmPattern);
    return { command: 'DELETE_CONFIRM', filePath: match[1] };
  } else if (deletePattern.test(body)) {
    const match = body.match(deletePattern);
    return { command: 'DELETE_REQUEST', filePath: match[1] };
  } else if (movePattern.test(body)) {
    const match = body.match(movePattern);
    return { command: 'MOVE', sourcePath: match[1], destinationPath: match[2] };
  } else if (summaryPattern.test(body)) {
    const match = body.match(summaryPattern);
    let path = match[1].trim();
    // Remove leading slash if it's not a root folder reference
    if (path.startsWith('/') && path.includes('.')) {
      path = path.substring(1).trim();
    }
    return { command: 'SUMMARY', folderPath: path };
  } else if (helpPattern.test(body)) {
    return { command: 'HELP' };
  } else {
    return { command: 'UNKNOWN' };
  }
}

// Google Drive operations
async function listFiles(folderPath, page = 1) {
  try {
    let folderId = 'root';
    
    // If not root folder, find folder by name or path (case-insensitive)
    if (folderPath !== '/' && folderPath !== 'ROOT') {
      // First try exact match
      let folderQuery = `name='${folderPath}' and mimeType='application/vnd.google-apps.folder'`;
      let folderResponse = await drive.files.list({
        q: folderQuery,
        fields: 'files(id, name)'
      });
      
      // If no exact match, try case-insensitive search
      if (folderResponse.data.files.length === 0) {
        const searchFolders = await drive.files.list({
          q: `mimeType='application/vnd.google-apps.folder'`,
          fields: 'files(id, name)'
        });
        
        const matchingFolder = searchFolders.data.files.find(folder => 
          folder.name.toLowerCase() === folderPath.toLowerCase()
        );
        
        if (matchingFolder) {
          folderId = matchingFolder.id;
        } else {
          return { error: `Folder '${folderPath}' not found` };
        }
      } else {
        folderId = folderResponse.data.files[0].id;
      }
    }

    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id,name,mimeType,size,modifiedTime)',
      orderBy: 'name'
    });

    const allFiles = response.data.files;
    const pageSize = 10;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedFiles = allFiles.slice(startIndex, endIndex);
    
    return { 
      files: paginatedFiles, 
      totalFiles: allFiles.length,
      page: page,
      totalPages: Math.ceil(allFiles.length / pageSize)
    };
  } catch (error) {
    console.error('Error listing files:', error);
    return { error: error.message };
  }
}

async function deleteFile(filePath) {
  try {
    // Find file by name (case-insensitive)
    let query = `name='${filePath}' and trashed=false`;
    let response = await drive.files.list({
      q: query,
      fields: 'files(id, name)'
    });

    // If no exact match, try case-insensitive search
    if (response.data.files.length === 0) {
      const allFiles = await drive.files.list({
        q: `trashed=false`,
        fields: 'files(id, name)'
      });
      
      const matchingFile = allFiles.data.files.find(file => 
        file.name.toLowerCase() === filePath.toLowerCase()
      );
      
      if (!matchingFile) {
        return { error: `File '${filePath}' not found` };
      }
      
      response.data.files = [matchingFile];
    }

    const fileId = response.data.files[0].id;
    await drive.files.delete({ fileId });

    return { success: true, fileName: filePath };
  } catch (error) {
    console.error('Error deleting file:', error);
    return { error: error.message };
  }
}

async function moveFile(sourcePath, destinationPath) {
  try {
    // Find source file (case-insensitive)
    let sourceQuery = `name='${sourcePath}' and trashed=false`;
    let sourceResponse = await drive.files.list({
      q: sourceQuery,
      fields: 'files(id, name, parents)'
    });

    // If no exact match, try case-insensitive search
    if (sourceResponse.data.files.length === 0) {
      const allFiles = await drive.files.list({
        q: `trashed=false`,
        fields: 'files(id, name, parents)'
      });
      
      const matchingFile = allFiles.data.files.find(file => 
        file.name.toLowerCase() === sourcePath.toLowerCase()
      );
      
      if (!matchingFile) {
        return { error: `Source file '${sourcePath}' not found` };
      }
      
      sourceResponse.data.files = [matchingFile];
    }

    const sourceFile = sourceResponse.data.files[0];

    // Find destination folder
    let destinationId = 'root';
    if (destinationPath !== '/' && destinationPath !== 'ROOT') {
      let destQuery = `name='${destinationPath}' and mimeType='application/vnd.google-apps.folder'`;
      let destResponse = await drive.files.list({
        q: destQuery,
        fields: 'files(id, name)'
      });

      // If no exact match, try case-insensitive search
      if (destResponse.data.files.length === 0) {
        const allFolders = await drive.files.list({
          q: `mimeType='application/vnd.google-apps.folder'`,
          fields: 'files(id, name)'
        });
        
        const matchingFolder = allFolders.data.files.find(folder => 
          folder.name.toLowerCase() === destinationPath.toLowerCase()
        );
        
        if (!matchingFolder) {
          return { error: `Destination folder '${destinationPath}' not found` };
        }
        
        destinationId = matchingFolder.id;
      } else {
        destinationId = destResponse.data.files[0].id;
      }
    }

    // Move file
    const previousParents = sourceFile.parents.join(',');
    await drive.files.update({
      fileId: sourceFile.id,
      addParents: destinationId,
      removeParents: previousParents
    });

    return { success: true, fileName: sourcePath, destination: destinationPath };
  } catch (error) {
    console.error('Error moving file:', error);
    return { error: error.message };
  }
}

// AI Summarization using Gemini API
async function summarizeWithGemini(content, fileName) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GOOGLE_GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: `Please provide a concise summary of the following document content. Focus on key points, main topics, and important information. Keep the summary under 200 words.

Document Name: ${fileName}

Content:
${content.substring(0, 4000)}`
          }]
        }]
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.candidates && response.data.candidates[0]) {
      return response.data.candidates[0].content.parts[0].text;
    }

    return 'Unable to generate summary';
  } catch (error) {
    console.error('Error with Gemini API:', error);
    return `Error generating summary: ${error.message}`;
  }
}

async function summarizeContent(path) {
  try {
    // Check if it's a specific file or folder
    const isFilePath = path.includes('.') && !path.endsWith('/');
    
    if (isFilePath) {
      // Summarize specific file
      return await summarizeSpecificFile(path);
    } else {
      // Summarize folder contents
      return await summarizeFolder(path);
    }
  } catch (error) {
    console.error('Error summarizing content:', error);
    return { error: error.message };
  }
}

async function summarizeSpecificFile(fileName) {
  try {
    // Search for the file by name
    const searchQuery = `name='${fileName}' and trashed=false`;
    const searchResponse = await drive.files.list({
      q: searchQuery,
      fields: 'files(id,name,mimeType,size)'
    });

    if (searchResponse.data.files.length === 0) {
      return { error: `File '${fileName}' not found` };
    }

    const file = searchResponse.data.files[0];
    
    // Check if file is summarizable
    if (!file.mimeType || !(
      file.mimeType.includes('text/') ||
      file.mimeType.includes('application/pdf') ||
      file.mimeType.includes('application/vnd.google-apps.document') ||
      file.mimeType.includes('application/vnd.openxmlformats-officedocument')
    )) {
      return { error: `File type '${file.mimeType}' cannot be summarized` };
    }

    try {
      // Download file content
      const fileResponse = await drive.files.get({
        fileId: file.id,
        alt: 'media'
      });

      let content = '';
      if (typeof fileResponse.data === 'string') {
        content = fileResponse.data;
      } else if (Buffer.isBuffer(fileResponse.data)) {
        content = fileResponse.data.toString('utf-8');
      } else {
        content = JSON.stringify(fileResponse.data);
      }

      // Generate summary
      const summary = await summarizeWithGemini(content, file.name);
      return { 
        summaries: [{
          fileName: file.name,
          summary: summary
        }]
      };
    } catch (fileError) {
      console.error(`Error processing file ${file.name}:`, fileError);
      return { error: `Unable to process file: ${fileError.message}` };
    }
  } catch (error) {
    console.error('Error summarizing specific file:', error);
    return { error: error.message };
  }
}

async function summarizeFolder(folderPath) {
  try {
    const filesResult = await listFiles(folderPath);
    
    if (filesResult.error) {
      return { error: filesResult.error };
    }

    const summaries = [];
    
    for (const file of filesResult.files) {
      // Only process text-based files
      if (file.mimeType && (
        file.mimeType.includes('text/') ||
        file.mimeType.includes('application/pdf') ||
        file.mimeType.includes('application/vnd.google-apps.document') ||
        file.mimeType.includes('application/vnd.openxmlformats-officedocument')
      )) {
        try {
          // Download file content
          const fileResponse = await drive.files.get({
            fileId: file.id,
            alt: 'media'
          });

          let content = '';
          if (typeof fileResponse.data === 'string') {
            content = fileResponse.data;
          } else if (Buffer.isBuffer(fileResponse.data)) {
            content = fileResponse.data.toString('utf-8');
          } else {
            content = JSON.stringify(fileResponse.data);
          }

          // Generate summary
          const summary = await summarizeWithGemini(content, file.name);
          summaries.push({
            fileName: file.name,
            summary: summary
          });
        } catch (fileError) {
          console.error(`Error processing file ${file.name}:`, fileError);
          summaries.push({
            fileName: file.name,
            summary: `Unable to process file: ${fileError.message}`
          });
        }
      }
    }

    return { summaries };
  } catch (error) {
    console.error('Error summarizing folder:', error);
    return { error: error.message };
  }
}

// Format response for WhatsApp
function formatWhatsAppResponse(command, result, commandData = null) {
  switch (command) {
    case 'LIST':
      if (result.error) {
        return `❌ Error: ${result.error}`;
      }
      if (result.files && result.files.length > 0) {
        const currentPage = result.page || 1;
        const totalPages = result.totalPages || 1;
        let response = `📁 Files (${result.totalFiles} total) - Page ${currentPage}/${totalPages}:\n\n`;
        
        result.files.forEach((file, index) => {
          const fileType = file.mimeType.includes('folder') ? '📁' : '📄';
          const fileName = file.name.length > 25 ? file.name.substring(0, 22) + '...' : file.name;
          const size = file.size ? Math.round(file.size / 1024) + 'KB' : '';
          const fileNumber = ((currentPage - 1) * 10) + index + 1;
          
          response += `${fileNumber}. ${fileType} ${fileName}`;
          if (size) response += ` (${size})`;
          response += `\n`;
        });
        
        if (totalPages > 1) {
          response += `\n📖 Navigation:`;
          if (currentPage < totalPages) {
            response += `\n• Next: LIST path PAGE ${currentPage + 1}`;
          }
          if (currentPage > 1) {
            response += `\n• Previous: LIST path PAGE ${currentPage - 1}`;
          }
          response += `\n\n💡 Example: LIST / PAGE 2`;
        }
        
        return response;
      } else {
        return '📁 No files found in the specified folder.';
      }

    case 'DELETE_REQUEST':
      const filePath = commandData ? commandData.filePath : 'unknown file';
      return `⚠️ DELETE CONFIRMATION REQUIRED

File: ${filePath}

🚨 This action cannot be undone!

To confirm deletion, send:
DELETE ${filePath} CONFIRM

💡 Or send any other message to cancel.`;
      
    case 'DELETE_CONFIRM':
      if (result.error) {
        return `❌ Error: ${result.error}`;
      }
      return `🗑️ File '${result.fileName}' deleted successfully!`;

    case 'MOVE':
      if (result.error) {
        return `❌ Error: ${result.error}`;
      }
      return `📁 File '${result.fileName}' moved to '${result.destination}' successfully!`;

    case 'SUMMARY':
      if (result.error) {
        return `❌ Error: ${result.error}`;
      }
      if (result.summaries && result.summaries.length > 0) {
        let response = `📄 Document Summaries:\n\n`;
        result.summaries.forEach((item, index) => {
          response += `${index + 1}. **${item.fileName}**\n`;
          response += `${item.summary}\n\n`;
        });
        return response;
      } else {
        return '❌ No summarizable documents found in the folder.';
      }

    case 'HELP':
      return `🤖 WhatsApp Google Drive Assistant

Available commands:

📋 LIST /folder/path - List files in folder
📋 LIST /folder/path PAGE 2 - See page 2 of files
🗑️ DELETE filename.pdf - Delete a file (requires confirmation)
📁 MOVE /source /destination - Move file
📄 SUMMARY /folder/path - Summarize documents in folder
📄 SUMMARY filename.pdf - Summarize specific file
❓ HELP - Show this help

Examples:
• LIST /ProjectX
• LIST / PAGE 2
• DELETE report.pdf
• SUMMARY Documents
• SUMMARY resume.pdf

🔒 Safety: DELETE requires confirmation with 'CONFIRM' keyword`;

    case 'UNKNOWN':
    default:
      return '❓ Unknown command. Send HELP to see available commands.';
  }
}

// Main webhook handler
app.post('/whatsapp-webhook', async (req, res) => {
  try {
    console.log('Received WhatsApp webhook:', req.body);

    const messageBody = req.body.Body;
    const fromNumber = req.body.From;
    const messageId = req.body.MessageSid;

    if (!messageBody) {
      return res.json({ status: 'ignored', message: 'No message body' });
    }

    // Parse command
    const parsedCommand = parseCommand(messageBody);
    
    // Log command
    const sessionId = logger.logCommand({
      messageId,
      fromNumber,
      command: parsedCommand.command,
      params: parsedCommand,
      timestamp: new Date().toISOString()
    });

    let result = {};

    // Execute command
    switch (parsedCommand.command) {
      case 'LIST':
        result = await listFiles(parsedCommand.folderPath, parsedCommand.page);
        logger.logDriveOperation('list', { folderPath: parsedCommand.folderPath }, sessionId);
        break;

      case 'DELETE_REQUEST':
        // Just return confirmation request, don't delete yet
        result = { filePath: parsedCommand.filePath };
        logger.logSecurityEvent('delete_request', { filePath: parsedCommand.filePath }, sessionId);
        break;
        
      case 'DELETE_CONFIRM':
        result = await deleteFile(parsedCommand.filePath);
        logger.logDriveOperation('delete', { filePath: parsedCommand.filePath }, sessionId);
        break;

      case 'MOVE':
        result = await moveFile(parsedCommand.sourcePath, parsedCommand.destinationPath);
        logger.logDriveOperation('move', { 
          sourcePath: parsedCommand.sourcePath, 
          destinationPath: parsedCommand.destinationPath 
        }, sessionId);
        break;

      case 'SUMMARY':
        result = await summarizeContent(parsedCommand.folderPath);
        logger.logAISummarization(
          { name: 'folder', mimeType: 'folder' }, 
          result.summaries ? JSON.stringify(result.summaries) : 'error', 
          sessionId
        );
        break;

      case 'HELP':
      case 'UNKNOWN':
      default:
        result = {};
        break;
    }

    // Format response (pass command data for delete requests)
    const responseMessage = formatWhatsAppResponse(parsedCommand.command, result, parsedCommand);

    // Send WhatsApp response
    try {
      await twilioClient.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: fromNumber,
        body: responseMessage
      });
    } catch (twilioError) {
      console.error('Error sending WhatsApp message:', twilioError);
      logger.logError(twilioError, 'whatsapp_send', sessionId);
    }

    res.json({ status: 'success', message: 'Command processed' });

  } catch (error) {
    console.error('Webhook error:', error);
    logger.logError(error, 'webhook_processing', null);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// OAuth callback endpoint
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.send('Authorization failed - no code received');
  }

  try {
    // Initialize OAuth2 client with correct redirect URI for this request
    const client = initializeOAuth2Client(req);
    const { tokens } = await client.getToken(code);
    
    // Set credentials on global client
    oauth2Client.setCredentials(tokens);

    res.send(`
      <h2>Authorization successful!</h2>
      <p>Add these to your .env file:</p>
      <pre>
GOOGLE_OAUTH_ACCESS_TOKEN=${tokens.access_token}
GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}
      </pre>
      <p>Restart your server after updating the .env file.</p>
    `);
  } catch (error) {
    console.error('Token exchange error:', error);
    res.send(`Authorization failed: ${error.message}`);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Show redirect URI for Google Cloud Console setup
app.get('/redirect-uri', (req, res) => {
  const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const host = req.get('host');
  const redirectUri = `${protocol}://${host}/auth/callback`;
  
  res.send(`
    <h1>Google Cloud Console Setup</h1>
    <h2>Add this Redirect URI to your Google OAuth2 credentials:</h2>
    <div style="background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 10px 0;">
      <code style="font-size: 16px; font-weight: bold;">${redirectUri}</code>
    </div>
    <h3>Instructions:</h3>
    <ol>
      <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank">Google Cloud Console - Credentials</a></li>
      <li>Find your OAuth 2.0 Client ID</li>
      <li>Click Edit (pencil icon)</li>
      <li>Under "Authorized redirect URIs", click "ADD URI"</li>
      <li>Paste the URI above: <strong>${redirectUri}</strong></li>
      <li>Click "Save"</li>
      <li>Wait 5-10 minutes for changes to propagate</li>
      <li>Then try <a href="/">authorization</a> again</li>
    </ol>
    <p><a href="/">← Back to main page</a></p>
  `);
});

// Root endpoint with setup instructions
app.get('/', (req, res) => {
  // Initialize OAuth2 client with correct redirect URI
  const client = initializeOAuth2Client(req);
  
  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file'
    ]
  });

  res.send(`
    <h1>WhatsApp Google Drive Assistant</h1>
    <h2>Setup Instructions</h2>
    <ol>
      <li>Set up your environment variables in .env file</li>
      <li><a href="${authUrl}" target="_blank">Authorize Google Drive Access</a></li>
      <li>Configure your Twilio webhook to: <code>${req.protocol}://${req.get('host')}/whatsapp-webhook</code></li>
      <li>Send 'HELP' to your WhatsApp number to test</li>
    </ol>
    <h2>Status</h2>
    <p>Server is running on port ${port}</p>
    <p><a href="/health">Health Check</a></p>
  `);
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 WhatsApp Google Drive Assistant running on port ${port}`);
  console.log(`📝 Webhook URL: http://localhost:${port}/whatsapp-webhook`);
  console.log(`🔐 Setup at: http://localhost:${port}`);
});

module.exports = app;