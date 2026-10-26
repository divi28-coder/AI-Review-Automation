const $ = s => document.querySelector(s);
const api = '/api/v1';

let token = localStorage.getItem('reviewflow_token') || '';
let me = null;
let current = 'overview';
let cache = {};

const icons = {
    overview: '▦',
    students: '♙',
    schedules: '▣',
    reviews: '✳',
    imports: '⇧',
    tasks: '▤'
};

async function request(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };

    if (token) {
        headers.Authorization = 'Bearer ' + token;
    }

    if (opts.body && !(opts.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(api + path, {
        ...opts,
        headers
    });

    if (!res.ok) {
        let msg = 'Request failed (' + res.status + ')';

        try {
            const x = await res.json();
            msg = typeof x.detail === 'string' ? x.detail : msg;
        } catch {}

        throw Error(msg);
    }

    if (res.status === 204) return null;

    return res.json();
}

function toast(msg) {
    const n = document.createElement('div');

    n.className = 'toast';
    n.textContent = msg;

    document.body.append(n);

    setTimeout(() => n.remove(), 3600);
}

function esc(s) {
    return String(s ?? '—').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
}

function statusBadge(s) {
    let cl = '';

    if (/approved|published|completed|submitted/i.test(s || '')) {
        cl = 'green';
    } else if (/scheduled|draft|analysis/i.test(s || '')) {
        cl = 'blue';
    } else if (/pending|awaiting|not submitted|changes requested/i.test(s || '')) {
        cl = 'orange';
    } else if (/failed|reject|error/i.test(s || '')) {
        cl = 'red';
    }

    return `<span class="status ${cl}">${esc(s || 'Unknown')}</span>`;
}

/* =========================
   LOGIN
========================= */

function loginView() {
    $('#app').innerHTML = `
        <div class="login-shell">
            <section class="login-art">
                <div class="brand">
                    <span class="brand-mark">R</span> ReviewFlow
                </div>

                <h1>Better reviews.<br>Clearer progress.</h1>

                <p>
                    One workspace for internship projects, submissions,
                    reviewer approvals, and student progress — with
                    responsible AI assistance built into the workflow.
                </p>

                <div class="art-pills">
                    <span class="pill">Role-based access</span>
                    <span class="pill">Workbook imports</span>
                    <span class="pill">Human approval</span>
                </div>
            </section>

            <section class="login-panel">
                <form class="login-card" id="login-form">
                    <div class="eyebrow">Welcome back</div>

                    <h2>Sign in to ReviewFlow</h2>

                    <p class="muted">
                        Use your assigned account to continue.
                    </p>

                    <div id="login-error"></div>

                    <div class="field">
                        <label for="email">Email address</label>
                        <input
                            id="email"
                            type="email"
                            required
                            autocomplete="username"
                            placeholder="you@company.com"
                        >
                    </div>

                    <div class="field">
                        <label for="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            required
                            autocomplete="current-password"
                            placeholder="Enter your password"
                        >
                    </div>

                    <button class="btn btn-primary full" type="submit">
                        Sign in securely →
                    </button>

                    <div class="demo-box">
                        <strong>Local demo accounts</strong><br>
                        Admin: admin@demo.local / AdminDemo123!<br>
                        Reviewer: reviewer@demo.local / ReviewerDemo123!<br>
                        Student: use any workbook student email /
                        StudentDemo123!<br>

                        <span class="muted">
                            Demo credentials are for local testing only.
                            Change before production use.
                        </span>
                    </div>
                </form>
            </section>
        </div>
    `;

    $('#login-form').addEventListener('submit', async e => {
        e.preventDefault();

        const btn = e.submitter;

        btn.disabled = true;
        btn.textContent = 'Signing in…';

        $('#login-error').innerHTML = '';

        try {
            const d = await request('/auth/login', {
                method: 'POST',
                body: JSON.stringify({
                    email: $('#email').value,
                    password: $('#password').value
                })
            });

            token = d.access_token;

            localStorage.setItem('reviewflow_token', token);

            me = d.user;

            renderShell();
        } catch (err) {
            $('#login-error').innerHTML = `
                <div class="alert error">
                    ${esc(err.message)}
                </div>
            `;
        } finally {
            btn.disabled = false;
            btn.textContent = 'Sign in securely →';
        }
    });
}

/* =========================
   MAIN APPLICATION LAYOUT
========================= */

function renderShell() {
    const student = me.role === 'student';

    const nav = student
        ? [
            ['overview', 'My dashboard'],
            ['tasks', 'My project'],
            ['schedules', 'Review schedule'],
            ['reviews', 'My feedback']
        ]
        : [
            ['overview', 'Overview'],
            ['students', 'Students'],
            ['schedules', 'Review schedule'],
            ['reviews', 'Review workspace'],
            ...(me.role === 'admin'
                ? [
                    ['imports', 'Workbook import'],
                    ['tasks', 'Task library']
                ]
                : [])
        ];

    $('#app').innerHTML = `
        <div class="app-shell">
            <aside class="sidebar" id="sidebar">
                <div class="brand">
                    <span class="brand-mark">R</span> ReviewFlow
                </div>

                <div>
                    <div class="nav-label">Workspace</div>

                    <nav class="nav">
                        ${nav.map(([id, label]) => `
                            <button
                                data-page="${id}"
                                class="${current === id ? 'active' : ''}"
                            >
                                <span>${icons[id] || '•'}</span>
                                ${label}
                            </button>
                        `).join('')}
                    </nav>
                </div>

                <div class="sidebar-bottom">
                    ${DEMO_LABEL()}
                    <br><br>
                    AI Review Automation v1.0
                </div>
            </aside>

            <main class="main">
                <header class="topbar">
                    <div style="display:flex;align-items:center;gap:12px">
                        <button
                            class="btn btn-secondary menu-toggle"
                            id="menu-toggle"
                        >☰</button>

                        <h2 id="top-title">
                            ${nav.find(x => x[0] === current)?.[1] || 'Overview'}
                        </h2>
                    </div>

                    <div class="user-chip">
                        <div class="avatar">
                            ${esc((me.display_name || me.email).slice(0, 1).toUpperCase())}
                        </div>

                        <span class="user-name">
                            ${esc(me.display_name || me.email)}
                            · ${esc(me.role)}
                        </span>

                        <button class="btn btn-secondary" id="logout">
                            Sign out
                        </button>
                    </div>
                </header>

                <section class="content" id="page-content">
                    <div class="loading">
                        Loading your workspace…
                    </div>
                </section>
            </main>
        </div>
    `;

    document.querySelectorAll('[data-page]').forEach(b => {
        b.onclick = () => go(b.dataset.page);
    });

    $('#logout').onclick = () => {
        token = '';
        me = null;

        localStorage.removeItem('reviewflow_token');

        loginView();
    };

    $('#menu-toggle').onclick = () => {
        $('#sidebar').classList.toggle('open');
    };

    go(current);
}

function DEMO_LABEL() {
    return `
        <span class="status orange">DEMO MODE</span>
        <p>
            Sample workbook records are included.
            Live AI analysis requires an enabled provider integration.
        </p>
    `;
}

/* =========================
   PAGE NAVIGATION
========================= */

async function go(page) {
    current = page;

    document.querySelectorAll('[data-page]').forEach(b => {
        b.classList.toggle('active', b.dataset.page === page);
    });

    const nav = document.querySelector(`[data-page="${page}"]`);

    if (nav) {
        $('#top-title').textContent = nav.textContent.trim();
    }

    $('#sidebar')?.classList.remove('open');

    $('#page-content').innerHTML = `
        <div class="loading">Loading…</div>
    `;

    try {
        if (me.role === 'student') {
            if (page === 'overview') await studentHome();
            else if (page === 'tasks') await studentProject();
            else if (page === 'schedules') await schedulePage();
            else if (page === 'reviews') await reviewPage();
        } else {
            if (page === 'overview') await adminHome();
            else if (page === 'students') await studentList();
            else if (page === 'schedules') await schedulePage();
            else if (page === 'reviews') await reviewPage();
            else if (page === 'imports') importPage();
            else if (page === 'tasks') await taskPage();
        }
    } catch (e) {
        $('#page-content').innerHTML = `
            <div class="alert error">${esc(e.message)}</div>

            <button
                class="btn btn-secondary"
                onclick="go('${page}')"
            >
                Try again
            </button>
        `;
    }
}

function heading(title, sub, action = '') {
    return `
        <div class="page-heading">
            <div>
                <div class="eyebrow">
                    ${me.role === 'student'
                        ? 'Student workspace'
                        : 'Placement operations'}
                </div>

                <h1>${title}</h1>
                <p>${sub}</p>
            </div>

            ${action}
        </div>
    `;
}

function metric(label, value, icon, note = 'From current records') {
    return `
        <article class="metric">
            <div class="metric-top">
                <span>${label}</span>
                <span class="metric-icon">${icon}</span>
            </div>

            <strong>${value}</strong>
            <small>${note}</small>
        </article>
    `;
}

/* =========================
   ADMIN DASHBOARD
========================= */

async function adminHome() {
    const d = await request('/dashboard/admin');
    const m = d.metrics;

    $('#page-content').innerHTML =
        heading(
            'Good day, ' + esc(me.display_name.split(' ')[0]),
            'Here’s the current picture of your internship review program.',
            me.role === 'admin'
                ? '<button class="btn btn-primary" onclick="go(\'imports\')">＋ Import workbook</button>'
                : ''
        ) +
        `
            <div class="metrics">
                ${metric('Total students', m.students, '♙')}
                ${metric('Projects assigned', m.assigned_projects, '▤')}
                ${metric('Submissions received', m.submissions_received, '↗')}
                ${metric('Awaiting approval', m.reviews_awaiting_approval, '✓')}
                ${metric('Submissions pending', m.submissions_pending, '◷')}
                ${metric('Approved reviews', m.reviews_approved, '✳')}
                ${metric('Upcoming meetings', m.upcoming_meetings, '▣')}
                ${metric('Active students', m.active_students, '⌁')}
            </div>

            <div class="grid-two">
                <section class="panel">
                    <div class="panel-head">
                        <h3>Recently added students</h3>

                        <button
                            class="btn btn-secondary"
                            onclick="go('students')"
                        >
                            View students
                        </button>
                    </div>

                    ${studentTable(d.recent_students || [])}
                </section>

                <section class="panel">
                    <div class="panel-head">
                        <h3>Integration readiness</h3>
                    </div>

                    <div class="alert">
                        AI reviews require a configured provider and a
                        working API key. Reviewers must check and approve
                        generated feedback before publication.
                    </div>

                    <dl class="detail-list">
                        <dt>Workbook data</dt>
                        <dd>${m.students} student records available</dd>

                        <dt>Repository analysis</dt>
                        <dd>Reviewers can initiate analysis from the Review workspace.</dd>

                        <dt>Email</dt>
                        <dd>SMTP delivery depends on server configuration.</dd>

                        <dt>Database</dt>
                        <dd>SQLite local database</dd>
                    </dl>
                </section>
            </div>
        `;
}

function studentTable(rows) {
    if (!rows.length) {
        return '<div class="empty">No student records found.</div>';
    }

    return `
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>Student</th>
                        <th>Internship</th>
                        <th>Task</th>
                        <th>Submission</th>
                    </tr>
                </thead>

                <tbody>
                    ${rows.map(r => `
                        <tr>
                            <td>
                                <strong>${esc(r.name)}</strong><br>
                                <small class="muted">${esc(r.student_id)}</small>
                            </td>

                            <td>${esc(r.internship)}</td>
                            <td>${esc(r.task)}</td>
                            <td>${statusBadge(r.submission_status)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

/* =========================
   STUDENT MANAGEMENT
========================= */

async function studentList() {
    const d = await request('/students');

    cache.students = d.items;

    $('#page-content').innerHTML =
        heading(
            'Students',
            'Search student records, assignments, and submission status.'
        ) +
        `
            <section class="panel">
                <div class="toolbar">
                    <input
                        id="student-search"
                        placeholder="Search name, ID, or email…"
                    >

                    <select id="student-status">
                        <option value="">All submission statuses</option>
                        <option>Not Submitted</option>
                        <option>Submitted</option>
                        <option>Completed</option>
                    </select>

                    <button class="btn btn-secondary" id="student-search-btn">
                        Search
                    </button>
                </div>

                <div id="students-table">
                    ${studentTableFull(d.items)}
                </div>
            </section>
        `;

    $('#student-search-btn').onclick = async () => {
        try {
            const q = encodeURIComponent($('#student-search').value);
            const s = encodeURIComponent($('#student-status').value);

            const x = await request('/students?q=' + q + '&status=' + s);

            $('#students-table').innerHTML = studentTableFull(x.items);
        } catch (e) {
            toast(e.message);
        }
    };
}

function studentTableFull(rows) {
    if (!rows.length) {
        return '<div class="empty">No students match your filters.</div>';
    }

    return `
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>Student</th>
                        <th>Email</th>
                        <th>Internship</th>
                        <th>Task</th>
                        <th>Repository</th>
                        <th>Status</th>
                    </tr>
                </thead>

                <tbody>
                    ${rows.map(r => `
                        <tr>
                            <td>
                                <strong>${esc(r.name)}</strong><br>
                                <small class="muted">${esc(r.student_id)}</small>
                            </td>

                            <td>${esc(r.email)}</td>
                            <td>${esc(r.internship)}</td>
                            <td>${esc(r.task)}</td>

                            <td>
                                ${r.repository_url
                                    ? `<a class="link"
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          href="${esc(r.repository_url)}">
                                          Open repo ↗
                                       </a>`
                                    : '—'}
                            </td>

                            <td>${statusBadge(r.submission_status)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

/* =========================
   FIX: MEETING CARD FUNCTION
========================= */

function meetingCard(r) {
    if (!r) {
        return `
            <div class="empty">
                No meeting details available.
            </div>
        `;
    }

    const reviewNumber = esc(r.review_number ?? '');
    const date = esc(r.review_date || 'Date not provided');
    const time = esc(r.review_time || 'Time not provided');

    const meetingLink =
        r.meeting_link && /^https?:\/\//i.test(r.meeting_link)
            ? `
                <a
                    class="btn btn-secondary"
                    href="${esc(r.meeting_link)}"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Join meeting ↗
                </a>
              `
            : '';

    return `
        <article class="meeting">
            <div class="eyebrow">
                Review ${reviewNumber}
            </div>

            <h3>${date}</h3>

            <p>${time}</p>

            <p>${statusBadge(r.status || 'Scheduled')}</p>

            ${meetingLink}
        </article>
    `;
}

/* =========================
   STUDENT DASHBOARD
========================= */

async function studentHome() {
    const d = await request('/dashboard/student');
    const s = d.student;

    $('#page-content').innerHTML =
        heading(
            'Your project dashboard',
            'Track your assignment, repository submission, and review meetings.'
        ) +
        `
            <div class="metrics">
                ${metric('Internship', esc(s.internship || 'Not assigned'), '⌁', 'Assigned program')}
                ${metric('Submission', esc(s.submission_status), '↗', 'Current status')}
                ${metric('Review meetings', d.schedules.length, '▣', 'Imported schedule')}
                ${metric('Feedback', d.feedback ? 'Available' : 'Not published', '✳', 'Only approved feedback appears here')}
            </div>

            <div class="grid-two">
                <section class="panel">
                    <div class="panel-head">
                        <h3>Your assigned project</h3>

                        <button
                            class="btn btn-secondary"
                            onclick="go('tasks')"
                        >
                            View brief
                        </button>
                    </div>

                    <h2>${esc(s.task || 'Task not assigned')}</h2>
                    <p class="muted">${esc(s.internship)}</p>

                    <dl class="detail-list">
                        <dt>Student ID</dt>
                        <dd>${esc(s.student_id)}</dd>

                        <dt>Repository</dt>
                        <dd>
                            ${s.repository_url
                                ? `<a class="link"
                                      href="${esc(s.repository_url)}"
                                      target="_blank"
                                      rel="noopener noreferrer">
                                      ${esc(s.repository_url)}
                                   </a>`
                                : 'Not submitted'}
                        </dd>

                        <dt>Project progress</dt>
                        <dd>${statusBadge(s.submission_status)}</dd>
                    </dl>
                </section>

                <section class="panel">
                    <div class="panel-head">
                        <h3>Next review</h3>
                    </div>

                    ${
                        d.schedules.length
                            ? meetingCard(d.schedules[0])
                            : '<div class="empty">No review schedule provided.</div>'
                    }

                    <button
                        class="btn btn-secondary"
                        onclick="go('schedules')"
                    >
                        All review meetings
                    </button>
                </section>
            </div>

            <section class="panel">
                <div class="panel-head">
                    <h3>Repository submission</h3>
                </div>

                <form id="submit-repo" class="form-inline">
                    <input
                        id="repo-url"
                        type="url"
                        placeholder="https://github.com/owner/repository"
                        value="${esc(s.repository_url || '')}"
                        required
                    >

                    <button class="btn btn-primary">
                        Save repository
                    </button>
                </form>

                <p class="footer-note">
                    Saving a URL validates its format only. It does not
                    mean the repository was accessed or analyzed.
                </p>

                <div id="submission-message"></div>
            </section>
        `;

    $('#submit-repo').onsubmit = async e => {
        e.preventDefault();

        const b = e.submitter;
        b.disabled = true;

        try {
            const r = await request('/submissions', {
                method: 'POST',
                body: JSON.stringify({
                    repository_url: $('#repo-url').value
                })
            });

            $('#submission-message').innerHTML = `
                <div class="alert success">
                    ${esc(r.message)}
                </div>
            `;

            toast('Repository URL saved');
        } catch (err) {
            $('#submission-message').innerHTML = `
                <div class="alert error">
                    ${esc(err.message)}
                </div>
            `;
        } finally {
            b.disabled = false;
        }
    };
}

/* =========================
   STUDENT PROJECT BRIEF
========================= */

async function studentProject() {
    const d = await request('/students/' + encodeURIComponent(me.student_id));
    const t = d.task_brief || {};
    const isPetrolPriceProject = (d.task || '').trim().toLowerCase() === 'petrol price prediction';
    const suggestedBrief = isPetrolPriceProject
        ? {
            abstract: 'Explore historical petrol prices and related factors to build and evaluate a model that estimates petrol prices. Treat this as project guidance, not an official specification.',
            problem_statement: 'Design a data-driven approach to estimate petrol prices from historical observations. Document the location and period covered, data sources, assumptions, and factors used. The workbook does not specify a required dataset, forecast period, or accuracy target.',
            working_flow: '1. Gather and cite suitable historical price data. 2. Check and clean dates, missing values, units, and duplicates. 3. Explore price trends and relevant features. 4. Create a chronological train/test split to avoid using future data during training. 5. Compare a simple baseline with one or more regression models. 6. Evaluate with appropriate metrics such as MAE and RMSE, plot predictions against actual values, and document limitations.',
            technologies: 'Python, pandas, NumPy, scikit-learn, and Matplotlib or Seaborn. These are suggestions; use alternatives if appropriate.',
            tools: 'Jupyter Notebook or VS Code, CSV files for data, and Git for version control. Cite each dataset and confirm its usage terms.',
            deliverables: 'A documented dataset/source; a reproducible notebook or Python scripts; model evaluation with metrics and visualizations; a README explaining setup, methodology, results, and limitations; and a concise final summary.',
        }
        : {};
    const briefValue = (field) => {
        if (t[field]) return t[field];
        return suggestedBrief[field] || 'Not specified in the workbook.';
    };
    const hasSuggestedDetails = Object.keys(suggestedBrief).some((field) => !t[field]);

    $('#page-content').innerHTML =
        heading(
            'My project brief',
            'Your assignment details and project guidance.'
        ) +
        `
            <section class="panel">
                <div class="eyebrow">${esc(d.internship)}</div>

                <h2>${esc(d.task || 'Task not assigned')}</h2>

                <p>
                    ${esc(briefValue('abstract'))}
                </p>

                <dl class="detail-list">
                    <dt>Problem statement</dt>
                    <dd>${esc(briefValue('problem_statement'))}</dd>

                    <dt>Working flow</dt>
                    <dd>${esc(briefValue('working_flow'))}</dd>

                    <dt>Suggested technologies</dt>
                    <dd>${esc(briefValue('technologies'))}</dd>

                    <dt>Suggested tools</dt>
                    <dd>${esc(briefValue('tools'))}</dd>

                    <dt>Expected deliverables</dt>
                    <dd>${esc(briefValue('deliverables'))}</dd>

                    <dt>Deadline</dt>
                    <dd>${esc(t.deadline || 'Not specified in the workbook.')}</dd>
                </dl>

                <div class="footer-note">
                    ${
                        hasSuggestedDetails
                            ? 'Some workbook fields were blank, so suggested project guidance is shown for Petrol Price Prediction. Confirm official requirements and deadlines with your reviewer.'
                            : 'Official task requirements are shown as supplied in the workbook.'
                    }
                </div>
            </section>
        `;
}

/* =========================
   REVIEW SCHEDULE
========================= */

async function schedulePage() {
    const rows = await request('/schedules');

    $('#page-content').innerHTML =
        heading(
            me.role === 'student' ? 'My review schedule' : 'Review schedule',
            'Meetings and dates imported from the source workbook.'
        ) +
        `
            <section class="panel">
                <div class="panel-head">
                    <h3>
                        ${rows.length}
                        scheduled review${rows.length === 1 ? '' : 's'}
                    </h3>

                    <span class="status blue">
                        Timezone: Asia/Kolkata*
                    </span>
                </div>

                ${
                    rows.length
                        ? `
                            <div class="table-wrap">
                                <table>
                                    <thead>
                                        <tr>
                                            ${me.role === 'student' ? '' : '<th>Student</th>'}
                                            <th>Review</th>
                                            <th>Date</th>
                                            <th>Time</th>
                                            <th>Meeting link</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        ${rows.map(r => `
                                            <tr>
                                                ${
                                                    me.role === 'student'
                                                        ? ''
                                                        : `
                                                            <td>
                                                                ${esc(r.student_name)}<br>
                                                                <small class="muted">
                                                                    ${esc(r.student_id)}
                                                                </small>
                                                            </td>
                                                        `
                                                }

                                                <td>Review ${esc(r.review_number)}</td>
                                                <td>${esc(r.review_date)}</td>
                                                <td>${esc(r.review_time || 'Not provided')}</td>

                                                <td>
                                                    ${
                                                        r.meeting_link &&
                                                        /^https?:\/\//i.test(r.meeting_link)
                                                            ? `
                                                                <a
                                                                    class="link"
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    href="${esc(r.meeting_link)}"
                                                                >
                                                                    Join meeting ↗
                                                                </a>
                                                              `
                                                            : 'Not provided'
                                                    }
                                                </td>

                                                <td>${statusBadge(r.status)}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                          `
                        : `
                            <div class="empty">
                                No review schedule was found in the workbook.
                            </div>
                          `
                }

                <p class="footer-note">
                    *The workbook uses IST in its time strings. A timezone
                    is shown only as the configured app default; verify
                    schedule details before production use.
                </p>
            </section>
        `;
}

/* =========================
   REVIEW WORKSPACE
========================= */

async function reviewPage() {
    const rows = await request('/reviews');

    $('#page-content').innerHTML =
        heading(
            me.role === 'student'
                ? 'My published feedback'
                : 'Review workspace',
            me.role === 'student'
                ? 'Only approved feedback is visible here.'
                : 'Generate AI feedback, then review and approve it before publication.'
        ) +
        `
            <section class="panel">
                <div class="panel-head">
                    <h3>
                        ${rows.length}
                        review record${rows.length === 1 ? '' : 's'}
                    </h3>
                </div>

                ${
                    rows.length
                        ? rows.map(r => `
                            <article class="meeting">
                                <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
                                    <strong>
                                        ${esc(r.student_name || 'My review')}
                                        · ${esc(r.student_id)}
                                    </strong>

                                    ${statusBadge(r.status)}
                                </div>

                                <div class="muted">
                                    Updated ${esc((r.updated_at || '').slice(0, 10))}
                                    · Repository:
                                    ${
                                        r.repository_url
                                            ? `<a
                                                  class="link"
                                                  href="${esc(r.repository_url)}"
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                              >
                                                  Open ↗
                                               </a>`
                                            : 'Not submitted'
                                    }
                                </div>

                                ${r.published ? renderFeedback(r.published) : ''}

                                ${
                                    r.draft
                                        ? `
                                            <div class="alert">
                                                Draft feedback is internal until approved.
                                            </div>

                                            ${renderFeedback(r.draft)}

                                            ${
                                                me.role !== 'student'
                                                    ? `
                                                        <button
                                                            class="btn btn-primary"
                                                            onclick="approve(${r.id})"
                                                        >
                                                            Approve and publish
                                                        </button>

                                                        <button
                                                            class="btn btn-secondary"
                                                            onclick="requestChanges(${r.id})"
                                                        >
                                                            Request changes
                                                        </button>
                                                      `
                                                    : ''
                                            }
                                          `
                                        : ''
                                }

                                ${
                                    me.role !== 'student' && r.repository_url
                                        ? `
                                            <div style="margin-top:12px">
                                                <button
                                                    class="btn btn-primary"
                                                    onclick="analyzeReview(${r.id})"
                                                >
                                                    Generate AI Review
                                                </button>
                                            </div>
                                          `
                                        : ''
                                }
                            </article>
                          `).join('')
                        : `
                            <div class="empty">
                                No review records yet. Submit a repository,
                                then an authorized reviewer can generate feedback.
                            </div>
                          `
                }
            </section>

            ${
                me.role === 'student'
                    ? `
                        <div class="footer-note">
                            Only reviewer-approved feedback is visible here.
                        </div>
                      `
                    : `
                        <div class="footer-note">
                            AI reviews require a working OpenAI API key and
                            access to the submitted GitHub repository.
                            Always check the generated draft before approving it.
                        </div>
                      `
            }
        `;
}

function renderFeedback(f) {
    if (!f) return '';

    const list = (label, items) =>
        Array.isArray(items) && items.length
            ? `
                <h4>${esc(label)}</h4>
                <ul>
                    ${items.map(x => `<li>${esc(x)}</li>`).join('')}
                </ul>
              `
            : '';

    return `
        <section class="feedback-body" style="margin-top:14px">
            <h3>
                AI project feedback
                ${
                    Number.isInteger(f.score)
                        ? ` · Score: ${esc(f.score)}/100`
                        : ''
                }
            </h3>

            ${f.summary ? `<p>${esc(f.summary)}</p>` : ''}

            ${
                f.overall_assessment
                    ? `
                        <p>
                            <strong>Overall assessment:</strong>
                            ${esc(f.overall_assessment)}
                        </p>
                      `
                    : ''
            }

            ${list('Strengths', f.strengths)}
            ${list('Areas to improve', f.improvements)}
            ${list('Recommended next steps', f.recommendations)}
            ${list('Files reviewed', f.files_reviewed)}
            ${list('Limitations', f.limitations)}
        </section>
    `;
}

/* =========================
   GENERATE AI REVIEW
========================= */

async function analyzeReview(id) {
    const buttons = [...document.querySelectorAll('button')]
        .filter(b => b.getAttribute('onclick') === `analyzeReview(${id})`);

    buttons.forEach(b => {
        b.disabled = true;
        b.textContent = 'Analyzing repository…';
    });

    try {
        const result = await request('/reviews/' + id + '/analyze', {
            method: 'POST'
        });

        toast(result.message || 'AI review generated');

        await reviewPage();
    } catch (e) {
        toast(e.message);

        buttons.forEach(b => {
            b.disabled = false;
            b.textContent = 'Generate AI Review';
        });
    }
}

/* =========================
   APPROVE OR REQUEST CHANGES
========================= */

async function approve(id) {
    if (!confirm('Approve this draft and make it visible to the student?')) {
        return;
    }

    try {
        const result = await request('/reviews/' + id + '/approve', {
            method: 'POST'
        });

        toast(result.message || 'Feedback approved and published');

        go('reviews');
    } catch (e) {
        toast(e.message);
    }
}

async function requestChanges(id) {
    const reason = prompt('Reason for requesting changes:');

    if (!reason) return;

    try {
        await request('/reviews/' + id + '/request-changes', {
            method: 'POST',
            body: JSON.stringify({ reason })
        });

        toast('Changes requested');

        go('reviews');
    } catch (e) {
        toast(e.message);
    }
}

/* =========================
   WORKBOOK IMPORT
========================= */

function importPage() {
    $('#page-content').innerHTML =
        heading(
            'Workbook import',
            'Validate and preview the workbook before committing records.'
        ) +
        `
            <section class="panel">
                <h3>Upload Excel workbook</h3>

                <p class="muted">
                    Supported formats: .xlsx and .xlsm · Maximum size: 10 MB.
                    Re-imports update existing student IDs instead of duplicating them.
                </p>

                <div class="field">
                    <label for="workbook">Choose workbook</label>

                    <input
                        type="file"
                        id="workbook"
                        accept=".xlsx,.xlsm"
                    >
                </div>

                <div class="form-inline">
                    <button
                        class="btn btn-secondary"
                        id="validate-import"
                    >
                        Validate and preview
                    </button>

                    <button
                        class="btn btn-primary"
                        id="confirm-import"
                        disabled
                    >
                        Confirm import
                    </button>
                </div>

                <div id="import-result"></div>
            </section>

            <section class="panel">
                <div class="panel-head">
                    <h3>Import history</h3>

                    <button
                        class="btn btn-secondary"
                        id="refresh-history"
                    >
                        Refresh
                    </button>
                </div>

                <div id="import-history" class="empty">
                    Load import history to view previous imports.
                </div>
            </section>
        `;

    let validated = false;

    $('#validate-import').onclick = async () => {
        const f = $('#workbook').files[0];

        if (!f) {
            toast('Choose a workbook first.');
            return;
        }

        const fd = new FormData();
        fd.append('file', f);

        $('#import-result').innerHTML = `
            <div class="muted">Validating workbook…</div>
        `;

        try {
            const r = await request('/imports/validate', {
                method: 'POST',
                body: fd
            });

            validated = true;

            $('#confirm-import').disabled = false;

            $('#import-result').innerHTML = `
                <div class="alert ${r.error_count ? 'error' : 'success'}">
                    <strong>Validation preview</strong><br>

                    Sheets: ${r.worksheets.map(esc).join(', ')}<br>

                    Rows seen: ${r.rows_seen}
                    · New records: ${r.created}
                    · Existing records to update: ${r.updated}<br>

                    Task library records: ${r.tasks_imported}
                    · Review schedule rows: ${r.schedules_imported}<br>

                    Row errors: ${r.error_count}
                </div>

                ${
                    r.errors.length
                        ? `
                            <div class="table-wrap">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Worksheet</th>
                                            <th>Row</th>
                                            <th>Student ID</th>
                                            <th>Issue</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        ${r.errors.map(e => `
                                            <tr>
                                                <td>${esc(e.worksheet)}</td>
                                                <td>${esc(e.row)}</td>
                                                <td>${esc(e.student_id)}</td>
                                                <td>${esc(e.field)}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                          `
                        : ''
                }

                <p class="footer-note">
                    This preview is not committed. Confirm import to save
                    valid records; invalid rows are reported and skipped.
                </p>
            `;
        } catch (e) {
            validated = false;

            $('#confirm-import').disabled = true;

            $('#import-result').innerHTML = `
                <div class="alert error">${esc(e.message)}</div>
            `;
        }
    };

    $('#confirm-import').onclick = async () => {
        if (!validated) return;

        const f = $('#workbook').files[0];

        if (!f) return;

        if (!confirm(
            'Import the validated workbook? Existing records with matching Student_ID values may be updated.'
        )) {
            return;
        }

        const fd = new FormData();
        fd.append('file', f);

        try {
            const r = await request('/imports/confirm', {
                method: 'POST',
                body: fd
            });

            toast(`Import complete: ${r.created} new, ${r.updated} updated`);

            $('#import-result').insertAdjacentHTML(
                'afterbegin',
                `
                    <div class="alert success">
                        Import complete.
                        ${r.created} created,
                        ${r.updated} updated,
                        ${r.error_count} row errors.
                    </div>
                `
            );

            validated = false;
            $('#confirm-import').disabled = true;

            loadHistory();
        } catch (e) {
            $('#import-result').insertAdjacentHTML(
                'afterbegin',
                `
                    <div class="alert error">
                        ${esc(e.message)}
                    </div>
                `
            );
        }
    };

    $('#refresh-history').onclick = loadHistory;

    loadHistory();
}

/* =========================
   IMPORT HISTORY
========================= */

async function loadHistory() {
    try {
        const rows = await request('/imports/history');

        $('#import-history').innerHTML = rows.length
            ? `
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>File</th>
                                <th>Imported at</th>
                                <th>Rows</th>
                                <th>Created</th>
                                <th>Updated</th>
                                <th>Errors</th>
                            </tr>
                        </thead>

                        <tbody>
                            ${rows.map(r => `
                                <tr>
                                    <td>${esc(r.filename)}</td>

                                    <td>
                                        ${esc(
                                            (r.imported_at || '')
                                                .slice(0, 19)
                                                .replace('T', ' ')
                                        )}
                                    </td>

                                    <td>${esc(r.rows_seen)}</td>
                                    <td>${esc(r.created_count)}</td>
                                    <td>${esc(r.updated_count)}</td>

                                    <td>
                                        ${esc(
                                            JSON.parse(r.errors_json || '[]').length
                                        )}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
              `
            : '<div class="empty">No imports recorded yet.</div>';
    } catch (e) {
        $('#import-history').textContent = e.message;
    }
}

/* =========================
   TASK LIBRARY
========================= */

async function taskPage() {
    const rows = await request('/tasks');

    $('#page-content').innerHTML =
        heading(
            'Task library',
            'Project briefs imported from the Task_Brief worksheet.'
        ) +
        `
            <section class="panel">
                <div class="toolbar">
                    <input
                        id="task-search"
                        placeholder="Search internship or task…"
                    >
                </div>

                <div id="task-table">
                    ${taskRows(rows)}
                </div>
            </section>
        `;

    $('#task-search').oninput = () => {
        const q = $('#task-search').value.toLowerCase();

        $('#task-table').innerHTML = taskRows(
            rows.filter(r =>
                (r.internship + ' ' + r.task_name)
                    .toLowerCase()
                    .includes(q)
            )
        );
    };
}

function taskRows(rows) {
    if (!rows.length) {
        return '<div class="empty">No tasks found.</div>';
    }

    return `
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>Internship</th>
                        <th>Task</th>
                        <th>Deliverables</th>
                        <th>Technologies</th>
                    </tr>
                </thead>

                <tbody>
                    ${rows.map(r => `
                        <tr>
                            <td>${esc(r.internship)}</td>

                            <td>
                                <strong>${esc(r.task_name)}</strong><br>
                                <small class="muted">
                                    ${esc(r.problem_statement)}
                                </small>
                            </td>

                            <td>${esc(r.deliverables)}</td>
                            <td>${esc(r.technologies)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

/* =========================
   APPLICATION INITIALIZATION
========================= */

(async () => {
    if (!token) {
        return loginView();
    }

    try {
        me = await request('/auth/me');

        current = 'overview';

        renderShell();
    } catch {
        token = '';

        localStorage.removeItem('reviewflow_token');

        loginView();
    }
})();