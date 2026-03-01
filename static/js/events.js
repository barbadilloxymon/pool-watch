// Configuration
const PH_TIMEZONE = 'Asia/Manila';
let CAMERA_IDS = []; // Monitor all cameras
let lastAlarmStates = {}; // Track alarm state per camera
let isProcessingSnapshot = false;
let monitoringInterval = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeCameras();
    startMonitoring();
    updateEventCount();
    
    // Set up camera filter
    document.getElementById('cameraFilter')?.addEventListener('change', filterEvents);
    
    const dateFilter = document.getElementById('dateFilter');
    const resetDateFilterBtn = document.getElementById('resetDateFilter');
    
    dateFilter?.addEventListener('change', filterEvents);
    resetDateFilterBtn?.addEventListener('click', function() {
        if (dateFilter) {
            dateFilter.value = '';
        }
        filterEvents();
    });
    
    // Initialize flash message close buttons
    initFlashMessages();
});

// Helper: Format date/time in Philippine timezone
function formatPhilippineDate(date, options = {}) {
    return new Intl.DateTimeFormat('en-US', { timeZone: PH_TIMEZONE, ...options }).format(date);
}

function formatPhilippineDateInput(date) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: PH_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

function formatPhilippineDateTime(date) {
    const datePart = formatPhilippineDate(date, { month: 'short', day: '2-digit', year: 'numeric' });
    const timePart = formatPhilippineDate(date, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
    return `${datePart} at ${timePart} PHT`;
}

// Initialize flash message functionality
function initFlashMessages() {
    document.querySelectorAll('.flash-close').forEach(button => {
        button.addEventListener('click', function() {
            const flashMessage = this.closest('.flash-message');
            dismissFlashMessage(flashMessage);
        });
    });
}

// Dismiss flash message with animation
function dismissFlashMessage(flashMessage) {
    if (!flashMessage) return;
    
    flashMessage.classList.add('dismissing');
    setTimeout(() => {
        flashMessage.remove();
    }, 300);
}

// Initialize all cameras for monitoring
function initializeCameras() {
    const cameraFilter = document.getElementById('cameraFilter');
    if (cameraFilter) {
        const cameraOptions = cameraFilter.querySelectorAll('option');
        CAMERA_IDS = [];
        cameraOptions.forEach(option => {
            if (option.value !== 'all') {
                CAMERA_IDS.push(option.value);
                lastAlarmStates[option.value] = false;
            }
        });
    }
    console.log('Initialized cameras for monitoring:', CAMERA_IDS);
}

// Start monitoring detection status for all cameras
function startMonitoring() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
    }
    monitoringInterval = setInterval(checkAlarmTrigger, 1000); // Check every second
}

// Check if alarm is triggered and capture snapshot for all cameras
async function checkAlarmTrigger() {
    if (CAMERA_IDS.length === 0 || isProcessingSnapshot) return;
    
    // Check all cameras
    for (const cameraId of CAMERA_IDS) {
        try {
            const response = await fetch(`/detection_status?camera_id=${cameraId}&t=${Date.now()}`);
            if (!response.ok) continue;
            
            const data = await response.json();
            
            if (data && data[cameraId]) {
                const status = data[cameraId];
                const alarmPlaying = status.alarm_playing;
                const drowningDetected = status.drowning_detected;
                const wasAlarmActive = lastAlarmStates[cameraId] || false;
                const isAlarmActive = alarmPlaying || drowningDetected;
                
                // Capture snapshot when alarm triggers (transition from false to true)
                if (isAlarmActive && !wasAlarmActive) {
                    console.log(`[ALARM TRIGGERED] Camera ${cameraId} - Capturing snapshot now...`);
                    await captureSnapshotOnAlarm(cameraId, status);
                }
                
                // Update last alarm state for this camera
                lastAlarmStates[cameraId] = isAlarmActive;
            }
        } catch (error) {
            console.error(`Error checking alarm status for camera ${cameraId}:`, error);
        }
    }
}

