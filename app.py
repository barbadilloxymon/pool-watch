import os
import pygame
import threading
import time
import cv2
import numpy as np
from collections import deque
from ultralytics import YOLO
from flask import Flask, request, session, jsonify, Response, render_template
from flask_wtf.csrf import CSRFProtect
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv
import atexit
import signal
import torch

from config import Config
from forms import LoginForm
from decorators import login_required, admin_required
from utils.camera_manager import CameraManager
from utils.helpers import datetimeformat, get_cameras, test_rtsp_connection

# Import route initializers
from routes.auth import init_auth_routes
from routes.camera import init_camera_routes
from routes.user import init_user_routes
from routes.events import init_events_routes
from routes.account import init_account_routes
from routes.detection import init_detection_routes

# Load environment variables
load_dotenv()

# Detection Constants
CONFIDENCE_THRESHOLD = 0.60
IOU_MATCH_THRESHOLD = 0.4  # Increased from 0.3 to reduce false matches
MAX_MISSED_FRAMES = 10
WINDOW_SIZE = 200
DROWN_THRESHOLD = 200  # Alarm triggers at 200 
ALARM_REPEAT_SECONDS = 0  # No repeat delay - continuous alarm
PROCESS_EVERY_N_FRAMES = 1
NORMAL_SWIMMING_THRESHOLD = 20  # Frames of consecutive normal swimming before fast decrease
FAST_DECREASE_MULTIPLIER = 3  # How many drowning labels to remove per frame when swimming normally

# YOLOv8m Optimization Settings
# Reduce INPUT_SIZE for faster inference (320, 416, 480, 640)
# Smaller = faster but less accurate. 416 is a good balance for YOLOv8m
YOLO_INPUT_SIZE = int(os.environ.get('YOLO_INPUT_SIZE', 416))

class Track:
    """Represents a tracked object with temporal label history and path tracking"""
    
    def __init__(self, track_id, bbox, label, frame_index, conf):
        self.id = track_id
        self.bbox = bbox
        self.last_seen = frame_index
        self.missed = 0
        self.labels = deque(maxlen=WINDOW_SIZE)
        self.labels.append(label)
        self.conf = conf
        self.alarmed_at = 0
        self.consecutive_drowning = 0
        self.consecutive_swimming = 0  # Track consecutive normal swimming detections
        self.first_detected = time.time()
        
        # Path tracking
        self.path = deque(maxlen=50)
        center_x = (bbox[0] + bbox[2]) // 2
        center_y = (bbox[1] + bbox[3]) // 2
        self.path.append((center_x, center_y))
    
    def update(self, bbox, label, frame_index, conf):
        """Update track with new detection"""
        self.bbox = bbox
        self.last_seen = frame_index
        self.missed = 0
        
        # Track consecutive swimming detections
        if label == "swimming":
            self.consecutive_swimming += 1
            self.consecutive_drowning = 0
        else:  # drowning
            self.consecutive_swimming = 0
            self.consecutive_drowning += 1
        
        # If normal swimming detected for threshold amount, fast decrease drowning count
        if label == "swimming" and self.consecutive_swimming >= NORMAL_SWIMMING_THRESHOLD:
            # Remove multiple drowning labels from deque to speed up decrease
            if self.drowning_count() > 0:
                # Convert deque to list, replace oldest drowning labels with swimming
                labels_list = list(self.labels)
                replaced = 0
                # Replace drowning labels from the oldest entries (start of list)
                for i in range(len(labels_list)):
                    if labels_list[i] == "drowning" and replaced < FAST_DECREASE_MULTIPLIER:
                        labels_list[i] = "swimming"  # Replace with swimming to speed up decrease
                        replaced += 1
                
                # Rebuild deque with same maxlen and modified labels
                maxlen = self.labels.maxlen
                self.labels = deque(labels_list, maxlen=maxlen)
        
        # Append current label
        self.labels.append(label)
        self.conf = conf
        
        # Update path
        center_x = (bbox[0] + bbox[2]) // 2
        center_y = (bbox[1] + bbox[3]) // 2
        self.path.append((center_x, center_y))
    
    def mark_missed(self):
        """Mark track as missed in current frame"""
        self.missed += 1
        self.consecutive_drowning = max(0, self.consecutive_drowning - 1)
        # Don't reset consecutive_swimming on missed - keep it for next detection
    
    def drowning_count(self):
        """Calculate drowning score out of WINDOW_SIZE (total drowning detections)"""
        if not self.labels:
            return 0
        return sum(1 for l in self.labels if l == "drowning")
    
    def should_alarm(self):
        """Check if this track should trigger an alarm - continuous while >= 200"""
        # Alarm continuously while drowning count is at or above threshold
        return (
            self.drowning_count() >= DROWN_THRESHOLD and
            self.labels[-1] == "drowning"
        )
    
    def get_color_for_drowning_level(self):
        """Get BGR color based on display label"""
        display_label = self.get_display_label()
        
        # Match color to the display label
        if display_label == "swimming":
            # Green: Swimming
            return (0, 255, 0)
        elif display_label == "monitoring":
            # Orange: Monitoring
            return (0, 165, 255)
        else:  # drowning
            # Red: Drowning
            return (0, 0, 255)
    
    def get_display_label(self):
        """Get display label based on current detection and drowning count"""
        if not self.labels:
            return "swimming"
        
        # Get the most recent detection label
        current_label = self.labels[-1]
        drown_count = self.drowning_count()
        
        # If swimming is detected, always show "swimming"
        if current_label == "swimming":
            return "swimming"
        # If drowning is detected, check drowning count
        elif current_label == "drowning":
            if drown_count < 200:
                return "monitoring"
            else:  # drown_count >= 200
                return "drowning"
        else:
            # Fallback (shouldn't happen, but just in case)
            return "swimming"


