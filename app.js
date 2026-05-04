// config.js provides: SUPABASE_URL, SUPABASE_ANON_KEY, AI_DEFAULT_MODEL

// ── State ─────────────────────────────────────────────────────────────────────
let db = [];
let aiModel = localStorage.getItem('qabar_model') || AI_DEFAULT_MODEL;
let exam = null;
let timerTick = null;
let parsedData = null;

// ── Supabase REST helper ───────────────────────────────────────────────────────
async function supa(method, table, { filter, body, prefer } = {}) {
  let url = `${SUPABASE_URL}/rest/v1/${table}`;
  if (filter) url += '?' + filter;
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': prefer !== undefined ? prefer : (method === 'GET' ? '' : 'return=minimal')
  };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── Data operations ───────────────────────────────────────────────────────────
async function loadQuestions() {
  db = await supa('GET', 'questions', { filter: 'order=created_at.asc' }) || [];
}

async function addQuestion(q) {
  await supa('POST', 'questions', { body: q });
  db.push(q);
}

async function updateQuestion(id, updates) {
  await supa('PATCH', 'questions', { filter: `id=eq.${id}`, body: updates });
  const idx = db.findIndex(q => q.id === id);
  if (idx >= 0) Object.assign(db[idx], updates);
}

async function removeQuestion(id) {
  await supa('DELETE', 'questions', { filter: `id=eq.${id}` });
  db = db.filter(q => q.id !== id);
}

async function saveExamSession(sessionData, answerRows) {
  await supa('POST', 'exam_sessions', { body: sessionData });
  if (answerRows.length) await supa('POST', 'exam_answers', { body: answerRows });
}

async function loadHistory() {
  return await supa('GET', 'exam_sessions', { filter: 'order=created_at.desc&limit=30' }) || [];
}