// Capture snapshot when alarm is triggered
async function captureSnapshotOnAlarm(cameraId, status) {
    if (isProcessingSnapshot) {
        console.log('[SNAPSHOT] Already processing, skipping...');
        return;
    }
    
    isProcessingSnapshot = true;
    
    try {
        // Calculate confidence and get ACTUAL drowning level
        let confidence = 0;
        let label = 'drowning';
        let drowningLevel = 0;
        
        if (status.objects && status.objects.length > 0) {
            const maxObj = status.objects.reduce((max, obj) => 
                obj.confidence > max.confidence ? obj : max
            );
            confidence = maxObj.confidence;
            label = maxObj.label || 'drowning';
            
            // Convert to 0-255 range for consistency
            if (confidence <= 1.0) {
                confidence = Math.round(confidence * 255);
            }
            
            // Get ACTUAL drowning level from detection data
            drowningLevel = maxObj.drowning_count || 0;
        } else if (status.drowning_detected) {
            confidence = 200;
            drowningLevel = status.drowning_count || 0;
        }
        
        // Capture snapshot image
        console.log(`[SNAPSHOT] Capturing snapshot for camera ${cameraId}...`);
        const snapshotResponse = await fetch(`/capture_snapshot?camera_id=${cameraId}&t=${Date.now()}`);
        
        if (!snapshotResponse.ok) {
            throw new Error(`HTTP error: ${snapshotResponse.status}`);
        }
        
        const snapshotData = await snapshotResponse.json();
        
        if (!snapshotData.success) {
            throw new Error(snapshotData.error || 'Failed to capture snapshot');
        }
        
        const snapshotUrl = snapshotData.snapshot_url;
        
        if (!snapshotUrl) {
            throw new Error('No snapshot URL returned');
        }
        
        // Save to Firestore - backend will fetch correct camera name and location
        const saveResponse = await fetch('/save_snapshot', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify({
                camera_id: cameraId,
                confidence: confidence,
                label: label,
                snapshot_url: snapshotUrl,
                drowning_count: drowningLevel,
                drowning_detected: status.drowning_detected || status.alarm_playing,
                active_tracks: status.active_tracks || 0,
                timestamp: new Date().toISOString()
            })
        });
        
        if (!saveResponse.ok) {
            throw new Error(`HTTP error: ${saveResponse.status}`);
        }
        
        const result = await saveResponse.json();
        
        if (result.success) {
            console.log(`[SNAPSHOT SAVED] Event ID: ${result.event_id} at ${new Date().toLocaleTimeString()}`);
            
            // Add to UI immediately
            if (result.event) {
                addSnapshotToUI(result.event);
                updateEventCount();
                
                // Show success notification
                showFlashMessage('Drowning detected! Snapshot captured successfully!', 'success');
            }
        } else {
            console.error('[SNAPSHOT FAILED]', result.error);
            showFlashMessage('Failed to save snapshot: ' + (result.error || 'Unknown error'), 'error');
        }
        
    } catch (error) {
        console.error('Error capturing snapshot:', error);
        showFlashMessage('Error capturing snapshot: ' + error.message, 'error');
    } finally {
        // Reset processing flag after a short delay to prevent rapid-fire captures
        setTimeout(() => {
            isProcessingSnapshot = false;
        }, 2000);
    }
}