class AIDetection:
    """AI-based drowning detection with FIXED ID system and path visualization"""
    
    def __init__(self, model_path, confidence_threshold=CONFIDENCE_THRESHOLD, iou_threshold=IOU_MATCH_THRESHOLD, 
                 max_detections=1000, debug=False):
        print(f"Loading YOLO model from: {model_path}")
        
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model file not found: {model_path}")
        
        try:
            self.model = YOLO(model_path)
            self.model.fuse()
            
            # Auto-detect device (GPU if available, else CPU)
            self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
            
            # Move model to device
            if self.device == 'cuda':
                self.model.to(self.device)
                print(f"YOLO model loaded on GPU (CUDA)")
            else:
                print(f"YOLO model loaded on CPU")
            
            # Enable half precision (FP16) for faster inference if GPU available
            self.half_precision = (self.device == 'cuda')
            
            print(f"YOLO model loaded and optimized")
            
            # Optional: Export to ONNX for even faster inference (uncomment to enable)
            # onnx_path = model_path.replace('.pt', '.onnx')
            # if not os.path.exists(onnx_path):
            #     print(f"Exporting model to ONNX format for faster inference...")
            #     self.model.export(format='onnx', imgsz=416, half=self.half_precision)
            #     print(f"ONNX model exported to: {onnx_path}")
            # Then load ONNX: self.model = YOLO(onnx_path)
            
        except Exception as e:
            raise Exception(f"Failed to load YOLO model: {e}")
        
        self.confidence_threshold = confidence_threshold
        self.iou_threshold = iou_threshold
        self.max_detections = max_detections
        self.debug = debug
        
        # Class mapping
        self.class_map = {0: "drowning", 1: "swimming"}
        
        # FIXED ID SYSTEM - Tracking state
        self.tracks = {}
        self.available_ids = set()  # Pool of reusable IDs
        self.next_new_id = 1  # Next ID if pool is empty
        self.frame_index = 0
        
        # Detection parameters
        self.max_missed_frames = MAX_MISSED_FRAMES
        self.window_size = WINDOW_SIZE
        self.drown_threshold = DROWN_THRESHOLD
        self.alarm_repeat_seconds = ALARM_REPEAT_SECONDS
        
        # Performance tracking
        self.last_time = time.time()
        self.fps = 0
        self.process_counter = 0
        
        # Alarm state
        self.alarm_playing = False
        self.alarm_lock = threading.Lock()
        self.drowning_active = False
        
        print(f"AI Detection initialized - Alarm at: {DROWN_THRESHOLD}/{WINDOW_SIZE}")
        print(f"  - Tracking: Dual method (IoU + Centroid Distance)")
        print(f"  - Fast movement detection: ENABLED")
    
    def calculate_iou(self, boxA, boxB):
        """Calculate Intersection over Union between two boxes"""
        xA = max(boxA[0], boxB[0])
        yA = max(boxA[1], boxB[1])
        xB = min(boxA[2], boxB[2])
        yB = min(boxA[3], boxB[3])
        
        interArea = max(0, xB - xA) * max(0, yB - yA)
        if interArea == 0:
            return 0.0
        
        boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
        boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
        
        return interArea / (boxAArea + boxBArea - interArea + 1e-6)
    
    def calculate_centroid_distance(self, boxA, boxB):
        """Calculate centroid distance between two boxes"""
        centerA_x = (boxA[0] + boxA[2]) / 2
        centerA_y = (boxA[1] + boxA[3]) / 2
        centerB_x = (boxB[0] + boxB[2]) / 2
        centerB_y = (boxB[1] + boxB[3]) / 2
        
        dist = ((centerA_x - centerB_x) ** 2 + (centerA_y - centerB_y) ** 2) ** 0.5
        return dist
    
    def _get_next_id(self):
        """Get next ID from available pool or create new one"""
        if self.available_ids:
            return min(self.available_ids)  # Get smallest available ID
        else:
            new_id = self.next_new_id
            self.next_new_id += 1
            return new_id
    
    def _release_id(self, track_id):
        """Release ID back to available pool"""
        self.available_ids.add(track_id)
    
    def detect(self, frame):
        """Run detection on a frame with FIXED ID tracking and color-coded drowning levels"""
        if frame is None:
            return frame, False, []
        
        self.frame_index += 1
        original_frame = frame.copy()
        h, w = frame.shape[:2]
        
        # Process every N frames for optimization
        self.process_counter += 1
        skip_detection = (self.process_counter % PROCESS_EVERY_N_FRAMES != 0)
        
        detections = []
        
        if not skip_detection:
            # Optimized input size for YOLOv8m - smaller = faster
            # 416 is optimal for YOLOv8m (can go down to 320 for even more speed)
            resize_width = YOLO_INPUT_SIZE
            scale = resize_width / w
            resized = cv2.resize(frame, (resize_width, int(h * scale)), interpolation=cv2.INTER_LINEAR)
            
            try:
                # Optimized inference parameters for YOLOv8m
                results = self.model(
                    resized, 
                    imgsz=resize_width,  # Match resize width
                    conf=0.15,  # Lower initial conf, filter later with confidence_threshold
                    iou=0.3, 
                    verbose=False, 
                    half=self.half_precision,  # Use FP16 if GPU available (2x faster)
                    device=self.device,  # Auto-detect GPU/CPU
                    max_det=self.max_detections,  # Limit detections for speed
                    agnostic_nms=False,  # Class-aware NMS
                    retina_masks=False  # Disable retina masks for speed
                )
                
                r = results[0]
                if r.boxes is not None and len(r.boxes) > 0:
                    boxes = r.boxes.cpu().numpy()
                    for box in boxes:
                        conf = float(box.conf[0])
                        if conf < self.confidence_threshold:
                            continue
                        
                        cls_idx = int(box.cls[0])
                        label = self.class_map.get(cls_idx, str(cls_idx))
                        
                        xyxy = box.xyxy[0]
                        x1, y1, x2, y2 = map(int, xyxy / scale)
                        detections.append(((x1, y1, x2, y2), label, conf))
            
            except Exception as e:
                if self.debug:
                    print(f"[ERROR] Detection failed: {e}")
        
        # Update FPS
        now = time.time()
        if now != self.last_time:
            self.fps = 1.0 / (now - self.last_time)
        self.last_time = now
        
        # Update tracks with FIXED IDs
        if detections:
            self._update_tracks(detections)
        
        # Clean up old tracks
        self._cleanup_tracks()
        
        # Draw annotations with color-coded drowning levels
        drowning_detected = False
        annotated_frame = original_frame
        
        detection_list = []
        # scale-based rendering to keep text/lines consistent across resolutions
        ref_dim = 720.0
        scale_factor = max(0.4, min(h, w) / ref_dim)
        base_font_scale = 0.6 * scale_factor
        base_thickness = max(1, int(round(2 * scale_factor)))
        box_thickness = max(2, int(round(3 * scale_factor)))
        text_padding = max(6, int(round(8 * scale_factor)))
        alert_font_scale = max(0.8, 1.2 * scale_factor)

        for tid, track in list(self.tracks.items()):
            x1, y1, x2, y2 = track.bbox
            drown_count = track.drowning_count()
            
            # Get color based on drowning level
            color = track.get_color_for_drowning_level()
            
            # Draw bounding box
            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, box_thickness, cv2.LINE_AA)
            
            # Label text hidden - only show ID and confidence if needed
            # display_label = track.get_display_label()
            # label_text = f"ID {tid} {display_label} {track.conf:.2f}"
            
            # Optional: Show only ID number (uncomment to enable)
            # label_text = f"ID {tid}"
            # (text_w, text_h), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, base_font_scale, base_thickness)
            # bg_x1 = x1
            # bg_y1 = max(0, y1 - text_h - text_padding)
            # bg_x2 = x1 + text_w + (text_padding * 2)
            # bg_y2 = y1
            # bg_color = color
            # cv2.rectangle(annotated_frame, (bg_x1, bg_y1), (bg_x2, bg_y2), bg_color, -1)
            # text_org = (x1 + text_padding, y1 - int(text_padding / 2))
            # cv2.putText(annotated_frame, label_text, text_org,
            #            cv2.FONT_HERSHEY_SIMPLEX, base_font_scale, (255, 255, 255), base_thickness, cv2.LINE_AA)
            
            # Draw drowning score at bottom: "D: 50/250"
            # The following lines are commented out to hide the drowning count display on the video feed.
            # score_text = f"D: {drown_count}/{self.window_size}"
            # (s_w, s_h), _ = cv2.getTextSize(score_text, cv2.FONT_HERSHEY_SIMPLEX, base_font_scale, base_thickness)
            # score_org = (x1 + text_padding, y2 + s_h + text_padding)
            # cv2.putText(annotated_frame, score_text, score_org,
            #            cv2.FONT_HERSHEY_SIMPLEX, base_font_scale, (255, 255, 0), base_thickness, cv2.LINE_AA)
            
            
            # Check alarm at 200 (DROWN_THRESHOLD) - only trigger when drowning_count reaches 200, not before
            if drown_count >= DROWN_THRESHOLD and track.labels[-1] == "drowning":
                drowning_detected = True
                self.drowning_active = True
                
                # Draw alert with RED
                cv2.putText(annotated_frame, "!!! DROWNING ALERT !!!", (10, 50),
                           cv2.FONT_HERSHEY_DUPLEX, alert_font_scale, (0, 0, 255), max(2, int(round(3 * scale_factor))), cv2.LINE_AA)
                cv2.rectangle(annotated_frame, (5, 5), (w-5, h-5), (0, 0, 255), max(2, int(round(4 * scale_factor))))
                
                if self.debug:
                    print(f"[ALARM] Track {tid} - Drowning: {drown_count}/{self.window_size}")
            
            detection_list.append({
                'track_id': tid,
                'bbox': track.bbox,
                'label': track.get_display_label(),
                'confidence': track.conf,
                'drowning_count': drown_count,
                'window_size': self.window_size,
                'path': list(track.path),
                'color': color,
                'drowning_level': track.get_display_label()
            })
        
        # Update drowning state - CONTINUOUS ALARM while ANY track >= 200
        any_above_threshold = any(
            track.drowning_count() >= DROWN_THRESHOLD 
            for track in self.tracks.values()
        )
        
        if any_above_threshold:
            self.drowning_active = True
            drowning_detected = True
        else:
            self.drowning_active = False
            drowning_detected = False
        
        return annotated_frame, drowning_detected, detection_list
    
    def _nms_detections(self, detections, nms_threshold=0.5):
        """Apply Non-Maximum Suppression to remove duplicate detections"""
        if len(detections) <= 1:
            return detections
        
        # Sort by confidence (highest first)
        sorted_dets = sorted(detections, key=lambda x: x[2], reverse=True)
        keep = []
        
        while sorted_dets:
            # Take the highest confidence detection
            current = sorted_dets.pop(0)
            keep.append(current)
            
            # Remove overlapping detections
            remaining = []
            for det in sorted_dets:
                iou = self.calculate_iou(current[0], det[0])
                if iou < nms_threshold:
                    remaining.append(det)
            sorted_dets = remaining
        
        return keep
    
    def _calculate_size_ratio(self, box1, box2):
        """Calculate size similarity ratio between two boxes"""
        area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
        area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
        if area1 == 0 or area2 == 0:
            return 0.0
        ratio = min(area1, area2) / max(area1, area2)
        return ratio
    
    def _update_tracks(self, detections):
        """Improved track matching with NMS and better matching strategy"""
        # Apply NMS to remove duplicate detections first
        detections = self._nms_detections(detections, nms_threshold=0.5)
        
        assigned_tracks = set()
        assigned_dets = set()
        
        if self.tracks and detections:
            # Build a list of all possible matches with scores
            matches = []
            
            for j, (dbox, dlabel, dconf) in enumerate(detections):
                for tid, track in self.tracks.items():
                    if tid in assigned_tracks:
                        continue
                    
                    # Method 1: IoU matching (for overlapping boxes) - higher priority
                    iou = self.calculate_iou(track.bbox, dbox)
                    iou_score = 0
                    if iou > self.iou_threshold:
                        # Prefer higher IoU, require minimum 0.3
                        iou_score = iou * 2.0  # Weight IoU more heavily
                    
                    # Method 2: Centroid distance (for fast movements/diving)
                    dist = self.calculate_centroid_distance(track.bbox, dbox)
                    track_w = track.bbox[2] - track.bbox[0]
                    track_h = track.bbox[3] - track.bbox[1]
                    det_w = dbox[2] - dbox[0]
                    det_h = dbox[3] - dbox[1]
                    
                    # Use average box size for distance threshold
                    avg_w = (track_w + det_w) / 2
                    avg_h = (track_h + det_h) / 2
                    max_dist = (avg_w ** 2 + avg_h ** 2) ** 0.5
                    
                    dist_score = 0
                    if dist < max_dist * 0.6:  # Tighter threshold (60% instead of 80%)
                        dist_score = (1.0 - (dist / (max_dist * 0.6))) * 1.0
                    
                    # Method 3: Size similarity check (prevent matching very different sizes)
                    size_ratio = self._calculate_size_ratio(track.bbox, dbox)
                    size_penalty = 0
                    if size_ratio < 0.3:  # If size differs by more than 70%, penalize
                        size_penalty = -1.0
                    
                    # Combined score (IoU preferred, then distance, with size check)
                    total_score = iou_score + dist_score + size_penalty
                    
                    if total_score > 0:
                        matches.append((total_score, tid, j, iou_score > 0))
            
            # Sort matches by score (highest first), prefer IoU matches
            matches.sort(key=lambda x: (x[3], x[0]), reverse=True)
            
            # Greedy assignment: assign best matches first
            for score, tid, j, is_iou in matches:
                if tid not in assigned_tracks and j not in assigned_dets:
                    dbox, dlabel, dconf = detections[j]
                    self.tracks[tid].update(dbox, dlabel, self.frame_index, dconf)
                    assigned_tracks.add(tid)
                    assigned_dets.add(j)
        
        # Create new tracks with FIXED IDs from pool
        for idx, (dbox, dlabel, dconf) in enumerate(detections):
            if idx not in assigned_dets:
                new_id = self._get_next_id()
                self.available_ids.discard(new_id)  # Remove from available pool
                self.tracks[new_id] = Track(
                    new_id, dbox, dlabel, self.frame_index, dconf
                )
                if self.debug:
                    print(f"[TRACK] Created new track ID {new_id}")
    
    def _cleanup_tracks(self):
        """Fast track cleanup with ID recycling"""
        to_delete = []
        for tid, track in self.tracks.items():
            if track.last_seen != self.frame_index:
                track.mark_missed()
            if track.missed > self.max_missed_frames:
                to_delete.append(tid)
        
        for tid in to_delete:
            self._release_id(tid)  # Return ID to pool
            del self.tracks[tid]
            if self.debug:
                print(f"[TRACK] Removed track ID {tid} - ID returned to pool")
    
    def set_alarm_state(self, playing):
        """Set the alarm playing state"""
        with self.alarm_lock:
            self.alarm_playing = playing
    
    def get_detection_status(self):
        """Get current detection status"""
        return {
            'drowning_detected': self.drowning_active,
            'objects': [
                {
                    'track_id': tid,
                    'label': track.get_display_label(),
                    'confidence': track.conf,
                    'drowning_count': track.drowning_count(),
                    'window_size': self.window_size,
                    'drowning_level': track.get_display_label()
                }
                for tid, track in list(self.tracks.items())
            ],
            'last_detection_time': time.time(),
            'alarm_playing': self.alarm_playing,
            'active_tracks': len(self.tracks),
            'fps': self.fps
        }
    
    def reset_tracks(self):
        """Reset all tracks and ID pool"""
        self.tracks = {}
        self.available_ids = set()
        self.next_new_id = 1
        self.frame_index = 0
        self.alarm_playing = False
        self.drowning_active = False
        print("All tracks reset - ID pool cleared")
    
    def cleanup(self):
        """Cleanup resources"""
        self.tracks = {}
        print("AI Detection cleanup complete")


