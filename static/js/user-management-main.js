// user-management-main.js - Core User Management Functions
document.addEventListener('DOMContentLoaded', function() {
    initializeCoreUserFunctions();
    initializeFlashMessages();
});

function initializeCoreUserFunctions() {
    initializeSearch();
    initializePasswordToggles();
    initializeFormSubmissions();
    initializeUIEnhancements();
    initializeModalFunctions();
}

// Search functionality
function initializeSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        let searchTimeout;
        
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                const searchTerm = this.value.toLowerCase().trim();
                const userCards = document.querySelectorAll('.user-card');
                let visibleCount = 0;
                
                userCards.forEach(card => {
                    const fullName = card.querySelector('h4')?.textContent.toLowerCase() || '';
                    const email = card.querySelector('p.text-gray-500')?.textContent.toLowerCase() || '';
                    const role = card.querySelector('span.inline-flex')?.textContent.toLowerCase() || '';
                    
                    const matches = fullName.includes(searchTerm) || 
                                  email.includes(searchTerm) || 
                                  role.includes(searchTerm);
                    
                    if (matches || searchTerm === '') {
                        card.style.display = 'block';
                        visibleCount++;
                        highlightText(card, searchTerm);
                    } else {
                        card.style.display = 'none';
                        removeHighlights(card);
                    }
                });
                
                const noResultsElement = document.getElementById('noResults');
                const usersContainer = document.getElementById('usersContainer');
                
                if (noResultsElement && usersContainer) {
                    if (visibleCount === 0 && searchTerm.length > 0) {
                        noResultsElement.classList.remove('hidden');
                        usersContainer.classList.add('hidden');
                    } else {
                        noResultsElement.classList.add('hidden');
                        usersContainer.classList.remove('hidden');
                    }
                }
            }, 300);
        });
        
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                this.value = '';
                this.dispatchEvent(new Event('input'));
                this.blur();
            }
        });
    }
}

function highlightText(element, searchTerm) {
    if (!searchTerm) return;
    
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
    let node;
    while (node = walker.nextNode()) {
        const parent = node.parentNode;
        if (parent.nodeName === 'SCRIPT' || parent.nodeName === 'STYLE') {
            continue;
        }
        
        const text = node.textContent;
        const regex = new RegExp(`(${escapeRegex(searchTerm)})`, 'gi');
        const newText = text.replace(regex, '<mark class="bg-yellow-200 rounded px-1">$1</mark>');
        
        if (newText !== text) {
            const newSpan = document.createElement('span');
            newSpan.innerHTML = newText;
            parent.replaceChild(newSpan, node);
        }
    }
}

function removeHighlights(element) {
    const marks = element.querySelectorAll('mark');
    marks.forEach(mark => {
        const parent = mark.parentNode;
        parent.replaceChild(document.createTextNode(mark.textContent), mark);
        parent.normalize();
    });
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Password show/hide toggle
function initializePasswordToggles() {
    document.querySelectorAll('.password-toggle').forEach(toggle => {
        toggle.addEventListener('click', function() {
            const input = this.closest('.relative').querySelector('input[type="password"], input[type="text"]');
            const icon = this.querySelector('i');
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
                this.setAttribute('title', 'Hide password');
            } else {
                input.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
                this.setAttribute('title', 'Show password');
            }
        });
    });
}

// Form validation functions
function validateField() {
    const field = this;
    const value = field.value.trim();
    
    if (field.hasAttribute('required') && !value) {
        showFieldError(field, "This field is required");
        return false;
    }
    
    if (field.type === 'email' && value) {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(value)) {
            showFieldError(field, "Please enter a valid email address");
            return false;
        }
    }
    
    if (field.pattern && value) {
        const pattern = new RegExp(field.pattern);
        if (!pattern.test(value)) {
            showFieldError(field, field.title || "Invalid format");
            return false;
        }
    }
    
    if (field.type === 'password' && field.id.includes('password') && !field.id.includes('old') && !field.id.includes('confirm') && value) {
        if (!isPasswordStrong(value)) {
            showFieldError(field, "Password must be at least 8 characters with uppercase, lowercase, number and special character");
            return false;
        }
    }
    
    if (field.id.includes('confirm') && field.type === 'password') {
        const originalPasswordId = field.id.includes('new') ? 'new_password' : 'add_password';
        const originalPassword = document.getElementById(originalPasswordId);
        if (originalPassword && field.value !== originalPassword.value) {
            showFieldError(field, "Passwords do not match");
            return false;
        }
    }
    
    clearFieldError(field);
    return true;
}

