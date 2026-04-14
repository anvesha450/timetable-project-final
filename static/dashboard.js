// Switch sections
function showSection(id) {
    document.querySelectorAll(".section").forEach(sec => {
        sec.style.display = "none";
    });

    document.getElementById(id).style.display = "block";
}

// Load data
async function loadDashboard() {
    const [data, settings] = await Promise.all([
        (await fetch("/admin-data")).json(),
        (await fetch("/api/settings")).json()
    ]);

    if(settings.academic_calendar && document.getElementById("calendarUrlInput")) {
        document.getElementById("calendarUrlInput").value = settings.academic_calendar;
    }

    // Populate dashboard counts
    if (document.getElementById("dashTeacherCount")) {
        document.getElementById("dashTeacherCount").innerText = data.teachers ? data.teachers.length : 0;
        document.getElementById("dashStudentCount").innerText = data.students ? data.students.length : 0;
        document.getElementById("dashSubjectCount").innerText = data.subjects ? data.subjects.length : 0;
        document.getElementById("dashClassCount").innerText = data.classes ? data.classes.length : 0;
    }
    
    // Populate Assign Subject Modals
    if (document.getElementById("assignTeacherSelect")) {
        document.getElementById("assignTeacherSelect").innerHTML = `<option value="">-- Select a Teacher --</option>` + 
            (data.teachers || []).map(t => `<option value="${t.id}">${t.username}</option>`).join("");

        document.getElementById("assignSubjectSelect").innerHTML = `<option value="">-- Select a Subject --</option>` + 
            (data.subjects || []).map(s => `<option value="${s.id}">${s.subject_name} (${s.subject_code})</option>`).join("");
    }

    if (document.getElementById("assignClassSelect")) {
        document.getElementById("assignClassSelect").innerHTML = `<option value="">-- Select a Class --</option>` + 
            (data.classes || []).map(c => `<option value="${c.id}">${c.course_name} - ${c.section}</option>`).join("");

        document.getElementById("assignClassSubjectSelect").innerHTML = `<option value="">-- Select a Subject --</option>` + 
            (data.subjects || []).map(s => `<option value="${s.id}">${s.subject_name} (${s.subject_code})</option>`).join("");
    }

    if (document.getElementById("viewClassCards")) {
        const classEntries = data.classes || [];
        // Group by course_name
        const grouped = {};
        classEntries.forEach(c => {
            if (!grouped[c.course_name]) grouped[c.course_name] = [];
            grouped[c.course_name].push(c);
        });

        let html = "";
        for (const semester in grouped) {
            const safeCourseName = semester.replace(/&/g, '&amp;').replace(/'/g, '&#39;');
            html += `<div style="width: 100%; margin-bottom: 30px;">
                <h3 style="text-align: left; margin-bottom: 15px; color: #2d3436; border-left: 5px solid #74b9ff; padding-left: 15px;">${semester}</h3>
                <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                    ${grouped[semester].map(c => {
                        const safeSection = (c.section || '').replace(/&/g, '&amp;').replace(/'/g, '&#39;');
                        return `
                        <button class="card interactive-card clickable-section-btn" data-class-id="${c.id}" data-class-name="${safeCourseName} - Section ${safeSection}" style="min-width: 120px; text-align: center; cursor: pointer; border: 2px solid #ecf0f1; background: white;">
                            <i class="fa fa-users" style="color: #74b9ff; margin-bottom: 8px;"></i><br>
                            <b>Section ${c.section}</b>
                        </button>
                    `}).join("")}
                </div>
            </div>`;
        }
        document.getElementById("viewClassCards").innerHTML = html || "<p>No classes found.</p>";
        // Attach click handlers safely (avoids special char issues in inline onclick)
        document.querySelectorAll('#viewClassCards .clickable-section-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('#viewClassCards .clickable-section-btn').forEach(b => b.style.borderColor='#ecf0f1');
                this.style.borderColor='#74b9ff';
                loadClassTimetable(parseInt(this.dataset.classId), this.dataset.className);
            });
        });
    }

    // Populate Edit Timetable class cards
    if (document.getElementById("editClassCards")) {
        const classEntries = data.classes || [];
        const grouped = {};
        classEntries.forEach(c => {
            if (!grouped[c.course_name]) grouped[c.course_name] = [];
            grouped[c.course_name].push(c);
        });
        let html = "";
        for (const semester in grouped) {
            const safeCourseName = semester.replace(/&/g, '&amp;').replace(/'/g, '&#39;');
            html += `<div style="width: 100%; margin-bottom: 20px;">
                <h3 style="text-align: left; margin-bottom: 10px; color: #2d3436; border-left: 5px solid #f59e0b; padding-left: 15px; font-size: 15px;">${semester}</h3>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    ${grouped[semester].map(c => {
                        const safeSection = (c.section || '').replace(/&/g, '&amp;').replace(/'/g, '&#39;');
                        return `
                        <button class="card interactive-card edit-class-btn" data-class-id="${c.id}" data-class-name="${safeCourseName} - Section ${safeSection}" style="min-width: 100px; text-align: center; cursor: pointer; border: 2px solid #ecf0f1; background: white; padding: 10px 15px;">
                            <i class="fa fa-users" style="color: #f59e0b; margin-bottom: 5px;"></i><br>
                            <b style="font-size: 12px;">Section ${c.section}</b>
                        </button>
                    `}).join("")}
                </div>
            </div>`;
        }
        document.getElementById("editClassCards").innerHTML = html || "<p>No classes found.</p>";
        document.querySelectorAll('#editClassCards .edit-class-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('#editClassCards .edit-class-btn').forEach(b => b.style.borderColor='#ecf0f1');
                this.style.borderColor='#f59e0b';
                loadEditClassTimetable(parseInt(this.dataset.classId), this.dataset.className);
            });
        });
    }

    // Update timing preview
    if (document.getElementById('timingPreviewContent')) updateTimingPreview();

    // Teacher Logins
    const teacherLogins = data.logins.filter(u => u.role === 'teacher');
    if (document.getElementById("teacherLoginList")) {
        document.getElementById("teacherLoginList").innerHTML = teacherLogins.map(u => `<tr>
            <td>${u.name}</td>
            <td>${u.time}</td>
        </tr>`).join("");
    }

    // Student Logins
    const studentLogins = data.logins.filter(u => u.role === 'student');
    if (document.getElementById("studentLoginList")) {
        document.getElementById("studentLoginList").innerHTML = studentLogins.map(u => `<tr>
            <td>${u.name}</td>
            <td>${u.time}</td>
        </tr>`).join("");
    }

    // Lists
    document.getElementById("teacherList").innerHTML =
        data.teachers.map(t => `<tr>
            <td>
                <b>${t.username}</b>
                <div style="font-size: 12px; color: #64748b; margin-top: 5px;">
                    ${t.assigned_subjects && t.assigned_subjects.length > 0 ? t.assigned_subjects.map(sub => `
                        <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; display: inline-block; margin: 2px;">
                            ${sub.name} 
                            <span style="margin-left: 5px; color: #3b82f6; font-weight: bold;" title="Priority Choice">#${sub.priority || 1}</span>
                            <i class="fa fa-times" style="color: #ef4444; cursor: pointer; margin-left: 6px;" onclick="unassignTeacherSubject(${t.id}, ${sub.id})" title="Remove Subject"></i>
                        </span>
                    `).join('') : '<i style="color: #94a3b8;">No subjects assigned</i>'}
                </div>
            </td>
            <td>
                <button class="btn-edit" onclick="openUserModal('teacher', ${t.id}, '${t.username}', '${t.password}')">Edit</button>
                <button class="btn-ai" style="padding: 5px 12px; font-size: 11px; background: #f59e0b;" onclick="markTeacherAbsent(${t.id}, '${t.username}')">Mark Absent</button>
                <button class="btn-delete" onclick="deleteUser(${t.id})">Delete</button>
            </td>
        </tr>`).join("");

    document.getElementById("studentList").innerHTML =
        data.students.map(s => `<tr>
            <td>${s.username}</td>
            <td>
                <button class="btn-edit" onclick="openUserModal('student', ${s.id}, '${s.username}', '${s.password}')">Edit</button>
                <button class="btn-delete" onclick="deleteUser(${s.id})">Delete</button>
            </td>
        </tr>`).join("");

    if (document.getElementById("subjectList")) {
        document.getElementById("subjectList").innerHTML =
            (data.subjects || []).map(s => `<tr>
                <td>${s.subject_name}</td>
                <td>${s.subject_code}</td>
                <td>
                    <button class="btn-edit" onclick="openSubjectModal(${s.id}, '${s.subject_name}', '${s.subject_code}')">Edit</button>
                    <button class="btn-delete" onclick="deleteSubject(${s.id})">Delete</button>
                </td>
            </tr>`).join("");
    }

    if (document.getElementById("classList")) {
        const classEntries = data.classes || [];
        document.getElementById("classList").innerHTML =
            classEntries.map(c => `<tr>
                <td>
                    <b>${c.course_name}</b>
                    <div style="font-size: 12px; color: #64748b; margin-top: 5px;">
                        ${c.assigned_subjects && c.assigned_subjects.length > 0 ? c.assigned_subjects.map(sub => `<span style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; display: inline-block; margin: 2px;">${sub.name} <i class="fa fa-times" style="color: #ef4444; cursor: pointer; margin-left: 4px;" onclick="unassignClassSubject(${c.id}, ${sub.id})" title="Remove Subject"></i></span>`).join('') : '<i style="color: #94a3b8;">No subjects assigned</i>'}
                    </div>
                </td>
                <td>${c.section}</td>
                <td>${c.student_strength}</td>
                <td>
                    <button class="btn-edit" onclick="openClassModal(${c.id}, '${c.course_name.replace(/'/g, "\\'")}', '${c.section.replace(/'/g, "\\'")}', ${c.student_strength})">Edit</button>
                    <button class="btn-delete" onclick="deleteClass(${c.id})">Delete</button>
                </td>
            </tr>`).join("");

        // GROUPED VIEW
        const accordion = document.getElementById("classAccordion");
        if (accordion) {
            accordion.innerHTML = "";
            const groups = {};
            classEntries.forEach(c => {
                if (!groups[c.course_name]) groups[c.course_name] = [];
                groups[c.course_name].push(c);
            });

            const sortedGroups = Object.keys(groups).sort();
            sortedGroups.forEach(course => {
                const groupDiv = document.createElement("div");
                groupDiv.className = "section-box";
                groupDiv.style.marginBottom = "20px";
                groupDiv.innerHTML = `<h3><i class="fa fa-graduation-cap" style="color:#3b82f6; margin-right:10px;"></i> ${course}</h3>`;
                
                const table = document.createElement("table");
                table.style.marginTop = "10px";
                table.innerHTML = `
                    <thead>
                        <tr>
                            <th style="width: 30%;">Section Type</th>
                            <th>Details</th>
                            <th style="width: 25%;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                    </tbody>
                `;
                const tbody = table.querySelector("tbody");
                
                const general = groups[course].find(c => c.section.includes("General"));
                const aiml = groups[course].find(c => c.section.includes("AIML") || c.section.includes("Cyber"));
                const others = groups[course].filter(c => c !== general && c !== aiml);

                const renderRow = (c, label) => {
                    const defaultSection = label === "General Section" ? "A (General)" : "B (AIML & Cyber)";
                    if (!c) return `<tr><td style="color:#94a3b8;">${label}</td><td style="color:#94a3b8; font-style:italic;">Not Configured</td><td><button class="btn-ai" style="padding: 5px 12px; font-size: 12px;" onclick="openClassWithDefaults('${course.replace(/'/g, "\\'")}', '${defaultSection}')">+ Add This Section</button></td></tr>`;
                    
                    return `<tr>
                        <td><b>${label}</b><br><small style="color:#64748b">${c.section}</small></td>
                        <td>
                            Strength: <b>${c.student_strength}</b>
                            <div style="font-size: 12px; color: #64748b; margin-top: 5px;">
                                ${c.assigned_subjects && c.assigned_subjects.length > 0 ? c.assigned_subjects.map(sub => `<span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; display: inline-block; margin: 2px;">${sub.name}</span>`).join('') : '<i style="color: #94a3b8;">No subjects</i>'}
                            </div>
                        </td>
                        <td>
                            <button class="btn-edit" onclick="openClassModal(${c.id}, '${c.course_name.replace(/'/g, "\\'")}', '${c.section.replace(/'/g, "\\'")}', ${c.student_strength})">Edit</button>
                            <button class="btn-delete" onclick="deleteClass(${c.id})">Delete</button>
                        </td>
                    </tr>`;
                };

                tbody.innerHTML += renderRow(general, "General Section");
                tbody.innerHTML += renderRow(aiml, "AI/ML & Cyber Section");
                
                others.forEach(c => {
                    tbody.innerHTML += renderRow(c, "Other Section");
                });

                groupDiv.appendChild(table);
                accordion.appendChild(groupDiv);
            });
        }
    }

function openClassWithDefaults(course, section) {
    openClassModal(null, course, section, 60);
}

    if (document.getElementById("roomList")) {
        document.getElementById("roomList").innerHTML =
            (data.rooms || []).map(r => `<tr>
                <td>${r.room_no}</td>
                <td>${r.capacity}</td>
                <td>${r.room_type}</td>
                <td>
                    <button class="btn-edit" onclick="openRoomModal(${r.id}, '${r.room_no}', ${r.capacity}, '${r.room_type}')">Edit</button>
                    <button class="btn-delete" onclick="deleteRoom(${r.id})">Delete</button>
                </td>
            </tr>`).join("");
    }

    // RULES
    if (document.getElementById("rulesList")) {
        document.getElementById("rulesList").innerHTML = (data.rules || []).map(r => `<tr>
            <td><b>${r.rule_name}</b></td>
            <td>${r.rule_description}</td>
            <td><button class="btn-delete" onclick="deleteRule(${r.id})">Delete</button></td>
        </tr>`).join("");

        // Also update generation view checkboxes
        const genContainer = document.getElementById("additionalRulesContainer");
        if (genContainer) {
            genContainer.innerHTML = (data.rules || []).map(r => `
                <div style="margin-bottom: 12px;">
                    <label style="display: flex; align-items: center; cursor: pointer; color: #475569;">
                        <input type="checkbox" class="dynamic-rule-checkbox" data-rule-id="${r.id}" checked style="width: 18px; height: 18px; margin-right: 12px; cursor: pointer;">
                        <span><b>${r.rule_name}</b> (${r.rule_description})</span>
                    </label>
                </div>
            `).join("");
        }
    }
}

// AI
async function generateAI() {
    const days = document.getElementById("constraintDays").value || 5;
    const periods = document.getElementById("constraintPeriods").value || 5;
    const ruleLabRooms = document.getElementById("ruleLabRooms").checked;
    const ruleNoConsecutive = document.getElementById("ruleNoConsecutive").checked;
    const ruleOneSubjectPerDay = document.getElementById("ruleOneSubjectPerDay") ? document.getElementById("ruleOneSubjectPerDay").checked : false;
    const lunchAfterPeriod = parseInt(document.getElementById("lunchAfterPeriod") ? document.getElementById("lunchAfterPeriod").value : 0);
    
    // Collect dynamic rules
    const dynamicRules = {};
    document.querySelectorAll(".dynamic-rule-checkbox").forEach(cb => {
        dynamicRules["custom_" + cb.getAttribute("data-rule-id")] = cb.checked;
    });

    // Save period timing to localStorage for viewing later
    const periodStartTime = document.getElementById('periodStartTime') ? document.getElementById('periodStartTime').value : '09:00';
    const periodDuration = document.getElementById('periodDuration') ? parseInt(document.getElementById('periodDuration').value) : 50;
    const lunchDuration = document.getElementById('lunchDuration') ? parseInt(document.getElementById('lunchDuration').value) : 30;
    localStorage.setItem('tt_periodStartTime', periodStartTime);
    localStorage.setItem('tt_periodDuration', periodDuration);
    localStorage.setItem('tt_lunchAfterPeriod', lunchAfterPeriod);
    localStorage.setItem('tt_lunchDuration', lunchDuration);
    localStorage.setItem('tt_periodsCount', periods);

    document.getElementById("aiResult").innerHTML = `
        <div style="text-align:center; padding: 20px;">
            <i class="fa fa-spinner fa-spin" style="font-size: 30px; color: #3b82f6;"></i>
            <p style="margin-top:10px;"><b>Generating Artificial Intelligence Timetable...</b><br>Applying complex rules and teacher preferences.</p>
        </div>
    `;

    try {
        const res = await fetch("/api/generate_timetable", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                days: parseInt(days), 
                periods: parseInt(periods),
                rules: { ruleLabRooms, ruleNoConsecutive, ruleOneSubjectPerDay, lunchAfterPeriod, ...dynamicRules }
            })
        });
        const result = await res.json();

        if (result.error) {
            document.getElementById("aiResult").innerHTML = `<div style="color:#ef4444; background:#fef2f2; padding:15px; border-radius:8px; border:1px solid #fee2e2;">❌ <b>Generation Failed:</b> ${result.error}</div>`;
            return;
        }

        if (result.status === "success") {
            document.getElementById("aiResult").innerHTML = `
                <div style="color:#10b981; background:#ecfdf5; padding:15px; border-radius:8px; border:1px solid #d1fae5; text-align:center;">
                    <i class="fa fa-check-circle" style="font-size: 24px;"></i><br>
                    <b>Success!</b> All timetables were generated in one go.<br>
                    <p style="font-size:12px; margin-top:5px;">You can now view the updated schedules in the 'View Timetable' tab.</p>
                </div>
            `;
            alert("✅ Timetable Processed Successfully for all classes!");
            loadDashboard(); // Refresh any cached data
            
            let html = `
            <table style="width:100%; text-align:left; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 2px solid #ccc; padding-bottom:10px;">
                        <th>Class</th>
                        <th>Day</th>
                        <th>Period</th>
                        <th>Subject</th>
                        <th>Teacher</th>
                        <th>Room</th>
                    </tr>
                </thead>
                <tbody>
            `;
            
            // Show up to 10 entries as preview
            const previewList = result.timetable.slice(0, 10);
            
            for (let t of previewList) {
                html += `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 8px 0;">${t.course_name} - ${t.section}</td>
                        <td style="padding: 8px 0;">${t.day}</td>
                        <td style="padding: 8px 0;">${t.period}</td>
                        <td style="padding: 8px 0;">${t.subject_name}</td>
                        <td style="padding: 8px 0;">${t.teacher_name}</td>
                        <td style="padding: 8px 0;">${t.room_no}</td>
                    </tr>
                `;
            }

            html += `</tbody></table>`;
            if (result.timetable.length > 10) {
                html += `<p style="margin-top:10px; font-size:14px; color:#555;"><i>... and ${result.timetable.length - 10} more entries generated.</i></p>`;
            }

            document.getElementById("aiResult").innerHTML += html;
        }
    } catch (e) {
        document.getElementById("aiResult").innerHTML = `<span style="color:red">❌ Error generating timetable (Backend unreachable / Server Error).</span>`;
    }
}

// Notification
async function sendNotification() {
    const msg = document.getElementById("message").value;
    const notifyTarget = document.getElementById("notifyTarget").value;

    if (!msg) {
        alert("Please enter a message!");
        return;
    }

    const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, target_role: notifyTarget })
    });

    const result = await res.json();
    if (result.status === "success") {
        alert("Notification Sent Successfully!");
        document.getElementById("message").value = "";
    } else {
        alert("Error sending notification");
    }
}

// Logout
function logout() {
    window.location.href = "/";
}

// User Management
function openUserModal(role, id = null, username = '', password = '') {
    document.getElementById("userRole").value = role;
    document.getElementById("userId").value = id || '';
    document.getElementById("usernameInput").value = username;
    document.getElementById("passwordInput").value = password;
    document.getElementById("modalTitle").innerText = id ? `Edit ${role}` : `Add ${role}`;
    document.getElementById("userModal").style.display = "flex";
}

function closeUserModal() {
    document.getElementById("userModal").style.display = "none";
}

async function saveUser() {
    const role = document.getElementById("userRole").value;
    const id = document.getElementById("userId").value;
    const username = document.getElementById("usernameInput").value;
    const password = document.getElementById("passwordInput").value;

    if (!username) {
        alert("Please enter a username/name.");
        return;
    }

    const payload = { username, password, role };
    const url = id ? `/api/user/${id}` : `/api/user`;
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.status === "success") {
        closeUserModal();
        loadDashboard(); // Refresh data
    } else {
        alert("Error saving user");
    }
}

async function deleteUser(id) {
    if (!confirm("Are you sure you want to delete this user?")) return;

    const res = await fetch(`/api/user/${id}`, { method: 'DELETE' });
    const result = await res.json();

    if (result.status === "success") {
        loadDashboard(); // Refresh data
    } else {
        alert("Error deleting user");
    }
}

// Subject Management
function openSubjectModal(id = null, subject_name = '', subject_code = '') {
    document.getElementById("subjectId").value = id || '';
    document.getElementById("subjectNameInput").value = subject_name;
    document.getElementById("subjectCodeInput").value = subject_code;
    document.getElementById("subjectModalTitle").innerText = id ? `Edit Subject` : `Add Subject`;
    document.getElementById("subjectModal").style.display = "flex";
}

function closeSubjectModal() {
    document.getElementById("subjectModal").style.display = "none";
}

async function saveSubject() {
    const id = document.getElementById("subjectId").value;
    const subject_name = document.getElementById("subjectNameInput").value;
    const subject_code = document.getElementById("subjectCodeInput").value;

    if (!subject_name || !subject_code) {
        alert("Please enter both subject name and code");
        return;
    }

    const payload = { subject_name, subject_code };
    const url = id ? `/api/subject/${id}` : `/api/subject`;
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.status === "success") {
        closeSubjectModal();
        loadDashboard(); // Refresh data
    } else {
        alert("Error saving subject");
    }
}

async function deleteSubject(id) {
    if (!confirm("Are you sure you want to delete this subject?")) return;

    const res = await fetch(`/api/subject/${id}`, { method: 'DELETE' });
    const result = await res.json();

    if (result.status === "success") {
        loadDashboard(); // Refresh data
    } else {
        alert("Error deleting subject");
    }
}

// Load on start
window.onload = loadDashboard;

// Class Management
function openClassModal(id = null, course_name = '', section = '', strength = '') {
    document.getElementById("classId").value = id || '';
    document.getElementById("courseNameInput").value = course_name;
    document.getElementById("sectionInput").value = section;
    document.getElementById("strengthInput").value = strength;
    document.getElementById("classModalTitle").innerText = id ? `Edit Class` : `Add Class`;
    document.getElementById("classModal").style.display = "flex";
}

function closeClassModal() {
    document.getElementById("classModal").style.display = "none";
}

async function saveClass() {
    const id = document.getElementById("classId").value;
    const course_name = document.getElementById("courseNameInput").value;
    const section = document.getElementById("sectionInput").value;
    const student_strength = document.getElementById("strengthInput").value;

    if (!course_name || !section || !student_strength) {
        alert("Please fill all class fields");
        return;
    }

    const payload = { course_name, section, student_strength: parseInt(student_strength) };
    const url = id ? `/api/class/${id}` : `/api/class`;
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.status === "success") {
        closeClassModal();
        loadDashboard(); // Refresh data
    } else {
        alert("Error saving class");
    }
}

async function deleteClass(id) {
    if (!confirm("Are you sure you want to delete this class?")) return;
    const res = await fetch(`/api/class/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.status === "success") loadDashboard();
    else alert("Error deleting class");
}

