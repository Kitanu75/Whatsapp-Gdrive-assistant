#!/bin/bash

# WhatsApp Google Drive Assistant Setup Script
# This script helps set up the n8n workflow environment

set -e

echo "🚀 Setting up WhatsApp Google Drive Assistant..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📄 Creating .env file from template..."
    cp .env.example .env
    echo "✅ .env file created. Please edit it with your API credentials."
    echo "⚠️  You need to configure the following variables:"
    echo "   - TWILIO_ACCOUNT_SID"
    echo "   - TWILIO_AUTH_TOKEN"
    echo "   - TWILIO_WHATSAPP_NUMBER"
    echo "   - GOOGLE_OAUTH_CLIENT_ID"
    echo "   - GOOGLE_OAUTH_CLIENT_SECRET"
    echo "   - GOOGLE_GEMINI_API_KEY"
    echo ""
    echo "Edit the .env file now? (y/n)"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        ${EDITOR:-nano} .env
    fi
fi

# Create nginx configuration if it doesn't exist
if [ ! -f nginx.conf ]; then
    echo "🌐 Creating nginx configuration..."
    cat > nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream n8n {
        server n8n:5678;
    }

    server {
        listen 80;
        server_name localhost;

        location / {
            proxy_pass http://n8n;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # WebSocket support
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }
}
EOF
    echo "✅ nginx.conf created"
fi

# Start the services
echo "🐳 Starting Docker services..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check if n8n is running
if curl -f http://localhost:5678/healthz > /dev/null 2>&1; then
    echo "✅ n8n is running successfully!"
else
    echo "⚠️  n8n might still be starting up. Check logs with: docker-compose logs -f n8n"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Open http://localhost:5678 in your browser"
echo "2. Import the workflow.json file"
echo "3. Configure your API credentials in n8n"
echo "4. Set up your Twilio webhook URL to: http://your-domain:5678/webhook/whatsapp-webhook"
echo "5. Test by sending 'HELP' to your WhatsApp number"
echo ""
echo "Useful commands:"
echo "- View logs: docker-compose logs -f"
echo "- Stop services: docker-compose down"
echo "- Restart services: docker-compose restart"
echo ""

# Display current status
echo "📊 Current service status:"
docker-compose ps