// Add snapshot to UI
function addSnapshotToUI(event) {
    const emptyState = document.getElementById('emptyState');
    if (emptyState) {
        emptyState.style.display = 'none';
    }
    
    const eventsList = document.getElementById('eventsList');
    if (!eventsList) return;
    
    // Normalize confidence for display
    const confNormalized = event.confidence > 1 ? event.confidence / 255.0 : event.confidence;
    const confidencePercent = (confNormalized * 100).toFixed(1);
    const confidenceColor = confNormalized >= 0.9 ? 'bg-red-600' : 
                           confNormalized >= 0.7 ? 'bg-orange-600' : 'bg-yellow-600';
    
    // Parse timestamp correctly
    const eventDate = new Date(event.timestamp);
    const dateStr = formatPhilippineDate(eventDate, { year: 'numeric', month: 'short', day: 'numeric' });
    const timeStr = formatPhilippineDate(eventDate, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    const fullTimeStr = formatPhilippineDateTime(eventDate);
    
    // Get ACTUAL drowning level (not default values)
    const drowningLevel = event.drowning_count || 0;
    
    const eventCard = document.createElement('div');
    eventCard.className = 'bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-all duration-200 event-card snapshot-card';
    eventCard.dataset.cameraId = event.camera_id;
    eventCard.dataset.timestamp = (eventDate.getTime() / 1000).toString();
    eventCard.dataset.eventId = event.id;
    eventCard.dataset.snapshotUrl = event.snapshot_url || '/static/img/no-signal.png';
    eventCard.dataset.cameraName = event.camera_name;
    eventCard.dataset.location = event.location;
    eventCard.dataset.fullTime = fullTimeStr;
    eventCard.dataset.confidence = event.confidence;
    eventCard.dataset.drowningLevel = drowningLevel;
    
    eventCard.innerHTML = `
        <div class="flex flex-col md:flex-row">
            <!-- Thumbnail Image -->
            <div class="w-full md:w-1/3 lg:w-1/4 relative group cursor-pointer" onclick="openImageModalFromCard(this.closest('.event-card'), event)">
                <div class="aspect-video bg-gray-900 relative overflow-hidden rounded-t-lg md:rounded-l-lg md:rounded-t-none">
                    <img src="${event.snapshot_url || '/static/img/no-signal.png'}" 
                         alt="Detection Snapshot" 
                         class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                         onerror="this.src='/static/img/no-signal.png'"
                         loading="lazy">
                    
                    <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all duration-300 flex items-center justify-center">
                        <div class="opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-center">
                            <i class="fas fa-search-plus text-white text-2xl md:text-3xl mb-2"></i>
                            <p class="text-white text-xs md:text-sm font-medium">Click to view full screen</p>
                        </div>
                    </div>
                    
                    <div class="absolute top-2 md:top-3 left-2 md:left-3 z-10">
                        <span class="px-2 md:px-3 py-1 rounded-full text-xs font-semibold ${confidenceColor} text-white shadow-lg">
                            ${confidencePercent}%
                        </span>
                    </div>
                    
                    <div class="absolute top-2 md:top-3 right-2 md:right-3 z-10">
                        <span class="px-2 md:px-3 py-1 rounded-full text-xs font-semibold bg-red-600 text-white shadow-lg">
                            <i class="fas fa-exclamation-triangle mr-1"></i>ALERT
                        </span>
                    </div>
                </div>
            </div>
            
            <div class="w-full md:w-2/3 lg:w-3/4 p-4 md:p-6 flex flex-col">
                <div class="flex flex-col sm:flex-row sm:items-start justify-between mb-3 md:mb-4 gap-2 flex-shrink-0">
                    <div class="flex-1 min-w-0">
                        <h3 class="text-base md:text-lg font-semibold text-gray-900 mb-1 flex items-center">
                            <i class="fas fa-exclamation-triangle text-red-600 mr-2 text-sm md:text-base"></i>
                            <span class="truncate">Drowning Detected - Alarm Triggered</span>
                        </h3>
                        <div class="flex flex-wrap items-center gap-2 text-xs md:text-sm text-gray-600">
                            <span class="flex items-center whitespace-nowrap">
                                <i class="fas fa-camera mr-1"></i>
                                <span class="truncate max-w-[120px] md:max-w-none">${event.camera_name || 'Unknown Camera'}</span>
                            </span>
                            <span class="hidden sm:inline text-gray-300">•</span>
                            <span class="flex items-center whitespace-nowrap">
                                <i class="fas fa-map-marker-alt mr-1"></i>
                                <span class="truncate max-w-[100px] md:max-w-none">${event.location || 'Pool Area'}</span>
                            </span>
                        </div>
                    </div>
                    
                    <div class="flex items-center justify-end sm:justify-start space-x-1 md:space-x-2 flex-shrink-0">
                        <button onclick="downloadSnapshotFromCard(this.closest('.event-card'))" 
                                class="text-blue-600 hover:text-blue-800 hover:bg-blue-100 p-2 rounded-full transition text-sm md:text-base"
                                title="Download Snapshot">
                            <i class="fas fa-download"></i>
                        </button>
                        ${USER_ROLE !== 'user' ? `
                        <button onclick="openDeleteEventModal('${event.id}', '${event.camera_name || 'Unknown Camera'}', '${fullTimeStr}')" 
                                class="text-red-500 hover:text-red-600 hover:bg-red-50 p-2 rounded-full transition text-sm md:text-base"
                                title="Delete Event">
                            <i class="fas fa-trash"></i>
                        </button>
                        ` : ''}
                    </div>
                </div>
                
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 md:gap-3 flex-shrink-0">
                    <div class="bg-white rounded-lg p-2 md:p-3 border border-gray-200">
                        <div class="text-xs text-gray-500 mb-1">Date</div>
                        <div class="text-sm font-semibold text-gray-900 whitespace-nowrap">${dateStr}</div>
                    </div>
                    <div class="bg-white rounded-lg p-2 md:p-3 border border-gray-200">
                        <div class="text-xs text-gray-500 mb-1">Time</div>
                        <div class="text-sm font-semibold text-gray-900 whitespace-nowrap">${timeStr}</div>
                    </div>
                    <div class="bg-white rounded-lg p-2 md:p-3 border border-gray-200">
                        <div class="text-xs text-gray-500 mb-1">Confidence</div>
                        <div class="text-sm font-semibold text-gray-900">${confidencePercent}%</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    eventsList.insertBefore(eventCard, eventsList.firstChild);
    
    // Ensure new event respects active filters/count
    filterEvents();
}

// Show flash message using base.html style
function showFlashMessage(message, category = 'info') {
    // Get or create flash messages container
    let container = document.querySelector('.flash-messages-container');
    
    if (!container) {
        container = document.createElement('div');
        container.className = 'flash-messages-container';
        document.body.appendChild(container);
    }
    
    // Determine icon based on category
    let iconClass = 'fa-info-circle';
    if (category === 'success') {
        iconClass = 'fa-check-circle';
    } else if (category === 'error' || category === 'danger') {
        iconClass = 'fa-exclamation-circle';
    } else if (category === 'warning') {
        iconClass = 'fa-exclamation-triangle';
    }
    
    // Create flash message element
    const flashMessage = document.createElement('div');
    flashMessage.className = 'flash-message';
    flashMessage.setAttribute('data-category', category);
    
    flashMessage.innerHTML = `
        <div class="flex items-start justify-between">
            <div class="flex items-start flex-1">
                <div class="flex-shrink-0 mt-0.5">
                    <i class="fas ${iconClass}"></i>
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
    
    // Add close button functionality
    const closeButton = flashMessage.querySelector('.flash-close');
    closeButton.addEventListener('click', function() {
        dismissFlashMessage(flashMessage);
    });
    
    // Add to container
    container.appendChild(flashMessage);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        dismissFlashMessage(flashMessage);
    }, 5000);
}