// Room Management
function openRoomModal(id = null, room_no = '', capacity = '', room_type = '') {
    document.getElementById("roomId").value = id || '';
    document.getElementById("roomNoInput").value = room_no;
    document.getElementById("capacityInput").value = capacity;
    document.getElementById("roomTypeInput").value = room_type;
    document.getElementById("roomModalTitle").innerText = id ? `Edit Room/Lab` : `Add Room/Lab`;
    document.getElementById("roomModal").style.display = "flex";
}

function closeRoomModal() {
    document.getElementById("roomModal").style.display = "none";
}

async function saveRoom() {
    const id = document.getElementById("roomId").value;
    const room_no = document.getElementById("roomNoInput").value;
    const capacity = document.getElementById("capacityInput").value;
    const room_type = document.getElementById("roomTypeInput").value;

    if (!room_no || !capacity || !room_type) {
        alert("Please fill all room fields");
        return;
    }

    const payload = { room_no, capacity: parseInt(capacity), room_type };
    const url = id ? `/api/room/${id}` : `/api/room`;
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.status === "success") {
        closeRoomModal();
        loadDashboard(); // Refresh data
    } else {
        alert("Error saving room");
    }
}

async function deleteRoom(id) {
    if (!confirm("Are you sure you want to delete this room?")) return;
    const res = await fetch(`/api/room/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.status === "success") loadDashboard();
    else alert("Error deleting room");
}

async function addRule() {
    const name = document.getElementById("newRuleName").value;
    const desc = document.getElementById("newRuleDesc").value;
    if (!name) return alert("Please enter a rule name");

    await fetch("/api/rule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rule_name: name, rule_description: desc })
    });
    document.getElementById("newRuleName").value = "";
    document.getElementById("newRuleDesc").value = "";
    loadDashboard();
}

async function markTeacherAbsent(tid, name) {
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const day = prompt(`Mark ${name} absent for which day?\n(Options: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday)`, "Monday");
    
    if (!day || !days.includes(day)) return alert("Invalid day selected.");

    const res = await fetch("/api/auto_substitute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacher_id: tid, day: day })
    });
    const result = await res.json();
    if (result.status === "success") {
        alert(`✅ Automatically allotted ${result.count} substitute teachers for ${name} on ${day}.`);
        loadDashboard();
    } else {
        alert("❌ Error: " + result.message);
    }
}

async function clearSubstitutions() {
    if (!confirm("Reset all substitutions to original teachers?")) return;
    await fetch("/api/clear_substitutions", { method: 'POST' });
    alert("Timetable reset to original assignments.");
    loadDashboard();
}

async function deleteRule(id) {
    if (!confirm("Delete this rule?")) return;
    await fetch(`/api/rule/${id}`, { method: 'DELETE' });
    loadDashboard();
}

// Assign Subject Logic
function openAssignSubjectModal() {
    document.getElementById("assignSubjectModal").style.display = "flex";
}

function closeAssignSubjectModal() {
    document.getElementById("assignSubjectModal").style.display = "none";
}

async function saveAssignSubject() {
    const teacherId = document.getElementById("assignTeacherSelect").value;
    const subjectId = document.getElementById("assignSubjectSelect").value;
    
    const priority = document.getElementById("assignPrioritySelect").value;
    
    if (!teacherId || !subjectId) {
        return alert("Please select both a Teacher and a Subject.");
    }
    
    const payload = { 
        teacher_id: parseInt(teacherId), 
        subject_id: parseInt(subjectId),
        priority: parseInt(priority)
    };
    const res = await fetch("/api/assign_subject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    
    const result = await res.json();
    if (result.status === "success") {
        alert("Subject successfully delegated to Teacher!");
        closeAssignSubjectModal();
        loadDashboard();
    } else {
        alert("Error executing assignment: " + result.message);
    }
}

// Assign Class Subject Logic
function openAssignClassSubjectModal() {
    document.getElementById("assignClassSubjectModal").style.display = "flex";
}

function closeAssignClassSubjectModal() {
    document.getElementById("assignClassSubjectModal").style.display = "none";
}

async function saveAssignClassSubject() {
    const classId = document.getElementById("assignClassSelect").value;
    const subjectId = document.getElementById("assignClassSubjectSelect").value;
    
    if (!classId || !subjectId) {
        return alert("Please select both a Class and a Subject.");
    }
    
    const payload = { class_id: parseInt(classId), subject_id: parseInt(subjectId) };
    const res = await fetch("/api/assign_class_subject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    
    const result = await res.json();
    if (result.status === "success") {
        alert("Subject successfully added to Class!");
        closeAssignClassSubjectModal();
        loadDashboard();
    } else {
        alert("Error executing assignment: " + result.message);
    }
}

async function unassignTeacherSubject(teacherId, subjectId) {
    if (!confirm("Remove this subject from the teacher?")) return;
    const res = await fetch(`/api/assign_subject/${teacherId}/${subjectId}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.status === "success") loadDashboard();
    else alert("Error unassigning subject");
}

