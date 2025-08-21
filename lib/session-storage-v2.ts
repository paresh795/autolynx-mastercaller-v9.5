// BULLETPROOF SESSION STORAGE - PRODUCTION READY
// Multiple persistence layers with comprehensive error handling
import { promises as fs } from 'fs'
import path from 'path'

interface ValidationSession {
  sessionId: string
  validation: any
  timestamp: number
  expiresAt: number
}

interface SessionStorageStats {
  totalSessions: number
  validSessions: number
  expiredSessions: number
  fileExists: boolean
  lastInitialized: number
  lastPersisted: number
}

class BulletproofSessionStorage {
  private sessions: Map<string, ValidationSession> = new Map()
  private readonly EXPIRY_TIME = 30 * 60 * 1000 // 30 minutes
  private readonly STORAGE_FILE = path.join(process.cwd(), '.sessions.json')
  private readonly BACKUP_FILE = path.join(process.cwd(), '.sessions.backup.json')
  private readonly TEMP_FILE = path.join(process.cwd(), '.sessions.tmp.json')
  private initialized = false
  private lastPersisted = 0
  private initializationAttempts = 0

  // INITIALIZATION WITH MULTIPLE FALLBACKS
  private async initialize(): Promise<void> {
    if (this.initialized) return

    this.initializationAttempts++
    console.log(`🔧 SESSION INIT v2: Attempt #${this.initializationAttempts} - Initializing bulletproof session storage`)

    try {
      // Try primary file first
      await this.loadFromFile(this.STORAGE_FILE, 'primary')
    } catch (primaryError) {
      console.log(`⚠️  PRIMARY FILE FAILED: ${primaryError.message}`)
      
      try {
        // Fallback to backup file
        await this.loadFromFile(this.BACKUP_FILE, 'backup')
      } catch (backupError) {
        console.log(`⚠️  BACKUP FILE FAILED: ${backupError.message}`)
        console.log(`🆕 STARTING FRESH: Creating new session storage`)
      }
    }

    this.initialized = true
    console.log(`✅ SESSION INIT v2: Initialized with ${this.sessions.size} sessions`)
  }

  private async loadFromFile(filePath: string, fileType: string): Promise<void> {
    const data = await fs.readFile(filePath, 'utf-8')
    const sessions: ValidationSession[] = JSON.parse(data)
    
    console.log(`📂 ${fileType.toUpperCase()} FILE: Found ${sessions.length} sessions`)
    
    const now = Date.now()
    let loadedCount = 0
    let expiredCount = 0
    
    for (const session of sessions) {
      if (now < session.expiresAt) {
        this.sessions.set(session.sessionId, session)
        loadedCount++
      } else {
        expiredCount++
      }
    }
    
    console.log(`✅ ${fileType.toUpperCase()} LOADED: ${loadedCount} valid, ${expiredCount} expired`)
  }

  // BULLETPROOF PERSISTENCE WITH ATOMIC WRITES
  private async persist(): Promise<void> {
    if (this.sessions.size === 0) {
      console.log(`📝 SKIP PERSIST: No sessions to save`)
      return
    }

    try {
      const sessions = Array.from(this.sessions.values())
      const jsonData = JSON.stringify(sessions, null, 2)
      
      // ATOMIC WRITE: Write to temp file first, then rename
      await fs.writeFile(this.TEMP_FILE, jsonData)
      
      // Create backup of current file if it exists
      try {
        await fs.copyFile(this.STORAGE_FILE, this.BACKUP_FILE)
      } catch (e) {
        // Current file doesn't exist, that's ok for first write
      }
      
      // Atomic rename (this is the critical moment)
      await fs.rename(this.TEMP_FILE, this.STORAGE_FILE)
      
      this.lastPersisted = Date.now()
      console.log(`💾 PERSIST SUCCESS: ${sessions.length} sessions saved atomically`)
      
    } catch (error) {
      console.error(`❌ PERSIST FAILED: ${error.message}`)
      
      // Try to clean up temp file
      try {
        await fs.unlink(this.TEMP_FILE)
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      throw error
    }
  }

  // ENHANCED STORE WITH VALIDATION
  async store(sessionId: string, validation: any): Promise<void> {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('Invalid session ID')
    }
    
    if (!validation || !validation.valid || !Array.isArray(validation.valid)) {
      throw new Error('Invalid validation data structure')
    }

    console.log(`💾 SESSION STORE v2: Storing ${sessionId} with ${validation.valid.length} contacts`)
    
    await this.initialize()
    
    const now = Date.now()
    const session: ValidationSession = {
      sessionId,
      validation: JSON.parse(JSON.stringify(validation)), // Deep clone
      timestamp: now,
      expiresAt: now + this.EXPIRY_TIME
    }
    
    this.sessions.set(sessionId, session)
    console.log(`📊 SESSIONS TOTAL: ${this.sessions.size}`)
    
    await this.cleanup()
    await this.persist()
    
    console.log(`✅ STORE COMPLETE: ${sessionId}`)
  }

