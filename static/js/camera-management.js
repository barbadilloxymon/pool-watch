// Camera Management specific JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Add Camera button
    const addCameraBtn = document.getElementById('addCameraBtn');
    if (addCameraBtn) {
        addCameraBtn.addEventListener('click', function() {
            resetCameraForm();
            document.getElementById('cameraFormTitle').textContent = 'Add New Camera';
            openModal('cameraFormModal');
        });
    }
    
    // Empty state add button
    const emptyStateAddBtn = document.getElementById('emptyStateAddBtn');
    if (emptyStateAddBtn) {
        emptyStateAddBtn.addEventListener('click', function() {
            resetCameraForm();
            document.getElementById('cameraFormTitle').textContent = 'Add New Camera';
            openModal('cameraFormModal');
        });
    }
    
    // Test Connection Button
    const testConnectionBtn = document.getElementById('testConnectionBtn');
    if (testConnectionBtn) {
        testConnectionBtn.addEventListener('click', function() {
            testCameraConnection();
        });
    }
    
    // RTSP URL validation and auto-test
    const rtspUrlInput = document.getElementById('rtspUrl');
    if (rtspUrlInput) {
        let testTimeout;
        
        rtspUrlInput.addEventListener('input', function() {
            clearTimeout(testTimeout);
            const currentValue = this.value.trim();
            
            if (currentValue !== '') {
                // Auto-test after 2 seconds of inactivity
                testTimeout = setTimeout(() => {
                    if (validateRtspUrl(currentValue)) {
                        testCameraConnection();
                    }
                }, 2000);
            }
        });
    }
    
    // Close modals when clicking outside
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', function() {
            const modalId = this.closest('.modal').id;
            closeModal(modalId);
        });
    });
    
    // Auto-refresh camera status every 5 seconds
    setInterval(updateCameraStatuses, 5000);
});

// Update camera statuses on the page
function updateCameraStatuses() {
    fetch('/camera_status')
        .then(response => response.json())
        .then(data => {
            Object.keys(data).forEach(cameraId => {
                const status = data[cameraId];
                const cameraCard = document.querySelector(`[data-camera-id="${cameraId}"]`);
                
                if (cameraCard) {
                    const statusBadge = cameraCard.querySelector('.camera-status');
                    const statusDot = statusBadge?.querySelector('.w-2');
                    const statusText = statusBadge?.querySelector('.text-xs');
                    
                    if (statusDot && statusText) {
                        if (status.connection_status === 'connected') {
                            statusDot.className = 'w-2 h-2 rounded-full mr-2 bg-green-400';
                            statusText.textContent = 'Connected';
                        } else if (status.connection_status === 'connecting') {
                            statusDot.className = 'w-2 h-2 rounded-full mr-2 bg-yellow-400';
                            statusText.textContent = 'Connecting...';
                        } else if (status.connection_status === 'offline') {
                            statusDot.className = 'w-2 h-2 rounded-full mr-2 bg-gray-500';
                            statusText.textContent = 'Offline';
                        } else {
                            statusDot.className = 'w-2 h-2 rounded-full mr-2 bg-red-500';
                            statusText.textContent = 'Disconnected';
                        }
                    }
                }
            });
        })
        .catch(error => {
            console.error('Error updating camera statuses:', error);
        });
}

// Disable autocomplete for search inputs
document.addEventListener('DOMContentLoaded', function() {
    const searchInputs = document.querySelectorAll('input[type="text"][placeholder*="Search"], input#searchInput');
    
    searchInputs.forEach(input => {
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('spellcheck', 'false');
    });
});

// Reset camera form
function resetCameraForm() {
    document.getElementById('cameraForm').reset();
    document.getElementById('cameraId').value = '';
    const rtspUrlError = document.getElementById('rtspUrlError');
    if (rtspUrlError) rtspUrlError.classList.add('hidden');
    
    const previewFeed = document.getElementById('previewFeed');
    const previewStatus = document.getElementById('previewStatus');
    const previewStatusDot = document.getElementById('previewStatusDot');
    const previewStatusText = document.getElementById('previewStatusText');
    
    if (previewFeed) {
        previewFeed.classList.add('hidden');
        previewFeed.src = '';
    }
    
    if (previewStatus) {
        previewStatus.classList.remove('hidden');
        previewStatus.textContent = 'Waiting for connection...';
    }
    
    if (previewStatusDot) {
        previewStatusDot.classList.remove('bg-green-500', 'bg-yellow-400');
        previewStatusDot.classList.add('bg-red-500');
    }
    
    if (previewStatusText) {
        previewStatusText.textContent = 'Disconnected';
    }
    
    document.getElementById('previewResolution').textContent = '-';
    document.getElementById('previewFps').textContent = '-';
}

// Edit camera
function editCamera(id, name, rtspUrl, location) {
    resetCameraForm();
    document.getElementById('cameraFormTitle').textContent = 'Edit Camera';
    document.getElementById('cameraId').value = id;
    document.getElementById('cameraName').value = name;
    document.getElementById('rtspUrl').value = rtspUrl;
    document.getElementById('location').value = location;
    openModal('cameraFormModal');
    
    // Automatically test the connection
    setTimeout(() => {
        testCameraConnection();
    }, 500);
}

