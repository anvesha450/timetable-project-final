console.log("JS RUNNING");
let selectedRole = "";

// Role selection
window.selectRole = function (role) {

    selectedRole = role;  // 🔥 VERY IMPORTANT
    console.log("Selected Role:", selectedRole);

    const roleDiv = document.getElementById("role-selection");
    const loginDiv = document.getElementById("login-container");

    roleDiv.style.display = "none";

    loginDiv.style.display = "block";
    loginDiv.classList.add("fade");

    if (role === "admin") {
        document.getElementById("login-title").innerText = "Admin Login";
    }
    else if (role === "teacher") {
        document.getElementById("login-title").innerText = "Teacher Login";
    }
    else if (role === "student") {
        document.getElementById("login-title").innerText = "Student Login";
    }
}

// Back button
function goBack() {
    document.getElementById("login-container").style.display = "none";
    document.getElementById("role-selection").style.display = "block";
    hideForgotPassword();
}

function showForgotPassword() {
    document.getElementById('login-form-card').style.display = 'none';
    document.getElementById('forgot-password-card').style.display = 'block';
}

function hideForgotPassword() {
    document.getElementById('forgot-password-card').style.display = 'none';
    document.getElementById('login-form-card').style.display = 'block';
}

async function resetPassword(btn) {
    const email = document.getElementById('reset-email').value;
    if (!email) return alert("Please enter your registered email address!");
    
    btn.disabled = true;
    btn.innerText = "Generating & Sending...";
    
    try {
        const response = await fetch("/api/forgot_password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: email })
        });
        
        const data = await response.json();
        alert(data.message);
        if (data.status === "success") {
            hideForgotPassword();
            document.getElementById('reset-email').value = "";
        }
    } catch (e) {
        alert("Server error connecting to mail component.");
    }
    
    btn.disabled = false;
    btn.innerText = "Email New Password";
}

// Login API
async function loginUser(btn) {

    btn.disabled = true;  // 🔥 PREVENT DOUBLE CLICK

    const username = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    if (!username || !password) {
        alert("Please enter both username and password");
        btn.disabled = false;
        return;
    }

    try {
        const response = await fetch("/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username: username,
                password: password,
                role: selectedRole
            })
        });

        const data = await response.json();

        if (data.status === "success" || data.status === "new user created") {
            localStorage.setItem("username", username);
            if (data.status === "new user created") {
                alert("New user created ✅");
            }
            if (data.role === "admin") {
                window.location.href = "/dashboard";
            } else if (data.role === "teacher") {
                window.location.href = "/teacher_dashboard";
            } else if (data.role === "student") {
                window.location.href = "/student_dashboard";
            } else {
                window.location.href = "/dashboard";
            }
        } else if (data.status === "wrong password") {
            alert("Wrong Password ❌");
            btn.disabled = false;
        } else if (data.status === "wrong role") {
            alert("Access Denied: You are not authorized for this portal ❌");
            btn.disabled = false;
        } else if (data.status === "not found") {
            alert("Account not found ❌\n\n" + (data.message || "Please contact admin to get registered."));
            btn.disabled = false;
        } else {
            alert("Login failed: " + (data.message || data.status));
            btn.disabled = false;
        }
    } catch (err) {
        alert("Server connection error. Please try again.");
        btn.disabled = false;
    }
}