  // ENHANCED RETRIEVE WITH COMPREHENSIVE LOGGING
  async retrieve(sessionId: string): Promise<any | null> {
    if (!sessionId || typeof sessionId !== 'string') {
      console.log(`❌ INVALID SESSION ID: ${sessionId}`)
      return null
    }

    console.log(`🔍 SESSION RETRIEVE v2: Looking for ${sessionId}`)
    
    await this.initialize()
    
    console.log(`📊 STORAGE STATE: ${this.sessions.size} total sessions`)
    console.log(`📋 AVAILABLE IDs: [${Array.from(this.sessions.keys()).slice(0, 5).join(', ')}${this.sessions.size > 5 ? '...' : ''}]`)
    
    const session = this.sessions.get(sessionId)
    
    if (!session) {
      console.log(`❌ SESSION NOT FOUND: ${sessionId}`)
      return null
    }
    
    const now = Date.now()
    const timeRemaining = session.expiresAt - now
    const minutesRemaining = Math.round(timeRemaining / 1000 / 60)
    
    console.log(`⏰ EXPIRY CHECK: ${minutesRemaining} minutes remaining`)
    
    if (now > session.expiresAt) {
      console.log(`🕒 SESSION EXPIRED: ${sessionId}`)
      this.sessions.delete(sessionId)
      await this.persist()
      return null
    }
    
    const contactCount = session.validation?.valid?.length || 0
    console.log(`✅ SESSION RETRIEVED: ${sessionId} with ${contactCount} contacts`)
    
    // Return deep clone to prevent mutations
    return JSON.parse(JSON.stringify(session.validation))
  }

  // ENHANCED DELETE
  async delete(sessionId: string): Promise<void> {
    console.log(`🗑️  SESSION DELETE: ${sessionId}`)
    
    await this.initialize()
    
    const existed = this.sessions.has(sessionId)
    this.sessions.delete(sessionId)
    
    if (existed) {
      await this.persist()
      console.log(`✅ DELETE COMPLETE: ${sessionId}`)
    } else {
      console.log(`⚠️  DELETE: Session ${sessionId} didn't exist`)
    }
  }

  // CLEANUP WITH LOGGING
  private async cleanup(): Promise<void> {
    const now = Date.now()
    let removedCount = 0
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(sessionId)
        removedCount++
      }
    }
    
    if (removedCount > 0) {
      console.log(`🧹 CLEANUP: Removed ${removedCount} expired sessions`)
      await this.persist()
    }
  }

  // DIAGNOSTIC METHODS
  async getStats(): Promise<SessionStorageStats> {
    await this.initialize()
    
    const now = Date.now()
    let validSessions = 0
    let expiredSessions = 0
    
    for (const session of this.sessions.values()) {
      if (now < session.expiresAt) {
        validSessions++
      } else {
        expiredSessions++
      }
    }
    
    let fileExists = false
    try {
      await fs.access(this.STORAGE_FILE)
      fileExists = true
    } catch (e) {
      // File doesn't exist
    }
    
    return {
      totalSessions: this.sessions.size,
      validSessions,
      expiredSessions,
      fileExists,
      lastInitialized: this.initialized ? Date.now() : 0,
      lastPersisted: this.lastPersisted
    }
  }

  async getAllSessionIds(): Promise<string[]> {
    await this.initialize()
    return Array.from(this.sessions.keys())
  }

  // FORCE REFRESH FROM DISK
  async refresh(): Promise<void> {
    console.log(`🔄 FORCE REFRESH: Reloading from disk`)
    this.initialized = false
    this.sessions.clear()
    await this.initialize()
  }
}

// Singleton instance
export const bulletproofSessionStorage = new BulletproofSessionStorage()