async function unassignClassSubject(classId, subjectId) {
    if (!confirm("Remove this subject from the class?")) return;
    const res = await fetch(`/api/assign_class_subject/${classId}/${subjectId}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.status === "success") loadDashboard();
    else alert("Error unassigning subject");
}

// ============= PERIOD TIMING HELPERS =============
function getPeriodTimings() {
    const startTime = localStorage.getItem('tt_periodStartTime') || '09:00';
    const duration = parseInt(localStorage.getItem('tt_periodDuration') || '50');
    const lunchAfter = parseInt(localStorage.getItem('tt_lunchAfterPeriod') || '0');
    const lunchDuration = parseInt(localStorage.getItem('tt_lunchDuration') || '30');
    const periodsCount = parseInt(localStorage.getItem('tt_periodsCount') || '7');
    return { startTime, duration, lunchAfter, lunchDuration, periodsCount };
}

function formatTime(hours, minutes) {
    const h = Math.floor(hours) % 24;
    const m = Math.floor(minutes);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function getPeriodTimeLabel(periodNum) {
    const { startTime, duration, lunchAfter, lunchDuration } = getPeriodTimings();
    const [startH, startM] = startTime.split(':').map(Number);
    let currentMin = startH * 60 + startM;
    
    for (let p = 1; p <= periodNum; p++) {
        if (p === periodNum) {
            const start = formatTime(currentMin / 60, currentMin % 60);
            const endMin = currentMin + duration;
            const end = formatTime(endMin / 60, endMin % 60);
            return `${start} - ${end}`;
        }
        currentMin += duration;
        if (lunchAfter > 0 && p === lunchAfter) {
            currentMin += lunchDuration;
        }
    }
    return '';
}

function updateTimingPreview() {
    const startTimeEl = document.getElementById('periodStartTime');
    const durationEl = document.getElementById('periodDuration');
    const lunchAfterEl = document.getElementById('lunchAfterPeriod');
    const lunchDurEl = document.getElementById('lunchDuration');
    const periodsEl = document.getElementById('constraintPeriods');
    const previewEl = document.getElementById('timingPreviewContent');
    
    if (!startTimeEl || !previewEl) return;
    
    const startTime = startTimeEl.value || '09:00';
    const duration = parseInt(durationEl?.value || '50');
    const lunchAfter = parseInt(lunchAfterEl?.value || '0');
    const lunchDur = parseInt(lunchDurEl?.value || '30');
    const periodsCount = parseInt(periodsEl?.value || '7');
    
    const [startH, startM] = startTime.split(':').map(Number);
    let currentMin = startH * 60 + startM;
    let html = '';
    
    for (let p = 1; p <= periodsCount; p++) {
        const start = formatTime(currentMin / 60, currentMin % 60);
        const endMin = currentMin + duration;
        const end = formatTime(endMin / 60, endMin % 60);
        html += `<span style="display:inline-block; margin: 3px 5px; padding: 4px 10px; background: #eaf3fc; border-radius: 6px; font-weight:500;">P${p}: ${start} - ${end}</span>`;
        currentMin = endMin;
        
        if (lunchAfter > 0 && p === lunchAfter) {
            const lunchStart = formatTime(currentMin / 60, currentMin % 60);
            currentMin += lunchDur;
            const lunchEnd = formatTime(currentMin / 60, currentMin % 60);
            html += `<span style="display:inline-block; margin: 3px 5px; padding: 4px 10px; background: #fef3c7; border-radius: 6px; font-weight:600; color: #92400e;">🍽 Lunch: ${lunchStart} - ${lunchEnd}</span>`;
        }
    }
    previewEl.innerHTML = html;
}

// Attach timing preview listeners
document.addEventListener('DOMContentLoaded', () => {
    ['periodStartTime', 'periodDuration', 'lunchAfterPeriod', 'lunchDuration', 'constraintPeriods'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateTimingPreview);
        if (el) el.addEventListener('change', updateTimingPreview);
    });
});

// ============= VIEW TIMETABLE =============
async function loadClassTimetable(classId, className) {
    if (!classId) {
        alert("Please select a class first");
        return;
    }
    
    const res = await fetch("/api/timetable");
    const result = await res.json();
    
    if (result.status !== "success") {
        alert("Error loading timetable");
        return;
    }
    
    const allTimetables = result.timetable;
    const classTimetable = allTimetables.filter(t => t.class_id == classId);
    
    if (classTimetable.length === 0) {
        alert("No timetable generated for this class yet.");
        document.getElementById("timetableContainer").style.display = "none";
        return;
    }
    
    const days = [...new Set(classTimetable.map(t => t.day))];
    const dayOrder = { "Monday": 1, "Tuesday": 2, "Wednesday": 3, "Thursday": 4, "Friday": 5, "Saturday": 6, "Sunday": 7 };
    days.sort((a,b) => (dayOrder[a] || 8) - (dayOrder[b] || 8));
    
    const { periodsCount, lunchAfter } = getPeriodTimings();
    
    // Determine the periods to show: either from data or from settings
    const dataPeriods = [...new Set(classTimetable.map(t => t.period))];
    const maxDataPeriod = dataPeriods.length > 0 ? Math.max(...dataPeriods) : 0;
    const finalPeriodsCount = Math.max(periodsCount, maxDataPeriod);
    
    const displayPeriods = [];
    for (let i = 1; i <= finalPeriodsCount; i++) displayPeriods.push(i);
    
    let headerHtml = `<th style="background:#f4f7fa; color:#2d3436; padding: 15px;">Period / Day</th>`;
    days.forEach(day => {
        headerHtml += `<th style="background:#f4f7fa; color:#2d3436; padding: 15px;">${day}</th>`;
    });
    document.getElementById("timetableHeaderRow").innerHTML = headerHtml;
    
    let bodyHtml = "";
    displayPeriods.forEach((p, idx) => {
        // Insert lunch row before this period if needed
        if (lunchAfter > 0 && p === lunchAfter + 1) {
            bodyHtml += `<tr>
                <td colspan="${days.length + 1}" style="text-align:center; padding: 10px; background: #fef3c7; color: #92400e; font-weight: 700; border-bottom: 1px solid #fbbf24; font-size: 14px;">
                    🍽 LUNCH BREAK
                </td>
            </tr>`;
        }
        
        const timeLabel = getPeriodTimeLabel(p);
        bodyHtml += `<tr>`;
        bodyHtml += `<td style="font-weight:600; color:#74b9ff; padding: 15px; border-bottom: 1px solid #f1f5f9; border-right: 1px solid #f1f5f9;">
            Period ${p}
            <div style="font-size:11px; color:#94a3b8; font-weight:400; margin-top:2px;">${timeLabel}</div>
        </td>`;
        
        days.forEach(day => {
            const entry = classTimetable.find(t => t.day === day && t.period === p);
            if (entry) {
                bodyHtml += `<td style="padding: 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle;">
                    <div style="background:#eaf3fc; color:#4a90e2; padding:12px; border-radius:8px; display:inline-block; width: 140px; transition: transform 0.2s; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.05);" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                        <b style="font-size: 14px;">${entry.subject_name}</b><br>
                        <div style="margin-top: 5px; font-size:12px; color:#5d6d7e;"><i class="fa fa-user" style="margin-right: 4px;"></i>${entry.teacher_name}</div>
                        <div style="margin-top: 3px; font-size:12px; color:#5d6d7e;"><i class="fa fa-map-marker-alt" style="margin-right: 5px;"></i>${entry.room_no || 'N/A'}</div>
                    </div>
                </td>`;
            } else {
                bodyHtml += `<td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #cbd5e1; font-style: italic;">- Free -</td>`;
            }
        });
        
        bodyHtml += `</tr>`;
    });
    
    document.getElementById("timetableBody").innerHTML = bodyHtml;
    document.getElementById("timetableContainer").style.display = "block";
    document.getElementById("viewTimetableTitle").innerHTML = `<i class="fa fa-calendar-alt" style="color:#b2bec3; margin-right: 10px;"></i> Timetable: ${className}`;
    
    // Scroll to timetable
    document.getElementById("timetableContainer").scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============= EDIT TIMETABLE =============
