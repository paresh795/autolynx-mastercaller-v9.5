import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-server'
import { bulletproofSessionStorage as sessionStorage } from '@/lib/session-storage-v2'

// TEST MODE: Campaign creation with duplicate phone support
// This endpoint allows duplicate phone numbers for testing by adding virtual extensions

interface CampaignRequest {
  name: string
  assistantId: string
  phoneNumberId: string
  cap: number
  mode: 'continuous' | 'batch'
  sessionId: string
  testMode?: boolean // Enable test mode for duplicate phone support
}

async function POST(request: NextRequest) {
  try {
    const body: CampaignRequest = await request.json()
    const { name, assistantId, phoneNumberId, cap, mode, sessionId, testMode = false } = body

    console.log('📋 TEST MODE CAMPAIGN CREATION:', { name, testMode })

    // Validate required fields
    if (!name || name.trim().length < 3) {
      return NextResponse.json(
        { error: 'Campaign name must be at least 3 characters' },
        { status: 400 }
      )
    }

    if (!assistantId) {
      return NextResponse.json(
        { error: 'Assistant is required' },
        { status: 400 }
      )
    }

    if (!phoneNumberId) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      )
    }

    if (!cap || cap < 1 || cap > 50) {
      return NextResponse.json(
        { error: 'Concurrency cap must be between 1 and 50' },
        { status: 400 }
      )
    }

    if (!mode || !['continuous', 'batch'].includes(mode)) {
      return NextResponse.json(
        { error: 'Invalid campaign mode' },
        { status: 400 }
      )
    }

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }

    // Retrieve validation data from session
    const validationData = await sessionStorage.retrieve(sessionId)
    if (!validationData) {
      return NextResponse.json(
        { error: 'Session expired. Please upload your CSV again.' },
        { status: 400 }
      )
    }

    // Verify assistant exists and is active
    const { data: assistant, error: assistantError } = await supabaseAdmin
      .from('assistants')
      .select('id, active')
      .eq('id', assistantId)
      .single()

    if (assistantError || !assistant || !assistant.active) {
      return NextResponse.json(
        { error: 'Assistant not found or inactive' },
        { status: 400 }
      )
    }

    // Create campaign
    const campaignId = crypto.randomUUID()
    
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('campaigns')
      .insert({
        id: campaignId,
        name: name.trim(),
        assistant_id: assistantId,
        phone_number_id: phoneNumberId,
        cap: cap,
        mode: mode,
        total_contacts: validationData.valid.length
      })
      .select()
      .single()

    if (campaignError) {
      console.error('Campaign creation error:', campaignError)
      return NextResponse.json(
        { error: 'Failed to create campaign' },
        { status: 500 }
      )
    }

    // Process contacts with TEST MODE virtual phone support
    let successfulContacts = 0
    let duplicateContacts = 0
    let failedContacts = 0
    const phoneTracker = new Map<string, number>() // Track phone usage count

    for (let i = 0; i < validationData.valid.length; i++) {
      const contact = validationData.valid[i]
      
      try {
        let processedPhone = contact.phone
        
        if (testMode) {
          // In test mode, append a virtual extension to duplicate phones
          const phoneCount = phoneTracker.get(contact.phone) || 0
          phoneTracker.set(contact.phone, phoneCount + 1)
          
          if (phoneCount > 0) {
            // Add virtual extension for duplicates (e.g., +15551234567#001)
            processedPhone = `${contact.phone}#${phoneCount.toString().padStart(3, '0')}`
            console.log(`🧪 TEST MODE: Virtual number created: ${processedPhone} (original: ${contact.phone})`)
          }
        }

        const { error } = await supabaseAdmin
          .from('contacts')
          .insert([{
            id: crypto.randomUUID(),
            campaign_id: campaignId,
            name: contact.name,
            business_name: contact.business_name,
            phone: processedPhone, // Use processed phone (with virtual extension if duplicate)
            phone_original: contact.phone_original || contact.phone,
            batch_index: Math.floor(i / cap) // Group into batches based on cap
          }])

        if (error) {
          if (error.code === '23505') {
            duplicateContacts++
            console.log(`Duplicate contact skipped: ${contact.phone}`)
          } else {
            failedContacts++
            console.error('Contact insertion error:', error)
          }
        } else {
          successfulContacts++
        }
      } catch (contactError) {
        failedContacts++
        console.error('Failed to insert contact:', contactError)
      }
    }

    console.log(`✅ TEST MODE Campaign created: ${successfulContacts} contacts, ${duplicateContacts} duplicates handled`)

    // Create initial call records for all contacts
    const { data: contacts } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('campaign_id', campaignId)

    if (contacts && contacts.length > 0) {
      const callRecords = contacts.map(contact => ({
        id: crypto.randomUUID(),
        campaign_id: campaignId,
        contact_id: contact.id,
        status: 'QUEUED' as const
      }))

      await supabaseAdmin
        .from('calls')
        .insert(callRecords)
    }

    // Update campaign with actual contact count
    await supabaseAdmin
      .from('campaigns')
      .update({ total_contacts: successfulContacts })
      .eq('id', campaignId)

    // Clear session data
    await sessionStorage.delete(sessionId)

    return NextResponse.json({
      campaignId,
      message: `Campaign "${name}" created successfully with ${successfulContacts} contacts${testMode ? ' (TEST MODE)' : ''}`,
      totalContacts: validationData.valid.length,
      successfulContacts,
      duplicatesHandled: duplicateContacts,
      failedContacts,
      testMode
    })

  } catch (error: any) {
    console.error('Campaign creation error:', error)
    return NextResponse.json(
      { error: 'Failed to create campaign' },
      { status: 500 }
    )
  }
}

// Export without auth for testing
export { POST }