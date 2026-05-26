'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';

const STATUS_LABELS = {
  new: 'New',
  calling: 'Calling now',
  hot: 'Booked',
  send_link: 'Link sent',
  retry_pending: 'Retry queued',
  no_answer: 'No answer',
  not_interested: 'Not interested',
  wrong_number: 'Wrong number',
  bad_number: 'Bad number',
  call_failed: 'Call failed',
  dead: 'Closed',
  dnc: 'DNC',
};

const STATUS_COLOR = {
  hot: 'green',
  send_link: 'green',
  calling: 'amber',
  retry_pending: 'amber',
  new: 'blue',
  no_answer: 'grey',
  not_interested: 'grey',
  wrong_number: 'grey',
  bad_number: 'grey',
  call_failed: 'grey',
  dead: 'grey',
  dnc: 'grey',
};

const FILTERS = [
  { key: 'all', label: 'All leads' },
  { key: 'active', label: 'Active', match: (s) => ['new', 'calling', 'retry_pending'].includes(s) },
  { key: 'won', label: 'Won', match: (s) => ['hot', 'send_link'].includes(s) },
  { key: 'lost', label: 'Lost', match: (s) => ['not_interested', 'wrong_number', 'bad_number', 'dead', 'dnc'].includes(s) },
];

function timeAgo(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return Math.floor(ms / 60_000) + 'm ago';
  if (ms < 86_400_000) return Math.floor(ms / 3_600_000) + 'h ago';
  return Math.floor(ms / 86_400_000) + 'd ago';
}

