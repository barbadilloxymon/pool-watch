// user-edit.js - Edit User Functions
document.addEventListener('DOMContentLoaded', function() {
    initializeEditUserForm();
});

function initializeEditUserForm() {
    // Form validation for edit user form
    const editUserForm = document.getElementById('editUserForm');
    if (editUserForm) {
        editUserForm.addEventListener('submit', function(e) {
            if (!validateEditForm()) {
                e.preventDefault();
                return false;
            }
        });
        
        // Real-time validation for all inputs - REMOVE the recursive calls
        const inputs = editUserForm.querySelectorAll('input[required]');
        inputs.forEach(input => {
            input.addEventListener('blur', validateEditField);
            input.addEventListener('input', function() {
                // Only validate this specific field, don't trigger full form validation
                validateSingleEditField(this);
                updateEditSubmitButton(); // Update button state without recursion
            });
        });

        // Real-time validation for role radios
        const roleRadios = editUserForm.querySelectorAll('input[name="role"]');
        roleRadios.forEach(radio => {
            radio.addEventListener('change', function() {
                updateEditSubmitButton(); // Just update button, no field validation
            });
        });
    }
}

function validateEditForm() {
    let isValid = true;
    const form = document.getElementById('editUserForm');
    
    // Validate full name without triggering real-time validation
    const fullNameInput = document.getElementById('edit_full_name');
    if (!validateSingleEditField(fullNameInput)) {
        isValid = false;
    }

    // Ensure a role is selected
    const roleRadios = form.querySelectorAll('input[name="role"]');
    if (![...roleRadios].some(radio => radio.checked)) {
        isValid = false;
        showEditFieldError(roleRadios[0], "Please select a role");
    } else {
        clearEditFieldError(roleRadios[0]);
    }
    
    return isValid;
}

// NEW FUNCTION: Validate single field without recursion
function validateSingleEditField(input) {
    const value = input.value.trim();
    let isValid = true;
    let errorMessage = '';

    switch(input.type) {
        case 'text':
            if (input.id === 'edit_full_name') {
                if (value.length < 2) {
                    isValid = false;
                    errorMessage = 'Name must be at least 2 characters long';
                } else if (!/^[A-Za-z\s]+$/.test(value)) {
                    isValid = false;
                    errorMessage = 'Name can only contain letters and spaces';
                }
            }
            break;
    }

    if (!isValid) {
        showEditFieldError(input, errorMessage);
    } else {
        clearEditFieldError(input);
    }

    return isValid;
}

// NEW FUNCTION: Update submit button without recursion
function updateEditSubmitButton() {
    const submitButton = document.querySelector('#editUserForm button[type="submit"]');
    if (!submitButton) return;

    // Simple validation check without calling the recursive functions
    const fullNameValid = validateSingleEditField(document.getElementById('edit_full_name'));
    const roleSelected = document.querySelector('input[name="role"]:checked') !== null;
    
    submitButton.disabled = !(fullNameValid && roleSelected);
}

// REMOVE THIS PROBLEMATIC FUNCTION COMPLETELY
// function validateEditFormRealTime() {
//     const submitButton = document.querySelector('#editUserForm button[type="submit"]');
//     if (!submitButton) return;
//
//     const isValid = validateEditForm(); // THIS CAUSES INFINITE LOOP
//     submitButton.disabled = !isValid;
// }

function validateEditField() {
    // This is only called on blur, so it's safe
    const input = this;
    const isValid = validateSingleEditField(input);
    updateEditSubmitButton(); // Safe to call here since it doesn't validate fields
    return isValid;
}

function showEditFieldError(input, message) {
    // Remove existing error
    clearEditFieldError(input);
    
    // Add error styling
    input.classList.add('border-red-500');
    input.classList.remove('border-green-500', 'border-gray-300');
    
    // Create error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'text-red-500 text-sm mt-1 flex items-center';
    errorDiv.innerHTML = `<i class="fas fa-exclamation-circle mr-1"></i><span>${message}</span>`;
    errorDiv.id = `${input.id}_error`;
    
    input.parentNode.appendChild(errorDiv);
}

function clearEditFieldError(input) {
    // Remove error styling
    input.classList.remove('border-red-500');
    input.classList.add('border-gray-300');
    
    // Remove error message
    const errorDiv = document.getElementById(`${input.id}_error`);
    if (errorDiv) {
        errorDiv.remove();
    }
}

function resetEditUserForm() {
    const form = document.getElementById('editUserForm');
    if (form) {
        form.reset();
        document.getElementById('edit_email').value = '';
        
        // Clear all error messages and styling
        const errorElements = form.querySelectorAll('[id$="_error"]');
        errorElements.forEach(el => el.remove());
        
        const inputs = form.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.classList.remove('border-red-500', 'border-green-500');
            input.classList.add('border-gray-300');
        });

        // Reset role radios
        const roleRadios = form.querySelectorAll('input[name="role"]');
        roleRadios.forEach(radio => radio.checked = false);
        
        // Disable submit button initially
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.disabled = true;
        }
    }
}

// User management functions
function editUser(email) {
    resetEditUserForm();
    document.getElementById('edit_email').value = email;
    document.getElementById('edit_email_display').value = email;
    
    // Show loading state
    const modal = document.getElementById('editUserModal');
    const form = document.getElementById('editUserForm');
    form.style.opacity = '0.5';
    
    fetch(`/get_user?email=${encodeURIComponent(email)}`)
        .then(response => response.json())
        .then(userData => {
            if (userData.error) {
                throw new Error(userData.error);
            }
            
            document.getElementById('edit_full_name').value = userData.full_name || '';

            // Set role radio button
            const role = userData.role || 'user';
            const roleInput = document.querySelector(`input[name="role"][value="${role}"]`);
            if (roleInput) {
                roleInput.checked = true;
            }
            
            form.style.opacity = '1';
            Modal.open('editUserModal');
            
            // Validate form after loading data
            setTimeout(() => {
                updateEditSubmitButton(); // Use the non-recursive version
                document.getElementById('edit_full_name').focus();
            }, 100);
        })
        .catch(error => {
            console.error('Error fetching user:', error);
            
            // Set default values and show modal anyway
            document.getElementById('edit_full_name').value = '';
            const defaultRole = document.querySelector('input[name="role"][value="user"]');
            if (defaultRole) {
                defaultRole.checked = true;
            }
            
            form.style.opacity = '1';
            Modal.open('editUserModal');
            
            showNotification('Error loading user data, but you can still edit', 'error');
            
            // Validate form after setting defaults
            setTimeout(updateEditSubmitButton, 100); // Use the non-recursive version
        });
}