# Initialize Flask
app = Flask(__name__)
app.config.from_object(Config)
csrf = CSRFProtect(app)

# Global variables
firebase_enabled = False
ai_detection = None
camera_manager = None
alarm_sound = None
_services_initialized = False

def initialize_services():
    """Initialize all services only once"""
    global firebase_enabled, ai_detection, camera_manager, alarm_sound, _services_initialized
    
    if _services_initialized:
        return
        
    print("\n" + "="*60)
    print("INITIALIZING POOL WATCH SERVICES")
    print("="*60)
    
    # Initialize Firebase
    try:
        cred = credentials.Certificate(app.config['FIREBASE_CREDENTIALS'])
        firebase_admin.initialize_app(cred)
        firebase_enabled = True
        print("✓ Firebase initialized")
        app.db = firestore.client()
    except Exception as e:
        print(f"✗ Firebase error: {e}")
        firebase_enabled = False
        app.db = None

    # Initialize Camera Manager
    try:
        camera_manager = CameraManager()
        print("✓ Camera Manager initialized")
    except Exception as e:
        print(f"✗ Camera Manager error: {e}")
        camera_manager = None

    # Initialize AI Detection
    try:
        ai_detection = AIDetection(
            app.config['AI_MODEL_PATH'], 
            confidence_threshold=CONFIDENCE_THRESHOLD,
            debug=False
        )
        print("✓ AI Detection initialized")
        print(f"  - Alarm triggers at: {DROWN_THRESHOLD}/{WINDOW_SIZE}")
        print(f"  - Fixed ID system: Active")
        print(f"  - Color coding (NEW):")
        print(f"    • Green (0-100): Normal Swimming")
        print(f"    • Orange (0-199): Monitoring")
        print(f"    • Red (200-250): Drowning - ALARM")
    except Exception as e:
        print(f"✗ AI Detection error: {e}")
        ai_detection = None

    # Initialize alarm
    try:
        pygame.mixer.init()
        alarm_sound = pygame.mixer.Sound(app.config['ALARM_SOUND_PATH'])
        print("✓ Alarm sound initialized")
    except Exception as e:
        print(f"⚠️  Alarm sound warning: {e}")
        alarm_sound = None

    _services_initialized = True
    print("="*60)
    print("READY - FIXED ID SYSTEM | AUTO ALARM AT 200/250")
    print("="*60 + "\n")