function showFieldError(field, message) {
    let errorElement = field.parentElement.querySelector('.error-message');
    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.className = 'error-message text-red-500 text-sm mt-1 flex items-start';
        field.parentElement.appendChild(errorElement);
    }
    
    errorElement.innerHTML = `<i class="fas fa-exclamation-circle mr-1 mt-0.5 flex-shrink-0"></i><span>${message}</span>`;
    errorElement.classList.remove('hidden');
    field.classList.add('border-red-500');
    field.classList.remove('border-green-500', 'border-gray-300');
}

function clearFieldError() {
    const field = this;
    const errorElement = field.parentElement.querySelector('.error-message');
    if (errorElement) {
        errorElement.classList.add('hidden');
    }
    field.classList.remove('border-red-500');
    
    if (field.value.trim() && validateField.call(field)) {
        field.classList.add('border-green-500');
    } else {
        field.classList.remove('border-green-500');
        field.classList.add('border-gray-300');
    }
    
    updateSubmitButtonStates();
}

function isPasswordStrong(password) {
    const strongPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return strongPattern.test(password);
}

function checkPasswordStrength(passwordInput) {
    const password = passwordInput.value;
    const strengthBar = document.getElementById('password_strength_bar');
    const strengthText = document.getElementById('password_strength_text');
    const strengthContainer = strengthBar?.parentElement?.parentElement;
    
    // FIXED: Hide strength indicator when password is empty
    if (!password || password.length === 0) {
        if (strengthContainer) {
            strengthContainer.style.display = 'none';
        }
        return;
    }
    
    // Show strength indicator when user starts typing
    if (strengthContainer) {
        strengthContainer.style.display = 'block';
    }
    
    let strength = 0;
    let strengthTextValue = '';
    let strengthColor = '';
    
    if (password.length >= 8) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[@$!%*?&]/.test(password)) strength++;
    
    const percentage = (strength / 5) * 100;
    
    switch(strength) {
        case 0:
        case 1:
            strengthTextValue = 'Very Weak';
            strengthColor = '#ef4444';
            break;
        case 2:
            strengthTextValue = 'Weak';
            strengthColor = '#f59e0b';
            break;
        case 3:
            strengthTextValue = 'Fair';
            strengthColor = '#eab308';
            break;
        case 4:
            strengthTextValue = 'Good';
            strengthColor = '#22c55e';
            break;
        case 5:
            strengthTextValue = 'Strong';
            strengthColor = '#16a34a';
            break;
    }
    
    if (strengthBar) {
        strengthBar.style.width = percentage + '%';
        strengthBar.style.backgroundColor = strengthColor;
        strengthBar.style.transition = 'width 0.5s ease, background-color 0.5s ease';
    }
    
    if (strengthText) {
        strengthText.textContent = strengthTextValue;
        strengthText.style.color = strengthColor;
        strengthText.className = 'text-xs font-medium';
    }
    
    updateSubmitButtonStates();
}

function updateSubmitButtonStates() {
    const addForm = document.getElementById('addUserForm');
    const addSubmitBtn = document.getElementById('submitButton');
    if (addForm && addSubmitBtn) {
        const isValid = isFormValid(addForm);
        addSubmitBtn.disabled = !isValid;
        addSubmitBtn.classList.toggle('opacity-50', !isValid);
        addSubmitBtn.classList.toggle('cursor-not-allowed', !isValid);
    }
    
    const editForm = document.getElementById('editUserForm');
    const editSubmitBtn = editForm ? editForm.querySelector('button[type="submit"]') : null;
    if (editForm && editSubmitBtn) {
        const isValid = isFormValid(editForm);
        editSubmitBtn.disabled = !isValid;
        editSubmitBtn.classList.toggle('opacity-50', !isValid);
        editSubmitBtn.classList.toggle('cursor-not-allowed', !isValid);
    }
}

