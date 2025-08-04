/**
 * Audit Logger Helper
 * Provides enhanced logging capabilities for the WhatsApp Drive Assistant
 */

const fs = require('fs');
const path = require('path');

class AuditLogger {
    constructor(options = {}) {
        this.logLevel = options.logLevel || 'info';
        this.logFile = options.logFile || 'audit.log';
        this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
        this.maxFiles = options.maxFiles || 5;
        this.logDir = options.logDir || './logs';
        
        // Ensure log directory exists
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    /**
     * Get current timestamp in ISO format
     */
    getCurrentTimestamp() {
        return new Date().toISOString();
    }

    /**
     * Format log entry
     */
    formatLogEntry(level, message, metadata = {}) {
        return {
            timestamp: this.getCurrentTimestamp(),
            level: level.toUpperCase(),
            message,
            metadata,
            sessionId: this.generateSessionId()
        };
    }

    /**
     * Generate session ID for tracking related operations
     */
    generateSessionId() {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    }

    /**
     * Write log entry to file
     */
    writeLogEntry(entry) {
        const logPath = path.join(this.logDir, this.logFile);
        const logLine = JSON.stringify(entry) + '\n';

        try {
            // Check file size and rotate if necessary
            if (fs.existsSync(logPath)) {
                const stats = fs.statSync(logPath);
                if (stats.size > this.maxFileSize) {
                    this.rotateLogFile(logPath);
                }
            }

            fs.appendFileSync(logPath, logLine);
        } catch (error) {
            console.error('Failed to write audit log:', error);
        }
    }

    /**
     * Rotate log files when they get too large
     */
    rotateLogFile(currentLogPath) {
        try {
            // Move existing files up in sequence
            for (let i = this.maxFiles - 1; i >= 1; i--) {
                const oldFile = `${currentLogPath}.${i}`;
                const newFile = `${currentLogPath}.${i + 1}`;
                
                if (fs.existsSync(oldFile)) {
                    if (i === this.maxFiles - 1) {
                        fs.unlinkSync(oldFile); // Delete oldest file
                    } else {
                        fs.renameSync(oldFile, newFile);
                    }
                }
            }

            // Move current log to .1
            if (fs.existsSync(currentLogPath)) {
                fs.renameSync(currentLogPath, `${currentLogPath}.1`);
            }
        } catch (error) {
            console.error('Failed to rotate log files:', error);
        }
    }

    /**
     * Log WhatsApp command execution
     */
    logCommand(commandData) {
        const entry = this.formatLogEntry('info', 'WhatsApp command executed', {
            type: 'command_execution',
            messageId: commandData.messageId,
            fromNumber: commandData.fromNumber,
            command: commandData.command,
            params: commandData.params,
            timestamp: commandData.timestamp
        });

        this.writeLogEntry(entry);
        return entry.sessionId;
    }

    /**
     * Log Google Drive operation
     */
    logDriveOperation(operation, details, sessionId) {
        const entry = this.formatLogEntry('info', `Google Drive ${operation} operation`, {
            type: 'drive_operation',
            operation,
            details,
            sessionId
        });

        this.writeLogEntry(entry);
    }

    /**
     * Log AI summarization request
     */
    logAISummarization(fileInfo, summary, sessionId) {
        const entry = this.formatLogEntry('info', 'AI summarization completed', {
            type: 'ai_summarization',
            fileName: fileInfo.name,
            fileType: fileInfo.mimeType,
            summaryLength: summary ? summary.length : 0,
            sessionId
        });

        this.writeLogEntry(entry);
    }

    /**
     * Log errors
     */
    logError(error, context, sessionId) {
        const entry = this.formatLogEntry('error', 'Operation failed', {
            type: 'error',
            error: {
                message: error.message,
                stack: error.stack,
                name: error.name
            },
            context,
            sessionId
        });

        this.writeLogEntry(entry);
    }

    /**
     * Log security events
     */
    logSecurityEvent(event, details, sessionId) {
        const entry = this.formatLogEntry('warn', `Security event: ${event}`, {
            type: 'security_event',
            event,
            details,
            sessionId
        });

        this.writeLogEntry(entry);
    }

    /**
     * Get recent logs for monitoring
     */
    getRecentLogs(count = 100) {
        const logPath = path.join(this.logDir, this.logFile);
        
        try {
            if (!fs.existsSync(logPath)) {
                return [];
            }

            const content = fs.readFileSync(logPath, 'utf8');
            const lines = content.trim().split('\n');
            const recentLines = lines.slice(-count);
            
            return recentLines
                .filter(line => line.trim())
                .map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return null;
                    }
                })
                .filter(entry => entry !== null);
        } catch (error) {
            console.error('Failed to read audit logs:', error);
            return [];
        }
    }

    /**
     * Generate audit report
     */
    generateAuditReport(fromDate, toDate) {
        const logs = this.getRecentLogs(10000); // Get more logs for report
        const filteredLogs = logs.filter(log => {
            const logDate = new Date(log.timestamp);
            return logDate >= fromDate && logDate <= toDate;
        });

        const report = {
            period: { from: fromDate.toISOString(), to: toDate.toISOString() },
            totalOperations: filteredLogs.length,
            commandsSummary: {},
            errorCount: 0,
            securityEvents: 0,
            mostActiveUsers: {},
            operationBreakdown: {}
        };

        filteredLogs.forEach(log => {
            // Count commands
            if (log.metadata.type === 'command_execution') {
                const command = log.metadata.command;
                report.commandsSummary[command] = (report.commandsSummary[command] || 0) + 1;
                
                // Track user activity
                const user = log.metadata.fromNumber;
                report.mostActiveUsers[user] = (report.mostActiveUsers[user] || 0) + 1;
            }

            // Count operations
            if (log.metadata.type === 'drive_operation') {
                const operation = log.metadata.operation;
                report.operationBreakdown[operation] = (report.operationBreakdown[operation] || 0) + 1;
            }

            // Count errors
            if (log.level === 'ERROR') {
                report.errorCount++;
            }

            // Count security events
            if (log.metadata.type === 'security_event') {
                report.securityEvents++;
            }
        });

        return report;
    }

    /**
     * Clean old logs
     */
    cleanOldLogs(daysToKeep = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        try {
            const logFiles = fs.readdirSync(this.logDir)
                .filter(file => file.startsWith(this.logFile))
                .map(file => ({
                    name: file,
                    path: path.join(this.logDir, file),
                    stats: fs.statSync(path.join(this.logDir, file))
                }));

            let deletedFiles = 0;
            logFiles.forEach(file => {
                if (file.stats.mtime < cutoffDate) {
                    fs.unlinkSync(file.path);
                    deletedFiles++;
                }
            });

            console.log(`Cleaned ${deletedFiles} old log files`);
        } catch (error) {
            console.error('Failed to clean old logs:', error);
        }
    }
}

module.exports = AuditLogger;

// Example usage for n8n Code nodes:
/*
const AuditLogger = require('./helpers/audit-logger');
const logger = new AuditLogger();

// In your n8n workflow code nodes, you can use:
const sessionId = logger.logCommand({
    messageId: $json.messageId,
    fromNumber: $json.fromNumber,
    command: $json.command,
    params: $json.params,
    timestamp: $json.timestamp
});

// Store sessionId in workflow data for use in subsequent nodes
return [{ json: { ...items[0].json, sessionId } }];
*/
