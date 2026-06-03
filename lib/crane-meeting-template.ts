// lib/crane-meeting-template.ts
// Single source of truth for Crane Meeting HTML content.
// Edit here to change any boilerplate — never scatter across screen files or the Edge Function.

export interface MeetingTemplateData {
  project: string
  project_no: string
  meeting_date: string     // YYYY-MM-DD
  meeting_time: string
  review_text: string
  incidents_text: string
  revised_methods: string
  future_lifts: string
  weather_forecast: string
  new_methods: string
  lifting_equipment: string
  any_other_business: string
  next_meeting_date: string | null  // YYYY-MM-DD or null
}

function esc(text: string): string {
  return (text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>')
}

export function buildMeetingHtml(data: MeetingTemplateData): string {
  const meetingDateObj = new Date(data.meeting_date + 'T00:00:00Z')
  const meetingDateStr = meetingDateObj.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  let nextMeetingDateStr = '—'
  if (data.next_meeting_date) {
    const nextDateObj = new Date(data.next_meeting_date + 'T00:00:00Z')
    nextMeetingDateStr = nextDateObj.toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  }

  const timeStr = data.meeting_time ? ` at ${esc(data.meeting_time)}` : ''

  return `<div class="crane-meeting-content">
  <div class="cm-header-row">
    <div class="cm-header-card">
      <div class="cm-header-label">PROJECT</div>
      <div class="cm-header-value">${esc(data.project)}</div>
    </div>
    <div class="cm-header-card">
      <div class="cm-header-label">PHASE / PROJECT No.</div>
      <div class="cm-header-value">${esc(data.project_no)}</div>
    </div>
    <div class="cm-header-card">
      <div class="cm-header-label">DATE &amp; TIME</div>
      <div class="cm-header-value">${esc(meetingDateStr)}${timeStr}</div>
    </div>
  </div>

  <p class="cm-read-prompt">Read and Sign below &#8595;</p>

  <section class="cm-section">
    <h2>REVIEW OF YESTERDAY'S / LAST WEEK'S LIFTING OPERATIONS</h2>
    <div class="freetext">${esc(data.review_text || '—')}</div>
  </section>

  <section class="cm-section">
    <h2>INCIDENTS / PROBLEMS</h2>
    <div class="freetext">${esc(data.incidents_text || '—')}</div>
  </section>

  <section class="cm-section">
    <h2>REVISED METHODS</h2>
    <div class="freetext">${esc(data.revised_methods || '—')}</div>
  </section>

  <section class="cm-section">
    <h2>FUTURE LIFTS</h2>
    <div class="freetext">${esc(data.future_lifts || '—')}</div>
  </section>

  <section class="cm-section">
    <h2>WEATHER FORECAST</h2>
    <div class="freetext">${esc(data.weather_forecast || '—')}</div>
  </section>

  <section class="cm-section">
    <h2>NEW METHODS</h2>
    <div class="freetext">${esc(data.new_methods || '—')}</div>
  </section>

  <section class="cm-section">
    <h2>LIFTING EQUIPMENT AND ACCESSORIES</h2>
    <div class="freetext">${esc(data.lifting_equipment || '—')}</div>
  </section>

  <section class="cm-section">
    <h2>ANY OTHER BUSINESS (Holiday notice, bulletins, and alerts)</h2>
    <div class="freetext">${esc(data.any_other_business || '—')}</div>
  </section>

  <section class="cm-section">
    <h2>DATE OF NEXT MEETING</h2>
    <p class="cm-next-meeting">${nextMeetingDateStr}</p>
  </section>
</div>`
}

// Injected into <head> on web
export const CRANE_MEETING_CONTENT_STYLES = `
  .crane-meeting-content { font-family: system-ui, -apple-system, sans-serif; font-size: 14px; line-height: 1.6; color: #1a1a1a; padding: 16px; max-width: 100%; overflow-wrap: break-word; }
  .cm-header-row { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
  .cm-header-card { flex: 1; min-width: 120px; background: #F0F7FF; border-left: 3px solid #0F2544; border-radius: 6px; padding: 10px 12px; }
  .cm-header-label { font-size: 10px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .cm-header-value { font-size: 14px; font-weight: 700; color: #0F2544; }
  .cm-read-prompt { text-align: center; font-size: 13px; font-weight: 600; color: #64748B; background: #F8FAFC; border-radius: 6px; padding: 8px; margin-bottom: 16px; border: 1px dashed #CBD5E1; }
  .cm-section { margin-bottom: 4px; }
  .crane-meeting-content h2 { font-size: 13px; font-weight: 700; margin: 20px 0 8px 0; color: #0F2544; border-bottom: 2px solid #E2E8F0; padding-bottom: 4px; text-transform: uppercase; }
  .crane-meeting-content p { margin: 0 0 8px 0; }
  .crane-meeting-content .freetext { background: #F8FAFC; border-left: 3px solid #0F2544; padding: 10px 12px; margin-bottom: 12px; white-space: pre-wrap; border-radius: 0 4px 4px 0; min-height: 24px; color: #334155; }
  .cm-next-meeting { font-size: 15px; font-weight: 700; color: #0F2544; padding: 8px 0; }
`

// Inline CSS for native WebView
export const CRANE_MEETING_NATIVE_STYLES = `
  body { margin: 0; padding: 8px; font-family: -apple-system, sans-serif; font-size: 13px; line-height: 1.6; color: #1a1a1a; }
  .cm-header-row { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
  .cm-header-card { flex: 1; min-width: 100px; background: #F0F7FF; border-left: 3px solid #0F2544; border-radius: 6px; padding: 8px 10px; }
  .cm-header-label { font-size: 9px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
  .cm-header-value { font-size: 13px; font-weight: 700; color: #0F2544; }
  .cm-read-prompt { text-align: center; font-size: 12px; font-weight: 600; color: #64748B; background: #F8FAFC; border-radius: 6px; padding: 7px; margin-bottom: 14px; border: 1px dashed #CBD5E1; }
  .cm-section { margin-bottom: 3px; }
  h2 { font-size: 12px; font-weight: 700; margin: 16px 0 6px 0; color: #0F2544; border-bottom: 2px solid #E2E8F0; padding-bottom: 3px; text-transform: uppercase; }
  p { margin: 0 0 8px; }
  .freetext { background: #F8FAFC; border-left: 3px solid #0F2544; padding: 8px 10px; margin-bottom: 10px; white-space: pre-wrap; border-radius: 0 4px 4px 0; min-height: 20px; color: #334155; }
  .cm-next-meeting { font-size: 14px; font-weight: 700; color: #0F2544; padding: 6px 0; }
`
