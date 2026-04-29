import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase'

export async function GET(req: NextRequest) {
  const supabase = createAdminClient()
  const status = req.nextUrl.searchParams.get('status')

  let query = supabase
    .from('leads')
    .select(`
      *,
      messages (*)
    `)
    .order('created_at', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json(
      { error: error.message, leads: [] },
      { status: 500 }
    )
  }

  return NextResponse.json({
    leads: data || [],
  })
}
