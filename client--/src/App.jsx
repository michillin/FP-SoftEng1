import { useEffect, useMemo, useState } from 'react'
import * as Icons from 'lucide-react'
import './App.css'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const HOURS = Array.from({ length: 15 }, (_, index) => index + 7)
const warpStars = Array.from({ length: 72 }, (_, index) => ({
  x: `${((index * 37) % 241) - 120}px`,
  y: `${((index * 53) % 321) - 160}px`,
  size: `${index % 7 === 0 ? 2 : 1}px`,
  duration: `${3.2 + (index % 9) * 0.48}s`,
  delay: `${-((index * 19) % 780) / 100}s`,
}))

const emptyProfile = {
  profile_name: '',
  reg_username: '',
  profile_email: '',
  profile_course: '',
  profile_year: 'First year',
  notify_email: true,
  notify_push: true,
  theme_pref: 'light',
}

const emptyConstraints = {
  constraint_start: '07:00',
  constraint_end: '21:00',
  preferred_days: [],
  break_pref: 'Compact',
  max_consecutive: 4,
  pref_earliest: '07:00',
  pref_latest: '21:00',
  avoid_early: false,
  avoid_night: false,
  minimize_school_days: false,
  pref_gap: 'Compact',
  pref_time_of_day: 'Balanced',
}

const fmtTime = (value) => {
  const [hours, minutes] = (value || '09:00').split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const formattedHour = ((hours + 11) % 12) + 1
  return `${formattedHour}:${String(minutes).padStart(2, '0')} ${period}`
}

const toMinutes = (value) => {
  const [hours, minutes] = (value || '00:00').split(':').map(Number)
  return hours * 60 + minutes
}

const overlaps = (a, b) =>
  a.day === b.day &&
  toMinutes(a.time_start) < toMinutes(b.time_end) &&
  toMinutes(a.time_end) > toMinutes(b.time_start)

const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

const toScheduleEntry = (subject, section) => ({
  id: uid('class'),
  subject_id: subject.id,
  section_id: section.id,
  subject_name: subject.subject_name,
  subject_code: subject.subject_code,
  section_code: section.section_code,
  day: section.day,
  time_start: section.time_start,
  time_end: section.time_end,
  room: section.room,
  instructor: section.instructor,
})

function Icon({ name, size = 18 }) {
  const Component = Icons[name] || Icons.CalendarDays
  return <Component size={size} />
}

