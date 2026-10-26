import os, tempfile, importlib.util, importlib, json, smtplib
from datetime import date, timedelta
from pathlib import Path
from fastapi.testclient import TestClient

# Isolate the database before importing the app module.
_tmp = tempfile.TemporaryDirectory()
os.environ['DATABASE_PATH'] = str(Path(_tmp.name) / 'test.db')
os.environ['APP_SECRET'] = 'test-secret-for-automated-tests-only'
os.environ['DEMO_MODE'] = 'true'
from backend.app.main import app, hash_password, verify_password
app_module = importlib.import_module('backend.app.main')
client = TestClient(app)

def login(email='admin@demo.local', password='AdminDemo123!'):
    r=client.post('/api/v1/auth/login',json={'email':email,'password':password})
    assert r.status_code==200, r.text
    return {'Authorization':'Bearer '+r.json()['access_token']}

def test_health_and_login():
    assert client.get('/api/v1/health').status_code==200
    h=login()
    assert client.get('/api/v1/auth/me',headers=h).json()['role']=='admin'

def test_password_hashing():
    value=hash_password('a-strong-password')
    assert value!='a-strong-password' and verify_password('a-strong-password',value)
    assert not verify_password('wrong-password',value)

def test_student_cannot_read_another_student():
    h=login('divyakdivya38@gmail.com','StudentDemo123!')
    assert client.get('/api/v1/students/STU001',headers=h).status_code==200
    assert client.get('/api/v1/students/STU002',headers=h).status_code==403

def test_student_cannot_import():
    h=login('divyakdivya38@gmail.com','StudentDemo123!')
    assert client.get('/api/v1/imports/history',headers=h).status_code==403

def test_repository_validation():
    h=login('divyakdivya38@gmail.com','StudentDemo123!')
    assert client.post('/api/v1/submissions',headers=h,json={'repository_url':'https://example.com/owner/repo'}).status_code==422
    r=client.post('/api/v1/submissions',headers=h,json={'repository_url':'https://github.com/example/repo'})
    assert r.status_code==200 and r.json()['analysis_status']=='Not analyzed yet'

def test_dashboard_and_schedules():
    h=login()
    d=client.get('/api/v1/dashboard/admin',headers=h)
    assert d.status_code==200 and d.json()['metrics']['students']>0
    assert client.get('/api/v1/schedules',headers=h).status_code==200

def test_student_only_sees_published_reviews():
    admin=login()
    # A submission creates a review, but student review endpoint does not expose unpublished draft records.
    student=login('divyakdivya38@gmail.com','StudentDemo123!')
    client.post('/api/v1/submissions',headers=student,json={'repository_url':'https://github.com/example/repo2'})
    data=client.get('/api/v1/reviews',headers=student)
    assert data.status_code==200 and data.json()==[]

def test_ai_review_supports_openai_claude_and_gemini(monkeypatch):
    providers = {
        'openai': ('OPENAI_API_KEY', 'openai'),
        'claude': ('ANTHROPIC_API_KEY', 'anthropic'),
        'gemini': ('GEMINI_API_KEY', 'gemini'),
    }
    expected_feedback = {
        'summary': 'Summary',
        'overall_assessment': 'Assessment',
        'strengths': [],
        'improvements': [],
        'recommendations': [],
    }
    project = {
        'files': [{'path': 'README.md', 'content': 'Project documentation'}],
        'html_url': 'https://github.com/example/repo',
        'description': 'Example project',
        'default_branch': 'main',
    }

    class Response:
        def __init__(self, body):
            self.body = body
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False
        def read(self, _limit):
            return self.body

    for configured_provider, api_key in providers.items():
        provider = api_key[1]
        monkeypatch.setenv('AI_PROVIDER', configured_provider)
        monkeypatch.setenv(api_key[0], 'test-api-key')
        content = json.dumps(expected_feedback)
        if provider == 'openai':
            response_body = {'choices': [{'message': {'content': content}}]}
        elif provider == 'anthropic':
            response_body = {'content': [{'type': 'text', 'text': content}]}
        else:
            response_body = {'candidates': [{'content': {'parts': [{'text': content}]}}]}

        def fake_urlopen(request, timeout):
            assert timeout == 90
            payload = json.loads(request.data)
            if provider == 'openai':
                assert request.full_url == 'https://api.openai.com/v1/chat/completions'
                assert payload['response_format'] == {'type': 'json_object'}
            elif provider == 'anthropic':
                assert request.full_url == 'https://api.anthropic.com/v1/messages'
                assert payload['max_tokens'] > 0
            else:
                assert ':generateContent' in request.full_url
                assert payload['generationConfig']['responseMimeType'] == 'application/json'
            return Response(json.dumps(response_body).encode())

        monkeypatch.setattr(app_module, 'urlopen', fake_urlopen)
        feedback = app_module._generate_ai_review(project, 'Task', 'Internship')
        assert feedback['provider'] == configured_provider
        assert feedback['summary'] == 'Summary'

