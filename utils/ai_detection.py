import time
import cv2
import numpy as np
from collections import deque
from ultralytics import YOLO
import threading


class Track:
    """Represents a tracked object with temporal label history"""
    
    def __init__(self, track_id, bbox, label, frame_index, conf):
        self.id = track_id
        self.bbox = bbox  # (x1, y1, x2, y2)
        self.last_seen = frame_index
        self.missed = 0
        self.labels = deque(maxlen=200)  # Window size for label history
        self.labels.append(label)
        self.conf = conf
        self.alarmed_at = 0
    
    def update(self, bbox, label, frame_index, conf):
        """Update track with new detection"""
        self.bbox = bbox
        self.last_seen = frame_index
        self.missed = 0
        self.labels.append(label)
        self.conf = conf
    
    def mark_missed(self):
        """Mark track as missed in current frame"""
        self.missed += 1
    
    def drowning_count(self):
        """Calculate adjusted drowning score"""
        drowns = sum(1 for l in self.labels if l == "drowning")
        swims = sum(1 for l in self.labels if l == "swimming")
        # Adjusted score: drowning detections minus half the swimming detections
        adjusted = drowns - swims // 2
        return max(0, adjusted)
    
    def should_alarm(self, drown_threshold=100, alarm_repeat_seconds=10):
        """Check if this track should trigger an alarm"""
        now = time.time()
        if (
            self.drowning_count() >= drown_threshold
            and self.labels[-1] == "drowning"
            and (now - self.alarmed_at > alarm_repeat_seconds)
        ):
            self.alarmed_at = now
            return True
        return False