// Helper functions that use data attributes
function openImageModalFromCard(cardElement, clickEvent) {
    // Prevent event bubbling if event is provided
    if (clickEvent) {
        clickEvent.stopPropagation();
    }
    
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const modalInfo = document.getElementById('modalInfo');
    
    if (!modal || !modalImage || !modalInfo) {
        console.error('Modal elements not found', { modal: !!modal, modalImage: !!modalImage, modalInfo: !!modalInfo });
        return;
    }
    
    const imageUrl = cardElement.dataset.snapshotUrl;
    const cameraName = cardElement.dataset.cameraName || 'Unknown Camera';
    const location = cardElement.dataset.location || 'Pool Area';
    const timestamp = cardElement.dataset.fullTime || 'Unknown time';
    const confidence = parseFloat(cardElement.dataset.confidence) || 0;
    
    console.log('Opening modal with:', { imageUrl, cameraName, location });
    
    // Validate and set image source
    if (imageUrl && imageUrl !== 'undefined' && imageUrl !== 'null' && imageUrl.trim() !== '') {
        modalImage.src = imageUrl;
        console.log('Image URL set:', imageUrl.substring(0, 50) + '...');
    } else {
        console.warn('Invalid image URL, using fallback');
        modalImage.src = '/static/img/no-signal.png';
    }
    
    // Handle image load errors
    modalImage.onerror = function() {
        console.warn('Failed to load image, using fallback');
        this.src = '/static/img/no-signal.png';
    };
    
    // Normalize confidence for display
    const confNormalized = confidence > 1 ? confidence / 255.0 : confidence;
    const confidencePercent = (confNormalized * 100).toFixed(1);
    
    // Build info HTML
    modalInfo.innerHTML = `
        <div class="space-y-2">
            <div class="text-lg font-bold">${escapeHtml(cameraName)}</div>
            <div class="text-sm"><i class="fas fa-map-marker-alt mr-2"></i>${escapeHtml(location)}</div>
            <div class="text-sm"><i class="fas fa-clock mr-2"></i>${escapeHtml(timestamp)}</div>
            <div class="text-sm"><i class="fas fa-chart-line mr-2"></i>Confidence: ${confidencePercent}%</div>
            <div class="mt-3 pt-2 border-t border-gray-600">
                <span class="px-3 py-1 rounded-full text-xs font-semibold bg-red-600 text-white">
                    <i class="fas fa-exclamation-triangle mr-1"></i>Drowning Alert
                </span>
            </div>
        </div>
    `;
    
    // Show modal with full screen styling
    modal.classList.remove('hidden');
    modal.style.display = 'block';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.zIndex = '9999';
    modal.style.overflow = 'hidden';
    
    // Ensure image container is properly sized
    const imageContainer = modal.querySelector('div > div');
    if (imageContainer) {
        imageContainer.style.width = '100%';
        imageContainer.style.height = '100%';
        imageContainer.style.display = 'flex';
        imageContainer.style.alignItems = 'center';
        imageContainer.style.justifyContent = 'center';
    }
    
    // Ensure image displays properly - Make it BIGGER
    modalImage.style.display = 'block';
    modalImage.style.maxWidth = '98vw';
    modalImage.style.maxHeight = '98vh';
    modalImage.style.width = 'auto';
    modalImage.style.height = 'auto';
    modalImage.style.objectFit = 'contain';
    modalImage.style.margin = 'auto';
    
    // Handle successful image load - Use natural size if smaller than viewport, otherwise scale to 98%
    modalImage.onload = function() {
        console.log('Image loaded successfully');
        const naturalWidth = this.naturalWidth;
        const naturalHeight = this.naturalHeight;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // If image is smaller than viewport, use natural size for maximum quality
        if (naturalWidth <= viewportWidth * 0.98 && naturalHeight <= viewportHeight * 0.98) {
            this.style.width = naturalWidth + 'px';
            this.style.height = naturalHeight + 'px';
            this.style.maxWidth = 'none';
            this.style.maxHeight = 'none';
        } else {
            // Scale to fit viewport - use 98% for maximum size
            this.style.maxWidth = '98vw';
            this.style.maxHeight = '98vh';
        }
    };
    
    // Prevent background scrolling
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    
    // Focus trap for accessibility
    modal.focus();
    
    console.log('Modal opened successfully');
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// FIXED: Proper base64 image download
function downloadSnapshotFromCard(cardElement) {
    const url = cardElement.dataset.snapshotUrl;
    const eventId = cardElement.dataset.eventId;
    
    if (!url) {
        showFlashMessage('No image available to download', 'warning');
        return;
    }
    
    // Handle base64 data URLs
    if (url.startsWith('data:image')) {
        try {
            // Extract base64 data from data URL
            const base64Data = url.split(',')[1];
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            const blob = new Blob([bytes], { type: 'image/jpeg' });
            const blobUrl = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `drowning_event_${eventId}_${Date.now()}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up the blob URL
            setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
            
            showFlashMessage('Snapshot downloaded successfully', 'success');
            
        } catch (error) {
            console.error('Error downloading base64 image:', error);
            showFlashMessage('Error downloading image', 'error');
        }
    } else {
        // Handle regular URLs
        const link = document.createElement('a');
        link.href = url;
        link.download = `drowning_event_${eventId}_${Date.now()}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showFlashMessage('Snapshot downloaded successfully', 'success');
    }
}

// Close image modal
function closeImageModal(event) {
    // Allow closing by clicking the backdrop or close button
    if (!event || event.target.id === 'imageModal' || event.target.closest('button')) {
        const modal = document.getElementById('imageModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
            modal.style.position = '';
            modal.style.top = '';
            modal.style.left = '';
            modal.style.width = '';
            modal.style.height = '';
            modal.style.zIndex = '';
            document.body.style.overflow = ''; // Restore scrolling
        }
    }
}

// Close modal on Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const modal = document.getElementById('imageModal');
        if (modal && !modal.classList.contains('hidden')) {
            closeImageModal();
        }
    }
});

