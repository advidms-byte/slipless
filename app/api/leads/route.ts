import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message, leads: [] }, { status: 500 })
    }

    return NextResponse.json({ leads: data || [] })
  } catch (err) {
    return NextResponse.json({ error: 'Server error', leads: [] }, { status: 500 })
  }
}