function App() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [accountToken, setAccountToken] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [username, setUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [authMode, setAuthMode] = useState('login')
  const [accountForm, setAccountForm] = useState({ name: '', username: '', email: '', password: '', course: '', year: 'First year' })
  const [view, setView] = useState('schedule')
  const [mode, setMode] = useState('week')
  const [profile, setProfile] = useState(emptyProfile)
  const [subjects, setSubjects] = useState([])
  const [schedule, setSchedule] = useState([])
  const [lockedSections, setLockedSections] = useState([])
  const [constraints, setConstraints] = useState(emptyConstraints)
  const [editing, setEditing] = useState(null)
  const [modal, setModal] = useState(null)
  const [generatedOptions, setGeneratedOptions] = useState([])
  const [generationIssues, setGenerationIssues] = useState([])
  const [generationWasComplete, setGenerationWasComplete] = useState(true)
  const [selectedOption, setSelectedOption] = useState(0)
  const [suggestions, setSuggestions] = useState([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(timer)
  }, [toast])

  const conflicts = useMemo(
    () =>
      schedule.filter((entry, index) =>
        schedule.some((other, otherIndex) => otherIndex !== index && overlaps(entry, other)),
      ),
    [schedule],
  )

  const initials = (profile.profile_name || 'Student Planner')
    .split(/[ ,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  const isSectionLocked = (subject, section) =>
    lockedSections.some((entry) => entry.subject_id === subject.id && entry.id === section.id)

  const toggleLock = (subject, section, locked) => {
    const lockedSection = { ...section, subject_id: subject.id, subject_name: subject.subject_name, subject_code: subject.subject_code }
    setLockedSections((current) => [
      ...current.filter((item) => item.subject_id !== subject.id),
      ...(locked ? [lockedSection] : []),
    ])

    if (locked) {
      setSchedule((current) => [
        ...current.filter((item) => item.subject_id !== subject.id && item.subject_code !== subject.subject_code),
        toScheduleEntry(subject, section),
      ])
      setToast(`${subject.subject_code} ${section.section_code} locked.`)
    } else {
      setToast(`${subject.subject_code} unlocked.`)
    }
  }

  const addSubject = () => {
    const newSubject = {
      id: uid('sub'),
      subject_name: 'New Subject',
      subject_code: 'SUB',
      sections: [
        {
          id: uid('sec'),
          section_code: '1A',
          day: 'Monday',
          time_start: '09:00',
          time_end: '10:00',
          room: '',
          instructor: '',
        },
      ],
    }
    setSubjects((current) => [...current, newSubject])
  }

  const saveSubject = (subject) => {
    setSubjects((current) => {
      const exists = current.some((item) => item.id === subject.id)
      if (exists) {
        return current.map((item) => (item.id === subject.id ? subject : item))
      }
      return [...current, { ...subject, id: subject.id || uid('sub') }]
    })
  }

  const removeSubject = (subjectId) => {
    setSubjects((current) => current.filter((subject) => subject.id !== subjectId))
  }

  const openClassModal = (entry) => {
    setEditing(entry || {
      id: '',
      subject_name: '',
      subject_code: '',
      section_code: '',
      day: 'Monday',
      time_start: '09:00',
      time_end: '10:00',
      room: '',
      instructor: '',
    })
    setModal('class')
  }

  const saveClass = (event) => {
    event.preventDefault()
    if (!editing) return

    const nextClass = {
      ...editing,
      id: editing.id || uid('class'),
      subject_code: editing.subject_code || 'GEN',
      section_code: editing.section_code || 'A',
    }

    setSchedule((current) => {
      if (editing.id) {
        return current.map((item) => (item.id === editing.id ? nextClass : item))
      }
      return [...current, nextClass]
    })

    setModal(null)
    setEditing(null)
    setToast('Class saved.')
  }

  const removeClass = (classId) => {
    setSchedule((current) => current.filter((item) => item.id !== classId))
    setToast('Class removed.')
  }

  const generateOptions = async () => {
    const inputSubjects = subjects.filter(
      (subject) => subject.subject_name?.trim() && subject.subject_code?.trim() && subject.sections?.length > 0,
    )
    if (inputSubjects.length === 0) {
      setGeneratedOptions([])
      setGenerationIssues(['Add at least one subject and section before generating a schedule.'])
      setSuggestions([])
      setGenerationWasComplete(true)
      setModal('review')
      return
    }

    setIsGenerating(true)
    try {
      const response = await fetch('/api/schedules/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjects, schedule, constraints, lockedSections }),
      })
      if (!response.ok) throw new Error('Schedule service unavailable')
      const result = await response.json()
      setGeneratedOptions(result.options || [])
      setGenerationIssues(result.issues || [])
      setGenerationWasComplete(result.searchedAll !== false)
      setSuggestions(result.suggestions || [])
      setSelectedOption(0)
      setModal('review')
      setToast(result.options?.length ? 'Conflict-free schedule options generated.' : 'No schedule fits these sections and constraints.')
    } catch (error) {
      setToast('Unable to generate options right now.')
    } finally {
      setIsGenerating(false)
    }
  }

  const useGeneratedSchedule = (option) => {
    setSchedule(option.schedule || [])
    setModal(null)
    setToast('Generated schedule applied.')
  }

  const applySuggestion = (suggestion) => {
    setSchedule((current) => current.map((entry) => (entry.id === suggestion.current.id ? suggestion.alternative : entry)))
    setSuggestions((current) => current.filter((item) => item.current.id !== suggestion.current.id))
    setToast(`${suggestion.current.subject_code} moved to ${suggestion.alternative.day}.`)
  }

  const restoreAccountState = async (identifier) => {
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(identifier)}/state`, {
        headers: { Authorization: `Bearer ${accountToken}` },
      })
      if (!response.ok) return false
      const state = await response.json()
      if (state.profile) setProfile((current) => ({ ...current, ...state.profile }))
      if (Array.isArray(state.subjects)) setSubjects(state.subjects)
      if (Array.isArray(state.schedule)) setSchedule(state.schedule)
      if (state.constraints) setConstraints((current) => ({ ...current, ...state.constraints }))
      if (Array.isArray(state.lockedSections)) setLockedSections(state.lockedSections)
      return true
    } catch {
      return false
    }
  }

  const savePlannerState = async () => {
    if (!accountToken) {
      setToast('Sign in to an account to save your planner online.')
      return
    }
    const identifier = profile.reg_username?.trim()
    if (!identifier) {
      setToast('Add a username in Settings before saving online.')
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(identifier)}/state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accountToken}` },
        body: JSON.stringify({ profile, subjects, schedule, constraints, lockedSections }),
      })
      if (!response.ok) throw new Error('Save failed')
      setToast('Planner saved to the backend.')
    } catch {
      setToast('Saved on this device; backend is unavailable.')
    } finally {
      setIsSaving(false)
    }
  }

  const resetSemester = () => {
    setSchedule([])
    setToast('Semester reset.')
  }

  const handleLogin = async () => {
    const cleanUsername = username.trim()
    if (!cleanUsername || !loginPassword) {
      setToast('Enter your username/email and password.')
      return
    }
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: cleanUsername, password: loginPassword }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Login failed.')
      setAccountToken(result.token)
      setProfile(result.user.profile)
      setSubjects(result.user.subjects || [])
      setSchedule(result.user.schedule || [])
      setConstraints((current) => ({ ...current, ...(result.user.constraints || {}) }))
      setLockedSections(result.user.lockedSections || [])
      setLoggedIn(true)
      setLoginPassword('')
      setToast('Welcome back.')
    } catch (error) {
      setToast(error.message)
    }
  }

  const handleCreateAccount = async (event) => {
    event.preventDefault()
    const cleanName = accountForm.name.trim()
    const cleanUsername = accountForm.username.trim()
    const cleanEmail = accountForm.email.trim()
    if (!cleanName || !cleanUsername || !cleanEmail || !accountForm.password) {
      setToast('Complete your name, username, email, and password.')
      return
    }
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          username: cleanUsername,
          email: cleanEmail,
          password: accountForm.password,
          course: accountForm.course.trim(),
          year: accountForm.year,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Registration failed.')
      setAccountToken(result.token)
      setProfile(result.user.profile)
      setSubjects([])
      setSchedule([])
      setLockedSections([])
      setUsername(cleanUsername)
      setLoggedIn(true)
      setAccountForm({ name: '', username: '', email: '', password: '', course: '', year: 'First year' })
      setToast(`Welcome, ${cleanName}.`)
    } catch (error) {
      setToast(error.message)
    }
  }

  const continueAsGuest = () => {
    setProfile((current) => ({ ...current, profile_name: current.profile_name || 'Guest Planner', reg_username: current.reg_username || 'guest' }))
    setLoggedIn(true)
    setToast('Guest planner ready.')
  }

  const handleLogout = () => {
    if (accountToken) {
      fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${accountToken}` } }).catch(() => {})
    }
    setAccountToken('')
    setLoggedIn(false)
    setProfile(emptyProfile)
    setSubjects([])
    setSchedule([])
    setLockedSections([])
    setConstraints(emptyConstraints)
    setToast('You have been signed out.')
  }

  return (
    <div className={hydrated && profile.theme_pref === 'dark' ? 'app-shell dark-theme' : 'app-shell'}>
      {!loggedIn ? (
        <div className="login-screen">
          <div className="login-card">
            <div className="login-panel">
              <div className="space-warp" aria-hidden="true">
                {warpStars.map((star, index) => (
                  <i
                    key={index}
                    className={index % 7 === 0 ? 'warp-star gold-star' : 'warp-star'}
                    style={{
                      '--star-x': star.x,
                      '--star-y': star.y,
                      '--star-size': star.size,
                      '--star-duration': star.duration,
                      '--star-delay': star.delay,
                    }}
                  />
                ))}
              </div>
              <div className="brand-row">
                <div className="brand-pill"><Icon name="CalendarDays" size={18} /></div>
                <strong>MyTerm</strong>
              </div>
              <p className="brand-tagline">May the Schedule, be with you.</p>
              <h1>Shape your week with confidence.</h1>
              <p>Build a clean academic plan, compare sections, and stay ahead of conflicts.</p>
              <div className="feature-grid">
                <div className="feature-box">
                  <Icon name="ShieldCheck" size={24} />
                  <strong>Lock classes</strong>
                </div>
                <div className="feature-box">
                  <Icon name="BarChart3" size={24} />
                  <strong>Compare sections</strong>
                </div>
                <div className="feature-box wide">
                  <Icon name="Sparkles" size={24} />
                  <strong>Smart alternatives</strong>
                </div>
              </div>
            </div>

            <div className="login-form">
              <div className="auth-switcher" role="tablist" aria-label="Account access">
                <button type="button" className={authMode === 'login' ? 'auth-tab active' : 'auth-tab'} onClick={() => setAuthMode('login')}>Sign in</button>
                <button type="button" className={authMode === 'create' ? 'auth-tab active' : 'auth-tab'} onClick={() => setAuthMode('create')}>Create account</button>
              </div>

              {authMode === 'login' ? (
                <form onSubmit={(event) => { event.preventDefault(); handleLogin() }} className="auth-form">
                  <h2>Welcome back</h2>
                  <p className="form-hint">Use any username or email to open your planner.</p>
                  <label>
                    Username or email
                    <input autoFocus value={username} onChange={(event) => setUsername(event.target.value)} />
                  </label>
                  <label>
                    Password
                    <input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} />
                  </label>
                  <button type="submit" className="btn primary full">Continue</button>
                  <button type="button" className="btn secondary full" onClick={continueAsGuest}>Continue as guest</button>
                </form>
              ) : (
                <form onSubmit={handleCreateAccount} className="auth-form">
                  <h2>Create your planner</h2>
                  <p className="form-hint">Create an account to save your planner securely.</p>
                  <label>
                    Full name
                    <input autoFocus value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} />
                  </label>
                  <label>
                    Username
                    <input value={accountForm.username} onChange={(event) => setAccountForm({ ...accountForm, username: event.target.value })} />
                  </label>
                  <label>
                    Email
                    <input type="email" value={accountForm.email} onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })} />
                  </label>
                  <label>
                    Password
                    <input type="password" minLength="6" value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} />
                  </label>
                  <div className="form-grid two">
                    <label>
                      Course
                      <input value={accountForm.course} onChange={(event) => setAccountForm({ ...accountForm, course: event.target.value })} />
                    </label>
                    <label>
                      Year level
                      <select value={accountForm.year} onChange={(event) => setAccountForm({ ...accountForm, year: event.target.value })}>
                        {['First year', 'Second year', 'Third year', 'Fourth year', 'Graduate'].map((level) => <option key={level} value={level}>{level}</option>)}
                      </select>
                    </label>
                  </div>
                  <button type="submit" className="btn primary full">Create account</button>
                </form>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <header className="topbar">
            <div className="top-left">
              <div className="brand-pill"><Icon name="CalendarDays" size={18} /></div>
              <div className="top-brand"><strong>MyTerm</strong><span>May the Schedule, be with you.</span></div>
              <nav className="nav-list">
                {['schedule', 'subjects', 'settings'].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={view === tab ? 'nav active' : 'nav'}
                    onClick={() => setView(tab)}
                  >
                    {tab === 'schedule' ? 'My Schedule' : tab === 'subjects' ? 'Subjects' : 'Settings'}
                  </button>
                ))}
              </nav>
            </div>

            <div className="top-actions">
              <div className="profile-badge">
                <span className="avatar">{initials}</span>
                <span>{profile.profile_name || 'Student Planner'}</span>
              </div>
              <button type="button" className="btn primary" onClick={generateOptions} disabled={isGenerating}>
                <Icon name="Sparkles" size={16} />
                {isGenerating ? 'Building...' : 'Generate'}
              </button>
              <button type="button" className="btn secondary" onClick={savePlannerState} disabled={isSaving}>
                <Icon name="CloudUpload" size={16} />
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button type="button" className="icon-btn" onClick={handleLogout} title="Log out" aria-label="Log out"><Icon name="LogOut" size={16} /></button>
            </div>
          </header>

          <div className="workspace">
            <main className="content card">
              {view === 'schedule' && (
                <ScheduleView
                  schedule={schedule}
                  mode={mode}
                  setMode={setMode}
                  conflicts={conflicts}
                  suggestions={suggestions}
                  applySuggestion={applySuggestion}
                  openClassModal={openClassModal}
                  removeClass={removeClass}
                  setEditing={setEditing}
                />
              )}

              {view === 'subjects' && (
                <SubjectsPanel
                  subjects={subjects}
                  onAddSubject={addSubject}
                  onSave={saveSubject}
                  onRemove={removeSubject}
                  isSectionLocked={isSectionLocked}
                  onToggleLock={toggleLock}
                />
              )}

              {view === 'settings' && (
                <SettingsPanel profile={profile} setProfile={setProfile} resetSemester={resetSemester} />
              )}
            </main>

            <ConstraintRail constraints={constraints} setConstraints={setConstraints} />
          </div>
        </>
      )}

      {modal === 'class' && editing && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing.id ? 'Edit class' : 'Add class'}</h3>
              <button type="button" className="icon-btn" onClick={() => setModal(null)}><Icon name="X" size={16} /></button>
            </div>

            <form onSubmit={saveClass} className="modal-form">
              <div className="form-grid">
                <label>
                  Subject name
                  <input value={editing.subject_name} onChange={(event) => setEditing({ ...editing, subject_name: event.target.value })} />
                </label>
                <label>
                  Subject code
                  <input value={editing.subject_code} onChange={(event) => setEditing({ ...editing, subject_code: event.target.value })} />
                </label>
                <label>
                  Section code
                  <input value={editing.section_code} onChange={(event) => setEditing({ ...editing, section_code: event.target.value })} />
                </label>
                <label>
                  Day
                  <select value={editing.day} onChange={(event) => setEditing({ ...editing, day: event.target.value })}>
                    {DAYS.map((day) => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Start time
                  <input type="time" value={editing.time_start} onChange={(event) => setEditing({ ...editing, time_start: event.target.value })} />
                </label>
                <label>
                  End time
                  <input type="time" value={editing.time_end} onChange={(event) => setEditing({ ...editing, time_end: event.target.value })} />
                </label>
                <label>
                  Room
                  <input value={editing.room} onChange={(event) => setEditing({ ...editing, room: event.target.value })} />
                </label>
                <label>
                  Instructor
                  <input value={editing.instructor} onChange={(event) => setEditing({ ...editing, instructor: event.target.value })} />
                </label>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === 'review' && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Review schedule</h3>
              <button type="button" className="icon-btn" onClick={() => setModal(null)}><Icon name="X" size={16} /></button>
            </div>

            {generationIssues.length > 0 && (
              <div className="warning-banner generation-message">
                <Icon name="TriangleAlert" size={15} />
                <div>{generationIssues.map((issue) => <p key={issue}>{issue}</p>)}</div>
              </div>
            )}
            {!generationWasComplete && <p className="form-hint">There were many combinations, so generation stopped after checking a large set of conflict-free options. These are the best options found in that search.</p>}

            <div className="review-list">
              {generatedOptions.length > 0 ? (
                generatedOptions.map((option, index) => (
                  <button
                    key={index}
                    type="button"
                    className={selectedOption === index ? 'review-item selected' : 'review-item'}
                    onClick={() => setSelectedOption(index)}
                  >
                    <strong>Option {index + 1}</strong>
                    <span>{option.schedule.length} of {subjects.length} subjects · Preference score {option.metrics.score}/100</span>
                    <small>0 conflicts · {option.metrics.school_days} days · {option.metrics.gaps}h gaps · longest run {option.metrics.longest_consecutive_hours}h</small>
                  </button>
                ))
              ) : (
                <p>No valid schedule options.</p>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setModal(null)}>Keep current</button>
              {generatedOptions.length > 0 && <button type="button" className="btn primary" onClick={() => useGeneratedSchedule(generatedOptions[selectedOption])}>Use this plan</button>}
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function ScheduleView({ schedule, mode, setMode, conflicts, suggestions, applySuggestion, openClassModal, removeClass }) {
  return (
    <section className="page-panel">
      <div className="page-head">
        <div>
          <p className="eyebrow">Your study week</p>
          <h1>My Schedule</h1>
        </div>
        <div className="head-buttons">
          <button type="button" className={mode === 'week' ? 'btn primary' : 'btn secondary'} onClick={() => setMode('week')}>Week</button>
          <button type="button" className={mode === 'list' ? 'btn primary' : 'btn secondary'} onClick={() => setMode('list')}>List</button>
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="warning-banner">
          <Icon name="TriangleAlert" size={15} />
          {conflicts.length} conflicting class{conflicts.length > 1 ? 'es' : ''} detected.
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="suggestion-panel">
          <div>
            <strong>Smart alternatives</strong>
            <span>Resolve conflicts without rebuilding your whole week.</span>
          </div>
          <div className="suggestion-list">
            {suggestions.slice(0, 3).map((suggestion) => (
              <button key={`${suggestion.current.id}-${suggestion.alternative.section_id}`} type="button" className="suggestion-item" onClick={() => applySuggestion(suggestion)}>
                <span>{suggestion.current.subject_code} → {suggestion.alternative.section_code}</span>
                <small>{suggestion.alternative.day} · {fmtTime(suggestion.alternative.time_start)}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {schedule.length === 0 ? (
        <div className="empty-state">
          <Icon name="CalendarPlus" size={42} />
          <h2>Your week is ready.</h2>
          <p>Choose subject sections or add a class manually.</p>
          <button type="button" className="btn primary" onClick={() => openClassModal()}>Add class</button>
        </div>
      ) : mode === 'week' ? (
        <WeekGrid schedule={schedule} openClassModal={openClassModal} />
      ) : (
        <ListView schedule={schedule} openClassModal={openClassModal} removeClass={removeClass} />
      )}
    </section>
  )
}

function WeekGrid({ schedule, openClassModal }) {
  const today = DAYS[new Date().getDay()]

  return (
    <div className="week-board">
      <div className="week-head">
        <div className="time-heading">Time</div>
        {DAYS.map((day) => (
          <div key={day} className={day === today ? 'day-heading today' : 'day-heading'}>{day.slice(0, 3)}</div>
        ))}
      </div>

      {HOURS.map((hour) => (
        <div key={hour} className="week-row">
          <div className="time-cell">{fmtTime(`${String(hour).padStart(2, '0')}:00`)}</div>
          {DAYS.map((day) => {
            const items = schedule.filter((entry) => entry.day === day && Number(entry.time_start.slice(0, 2)) === hour)
            return (
              <div
                key={`${day}-${hour}`}
                className={day === today ? 'slot today-slot' : 'slot'}
                onDoubleClick={() => openClassModal({ day, time_start: `${String(hour).padStart(2, '0')}:00`, time_end: `${String(hour + 1).padStart(2, '0')}:00` })}
              >
                {items.map((entry) => (
                  <button type="button" key={entry.id} className="event-card" onClick={() => openClassModal(entry)}>
                    <strong>{entry.subject_code}</strong>
                    <span>{fmtTime(entry.time_start)}–{fmtTime(entry.time_end)}</span>
                    <small>{entry.section_code}</small>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function ListView({ schedule, openClassModal, removeClass }) {
  return (
    <div className="list-board">
      {[...schedule]
        .sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.time_start.localeCompare(b.time_start))
        .map((entry) => (
          <article key={entry.id} className="list-item">
            <div>
              <strong>{entry.subject_code} · {entry.subject_name}</strong>
              <p>{entry.section_code} · {entry.day} · {fmtTime(entry.time_start)}–{fmtTime(entry.time_end)}</p>
            </div>
            <div className="list-actions">
              <button type="button" className="btn secondary" onClick={() => openClassModal(entry)}>Edit</button>
              <button type="button" className="icon-btn danger" onClick={() => removeClass(entry.id)}><Icon name="Trash2" size={15} /></button>
            </div>
          </article>
        ))}
    </div>
  )
}

function SubjectsPanel({ subjects, onAddSubject, onSave, onRemove, isSectionLocked, onToggleLock }) {
  return (
    <section className="page-panel">
      <div className="page-head">
        <div>
          <p className="eyebrow">Your plan</p>
          <h1>My Subjects</h1>
        </div>
        <button type="button" className="btn primary" onClick={onAddSubject}>
          <Icon name="Plus" size={16} />
          Add subject
        </button>
      </div>

      {subjects.length === 0 && (
        <div className="empty-state subject-empty-state">
          <Icon name="BookOpen" size={42} />
          <h2>Start with your subjects.</h2>
          <p>Add the courses you are taking, then add each available section.</p>
          <button type="button" className="btn primary" onClick={onAddSubject}>Add your first subject</button>
        </div>
      )}

      <div className="subjects-grid">
        {subjects.map((subject) => (
          <article key={subject.id} className="subject-editor panel">
            <div className="editor-head">
              <div>
                <strong>{subject.subject_code}</strong>
                <small>{subject.subject_name}</small>
              </div>
              <button type="button" className="icon-btn danger" onClick={() => onRemove(subject.id)}><Icon name="Trash2" size={15} /></button>
            </div>

            <div className="form-grid two">
              <label>
                Subject name
                <input value={subject.subject_name} onChange={(event) => onSave({ ...subject, subject_name: event.target.value })} />
              </label>
              <label>
                Code
                <input value={subject.subject_code} onChange={(event) => onSave({ ...subject, subject_code: event.target.value })} />
              </label>
            </div>

            <div className="section-stack">
              {subject.sections.map((section) => (
                <div key={section.id} className="section-editor-block">
                  <div className="section-editor-heading">
                    <span>{isSectionLocked(subject, section) ? 'Preferred section locked' : 'Available section'}</span>
                    <button
                      type="button"
                      className={isSectionLocked(subject, section) ? 'lock-btn locked' : 'lock-btn'}
                      onClick={() => onToggleLock(subject, section, !isSectionLocked(subject, section))}
                      title={isSectionLocked(subject, section) ? 'Unlock preferred section' : 'Lock preferred section'}
                      aria-label={isSectionLocked(subject, section) ? 'Unlock preferred section' : 'Lock preferred section'}
                    >
                      <Icon name={isSectionLocked(subject, section) ? 'LockKeyhole' : 'LockKeyholeOpen'} size={15} />
                    </button>
                  </div>
                  <div className="form-grid three">
                    <label>
                      Section
                      <input value={section.section_code} onChange={(event) => onSave({ ...subject, sections: subject.sections.map((item) => item.id === section.id ? { ...item, section_code: event.target.value } : item) })} />
                    </label>
                    <label>
                      Day
                      <select value={section.day} onChange={(event) => onSave({ ...subject, sections: subject.sections.map((item) => item.id === section.id ? { ...item, day: event.target.value } : item) })}>
                        {DAYS.map((day) => <option key={day} value={day}>{day}</option>)}
                      </select>
                    </label>
                    <label>
                      Room
                      <input value={section.room} onChange={(event) => onSave({ ...subject, sections: subject.sections.map((item) => item.id === section.id ? { ...item, room: event.target.value } : item) })} />
                    </label>
                    <label>
                      Start
                      <input type="time" value={section.time_start} onChange={(event) => onSave({ ...subject, sections: subject.sections.map((item) => item.id === section.id ? { ...item, time_start: event.target.value } : item) })} />
                    </label>
                    <label>
                      End
                      <input type="time" value={section.time_end} onChange={(event) => onSave({ ...subject, sections: subject.sections.map((item) => item.id === section.id ? { ...item, time_end: event.target.value } : item) })} />
                    </label>
                    <label>
                      Instructor
                      <input value={section.instructor} onChange={(event) => onSave({ ...subject, sections: subject.sections.map((item) => item.id === section.id ? { ...item, instructor: event.target.value } : item) })} />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="btn secondary full"
              onClick={() =>
                onSave({
                  ...subject,
                  sections: [
                    ...subject.sections,
                    {
                      id: uid('sec'),
                      section_code: 'A',
                      day: 'Monday',
                      time_start: '09:00',
                      time_end: '10:00',
                      room: '',
                      instructor: '',
                    },
                  ],
                })
              }
            >
              Add section
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}

function SettingsPanel({ profile, setProfile, resetSemester }) {
  return (
    <section className="page-panel">
      <div className="page-head">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Settings</h1>
        </div>
      </div>

      <div className="settings-grid">
        <article className="settings-card card">
          <h2>Profile</h2>
          <div className="form-grid two">
            <label>
              Full name
              <input value={profile.profile_name} onChange={(event) => setProfile({ ...profile, profile_name: event.target.value })} />
            </label>
            <label>
              Username
              <input value={profile.reg_username} onChange={(event) => setProfile({ ...profile, reg_username: event.target.value })} />
            </label>
            <label>
              Email
              <input type="email" value={profile.profile_email} onChange={(event) => setProfile({ ...profile, profile_email: event.target.value })} />
            </label>
            <label>
              Course
              <input value={profile.profile_course} onChange={(event) => setProfile({ ...profile, profile_course: event.target.value })} />
            </label>
            <label>
              Year level
              <select value={profile.profile_year} onChange={(event) => setProfile({ ...profile, profile_year: event.target.value })}>
                {['First year', 'Second year', 'Third year', 'Fourth year', 'Graduate'].map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </label>
          </div>
        </article>

        <article className="settings-card card">
          <h2>Preferences</h2>
          <div className="toggle-list">
            <label>
              Email reminders
              <input type="checkbox" checked={profile.notify_email} onChange={(event) => setProfile({ ...profile, notify_email: event.target.checked })} />
            </label>
            <label>
              Push notifications
              <input type="checkbox" checked={profile.notify_push} onChange={(event) => setProfile({ ...profile, notify_push: event.target.checked })} />
            </label>
            <label>
              Dark mode
              <input type="checkbox" checked={profile.theme_pref === 'dark'} onChange={(event) => setProfile({ ...profile, theme_pref: event.target.checked ? 'dark' : 'light' })} />
            </label>
          </div>
          <button type="button" className="btn danger" onClick={resetSemester}>Reset semester</button>
        </article>
      </div>
    </section>
  )
}

function ConstraintRail({ constraints, setConstraints }) {
  return (
    <aside className="constraint-rail card">
      <h2>Constraints</h2>

      <fieldset>
        <legend>Time boundaries</legend>
        <div className="form-grid two">
          <label>
            Earliest
            <select value={constraints.constraint_start} onChange={(event) => setConstraints({ ...constraints, constraint_start: event.target.value })}>
              {HOURS.map((hour) => (
                <option key={hour} value={`${String(hour).padStart(2, '0')}:00`}>{`${String(hour).padStart(2, '0')}:00`}</option>
              ))}
            </select>
          </label>
          <label>
            Latest
            <select value={constraints.constraint_end} onChange={(event) => setConstraints({ ...constraints, constraint_end: event.target.value })}>
              {HOURS.map((hour) => (
                <option key={hour} value={`${String(hour).padStart(2, '0')}:00`}>{`${String(hour).padStart(2, '0')}:00`}</option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Preferred days</legend>
        <div className="day-picker">
          {DAYS.map((day) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={constraints.preferred_days.includes(day)}
                onChange={(event) =>
                  setConstraints({
                    ...constraints,
                    preferred_days: event.target.checked
                      ? [...constraints.preferred_days, day]
                      : constraints.preferred_days.filter((entry) => entry !== day),
                  })
                }
              />
              {day.slice(0, 3)}
            </label>
          ))}
        </div>
      </fieldset>

      <label>
        Max consecutive hours
        <input type="number" min="1" max="12" value={constraints.max_consecutive} onChange={(event) => setConstraints({ ...constraints, max_consecutive: Number(event.target.value) || 1 })} />
      </label>

      <label>
        Preferred earliest
        <input type="time" value={constraints.pref_earliest} onChange={(event) => setConstraints({ ...constraints, pref_earliest: event.target.value })} />
      </label>

      <label>
        Preferred latest
        <input type="time" value={constraints.pref_latest} onChange={(event) => setConstraints({ ...constraints, pref_latest: event.target.value })} />
      </label>

      <label>
        Avoid early classes
        <input type="checkbox" checked={constraints.avoid_early} onChange={(event) => setConstraints({ ...constraints, avoid_early: event.target.checked })} />
      </label>

      <label>
        Avoid night classes
        <input type="checkbox" checked={constraints.avoid_night} onChange={(event) => setConstraints({ ...constraints, avoid_night: event.target.checked })} />
      </label>
    </aside>
  )
}

export default App
