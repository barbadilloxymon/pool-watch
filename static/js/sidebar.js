// Toggle Sidebar
document.addEventListener('DOMContentLoaded', function() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('toggleSidebar');
    const logo = document.getElementById('logo');
    const menuTexts = document.querySelectorAll('.menu-text');
    const adminText = document.getElementById('adminText');

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', function() {
            sidebar.classList.toggle('hidden-sidebar');
            sidebar.classList.toggle('expanded-sidebar');
            
            if (sidebar.classList.contains('hidden-sidebar')) {
                menuTexts.forEach(text => text.classList.add('hidden'));
                if (adminText) adminText.classList.add('hidden');
            } else {
                menuTexts.forEach(text => text.classList.remove('hidden'));
                if (adminText) adminText.classList.remove('hidden');
            }
        });
    }
});