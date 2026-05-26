// lib/daily-briefing-template.ts
// Single source of truth for Daily Briefing HTML content.
// Edit this file to change static boilerplate — never scatter it across screens.

export interface BriefingTemplateData {
  briefing_date: string        // YYYY-MM-DD
  wind_speed: string
  gust_speed: string
  weather_condition: string
  first_aider_name: string
  site_location: string
  muster_point: string
  changes_on_site: string
  any_other_business: string
  lifting_schedule: string
  q1_crane_clear: boolean
  q2_activities_planned: boolean
  q3_deliveries_scheduled: boolean
  q4_changes_communicated: boolean
  q5_accessory_checks: boolean
  q6_safety_first: boolean
  q7_crane_secured: boolean
  q8_whistles_working: boolean
  q9_radio_check: boolean
  ap_name: string
  supervisor_name: string
}

const YES_NO_QUESTIONS: string[] = [
  'Is everyone clear on which crane they are responsible for?',
  'Are all activities planned?',
  'Are all expected deliveries scheduled?',
  'Have you communicated any site / environmental changes?',
  'Have you reminded everyone to carry out the daily pre-use accessory checks?',
  "Is everyone clear on 'Safety First', if unsure stop the lifting operation and re-assess?",
  'Is tower crane secured each floor for unauthorised personnel to access the crane?',
  'Do all Slinger/Crane Supervisor have handheld Whistles and checked they are working?',
  'Has a radio check been completed for all lifting operatives?',
]

