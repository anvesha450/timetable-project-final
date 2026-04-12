import sqlite3

# CREATE TABLE
def create_user_table():
    conn = sqlite3.connect("data/timetable.db")
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    )
    """)

    conn.commit()
    conn.close()


# GET USER
def get_user(username):
    conn = sqlite3.connect("data/timetable.db")
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM users WHERE username=?", (username,))
    user = cursor.fetchone()

    conn.close()
    return user


# ADD USER
def add_user(username, password):
    conn = sqlite3.connect("data/timetable.db")
    cursor = conn.cursor()

    try:
        cursor.execute(
            "INSERT INTO users (username, password) VALUES (?, ?)",
            (username, password)
        )
        conn.commit()
    except:
        pass

    conn.close()