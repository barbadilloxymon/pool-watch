// user-delete.js - Delete User Functions
document.addEventListener('DOMContentLoaded', function() {
    initializeDeleteUserForm();
});

function initializeDeleteUserForm() {
    // Handle delete confirmations
    const deleteButtons = document.querySelectorAll('[data-action="delete"]');
    deleteButtons.forEach(button => {
        button.addEventListener('click', function() {
            const email = this.dataset.email;
            if (email) {
                confirmDeleteUser(email);
            }
        });
    });
    
    // Handle form submission - prevent default and use AJAX
    const deleteUserForm = document.getElementById('deleteUserForm');
    if (deleteUserForm) {
        deleteUserForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const email = document.getElementById('deleteEmail').value;
            if (email) {
                deleteUser(email);
            }
        });
    }
}

function confirmDeleteUser(email) {
    document.getElementById('deleteEmail').value = email;
    document.getElementById('deleteUserEmail').textContent = email;
    Modal.open('deleteUserModal');
}

function deleteUser(email) {
    // Show loading state
    const deleteBtn = document.querySelector('#deleteUserModal button[type="submit"]');
    if (deleteBtn) {
        const originalText = deleteBtn.innerHTML;
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Deleting...';
        
        // Reset button after timeout (fallback)
        setTimeout(() => {
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = originalText;
        }, 10000);
    }
    
    fetch('/delete_user', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCSRFToken()
        },
        body: JSON.stringify({
            email: email
        })
    })
    .then(response => {
        // Check if response is ok
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.message || 'Failed to delete user');
            }).catch(() => {
                throw new Error(`Server error: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            showNotification(data.message || 'User deleted successfully', 'success');
            Modal.close('deleteUserModal');
            
            // Remove user card from DOM
            const userCards = document.querySelectorAll('.user-card');
            userCards.forEach(card => {
                const emailText = card.querySelector('p.text-gray-500');
                if (emailText && emailText.textContent.trim() === email) {
                    card.remove();
                }
            });
            
            // Check if no users left and show empty state
            setTimeout(() => {
                const remainingCards = document.querySelectorAll('.user-card');
                if (remainingCards.length === 0) {
                    location.reload(); // Reload to show empty state
                }
            }, 500);
        } else {
            showNotification(data.message || 'Failed to delete user', 'error');
        }
    })
    .catch(error => {
        console.error('Error deleting user:', error);
        showNotification(error.message || 'Failed to delete user', 'error');
    })
    .finally(() => {
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = originalText;
        }
    });
}

// Bulk delete functions (if needed)
function confirmBulkDelete() {
    const selectedUsers = getSelectedUsers();
    if (selectedUsers.length === 0) {
        showNotification('Please select users to delete', 'error');
        return;
    }
    
    const modal = document.getElementById('bulkDeleteModal');
    if (modal) {
        document.getElementById('bulkDeleteCount').textContent = selectedUsers.length;
        Modal.open('bulkDeleteModal');
    }
}

function getSelectedUsers() {
    const checkboxes = document.querySelectorAll('input[name="user_select"]:checked');
    return Array.from(checkboxes).map(checkbox => checkbox.value);
}

function bulkDeleteUsers() {
    const selectedUsers = getSelectedUsers();
    if (selectedUsers.length === 0) {
        showNotification('No users selected', 'error');
        return;
    }
    
    const deleteBtn = document.querySelector('#bulkDeleteModal button[type="submit"]');
    if (deleteBtn) {
        const originalText = deleteBtn.innerHTML;
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Deleting...';
    }
    
    fetch('/bulk_delete_users', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCSRFToken()
        },
        body: JSON.stringify({
            emails: selectedUsers
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification(`${data.deleted_count} users deleted successfully`, 'success');
            Modal.close('bulkDeleteModal');
            
            // Reload page to reflect changes
            setTimeout(() => {
                location.reload();
            }, 1500);
        } else {
            showNotification(data.message || 'Failed to delete selected users', 'error');
        }
    })
    .catch(error => {
        console.error('Error bulk deleting users:', error);
        showNotification('Failed to delete selected users', 'error');
    })
    .finally(() => {
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = originalText;
        }
    });
}