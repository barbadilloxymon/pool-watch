// user-add.js - Add User Functions
document.addEventListener('DOMContentLoaded', function() {
    initializeAddUserForm();
});

function initializeAddUserForm() {
    // Add User button
    const addUserBtn = document.getElementById('addUserBtn');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', function() {
            resetAddUserForm();
            Modal.open('addUserModal');
        });
    }
    
    // Add First User button
    const addFirstUserBtn = document.getElementById('addFirstUserBtn');
    if (addFirstUserBtn) {
        addFirstUserBtn.addEventListener('click', function() {
            resetAddUserForm();
            Modal.open('addUserModal');
        });
    }
    
    // Form validation for add user form
    const addUserForm = document.getElementById('addUserForm');
    if (addUserForm) {
        addUserForm.addEventListener('submit', function(e) {
            if (!validateAddForm()) {
                e.preventDefault();
                return false;
            }
        });
        
        // Real-time validation
        const inputs = addUserForm.querySelectorAll('input[required]');
        inputs.forEach(input => {
            input.addEventListener('blur', validateField);
            input.addEventListener('input', clearFieldError);
        });
    }
    
    // Password strength checker for add form
    const addPasswordInput = document.getElementById('add_password');
    if (addPasswordInput) {
        addPasswordInput.addEventListener('input', function() {
            checkPasswordStrength(this);
        });
    }
}

function validateAddForm() {
    let isValid = true;
    const form = document.getElementById('addUserForm');
    const requiredInputs = form.querySelectorAll('input[required], select[required]');
    
    requiredInputs.forEach(input => {
        if (!validateField.call(input)) {
            isValid = false;
        }
    });
    
    // Check password confirmation
    const password = document.getElementById('add_password');
    const confirmPassword = document.getElementById('confirm_password');
    
    if (password && confirmPassword && password.value !== confirmPassword.value) {
        showFieldError(confirmPassword, "Passwords do not match");
        isValid = false;
    }
    
    return isValid;
}

function resetAddUserForm() {
    const form = document.getElementById('addUserForm');
    if (form) {
        form.reset();
        
        // Clear all error messages and styling
        const errorElements = form.querySelectorAll('.error-message');
        errorElements.forEach(el => el.remove());
        
        const inputs = form.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.classList.remove('border-red-500', 'border-green-500');
        });
        
        // Reset password strength indicator
        const strengthBar = document.getElementById('password_strength_bar');
        const strengthText = document.getElementById('password_strength_text');
        if (strengthBar) strengthBar.style.width = '0%';
        if (strengthText) strengthText.textContent = '';
        
        updateSubmitButtonStates();
    }
}

// Email availability checker for add user form
function checkEmailAvailability(email) {
    if (!email) return;
    
    const emailInput = document.getElementById('add_email');
    const errorDiv = document.getElementById('add_email_error');
    const duplicateDiv = document.getElementById('add_email_duplicate');
    const checkingDiv = document.getElementById('add_email_checking');
    const successDiv = document.getElementById('add_email_success');
    
    // Show checking state
    if (checkingDiv) {
        checkingDiv.classList.remove('hidden');
        if (errorDiv) errorDiv.classList.add('hidden');
        if (duplicateDiv) duplicateDiv.classList.add('hidden');
        if (successDiv) successDiv.classList.add('hidden');
    }
    
    // Make API call to check email availability
    fetch(`/check_email_availability?email=${encodeURIComponent(email)}`)
        .then(response => response.json())
        .then(data => {
            if (checkingDiv) checkingDiv.classList.add('hidden');
            
            if (data.available) {
                if (successDiv) {
                    successDiv.classList.remove('hidden');
                    emailInput.classList.add('border-green-500');
                    emailInput.classList.remove('border-red-500');
                }
            } else {
                if (duplicateDiv) {
                    duplicateDiv.classList.remove('hidden');
                    emailInput.classList.add('border-red-500');
                    emailInput.classList.remove('border-green-500');
                }
            }
        })
        .catch(error => {
            console.error('Error checking email:', error);
            if (checkingDiv) checkingDiv.classList.add('hidden');
            // Assume available on error
            if (successDiv) {
                successDiv.classList.remove('hidden');
                emailInput.classList.add('border-green-500');
                emailInput.classList.remove('border-red-500');
            }
        });
}

// Clear email status indicators
function clearEmailStatus() {
    const elements = ['add_email_error', 'add_email_duplicate', 'add_email_checking', 'add_email_success'];
    elements.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.classList.add('hidden');
    });
}

// Validation functions for add form
function validateEmail() {
    const emailInput = document.getElementById('add_email');
    if (emailInput && emailInput.value.trim()) {
        if (validateField.call(emailInput)) {
            checkEmailAvailability(emailInput.value.trim());
        }
    }
}

function validateFullName() {
    const nameInput = document.getElementById('add_full_name');
    if (nameInput) {
        validateField.call(nameInput);
    }
}

function validatePassword() {
    const passwordInput = document.getElementById('add_password');
    if (passwordInput) {
        validateField.call(passwordInput);
        checkPasswordStrength(passwordInput);
    }
}

function validateConfirmPassword() {
    const confirmInput = document.getElementById('confirm_password');
    if (confirmInput) {
        validateField.call(confirmInput);
    }
}   