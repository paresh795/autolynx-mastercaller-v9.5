// Temporary in-memory storage for CSV validation sessions
// TODO: Replace with proper Redis/database storage in production

import { promises as fs } from 'fs'
import path from 'path'

interface ValidationSession {
  sessionId: string
  validation: any
  timestamp: number
  expiresAt: number
}

class SessionStorage {
  private sessions: Map<string, ValidationSession> = new Map()
  private readonly EXPIRY_TIME = 30 * 60 * 1000 // 30 minutes
  private readonly STORAGE_FILE = path.join(process.cwd(), '.sessions.json')
  private initialized = false

  private async initialize(): Promise<void> {
    if (this.initialized) return
    
    console.log(`🔧 SESSION INIT: Initializing session storage from ${this.STORAGE_FILE}`)
    
    try {
      // Try to load existing sessions from file
      const data = await fs.readFile(this.STORAGE_FILE, 'utf-8')
      const sessions: ValidationSession[] = JSON.parse(data)
      
      console.log(`📂 FILE LOADED: Found ${sessions.length} sessions in file`)
      
      const now = Date.now()
      let loadedCount = 0
      for (const session of sessions) {
        if (now < session.expiresAt) {
          this.sessions.set(session.sessionId, session)
          loadedCount++
        }
      }
      
      console.log(`✅ SESSIONS LOADED: ${loadedCount} valid sessions loaded from file`)
    } catch (error) {
      console.log(`📁 FILE INIT: No existing session file found, starting fresh (${error.message})`)
    }
    
    this.initialized = true
  }

  private async persist(): Promise<void> {
    try {
      const sessions = Array.from(this.sessions.values())
      await fs.writeFile(this.STORAGE_FILE, JSON.stringify(sessions, null, 2))
    } catch (error) {
      console.error('Failed to persist sessions:', error)
    }
  }

  async store(sessionId: string, validation: any): Promise<void> {
    console.log(`💾 SESSION STORE: Storing session ${sessionId} with ${validation?.valid?.length || 0} valid contacts`)
    
    await this.initialize()
    
    const now = Date.now()
    const session: ValidationSession = {
      sessionId,
      validation,
      timestamp: now,
      expiresAt: now + this.EXPIRY_TIME
    }
    
    this.sessions.set(sessionId, session)
    console.log(`📊 SESSION STORED: Total sessions now: ${this.sessions.size}`)
    
    await this.cleanup()
    await this.persist()
    
    console.log(`✅ SESSION PERSISTED: ${sessionId}`)
  }

  async retrieve(sessionId: string): Promise<any | null> {
    console.log(`🔍 SESSION RETRIEVE: Attempting to retrieve session ${sessionId}`)
    
    await this.initialize()
    
    console.log(`📊 SESSION STATS: Total sessions in memory: ${this.sessions.size}`)
    console.log(`📋 SESSION IDS: ${Array.from(this.sessions.keys()).join(', ')}`)
    
    const session = this.sessions.get(sessionId)
    
    if (!session) {
      console.log(`❌ SESSION NOT FOUND: ${sessionId}`)
      return null
    }
    
    const now = Date.now()
    const timeUntilExpiry = session.expiresAt - now
    console.log(`⏰ SESSION EXPIRY: ${Math.round(timeUntilExpiry / 1000 / 60)} minutes remaining`)
    
    if (now > session.expiresAt) {
      console.log(`🕒 SESSION EXPIRED: ${sessionId}`)
      this.sessions.delete(sessionId)
      await this.persist()
      return null
    }
    
    console.log(`✅ SESSION FOUND: ${sessionId} with ${session.validation?.valid?.length || 0} valid contacts`)
    return session.validation
  }

  async delete(sessionId: string): Promise<void> {
    await this.initialize()
    this.sessions.delete(sessionId)
    await this.persist()
  }

  private async cleanup(): Promise<void> {
    const now = Date.now()
    let changed = false
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(sessionId)
        changed = true
      }
    }
    
    if (changed) {
      await this.persist()
    }
  }

  async getSessionCount(): Promise<number> {
    await this.initialize()
    await this.cleanup()
    return this.sessions.size
  }
}

// Singleton instance
export const sessionStorage = new SessionStorage()