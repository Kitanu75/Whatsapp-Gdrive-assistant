# WhatsApp-Driven Google Drive Assistant

## Overview

This project is an n8n workflow automation that creates a WhatsApp-powered Google Drive assistant. Users can send WhatsApp messages to perform Google Drive operations like listing files, deleting documents, moving items, and generating AI-powered summaries of documents using Google Gemini API. The system provides a conversational interface for managing Google Drive content through simple text commands sent via WhatsApp.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Workflow Engine
- **n8n-based automation**: The core system is built as an n8n workflow that processes incoming WhatsApp messages and orchestrates various operations
- **Node-based processing**: Uses webhook nodes, conditional logic nodes, and API integration nodes to handle the message flow
- **Event-driven architecture**: Responds to incoming webhook events from Twilio WhatsApp integration

### Communication Layer
- **WhatsApp Integration**: Uses Twilio WhatsApp Sandbox API for receiving and sending messages
- **Webhook endpoint**: Exposes a POST endpoint `/whatsapp-webhook` to receive WhatsApp message events
- **Message filtering**: Implements conditional logic to validate and route incoming messages based on content

### Authentication & Authorization
- **OAuth2 Flow**: Implements Google OAuth2 for secure access to Google Drive APIs
- **Scoped permissions**: Requests specific Google Drive scopes for file operations
- **Token management**: Handles access token refresh and storage for sustained API access

### File Operations
- **Google Drive API integration**: Direct integration with Google Drive API for file and folder operations
- **CRUD operations**: Supports listing, deleting, and moving files/folders
- **Safety mechanisms**: Includes protection against accidental mass deletion operations

### AI Integration
- **Google Gemini API**: Integrates with Google's Gemini AI model for document summarization
- **Document processing**: Automatically processes documents in specified folders to generate intelligent summaries
- **Context-aware responses**: Provides meaningful summaries based on document content

### Logging & Monitoring
- **Audit logging system**: Custom logging helper that tracks all operations and user interactions
- **Session tracking**: Generates unique session IDs to track related operations
- **File rotation**: Implements log file rotation with size limits and retention policies
- **Structured logging**: JSON-formatted logs with timestamps, levels, and metadata

### Command Processing
- **Natural language commands**: Processes simple text commands like LIST, DELETE, MOVE, SUMMARY, HELP
- **Path-based operations**: Supports Unix-style path notation for file and folder references
- **Confirmation workflows**: Implements safety confirmations for destructive operations

## External Dependencies

### Communication Services
- **Twilio WhatsApp API**: For sending and receiving WhatsApp messages through their sandbox environment
- **n8n platform**: Workflow automation platform that hosts and executes the entire system

### Google Services
- **Google Drive API**: For all file and folder operations within Google Drive
- **Google Gemini API**: For AI-powered document summarization and content analysis
- **Google OAuth2**: For secure authentication and authorization

### Infrastructure
- **Node.js runtime**: Required for helper scripts and custom functions
- **File system access**: For local logging and temporary file operations
- **HTTPS/HTTP clients**: For making API calls to external services

### Development Tools
- **Environment variables**: For storing sensitive configuration like API keys and client secrets
- **JSON configuration**: Workflow definition stored in JSON format for version control and deployment