function esc(text: string): string {
  return (text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>')
}

function yesNo(val: boolean): string {
  return val
    ? '<span class="yn-yes">YES &#10003;</span>'
    : '<span class="yn-no">NO &#10007;</span>'
}

const WIND_SPEED_TABLE = `
<table>
  <thead><tr><th>Load Type</th><th>Max Wind Speed</th></tr></thead>
  <tbody>
    <tr><td>Concrete Skip</td><td>55 km/h</td></tr>
    <tr><td>Re-bar lorry</td><td>55 km/h</td></tr>
    <tr><td>Column Shutters</td><td>35.4 km/h</td></tr>
    <tr><td>Open Stillage</td><td>31 mph / 51 km/h</td></tr>
    <tr><td>Plywood</td><td>27 mph</td></tr>
    <tr><td>Boat Skip</td><td>55 km/h</td></tr>
    <tr><td>Toolbox</td><td>55 km/h</td></tr>
    <tr><td>MEWP</td><td>29 mph</td></tr>
    <tr><td>Formwork Primary Beams</td><td>55 km/h</td></tr>
    <tr><td>Water Bouser</td><td>51.4 km/h</td></tr>
  </tbody>
</table>`

const LIFTING_PROTOCOLS_LIST = `
<ul>
  <li>All lifting as per Subcontractor Lift Plan</li>
  <li><strong>DO NOT LIFT</strong> loads not included in today's schedule without authorisation</li>
  <li>DAILY SMIE AND ZONING CHECKS must be completed before any lifting commences</li>
  <li><strong>NO MOBILE PHONES</strong> while operating or signalling</li>
  <li>CHECKSHEETS MUST BE COMPLETED CORRECTLY and returned to the Appointed Person</li>
  <li>RESPECT THE WELFARE FACILITIES &mdash; keep areas clean and tidy</li>
  <li>Confirm Whistles are working before commencing operations</li>
  <li>CONSTANT CLEAR COMMUNICATION during all blind lifts &mdash; use radio at all times</li>
  <li>ENSURE DAILY ZONING AND ANTI-COLLISION CHECKS are completed on all cranes before operation</li>
</ul>`

const LIFTING_CALCULATION_TEXT = `
<p><strong>EXAMPLE HOW TO CALCULATE HOW MUCH TWO/THREE SLINGS CAN LIFT TOGETHER:</strong></p>
<p>2 &times; 4te SWL webbing slings are choked around the load so following reduction has been made: 4te sling &minus;20% for choke:</p>
<p>= 3.2te &times; 1.4 mode factor for 2-point lift @&lt;90&deg; = <strong>4.48te SWL</strong><br>
   = 3.2te &times; 2.1 mode factor for 3- or 4-point lift @&lt;90&deg; = <strong>6.72te SWL</strong></p>`

const DEFECTS_AND_INCIDENTS_TEXT = `
<p>The appointed person should ensure that there is an effective procedure for reporting defects and incidents. This procedure should include notification to the appointed person, recording of action taken to rectify any defects, and clearance of the crane for further service. This procedure should include the immediate notification of the following:</p>
<ol type="a">
  <li>Any defects found during daily and weekly checks.</li>
  <li>Defects found at any other time.</li>
  <li>Incidents, accidents or near misses however slight.</li>
  <li>Shock loads, however they occur.</li>
  <li>Dangerous occurrence and reportable accidents.</li>
  <li>Report any radio communication issues to the principal contractor.</li>
</ol>`

export function buildBriefingHtml(data: BriefingTemplateData): string {
  const date = new Date(data.briefing_date + 'T00:00:00Z')
  const dateStr = date.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const answers = [
    data.q1_crane_clear,
    data.q2_activities_planned,
    data.q3_deliveries_scheduled,
    data.q4_changes_communicated,
    data.q5_accessory_checks,
    data.q6_safety_first,
    data.q7_crane_secured,
    data.q8_whistles_working,
    data.q9_radio_check,
  ]

  const questionsHtml = YES_NO_QUESTIONS.map((q, i) => `
    <tr>
      <td>${esc(q)}</td>
      <td style="text-align:center;width:80px;white-space:nowrap">${yesNo(answers[i])}</td>
    </tr>`).join('')

  return `<div class="daily-briefing-content">
  <h1>Daily Team Briefing: Lifting Operations</h1>
  <p style="color:#64748B;font-size:13px;margin-top:-4px;margin-bottom:16px">${esc(dateStr)}</p>

  <h2>Risk Statement</h2>
  <p class="risk-statement">Please consider the complexity of lifting activity throughout the day inclusive of the weather forecast, amount of planned and unplanned lifts, labour requirements and any new starters today. If this risk rating is high, then review the operations planned for the day with the site management team.</p>

  <h2>Part 1 &mdash; Forecast</h2>
  <table>
    <tbody>
      <tr><td><strong>Wind Speed</strong></td><td>${esc(data.wind_speed)}</td></tr>
      <tr><td><strong>Gust Speed</strong></td><td>${esc(data.gust_speed)}</td></tr>
      <tr><td><strong>Weather Conditions and Temperature</strong></td><td>${esc(data.weather_condition)}</td></tr>
    </tbody>
  </table>

  <h2>Part 2 &mdash; Site Details</h2>
  <table>
    <tbody>
      <tr><td><strong>First Aider Name</strong></td><td>${esc(data.first_aider_name)}</td></tr>
      <tr><td><strong>Location</strong></td><td>${esc(data.site_location)}</td></tr>
      <tr><td><strong>Muster Point Location</strong></td><td>${esc(data.muster_point)}</td></tr>
    </tbody>
  </table>

  <h2>Changes</h2>
  <p class="section-subtitle">To site layout, to lifting team, new restrictions, new amended lifting risk assessments, etc.</p>
  <div class="freetext">${esc(data.changes_on_site)}</div>

  <h2>Wind Speed Limits by Load Type</h2>
  ${WIND_SPEED_TABLE}

  <h2>Lifting Protocols</h2>
  ${LIFTING_PROTOCOLS_LIST}

  <h3>Lifting Calculation Example</h3>
  ${LIFTING_CALCULATION_TEXT}

  <h2>Any Other Business</h2>
  <div class="freetext">${esc(data.any_other_business || '&mdash;')}</div>

  <h2>Lifting Schedule</h2>
  <p class="section-subtitle">Details of planned lifts for the day, includes unusual deliveries &amp; lifts.</p>
  <div class="freetext">${esc(data.lifting_schedule)}</div>

  <h2>Reporting of Defects and Incidents</h2>
  ${DEFECTS_AND_INCIDENTS_TEXT}

  <h2>Have You Covered the Following?</h2>
  <table>
    <tbody>
      ${questionsHtml}
    </tbody>
  </table>

  <h2>Appointed Person Resident / Lifting Supervisor</h2>
  <table>
    <thead>
      <tr><th>Date</th><th>Name</th><th>Role</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>${esc(dateStr)}</td>
        <td>${esc(data.ap_name)}</td>
        <td>Appointed Person Resident</td>
      </tr>
      <tr>
        <td>${esc(dateStr)}</td>
        <td>${esc(data.supervisor_name)}</td>
        <td>Lifting Supervisor</td>
      </tr>
    </tbody>
  </table>
</div>`
}

// Injected into <head> on web — gives the briefing document a clean, professional appearance
export const DAILY_BRIEFING_CONTENT_STYLES = `
  .daily-briefing-content { font-family: system-ui, -apple-system, sans-serif; font-size: 14px; line-height: 1.6; color: #1a1a1a; padding: 16px; max-width: 100%; overflow-wrap: break-word; }
  .daily-briefing-content h1 { font-size: 20px; font-weight: 700; margin: 0 0 4px 0; color: #0F2544; }
  .daily-briefing-content h2 { font-size: 15px; font-weight: 700; margin: 20px 0 8px 0; color: #0F2544; border-bottom: 2px solid #E2E8F0; padding-bottom: 4px; }
  .daily-briefing-content h3 { font-size: 14px; font-weight: 600; margin: 16px 0 6px 0; color: #1a1a1a; }
  .daily-briefing-content p { margin: 0 0 8px 0; }
  .daily-briefing-content ol, .daily-briefing-content ul { margin: 0 0 8px 0; padding-left: 24px; }
  .daily-briefing-content li { margin-bottom: 4px; line-height: 1.5; }
  .daily-briefing-content strong { font-weight: 700; }
  .daily-briefing-content table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  .daily-briefing-content td, .daily-briefing-content th { border: 1px solid #ccc; padding: 6px 10px; font-size: 13px; vertical-align: top; }
  .daily-briefing-content th { background: #f0f0f0; font-weight: 600; }
  .daily-briefing-content .freetext { background: #F8FAFC; border-left: 3px solid #E8930A; padding: 10px 12px; margin-bottom: 12px; white-space: pre-wrap; border-radius: 0 4px 4px 0; min-height: 24px; }
  .daily-briefing-content .risk-statement { background: #FFF7ED; border: 1px solid #FBB85C; padding: 10px 12px; border-radius: 6px; color: #92400E; margin-bottom: 12px; }
  .daily-briefing-content .section-subtitle { font-style: italic; color: #64748B; font-size: 13px; margin-top: -4px; }
  .daily-briefing-content .yn-yes { color: #16A34A; font-weight: 700; }
  .daily-briefing-content .yn-no { color: #DC2626; font-weight: 700; }
`

// Inline CSS for native WebView (no class injection needed)
export const DAILY_BRIEFING_NATIVE_STYLES = `
  body { margin: 0; padding: 0; font-family: -apple-system, sans-serif; font-size: 14px; line-height: 1.6; color: #1a1a1a; }
  h1 { font-size: 18px; font-weight: 700; color: #0F2544; margin: 8px 0 4px; }
  h2 { font-size: 14px; font-weight: 700; color: #0F2544; margin: 16px 0 6px; border-bottom: 2px solid #E2E8F0; padding-bottom: 3px; }
  h3 { font-size: 13px; font-weight: 600; margin: 12px 0 4px; }
  p { margin: 0 0 8px; }
  ol, ul { padding-left: 22px; margin: 0 0 8px; }
  li { margin-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  td, th { border: 1px solid #ccc; padding: 5px 8px; font-size: 12px; vertical-align: top; }
  th { background: #f0f0f0; font-weight: 600; }
  strong { font-weight: 700; }
  .freetext { background: #F8FAFC; border-left: 3px solid #E8930A; padding: 8px 10px; margin-bottom: 10px; white-space: pre-wrap; border-radius: 0 4px 4px 0; min-height: 20px; }
  .risk-statement { background: #FFF7ED; border: 1px solid #FBB85C; padding: 8px 10px; border-radius: 6px; color: #92400E; margin-bottom: 10px; }
  .section-subtitle { font-style: italic; color: #64748B; font-size: 12px; margin-top: -4px; }
  .yn-yes { color: #16A34A; font-weight: 700; }
  .yn-no { color: #DC2626; font-weight: 700; }
`