function formatPurpose(p) {
  if (!p) return '—';
  return p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function Dashboard() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchLeads = useCallback(async () => {
    const res = await fetch('/api/leads', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setLeads(data.leads || []);
      setLastUpdated(new Date());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLeads();
    const t = setInterval(fetchLeads, 8000); // auto-refresh every 8s
    return () => clearInterval(t);
  }, [fetchLeads]);

  const filtered = useMemo(() => {
    let arr = leads;
    const f = FILTERS.find(x => x.key === filter);
    if (f && f.match) arr = arr.filter(l => f.match(l.status));
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(l =>
        l.name?.toLowerCase().includes(q) ||
        l.phone?.includes(q) ||
        l.email?.toLowerCase().includes(q)
      );
    }
    return arr;
  }, [leads, filter, search]);

  const stats = useMemo(() => {
    const total = leads.length;
    const active = leads.filter(l => ['new','calling','retry_pending'].includes(l.status)).length;
    const won = leads.filter(l => ['hot','send_link'].includes(l.status)).length;
    const calling = leads.filter(l => l.status === 'calling').length;
    const conv = total > 0 ? Math.round((won / total) * 100) : 0;
    return { total, active, won, calling, conv };
  }, [leads]);

  const counts = useMemo(() => {
    const c = {};
    for (const f of FILTERS) {
      if (!f.match) { c[f.key] = leads.length; continue; }
      c[f.key] = leads.filter(l => f.match(l.status)).length;
    }
    return c;
  }, [leads]);

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' });
    window.location.reload();
  }

  async function updateLeadStatus(id, status) {
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchLeads();
    if (selected?.id === id) setSelected({ ...selected, status });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="side-brand">SLAN<span>.</span></div>
        <div className="side-sub">Lead Console</div>

        <div className="side-section">Pipeline</div>
        {FILTERS.map(f => (
          <button
            key={f.key}
            className={'side-nav-item ' + (filter === f.key ? 'active' : '')}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            <span className="count">{counts[f.key] ?? 0}</span>
          </button>
        ))}

        <div className="side-section">Live</div>
        <div style={{ fontSize: 12, color: 'var(--muted-light)', padding: '4px 10px' }}>
          {stats.calling > 0
            ? <><span style={{ color: 'var(--gold-bright)' }}>●</span> {stats.calling} call{stats.calling === 1 ? '' : 's'} in progress</>
            : 'No active calls'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted-light)', padding: '8px 10px' }}>
          Last refresh: {lastUpdated ? timeAgo(lastUpdated.toISOString()) : '—'}
        </div>

        <div className="side-footer">
          Powered by Autifo
          <br />
          <button onClick={logout}>Sign out</button>
        </div>
      </aside>

      <main className="main">
        <div className="main-header">
          <div>
            <div className="main-eyebrow">SLAN Finance · Live pipeline</div>
            <h1 className="main-title">Lead intelligence console</h1>
          </div>
          <div className="main-actions">
            <button className="btn secondary" onClick={fetchLeads}>↻ Refresh</button>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat-cell">
            <div className="lbl">Total leads</div>
            <div className="val">{stats.total}</div>
          </div>
          <div className="stat-cell">
            <div className="lbl">In progress</div>
            <div className="val amber">{stats.active}</div>
          </div>
          <div className="stat-cell">
            <div className="lbl">Won</div>
            <div className="val green">{stats.won}</div>
          </div>
        </div>

        <div className="table-wrap">
          <div className="table-controls">
            {FILTERS.map(f => (
              <button
                key={f.key}
                className={'filter-chip ' + (filter === f.key ? 'active' : '')}
                onClick={() => setFilter(f.key)}
              >
                {f.label} <span style={{ opacity: 0.6, marginLeft: 4 }}>{counts[f.key] ?? 0}</span>
              </button>
            ))}
            <input
              type="text"
              className="search-input"
              placeholder="Search name, phone, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="empty-state">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="title">No leads yet</div>
              <div>When someone submits the SLAN form, they'll appear here in real time.</div>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Looking for</th>
                  <th>Status</th>
                  <th>Last call</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => (
                  <tr
                    key={l.id}
                    className={'row ' + (selected?.id === l.id ? 'selected' : '')}
                    onClick={() => setSelected(l)}
                  >
                    <td>
                      <div className="name">{l.name}</div>
                      <div className="meta">{l.phone} · {l.email}</div>
                    </td>
                    <td>
                      <div>{formatPurpose(l.loan_purpose)}</div>
                      <div className="meta">{formatPurpose(l.timeline)}</div>
                    </td>
                    <td>
                      <span className={'status-pill ' + (STATUS_COLOR[l.status] || 'grey')}>
                        {STATUS_LABELS[l.status] || l.status}
                      </span>
                      {l.attempt_count > 0 && (
                        <div className="meta">Attempt {l.attempt_count}/3</div>
                      )}
                    </td>
                    <td className="time">
                      {l.latest_call?.call_outcome
                        ? formatPurpose(l.latest_call.call_outcome)
                        : l.latest_call?.disconnection_reason
                          ? l.latest_call.disconnection_reason.replace(/_/g, ' ')
                          : '—'}
                      <div className="meta">{l.latest_call?.started_at ? timeAgo(l.latest_call.started_at) : ''}</div>
                    </td>
                    <td className="time">{timeAgo(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {selected && (
        <LeadDrawer
          lead={selected}
          onClose={() => setSelected(null)}
          onStatusChange={updateLeadStatus}
        />
      )}
    </div>
  );
}

function LeadDrawer({ lead, onClose, onStatusChange }) {
  const c = lead.latest_call || {};
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-header">
          <button className="drawer-close" onClick={onClose}>×</button>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', marginBottom: 6 }}>
            Lead #{lead.id}
          </div>
          <div className="drawer-title">{lead.name}</div>
          <div>
            <span className={'status-pill ' + (STATUS_COLOR[lead.status] || 'grey')}>
              {STATUS_LABELS[lead.status] || lead.status}
            </span>
          </div>
          <div className="drawer-contact">
            <a href={`tel:${lead.phone}`}>📞 {lead.phone}</a>
            <a href={`mailto:${lead.email}`}>✉ {lead.email}</a>
            <a href={`sms:${lead.phone}`}>💬 Text</a>
          </div>
        </div>

        <div className="drawer-body">
          <div className="drawer-section">
            <div className="drawer-section-title">Enquiry</div>
            <dl className="kv-grid">
              <dt>Looking for</dt><dd>{formatPurpose(lead.loan_purpose)}</dd>
              <dt>Timeline</dt><dd>{formatPurpose(lead.timeline)}</dd>
              <dt>Source</dt><dd>{lead.source || '—'}</dd>
              <dt>Submitted</dt><dd>{new Date(lead.created_at).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })}</dd>
            </dl>
          </div>

          {c.call_id && (
            <>
              <div className="drawer-section">
                <div className="drawer-section-title">Latest AI call</div>
                <dl className="kv-grid">
                  <dt>Outcome</dt><dd>{formatPurpose(c.call_outcome) || formatPurpose(c.disconnection_reason) || 'Pending'}</dd>
                  <dt>Qualified</dt><dd>{c.is_qualified === true ? 'Yes' : c.is_qualified === false ? 'No' : '—'}</dd>
                  <dt>Loan amount</dt><dd>{c.loan_amount_estimate || '—'}</dd>
                  <dt>Confirmed purpose</dt><dd>{c.loan_purpose_confirmed || '—'}</dd>
                  <dt>Callback time</dt><dd>{c.preferred_callback_time || '—'}</dd>
                  <dt>Duration</dt><dd>{c.duration_ms ? Math.round(c.duration_ms / 1000) + 's' : '—'}</dd>
                </dl>
              </div>

              {c.call_summary && (
                <div className="drawer-section">
                  <div className="drawer-section-title">AI Summary</div>
                  <div className="summary-box">{c.call_summary}</div>
                </div>
              )}

              {c.transcript && (
                <div className="drawer-section">
                  <div className="drawer-section-title">Transcript</div>
                  <div className="transcript">{c.transcript}</div>
                </div>
              )}

              {c.recording_url && (
                <div className="drawer-section">
                  <a className="recording-link" href={c.recording_url} target="_blank" rel="noreferrer">
                    🎧 Listen to recording
                  </a>
                </div>
              )}
            </>
          )}

          <div className="drawer-section">
            <div className="drawer-section-title">Actions</div>
            <div className="action-row">
              <button className="btn" onClick={() => onStatusChange(lead.id, 'hot')}>Mark booked</button>
              <button className="btn secondary" onClick={() => onStatusChange(lead.id, 'not_interested')}>Not interested</button>
              <button className="btn secondary" onClick={() => onStatusChange(lead.id, 'dnc')}>DNC</button>
              <button className="btn secondary" onClick={() => onStatusChange(lead.id, 'new')}>Reset</button>
            </div>
          </div>

          {lead.notes && (
            <div className="drawer-section">
              <div className="drawer-section-title">Notes</div>
              <div className="summary-box" style={{ borderLeftColor: 'var(--red)' }}>{lead.notes}</div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