// Delete camera 
function deleteCamera(id, name) {
    console.log('deleteCamera called with:', id, name);
    
    document.getElementById('deleteCameraId').value = id;
    document.getElementById('deleteCameraName').textContent = name;
    
    Modal.open('deleteConfirmModal');
}

// Validate RTSP URL format
function validateRtspUrl(url) {
    const rtspPattern = /^rtsp:\/\/(?:([^:]+)(?::([^@]+))?@)?([^:/]+)(?::(\d+))?(?:\/(.*))?$/;
    const errorElement = document.getElementById('rtspUrlError');
    
    if (!errorElement) return false;
    
    if (!url) {
        errorElement.textContent = 'RTSP URL is required';
        errorElement.classList.remove('hidden');
        return false;
    }
    
    if (!rtspPattern.test(url)) {
        errorElement.textContent = 'Invalid RTSP URL format. Example: rtsp://admin:password@192.168.1.100:554/stream';
        errorElement.classList.remove('hidden');
        return false;
    }
    
    errorElement.classList.add('hidden');
    return true;
}

// Test camera connection
function testCameraConnection() {
    const rtspUrl = document.getElementById('rtspUrl').value;
    const cameraId = document.getElementById('cameraId').value || 'new';
    
    if (!validateRtspUrl(rtspUrl)) {
        return;
    }
    
    const previewStatus = document.getElementById('previewStatus');
    const previewFeed = document.getElementById('previewFeed');
    const previewStatusDot = document.getElementById('previewStatusDot');
    const previewStatusText = document.getElementById('previewStatusText');
    const testConnectionBtn = document.getElementById('testConnectionBtn');
    
    // Disable test button
    if (testConnectionBtn) {
        testConnectionBtn.disabled = true;
        testConnectionBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i> Testing...';
    }
    
    // Update UI to show connecting state
    if (previewFeed) {
        previewFeed.classList.add('hidden');
    }
    
    if (previewStatus) {
        previewStatus.classList.remove('hidden');
        previewStatus.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i> Connecting to camera...';
    }
    
    if (previewStatusDot) {
        previewStatusDot.classList.remove('bg-green-500', 'bg-red-500');
        previewStatusDot.classList.add('bg-yellow-400');
    }
    
    if (previewStatusText) {
        previewStatusText.textContent = 'Testing...';
    }
    
    // Send AJAX request to test connection
    fetch('/test_camera_connection', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': document.querySelector('meta[name="csrf-token"]')?.content || ''
        },
        body: JSON.stringify({ 
            rtsp_url: rtspUrl,
            camera_id: cameraId
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Connection successful - show preview
            if (previewStatus) {
                previewStatus.classList.add('hidden');
            }
            
            if (previewFeed) {
                previewFeed.classList.remove('hidden');
                previewFeed.src = '/camera_preview?url=' + encodeURIComponent(rtspUrl) + '&t=' + new Date().getTime();
                
                previewFeed.onerror = function() {
                    if (previewStatus) {
                        previewStatus.classList.remove('hidden');
                        previewStatus.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i> Preview not available';
                    }
                    previewFeed.classList.add('hidden');
                };
            }
            
            if (previewStatusDot) {
                previewStatusDot.classList.remove('bg-red-500', 'bg-yellow-400');
                previewStatusDot.classList.add('bg-green-500');
            }
            
            if (previewStatusText) {
                previewStatusText.textContent = 'Connected';
            }
            
            // Update resolution and FPS
            document.getElementById('previewResolution').textContent = data.resolution || 'Unknown';
            document.getElementById('previewFps').textContent = data.fps || 'Unknown';
            
        } else {
            // Connection failed
            if (previewStatus) {
                previewStatus.classList.remove('hidden');
                previewStatus.innerHTML = '<i class="fas fa-exclamation-triangle mr-2 text-red-500"></i> ' + 
                                        (data.error || 'Connection failed');
            }
            
            if (previewFeed) {
                previewFeed.classList.add('hidden');
            }
            
            if (previewStatusDot) {
                previewStatusDot.classList.remove('bg-green-500', 'bg-yellow-400');
                previewStatusDot.classList.add('bg-red-500');
            }
            
            if (previewStatusText) {
                previewStatusText.textContent = 'Failed';
            }
        }
    })
    .catch(error => {
        console.error('Test connection error:', error);
        
        if (previewStatus) {
            previewStatus.classList.remove('hidden');
            previewStatus.innerHTML = '<i class="fas fa-exclamation-triangle mr-2 text-red-500"></i> ' + 
                                    'Error: ' + error.message;
        }
        
        if (previewFeed) {
            previewFeed.classList.add('hidden');
        }
        
        if (previewStatusDot) {
            previewStatusDot.classList.remove('bg-green-500', 'bg-yellow-400');
            previewStatusDot.classList.add('bg-red-500');
        }
        
        if (previewStatusText) {
            previewStatusText.textContent = 'Error';
        }
    })
    .finally(() => {
        // Re-enable test button
        if (testConnectionBtn) {
            testConnectionBtn.disabled = false;
            testConnectionBtn.innerHTML = '<i class="fas fa-plug mr-2"></i> Test Connection';
        }
    });
}