def _create_review_for_approval():
    feedback = {
        'summary': 'Review summary',
        'overall_assessment': 'Good progress',
        'strengths': ['Clear documentation'],
        'improvements': [],
        'recommendations': [],
    }
    with app_module.connect() as c:
        student = c.execute(
            "SELECT student_id, email, name FROM students WHERE student_id='STU001'"
        ).fetchone()
        cursor = c.execute(
            "INSERT INTO reviews(student_id,status,repository_url,draft_json,updated_at) VALUES(?,?,?,?,?)",
            (student['student_id'], 'Draft ready', 'https://github.com/example/repo', json.dumps(feedback), app_module.now()),
        )
        return cursor.lastrowid, student, feedback

def test_approve_publishes_review_and_sends_student_email(monkeypatch):
    monkeypatch.setattr(app_module, 'DEMO_MODE', False)
    review_id, student, feedback = _create_review_for_approval()
    schedule = {
        'review_date': (date.today() + timedelta(days=2)).isoformat(),
        'review_time': '10:30 AM',
        'meeting_link': 'https://meet.google.com/abc-defg-hij',
        'timezone': 'Asia/Kolkata',
    }
    with app_module.connect() as c:
        c.execute(
            'INSERT INTO schedules(student_id,student_name,email,review_number,review_date,review_time,meeting_link,status,timezone) '
            'VALUES(?,?,?,?,?,?,?,?,?)',
            (student['student_id'], student['name'], student['email'], 1, schedule['review_date'],
             schedule['review_time'], schedule['meeting_link'], 'Scheduled', schedule['timezone']),
        )
    sent = {}
    def fake_send(recipient, student_name, message, next_review):
        sent.update(recipient=recipient, student_name=student_name, feedback=message, next_review=next_review)
    monkeypatch.setattr(app_module, '_send_review_email', fake_send)

    response = client.post(f'/api/v1/reviews/{review_id}/approve', headers=login())

    assert response.status_code == 200
    assert response.json()['email_status'] == 'sent'
    assert sent == {
        'recipient': student['email'],
        'student_name': student['name'],
        'feedback': feedback,
        'next_review': schedule,
    }
    with app_module.connect() as c:
        published = c.execute('SELECT status,published_json FROM reviews WHERE id=?', (review_id,)).fetchone()
    assert published['status'] == 'Approved'
    assert json.loads(published['published_json']) == feedback

def test_email_failure_does_not_unpublish_review(monkeypatch):
    monkeypatch.setattr(app_module, 'DEMO_MODE', False)
    review_id, _, _ = _create_review_for_approval()
    def fail_send(*_args):
        raise smtplib.SMTPException('SMTP unavailable')
    monkeypatch.setattr(app_module, '_send_review_email', fail_send)

    response = client.post(f'/api/v1/reviews/{review_id}/approve', headers=login())

    assert response.status_code == 200
    assert response.json()['email_status'] == 'failed'
    assert 'published' in response.json()['message']
    with app_module.connect() as c:
        published = c.execute('SELECT status,published_json FROM reviews WHERE id=?', (review_id,)).fetchone()
    assert published['status'] == 'Approved'
    assert published['published_json']

def test_gmail_smtp_sends_review_to_student_email(monkeypatch):
    for key, value in {
        'SMTP_HOST': 'smtp.gmail.com',
        'SMTP_PORT': '587',
        'SMTP_USERNAME': 'reviewer@gmail.com',
        'SMTP_PASSWORD': 'test-app-password',
        'EMAIL_FROM': 'reviewer@gmail.com',
    }.items():
        monkeypatch.setenv(key, value)
    sent = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            sent['connection'] = (host, port, timeout)
        def __enter__(self):
            return self
        def __exit__(self, *_args):
            return False
        def ehlo(self):
            pass
        def starttls(self, context):
            sent['tls'] = context is not None
        def login(self, username, password):
            sent['login'] = (username, password)
        def send_message(self, message):
            sent['message'] = message

    monkeypatch.setattr(app_module.smtplib, 'SMTP', FakeSMTP)
    app_module._send_review_email(
        'student@gmail.com',
        'Student Name',
        {'summary': 'Good work', 'overall_assessment': 'Strong submission', 'strengths': ['Readable code']},
        {
            'review_date': '2026-10-28',
            'review_time': '10:30 AM',
            'meeting_link': 'https://meet.google.com/abc-defg-hij',
            'timezone': 'Asia/Kolkata',
        },
    )

    assert sent['connection'] == ('smtp.gmail.com', 587, 20)
    assert sent['tls']
    assert sent['login'] == ('reviewer@gmail.com', 'test-app-password')
    assert sent['message']['To'] == 'student@gmail.com'
    assert 'Good work' in sent['message'].get_content()
    assert '2026-10-28' in sent['message'].get_content()
    assert '10:30 AM (Asia/Kolkata)' in sent['message'].get_content()
    assert 'https://meet.google.com/abc-defg-hij' in sent['message'].get_content()
