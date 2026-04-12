// teacher-timetable.js

// Function to switch between sections
function showSection(sectionId) {
    // Hide all content sections
    const sections = document.querySelectorAll('.content-section');
    sections.forEach(section => {
        section.style.display = 'none';
    });

    // Show the selected section
    const selectedSection = document.getElementById(sectionId);
    if (selectedSection) {
        selectedSection.style.display = 'block';
    }

    // Update active state in sidebar
    const navLinks = document.querySelectorAll('.sidebar-menu a');
    navLinks.forEach(link => {
        link.classList.remove('active');
    });
    
    // Find the clicked link and add active class
    const clickedLink = event.target.closest('a');
    if (clickedLink) {
        clickedLink.classList.add('active');
    }
}

// Function to handle logout
function logout() {
    // Confirm logout
    if (confirm('Are you sure you want to logout?')) {
        // Redirect to login page
        window.location.href = 'index.html';
    }
}


// Initialize: Show dashboard section by default when page loads
document.addEventListener('DOMContentLoaded', function() {
    showSection('dashboard');
});