function isFormValid(form) {
    const requiredInputs = form.querySelectorAll('input[required], select[required]');
    let isValid = true;
    
    requiredInputs.forEach(input => {
        // Skip validation for password fields that are empty in edit forms
        if (input.type === 'password' && !input.value.trim() && form.id === 'editUserForm') {
            return;
        }
        
        if (!input.value.trim()) {
            isValid = false;
            return;
        }
        
        if (input.classList.contains('border-red-500')) {
            isValid = false;
        }
    });
    
    // Check role selection
    if (form.id === 'addUserForm' || form.id === 'editUserForm') {
        const roleChecked = form.querySelector('input[name="role"]:checked');
        if (!roleChecked) {
            isValid = false;
        }
    }
    
    const passwordInput = form.querySelector('input[type="password"]:not([id*="confirm"]):not([id*="old"])');
    const confirmInput = form.querySelector('input[id*="confirm"]');
    
    if (passwordInput && passwordInput.value && !isPasswordStrong(passwordInput.value)) {
        isValid = false;
    }
    
    if (passwordInput && confirmInput && passwordInput.value !== confirmInput.value) {
        isValid = false;
    }
    
    return isValid;
}

function getCSRFToken() {
    const tokenInput = document.querySelector('input[name="csrf_token"]');
    return tokenInput ? tokenInput.value : '';
}

function initializeFormSubmissions() {
    document.addEventListener('submit', function(e) {
        const form = e.target;
        
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn && !submitBtn.disabled) {
            const originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';
            
            setTimeout(() => {
                if (submitBtn.disabled) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalText;
                    if (typeof showNotification === 'function') {
                        showNotification('Request timed out. Please try again.', 'error');
                    }
                }
            }, 10000);
        }
    });
}

function initializeUIEnhancements() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    document.querySelectorAll('button[data-loading]').forEach(button => {
        button.addEventListener('click', function() {
            const loadingText = this.dataset.loading;
            const originalText = this.innerHTML;
            
            this.disabled = true;
            this.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>${loadingText}`;
            
            setTimeout(() => {
                if (this.disabled) {
                    this.disabled = false;
                    this.innerHTML = originalText;
                }
            }, 5000);
        });
    });
    
    document.querySelectorAll('.user-card').forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-4px)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
    });
}

function initializeModalFunctions() {
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal-overlay')) {
            const modal = e.target.closest('.modal');
            if (modal) {
                Modal.close(modal.id);
            }
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const visibleModals = document.querySelectorAll('.modal:not(.pointer-events-none)');
            visibleModals.forEach(modal => {
                Modal.close(modal.id);
            });
        }
    });
}

const Modal = {
    open: function(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('opacity-0', 'pointer-events-none');
            modal.classList.add('opacity-100');
            document.body.style.overflow = 'hidden';
            document.body.style.paddingRight = '15px';
            
            const firstInput = modal.querySelector('input:not([readonly]):not([disabled]), select, textarea');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
            
            this.addBackdrop();
        }
    },
    
    close: function(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('opacity-100');
            modal.classList.add('opacity-0');
            setTimeout(() => {
                modal.classList.add('pointer-events-none');
                document.body.style.overflow = 'auto';
                document.body.style.paddingRight = '';
            }, 300);
            
            this.removeBackdrop();
        }
    },
    
    closeAll: function() {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            this.close(modal.id);
        });
    },
    
    addBackdrop: function() {
        if (!document.getElementById('modal-backdrop')) {
            const backdrop = document.createElement('div');
            backdrop.id = 'modal-backdrop';
            backdrop.className = 'fixed inset-0 bg-black opacity-50 z-40';
            document.body.appendChild(backdrop);
        }
    },
    
    removeBackdrop: function() {
        const backdrop = document.getElementById('modal-backdrop');
        if (backdrop) {
            backdrop.remove();
        }
    }
};

function debounce(func, wait, immediate) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            timeout = null;
            if (!immediate) func(...args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func(...args);
    };
}

function formatDate(dateString) {
    const options = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return new Date(dateString).toLocaleDateString(undefined, options);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        Modal,
        showNotification,
        validateField,
        isPasswordStrong,
        getCSRFToken
    };
}