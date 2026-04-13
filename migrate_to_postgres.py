#!/usr/bin/env python3
"""
Migration script: SQLite → PostgreSQL
Run this ONCE after deploying to Render to migrate your existing data.

Usage:
  Set DATABASE_URL env var, then run:
    python migrate_to_postgres.py

  Or provide the database URL as argument:
    python migrate_to_postgres.py "postgresql://user:pass@host:5432/dbname"
"""
import sqlite3
import psycopg2
import sys
import os

# Get PostgreSQL connection URL
PG_URL = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("DATABASE_URL", "")
if PG_URL.startswith("postgres://"):
    PG_URL = PG_URL.replace("postgres://", "postgresql://", 1)

SQLITE_PATH = os.path.join("data", "timetable.db")

if not PG_URL:
    print("[ERROR] No DATABASE_URL set. Provide it as argument or env var.")
    sys.exit(1)

if not os.path.exists(SQLITE_PATH):
    print(f"[ERROR] SQLite database not found at {SQLITE_PATH}")
    sys.exit(1)

print(f"Source: {SQLITE_PATH}")
print(f"Target: {PG_URL[:50]}...")
print()

# Connect to both databases
sqlite_conn = sqlite3.connect(SQLITE_PATH)
sqlite_cur = sqlite_conn.cursor()

pg_conn = psycopg2.connect(PG_URL, sslmode="require")
pg_cur = pg_conn.cursor()

# Tables to migrate in order (respecting dependencies)
TABLES = [
    {
        "name": "users",
        "columns": ["id", "username", "password", "role"],
        "insert": "INSERT INTO users (id, username, password, role) VALUES (%s, %s, %s, %s)"
    },
    {
        "name": "subjects",
        "columns": ["id", "subject_name", "subject_code"],
        "insert": "INSERT INTO subjects (id, subject_name, subject_code) VALUES (%s, %s, %s)"
    },
    {
        "name": "classes",
        "columns": ["id", "course_name", "section", "student_strength"],
        "insert": "INSERT INTO classes (id, course_name, section, student_strength) VALUES (%s, %s, %s, %s)"
    },
    {
        "name": "rooms",
        "columns": ["id", "room_no", "capacity", "room_type"],
        "insert": "INSERT INTO rooms (id, room_no, capacity, room_type) VALUES (%s, %s, %s, %s)"
    },
    {
        "name": "teacher_subjects",
        "columns": ["id", "teacher_id", "subject_id", "priority"],
        "insert": "INSERT INTO teacher_subjects (id, teacher_id, subject_id, priority) VALUES (%s, %s, %s, %s)"
    },
    {
        "name": "class_subjects",
        "columns": ["id", "class_id", "subject_id"],
        "insert": "INSERT INTO class_subjects (id, class_id, subject_id) VALUES (%s, %s, %s)"
    },
    {
        "name": "timetables",
        "columns": ["id", "class_id", "day", "period", "subject_id", "teacher_id", "room_id", "substitute_id"],
        "insert": "INSERT INTO timetables (id, class_id, day, period, subject_id, teacher_id, room_id, substitute_id) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)"
    },
    {
        "name": "teacher_preferences",
        "columns": ["id", "teacher_id", "day", "period", "pref_type"],
        "insert": "INSERT INTO teacher_preferences (id, teacher_id, day, period, pref_type) VALUES (%s, %s, %s, %s, %s)"
    },
    {
        "name": "timetable_rules",
        "columns": ["id", "rule_name", "rule_description", "is_active"],
        "insert": "INSERT INTO timetable_rules (id, rule_name, rule_description, is_active) VALUES (%s, %s, %s, %s)"
    },
    {
        "name": "notifications",
        "columns": ["id", "message", "target_role", "time"],
        "insert": "INSERT INTO notifications (id, message, target_role, time) VALUES (%s, %s, %s, %s)"
    },
    {
        "name": "assignments",
        "columns": ["id", "title", "deadline", "time_posted"],
        "insert": "INSERT INTO assignments (id, title, deadline, time_posted) VALUES (%s, %s, %s, %s)"
    },
    {
        "name": "login_history",
        "columns": ["id", "username", "role", "time"],
        "insert": "INSERT INTO login_history (id, username, role, time) VALUES (%s, %s, %s, %s)"
    },
]

total_migrated = 0

for table in TABLES:
    name = table["name"]
    cols = ", ".join(table["columns"])
    
    try:
        sqlite_cur.execute(f"SELECT {cols} FROM {name}")
        rows = sqlite_cur.fetchall()
    except sqlite3.OperationalError as e:
        print(f"  [SKIP] {name}: {e}")
        continue
    
    if not rows:
        print(f"  {name}: 0 rows (empty)")
        continue
    
    # Clear existing data in PostgreSQL table
    pg_cur.execute(f"DELETE FROM {name}")
    
    count = 0
    for row in rows:
        try:
            pg_cur.execute(table["insert"], row)
            count += 1
        except Exception as e:
            print(f"  [ERR] Error inserting into {name}: {e}")
            pg_conn.rollback()
            continue
    
    # Reset the serial sequence to max id + 1
    try:
        pg_cur.execute(f"SELECT MAX(id) FROM {name}")
        max_id = pg_cur.fetchone()[0]
        if max_id:
            pg_cur.execute(f"SELECT setval(pg_get_serial_sequence('{name}', 'id'), %s)", (max_id,))
    except Exception:
        pass
    
    pg_conn.commit()
    print(f"  [OK] {name}: {count} rows migrated")
    total_migrated += count

pg_conn.commit()

sqlite_conn.close()
pg_conn.close()

print(f"\nMigration complete! {total_migrated} total rows migrated.")
print("Your app on Render now has all the data.")
