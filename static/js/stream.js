document.addEventListener('DOMContentLoaded', function() {
    
    let currentZoom = 1;
    let isFullscreen = false;
    let streamStartTime = Date.now();
    let dotMenuOpen = false;
    let detectionUpdateInterval = null;
    let healthCheckInterval = null;
    let alarmCheckInterval = null;
    let lastAlarmState = false;
    let isDetectionPanelVisible = false; 
    
    
    const cameraContainer = document.getElementById('cameraContainer');
    const videoWrapper = document.querySelector('.video-wrapper');
    const dotMenuToggle = document.getElementById('dotMenuToggle');
    const dotMenuPanel = document.getElementById('dotMenuPanel');
    const aiStatusBadge = document.getElementById('aiStatusBadge');
    const aiStatusIcon = document.getElementById('aiStatusIcon');
    const aiStatusText = document.getElementById('aiStatusText');
    const aiStatusTextMobile = document.getElementById('aiStatusTextMobile');
    const aiStatsToggle = document.getElementById('aiStatsToggle');
    const detectionOverlay = document.getElementById('detectionOverlay');
    
    
    function toggleDotMenu() {
        dotMenuOpen = !dotMenuOpen;
        
        // Get all buttons inside the panel
        const panelButtons = dotMenuPanel.querySelectorAll('button');
        
        if (dotMenuOpen) {
            dotMenuPanel.classList.remove('scale-95', 'opacity-0', 'pointer-events-none');
            dotMenuPanel.classList.add('scale-100', 'opacity-100', 'pointer-events-auto');
            dotMenuToggle.style.transform = 'rotate(45deg)';
            // Enable pointer events on all buttons
            panelButtons.forEach(btn => {
                btn.style.pointerEvents = 'auto';
            });
        } else {
            dotMenuPanel.classList.remove('scale-100', 'opacity-100', 'pointer-events-auto');
            dotMenuPanel.classList.add('scale-95', 'opacity-0', 'pointer-events-none');
            dotMenuToggle.style.transform = 'rotate(0deg)';
            // Disable pointer events on all buttons
            panelButtons.forEach(btn => {
                btn.style.pointerEvents = 'none';
            });
        }
    }
    
    dotMenuToggle?.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleDotMenu();
    });
    
    
    document.addEventListener('click', function(e) {
        if (dotMenuOpen && !dotMenuPanel.contains(e.target) && e.target !== dotMenuToggle) {
            toggleDotMenu();
        }
    });
    
    
    setInterval(function() {
        const liveIndicator = document.getElementById('liveIndicator');
        if (liveIndicator) {
            liveIndicator.style.opacity = liveIndicator.style.opacity === '0.5' ? '1' : '0.5';
        }
    }, 1000);
    
   
    function updateStreamTime() {
        const elapsed = Date.now() - streamStartTime;
        const hours = Math.floor(elapsed / 3600000);
        const minutes = Math.floor((elapsed % 3600000) / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        
        const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        const streamTimeElement = document.getElementById('streamTime');
        if (streamTimeElement) {
            streamTimeElement.textContent = timeString;
        }
    }
    
    setInterval(updateStreamTime, 1000);

    // Enhanced Fullscreen functionality with button text update
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const fullscreenIcon = fullscreenBtn?.querySelector('i');
    const fullscreenText = fullscreenBtn?.querySelector('span');
    
    function updateFullscreenButton() {
        if (!fullscreenBtn || !fullscreenIcon || !fullscreenText) return;
        
        if (isFullscreen) {
            fullscreenIcon.className = 'fas fa-compress text-base';
            fullscreenText.textContent = 'Exit';
        } else {
            fullscreenIcon.className = 'fas fa-expand text-base';
            fullscreenText.textContent = 'Full';
        }
    }
    
    function enterFullscreen() {
        if (cameraContainer.requestFullscreen) {
            cameraContainer.requestFullscreen();
        } else if (cameraContainer.webkitRequestFullscreen) {
            cameraContainer.webkitRequestFullscreen();
        } else if (cameraContainer.msRequestFullscreen) {
            cameraContainer.msRequestFullscreen();
        }
        
        isFullscreen = true;
        updateFullscreenButton();
    }
    
    function exitFullscreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
        
        isFullscreen = false;
        updateFullscreenButton();
    }
    
    fullscreenBtn?.addEventListener('click', function() {
        if (isFullscreen) {
            exitFullscreen();
        } else {
            enterFullscreen();
        }
    });
    
    // Handle fullscreen change events (for ESC key or browser controls)
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    
    function handleFullscreenChange() {
        const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
        
        if (!fullscreenElement) {
            isFullscreen = false;
            currentZoom = 1;
            applyZoom();
            updateFullscreenButton();
        } else {
            isFullscreen = true;
            updateFullscreenButton();
        }
    }

    // Enhanced smooth zoom functionality
    const maxZoom = 4;
    const minZoom = 0.5;
    const zoomStep = 0.2; // Smaller steps for smoother control

    document.getElementById('zoomInBtn')?.addEventListener('click', function() {
        if (currentZoom < maxZoom) {
            currentZoom = Math.min(maxZoom, currentZoom + zoomStep);
            applyZoom(true);
        }
    });

    document.getElementById('zoomOutBtn')?.addEventListener('click', function() {
        if (currentZoom > minZoom) {
            currentZoom = Math.max(minZoom, currentZoom - zoomStep);
            applyZoom(true);
        }
    });

    document.getElementById('resetZoomBtn')?.addEventListener('click', function() {
        currentZoom = 1;
        applyZoom(true);
    });

    function applyZoom(smooth = false) {
        if (!videoWrapper) return;
        
        // Apply smooth transition
        if (smooth) {
            videoWrapper.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        } else {
            videoWrapper.style.transition = 'none';
        }
        
        videoWrapper.style.transform = `scale(${currentZoom.toFixed(2)})`;
        videoWrapper.style.transformOrigin = 'center center';
        
        // Update zoom level display (optional)
        updateZoomDisplay();
    }
    
    function updateZoomDisplay() {
        const zoomInBtn = document.getElementById('zoomInBtn');
        const zoomOutBtn = document.getElementById('zoomOutBtn');
        
        // Disable buttons at limits
        if (zoomInBtn) {
            zoomInBtn.style.opacity = currentZoom >= maxZoom ? '0.5' : '1';
            zoomInBtn.style.pointerEvents = currentZoom >= maxZoom ? 'none' : 'auto';
        }
        if (zoomOutBtn) {
            zoomOutBtn.style.opacity = currentZoom <= minZoom ? '0.5' : '1';
            zoomOutBtn.style.pointerEvents = currentZoom <= minZoom ? 'none' : 'auto';
        }
    }
    
    // Mouse wheel zoom support (optional enhancement)
    cameraContainer?.addEventListener('wheel', function(e) {
        if (e.ctrlKey || e.metaKey) { // Only zoom when holding Ctrl/Cmd
            e.preventDefault();
            
            if (e.deltaY < 0 && currentZoom < maxZoom) {
                currentZoom = Math.min(maxZoom, currentZoom + 0.1);
                applyZoom(true);
            } else if (e.deltaY > 0 && currentZoom > minZoom) {
                currentZoom = Math.max(minZoom, currentZoom - 0.1);
                applyZoom(true);
            }
        }
    }, { passive: false });

    // Toggle detection overlay
    document.getElementById('toggleDetectionBtn')?.addEventListener('click', function() {
        toggleDetectionPanel();
    });
    
    aiStatsToggle?.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleDetectionPanel();
    });
    
    function toggleDetectionPanel() {
        isDetectionPanelVisible = !isDetectionPanelVisible;
        
        if (isDetectionPanelVisible) {
            detectionOverlay.classList.remove('hidden');
            aiStatsToggle.checked = true;
        } else {
            detectionOverlay.classList.add('hidden');
            aiStatsToggle.checked = false;
        }
        
        if (isDetectionPanelVisible) {
            updateDetectionStatus();
        }
    }

    // AUTO STATUS UPDATE
    function updateAIStatus(isDrowning) {
        if (!aiStatusBadge || !aiStatusIcon || !aiStatusText || !aiStatusTextMobile) return;
        
        const alarmStatus = document.getElementById('alarmStatus');
        
        if (isDrowning) {
            aiStatusBadge.className = 'flex items-center space-x-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-full transition-all duration-300 animate-pulse';
            aiStatusIcon.className = 'fas fa-exclamation-triangle';
            aiStatusText.textContent = 'Drowning Detected!';
            aiStatusTextMobile.textContent = 'DROWNING!';
            if (alarmStatus) alarmStatus.classList.remove('hidden');
        } else {
            aiStatusBadge.className = 'flex items-center space-x-2 bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded-full transition-all duration-300';
            aiStatusIcon.className = 'fas fa-shield-alt';
            aiStatusText.textContent = 'AI Monitoring Active';
            aiStatusTextMobile.textContent = 'AI Active';
            if (alarmStatus) alarmStatus.classList.add('hidden');
        }
    }

    // AUTO ALARM CONTROL
    function checkAndControlAlarm(isDrowning) {
        if (isDrowning === lastAlarmState) return;
        
        lastAlarmState = isDrowning;
        
        if (isDrowning) {
            fetch('/play_alarm', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': document.querySelector('meta[name="csrf-token"]')?.content || ''
                }
            }).catch(err => console.warn('Alarm play failed:', err));
            console.log('AUTO ALARM: Started');
        } else {
            fetch('/stop_alarm', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': document.querySelector('meta[name="csrf-token"]')?.content || ''
                }
            }).catch(err => console.warn('Alarm stop failed:', err));
            console.log('AUTO ALARM: Stopped');
        }
    }

    // Snapshot functionality
    document.getElementById('snapshotBtn')?.addEventListener('click', function() {
        const videoFeed = document.getElementById('videoFeed');
        if (!videoFeed) return;
        
        const flashOverlay = document.createElement('div');
        flashOverlay.style.cssText = 'position:absolute;inset:0;background:white;opacity:0;pointer-events:none;transition:opacity 0.1s';
        cameraContainer.appendChild(flashOverlay);
        
        requestAnimationFrame(() => {
            flashOverlay.style.opacity = '0.8';
            setTimeout(() => {
                flashOverlay.style.opacity = '0';
                setTimeout(() => cameraContainer.removeChild(flashOverlay), 100);
            }, 100);
        });
        
        const canvas = document.createElement('canvas');
        canvas.width = videoFeed.naturalWidth || 1920;
        canvas.height = videoFeed.naturalHeight || 1080;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoFeed, 0, 0);
        
        const snapshotImage = document.getElementById('snapshotImage');
        const snapshotCameraName = document.getElementById('snapshotCameraName');
        const snapshotDateTime = document.getElementById('snapshotDateTime');
        
        if (snapshotImage) snapshotImage.src = canvas.toDataURL('image/jpeg', 0.9);
        if (snapshotCameraName) snapshotCameraName.textContent = document.getElementById('currentCameraName')?.textContent || 'Camera';
        
        const now = new Date();
        if (snapshotDateTime) {
            snapshotDateTime.textContent = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
        }
        
        const downloadBtn = document.getElementById('downloadSnapshotBtn');
        if (downloadBtn) {
            downloadBtn.onclick = function() {
                const link = document.createElement('a');
                link.download = `pool-snapshot-${now.getTime()}.jpg`;
                link.href = canvas.toDataURL('image/jpeg', 0.9);
                link.click();
            };
        }
        
        if (typeof Modal !== 'undefined' && Modal.open) {
            Modal.open('snapshotModal');
        }
        
        toggleDotMenu();
    });

    // Detection status update
    let lastDetectionData = null;
    
    function updateDetectionStatus() {
        const currentCameraId = document.getElementById('currentCameraId')?.value;
        if (!currentCameraId) return;
        
        fetch(`/detection_status?camera_id=${currentCameraId}`, {
            method: 'GET',
            cache: 'no-cache'
        })
        .then(response => response.ok ? response.json() : null)
        .then(data => {
            if (!data || !data[currentCameraId]) return;
            
            const detection = data[currentCameraId];
            const dataStr = JSON.stringify(detection);
            if (dataStr === JSON.stringify(lastDetectionData)) return;
            lastDetectionData = detection;
            
            const isDrowning = detection.drowning_detected === true;
            updateAIStatus(isDrowning);
            checkAndControlAlarm(isDrowning);
            
            const activeTracksCount = document.getElementById('activeTracksCount');
            const detectionStatusText = document.getElementById('detectionStatusText');
            
            if (activeTracksCount) {
                activeTracksCount.textContent = detection.active_tracks || 0;
            }
            
            if (detectionStatusText) {
                if (isDrowning) {
                    detectionStatusText.textContent = 'DROWNING!';
                    detectionStatusText.className = 'font-bold text-red-400';
                } else {
                    detectionStatusText.textContent = 'Normal';
                    detectionStatusText.className = 'font-bold text-green-400';
                }
            }
            
            const detectionResults = document.getElementById('detectionResults');
            if (detectionResults && isDetectionPanelVisible) {
                if (detection.objects && detection.objects.length > 0) {
                    let html = `
                        <div class="flex justify-between">
                            <span class="text-gray-300">Active Tracks:</span>
                            <span class="font-bold text-white">${detection.active_tracks || 0}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-300">Status:</span>
                            <span class="font-bold ${isDrowning ? 'text-red-400' : 'text-green-400'}">
                                ${isDrowning ? 'DROWNING!' : 'Normal'}
                            </span>
                        </div>
                        <div class="border-t border-gray-700 my-2"></div>
                    `;
                    
                    detection.objects.forEach(obj => {
                        const isDrowningObj = obj.label === 'drowning';
                        html += `
                            <div class="py-1">
                                <div class="flex justify-between ${isDrowningObj ? 'text-red-300' : 'text-gray-300'}">
                                    <span class="text-xs">ID ${obj.track_id} ${obj.label}</span>
                                    <span class="text-xs font-mono">${(obj.confidence * 100).toFixed(0)}%</span>
                                </div>
                                <div class="flex justify-between text-xs">
                                    <span class="text-gray-400">Drowning:</span>
                                    <span class="${obj.drowning_count >= 100 ? 'text-red-400 font-bold' : 'text-gray-400'}">
                                        ${obj.drowning_count}/${obj.window_size}
                                    </span>
                                </div>
                            </div>
                        `;
                    });
                    
                    detectionResults.innerHTML = html;
                } else {
                    detectionResults.innerHTML = `
                        <div class="flex justify-between">
                            <span class="text-gray-300">Active Tracks:</span>
                            <span class="font-bold text-white">0</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-300">Status:</span>
                            <span class="font-bold text-green-400">Normal</span>
                        </div>
                    `;
                }
            }
        })
        .catch(err => console.warn('Detection update skipped:', err.message));
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        switch(e.key.toLowerCase()) {
            case 'f':
                e.preventDefault();
                isFullscreen ? exitFullscreen() : enterFullscreen();
                break;
            case 'escape':
                if (dotMenuOpen) toggleDotMenu();
                else if (isFullscreen) exitFullscreen();
                break;
            case '=':
            case '+':
                e.preventDefault();
                document.getElementById('zoomInBtn')?.click();
                break;
            case '-':
                e.preventDefault();
                document.getElementById('zoomOutBtn')?.click();
                break;
            case '0':
                e.preventDefault();
                document.getElementById('resetZoomBtn')?.click();
                break;
            case 's':
                e.preventDefault();
                document.getElementById('snapshotBtn')?.click();
                break;
            case 'd':
                e.preventDefault();
                document.getElementById('toggleDetectionBtn')?.click();
                break;
        }
    });

    // Stream health monitoring
    const videoFeed = document.getElementById('videoFeed');
    const connectionStatus = document.getElementById('connectionStatus');
    
    if (videoFeed && connectionStatus) {
        videoFeed.onerror = function() {
            connectionStatus.textContent = 'Reconnecting...';
            connectionStatus.className = 'text-sm text-orange-600 font-medium';
            
            setTimeout(() => {
                const src = this.src.split('?')[0];
                const cameraId = this.src.includes('camera_id') ? this.src.split('camera_id=')[1].split('&')[0] : '';
                this.src = `${src}?${cameraId ? 'camera_id=' + cameraId + '&' : ''}t=${Date.now()}`;
            }, 2000);
        };
        
        videoFeed.onload = function() {
            connectionStatus.textContent = 'Connected';
            connectionStatus.className = 'text-sm text-green-600 font-medium';
        };
    }

    // Health check
    function performHealthCheck() {
        const currentCameraId = document.getElementById('currentCameraId')?.value;
        if (!currentCameraId) return;
        
        fetch(`/health?camera_id=${currentCameraId}`)
            .then(response => response.json())
            .then(data => {
                if (connectionStatus) {
                    connectionStatus.textContent = data.current_camera_connected ? 'Connected' : 'Disconnected';
                    connectionStatus.className = data.current_camera_connected ? 
                        'text-sm text-green-600 font-medium' : 
                        'text-sm text-red-600 font-medium';
                }
            })
            .catch(() => {});
    }

    // Touch gestures for mobile
    let touchStartX, touchStartY;
    
    cameraContainer?.addEventListener('touchstart', function(e) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });
    
    cameraContainer?.addEventListener('touchend', function(e) {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;
        const minSwipeDistance = 50;
        
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
            const currentCamera = document.querySelector('.camera-thumbnail .border-blue-500');
            if (deltaX > 0) {
                const prevCamera = currentCamera?.parentElement.previousElementSibling?.querySelector('a');
                if (prevCamera) prevCamera.click();
            } else {
                const nextCamera = currentCamera?.parentElement.nextElementSibling?.querySelector('a');
                if (nextCamera) nextCamera.click();
            }
        } else if (Math.abs(deltaY) > minSwipeDistance) {
            if (deltaY < 0 && !dotMenuOpen) {
                toggleDotMenu();
            } else if (deltaY > 0 && dotMenuOpen) {
                toggleDotMenu();
            }
        }
    }, { passive: true });

    // Initialize
    performHealthCheck();
    updateDetectionStatus();
    updateFullscreenButton();
    updateZoomDisplay();
    
    detectionUpdateInterval = setInterval(updateDetectionStatus, 2000);
    healthCheckInterval = setInterval(performHealthCheck, 20000);
    
    // Performance optimization
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            if (detectionUpdateInterval) {
                clearInterval(detectionUpdateInterval);
                detectionUpdateInterval = null;
            }
            if (healthCheckInterval) {
                clearInterval(healthCheckInterval);
                healthCheckInterval = null;
            }
        } else {
            updateDetectionStatus();
            performHealthCheck();
            
            if (!detectionUpdateInterval) {
                detectionUpdateInterval = setInterval(updateDetectionStatus, 2000);
            }
            if (!healthCheckInterval) {
                healthCheckInterval = setInterval(performHealthCheck, 20000);
            }
        }
    });
    
    window.addEventListener('beforeunload', function() {
        if (detectionUpdateInterval) clearInterval(detectionUpdateInterval);
        if (healthCheckInterval) clearInterval(healthCheckInterval);
    });
    
    console.log('Pool Watch - Enhanced Controls Active');
    console.log('Fullscreen button now toggles between "Full" and "Exit"');
    console.log('Smooth zoom with Ctrl+Scroll support');
});