// Account Management Functions
let originalName = "";

// Initialize original name from session
document.addEventListener('DOMContentLoaded', function() {
    const nameInput = document.getElementById('editNameInput');
    if (nameInput) {
        originalName = nameInput.value.trim();
    }
    
    // Remove the auto-close event listeners for modals
    initializeModalBehavior();
});

// Initialize modal behavior to prevent closing on outside click
function initializeModalBehavior() {
    // Remove any existing click outside handlers
    document.querySelectorAll('.modal').forEach(modal => {
        // Remove the existing click event listener by cloning and replacing
        const newModal = modal.cloneNode(true);
        modal.parentNode.replaceChild(newModal, modal);
    });
    
    // Add new event listeners that prevent closing on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(event) {
            // Only close if the backdrop itself is clicked (not the modal content)
            if (event.target === this) {
                // For these specific modals, we DON'T close when clicking outside
                // So we do nothing here
                return;
            }
        });
    });
    
    // Keep Escape key functionality but only for specific cases if needed
    // Or remove it entirely if you don't want Escape to close modals
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            // You can choose to keep Escape functionality or remove it
            // For now, I'll keep it but you can comment this out if you don't want it
            const openModals = document.querySelectorAll('.modal.show');
            openModals.forEach(modal => {
                // Only allow Escape to close if it's not a critical modal
                // Or remove this entirely to disable Escape closing
                modal.classList.remove('show');
                document.body.style.overflow = 'auto';
                
                // Clean up specific modals
                if (modal.id === 'deleteAccountModal') {
                    const passwordInput = document.getElementById('deleteConfirmPassword');
                    const error = document.getElementById('deleteConfirmError');
                    if (passwordInput) {
                        passwordInput.value = '';
                        passwordInput.classList.remove('input-error');
                    }
                    if (error) error.classList.add('hidden');
                } else if (modal.id === 'changePasswordModal') {
                    const fields = ['currentPassword', 'newPassword', 'confirmNewPassword'];
                    fields.forEach(fieldId => {
                        const field = document.getElementById(fieldId);
                        if (field) field.value = '';
                    });
                    clearPasswordErrors();
                } else if (modal.id === 'accountDetailsModal') {
                    cancelNameChanges();
                }
            });
        }
    });
}

// Account Menu Toggle Function
function toggleAccountMenu() {
    const menu = document.getElementById('accountMenu');
    const chevron = document.getElementById('menuChevron');
    
    if (!menu || !chevron) return;
    
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
    
    if (!menu || !chevron) return;
    
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

// Modal Control Functions
function openAccountDetailsModal() {
    closeAccountMenu();
    const modal = document.getElementById('accountDetailsModal');
    if (modal) {
        // Reset form state before opening
        const nameInput = document.getElementById('editNameInput');
        if (nameInput) {
            originalName = nameInput.value.trim();
        }
        cancelNameChanges();
        
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function closeAccountDetailsModal() {
    const modal = document.getElementById('accountDetailsModal');
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = 'auto';
        cancelNameChanges();
    }
}

function openChangePasswordModal() {
    closeAccountDetailsModal();
    const modal = document.getElementById('changePasswordModal');
    if (modal) {
        // Clear all password fields first
        const fields = ['currentPassword', 'newPassword', 'confirmNewPassword'];
        fields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) field.value = '';
        });
        clearPasswordErrors();
        
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function closeChangePasswordModal() {
    const modal = document.getElementById('changePasswordModal');
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = 'auto';
        
        // Clear password fields
        const fields = ['currentPassword', 'newPassword', 'confirmNewPassword'];
        fields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) field.value = '';
        });
        
        clearPasswordErrors();
    }
}

function openDeleteAccountModal() {
    closeAccountDetailsModal();
    const modal = document.getElementById('deleteAccountModal');
    if (modal) {
        // Clear input and errors first
        const passwordInput = document.getElementById('deleteConfirmPassword');
        const error = document.getElementById('deleteConfirmError');
        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.classList.remove('input-error');
        }
        if (error) error.classList.add('hidden');
        
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function closeDeleteAccountModal() {
    const modal = document.getElementById('deleteAccountModal');
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = 'auto';
        
        const passwordInput = document.getElementById('deleteConfirmPassword');
        const error = document.getElementById('deleteConfirmError');
        
        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.classList.remove('input-error');
        }
        if (error) error.classList.add('hidden');
    }
}

