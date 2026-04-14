import random

ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

def generate_ai_timetable(classes, subjects, teachers, rooms, class_subjects, teacher_subjects, days_count=5, periods_count=5, rules=None, teacher_prefs=None):
    if rules is None:
        rules = {"ruleLabRooms": True, "ruleNoConsecutive": True, "ruleOneSubjectPerDay": True}
    if teacher_prefs is None:
        teacher_prefs = {}
    
    # User's strict requirement: 3 Theory + 2 Lab (1 block) + 1 Free = 6 periods total
    # Since the UI might have 8 periods, we will target filling exactly 5 lectures and leaving 1 free in a 6-period window.
    # Actually, he says "total 6 lecture 3 theory and 2 lab". That's 5 lectures? 
    # No, 3 + 2 = 5. Maybe he means 4 theory + 2 lab = 6 lectures? 
    # "3 theory and 2 lab ... and one free" -> 3+2+1 = 6 periods.
    # Let's target exactly 3 theory and 1 lab block (2 periods) per day.

    timetable = []
    
    if not classes or not subjects or not teachers or not rooms:
        return {"error": "Need at least 1 class, 1 subject, 1 teacher, 1 room to generate."}

    subject_map = {s["id"]: s["subject_name"] for s in subjects}
    teacher_map = {t["id"]: t["username"] for t in teachers}
    room_map = {r["id"]: r["room_no"] for r in rooms}
    room_type_map = {r["id"]: (r.get("room_type") or "").lower() for r in rooms}

    subject_to_teachers = teacher_subjects 
    type_to_rooms = {"lab": [], "room": []}
    for rid, rtype in room_type_map.items():
        rt = "lab" if "lab" in rtype or "lab" in room_map[rid].lower() else "room"
        type_to_rooms[rt].append(rid)

    teacher_busy = {} 
    room_busy = {}    
    class_busy = {}   
    
    weekly_counts = {c["id"]: {sid: 0 for sid in class_subjects.get(c["id"], [])} for c in classes}
    class_day_subjects = {c["id"]: {day: set() for day in ALL_DAYS} for c in classes}
    
    days = ALL_DAYS[:days_count]
    # We strictly use the first 6-7 periods to match the user's "3+2+1" mental model
    effective_periods = list(range(1, min(periods_count, 7) + 1))

    # --- PASS 1: Mandatory Daily Lab (1 block of 2 periods) ---
    for day in days:
        for c in random.sample(classes, len(classes)):
            cid = c["id"]
            assigned = class_subjects.get(cid, [])
            labs = [sid for sid in assigned if "lab" in subject_map.get(sid,"").lower() or "practical" in subject_map.get(sid,"").lower()]
            if not labs: continue
            
            # Find a 2-hour block
            found_lab = False
            random.shuffle(labs)
            for sid in labs:
                for i in range(len(effective_periods) - 1):
                    p1, p2 = effective_periods[i], effective_periods[i+1]
                    if class_busy.get((day, p1, cid)) or class_busy.get((day, p2, cid)): continue
                    
                    tid, rid = find_available_resources(sid, True, day, [p1, p2], subject_to_teachers, teacher_busy, teacher_prefs, type_to_rooms, room_busy, True)
                    if tid and rid:
                        for p in [p1, p2]:
                            teacher_busy[(day, p, tid)] = True
                            room_busy[(day, p, rid)] = True
                            class_busy[(day, p, cid)] = True
                            timetable.append(create_entry(cid, c, day, p, sid, subject_map, tid, teacher_map, rid, room_map))
                        weekly_counts[cid][sid] += 2
                        class_day_subjects[cid][day].add(sid)
                        found_lab = True
                        break
                if found_lab: break

    # --- PASS 2: Mandatory Daily Theory (Exactly 3 unique subjects) ---
    for day in days:
        for p in effective_periods:
            shuffled_classes = random.sample(classes, len(classes))
            for c in shuffled_classes:
                cid = c["id"]
                if class_busy.get((day, p, cid)): continue
                
                # Count today's theory
                theory_today = [sid for sid in class_day_subjects[cid][day] if "lab" not in subject_map.get(sid,"").lower() and "practical" not in subject_map.get(sid,"").lower()]
                if len(theory_today) >= 3: continue # Limit to 3 theory per day as requested
                
                assigned_sids = class_subjects.get(cid, [])
                theory_pool = [sid for sid in assigned_sids if "lab" not in subject_map.get(sid,"").lower() and "practical" not in subject_map.get(sid,"").lower()]
                
                # Rule: No subject twice in one day
                allowed = [sid for sid in theory_pool if sid not in class_day_subjects[cid][day]]
                if not allowed: continue
                
                allowed.sort(key=lambda s: weekly_counts[cid][s])
                
                for sid in allowed:
                    tid, rid = find_available_resources(sid, False, day, [p], subject_to_teachers, teacher_busy, teacher_prefs, type_to_rooms, room_busy, False)
                    if tid:
                        if not rid and type_to_rooms["room"]: rid = random.choice(type_to_rooms["room"])
                        elif not rid and rooms: rid = rooms[0]["id"]
                        teacher_busy[(day, p, tid)] = True
                        class_busy[(day, p, cid)] = True
                        timetable.append(create_entry(cid, c, day, p, sid, subject_map, tid, teacher_map, rid, room_map))
                        weekly_counts[cid][sid] += 1
                        class_day_subjects[cid][day].add(sid)
                        break

    return {"status": "success", "timetable": timetable, "lunch_after_period": rules.get("lunchAfterPeriod", 0)}

def find_available_resources(sid, is_lab, day, periods, subject_to_teachers, teacher_busy, teacher_prefs, type_to_rooms, room_busy, enforce_room):
    potential_teachers = subject_to_teachers.get(sid, [])
    if not potential_teachers: return None, None
    valid_teachers = []
    for item in potential_teachers:
        tid, prio = (item[0], item[1]) if isinstance(item, (list, tuple)) else (item, 1)
        if any(teacher_busy.get((day, p, tid)) for p in periods): continue
        prefs = [teacher_prefs.get(tid, {}).get((day, p), "Neutral") for p in periods]
        if "Unavailable" in prefs: continue
        score = prio * 10 + sum(20 if pf == "Preferred" else -10 if pf == "Avoid" else 0 for pf in prefs)
        valid_teachers.append((tid, score))

    if not valid_teachers: return None, None
    valid_teachers.sort(key=lambda x: x[1], reverse=True)
    
    for tid_score in valid_teachers:
        tid = tid_score[0]
        target_rid = None
        target_type = "lab" if is_lab else "room"
        potential_rooms = type_to_rooms.get(target_type, [])
        if not potential_rooms: potential_rooms = type_to_rooms.get("room", []) + type_to_rooms.get("lab", [])
        for rid in potential_rooms:
            if all(not room_busy.get((day, p, rid)) for p in periods):
                target_rid = rid
                break
        if not enforce_room and not target_rid and potential_rooms:
            target_rid = random.choice(potential_rooms)
        if tid and (target_rid or not enforce_room):
            return tid, target_rid
    return None, None

def create_entry(cid, c, day, p, sid, subject_map, tid, teacher_map, rid, room_map):
    return {
        "class_id": cid, "course_name": c["course_name"], "section": c["section"],
        "day": day, "period": p, "subject_id": sid, "subject_name": subject_map.get(sid, "N/A"),
        "teacher_id": tid, "teacher_name": teacher_map.get(tid, "No Teacher"),
        "room_id": rid, "room_no": room_map.get(rid, "No Room")
    }