let _editClassId = null;
let _editClassName = '';
let _swapMode = false;
let _swapFirstId = null;
let _cachedSubjects = [];
let _cachedTeachers = [];
let _cachedRooms = [];

async function loadEditClassTimetable(classId, className) {
    _editClassId = classId;
    _editClassName = className;
    _swapMode = false;
    _swapFirstId = null;
    document.getElementById('swapModeBtn').innerHTML = '<i class="fa fa-arrows-rotate" style="margin-right: 6px;"></i> Swap Mode: OFF';
    document.getElementById('swapModeBtn').style.background = '#8b5cf6';
    document.getElementById('swapInstruction').style.display = 'none';
    
    // Fetch detailed timetable & admin data
    const [ttRes, adminRes] = await Promise.all([
        fetch('/api/timetable/detailed'),
        fetch('/admin-data')
    ]);
    const ttResult = await ttRes.json();
    const adminData = await adminRes.json();
    
    _cachedSubjects = adminData.subjects || [];
    _cachedTeachers = adminData.teachers || [];
    _cachedRooms = adminData.rooms || [];
    
    if (ttResult.status !== 'success') {
        alert('Error loading timetable for editing');
        return;
    }
    
    const classTimetable = ttResult.timetable.filter(t => t.class_id == classId);
    
    if (classTimetable.length === 0) {
        alert('No timetable generated for this class yet.');
        document.getElementById('editTimetableContainer').style.display = 'none';
        return;
    }
    
    renderEditGrid(classTimetable, className);
    document.getElementById('editActionsBar').style.display = 'block';
    document.getElementById('editTimetableContainer').style.display = 'block';
    document.getElementById('editTimetableTitle').innerHTML = `<i class="fa fa-calendar-alt" style="color:#f59e0b; margin-right: 10px;"></i> Editing: ${className}`;
    document.getElementById('editTimetableContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderEditGrid(classTimetable, className) {
    const days = [...new Set(classTimetable.map(t => t.day))].sort((a,b) => ({"Monday": 1, "Tuesday": 2, "Wednesday": 3, "Thursday": 4, "Friday": 5, "Saturday": 6, "Sunday": 7}[a] || 8) - ({"Monday": 1, "Tuesday": 2, "Wednesday": 3, "Thursday": 4, "Friday": 5, "Saturday": 6, "Sunday": 7}[b] || 8));
    const { periodsCount, lunchAfter } = getPeriodTimings();
    
    // Determine the periods to show
    const dataPeriods = [...new Set(classTimetable.map(t => t.period))];
    const maxDataPeriod = dataPeriods.length > 0 ? Math.max(...dataPeriods) : 0;
    const finalPeriodsCount = Math.max(periodsCount, maxDataPeriod);
    
    const displayPeriods = [];
    for (let i = 1; i <= finalPeriodsCount; i++) displayPeriods.push(i);
    
    let headerHtml = `<th style="background:#fef3c7; color:#92400e; padding: 15px;">Period / Day</th>`;
    days.forEach(day => {
        headerHtml += `<th style="background:#fef3c7; color:#92400e; padding: 15px;">${day}</th>`;
    });
    document.getElementById('editTimetableHeaderRow').innerHTML = headerHtml;
    
    let bodyHtml = '';
    displayPeriods.forEach((p, idx) => {
        if (lunchAfter > 0 && p === lunchAfter + 1) {
            bodyHtml += `<tr>
                <td colspan="${days.length + 1}" style="text-align:center; padding: 10px; background: #fef3c7; color: #92400e; font-weight: 700; border-bottom: 1px solid #fbbf24; font-size: 14px;">
                    🍽 LUNCH BREAK
                </td>
            </tr>`;
        }
        
        const timeLabel = getPeriodTimeLabel(p);
        bodyHtml += `<tr>`;
        bodyHtml += `<td style="font-weight:600; color:#f59e0b; padding: 15px; border-bottom: 1px solid #f1f5f9; border-right: 1px solid #f1f5f9;">
            Period ${p}
            <div style="font-size:11px; color:#94a3b8; font-weight:400; margin-top:2px;">${timeLabel}</div>
        </td>`;
        
        days.forEach(day => {
            const entry = classTimetable.find(t => t.day === day && t.period === p);
            if (entry) {
                bodyHtml += `<td style="padding: 8px; border-bottom: 1px solid #f1f5f9; vertical-align: middle;">
                    <div class="edit-cell" data-entry-id="${entry.id}" data-subject-id="${entry.subject_id}" data-teacher-id="${entry.teacher_id || ''}" data-room-id="${entry.room_id || ''}" data-day="${day}" data-period="${p}"
                         style="background:#fff7ed; color:#c2410c; padding:10px; border-radius:8px; display:inline-block; width: 140px; cursor: pointer; border: 2px solid transparent; transition: all 0.2s; box-shadow: 0 2px 5px rgba(0,0,0,0.05);"
                         onmouseover="this.style.borderColor='#f59e0b'; this.style.transform='scale(1.03)'"
                         onmouseout="if(!this.classList.contains('swap-selected')){this.style.borderColor='transparent';} this.style.transform='scale(1)'"
                         onclick="handleEditCellClick(this)">
                        <b style="font-size: 13px;">${entry.subject_name}</b><br>
                        <div style="margin-top: 4px; font-size:11px; color:#78716c;"><i class="fa fa-user" style="margin-right:3px;"></i>${entry.teacher_name}</div>
                        <div style="margin-top: 2px; font-size:11px; color:#78716c;"><i class="fa fa-map-marker-alt" style="margin-right:4px;"></i>${entry.room_no || 'N/A'}</div>
                    </div>
                </td>`;
            } else {
                bodyHtml += `<td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #cbd5e1; font-style: italic;">- Free -</td>`;
            }
        });
        bodyHtml += `</tr>`;
    });
    
    document.getElementById('editTimetableBody').innerHTML = bodyHtml;
}

function handleEditCellClick(cell) {
    const entryId = parseInt(cell.dataset.entryId);
    
    if (_swapMode) {
        if (_swapFirstId === null) {
            _swapFirstId = entryId;
            cell.classList.add('swap-selected');
            cell.style.borderColor = '#8b5cf6';
            cell.style.background = '#ede9fe';
        } else if (_swapFirstId !== entryId) {
            performSwap(_swapFirstId, entryId);
        } else {
            // Clicked same cell, deselect
            _swapFirstId = null;
            cell.classList.remove('swap-selected');
            cell.style.borderColor = 'transparent';
            cell.style.background = '#fff7ed';
        }
    } else {
        openEditSlotModal(cell);
    }
}

function toggleSwapMode() {
    _swapMode = !_swapMode;
    _swapFirstId = null;
    const btn = document.getElementById('swapModeBtn');
    const instruction = document.getElementById('swapInstruction');
    
    if (_swapMode) {
        btn.innerHTML = '<i class="fa fa-arrows-rotate" style="margin-right: 6px;"></i> Swap Mode: ON';
        btn.style.background = '#7c3aed';
        instruction.style.display = 'block';
    } else {
        btn.innerHTML = '<i class="fa fa-arrows-rotate" style="margin-right: 6px;"></i> Swap Mode: OFF';
        btn.style.background = '#8b5cf6';
        instruction.style.display = 'none';
    }
    
    // Reset any selected cells
    document.querySelectorAll('.edit-cell.swap-selected').forEach(c => {
        c.classList.remove('swap-selected');
        c.style.borderColor = 'transparent';
        c.style.background = '#fff7ed';
    });
}

async function performSwap(id1, id2) {
    const res = await fetch('/api/timetable/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id1, id2 })
    });
    const result = await res.json();
    if (result.status === 'success') {
        alert('✅ Periods swapped successfully!');
        _swapFirstId = null;
        refreshEditTimetable();
    } else {
        alert('❌ Error swapping: ' + (result.message || 'Unknown error'));
    }
}

