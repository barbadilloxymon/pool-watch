// Sidebar toggle functionality
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobileOverlay');
    
    sidebar.classList.toggle('show');
    overlay.classList.toggle('show');
}

// Notification dropdown
function toggleNotifications() {
    const dropdown = document.getElementById('notificationDropdown');
    const profileDropdown = document.getElementById('profileDropdown');
    
    profileDropdown.classList.add('hidden');
    dropdown.classList.toggle('hidden');
}

// Profile dropdown
function toggleProfile() {
    const dropdown = document.getElementById('profileDropdown');
    const notificationDropdown = document.getElementById('notificationDropdown');
    
    notificationDropdown.classList.add('hidden');
    dropdown.classList.toggle('hidden');
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(event) {
    const notificationBtn = document.getElementById('notificationBtn');
    const profileBtn = document.getElementById('profileBtn');
    const notificationDropdown = document.getElementById('notificationDropdown');
    const profileDropdown = document.getElementById('profileDropdown');

    if (notificationBtn && !notificationBtn.contains(event.target) && notificationDropdown && !notificationDropdown.contains(event.target)) {
        notificationDropdown.classList.add('hidden');
    }

    if (profileBtn && !profileBtn.contains(event.target) && profileDropdown && !profileDropdown.contains(event.target)) {
        profileDropdown.classList.add('hidden');
    }
});

// Close sidebar on escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobileOverlay');
        
        if (sidebar) sidebar.classList.remove('show');
        if (overlay) overlay.classList.remove('show');
    }
});

// Initialize core functions
document.addEventListener('DOMContentLoaded', function() {
    initializeFlashMessages();
});

// Flash message auto-dismiss functionality
function initializeFlashMessages() {
    const flashMessages = document.querySelectorAll('.flash-message:not([data-initialized])');
    
    flashMessages.forEach(message => {
        // Mark as initialized to prevent duplicate handling
        message.setAttribute('data-initialized', 'true');
        
        // Auto-dismiss after 5 seconds
        const dismissTimer = setTimeout(() => {
            dismissFlashMessage(message);
        }, 5000);
        
        // Add click handler for close button
        const closeBtn = message.querySelector('.flash-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function(e) {
                e.preventDefault();
                clearTimeout(dismissTimer);
                dismissFlashMessage(message);
            });
        }
        
        // Pause dismiss on hover
        message.addEventListener('mouseenter', function() {
            clearTimeout(dismissTimer);
        });
        
        message.addEventListener('mouseleave', function() {
            // Restart timer when mouse leaves
            const newTimer = setTimeout(() => {
                dismissFlashMessage(message);
            }, 5000);
            // Store timer reference for cleanup
            message.setAttribute('data-dismiss-timer', newTimer);
        });
        
        // Store the original timer
        message.setAttribute('data-dismiss-timer', dismissTimer);
    });
}

function dismissFlashMessage(message) {
    // Add slide-out animation
    message.style.animation = 'slideOutRight 0.3s ease-in forwards';
    
    // Remove after animation completes
    setTimeout(() => {
        if (message.parentNode) {
            message.remove();
        }
    }, 300);
}

function showNotification(message, type = 'success') {
    // Create container if it doesn't exist
    let container = document.querySelector('.flash-messages-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'flash-messages-container';
        document.body.appendChild(container);
    }
    
    const messageDiv = document.createElement('div');
    
    const bgColor = type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';
    const textColor = type === 'success' ? 'text-green-800' : 'text-red-800';
    const iconColor = type === 'success' ? 'text-green-500' : 'text-red-500';
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    
    messageDiv.className = `flash-message rounded-xl p-4 mb-3 max-w-md border transform transition-all duration-300 ease-in-out ${bgColor}`;
    messageDiv.innerHTML = `
        <div class="flex items-start justify-between">
            <div class="flex items-start flex-1">
                <div class="flex-shrink-0 mt-0.5">
                    <i class="fas ${icon} ${iconColor}"></i>
                </div>
                <div class="ml-3 flex-1">
                    <p class="text-sm font-medium ${textColor}">${message}</p>
                </div>
            </div>
            <button type="button" class="flash-close ml-4 flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    container.appendChild(messageDiv);
    initializeFlashMessages(); // Initialize for new message
}

// Clean up timers when page unloads
window.addEventListener('beforeunload', function() {
    const flashMessages = document.querySelectorAll('.flash-message');
    flashMessages.forEach(message => {
        const timerId = message.getAttribute('data-dismiss-timer');
        if (timerId) {
            clearTimeout(parseInt(timerId));
        }
    });
});


// Account Menu Toggle Function
function toggleAccountMenu() {
  const menu = document.getElementById('accountMenu');
  const chevron = document.getElementById('menuChevron');
  const isVisible = menu.classList.contains('show');
  
  if (isVisible) {
    closeAccountMenu();
  } else {
    menu.classList.add('show');
    menu.classList.remove('opacity-0', 'invisible');
    menu.classList.add('opacity-100', 'visible');
    menu.style.transform = 'translateY(0) scale(1)';
    chevron.style.transform = 'rotate(180deg)';
  }
}

function closeAccountMenu() {
  const menu = document.getElementById('accountMenu');
  const chevron = document.getElementById('menuChevron');
  
  menu.classList.remove('show', 'opacity-100', 'visible');
  menu.classList.add('opacity-0', 'invisible');
  menu.style.transform = 'translateY(10px) scale(0.95)';
  chevron.style.transform = 'rotate(0deg)';
}

// Close account menu when clicking outside
document.addEventListener('click', function(event) {
  const menu = document.getElementById('accountMenu');
  const button = document.getElementById('userMenuButton');
  
  if (menu && button && !button.contains(event.target) && !menu.contains(event.target)) {
    closeAccountMenu();
  }
});

// Close account menu when sidebar closes on mobile
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobileOverlay');
  
  sidebar.classList.toggle('show');
  overlay.classList.toggle('show');
  
  // Close account menu when sidebar closes
  if (!sidebar.classList.contains('show')) {
    closeAccountMenu();
  }
}