async function loadSessionAnswers(sessionId) {
  return await supa('GET', 'exam_answers', { filter: `session_id=eq.${sessionId}&order=question_order.asc` }) || [];
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// Normalize question from old (camelCase) or new (snake_case) format
function normalizeQ(q) {
  return {
    id:               q.id || uid(),
    year:             q.year || '',
    law:              q.law || '',
    subject:          q.subject || '',
    topic:            q.topic || '',
    source:           q.source || '',
    question:         q.question || '',
    suggested_answer: q.suggested_answer || q.suggestedAnswer || ''
  };
}

// ── Loading overlay ───────────────────────────────────────────────────────────
function setLoading(show, msg = 'Loading…') {
  const el = document.getElementById('loading-overlay');
  el.style.display = show ? 'flex' : 'none';
  document.getElementById('loading-msg').textContent = msg;
}

// ── Navigation ────────────────────────────────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

function sel(id) { return document.getElementById(id).value; }

function goSetup() {
  if (!getFiltered(sel('home-law'), sel('home-subject')).length) {
    alert('No questions available. Add questions first.'); return;
  }
  renderSetup();
  showView('view-setup');
}

function goImport() { renderImport(); renderQList(); showView('view-import'); }

async function goHistory() {
  setLoading(true, 'Loading history…');
  try {
    renderHistoryView(await loadHistory());
    showView('view-history');
  } catch (e) {
    alert('Failed to load history: ' + e.message);
  } finally {
    setLoading(false);
  }
}

// ── Question bank helpers ─────────────────────────────────────────────────────
function getLaws() { return [...new Set(db.map(q => q.law).filter(Boolean))].sort(); }

function getSubjects(law) {
  return [...new Set(db.filter(q => !law || q.law === law).map(q => q.subject).filter(Boolean))].sort();
}

function getFiltered(law, subject) {
  const subLow = (subject || '').toLowerCase();
  return db.filter(q =>
    (!law || q.law === law) &&
    (!subLow || (q.subject || '').toLowerCase().includes(subLow))
  );
}

// ── Home view ─────────────────────────────────────────────────────────────────
function renderHome() {
  const lawEl = document.getElementById('home-law');
  const subEl = document.getElementById('home-subject');

  lawEl.innerHTML = '<option value="">All Laws</option>' +
    getLaws().map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('');

  function refresh() {
    subEl.innerHTML = '<option value="">All Subjects</option>' +
      getSubjects(lawEl.value).map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    document.getElementById('home-avail').textContent = getFiltered(lawEl.value, '').length;
  }

  lawEl.onchange = refresh;
  subEl.onchange = () => {
    document.getElementById('home-avail').textContent = getFiltered(lawEl.value, subEl.value).length;
  };

  refresh();
  document.getElementById('stat-total').textContent = db.length;
  document.getElementById('stat-subjects').textContent = [...new Set(db.map(q => q.subject).filter(Boolean))].length;
  document.getElementById('stat-laws').textContent = [...new Set(db.map(q => q.law).filter(Boolean))].length;
  document.getElementById('empty-notice').style.display = db.length === 0 ? 'block' : 'none';
}

// ── Setup view ────────────────────────────────────────────────────────────────
function renderSetup() {
  const law = sel('home-law'), subject = sel('home-subject');
  const filtered = getFiltered(law, subject);
  document.getElementById('setup-label').textContent = [law, subject].filter(Boolean).join(' › ') || 'All Questions';
  document.getElementById('setup-avail-note').textContent = `(${filtered.length} available)`;
  const qInput = document.getElementById('setup-qcount');
  qInput.max = filtered.length;
  if (parseInt(qInput.value) > filtered.length) qInput.value = filtered.length;
  const warn = document.getElementById('setup-warn');
  warn.style.display = 'none';
}

// ── Exam ──────────────────────────────────────────────────────────────────────
function startExam() {
  const law = sel('home-law'), subject = sel('home-subject');
  const pool = getFiltered(law, subject);
  if (!pool.length) { alert('No questions found.'); return; }

  const hours    = parseInt(document.getElementById('setup-hours').value) || 4;
  const mins     = parseInt(document.getElementById('setup-mins').value)  || 0;
  const duration = hours * 3600 + mins * 60 || 14400;
  const qCount   = Math.min(Math.max(1, parseInt(document.getElementById('setup-qcount').value) || 20), pool.length);
  const questions = [...pool].sort(() => Math.random() - 0.5).slice(0, qCount);

  exam = {
    id: uid(), questions, law, subject, duration,
    answers:    new Array(questions.length).fill(''),
    aiResults:  new Array(questions.length).fill(null),
    answerIds:  [],
    timeLeft: duration, timeUsed: 0
  };

  renderExamView();
  showView('view-exam');
  startTimer();
}

function abandonExam() {
  if (!confirm('Abandon this exam? Your answers will be lost.')) return;
  stopTimer();
  showView('view-home');
}

function startTimer() {
  stopTimer();
  timerTick = setInterval(() => {
    exam.timeLeft--; exam.timeUsed++;
    tickTimer();
    if (exam.timeLeft <= 0) submitExam(true);
  }, 1000);
  tickTimer();
}

function stopTimer() { if (timerTick) { clearInterval(timerTick); timerTick = null; } }

function tickTimer() {
  const t = exam.timeLeft, d = exam.duration;
  const disp = document.getElementById('exam-timer');
  const fill = document.getElementById('exam-fill');
  if (!disp) return;
  disp.textContent = fmtTime(t);
  disp.className = 'timer-display' + (t < 600 ? ' crit' : t < 1800 ? ' warn' : '');
  fill.style.width = Math.max(0, (t / d) * 100) + '%';
  fill.style.background = t < 600 ? '#f87171' : t < 1800 ? '#fbbf24' : '#4ade80';
}

function renderExamView() {
  const label = [exam.law, exam.subject].filter(Boolean).join(' › ') || 'All Questions';
  document.getElementById('exam-subject-tag').textContent = label;
  document.getElementById('exam-q-tag').textContent = exam.questions.length + ' questions';
  document.getElementById('exam-questions').innerHTML = exam.questions.map((q, i) => `
    <div class="q-block">
      <div class="q-num">Question ${i + 1}
        ${q.year    ? `<span class="badge badge-blue">${esc(q.year)}</span>` : ''}
        ${q.subject ? `<span class="badge badge-purple">${esc(q.subject)}</span>` : ''}
      </div>
      <div class="q-text">${esc(q.question)}</div>
      <textarea class="q-answer" id="ans-${i}" placeholder="Type your answer here…"
        oninput="onAnswerInput(${i})">${esc(exam.answers[i])}</textarea>
    </div>
  `).join('');
}

function onAnswerInput(i) {
  const ta = document.getElementById(`ans-${i}`);
  exam.answers[i] = ta.value;
  ta.classList.toggle('filled', ta.value.trim().length > 0);
}

async function submitExam(auto = false) {
  if (!auto) {
    const blank = exam.answers.filter(a => !a.trim()).length;
    if (blank > 0 && !confirm(`${blank} question(s) unanswered. Submit anyway?`)) return;
  }
  stopTimer();
  renderResults();
  showView('view-results');

  // Save to Supabase in background (non-blocking)
  try {
    const answerRows = exam.questions.map((q, i) => ({
      id:             uid(),
      session_id:     exam.id,
      question_order: i + 1,
      question_text:  q.question,
      suggested_answer: q.suggested_answer || '',
      user_answer:    exam.answers[i] || '',
      year: q.year || '', law: q.law || '', subject: q.subject || '', topic: q.topic || '',
      ai_score: null, ai_verdict: null, ai_feedback: null
    }));
    exam.answerIds = answerRows.map(r => r.id);
    await saveExamSession({
      id: exam.id,
      law_filter:      exam.law    || null,
      subject_filter:  exam.subject || null,
      time_used:       exam.timeUsed,
      duration:        exam.duration,
      total_questions: exam.questions.length,
      answered_count:  exam.answers.filter(a => a.trim()).length
    }, answerRows);
  } catch (e) {
    console.warn('Could not save exam session:', e.message);
  }
}

// ── Results view ──────────────────────────────────────────────────────────────
function renderResults() {
  document.getElementById('res-time').textContent = fmtTime(exam.timeUsed);
  const answered = exam.answers.filter(a => a.trim()).length;
  document.getElementById('res-answered').textContent = `${answered} / ${exam.questions.length}`;

  document.getElementById('results-list').innerHTML = exam.questions.map((q, i) => `
    <div class="r-block">
      <div class="q-num">Question ${i + 1}
        ${q.year    ? `<span class="badge badge-blue">${esc(q.year)}</span>` : ''}
        ${q.subject ? `<span class="badge badge-purple">${esc(q.subject)}</span>` : ''}
        ${q.topic   ? `<span class="badge badge-gray">${esc(q.topic)}</span>` : ''}
      </div>
      <div class="q-text" style="margin-bottom:0">${esc(q.question)}</div>

      <div class="r-section">
        <div class="r-label r-label-user">Your Answer</div>
        <div class="r-text ${!exam.answers[i].trim() ? 'empty' : ''}">
          ${exam.answers[i].trim() ? esc(exam.answers[i]) : 'No answer provided'}
        </div>
      </div>

      <div class="r-section">
        <div class="r-label r-label-suggested">Suggested Answer (eCodalPro)</div>
        <div class="r-text ${!q.suggested_answer ? 'empty' : ''}">
          ${q.suggested_answer ? esc(q.suggested_answer) : 'No suggested answer saved'}
        </div>
      </div>

      <div class="r-section" id="ai-sec-${i}">
        <div class="r-label r-label-ai">AI Evaluation</div>
        <button class="btn btn-purple btn-sm" onclick="gradeOne(${i})" id="grade-btn-${i}">Grade with AI</button>
      </div>
    </div>
  `).join('');
}

// ── AI grading ────────────────────────────────────────────────────────────────
async function gradeOne(i) {
  const q = exam.questions[i];
  const btn = document.getElementById(`grade-btn-${i}`);
  const sec = document.getElementById(`ai-sec-${i}`);

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Grading…';

  try {
    const res = await fetch('/api/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: q.question,
        suggestedAnswer: q.suggested_answer || '',
        userAnswer: exam.answers[i] || '',
        model: aiModel
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const text = data.text;
    exam.aiResults[i] = text;
    sec.innerHTML = `
      <div class="r-label r-label-ai">AI Evaluation</div>
      <div class="r-ai-box">${esc(text)}</div>
      <button class="btn btn-sm btn-outline" style="margin-top:8px" onclick="gradeOne(${i})">Re-grade</button>
    `;

    // Persist AI result to saved answer row
    if (exam.answerIds[i]) {
      const scoreM   = text.match(/Score:\s*([\d.]+\/\d+)/i);
      const verdictM = text.match(/Verdict:\s*(\w+)/i);
      const feedbackM = text.match(/Feedback:\s*(.+)/is);
      supa('PATCH', 'exam_answers', {
        filter: `id=eq.${exam.answerIds[i]}`,
        body: {
          ai_score:    scoreM    ? scoreM[1]             : null,
          ai_verdict:  verdictM  ? verdictM[1]            : null,
          ai_feedback: feedbackM ? feedbackM[1].trim()    : null
        }
      }).catch(() => {});
    }
  } catch (err) {
    sec.innerHTML = `
      <div class="r-label r-label-ai">AI Evaluation</div>
      <div class="alert alert-error">Error: ${esc(err.message)}</div>
      <button class="btn btn-purple btn-sm" style="margin-top:6px" onclick="gradeOne(${i})">Retry</button>
    `;
  }
}

async function gradeAll() {
  for (let i = 0; i < exam.questions.length; i++) await gradeOne(i);
}

// ── History view ──────────────────────────────────────────────────────────────
function renderHistoryView(sessions) {
  const el = document.getElementById('history-list');
  if (!sessions.length) {
    el.innerHTML = '<p class="qlist-empty">No exam history yet.</p>';
    return;
  }
  el.innerHTML = sessions.map(s => {
    const label = [s.law_filter, s.subject_filter].filter(Boolean).join(' › ') || 'All Questions';
    return `
      <div class="hist-card">
        <div class="hist-header" onclick="toggleHistoryCard('${s.id}', this)">
          <div>
            <div class="hist-title">${esc(label)}</div>
            <div class="hist-meta">${fmtDate(s.created_at)} · Answered ${s.answered_count}/${s.total_questions} · ${fmtTime(s.time_used)}</div>
          </div>
          <span class="hist-chev">▼</span>
        </div>
        <div class="hist-body" id="hb-${s.id}" style="display:none" data-loaded="false"></div>
      </div>
    `;
  }).join('');
}

async function toggleHistoryCard(sessionId, headerEl) {
  const body = document.getElementById(`hb-${sessionId}`);
  const chev = headerEl.querySelector('.hist-chev');
  if (body.style.display === 'block') {
    body.style.display = 'none'; chev.textContent = '▼'; return;
  }
  body.style.display = 'block'; chev.textContent = '▲';
  if (body.dataset.loaded === 'true') return;
  body.innerHTML = '<div style="padding:16px;color:var(--muted);font-size:0.88rem">Loading…</div>';
  try {
    const answers = await loadSessionAnswers(sessionId);
    body.dataset.loaded = 'true';
    body.innerHTML = answers.map((a, i) => `
      <div class="hist-answer">
        <div class="q-num" style="font-size:0.75rem">Q${i+1}
          ${a.year    ? `<span class="badge badge-blue">${esc(a.year)}</span>` : ''}
          ${a.subject ? `<span class="badge badge-purple">${esc(a.subject)}</span>` : ''}
        </div>
        <div class="q-text" style="font-size:0.88rem;margin-bottom:10px">${esc(a.question_text)}</div>
        <div class="r-label r-label-user" style="font-size:0.72rem">Your Answer</div>
        <div class="r-text ${!a.user_answer ? 'empty' : ''}" style="font-size:0.86rem">${esc(a.user_answer) || 'No answer'}</div>
        <div class="r-label r-label-suggested" style="font-size:0.72rem;margin-top:10px">Suggested Answer</div>
        <div class="r-text ${!a.suggested_answer ? 'empty' : ''}" style="font-size:0.86rem">${esc(a.suggested_answer) || '—'}</div>
        ${a.ai_score ? `
        <div class="r-label r-label-ai" style="font-size:0.72rem;margin-top:10px">AI Result</div>
        <div class="r-ai-box" style="font-size:0.86rem">Score: ${esc(a.ai_score)} · ${esc(a.ai_verdict || '')}${a.ai_feedback ? '<br>' + esc(a.ai_feedback) : ''}</div>` : ''}
      </div>
    `).join('');
  } catch (e) {
    body.innerHTML = `<div class="alert alert-error" style="margin:12px">Error: ${esc(e.message)}</div>`;
  }
}

// ── Import / manage ───────────────────────────────────────────────────────────
function renderImport() {}

function renderQList() {
  const law  = sel('qlist-law');
  const subj = document.getElementById('qlist-subject').value.trim();
  const filtered = getFiltered(law, subj);
  document.getElementById('qlist-count').textContent = filtered.length;
  const el = document.getElementById('qlist');

  if (!filtered.length) {
    el.innerHTML = '<div class="qlist-empty">No questions yet.</div>';
    return;
  }
  el.innerHTML = filtered.map(q => `
    <div class="qlist-item">
      <div style="min-width:0;flex:1">
        <div class="qlist-text">${esc(q.question.substring(0, 90))}…</div>
        <div class="qlist-meta">${[q.year, q.law, q.subject].filter(Boolean).join(' · ')}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-outline btn-sm" onclick="editQ('${q.id}')">Edit</button>
        <button class="btn btn-danger-outline" onclick="deleteQ('${q.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

async function deleteQ(id) {
  if (!confirm('Delete this question?')) return;
  setLoading(true, 'Deleting…');
  try { await removeQuestion(id); renderQList(); renderHome(); }
  catch (e) { alert('Delete failed: ' + e.message); }
  finally { setLoading(false); }
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
}

// ── Paste tab ─────────────────────────────────────────────────────────────────
function doParse() {
  const raw = document.getElementById('paste-input').value.trim();
  if (!raw) return;
  parsedData = parseECodal(raw);
  const preview = document.getElementById('parse-preview');
  preview.className = 'parse-preview show';
  preview.innerHTML = `
    <strong>Parsed:</strong><br>
    Year: <strong>${esc(parsedData.year || '—')}</strong> &nbsp;
    Law: <strong>${esc(parsedData.law || '—')}</strong> &nbsp;
    Subject: <strong>${esc(parsedData.subject || '—')}</strong><br>
    Question preview: ${esc(parsedData.question.substring(0, 160))}…<br>
    Has suggested answer: ${parsedData.suggestedAnswer ? '✅ Yes' : '❌ No'}
  `;
}

async function savePaste() {
  const raw = document.getElementById('paste-input').value.trim();
  if (!raw) { alert('Nothing to save.'); return; }
  if (!parsedData) parsedData = parseECodal(raw);
  if (!parsedData.question.trim()) { alert('Could not detect question text.'); return; }

  const q = {
    id:               uid(),
    year:             parsedData.year,
    law:              sel('paste-law') || parsedData.law,
    subject:          document.getElementById('paste-subject').value.trim() || parsedData.subject,
    topic:            parsedData.topic,
    source:           parsedData.source,
    question:         parsedData.question,
    suggested_answer: parsedData.suggestedAnswer
  };

  setLoading(true, 'Saving…');
  try {
    await addQuestion(q);
    parsedData = null;
    document.getElementById('paste-input').value = '';
    document.getElementById('parse-preview').className = 'parse-preview';
    // paste-law and paste-subject kept intentionally — persists for batch import
    renderQList(); renderHome();
    const btn = document.querySelector('[onclick="savePaste()"]');
    const orig = btn.textContent;
    btn.textContent = '✓ Saved!';
    setTimeout(() => btn.textContent = orig, 1500);
  } catch (e) { alert('Save failed: ' + e.message); }
  finally { setLoading(false); }
}

// ── Manual tab ────────────────────────────────────────────────────────────────
async function saveManual() {
  const question = document.getElementById('m-question').value.trim();
  if (!question) { alert('Question text is required.'); return; }
  const q = {
    id: uid(),
    year:             document.getElementById('m-year').value.trim(),
    law:              sel('m-law'),
    subject:          document.getElementById('m-subject').value.trim(),
    topic:            document.getElementById('m-topic').value.trim(),
    source:           'eCodalPro',
    question,
    suggested_answer: document.getElementById('m-answer').value.trim()
  };
  setLoading(true, 'Saving…');
  try {
    await addQuestion(q);
    ['m-year','m-subject','m-topic','m-question','m-answer'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('m-law').value = '';
    renderQList(); renderHome();
    alert('Question saved!');
  } catch (e) { alert('Save failed: ' + e.message); }
  finally { setLoading(false); }
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function editQ(id) {
  const q = db.find(x => x.id === id);
  if (!q) return;
  document.getElementById('edit-id').value = id;
  document.getElementById('edit-year').value = q.year || '';
  document.getElementById('edit-law').value = q.law || '';
  document.getElementById('edit-subject').value = q.subject || '';
  document.getElementById('edit-topic').value = q.topic || '';
  document.getElementById('edit-question').value = q.question || '';
  document.getElementById('edit-answer').value = q.suggested_answer || '';
  document.getElementById('modal-edit').classList.add('open');
}

function closeEdit() { document.getElementById('modal-edit').classList.remove('open'); }

async function saveEdit() {
  const id = document.getElementById('edit-id').value;
  const updates = {
    year:             document.getElementById('edit-year').value.trim(),
    law:              document.getElementById('edit-law').value,
    subject:          document.getElementById('edit-subject').value.trim(),
    topic:            document.getElementById('edit-topic').value.trim(),
    question:         document.getElementById('edit-question').value.trim(),
    suggested_answer: document.getElementById('edit-answer').value.trim()
  };
  setLoading(true, 'Saving…');
  try { await updateQuestion(id, updates); closeEdit(); renderQList(); renderHome(); }
  catch (e) { alert('Update failed: ' + e.message); }
  finally { setLoading(false); }
}

// ── Export / Import ───────────────────────────────────────────────────────────
function exportData() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: 'qabar-questions.json' }).click();
  URL.revokeObjectURL(url);
}

function importFile(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!Array.isArray(data)) throw new Error('Expected a JSON array');
      const existing = new Set(db.map(q => q.id));
      const newOnes = data.filter(q => !existing.has(q.id)).map(normalizeQ);
      if (!newOnes.length) { alert('No new questions to import.'); return; }
      setLoading(true, `Importing ${newOnes.length} questions…`);
      for (const q of newOnes) await addQuestion(q);
      renderQList(); renderHome();
      alert(`Imported ${newOnes.length} questions.`);
    } catch (err) { alert('Import failed: ' + err.message); }
    finally { setLoading(false); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ── Parser ────────────────────────────────────────────────────────────────────
const LAW_MAP = {
  'Political': 'Political Law', 'Civil': 'Civil Law', 'Criminal': 'Criminal Law',
  'Commercial': 'Commercial Law', 'Labor': 'Labor Law', 'Remedial': 'Remedial Law',
  'Ethics': 'Legal Ethics', 'Taxation': 'Taxation Law'
};

function parseECodal(raw) {
  const text = raw.trim();
  const out = { year: '', law: '', subject: '', topic: '', source: '', question: '', suggestedAnswer: '' };

  const saIdx = text.search(/Suggested Answer/i);
  const beforeSA = saIdx >= 0 ? text.slice(0, saIdx).trim() : text;
  let afterSA    = saIdx >= 0 ? text.slice(saIdx + 16).trim() : '';

  const srcM = afterSA.match(/Source:\s*(\S+)\s*$/im);
  if (srcM) out.source = srcM[1];

  const srcLineIdx = afterSA.search(/\nSource:/i);
  let cleanAns = afterSA;
  if (srcLineIdx >= 0) {
    cleanAns = afterSA.slice(0, srcLineIdx).trim();
    const ansLines = cleanAns.split('\n').filter(l => l.trim());
    const last = ansLines[ansLines.length - 1] || '';
    if (last.includes(';') || (last.length < 120 && ansLines.length > 1)) {
      out.topic = last.trim();
      cleanAns = ansLines.slice(0, -1).join('\n').trim();
    }
  }
  out.suggestedAnswer = cleanAns;

  const lines = beforeSA.split('\n').map(l => l.trim()).filter(l => l);
  const firstLine = lines[0] || '';

  const yrM = firstLine.match(/\b(20\d\d)\b/);
  if (yrM) out.year = yrM[1];

  // Only scan line 0 — scanning line 1 causes false matches
  // e.g. "Criminal Procedure" subject would incorrectly match "Criminal Law"
  for (const [kw, full] of Object.entries(LAW_MAP)) {
    if (firstLine.includes(kw)) { out.law = full; break; }
  }

  let qStart = 0;
  if (/\b20\d\d\b/.test(lines[qStart] || '')) qStart++;

  const pointsLine = lines[qStart] || '';
  if (/\d+%/.test(pointsLine)) {
    const subjectPart = pointsLine.replace(/\s*\d+%.*/, '').replace(/[×x✕>▼]\s*/g, '').trim();
    if (subjectPart) {
      out.subject = subjectPart;
    }
    qStart++;
    if (!subjectPart) {
      const nextLine = lines[qStart] || '';
      if (nextLine && nextLine.length < 60 && !/[.?!]$/.test(nextLine) && !/^\d/.test(nextLine)) {
        out.subject = nextLine.trim();
        qStart++;
      }
    }
  }

  out.question = lines.slice(qStart).join('\n').trim();
  return out;
}

// ── Settings ──────────────────────────────────────────────────────────────────
function openSettings() {
  document.getElementById('s-model').value = aiModel;
  document.getElementById('modal-settings').classList.add('open');
}
function closeSettings() { document.getElementById('modal-settings').classList.remove('open'); }
function saveSettings() {
  aiModel = sel('s-model');
  localStorage.setItem('qabar_model', aiModel);
  closeSettings();
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  setLoading(true, 'Connecting to database…');
  try {
    await loadQuestions();
    setLoading(false);
    renderHome();
    showView('view-home');
  } catch (e) {
    document.getElementById('loading-overlay').innerHTML = `
      <div style="text-align:center;color:#fff;padding:32px;max-width:400px">
        <div style="font-size:2rem;margin-bottom:12px">⚠️</div>
        <div style="font-size:1.1rem;font-weight:700;margin-bottom:8px">Database connection failed</div>
        <div style="font-size:0.88rem;opacity:0.85;margin-bottom:12px">Check your config.js — make sure SUPABASE_URL and SUPABASE_ANON_KEY are filled in correctly.</div>
        <div style="font-size:0.78rem;opacity:0.6;font-family:monospace">${e.message}</div>
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
