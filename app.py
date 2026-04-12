from flask import Flask, render_template, request, jsonify
import string
import random
import os

app = Flask(__name__)

# ---------------- DATABASE ----------------
# Use DATABASE_URL from environment (Render sets this automatically for PostgreSQL)
# Falls back to local SQLite for development
DATABASE_URL = os.environ.get("DATABASE_URL")
USE_POSTGRES = bool(DATABASE_URL)

# Render provides DATABASE_URL starting with "postgres://" but psycopg2 needs "postgresql://"
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if USE_POSTGRES:
    import psycopg2
    import psycopg2.extras
    import psycopg2.errors
else:
    import sqlite3

def get_db():
    """Get a database connection."""
    if USE_POSTGRES:
        conn = psycopg2.connect(DATABASE_URL)
    else:
        os.makedirs("data", exist_ok=True)
        conn = sqlite3.connect("data/timetable.db")
    return conn

def q(sql):
    """Convert PostgreSQL SQL syntax to SQLite when needed."""
    if not USE_POSTGRES:
        sql = sql.replace("%s", "?")
        sql = sql.replace("NOW()", "datetime('now')")
        sql = sql.replace("COALESCE(", "IFNULL(")
    return sql

# Unified IntegrityError for both databases
if USE_POSTGRES:
    DBIntegrityError = psycopg2.IntegrityError
else:
    DBIntegrityError = sqlite3.IntegrityError

