// Structured logging system for AutoLynx

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

export interface LogContext {
  userId?: string
  campaignId?: string
  callId?: string
  assistantId?: string
  requestId?: string
  [key: string]: any
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: LogContext
  error?: {
    name: string
    message: string
    stack?: string
  }
  metadata?: Record<string, any>
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development'

  private formatLog(entry: LogEntry): string {
    if (this.isDevelopment) {
      // Pretty format for development
      const timestamp = entry.timestamp
      const level = entry.level.toUpperCase().padEnd(5)
      const context = entry.context ? ` [${JSON.stringify(entry.context)}]` : ''
      const metadata = entry.metadata ? ` ${JSON.stringify(entry.metadata)}` : ''
      
      return `${timestamp} ${level} ${entry.message}${context}${metadata}`
    } else {
      // JSON format for production
      return JSON.stringify(entry)
    }
  }

  private log(level: LogLevel, message: string, context?: LogContext, metadata?: Record<string, any>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      metadata
    }

    const formatted = this.formatLog(entry)
    
    // Output to appropriate console method
    switch (level) {
      case LogLevel.ERROR:
        console.error(formatted)
        break
      case LogLevel.WARN:
        console.warn(formatted)
        break
      case LogLevel.INFO:
        console.info(formatted)
        break
      case LogLevel.DEBUG:
        if (this.isDevelopment) {
          console.debug(formatted)
        }
        break
    }
  }

  error(message: string, error?: Error, context?: LogContext, metadata?: Record<string, any>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.ERROR,
      message,
      context,
      metadata
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    }

    const formatted = this.formatLog(entry)
    console.error(formatted)
  }

  warn(message: string, context?: LogContext, metadata?: Record<string, any>) {
    this.log(LogLevel.WARN, message, context, metadata)
  }

  info(message: string, context?: LogContext, metadata?: Record<string, any>) {
    this.log(LogLevel.INFO, message, context, metadata)
  }

  debug(message: string, context?: LogContext, metadata?: Record<string, any>) {
    this.log(LogLevel.DEBUG, message, context, metadata)
  }

  // Specific logging methods for common operations
  apiRequest(method: string, path: string, context?: LogContext) {
    this.info(`API ${method} ${path}`, context, { type: 'api_request' })
  }

  apiResponse(method: string, path: string, status: number, duration: number, context?: LogContext) {
    this.info(`API ${method} ${path} ${status}`, context, { 
      type: 'api_response', 
      status, 
      duration_ms: duration 
    })
  }

  dbQuery(query: string, duration: number, context?: LogContext) {
    this.debug(`DB Query: ${query}`, context, { 
      type: 'db_query', 
      duration_ms: duration 
    })
  }

  callEvent(event: string, callId: string, campaignId: string, metadata?: Record<string, any>) {
    this.info(`Call event: ${event}`, { callId, campaignId }, { 
      type: 'call_event', 
      event,
      ...metadata 
    })
  }

  campaignEvent(event: string, campaignId: string, metadata?: Record<string, any>) {
    this.info(`Campaign event: ${event}`, { campaignId }, { 
      type: 'campaign_event', 
      event,
      ...metadata 
    })
  }

  authEvent(event: string, userId?: string, email?: string, metadata?: Record<string, any>) {
    this.info(`Auth event: ${event}`, { userId }, { 
      type: 'auth_event', 
      event,
      email,
      ...metadata 
    })
  }

  vapiRequest(endpoint: string, method: string, context?: LogContext) {
    this.info(`Vapi ${method} ${endpoint}`, context, { type: 'vapi_request' })
  }

  vapiResponse(endpoint: string, method: string, status: number, duration: number, context?: LogContext) {
    this.info(`Vapi ${method} ${endpoint} ${status}`, context, { 
      type: 'vapi_response', 
      status, 
      duration_ms: duration 
    })
  }

  webhookReceived(source: string, event: string, context?: LogContext) {
    this.info(`Webhook received: ${source} ${event}`, context, { 
      type: 'webhook_received', 
      source, 
      event 
    })
  }

  schedulerRun(campaignsProcessed: number, callsLaunched: number, duration: number) {
    this.info('Scheduler tick completed', undefined, {
      type: 'scheduler_run',
      campaigns_processed: campaignsProcessed,
      calls_launched: callsLaunched,
      duration_ms: duration
    })
  }
}

// Export singleton instance
export const logger = new Logger()

// Middleware helper for API route logging
export function withLogging(handler: Function) {
  return async (request: Request, ...args: any[]) => {
    const start = Date.now()
    const method = request.method
    const url = new URL(request.url)
    const path = url.pathname
    
    // Generate request ID for tracing
    const requestId = crypto.randomUUID()
    
    logger.apiRequest(method, path, { requestId })
    
    try {
      const response = await handler(request, ...args)
      const duration = Date.now() - start
      const status = response.status || 200
      
      logger.apiResponse(method, path, status, duration, { requestId })
      
      return response
    } catch (error) {
      const duration = Date.now() - start
      
      logger.error(`API ${method} ${path} failed`, error as Error, { requestId })
      
      throw error
    }
  }
}