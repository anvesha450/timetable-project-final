import sqlite3, psycopg2, os, sys

SQLITE_PATH = os.path.join("data", "timetable.db")
PG_URL = sys.argv[1]

print("Connecting...", flush=True)
sq = sqlite3.connect(SQLITE_PATH)
pg = psycopg2.connect(PG_URL, sslmode="require", connect_timeout=10)
print("Connected!", flush=True)

tables_cols = {
    "users": ("id","username","password","role"),
    "subjects": ("id","subject_name","subject_code"),
    "classes": ("id","course_name","section","student_strength"),
    "rooms": ("id","room_no","capacity","room_type"),
    "teacher_subjects": ("id","teacher_id","subject_id","priority"),
    "class_subjects": ("id","class_id","subject_id"),
    "timetables": ("id","class_id","day","period","subject_id","teacher_id","room_id","substitute_id"),
    "teacher_preferences": ("id","teacher_id","day","period","pref_type"),
    "timetable_rules": ("id","rule_name","rule_description","is_active"),
    "notifications": ("id","message","target_role","time"),
    "assignments": ("id","title","deadline","time_posted"),
    "login_history": ("id","username","role","time"),
}

total = 0
for tbl, cols in tables_cols.items():
    col_str = ", ".join(cols)
    try:
        rows = sq.execute(f"SELECT {col_str} FROM {tbl}").fetchall()
    except Exception:
        print(f"  SKIP {tbl}", flush=True)
        continue
    if not rows:
        print(f"  {tbl}: empty", flush=True)
        continue

    cur = pg.cursor()
    cur.execute(f"DELETE FROM {tbl}")
    pg.commit()

    ph = ", ".join(["%s"] * len(cols))
    count = 0
    for r in rows:
        try:
            cur.execute(f"INSERT INTO {tbl} ({col_str}) VALUES ({ph})", r)
            count += 1
        except Exception as e:
            pg.rollback()
            print(f"  ERR {tbl}: {e}", flush=True)
            continue

    # Reset serial sequence
    try:
        cur.execute(f"SELECT setval(pg_get_serial_sequence('{tbl}', 'id'), (SELECT COALESCE(MAX(id), 1) FROM {tbl}))")
    except Exception:
        pg.rollback()

    pg.commit()
    print(f"  OK {tbl}: {count} rows", flush=True)
    total += count

sq.close()
pg.close()
print(f"\nDone! {total} total rows migrated.", flush=True)