def create_user_table():
    conn = get_db()
    cursor = conn.cursor()

    # Use SERIAL for PostgreSQL, INTEGER PRIMARY KEY AUTOINCREMENT for SQLite
    if USE_POSTGRES:
        pk = "SERIAL PRIMARY KEY"
    else:
        pk = "INTEGER PRIMARY KEY AUTOINCREMENT"

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS users (
        id {pk},
        username TEXT,
        password TEXT,
        role TEXT
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS login_history (
        id {pk},
        username TEXT,
        role TEXT,
        time TEXT
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS subjects (
        id {pk},
        subject_name TEXT,
        subject_code TEXT
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS classes (
        id {pk},
        course_name TEXT,
        section TEXT,
        student_strength INTEGER
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS rooms (
        id {pk},
        room_no TEXT,
        capacity INTEGER,
        room_type TEXT
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS notifications (
        id {pk},
        message TEXT,
        target_role TEXT,
        time TEXT
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS assignments (
        id {pk},
        title TEXT,
        deadline TEXT,
        time_posted TEXT
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS timetables (
        id {pk},
        class_id INTEGER,
        day TEXT,
        period INTEGER,
        subject_id INTEGER,
        teacher_id INTEGER,
        room_id INTEGER,
        substitute_id INTEGER
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS teacher_subjects (
        id {pk},
        teacher_id INTEGER,
        subject_id INTEGER,
        priority INTEGER DEFAULT 1,
        UNIQUE(teacher_id, subject_id)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS class_subjects (
        id {pk},
        class_id INTEGER,
        subject_id INTEGER,
        UNIQUE(class_id, subject_id)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS teacher_preferences (
        id {pk},
        teacher_id INTEGER,
        day TEXT,
        period INTEGER,
        pref_type TEXT,
        UNIQUE(teacher_id, day, period)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS timetable_rules (
        id {pk},
        rule_name TEXT,
        rule_description TEXT,
        is_active INTEGER DEFAULT 1
    )
    """)

    # Commit table creation first (important for PostgreSQL - rollback would undo everything)
    conn.commit()

    # Safely add missing columns to existing databases (these columns already exist in CREATE TABLE above,
    # but this handles upgrades from older database versions)
    for alter_sql in [
        "ALTER TABLE timetables ADD COLUMN substitute_id INTEGER",
        "ALTER TABLE teacher_subjects ADD COLUMN priority INTEGER DEFAULT 1"
    ]:
        try:
            cursor.execute(alter_sql)
            conn.commit()
        except Exception:
            conn.rollback()

    conn.commit()
    conn.close()


def get_user(username):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute(q("SELECT * FROM users WHERE username=%s"), (username,))
    user = cursor.fetchone()

    conn.close()
    return user


def add_user(username, password, role):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute(
        q("INSERT INTO users (username, password, role) VALUES (%s, %s, %s)"),
        (username, password, role)
    )

    conn.commit()
    conn.close()


# ---------------- ROUTES ----------------

@app.route("/")
def home():
    return render_template("login.html")


@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")

@app.route("/teacher_dashboard")
def teacher_dashboard():
    return render_template("teacher_dashboard.html")

@app.route("/student_dashboard")
def student_dashboard():
    return render_template("student_dashboard.html")


@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()

    username = data["username"]
    password = data["password"]
    role = data.get("role", "student")

    user = get_user(username)

    if user:
        if user[3] != role:
            return jsonify({"status": "wrong role"})

        if user[2] == password:

            # ✅ SAVE LOGIN HISTORY (ONLY HERE)
            conn = get_db()
            cursor = conn.cursor()

            cursor.execute(
                q("INSERT INTO login_history (username, role, time) VALUES (%s, %s, NOW())"),
                (username, role)
            )

            conn.commit()
            conn.close()

            return jsonify({"status": "success", "role": user[3]})
        else:
            return jsonify({"status": "wrong password"})
    else:
        # ✅ CREATE USER ONLY (NO LOGIN HISTORY HERE)
        add_user(username, password, role)
        return jsonify({"status": "new user created", "role": role})
        
@app.route("/admin-data")
def admin_data():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id, username, password FROM users WHERE role='teacher'")
    teachers_raw = cursor.fetchall()
    teachers = []
    for row in teachers_raw:
        teacher_id = row[0]
        cursor.execute(q("""
            SELECT s.id, s.subject_name, ts.priority 
            FROM teacher_subjects ts 
            JOIN subjects s ON ts.subject_id = s.id 
            WHERE ts.teacher_id = %s
        """), (teacher_id,))
        assigned_subjects = [{"id": r[0], "name": r[1], "priority": r[2]} for r in cursor.fetchall()]
        teachers.append({
            "id": teacher_id, 
            "username": row[1], 
            "password": row[2],
            "assigned_subjects": assigned_subjects
        })

    cursor.execute("SELECT id, username, password FROM users WHERE role='student'")
    students = [{"id": row[0], "username": row[1], "password": row[2]} for row in cursor.fetchall()]

    cursor.execute("SELECT id, subject_name, subject_code FROM subjects")
    subjects = [{"id": row[0], "subject_name": row[1], "subject_code": row[2]} for row in cursor.fetchall()]

    cursor.execute("SELECT id, course_name, section, student_strength FROM classes")
    classes_raw = cursor.fetchall()
    classes = []
    for row in classes_raw:
        class_id = row[0]
        cursor.execute(q("SELECT s.id, s.subject_name FROM class_subjects cs JOIN subjects s ON cs.subject_id = s.id WHERE cs.class_id = %s"), (class_id,))
        assigned_subjects = [{"id": r[0], "name": r[1]} for r in cursor.fetchall()]
        classes.append({
            "id": class_id, 
            "course_name": row[1], 
            "section": row[2], 
            "student_strength": row[3],
            "assigned_subjects": assigned_subjects
        })

    cursor.execute("SELECT id, room_no, capacity, room_type FROM rooms")
    rooms = [{"id": row[0], "room_no": row[1], "capacity": row[2], "room_type": row[3]} for row in cursor.fetchall()]

    cursor.execute("SELECT username, role, time FROM login_history ORDER BY id DESC LIMIT 50")
    logins = cursor.fetchall()

    cursor.execute("SELECT id, message, target_role, time FROM notifications ORDER BY id DESC")
    notifications = [{"id": row[0], "message": row[1], "target_role": row[2], "time": str(row[3]) if row[3] else None} for row in cursor.fetchall()]

    cursor.execute("SELECT id, rule_name, rule_description, is_active FROM timetable_rules")
    rules = [{"id": row[0], "rule_name": row[1], "rule_description": row[2], "is_active": row[3]} for row in cursor.fetchall()]

    conn.close()

    return jsonify({
        "teachers": teachers,
        "students": students,
        "subjects": subjects,
        "classes": classes,
        "rooms": rooms,
        "logins": [{"name": row[0], "role": row[1], "time": str(row[2]) if row[2] else None} for row in logins],
        "notifications": notifications,
        "rules": rules
    })

@app.route("/api/user", methods=["POST"])
def api_add_user():
    data = request.get_json()
    password = data.get("password", "")
    if not password:
        password = ''.join(random.choice(string.ascii_letters + string.digits) for _ in range(8))
        print(f"[SYSTEM] Auto-generated password for {data['username']}: {password}")

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(q("INSERT INTO users (username, password, role) VALUES (%s, %s, %s)"), 
                   (data["username"], password, data["role"]))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route("/api/user/<int:user_id>", methods=["PUT", "DELETE"])
def api_edit_user(user_id):
    conn = get_db()
    cursor = conn.cursor()
    if request.method == "DELETE":
        cursor.execute(q("DELETE FROM users WHERE id=%s"), (user_id,))
    elif request.method == "PUT":
        data = request.get_json()
        cursor.execute(q("UPDATE users SET username=%s, password=%s WHERE id=%s"), 
                       (data["username"], data["password"], user_id))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})


@app.route("/api/forgot_password", methods=["POST"])
def api_forgot_password():
    data = request.get_json()
    username = data.get("username")
    
    user = get_user(username)
    if not user:
        return jsonify({"status": "error", "message": "Email/User not found in the system!"})
        
    # Generate new random password
    chars = string.ascii_letters + string.digits
    new_password = ''.join(random.choice(chars) for _ in range(8))
    
    # Update password in DB
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(q("UPDATE users SET password=%s WHERE username=%s"), (new_password, username))
    conn.commit()
    conn.close()
    
    # Simulate email sending process (would use smtplib in prod with credentials)
    print(f"\n[EMAIL DISPATCH SIMULATION]")
    print(f"To: {username}")
    print(f"Subject: Automated Password Reset")
    print(f"Body: Hello,\nYour new system-generated password is: {new_password}\nPlease login and change it immediately.")
    print("-------------------------------------------\n")
    
    return jsonify({"status": "success", "message": f"A newly generated password has been sent to {username}! (Check server console since this is a simulation)"})


@app.route("/api/subject", methods=["POST"])
def api_add_subject():
    data = request.get_json()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(q("INSERT INTO subjects (subject_name, subject_code) VALUES (%s, %s)"), 
                   (data["subject_name"], data["subject_code"]))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route("/api/subject/<int:subject_id>", methods=["PUT", "DELETE"])
def api_edit_subject(subject_id):
    conn = get_db()
    cursor = conn.cursor()
    if request.method == "DELETE":
        cursor.execute(q("DELETE FROM subjects WHERE id=%s"), (subject_id,))
    elif request.method == "PUT":
        data = request.get_json()
        cursor.execute(q("UPDATE subjects SET subject_name=%s, subject_code=%s WHERE id=%s"), 
                       (data["subject_name"], data["subject_code"], subject_id))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})


@app.route("/api/class", methods=["POST"])
def api_add_class():
    data = request.get_json()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(q("INSERT INTO classes (course_name, section, student_strength) VALUES (%s, %s, %s)"), 
                   (data["course_name"], data["section"], data["student_strength"]))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route("/api/class/<int:class_id>", methods=["PUT", "DELETE"])
def api_edit_class(class_id):
    conn = get_db()
    cursor = conn.cursor()
    if request.method == "DELETE":
        cursor.execute(q("DELETE FROM classes WHERE id=%s"), (class_id,))
    elif request.method == "PUT":
        data = request.get_json()
        cursor.execute(q("UPDATE classes SET course_name=%s, section=%s, student_strength=%s WHERE id=%s"), 
                       (data["course_name"], data["section"], data["student_strength"], class_id))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})


@app.route("/api/rule", methods=["POST"])
def api_add_rule():
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(q("INSERT INTO timetable_rules (rule_name, rule_description) VALUES (%s, %s)"), 
                   (data['rule_name'], data['rule_description']))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route("/api/rule/<int:id>", methods=["DELETE"])
def api_delete_rule(id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(q("DELETE FROM timetable_rules WHERE id = %s"), (id,))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route("/api/room", methods=["POST"])
def api_add_room():
    data = request.get_json()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(q("INSERT INTO rooms (room_no, capacity, room_type) VALUES (%s, %s, %s)"), 
                   (data["room_no"], data["capacity"], data["room_type"]))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route("/api/room/<int:room_id>", methods=["PUT", "DELETE"])
def api_edit_room(room_id):
    conn = get_db()
    cursor = conn.cursor()
    if request.method == "DELETE":
        cursor.execute(q("DELETE FROM rooms WHERE id=%s"), (room_id,))
    elif request.method == "PUT":
        data = request.get_json()
        cursor.execute(q("UPDATE rooms SET room_no=%s, capacity=%s, room_type=%s WHERE id=%s"), 
                       (data["room_no"], data["capacity"], data["room_type"], room_id))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})


@app.route("/api/notify", methods=["POST"])
def api_notify():
    data = request.get_json()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(q("INSERT INTO notifications (message, target_role, time) VALUES (%s, %s, NOW())"), 
                   (data["message"], data["target_role"]))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route("/api/notifications/<role>")
def api_get_notifications(role):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(q("SELECT message, time FROM notifications WHERE target_role=%s OR target_role='all' ORDER BY id DESC"), (role,))
    notifs = [{"message": row[0], "time": str(row[1]) if row[1] else None} for row in cursor.fetchall()]
    conn.close()
    return jsonify({"notifications": notifs})

@app.route("/api/generate_timetable", methods=["POST"])
def api_generate_timetable():
    data = request.get_json(silent=True) or {}
    days_count = data.get("days", 5)
    periods_count = data.get("periods", 5)
    rules = data.get("rules", {"ruleLabRooms": True, "ruleNoConsecutive": True})

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id, username FROM users WHERE role='teacher'")
    teachers = [{"id": row[0], "username": row[1]} for row in cursor.fetchall()]

    cursor.execute("SELECT id, subject_name FROM subjects")
    subjects = [{"id": row[0], "subject_name": row[1]} for row in cursor.fetchall()]

    cursor.execute("SELECT id, course_name, section FROM classes")
    classes = [{"id": row[0], "course_name": row[1], "section": row[2]} for row in cursor.fetchall()]

    cursor.execute("SELECT id, room_no, room_type FROM rooms")
    rooms = [{"id": row[0], "room_no": row[1], "room_type": row[2]} for row in cursor.fetchall()]

    cursor.execute("SELECT teacher_id, subject_id, priority FROM teacher_subjects")
    teacher_subjects = {}
    for tid, sid, prio in cursor.fetchall():
        if sid not in teacher_subjects:
            teacher_subjects[sid] = []
        teacher_subjects[sid].append((tid, prio))

    cursor.execute("SELECT class_id, subject_id FROM class_subjects")
    class_subjects = {}
    for cid, sid in cursor.fetchall():
        if cid not in class_subjects:
            class_subjects[cid] = []
        class_subjects[cid].append(sid)

    cursor.execute("SELECT teacher_id, day, period, pref_type FROM teacher_preferences")
    teacher_prefs = {}
    for tid, day, per, ptype in cursor.fetchall():
        if tid not in teacher_prefs:
            teacher_prefs[tid] = {}
        teacher_prefs[tid][(day, per)] = ptype

    from timetable import generate_ai_timetable
    
    result = generate_ai_timetable(classes, subjects, teachers, rooms, class_subjects, teacher_subjects, days_count, periods_count, rules, teacher_prefs)
    
    if "error" in result:
        conn.close()
        return jsonify(result)

    cursor.execute("DELETE FROM timetables") 
    
    for t in result["timetable"]:
        cursor.execute(q("""
        INSERT INTO timetables (class_id, day, period, subject_id, teacher_id, room_id)
        VALUES (%s, %s, %s, %s, %s, %s)
        """), (t["class_id"], t["day"], t["period"], t["subject_id"], t["teacher_id"], t["room_id"]))

    conn.commit()
    conn.close()

    return jsonify({"status": "success", "timetable": result["timetable"]})

@app.route("/api/teacher/info", methods=["GET"])
def api_get_teacher_info():
    """Get a teacher's assigned subjects and classes they teach"""
    teacher_username = request.args.get("username")
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(q("SELECT id FROM users WHERE username=%s AND role='teacher'"), (teacher_username,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"subjects": [], "classes": []})
    
    tid = row[0]
    
    # Get assigned subjects
    cursor.execute(q("""
        SELECT s.id, s.subject_name, s.subject_code 
        FROM teacher_subjects ts 
        JOIN subjects s ON ts.subject_id = s.id 
        WHERE ts.teacher_id = %s
        ORDER BY s.subject_name
    """), (tid,))
    subjects = [{"id": r[0], "name": r[1], "code": r[2]} for r in cursor.fetchall()]
    
    # Get classes this teacher handles (from timetable)
    cursor.execute(q("""
        SELECT DISTINCT c.id, c.course_name, c.section
        FROM timetables t
        JOIN classes c ON t.class_id = c.id
        WHERE t.teacher_id = %s OR t.substitute_id = %s
        ORDER BY c.course_name, c.section
    """), (tid, tid))
    classes = [{"id": r[0], "course_name": r[1], "section": r[2]} for r in cursor.fetchall()]
    
    conn.close()
    return jsonify({"subjects": subjects, "classes": classes})

@app.route("/api/teacher/preferences", methods=["GET"])
def api_get_teacher_preferences():
    teacher_username = request.args.get("username")
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(q("SELECT id FROM users WHERE username=%s AND role='teacher'"), (teacher_username,))
    row = cursor.fetchone()
    if not row:
        return jsonify({"preferences": []})
    
    tid = row[0]
    cursor.execute(q("SELECT day, period, pref_type FROM teacher_preferences WHERE teacher_id=%s"), (tid,))
    prefs = [{"day": r[0], "period": r[1], "pref_type": r[2]} for r in cursor.fetchall()]
    conn.close()
    return jsonify({"preferences": prefs})


@app.route("/api/teacher/preferences", methods=["POST"])
def api_save_teacher_preferences():
    data = request.json
    teacher_username = data.get("username")
    prefs = data.get("preferences", []) # List of {day, period, pref_type}
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(q("SELECT id FROM users WHERE username=%s AND role='teacher'"), (teacher_username,))
    row = cursor.fetchone()
    if not row:
        return jsonify({"status": "error", "message": "Teacher not found"})
    
    tid = row[0]
    cursor.execute(q("DELETE FROM teacher_preferences WHERE teacher_id=%s"), (tid,))
    for p in prefs:
        cursor.execute(q("INSERT INTO teacher_preferences (teacher_id, day, period, pref_type) VALUES (%s, %s, %s, %s)"),
                       (tid, p['day'], p['period'], p['pref_type']))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route("/api/timetable", methods=["GET"])
def api_get_timetable():
    conn = get_db()
    cursor = conn.cursor()

    query = q("""
        SELECT t.class_id, c.course_name, c.section, t.day, t.period, 
               s.subject_name, 
               CASE 
                 WHEN t.substitute_id IS NOT NULL THEN (SELECT username FROM users WHERE id = t.substitute_id) || ' (SUB)'
                 ELSE COALESCE(u.username, 'No Teacher Assigned') 
               END as teacher_name, 
               r.room_no
        FROM timetables t
        JOIN classes c ON t.class_id = c.id
        JOIN subjects s ON t.subject_id = s.id
        LEFT JOIN users u ON t.teacher_id = u.id
        LEFT JOIN rooms r ON t.room_id = r.id
    """)
    
    cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()

    timetable = [{
        "class_id": row[0],
        "course_name": row[1],
        "section": row[2],
        "day": row[3],
        "period": row[4],
        "subject_name": row[5],
        "teacher_name": row[6],
        "room_no": row[7]
    } for row in rows]

    return jsonify({"status": "success", "timetable": timetable})

@app.route("/api/assign_subject/<int:teacher_id>/<int:subject_id>", methods=["DELETE"])
def api_unassign_subject(teacher_id, subject_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(q("DELETE FROM teacher_subjects WHERE teacher_id=%s AND subject_id=%s"), (teacher_id, subject_id))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route("/api/assign_subject", methods=["POST"])
def api_assign_subject():
    data = request.get_json()
    conn = get_db()
    cursor = conn.cursor()
    priority = data.get("priority", 1)
    try:
        cursor.execute(q("INSERT INTO teacher_subjects (teacher_id, subject_id, priority) VALUES (%s, %s, %s)"), 
                       (data["teacher_id"], data["subject_id"], priority))
        conn.commit()
    except DBIntegrityError:
        if USE_POSTGRES:
            conn.rollback()
        cursor.execute(q("UPDATE teacher_subjects SET priority=%s WHERE teacher_id=%s AND subject_id=%s"),
                       (priority, data["teacher_id"], data["subject_id"]))
        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({"status": "error", "message": str(e)})

    conn.close()
    return jsonify({"status": "success"})

@app.route("/api/assign_class_subject/<int:class_id>/<int:subject_id>", methods=["DELETE"])
def api_unassign_class_subject(class_id, subject_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(q("DELETE FROM class_subjects WHERE class_id=%s AND subject_id=%s"), (class_id, subject_id))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route("/api/assign_class_subject", methods=["POST"])
def api_assign_class_subject():
    data = request.get_json()
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(q("INSERT INTO class_subjects (class_id, subject_id) VALUES (%s, %s)"), 
                       (data["class_id"], data["subject_id"]))
        conn.commit()
    except DBIntegrityError:
        if USE_POSTGRES:
            conn.rollback()
        pass # Already assigned
    except Exception as e:
        conn.close()
        return jsonify({"status": "error", "message": str(e)})

    conn.close()
    return jsonify({"status": "success"})

@app.route("/api/assignment", methods=["GET", "POST"])
def api_assignment():
    conn = get_db()
    cursor = conn.cursor()
    
    if request.method == "POST":
        data = request.get_json()
        cursor.execute(q("INSERT INTO assignments (title, deadline, time_posted) VALUES (%s, %s, NOW())"), 
                       (data["title"], data["deadline"]))
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
    else:
        cursor.execute("SELECT id, title, deadline, time_posted FROM assignments ORDER BY deadline ASC")
        assignments = [{"id": row[0], "title": row[1], "deadline": str(row[2]) if row[2] else None, "time_posted": str(row[3]) if row[3] else None} for row in cursor.fetchall()]
        conn.close()
        return jsonify({"assignments": assignments})

@app.route("/api/auto_substitute", methods=["POST"])
def api_auto_substitute():
    data = request.get_json()
    teacher_id = data["teacher_id"]
    day = data["day"]

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute(q("SELECT id, day, period FROM timetables WHERE (teacher_id = %s OR substitute_id = %s) AND day = %s"), (teacher_id, teacher_id, day))
    slots = cursor.fetchall()

    if not slots:
        conn.close()
        return jsonify({"status": "error", "message": f"No classes found for this teacher on {day}"})

    subs_found = 0
    import random
    
    for slot_id, d, p in slots:
        # Find teachers who are free at (d, p)
        # 1. Not scheduled as original teacher
        # 2. Not already scheduled as substitute
        query = q("""
            SELECT id FROM users 
            WHERE role='teacher' AND id != %s
            AND id NOT IN (SELECT teacher_id FROM timetables WHERE day=%s AND period=%s)
            AND id NOT IN (SELECT substitute_id FROM timetables WHERE day=%s AND period=%s AND substitute_id IS NOT NULL)
        """)
        cursor.execute(query, (teacher_id, day, p, day, p))
        available = cursor.fetchall()
        
        if available:
            sub_id = random.choice(available)[0]
            cursor.execute(q("UPDATE timetables SET substitute_id = %s WHERE id = %s"), (sub_id, slot_id))
            subs_found += 1

    conn.commit()
    conn.close()
    return jsonify({"status": "success", "count": subs_found})

@app.route("/api/clear_substitutions", methods=["POST"])
def api_clear_substitutions():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE timetables SET substitute_id = NULL")
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route("/api/timetable/update", methods=["POST"])
def api_update_timetable_slot():
    """Update a single timetable slot's subject, teacher, or room"""
    data = request.get_json()
    entry_id = data.get("id")
    
    if not entry_id:
        return jsonify({"status": "error", "message": "Missing timetable entry ID"})
    
    conn = get_db()
    cursor = conn.cursor()
    
    updates = []
    values = []
    
    ph = "%s" if USE_POSTGRES else "?"
    
    if "subject_id" in data:
        updates.append(f"subject_id = {ph}")
        values.append(data["subject_id"])
    if "teacher_id" in data:
        updates.append(f"teacher_id = {ph}")
        values.append(data["teacher_id"])
    if "room_id" in data:
        updates.append(f"room_id = {ph}")
        values.append(data["room_id"])
    
    if not updates:
        conn.close()
        return jsonify({"status": "error", "message": "No fields to update"})
    
    values.append(entry_id)
    cursor.execute(f"UPDATE timetables SET {', '.join(updates)} WHERE id = {ph}", values)
    conn.commit()
    conn.close()
    
    return jsonify({"status": "success"})

@app.route("/api/timetable/swap", methods=["POST"])
def api_swap_timetable_slots():
    """Swap two timetable periods"""
    data = request.get_json()
    id1 = data.get("id1")
    id2 = data.get("id2")
    
    if not id1 or not id2:
        return jsonify({"status": "error", "message": "Two entry IDs required for swap"})
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Get both entries
    cursor.execute(q("SELECT day, period, subject_id, teacher_id, room_id FROM timetables WHERE id = %s"), (id1,))
    entry1 = cursor.fetchone()
    cursor.execute(q("SELECT day, period, subject_id, teacher_id, room_id FROM timetables WHERE id = %s"), (id2,))
    entry2 = cursor.fetchone()
    
    if not entry1 or not entry2:
        conn.close()
        return jsonify({"status": "error", "message": "One or both entries not found"})
    
    # Swap the subject, teacher, and room (keep the day/period slots)
    cursor.execute(q("UPDATE timetables SET subject_id=%s, teacher_id=%s, room_id=%s WHERE id=%s"),
                   (entry2[2], entry2[3], entry2[4], id1))
    cursor.execute(q("UPDATE timetables SET subject_id=%s, teacher_id=%s, room_id=%s WHERE id=%s"),
                   (entry1[2], entry1[3], entry1[4], id2))
    
    conn.commit()
    conn.close()
    
    return jsonify({"status": "success"})

@app.route("/api/timetable/delete/<int:entry_id>", methods=["DELETE"])
def api_delete_timetable_slot(entry_id):
    """Delete a single timetable entry"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(q("DELETE FROM timetables WHERE id = %s"), (entry_id,))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route("/api/timetable/detailed", methods=["GET"])
def api_get_detailed_timetable():
    """Return timetable with entry IDs for editing"""
    conn = get_db()
    cursor = conn.cursor()

    query = q("""
        SELECT t.id, t.class_id, c.course_name, c.section, t.day, t.period, 
               t.subject_id, s.subject_name, 
               t.teacher_id,
               CASE 
                 WHEN t.substitute_id IS NOT NULL THEN (SELECT username FROM users WHERE id = t.substitute_id) || ' (SUB)'
                 ELSE COALESCE(u.username, 'No Teacher Assigned') 
               END as teacher_name, 
               t.room_id, r.room_no
        FROM timetables t
        JOIN classes c ON t.class_id = c.id
        JOIN subjects s ON t.subject_id = s.id
        LEFT JOIN users u ON t.teacher_id = u.id
        LEFT JOIN rooms r ON t.room_id = r.id
    """)
    
    cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()

    timetable = [{
        "id": row[0],
        "class_id": row[1],
        "course_name": row[2],
        "section": row[3],
        "day": row[4],
        "period": row[5],
        "subject_id": row[6],
        "subject_name": row[7],
        "teacher_id": row[8],
        "teacher_name": row[9],
        "room_id": row[10],
        "room_no": row[11]
    } for row in rows]

    return jsonify({"status": "success", "timetable": timetable})

# Always create tables on import (needed for gunicorn)
create_user_table()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