// Delete event from Firestore
async function deleteEvent(eventId) {
    try {
        const response = await fetch(`/delete_snapshot/${eventId}`, {
            method: 'DELETE',
            headers: {
                'X-CSRFToken': getCSRFToken()
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Remove the event card from UI immediately
            const eventCard = document.querySelector(`[data-event-id="${eventId}"]`);
            if (eventCard) {
                eventCard.style.opacity = '0';
                eventCard.style.transform = 'translateX(-100%)';
                setTimeout(() => {
                    eventCard.remove();
                    updateEventCount();
                    
                    // Show empty state if no events left
                    const remainingEvents = document.querySelectorAll('.event-card');
                    if (remainingEvents.length === 0) {
                        const emptyState = document.getElementById('emptyState');
                        if (emptyState) {
                            emptyState.style.display = 'flex';
                        }
                    }
                }, 300);
            }
            
            // Show success message using base.html style
            showFlashMessage('Event deleted successfully', 'success');
        } else {
            console.error('Failed to delete event:', result.error);
            showFlashMessage('Failed to delete event. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Error deleting event:', error);
        showFlashMessage('Error deleting event. Please try again.', 'error');
    }
}

// Clear all snapshots
async function clearAllSnapshots() {
    try {
        const response = await fetch('/clear_all_snapshots', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCSRFToken()
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Remove all event cards with animation
            const eventCards = document.querySelectorAll('.event-card');
            eventCards.forEach((card, index) => {
                setTimeout(() => {
                    card.style.opacity = '0';
                    card.style.transform = 'translateX(-100%)';
                    setTimeout(() => card.remove(), 300);
                }, index * 100);
            });
            
            // Show empty state after animations
            setTimeout(() => {
                const emptyState = document.getElementById('emptyState');
                if (emptyState) {
                    emptyState.style.display = 'flex';
                }
                updateEventCount();
            }, eventCards.length * 100 + 300);
            
            // Show success message using base.html style
            showFlashMessage(`Successfully deleted ${result.deleted_count} events`, 'success');
        } else {
            console.error('Failed to clear events:', result.error);
            showFlashMessage('Failed to clear events. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Error clearing events:', error);
        showFlashMessage('Error clearing events. Please try again.', 'error');
    }
}

// Filter events by camera
function filterEvents() {
    const cameraFilter = document.getElementById('cameraFilter');
    const dateFilter = document.getElementById('dateFilter');
    const filterValue = cameraFilter ? cameraFilter.value : 'all';
    const selectedDate = dateFilter?.value;
    const eventCards = document.querySelectorAll('.event-card');
    let visibleCount = 0;
    
    eventCards.forEach(card => {
        const cameraId = card.dataset.cameraId;
        const matchesCamera = filterValue === 'all' || cameraId === filterValue;
        let matchesDate = true;
        
        if (selectedDate) {
            const timestamp = parseFloat(card.dataset.timestamp);
            if (!isNaN(timestamp)) {
                const cardDateStr = formatPhilippineDateInput(new Date(timestamp * 1000));
                matchesDate = cardDateStr === selectedDate;
            } else {
                matchesDate = false;
            }
        }
        
        if (matchesCamera && matchesDate) {
            card.style.display = 'flex';
            visibleCount += 1;
        } else {
            card.style.display = 'none';
        }
    });
    
    updateEventCount(visibleCount);
}

// Update event count display
function updateEventCount(forcedCount) {
    const eventCount = document.getElementById('eventCount');
    if (!eventCount) return;
    
    if (typeof forcedCount === 'number') {
        eventCount.textContent = forcedCount;
        return;
    }
    
    const visibleEvents = document.querySelectorAll('.event-card:not([style*="display: none"])');
    eventCount.textContent = visibleEvents.length;
}

// Helper function to get CSRF token
function getCSRFToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content || '';
}