async function refreshEditTimetable() {
    if (_editClassId) {
        await loadEditClassTimetable(_editClassId, _editClassName);
    }
}

function openEditSlotModal(cell) {
    const entryId = cell.dataset.entryId;
    const subjectId = cell.dataset.subjectId;
    const teacherId = cell.dataset.teacherId;
    const roomId = cell.dataset.roomId;
    const day = cell.dataset.day;
    const period = cell.dataset.period;
    
    document.getElementById('editSlotId').value = entryId;
    document.getElementById('editSlotInfo').innerHTML = `<i class="fa fa-calendar"></i> ${day}, Period ${period}`;
    
    // Populate dropdowns
    document.getElementById('editSlotSubject').innerHTML = _cachedSubjects.map(s => 
        `<option value="${s.id}" ${s.id == subjectId ? 'selected' : ''}>${s.subject_name} (${s.subject_code})</option>`
    ).join('');
    
    document.getElementById('editSlotTeacher').innerHTML = '<option value="">-- No Teacher --</option>' + _cachedTeachers.map(t => 
        `<option value="${t.id}" ${t.id == teacherId ? 'selected' : ''}>${t.username}</option>`
    ).join('');
    
    document.getElementById('editSlotRoom').innerHTML = '<option value="">-- No Room --</option>' + _cachedRooms.map(r => 
        `<option value="${r.id}" ${r.id == roomId ? 'selected' : ''}>${r.room_no} (${r.room_type})</option>`
    ).join('');
    
    document.getElementById('editSlotModal').style.display = 'flex';
}