class AIDetection:
    """AI-based drowning detection with object tracking"""
    
    def __init__(self, model_path, confidence_threshold=0.75, iou_threshold=0.3, 
                 max_detections=1000, debug=True):
        """
        Initialize AI Detection
        
        Args:
            model_path: Path to YOLO model weights
            confidence_threshold: Minimum confidence for detections
            iou_threshold: IOU threshold for track matching
            max_detections: Maximum number of detections to process
            debug: Enable debug output
        """
        print(f"Loading YOLO model from: {model_path}")
        self.model = YOLO(model_path)
        self.confidence_threshold = confidence_threshold
        self.iou_threshold = iou_threshold
        self.max_detections = max_detections
        self.debug = debug
        
        # Class mapping
        self.class_map = {0: "drowning", 1: "swimming"}
        
        # Tracking state
        self.tracks = {}
        self.next_track_id = 0
        self.frame_index = 0
        
        # Detection parameters
        self.max_missed_frames = 30
        self.window_size = 200
        self.drown_threshold = 100
        self.alarm_repeat_seconds = 10
        
        # Performance tracking
        self.last_time = time.time()
        self.fps = 0
        
        # Alarm state
        self.alarm_playing = False
        self.alarm_lock = threading.Lock()
        
        print("AI Detection initialized successfully")
    
    def calculate_iou(self, boxA, boxB):
        """Calculate Intersection over Union between two boxes"""
        xA = max(boxA[0], boxB[0])
        yA = max(boxA[1], boxB[1])
        xB = min(boxA[2], boxB[2])
        yB = min(boxA[3], boxB[3])
        
        interW = max(0, xB - xA)
        interH = max(0, yB - yA)
        interArea = interW * interH
        
        if interArea == 0:
            return 0.0
        
        boxAArea = max(0, boxA[2] - boxA[0]) * max(0, boxA[3] - boxA[1])
        boxBArea = max(0, boxB[2] - boxB[0]) * max(0, boxB[3] - boxB[1])
        
        iou = interArea / float(boxAArea + boxBArea - interArea + 1e-6)
        return iou
    
    def detect(self, frame):
        """
        Run detection on a frame with tracking
        
        Args:
            frame: Input frame (BGR format)
            
        Returns:
            annotated_frame: Frame with detection boxes
            drowning_detected: Boolean indicating if drowning was detected
            detections: List of detection dictionaries
        """
        if frame is None:
            return frame, False, []
        
        self.frame_index += 1
        original_frame = frame.copy()
        h, w = frame.shape[:2]
        
        # Resize for YOLO inference (keep original for display)
        resize_width = 640
        if w > resize_width:
            scale = resize_width / w
            resized = cv2.resize(frame, (resize_width, int(h * scale)))
        else:
            scale = 1.0
            resized = frame.copy()
        
        # Run YOLO detection
        results = self.model(resized, imgsz=resize_width, conf=0.25, verbose=False)
        
        # Parse detections
        detections = []
        r = results[0]
        if r.boxes is not None and len(r.boxes) > 0:
            for box in r.boxes:
                conf = float(box.conf.cpu().numpy())
                cls_idx = int(box.cls.cpu().numpy())
                
                if conf < self.confidence_threshold:
                    continue
                
                label = self.class_map.get(cls_idx, str(cls_idx))
                xyxy = box.xyxy[0].cpu().numpy()
                
                # Scale back to original frame coordinates
                x1, y1, x2, y2 = map(int, xyxy[:4] / scale)
                detections.append(((x1, y1, x2, y2), label, conf))
        
        # Update FPS
        now = time.time()
        if now != self.last_time:
            self.fps = 1.0 / (now - self.last_time)
        self.last_time = now
        
        # Track matching using IOU
        assigned_tracks = set()
        assigned_dets = set()
        
        if detections and self.tracks:
            track_ids = list(self.tracks.keys())
            iou_matrix = np.zeros((len(track_ids), len(detections)), dtype=float)
            
            # Build IOU matrix
            for i, tid in enumerate(track_ids):
                for j, (dbox, _, _) in enumerate(detections):
                    iou_matrix[i, j] = self.calculate_iou(self.tracks[tid].bbox, dbox)
            
            # Greedy matching
            while True:
                i, j = np.unravel_index(np.argmax(iou_matrix), iou_matrix.shape)
                if iou_matrix[i, j] < self.iou_threshold:
                    break
                
                tid = track_ids[i]
                if tid in assigned_tracks or j in assigned_dets:
                    iou_matrix[i, j] = -1
                    continue
                
                dbox, dlabel, dconf = detections[j]
                self.tracks[tid].update(dbox, dlabel, self.frame_index, dconf)
                assigned_tracks.add(tid)
                assigned_dets.add(j)
                iou_matrix[i, :] = -1
                iou_matrix[:, j] = -1
        
        # Create new tracks for unassigned detections
        for idx, (dbox, dlabel, dconf) in enumerate(detections):
            if idx not in assigned_dets:
                self.tracks[self.next_track_id] = Track(
                    self.next_track_id, dbox, dlabel, self.frame_index, dconf
                )
                self.next_track_id += 1
        
        # Update missed tracks and remove old ones
        to_delete = []
        for tid, track in self.tracks.items():
            if track.last_seen != self.frame_index:
                track.mark_missed()
            if track.missed > self.max_missed_frames:
                to_delete.append(tid)
        
        for tid in to_delete:
            del self.tracks[tid]
        
        # Check for drowning and draw annotations
        drowning_detected = False
        annotated_frame = original_frame.copy()
        
        # Draw FPS
        cv2.putText(annotated_frame, f"FPS: {self.fps:.2f}", (10, 25),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
        
        detection_list = []
        for tid, track in self.tracks.items():
            x1, y1, x2, y2 = track.bbox
            
            # Color coding: red for drowning, green for swimming
            color = (0, 0, 255) if track.labels[-1] == "drowning" else (0, 255, 0)
            
            # Draw bounding box
            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)
            
            # Draw label with ID and confidence
            label_text = f"ID {tid} {track.labels[-1]} {track.conf:.2f}"
            cv2.putText(annotated_frame, label_text, (x1, y1 - 8),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            
            # Draw drowning count
            count_text = f"D:{track.drowning_count()}/{self.window_size}"
            cv2.putText(annotated_frame, count_text, (x1, y2 + 18),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 2)
            
            # Check if should alarm
            if track.should_alarm(self.drown_threshold, self.alarm_repeat_seconds):
                drowning_detected = True
                cv2.putText(annotated_frame, "!!! DROWNING ALERT !!!", (10, 60),
                           cv2.FONT_HERSHEY_DUPLEX, 0.9, (0, 0, 255), 3)
                
                if self.debug:
                    print(f"[ALARM] Track {tid} triggered at {time.strftime('%H:%M:%S')}")
            
            # Add to detection list
            detection_list.append({
                'track_id': tid,
                'bbox': track.bbox,
                'label': track.labels[-1],
                'confidence': track.conf,
                'drowning_count': track.drowning_count(),
                'window_size': len(track.labels)
            })
        
        return annotated_frame, drowning_detected, detection_list
    
    def set_alarm_state(self, playing):
        """Set the alarm playing state"""
        with self.alarm_lock:
            self.alarm_playing = playing
    
    def get_detection_status(self):
        """Get current detection status"""
        drowning_detected = any(
            track.drowning_count() >= self.drown_threshold
            for track in self.tracks.values()
        )
        
        return {
            'drowning_detected': drowning_detected,
            'objects': [
                {
                    'track_id': tid,
                    'label': track.labels[-1],
                    'confidence': track.conf,
                    'drowning_count': track.drowning_count()
                }
                for tid, track in self.tracks.items()
            ],
            'last_detection_time': time.time(),
            'alarm_playing': self.alarm_playing,
            'active_tracks': len(self.tracks),
            'fps': self.fps
        }
    
    def reset_tracks(self):
        """Reset all tracks"""
        self.tracks = {}
        self.next_track_id = 0
        self.frame_index = 0
        print("All tracks reset")
    
    def cleanup(self):
        """Cleanup resources"""
        self.tracks = {}
        print("AI Detection cleanup complete")