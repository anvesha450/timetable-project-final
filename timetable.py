import random

ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

def generate_ai_timetable(classes, subjects, teachers, rooms, class_subjects, teacher_subjects, days_count=5, periods_count=5, rules=None, teacher_prefs=None):
    if rules is None:
        rules = {"ruleLabRooms": True, "ruleNoConsecutive": True, "ruleOneSubjectPerDay": False}
    if teacher_prefs is None:
        teacher_prefs = {}
        
    rule_lab_rooms = rules.get("ruleLabRooms", True)
    rule_no_consecutive = rules.get("ruleNoConsecutive", True)
    rule_one_subject_per_day = rules.get("ruleOneSubjectPerDay", False)
    lunch_after_period = rules.get("lunchAfterPeriod", 0)  # 0 means no lunch

    timetable = []
    
    if not classes or not subjects or not teachers or not rooms:
        return {"error": "Need at least 1 class, 1 subject, 1 teacher, 1 room to generate."}

    # Helper maps
    subject_map = {s["id"]: s["subject_name"] for s in subjects}
    subject_code_map = {s["id"]: s.get("subject_code", "") for s in subjects}
    
    subject_name_to_ids = {}
    for s in subjects:
        name = s["subject_name"].lower().strip()
        if name not in subject_name_to_ids:
            subject_name_to_ids[name] = []
        subject_name_to_ids[name].append(s["id"])

    teacher_map = {t["id"]: t["username"] for t in teachers}
    room_map = {r["id"]: r["room_no"] for r in rooms}
    room_type_map = {r["id"]: (r.get("room_type") or "").lower() for r in rooms}

    # Track busy status
    teacher_busy = {} # (day, period, teacher_id) -> bool
    room_busy = {}    # (day, period, room_id) -> bool

    # Track subjects assigned per class per day (for one-subject-per-day rule)
    class_day_subjects = {}  # (class_id, day) -> set of subject_ids

    days = ALL_DAYS[:days_count]
    random.shuffle(classes)

    for c in classes:
        cid = c["id"]
        assigned_subject_ids = class_subjects.get(cid, [])
        if not assigned_subject_ids: continue

        # Calculate effective periods (excluding lunch)
        effective_periods = list(range(1, periods_count + 1))
        if lunch_after_period > 0:
            # The lunch period is after the specified period
            # So we skip that slot in actual assignment
            lunch_period = lunch_after_period + 1
            # Shift periods: 1..lunch_after become periods 1..lunch_after,
            # lunch_period is the lunch break,
            # remaining become lunch_period+1..periods_count+1
            effective_periods = []
            actual_period = 1
            for p in range(1, periods_count + 2):  # +2 because lunch adds one
                if p == lunch_period:
                    continue  # skip lunch slot
                effective_periods.append(p)
                actual_period += 1
                if len(effective_periods) >= periods_count:
                    break

        total_slots = days_count * len(effective_periods)
        subject_pool = []
        while len(subject_pool) < total_slots:
            random.shuffle(assigned_subject_ids)
            subject_pool.extend(assigned_subject_ids)
        
        pool_idx = 0
        for day in days:
            prev_subject_id = None
            if (cid, day) not in class_day_subjects:
                class_day_subjects[(cid, day)] = set()
            
            for period in effective_periods:
                found_slot = False
                attempts = 0
                max_attempts = len(assigned_subject_ids) * 5
                
                while not found_slot and attempts < max_attempts:
                    sid = subject_pool[(pool_idx + attempts) % len(subject_pool)]
                    
                    # Rule: No consecutive same subject
                    if rule_no_consecutive and sid == prev_subject_id:
                        attempts += 1
                        continue
                    
                    # Rule: One subject per day (each subject appears at most once per day)
                    if rule_one_subject_per_day and sid in class_day_subjects.get((cid, day), set()):
                        attempts += 1
                        continue
                        
                    sname = subject_map[sid].lower().strip()
                    scode = subject_code_map[sid].lower()
                    is_lab_subject = "lab" in sname or "lab" in scode
                    
                    qualified_teachers = []
                    
                    # 1. Direct match by ID
                    qualified_teachers.extend(teacher_subjects.get(sid, []))
                    
                    # 2. Match by exact Name
                    related_sids = subject_name_to_ids.get(sname, [sid])
                    for rsid in related_sids:
                        qualified_teachers.extend(teacher_subjects.get(rsid, []))
                    
                    # 3. Fuzzy Match / Lab Match fallback
                    if not qualified_teachers:
                        # Try to find base subject if it's a lab
                        base_name = sname.replace("lab", "").replace("practical", "").replace("project", "").strip()
                        # Also handle " -A1" type suffixes
                        if " " in base_name:
                            base_name = base_name.split(" -")[0].strip()
                        
                        # Find any subject name that contains this base name or is contained in it
                        for name, ids in subject_name_to_ids.items():
                            if (base_name in name or name in base_name) and base_name:
                                for rsid in ids:
                                    qualified_teachers.extend(teacher_subjects.get(rsid, []))
                    
                    # Track teacher priorities for this subject
                    teacher_priority_map = {} # tid -> max priority found
                    for item in qualified_teachers:
                        if isinstance(item, tuple):
                            tid, prio = item
                        else:
                            tid, prio = item, 1
                        
                        # Fix: Only include if teacher exists in teacher_map
                        if tid in teacher_map:
                            teacher_priority_map[tid] = max(teacher_priority_map.get(tid, 1), prio)
                    
                    # Score available teachers based on preferences
                    teacher_scores = []
                    for tid, subject_priority in teacher_priority_map.items():
                        if teacher_busy.get((day, period, tid)): continue
                        
                        pref = teacher_prefs.get(tid, {}).get((day, period), "Neutral")
                        if pref == "Unavailable": continue
                        
                        # Base Preference Score
                        pref_score = 10 # Neutral
                        if pref == "Preferred": pref_score = 20
                        if pref == 'Avoid': pref_score = 5
                        
                        # MULTIPLY BY SUBJECT CHOICE/PRIORITY
                        final_score = pref_score * subject_priority
                        
                        teacher_scores.append((tid, final_score))
                    
                    # Sort by score descending
                    teacher_scores.sort(key=lambda x: x[1], reverse=True)
                    available_teachers = [t[0] for t in teacher_scores]
                    
                    potential_rooms = [rid for rid in room_map.keys() if not room_busy.get((day, period, rid))]
                    preferred_rooms = []
                    if rule_lab_rooms:
                        if is_lab_subject:
                            preferred_rooms = [rid for rid in potential_rooms if "lab" in room_type_map[rid] or "lab" in room_map[rid].lower()]
                        else:
                            preferred_rooms = [rid for rid in potential_rooms if "lab" not in room_type_map[rid] and "lab" not in room_map[rid].lower()]
                    
                    final_room_id = None
                    if preferred_rooms: final_room_id = random.choice(preferred_rooms)
                    elif potential_rooms: final_room_id = random.choice(potential_rooms)
                    
                    if not final_room_id and attempts < (max_attempts - 1):
                        attempts += 1
                        continue
                    
                    # Best available teacher (highest preference)
                    teacher_id = available_teachers[0] if available_teachers else None
                    
                    if teacher_id:
                        teacher_busy[(day, period, teacher_id)] = True
                    if final_room_id:
                        room_busy[(day, period, final_room_id)] = True
                    
                    # Track this subject for the one-per-day rule
                    class_day_subjects[(cid, day)].add(sid)
                    
                    timetable.append({
                        "class_id": cid,
                        "course_name": c["course_name"],
                        "section": c["section"],
                        "day": day,
                        "period": period,
                        "subject_id": sid,
                        "subject_name": subject_map[sid],
                        "teacher_id": teacher_id,
                        "teacher_name": teacher_map[teacher_id] if teacher_id else "No Teacher Assigned",
                        "room_id": final_room_id,
                        "room_no": room_map[final_room_id] if final_room_id else "No Room Available"
                    })
                    pool_idx = (pool_idx + attempts + 1) % len(subject_pool)
                    found_slot = True
                    prev_subject_id = sid
                
                if not found_slot:
                    pass

    return {"status": "success", "timetable": timetable, "lunch_after_period": lunch_after_period}