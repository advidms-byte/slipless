'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '../../lib/supabase'
import { LeadWithMessages } from '../../lib/database.types'

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  booked:        { label: 'Booked',      color: '#166534', bg: '#dcfce7' },
  'in-progress': { label: 'In progress', color: '#92400e', bg: '#fef3c7' },
  lead:          { label: 'Lead',        color: '#1e40af', bg: '#dbeafe' },
  lost:          { label: 'No response', color: '#6b7280', bg: '#f3f4f6' },
  new:           { label: 'New',         color: '#6b21a8', bg: '#f3e8ff' },
}

export default function Dashboard() {
  const supabase = useMemo(() => createClient(), [])
  const [leads, setLeads] = useState<LeadWithMessages[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [userInitials, setUserInitials] = useState('??')
  const [businessName, setBusinessName] = useState('RingBack')
  const [error, setError] = useState<string | null>(null)

  const fetchLeads = useCallback(async () => {
    try {
      setError(null)
      const url = filter === 'all' ? '/api/leads' : `/api/leads?status=${encodeURIComponent(filter)}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed to load leads (${res.status})`)
      const data = await res.json()
      const nextLeads: LeadWithMessages[] = data.leads || []
      setLeads(nextLeads)
      setSelectedId(current => {
        if (current && nextLeads.some(lead => lead.id === current)) return current
        return nextLeads[0]?.id || null
      })
    } catch (err) {
      console.error('[dashboard] fetchLeads failed', err)
      setError(err instanceof Error ? err.message : 'Failed to load leads')
      setLeads([])
      setSelectedId(null)
    }
  }, [filter])

  useEffect(() => {
    async function init() {
      setLoading(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.email) setUserInitials(user.email.slice(0, 2).toUpperCase())

        if (user?.id) {
          const { data: biz, error: bizError } = await supabase
            .from('businesses')
            .select('name')
            .eq('owner_id', user.id)
            .maybeSingle()
          if (bizError) throw bizError
          if (biz?.name) setBusinessName(biz.name)
        }

        await fetchLeads()
      } catch (err) {
        console.error('[dashboard] init failed', err)
        setError(err instanceof Error ? err.message : 'Failed to initialise dashboard')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [fetchLeads, supabase])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  // Real-time: subscribe to new messages and lead updates
  useEffect(() => {
    const channel = supabase
      .channel('leads-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => fetchLeads())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => fetchLeads())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchLeads, supabase])

  async function handleSignOut() {
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) {
      setError(signOutError.message)
      return
    }
    window.location.href = '/login'
  }

  function handleCallBack(phone: string) {
    window.location.href = `tel:${phone}`
  }

  const stats = {
    total: leads.length,
    conversations: leads.filter(l => (l.messages || []).length > 0).length,
    booked: leads.filter(l => l.status === 'booked').length,
    rate: leads.length > 0 ? Math.round((leads.filter(l => l.status === 'booked').length / leads.length) * 100) : 0,
  }

  const filtered = filter === 'all' ? leads : leads.filter(l => l.status === filter)
  const selected = selectedId ? leads.find(lead => lead.id === selectedId) || null : null

  return (
    <div style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", background: '#fafaf8', color: '#111', height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .mono { font-family: 'DM Mono', monospace; }
        .lead-row { cursor: pointer; padding: 14px 18px; border-bottom: 1px solid #f0f0ed; transition: background 0.12s; display: flex; align-items: flex-start; gap: 10px; }
        .lead-row:hover { background: #f5f5f2; }
        .lead-row.active { background: #f0f0ed; }
        .filter-btn { background: none; border: 1px solid #e0e0dc; padding: 5px 11px; font-family: inherit; font-size: 12px; cursor: pointer; border-radius: 4px; color: #666; transition: all 0.12s; white-space: nowrap; }
        .filter-btn.active { background: #111; color: #fafaf8; border-color: #111; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #ddd; border-radius: 2px; }
        .empty-state { display: flex; align-items: center; justify-content: center; flex: 1; color: #bbb; font-size: 14px; }
      `}</style>

      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e8e8e4', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 54, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <span style={{ fontSize: 15, fontWeight: 500, letterSpacing: '-0.02em' }}>{businessName}</span>
          <nav style={{ display: 'flex', gap: 20 }}>
            {['Leads', 'Settings'].map(n => (
              <a key={n} href={n === 'Settings' ? '/settings' : '#'} style={{ fontSize: 14, color: n === 'Leads' ? '#111' : '#999', textDecoration: 'none', fontWeight: n === 'Leads' ? 500 : 400 }}>{n}</a>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
            <span style={{ fontSize: 12, color: '#888' }}>AI active</span>
          </div>
          <button onClick={handleSignOut} style={{ fontSize: 12, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>Sign out</button>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#111', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500 }}>{userInitials}</div>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left panel */}
        <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid #e8e8e4', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Stats */}
          <div style={{ padding: '16px', borderBottom: '1px solid #e8e8e4', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Missed calls', value: String(stats.total) },
              { label: 'Conversations', value: String(stats.conversations) },
              { label: 'Booked', value: String(stats.booked) },
              { label: 'Booking rate', value: `${stats.rate}%` },
            ].map(s => (
              <div key={s.label} style={{ background: '#f5f5f2', borderRadius: 6, padding: '12px 14px' }}>
                <p className="mono" style={{ fontSize: 20, fontWeight: 400, letterSpacing: '-0.03em', marginBottom: 3 }}>{s.value}</p>
                <p style={{ fontSize: 11, color: '#888' }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #e8e8e4', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['all', 'booked', 'in-progress', 'lead', 'lost'].map(f => (
              <button key={f} className={`filter-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : statusConfig[f]?.label}
              </button>
            ))}
          </div>

          {/* Lead list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {error && <div className="empty-state" style={{ color: '#b91c1c', padding: 16, textAlign: 'center' }}>{error}</div>}
            {loading && !error && <div className="empty-state">Loading…</div>}
            {!loading && !error && filtered.length === 0 && <div className="empty-state">No leads yet</div>}
            {filtered.map(lead => {
              const sc = statusConfig[lead.status] || statusConfig.new
              const initials = (lead.caller_name || lead.caller_phone).slice(0, 2).toUpperCase()
              const timeAgo = new Date(lead.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              return (
                <div key={lead.id} className={`lead-row ${selectedId === lead.id ? 'active' : ''}`} onClick={() => setSelectedId(lead.id)}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#e8e8e4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500, flexShrink: 0, color: '#555' }}>{initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.caller_name || lead.caller_phone}</span>
                      <span style={{ fontSize: 11, color: '#bbb', flexShrink: 0, marginLeft: 6 }}>{timeAgo}</span>
                    </div>
                    <p style={{ fontSize: 12, color: '#888', marginBottom: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.service_requested || 'Incoming call'}</p>
                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: sc.bg, color: sc.color, fontWeight: 500 }}>{sc.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: conversation detail */}
        {!selected ? (
          <div className="empty-state" style={{ flex: 1 }}>Select a lead to view the conversation</div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Conv header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e8e8e4', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', flexShrink: 0 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 500, letterSpacing: '-0.02em', marginBottom: 3 }}>{selected.caller_name || selected.caller_phone}</h2>
                <p className="mono" style={{ fontSize: 12, color: '#aaa' }}>{selected.caller_phone}{selected.service_requested ? ` · ${selected.service_requested}` : ''}</p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: (statusConfig[selected.status] || statusConfig.new).bg, color: (statusConfig[selected.status] || statusConfig.new).color, fontWeight: 500 }}>
                  {(statusConfig[selected.status] || statusConfig.new).label}
                </span>
                {/* FIX: call back button actually dials */}
                <button onClick={() => handleCallBack(selected.caller_phone)} style={{ background: '#111', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 500 }}>
                  Call back ↗
                </button>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p className="mono" style={{ fontSize: 11, color: '#ccc', textAlign: 'center', marginBottom: 6 }}>
                SMS · {new Date(selected.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
              {(selected.messages || []).length === 0 && (
                <p style={{ textAlign: 'center', color: '#bbb', fontSize: 13 }}>No messages yet</p>
              )}
              {(selected.messages || []).map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.direction === 'inbound' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '72%', background: m.direction === 'inbound' ? '#111' : '#fff', color: m.direction === 'inbound' ? '#fff' : '#111', border: m.direction === 'outbound' ? '1px solid #e8e8e4' : 'none', padding: '10px 14px', borderRadius: m.direction === 'inbound' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', fontSize: 14, lineHeight: 1.55 }}>
                    {m.direction === 'outbound' && <p className="mono" style={{ fontSize: 10, color: '#bbb', marginBottom: 5 }}>AI AGENT</p>}
                    {m.body}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer bar */}
            <div style={{ borderTop: '1px solid #e8e8e4', padding: '14px 24px', background: '#fff', display: 'flex', gap: 28, flexShrink: 0 }}>
              <div><p style={{ fontSize: 10, color: '#bbb', marginBottom: 3 }}>MESSAGES</p><p className="mono" style={{ fontSize: 14 }}>{selected.messages?.length || 0}</p></div>
              <div><p style={{ fontSize: 10, color: '#bbb', marginBottom: 3 }}>STATUS</p><p style={{ fontSize: 13, color: (statusConfig[selected.status] || statusConfig.new).color, fontWeight: 500 }}>{(statusConfig[selected.status] || statusConfig.new).label}</p></div>
              <div><p style={{ fontSize: 10, color: '#bbb', marginBottom: 3 }}>PHONE</p><p className="mono" style={{ fontSize: 13 }}>{selected.caller_phone}</p></div>
              {selected.appointment_at && <div><p style={{ fontSize: 10, color: '#bbb', marginBottom: 3 }}>APPOINTMENT</p><p style={{ fontSize: 13 }}>{new Date(selected.appointment_at).toLocaleString()}</p></div>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
