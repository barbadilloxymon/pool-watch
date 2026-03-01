import cv2
import threading
import time
from datetime import datetime
import numpy as np
import os
from typing import Dict, Optional
import logging
import sys

# Try to import vlc, fallback to OpenCV if not available
try:
    import vlc
    VLC_AVAILABLE = True
except ImportError:
    VLC_AVAILABLE = False
    print("Warning: python-vlc not available, falling back to OpenCV")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Filter to suppress non-fatal FFmpeg HEVC warnings
class FFmpegWarningFilter:
    """Filter stderr to suppress non-fatal HEVC POC warnings from FFmpeg"""
    def __init__(self, original_stderr):
        self.original_stderr = original_stderr
    
    def write(self, message):
        # Suppress the specific HEVC POC warning (non-fatal)
        if "Could not find ref with POC" in message:
            return  # Filter out this specific warning
        # Pass through all other messages
        self.original_stderr.write(message)
    
    def flush(self):
        self.original_stderr.flush()

# Install the filter to suppress HEVC warnings
_original_stderr = sys.stderr
sys.stderr = FFmpegWarningFilter(_original_stderr)

class CameraInstance:
    def __init__(self, camera_id: str, rtsp_url: str, name: str = ""):
        self.camera_id = camera_id
        self.rtsp_url = rtsp_url
        self.name = name
        self.frame = None
        self.last_frame = None
        self.lock = threading.Lock()
        self.connection_status = "disconnected"
        self.last_update = None
        self.error_count = 0
        self.max_error_count = 3
        self.reconnect_delay = 5
        
        # OpenCV capture
        self.cap = None
        
        # State flags
        self.running = False
        self.thread = None
        self._stopped = False
        
        # Image paths
        self.offline_image = "static/img/cctv-cam-offline.png"
        self.no_signal_image = "static/img/no-signal.png"
        
        # Ensure images exist
        self._ensure_default_images()
    
    def _ensure_default_images(self):
        """Create default placeholder images if they don't exist"""
        os.makedirs("static/img", exist_ok=True)
        
        # Create offline image
        if not os.path.exists(self.offline_image):
            offline_img = np.full((480, 640, 3), 100, dtype=np.uint8)
            cv2.putText(offline_img, "CAMERA OFFLINE", (120, 240), 
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            cv2.imwrite(self.offline_image, offline_img)
            logger.info(f"Created offline image: {self.offline_image}")
        
        # Create no signal image
        if not os.path.exists(self.no_signal_image):
            no_signal_img = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
            cv2.putText(no_signal_img, "NO SIGNAL", (200, 240), 
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            cv2.imwrite(self.no_signal_image, no_signal_img)
            logger.info(f"Created no signal image: {self.no_signal_image}")
    
    def start(self):
        """Start the camera stream"""
        if self.running or self._stopped:
            return
            
        self.running = True
        self._stopped = False
        self.thread = threading.Thread(target=self._stream_worker, daemon=True)
        self.thread.start()
        logger.info(f"Started camera thread: {self.camera_id}")
    
    def stop(self):
        """Stop the camera stream - only stop once"""
        if self._stopped:
            return
            
        self._stopped = True
        self.running = False
        
        # Clean up resources
        if self.cap:
            try:
                self.cap.release()
            except Exception as e:
                logger.debug(f"Error releasing camera {self.camera_id}: {e}")
            finally:
                self.cap = None
        
        logger.info(f"Stopped camera: {self.camera_id}")
    
    def _test_connection_quick(self):
        """Quick connection test with proper cleanup"""
        test_cap = None
        try:
            test_cap = cv2.VideoCapture(self.rtsp_url)
            if test_cap.isOpened():
                # Set shorter timeout for quick test
                test_cap.set(cv2.CAP_PROP_POS_MSEC, 1000)
                ret, frame = test_cap.read()
                return ret and frame is not None
            return False
        except Exception as e:
            logger.debug(f"Quick connection test failed: {e}")
            return False
        finally:
            if test_cap:
                try:
                    test_cap.release()
                except:
                    pass
    
    def _setup_stream(self):
        """Setup the video capture stream with error handling"""
        try:
            # Add RTSP parameters for better stability
            # rtsp_transport=tcp: Use TCP for more reliable streaming
            rtsp_options = "rtsp_transport=tcp&buffer_size=65535&timeout=5000000"
            if "?" in self.rtsp_url:
                source = f"{self.rtsp_url}&{rtsp_options}"
            else:
                source = f"{self.rtsp_url}?{rtsp_options}"
            
            # Try different backends for better compatibility
            backends = [cv2.CAP_FFMPEG, cv2.CAP_GSTREAMER, cv2.CAP_ANY]
            
            for backend in backends:
                try:
                    self.cap = cv2.VideoCapture(source, backend)
                    if self.cap.isOpened():
                        # Configure for low latency
                        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                        self.cap.set(cv2.CAP_PROP_FPS, 30)
                        # Don't force FOURCC - let it use the stream's native codec
                        # This helps with HEVC streams
                        logger.info(f"Camera {self.camera_id} connected with backend {backend}")
                        return True
                except Exception as e:
                    logger.debug(f"Backend {backend} failed: {e}")
                    if self.cap:
                        self.cap.release()
                        self.cap = None
                    continue
            
            return False
            
        except Exception as e:
            logger.error(f"Failed to setup stream for camera {self.camera_id}: {e}")
            if self.cap:
                try:
                    self.cap.release()
                except:
                    pass
                self.cap = None
            return False
    
    def _stream_worker(self):
        """Main streaming worker thread with robust error handling"""
        consecutive_failures = 0
        max_consecutive_failures = 3
        
        while self.running and not self._stopped:
            try:
                if self.connection_status in ["disconnected", "offline"]:
                    logger.info(f"Attempting to connect to camera: {self.camera_id}")
                    self.connection_status = "connecting"
                    
                    if not self._test_connection_quick():
                        logger.warning(f"Quick connection test failed for camera: {self.camera_id}")
                        consecutive_failures += 1
                        self.error_count += 1
                        
                        if consecutive_failures >= max_consecutive_failures:
                            logger.info(f"Camera {self.camera_id} marked as offline")
                            self.connection_status = "offline"
                            time.sleep(30)
                            consecutive_failures = 0
                            continue
                        
                        time.sleep(self.reconnect_delay)
                        continue
                    
                    if not self._setup_stream():
                        logger.warning(f"Full stream setup failed for camera: {self.camera_id}")
                        consecutive_failures += 1
                        self.error_count += 1
                        
                        if consecutive_failures >= max_consecutive_failures:
                            self.connection_status = "offline"
                            time.sleep(30)
                            consecutive_failures = 0
                            continue
                        
                        time.sleep(self.reconnect_delay)
                        continue
                
                # Stream frames if connected
                if self.connection_status in ["connecting", "connected"] and self.cap and self.cap.isOpened():
                    if not self._stream_frames():
                        # Stream failed, try to recover
                        self.connection_status = "disconnected"
                        consecutive_failures += 1
                        if self.cap:
                            try:
                                self.cap.release()
                            except:
                                pass
                            self.cap = None
                        
                        if consecutive_failures >= max_consecutive_failures:
                            self.connection_status = "offline"
                            time.sleep(30)
                            consecutive_failures = 0
                        else:
                            time.sleep(self.reconnect_delay)
                    else:
                        # Stream successful
                        consecutive_failures = 0
                
            except Exception as e:
                logger.error(f"Stream worker error for camera {self.camera_id}: {e}")
                self.connection_status = "disconnected"
                consecutive_failures += 1
                self.error_count += 1
                
                if self.cap:
                    try:
                        self.cap.release()
                    except:
                        pass
                    self.cap = None
                
                if consecutive_failures >= max_consecutive_failures:
                    self.connection_status = "offline"
                    time.sleep(30)
                    consecutive_failures = 0
                else:
                    time.sleep(self.reconnect_delay)
    
    def _stream_frames(self):
        """Stream frames with robust error handling"""
        frames_without_update = 0
        max_frames_without_update = 15
        
        while self.running and not self._stopped and self.cap and self.cap.isOpened():
            try:
                ret, frame = self.cap.read()
                
                if ret and frame is not None and frame.size > 0:
                    with self.lock:
                        self.frame = frame
                        self.last_frame = frame
                        self.last_update = datetime.now()
                        self.connection_status = "connected"
                    frames_without_update = 0
                    self.error_count = 0
                else:
                    frames_without_update += 1
                    if frames_without_update >= max_frames_without_update:
                        logger.warning(f"No valid frames received for camera {self.camera_id}")
                        return False
                
                time.sleep(0.033)  # ~30 FPS
                
            except cv2.error as e:
                logger.warning(f"OpenCV error in camera {self.camera_id}: {e}")
                # Continue trying instead of stopping completely
                time.sleep(0.1)
                continue
            except Exception as e:
                logger.error(f"Unexpected error in camera {self.camera_id}: {e}")
                return False
        
        return True
    
    def get_frame(self):
        """Get current frame with appropriate placeholder based on status"""
        with self.lock:
            current_status = self.connection_status
            current_frame = self.frame
        
        if current_status == "connected" and current_frame is not None and current_frame.size > 0:
            return current_frame.copy()
        elif current_status == "connecting":
            no_signal_img = cv2.imread(self.no_signal_image)
            if no_signal_img is not None:
                cv2.putText(no_signal_img, "CONNECTING...", (10, 450), 
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
                return no_signal_img
        elif current_status == "offline":
            offline_img = cv2.imread(self.offline_image)
            if offline_img is not None:
                return offline_img
        
        # Default fallback
        no_signal_img = cv2.imread(self.no_signal_image)
        if no_signal_img is not None:
            cv2.putText(no_signal_img, "NO SIGNAL", (10, 450), 
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            return no_signal_img
        
        return np.full((480, 640, 3), 100, dtype=np.uint8)
    
    def get_status(self):
        """Get camera status information"""
        with self.lock:
            return {
                'camera_id': self.camera_id,
                'name': self.name,
                'connection_status': self.connection_status,
                'last_update': self.last_update.isoformat() if self.last_update else None,
                'error_count': self.error_count,
                'rtsp_url': self.rtsp_url,
                'active': self.connection_status == "connected"
            }
    
    def force_reconnect(self):
        """Force a reconnection attempt"""
        self.connection_status = "disconnected"
        self.error_count = 0
        if self.cap:
            try:
                self.cap.release()
            except:
                pass
            self.cap = None
        logger.info(f"Forced reconnection for camera: {self.camera_id}")


class CameraManager:
    def __init__(self):
        self.cameras: Dict[str, CameraInstance] = {}
        self.lock = threading.Lock()
        self.running = True
        self._stopped = False
    
    def add_camera(self, camera_id: str, rtsp_url: str, name: str = ""):
        """Add a new camera to the manager"""
        with self.lock:
            if camera_id in self.cameras:
                # Update existing camera instead of restarting
                existing_camera = self.cameras[camera_id]
                if existing_camera.rtsp_url != rtsp_url or existing_camera.name != name:
                    existing_camera.stop()
                    del self.cameras[camera_id]
                else:
                    # Camera already exists with same settings, no need to restart
                    return
            
            camera = CameraInstance(camera_id, rtsp_url, name)
            self.cameras[camera_id] = camera
            camera.start()
            
            logger.info(f"Added camera: {camera_id} - {name}")
    
    def remove_camera(self, camera_id: str):
        """Remove a camera from the manager"""
        with self.lock:
            if camera_id in self.cameras:
                self.cameras[camera_id].stop()
                del self.cameras[camera_id]
                logger.info(f"Removed camera: {camera_id}")
    
    def update_camera(self, camera_id: str, rtsp_url: str = None, name: str = None):
        """Update camera settings without restarting if not needed"""
        with self.lock:
            if camera_id in self.cameras:
                camera = self.cameras[camera_id]
                if rtsp_url and rtsp_url != camera.rtsp_url:
                    # Only restart if RTSP URL changed
                    camera.stop()
                    camera.rtsp_url = rtsp_url
                    camera.force_reconnect()
                    camera.start()
                elif name and name != camera.name:
                    # Just update name without restarting
                    camera.name = name
    
    def get_camera_frame(self, camera_id: str):
        """Get frame from specific camera"""
        with self.lock:
            if camera_id in self.cameras:
                return self.cameras[camera_id].get_frame()
        return None
    
    def get_camera_status(self, camera_id: str):
        """Get status of specific camera"""
        with self.lock:
            if camera_id in self.cameras:
                return self.cameras[camera_id].get_status()
        return None
    
    def get_all_status(self):
        """Get status of all cameras"""
        with self.lock:
            return {cam_id: camera.get_status() for cam_id, camera in self.cameras.items()}
    
    def gen_frames(self, camera_id: str, thumbnail: bool = False):
        """Generator that yields frames for a specific camera"""
        try:
            while True:
                frame = self.get_camera_frame(camera_id)
                if frame is not None:
                    try:
                        if thumbnail:
                            height, width = frame.shape[:2]
                            if height > 0 and width > 0:
                                new_width = 320
                                new_height = int(height * (new_width / width))
                                frame = cv2.resize(frame, (new_width, new_height))
                        
                        ret, buffer = cv2.imencode('.jpg', frame, [
                            cv2.IMWRITE_JPEG_QUALITY, 
                            70 if thumbnail else 85
                        ])
                        if ret:
                            frame_bytes = buffer.tobytes()
                            yield (b'--frame\r\n'
                                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                    except GeneratorExit:
                        logger.info(f"Client disconnected from camera {camera_id}")
                        break
                    except Exception as e:
                        logger.error(f"Error encoding frame for camera {camera_id}: {e}")
                time.sleep(0.033)
        except GeneratorExit:
            logger.info(f"Frame generator closed for camera {camera_id}")
    
    def force_reconnect_camera(self, camera_id: str):
        """Force a reconnection for a specific camera"""
        with self.lock:
            if camera_id in self.cameras:
                self.cameras[camera_id].force_reconnect()
                logger.info(f"Forced reconnection for camera: {camera_id}")
    
    def stop_all(self):
        """Stop all cameras and cleanup - only stop once"""
        if self._stopped:
            return
            
        self._stopped = True
        self.running = False
        with self.lock:
            for camera_id, camera in self.cameras.items():
                camera.stop()
            self.cameras.clear()
        logger.info("All cameras stopped")