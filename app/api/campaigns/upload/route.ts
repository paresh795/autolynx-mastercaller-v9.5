import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import Papa from 'papaparse'
import { customAlphabet } from 'nanoid'
import { bulletproofSessionStorage as sessionStorage } from '@/lib/session-storage-v2'

interface CSVRow {
  name?: string
  business_name?: string  
  phone?: string
  [key: string]: any
}

interface ValidationResult {
  valid: Array<{
    name: string
    business_name: string
    phone: string
    phone_original: string
  }>
  invalid: Array<{
    row: number
    data: CSVRow
    errors: string[]
  }>
  summary: {
    totalRows: number
    validRows: number
    invalidRows: number
    duplicates: number
  }
}

// Phone number normalization
function normalizePhone(phone: string): string | null {
  if (!phone) return null
  
  // Remove all non-numeric characters except leading +
  let cleaned = phone.replace(/[^\d+]/g, '')
  
  // Remove + from middle/end positions
  if (cleaned.includes('+') && !cleaned.startsWith('+')) {
    cleaned = cleaned.replace(/\+/g, '')
  }
  
  // Handle US numbers
  if (cleaned.length === 10) {
    // Add US country code
    cleaned = '+1' + cleaned
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    // Add + to US number
    cleaned = '+' + cleaned
  } else if (cleaned.length === 11 && !cleaned.startsWith('+')) {
    // Assume US number, add +1
    cleaned = '+1' + cleaned.substring(1)
  }
  
  // Validate length (should be 10-15 digits after country code)
  const digits = cleaned.replace(/^\+/, '')
  if (digits.length < 10 || digits.length > 15) {
    return null
  }
  
  return cleaned
}

// Validate required headers
function validateHeaders(headers: string[]): string[] {
  const required = ['name', 'business_name', 'phone']
  const normalized = headers.map(h => h.toLowerCase().trim())
  
  const missing: string[] = []
  for (const field of required) {
    if (!normalized.includes(field)) {
      missing.push(field)
    }
  }
  
  return missing
}

// Validate and process CSV data
function validateCSVData(data: CSVRow[]): ValidationResult {
  const valid: ValidationResult['valid'] = []
  const invalid: ValidationResult['invalid'] = []
  const phoneSet = new Set<string>()
  let duplicates = 0
  
  data.forEach((row, index) => {
    const errors: string[] = []
    const rowNumber = index + 2 // +2 because index is 0-based and we skip header
    
    // Normalize field names (case-insensitive)
    const normalizedRow: any = {}
    Object.keys(row).forEach(key => {
      normalizedRow[key.toLowerCase().trim()] = row[key]
    })
    
    // Extract required fields
    const name = normalizedRow.name?.toString().trim()
    const business_name = normalizedRow.business_name?.toString().trim()
    const phone = normalizedRow.phone?.toString().trim()
    
    // Validate required fields
    if (!name) {
      errors.push('Name is required')
    } else if (name.length > 100) {
      errors.push('Name must be less than 100 characters')
    }
    
    if (!business_name) {
      errors.push('Business name is required')
    } else if (business_name.length > 200) {
      errors.push('Business name must be less than 200 characters')
    }
    
    if (!phone) {
      errors.push('Phone number is required')
    } else {
      // Normalize phone number
      const normalizedPhone = normalizePhone(phone)
      if (!normalizedPhone) {
        errors.push('Invalid phone number format')
      } else {
        // Check for duplicates - DISABLED FOR TESTING
        // In production, you may want to re-enable this check
        if (phoneSet.has(normalizedPhone)) {
          // Still track duplicates for statistics, but don't mark as error
          duplicates++
          // TESTING MODE: Allow duplicates to pass validation
          // errors.push('Duplicate phone number')
        } else {
          // Only add to set if it's not a duplicate (for accurate counting)
          phoneSet.add(normalizedPhone)
        }
        
        // If valid, add to valid array (including duplicates for testing)
        if (errors.length === 0) {
          valid.push({
            name,
            business_name,
            phone: normalizedPhone,
            phone_original: phone
          })
          return // Skip adding to invalid array
        }
      }
    }
    
    // Add to invalid if any errors
    if (errors.length > 0) {
      invalid.push({
        row: rowNumber,
        data: { name, business_name, phone },
        errors
      })
    }
  })
  
  return {
    valid,
    invalid,
    summary: {
      totalRows: data.length,
      validRows: valid.length,
      invalidRows: invalid.length,
      duplicates
    }
  }
}

async function POST(request: NextRequest) {
  try {
    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('csv') as File
    
    if (!file) {
      return NextResponse.json(
        { error: 'No CSV file provided' },
        { status: 400 }
      )
    }
    
    // Validate file type
    if (!file.type.includes('csv') && !file.name.endsWith('.csv')) {
      return NextResponse.json(
        { error: 'File must be a CSV (.csv extension)' },
        { status: 400 }
      )
    }
    
    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 }
      )
    }
    
    // Parse CSV
    const csvText = await file.text()
    
    // Try to detect delimiter (comma, tab, or semicolon)
    let delimiter = ','
    const firstLine = csvText.split('\n')[0]
    if (firstLine.includes('\t')) {
      delimiter = '\t'
    } else if (firstLine.includes(';') && !firstLine.includes(',')) {
      delimiter = ';'
    }
    
    const parseResult = Papa.parse(csvText, {
      header: true,
      delimiter: delimiter,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim()
    })
    
    if (parseResult.errors.length > 0) {
      return NextResponse.json(
        { error: 'Invalid CSV format: ' + parseResult.errors[0].message },
        { status: 400 }
      )
    }
    
    // Validate headers
    const missingHeaders = validateHeaders(parseResult.meta.fields || [])
    if (missingHeaders.length > 0) {
      return NextResponse.json(
        { 
          error: 'Missing required headers: ' + missingHeaders.join(', '),
          details: 'Required headers are: name, business_name, phone (case-insensitive)'
        },
        { status: 400 }
      )
    }
    
    // Validate and process data
    const validation = validateCSVData(parseResult.data as CSVRow[])
    
    if (validation.valid.length === 0) {
      return NextResponse.json(
        { 
          error: 'No valid contacts found in CSV',
          validation 
        },
        { status: 400 }
      )
    }
    
    // Generate session ID for temporary storage
    const nanoid = customAlphabet('1234567890abcdef', 10)
    const sessionId = nanoid()
    
    // Store validation results in temporary session storage
    await sessionStorage.store(sessionId, validation)
    
    return NextResponse.json({
      sessionId,
      validation,
      success: true,
      message: `${validation.valid.length} contacts ready for import`
    })
    
  } catch (error: any) {
    console.error('CSV upload error:', error)
    return NextResponse.json(
      { error: 'Failed to process CSV file' },
      { status: 500 }
    )
  }
}


// Export without auth for internal use
export { POST }