// Utility Functions
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(inputId + '-icon');
    
    if (!input || !icon) return;
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// Flash Message Function - Replaces showToast
function showFlashMessage(message, category = 'success') {
    // Remove any existing flash messages
    const existingContainer = document.querySelector('.flash-messages-container');
    if (existingContainer) {
        existingContainer.remove();
    }
    
    // Create container
    const container = document.createElement('div');
    container.className = 'flash-messages-container';
    
    // Create flash message
    const flashMessage = document.createElement('div');
    flashMessage.className = 'flash-message';
    flashMessage.setAttribute('data-category', category);
    
    // Determine icon based on category
    let icon = 'fa-info-circle';
    if (category === 'success') {
        icon = 'fa-check-circle';
    } else if (category === 'error' || category === 'danger') {
        icon = 'fa-exclamation-circle';
    } else if (category === 'warning') {
        icon = 'fa-exclamation-triangle';
    }
    
    flashMessage.innerHTML = `
        <div class="flex items-start justify-between">
            <div class="flex items-start flex-1">
                <div class="flex-shrink-0 mt-0.5">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="ml-3 flex-1">
                    <p>${message}</p>
                </div>
            </div>
            <button type="button" class="flash-close ml-4 flex-shrink-0">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    container.appendChild(flashMessage);
    document.body.appendChild(container);
    
    // Initialize flash message behavior
    initializeSingleFlashMessage(flashMessage);
}

function initializeSingleFlashMessage(message) {
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
        const newTimer = setTimeout(() => {
            dismissFlashMessage(message);
        }, 5000);
        message.setAttribute('data-dismiss-timer', newTimer);
    });
    
    message.setAttribute('data-dismiss-timer', dismissTimer);
}

function dismissFlashMessage(message) {
    message.style.animation = 'slideOutRight 0.3s ease-in forwards';
    
    setTimeout(() => {
        if (message.parentNode) {
            const container = message.closest('.flash-messages-container');
            message.remove();
            // Remove container if empty
            if (container && container.children.length === 0) {
                container.remove();
            }
        }
    }, 300);
}

// Name Management Functions
function checkNameChanges() {
    const nameInput = document.getElementById('editNameInput');
    const saveChangesBar = document.getElementById('saveChangesBar');
    const nameError = document.getElementById('nameError');
    
    if (!nameInput || !saveChangesBar || !nameError) return;
    
    const currentName = nameInput.value.trim();
    
    // Clear previous errors
    nameError.classList.add('hidden');
    nameInput.classList.remove('input-error');
    
    if (currentName !== originalName) {
        if (currentName.length === 0) {
            const errorSpan = nameError.querySelector('span');
            if (errorSpan) errorSpan.textContent = 'Name cannot be empty';
            nameError.classList.remove('hidden');
            nameInput.classList.add('input-error');
            saveChangesBar.classList.add('hidden');
        } else if (currentName.length > 50) {
            const errorSpan = nameError.querySelector('span');
            if (errorSpan) errorSpan.textContent = 'Name must be less than 50 characters';
            nameError.classList.remove('hidden');
            nameInput.classList.add('input-error');
            saveChangesBar.classList.add('hidden');
        } else {
            saveChangesBar.classList.remove('hidden');
        }
    } else {
        saveChangesBar.classList.add('hidden');
    }
}

function cancelNameChanges() {
    const nameInput = document.getElementById('editNameInput');
    const saveChangesBar = document.getElementById('saveChangesBar');
    const nameError = document.getElementById('nameError');
    
    if (nameInput) nameInput.value = originalName;
    if (saveChangesBar) saveChangesBar.classList.add('hidden');
    if (nameError) nameError.classList.add('hidden');
    if (nameInput) nameInput.classList.remove('input-error');
}

function updateName() {
    const nameInput = document.getElementById('editNameInput');
    const saveBtn = document.getElementById('saveNameBtn');
    
    if (!nameInput || !saveBtn) return;
    
    const newName = nameInput.value.trim();
    
    if (!newName) {
        showFlashMessage('Please enter a valid name', 'error');
        return;
    }

    // Set loading state
    saveBtn.classList.add('btn-loading');
    saveBtn.disabled = true;
    
    // Get CSRF token
    const csrfToken = document.querySelector('meta[name="csrf-token"]');
    const headers = {
        'Content-Type': 'application/json'
    };
    
    if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken.content;
    }

    fetch('/update-name', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ name: newName })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showFlashMessage(data.message || 'Name updated successfully!', 'success');
            originalName = newName;
            
            // Update UI elements
            const sidebarUserName = document.getElementById('sidebarUserName');
            const profileUserName = document.getElementById('profileUserName');
            const accountInfoName = document.getElementById('accountInfoName');
            
            if (sidebarUserName) sidebarUserName.textContent = newName;
            if (profileUserName) profileUserName.textContent = newName;
            if (accountInfoName) accountInfoName.textContent = newName;
            
            // Update all avatar initials
            const avatars = document.querySelectorAll('.avatar-circle');
            avatars.forEach(avatar => {
                avatar.textContent = newName[0].toUpperCase();
            });
            
            setTimeout(() => {
                closeAccountDetailsModal();
            }, 1500);
        } else {
            showFlashMessage(data.message || 'Failed to update name', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showFlashMessage('An error occurred while updating name', 'error');
    })
    .finally(() => {
        saveBtn.classList.remove('btn-loading');
        saveBtn.disabled = false;
    });
}

// Password Management Functions
function clearPasswordErrors() {
    const errorIds = ['currentPasswordError', 'newPasswordError', 'confirmPasswordError'];
    const inputIds = ['currentPassword', 'newPassword', 'confirmNewPassword'];
    
    errorIds.forEach(errorId => {
        const error = document.getElementById(errorId);
        if (error) error.classList.add('hidden');
    });
    
    inputIds.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) input.classList.remove('input-error');
    });
}

function validatePasswordForm() {
    const currentPassword = document.getElementById('currentPassword');
    const newPassword = document.getElementById('newPassword');
    const confirmPassword = document.getElementById('confirmNewPassword');
    
    if (!currentPassword || !newPassword || !confirmPassword) return false;
    
    let isValid = true;

    clearPasswordErrors();

    if (!currentPassword.value) {
        const error = document.getElementById('currentPasswordError');
        if (error) {
            error.textContent = 'Current password is required';
            error.classList.remove('hidden');
        }
        currentPassword.classList.add('input-error');
        isValid = false;
    }

    if (!newPassword.value) {
        const error = document.getElementById('newPasswordError');
        if (error) {
            error.textContent = 'New password is required';
            error.classList.remove('hidden');
        }
        newPassword.classList.add('input-error');
        isValid = false;
    } else if (newPassword.value.length < 8) {
        const error = document.getElementById('newPasswordError');
        if (error) {
            error.textContent = 'Password must be at least 8 characters';
            error.classList.remove('hidden');
        }
        newPassword.classList.add('input-error');
        isValid = false;
    }

    if (!confirmPassword.value) {
        const error = document.getElementById('confirmPasswordError');
        if (error) {
            error.textContent = 'Please confirm your new password';
            error.classList.remove('hidden');
        }
        confirmPassword.classList.add('input-error');
        isValid = false;
    } else if (newPassword.value !== confirmPassword.value) {
        const error = document.getElementById('confirmPasswordError');
        if (error) {
            error.textContent = 'Passwords do not match';
            error.classList.remove('hidden');
        }
        confirmPassword.classList.add('input-error');
        isValid = false;
    }

    return isValid;
}

function changePassword() {
    if (!validatePasswordForm()) {
        return;
    }

    const currentPassword = document.getElementById('currentPassword');
    const newPassword = document.getElementById('newPassword');
    const changeBtn = document.getElementById('changePasswordBtn');
    
    if (!currentPassword || !newPassword || !changeBtn) return;

    // Set loading state
    changeBtn.classList.add('btn-loading');
    changeBtn.disabled = true;
    
    // Get CSRF token
    const csrfToken = document.querySelector('meta[name="csrf-token"]');
    const headers = {
        'Content-Type': 'application/json'
    };
    
    if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken.content;
    }

    fetch('/change-password', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            current_password: currentPassword.value,
            new_password: newPassword.value
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showFlashMessage(data.message || 'Password changed successfully!', 'success');
            setTimeout(() => {
                closeChangePasswordModal();
            }, 1500);
        } else {
            showFlashMessage(data.message || 'Failed to change password', 'error');
            
            // Show specific field errors
            if (data.message && data.message.toLowerCase().includes('current password')) {
                const error = document.getElementById('currentPasswordError');
                if (error) {
                    error.textContent = data.message;
                    error.classList.remove('hidden');
                }
                currentPassword.classList.add('input-error');
            }
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showFlashMessage('An error occurred while changing password', 'error');
    })
    .finally(() => {
        changeBtn.classList.remove('btn-loading');
        changeBtn.disabled = false;
    });
}

// Account Deletion Function with Password Confirmation
function deleteAccount() {
    const passwordInput = document.getElementById('deleteConfirmPassword');
    const deleteBtn = document.getElementById('deleteAccountBtn');
    const errorDiv = document.getElementById('deleteConfirmError');
    
    if (!passwordInput || !deleteBtn || !errorDiv) return;

    // Clear previous errors
    errorDiv.classList.add('hidden');
    passwordInput.classList.remove('input-error');

    const password = passwordInput.value.trim();

    // Validate password input
    if (!password) {
        const errorSpan = errorDiv.querySelector('span');
        if (errorSpan) errorSpan.textContent = 'Please enter your password';
        errorDiv.classList.remove('hidden');
        passwordInput.classList.add('input-error');
        return;
    }

    // Set loading state
    deleteBtn.classList.add('btn-loading');
    deleteBtn.disabled = true;
    
    // Get CSRF token
    const csrfToken = document.querySelector('meta[name="csrf-token"]');
    const headers = {
        'Content-Type': 'application/json'
    };
    
    if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken.content;
    }

    fetch('/delete-account', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ password: password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showFlashMessage(data.message || 'Account deleted successfully', 'success');
            setTimeout(() => {
                window.location.href = "/logout";
            }, 1500);
        } else {
            showFlashMessage(data.message || 'Failed to delete account', 'error');
            const errorSpan = errorDiv.querySelector('span');
            if (errorSpan) errorSpan.textContent = data.message || 'Incorrect password';
            errorDiv.classList.remove('hidden');
            passwordInput.classList.add('input-error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showFlashMessage('An error occurred while deleting account', 'error');
    })
    .finally(() => {
        deleteBtn.classList.remove('btn-loading');
        deleteBtn.disabled = false;
    });
}