function closeEditSlotModal() {
    document.getElementById('editSlotModal').style.display = 'none';
}

async function saveEditSlot() {
    const id = document.getElementById('editSlotId').value;
    const subject_id = parseInt(document.getElementById('editSlotSubject').value);
    const teacher_id = document.getElementById('editSlotTeacher').value ? parseInt(document.getElementById('editSlotTeacher').value) : null;
    const room_id = document.getElementById('editSlotRoom').value ? parseInt(document.getElementById('editSlotRoom').value) : null;
    
    const res = await fetch('/api/timetable/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: parseInt(id), subject_id, teacher_id, room_id })
    });
    const result = await res.json();
    if (result.status === 'success') {
        alert('✅ Slot updated successfully!');
        closeEditSlotModal();
        refreshEditTimetable();
    } else {
        alert('❌ Error: ' + (result.message || 'Unknown'));
    }
}

async function deleteEditSlot() {
    if (!confirm('Are you sure you want to delete this timetable slot?')) return;
    const id = document.getElementById('editSlotId').value;
    const res = await fetch(`/api/timetable/delete/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.status === 'success') {
        alert('✅ Slot deleted.');
        closeEditSlotModal();
        refreshEditTimetable();
        alert('❌ Error deleting slot.');
    }
}

async function saveCalendarSettings() {
    const url = document.getElementById("calendarUrlInput").value;
    const img = document.getElementById("calendarImageInput").value;
    const status = document.getElementById("calendarStatus");
    
    await fetch("/api/settings/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: 'academic_calendar', value: url })
    });
    
    await fetch("/api/settings/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: 'academic_calendar_image', value: img })
    });
    
    status.style.display = "block";
    status.style.color = "#10b981";
    status.innerText = "✅ Links saved successfully!";
    setTimeout(() => { status.style.display = "none"; }, 3000);
}

async function addCalendarEvent() {
    const date = document.getElementById("eventDate").value;
    const title = document.getElementById("eventTitle").value;
    const desc = document.getElementById("eventDesc").value;
    const type = document.getElementById("eventType").value;
    
    if(!date || !title) return alert("Date and Title are required!");

    const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, title, desc, type })
    });
    const result = await res.json();
    if(result.status === "success") {
        document.getElementById("eventDate").value = "";
        document.getElementById("eventTitle").value = "";
        document.getElementById("eventDesc").value = "";
        loadEvents();
    }
}

async function loadEvents() {
    const res = await fetch("/api/events");
    const data = await res.json();
    const table = document.getElementById("eventListTable");
    if(!table) return;

    if(data.events && data.events.length > 0) {
        table.innerHTML = data.events.map(e => `
            <tr>
                <td style="padding:12px; border-bottom:1px solid #f1f5f9;"><b>${e.date}</b></td>
                <td style="padding:12px; border-bottom:1px solid #f1f5f9;">${e.title}</td>
                <td style="padding:12px; border-bottom:1px solid #f1f5f9;"><span class="badge ${e.type.toLowerCase()}">${e.type}</span></td>
                <td style="padding:12px; border-bottom:1px solid #f1f5f9; text-align:center;">
                    <button onclick="deleteEvent(${e.id})" style="color:#ef4444; background:none; border:none; cursor:pointer;"><i class="fa fa-trash"></i></button>
                </td>
            </tr>
        `).join("");
    } else {
        table.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#94a3b8;">No events scheduled yet.</td></tr>`;
    }
}

