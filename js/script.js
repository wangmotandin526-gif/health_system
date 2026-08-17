// Simple sidebar toggle for mobile
document.addEventListener('DOMContentLoaded', function() {
    const sidebar = document.getElementById('sidebar');
    
    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', function(e) {
        if (window.innerWidth < 992 && 
            sidebar.classList.contains('show') && 
            !sidebar.contains(e.target) && 
            !e.target.closest('.btn')) {
            sidebar.classList.remove('show');
        }
    });

    // Set active nav link based on current page
    const currentPath = window.location.pathname;
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            document.querySelector('.nav-link.active')?.classList.remove('active');
            link.classList.add('active');
        }
    });
});