# Initialize services
initialize_services()

app.camera_manager = camera_manager

# Initialize decorators and routes
login_decorator = login_required(firebase_enabled, app.db)
admin_decorator = admin_required(firebase_enabled, app.db)

init_auth_routes(app, firebase_enabled, app.db)
init_camera_routes(app, firebase_enabled, app.db, camera_manager, login_decorator)
init_user_routes(app, firebase_enabled, app.db, login_decorator, admin_decorator)
init_events_routes(app, firebase_enabled, app.db, login_decorator, camera_manager)
init_account_routes(app, firebase_enabled, app.db, login_decorator)
init_detection_routes(app, firebase_enabled, ai_detection, camera_manager, alarm_sound, login_decorator)

app.jinja_env.filters['datetimeformat'] = datetimeformat

_first_request_handled = False

@app.before_request
def before_request():
    global _first_request_handled
    if not _first_request_handled:
        _first_request_handled = True
    if session.get('logged_in'):
        session.permanent = True
    app.session = session

@app.after_request
def after_request(response):
    if session.get('logged_in'):
        session.modified = True
    return response

def shutdown_handler(signum=None, frame=None):
    """Proper shutdown handler"""
    print("\nShutting down...")
    global camera_manager, alarm_sound, ai_detection
    
    if camera_manager:
        camera_manager.stop_all()
    if alarm_sound and ai_detection and ai_detection.alarm_playing:
        alarm_sound.stop()
    if ai_detection:
        ai_detection.cleanup()
    
    print("Shutdown complete\n")

# Register shutdown handlers
atexit.register(shutdown_handler)
signal.signal(signal.SIGINT, shutdown_handler)
signal.signal(signal.SIGTERM, shutdown_handler)

if __name__ == '__main__':
    try:
        print("\nPOOL WATCH - FIXED ID SYSTEM + COLOR-CODED DROWNING LEVELS")
        print(f"\nSettings:")
        print(f"   Alarm Threshold: {DROWN_THRESHOLD}/{WINDOW_SIZE}")
        print(f"   Fixed ID System: Maintains consistent IDs")
        print(f"   Color Coding:")
        print(f"      • Green (0-100): Normal Swimming")
        print(f"      • Orange (0-199): Monitoring")
        print(f"      • Red (200-250): Drowning")
        print(f"   Score Format: D: 0/250")
        print(f"   Auto Alarm: ON (triggers at 200, stops below 200)")
        print("\n" + "="*60 + "\n")
        
        app.run(host='0.0.0.0', port=5000, debug=True, threaded=True, use_reloader=False)
    except KeyboardInterrupt:
        print("\nInterrupted...")
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
    finally:
        shutdown_handler()