const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DEFAULTS = {
  constraint_start: '07:00',
  constraint_end: '21:00',
  pref_earliest: '07:00',
  pref_latest: '21:00',
  preferred_days: [],
  avoid_early: false,
  avoid_night: false,
  minimize_school_days: false,
  pref_gap: 'Compact',
  max_consecutive: 12,
}

const toMinutes = (value) => {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return NaN
  const [hours, minutes] = value.split(':').map(Number)
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : NaN
}

const overlaps = (first, second) =>
  first.day === second.day &&
  toMinutes(first.time_start) < toMinutes(second.time_end) &&
  toMinutes(first.time_end) > toMinutes(second.time_start)

const exceedsConsecutiveLimit = (schedule, maximumHours) => {
  if (!Number.isFinite(Number(maximumHours)) || Number(maximumHours) <= 0) return false
  const byDay = new Map()
  for (const entry of schedule) byDay.set(entry.day, [...(byDay.get(entry.day) || []), entry])
  for (const entries of byDay.values()) {
    entries.sort((a, b) => toMinutes(a.time_start) - toMinutes(b.time_start))
    let runStart = NaN
    let runEnd = NaN
    for (const entry of entries) {
      const start = toMinutes(entry.time_start)
      const end = toMinutes(entry.time_end)
      if (runEnd === start) runEnd = end
      else { runStart = start; runEnd = end }
      if (runEnd - runStart > Number(maximumHours) * 60) return true
    }
  }
  return false
}

const isValidSection = (section) => {
  const start = toMinutes(section.time_start)
  const end = toMinutes(section.time_end)
  return DAYS.includes(section.day) && Number.isFinite(start) && Number.isFinite(end) && end > start
}

const makeClass = (subject, section) => ({
  id: `${subject.id}-${section.id}`,
  subject_id: subject.id,
  section_id: section.id,
  subject_name: subject.subject_name,
  subject_code: subject.subject_code,
  section_code: section.section_code,
  day: section.day,
  time_start: section.time_start,
  time_end: section.time_end,
  room: section.room || '',
  instructor: section.instructor || '',
})

const getMetrics = (schedule, constraints, lockedSections) => {
  const days = new Set(schedule.map((entry) => entry.day))
  const hours = schedule.reduce((sum, entry) => sum + (toMinutes(entry.time_end) - toMinutes(entry.time_start)) / 60, 0)
  const dayStats = [...days].map((day) => {
    const entries = schedule.filter((entry) => entry.day === day).sort((a, b) => toMinutes(a.time_start) - toMinutes(b.time_start))
    const gaps = entries.slice(1).reduce((sum, entry, index) => sum + Math.max(0, toMinutes(entry.time_start) - toMinutes(entries[index].time_end)), 0)
    let longestRun = 0
    let runStart = 0
    let runEnd = 0
    for (const entry of entries) {
      const start = toMinutes(entry.time_start)
      const end = toMinutes(entry.time_end)
      if (runEnd === start) runEnd = end
      else { longestRun = Math.max(longestRun, runEnd - runStart); runStart = start; runEnd = end }
    }
    longestRun = Math.max(longestRun, runEnd - runStart)
    return { gaps, longestRun }
  })
  const gapHours = dayStats.reduce((sum, stat) => sum + stat.gaps / 60, 0)
  const preferredDayMisses = constraints.preferred_days.length
    ? schedule.filter((entry) => !constraints.preferred_days.includes(entry.day)).length
    : 0
  const maxRun = Math.max(0, ...dayStats.map((stat) => stat.longestRun)) / 60
  const lockedMisses = lockedSections.filter((locked) => !schedule.some((entry) => entry.section_id === locked.id)).length
  const score = Math.max(0, Math.min(100,
    100 -
    preferredDayMisses * 7 -
    days.size * (constraints.minimize_school_days ? 2.5 : 0.5) -
    gapHours * (constraints.pref_gap === 'Flexible' ? 0.35 : 1.5) -
    maxRun * 0.35,
  ))
  return {
    score: Math.round(score),
    complete: true,
    conflicts: 0,
    school_days: days.size,
    class_hours: Math.round(hours * 10) / 10,
    gaps: Math.round(gapHours * 10) / 10,
    preferred_day_misses: preferredDayMisses,
    longest_consecutive_hours: Math.round(maxRun * 10) / 10,
    locked_misses: lockedMisses,
    locked_ids: lockedSections.map((section) => section.id),
  }
}

const scheduleKey = (schedule) => schedule.map((entry) => entry.section_id).sort().join('|')

