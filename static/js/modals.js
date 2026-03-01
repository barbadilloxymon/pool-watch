// Modal Functionality
document.addEventListener('DOMContentLoaded', function() {
    // Setup for notification and profile modals (if they exist)
    const notificationBtn = document.getElementById('notificationBtn');
    const profileBtn = document.getElementById('profileBtn');
    
    if (notificationBtn) {
        setupModal(notificationBtn, 'notificationModal');
    }
    
    if (profileBtn) {
        setupModal(profileBtn, 'profileModal');
    }
    
    // Initialize modal utilities
    Modal.init();
});

function setupModal(triggerButton, modalId) {
    if (!triggerButton) return;
    
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    const closeButtons = modal.querySelectorAll('.close-modal, .modal-overlay');
    
    triggerButton.addEventListener('click', function(e) {
        e.stopPropagation();
        openModal(modalId);
    });
    
    closeButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.stopPropagation();
            closeModal(modalId);
        });
    });
}

// Generic modal opener
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.classList.add('opacity-100', 'show');
        document.body.style.overflow = 'hidden';
    }
}

// Generic modal closer
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('opacity-0', 'pointer-events-none');
        modal.classList.remove('opacity-100', 'show');
        document.body.style.overflow = 'auto';
    }
}

// Modal utility object
const Modal = {
    // Open a modal by ID
    open: function(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('opacity-0', 'pointer-events-none');
            modal.classList.add('opacity-100', 'show');
            document.body.classList.add('modal-active');
            document.body.style.overflow = 'hidden';
        }
    },
    
    // Close a modal by ID
    close: function(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('opacity-100', 'show');
            modal.classList.add('opacity-0', 'pointer-events-none');
            document.body.classList.remove('modal-active');
            document.body.style.overflow = 'auto';
        }
    },
    
    // Close all modals
    closeAll: function() {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            modal.classList.remove('opacity-100', 'show');
            modal.classList.add('opacity-0', 'pointer-events-none');
        });
        document.body.classList.remove('modal-active');
        document.body.style.overflow = 'auto';
    },
    
    // Toggle a modal
    toggle: function(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            if (modal.classList.contains('show')) {
                this.close(modalId);
            } else {
                this.open(modalId);
            }
        }
    },
    
    // Initialize modal close events
    init: function() {
        // Close modals when clicking on overlay
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', function(e) {
                e.stopPropagation();
                const modal = this.closest('.modal');
                if (modal) {
                    Modal.close(modal.id);
                }
            });
        });
        
        // Close buttons
        document.querySelectorAll('.close-modal').forEach(button => {
            button.addEventListener('click', function(e) {
                e.stopPropagation();
                const modal = this.closest('.modal');
                if (modal) {
                    Modal.close(modal.id);
                }
            });
        });
        
        // Close modals with Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                Modal.closeAll();
            }
        });
        
        // Prevent modal content clicks from closing modal
        document.querySelectorAll('.modal-content').forEach(content => {
            content.addEventListener('click', function(e) {
                e.stopPropagation();
            });
        });
        
        // Click outside modal to close
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', function(e) {
                if (e.target === this) {
                    Modal.close(this.id);
                }
            });
        });
    }
};

// Confirmation Dialog Utility
const ConfirmDialog = {
    show: function(options) {
        const defaults = {
            title: 'Confirm Action',
            message: 'Are you sure you want to proceed?',
            confirmText: 'Confirm',
            cancelText: 'Cancel',
            confirmClass: 'bg-blue-600 hover:bg-blue-700',
            onConfirm: function() {},
            onCancel: function() {}
        };
        
        const settings = { ...defaults, ...options };
        
        // Create modal HTML
        const modalHTML = `
            <div id="confirmDialog" class="modal show opacity-100" style="z-index: 10000;">
                <div class="modal-content" style="max-width: 400px;">
                    <div class="p-6">
                        <h3 class="text-xl font-bold text-gray-900 mb-3">${settings.title}</h3>
                        <p class="text-gray-600 mb-6">${settings.message}</p>
                        <div class="flex gap-3">
                            <button id="confirmCancel" class="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium">
                                ${settings.cancelText}
                            </button>
                            <button id="confirmOk" class="flex-1 px-4 py-2 ${settings.confirmClass} text-white rounded-lg transition-colors font-medium">
                                ${settings.confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove any existing confirm dialogs
        const existing = document.getElementById('confirmDialog');
        if (existing) {
            existing.remove();
        }
        
        // Add to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        document.body.style.overflow = 'hidden';
        
        // Add event listeners
        document.getElementById('confirmCancel').addEventListener('click', function() {
            ConfirmDialog.hide();
            settings.onCancel();
        });
        
        document.getElementById('confirmOk').addEventListener('click', function() {
            ConfirmDialog.hide();
            settings.onConfirm();
        });
        
        // Close on outside click
        document.getElementById('confirmDialog').addEventListener('click', function(e) {
            if (e.target === this) {
                ConfirmDialog.hide();
                settings.onCancel();
            }
        });
    },
    
    hide: function() {
        const dialog = document.getElementById('confirmDialog');
        if (dialog) {
            dialog.remove();
            document.body.style.overflow = 'auto';
        }
    }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Modal, ConfirmDialog };
}