async function deleteEvent(id) {
    if(!confirm("Are you sure?")) return;
    await fetch(`/api/events/delete/${id}`, { method: 'DELETE' });
    loadEvents();
}

// In loadDashboard, we should also call loadEvents and populate image input
// ... I will use multi_replace for loadDashboard later if needed ...

async function loadAllNocRequests() {
    const res = await fetch("/api/noc/admin/all");
    const data = await res.json();
    const list = document.getElementById("nocAdminTableBody");
    if (!list) return;

    if (data.requests && data.requests.length > 0) {
        list.innerHTML = data.requests.map(r => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding:15px;"><b>${r.student_name}</b></td>
                <td style="padding:15px;">${r.created_at.split(' ')[0]}</td>
                <td style="padding:15px; max-width: 250px; font-size: 13px;">${r.details}</td>
                <td style="padding:15px;">
                    <a href="${r.letter_url}" target="_blank" class="btn-ai" style="padding:5px 10px; font-size:12px; background:#6366f1;">
                        <i class="fa fa-external-link"></i> View
                    </a>
                </td>
                <td style="padding:15px;">
                    <span style="padding:4px 10px; border-radius:30px; font-size:12px; font-weight:600; background: ${r.status === 'Approved' ? '#ecfdf5' : r.status === 'Rejected' ? '#fef2f2' : '#fffbeb'}; color: ${r.status === 'Approved' ? '#10b981' : r.status === 'Rejected' ? '#ef4444' : '#f59e0b'};">
                        ${r.status}
                    </span>
                </td>
                <td style="padding:15px; text-align:center;">
                    <div style="display:flex; gap:5px; justify-content:center;">
                        <button onclick="updateNocStatus(${r.id}, 'Approved')" class="btn-ai" style="padding:5px 10px; font-size:11px; background:#10b981;">Approve</button>
                        <button onclick="updateNocStatus(${r.id}, 'Rejected')" class="btn-ai" style="padding:5px 10px; font-size:11px; background:#ef4444;">Reject</button>
                    </div>
                </td>
            </tr>
        `).join("");
    } else {
        list.innerHTML = "<tr><td colspan='6' style='text-align:center; padding:30px; color:#94a3b8;'>No NOC requests to review.</td></tr>";
    }
}

async function updateNocStatus(id, status) {
    const res = await fetch("/api/noc/admin/update_status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status })
    });
    const result = await res.json();
    if (result.status === "success") {
        loadAllNocRequests();
    } else {
        alert("Error updating status");
    }
}

window.onload = function() {
    loadDashboard();
    loadEvents();
    loadAllNocRequests();
};