const withinConstraints = (section, constraints) => {
  if (!isValidSection(section)) return false
  const start = toMinutes(section.time_start)
  const end = toMinutes(section.time_end)
  if (start < toMinutes(constraints.constraint_start) || end > toMinutes(constraints.constraint_end)) return false
  if (start < toMinutes(constraints.pref_earliest) || end > toMinutes(constraints.pref_latest)) return false
  if (constraints.avoid_early && start < 9 * 60) return false
  if (constraints.avoid_night && start >= 18 * 60) return false
  return true
}

export function generateScheduleOptions({ subjects = [], constraints: rawConstraints = {}, lockedSections = [], limit = 6 }) {
  const constraints = { ...DEFAULTS, ...rawConstraints }
  const preferredDays = Array.isArray(constraints.preferred_days) ? constraints.preferred_days : []
  constraints.preferred_days = preferredDays
  const subjectIssues = []
  const lockedBySubject = new Map()

  for (const locked of lockedSections) {
    if (!locked?.subject_id || !locked?.id) continue
    if (lockedBySubject.has(locked.subject_id)) {
      subjectIssues.push(`${locked.subject_code || 'A subject'} has more than one locked section.`)
    }
    lockedBySubject.set(locked.subject_id, locked)
  }

  const choices = subjects.map((subject) => {
    const locked = lockedBySubject.get(subject.id)
    const sections = (Array.isArray(subject.sections) ? subject.sections : [])
      .filter((section) => withinConstraints(section, constraints))
      .filter((section) => !locked || section.id === locked.id)
      .map((section) => makeClass(subject, section))
    if (sections.length === 0) {
      const reason = locked
        ? 'its locked section is unavailable or outside your time limits'
        : 'no section fits your time limits (check section days and times)'
      subjectIssues.push(`${subject.subject_code || subject.subject_name || 'A subject'}: ${reason}.`)
    }
    return { subject, sections }
  }).sort((a, b) => a.sections.length - b.sections.length)

  if (subjects.length === 0) return { options: [], issues: ['Add at least one subject with sections before generating a schedule.'], searchedAll: true }
  if (subjectIssues.length) return { options: [], issues: subjectIssues, searchedAll: true }

  const options = []
  const seen = new Set()
  const nodeLimit = 250000
  let nodes = 0
  let searchedAll = true
  const walk = (index, current) => {
    if (index === choices.length) {
      const key = scheduleKey(current)
      if (!seen.has(key)) {
        seen.add(key)
        options.push({ schedule: current, metrics: getMetrics(current, constraints, lockedSections) })
      }
      return
    }
    const choice = choices[index]
    for (const entry of choice.sections) {
      nodes += 1
      if (nodes > nodeLimit) { searchedAll = false; return }
      const next = [...current, entry]
      if (!current.some((existing) => overlaps(existing, entry)) && !exceedsConsecutiveLimit(next, constraints.max_consecutive)) {
        walk(index + 1, next)
      }
      if (!searchedAll) return
    }
  }
  walk(0, [])

  options.sort((a, b) => b.metrics.score - a.metrics.score || a.metrics.gaps - b.metrics.gaps || a.metrics.school_days - b.metrics.school_days)
  return {
    options: options.slice(0, Math.max(1, limit)),
    issues: options.length ? [] : ['No conflict-free combination satisfies the selected sections and constraints. Try unlocking a section or widening your time limits.'],
    searchedAll,
  }
}

export function suggestAlternatives({ subjects = [], schedule = [], constraints: rawConstraints = {}, lockedSections = [] }) {
  const constraints = { ...DEFAULTS, ...rawConstraints }
  const lockedIds = new Set(lockedSections.map((section) => section.id))
  const suggestions = []
  for (const entry of schedule) {
    const subject = subjects.find((item) => item.id === entry.subject_id || item.subject_code === entry.subject_code)
    if (!subject || lockedIds.has(entry.section_id)) continue
    for (const section of subject.sections || []) {
      if (section.id === entry.section_id || !withinConstraints(section, constraints)) continue
      const alternative = makeClass(subject, section)
      if (schedule.some((other) => other.id !== entry.id && overlaps(alternative, other))) continue
      suggestions.push({
        current: entry,
        alternative,
        reason: `Move ${entry.subject_code} to ${alternative.day} ${alternative.time_start} to avoid a conflict.`,
      })
    }
  }
  return suggestions
}

export function buildSchedulePlan(input = {}) {
  const result = generateScheduleOptions(input)
  return {
    ...result,
    suggestions: suggestAlternatives({ ...input, schedule: input.schedule || [] }),
  }
}
