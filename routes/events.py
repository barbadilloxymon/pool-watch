from flask import render_template, request, jsonify, session
import firebase_admin
from firebase_admin import firestore
from datetime import datetime, timedelta, timezone
import uuid
import time
import cv2
import base64
import os
from io import BytesIO

PH_TZ = timezone(timedelta(hours=8))


def normalize_to_ph_time(value):
    """Normalize various timestamp formats to Philippine time (UTC+8)."""
    if value is None:
        return datetime.now(PH_TZ)
    
    # Firestore Timestamp objects expose to_datetime()
    if hasattr(value, 'to_datetime'):
        value = value.to_datetime()
    
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=PH_TZ)
        return value.astimezone(PH_TZ)
    
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(PH_TZ)
        except Exception:
            return datetime.now(PH_TZ)
    
    return datetime.now(PH_TZ)


def init_events_routes(app, firebase_enabled, db, login_decorator, camera_manager):
    """Initialize events-related routes with camera_manager dependency"""
    
    @app.route('/events')
    @login_decorator
    def events():
        """Events page showing detected drowning events with auto-capture"""
        try:
            account_id = session.get('account_id')
            events = []
            cameras = []
            
            if firebase_enabled and db and account_id:
                # Get cameras for filter dropdown
                cameras_ref = db.collection('accounts').document(account_id).collection('cameras').stream()
                cameras = [{'id': cam.id, **cam.to_dict()} for cam in cameras_ref]
                
                # Query events from account's drowning_events subcollection
                events_ref = db.collection('accounts').document(account_id).collection('drowning_events').order_by('timestamp', direction=firestore.Query.DESCENDING).limit(50)
                events_docs = events_ref.stream()
                
                for doc in events_docs:
                    event_data = doc.to_dict()
                    event_data['id'] = doc.id
                    
                    # Convert Firestore timestamp to Philippine time
                    event_data['timestamp'] = normalize_to_ph_time(event_data.get('timestamp'))
                    
                    events.append(event_data)
            
            return render_template('events.html', events=events, cameras=cameras)
        
        except Exception as e:
            print(f"Error loading events: {e}")
            return render_template('events.html', events=[], cameras=[])

    @app.route('/capture_snapshot')
    @login_decorator
    def capture_snapshot():
        """Capture a single snapshot frame from camera"""
        try:
            camera_id = request.args.get('camera_id')
            if not camera_id:
                return jsonify({'success': False, 'error': 'Camera ID required'}), 400
            
            if not camera_manager:
                return jsonify({'success': False, 'error': 'Camera manager not available'}), 500
            
            # Get frame from camera
            frame = camera_manager.get_camera_frame(camera_id)
            if frame is None:
                return jsonify({'success': False, 'error': 'Could not capture frame'}), 500
            
            # Encode frame as JPEG
            ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if not ret:
                return jsonify({'success': False, 'error': 'Could not encode frame'}), 500
            
            # Convert to base64 for direct embedding
            image_base64 = base64.b64encode(buffer).decode('utf-8')
            image_data_url = f"data:image/jpeg;base64,{image_base64}"
            
            return jsonify({
                'success': True,
                'snapshot_url': image_data_url,
                'timestamp': datetime.now(PH_TZ).isoformat()
            })
            
        except Exception as e:
            print(f"Error capturing snapshot: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/save_snapshot', methods=['POST'])
    @login_decorator
    def save_snapshot():
        """Save auto-captured snapshot to Firestore with correct camera details"""
        try:
            data = request.json
            account_id = session.get('account_id')
            user_id = session.get('user_id')
            camera_id = data.get('camera_id')
            
            if not account_id or not user_id:
                return jsonify({'success': False, 'error': 'Not authenticated'}), 401
            
            if not camera_id:
                return jsonify({'success': False, 'error': 'Camera ID required'}), 400
            
            # GET CORRECT CAMERA DETAILS FROM FIRESTORE
            camera_name = 'Unknown Camera'
            location = 'Pool Area'
            
            if firebase_enabled and db and account_id:
                try:
                    camera_ref = db.collection('accounts').document(account_id).collection('cameras').document(camera_id)
                    camera_doc = camera_ref.get()
                    
                    if camera_doc.exists:
                        camera_data = camera_doc.to_dict()
                        camera_name = camera_data.get('name', 'Unknown Camera')
                        location = camera_data.get('location', 'Pool Area')
                        print(f"[EVENT] Using camera data: {camera_name} - {location}")
                    else:
                        print(f"[EVENT] Camera {camera_id} not found in database")
                except Exception as e:
                    print(f"[EVENT] Error fetching camera data: {e}")
            
            # Generate unique event ID
            event_id = f"snapshot_{uuid.uuid4().hex[:12]}"
            current_time = datetime.now(PH_TZ)
            
            # Get confidence - convert to 0-255 range
            confidence = data.get('confidence', 0)
            try:
                confidence = int(confidence)
                if confidence <= 1:
                    confidence = int(confidence * 255)
            except (ValueError, TypeError):
                confidence = 150
            
            # Get ACTUAL drowning level from detection data
            drowning_level = data.get('drowning_count', 0)
            
            # Handle snapshot URL
            snapshot_url = data.get('snapshot_url', '')
            
            # Handle timestamp
            timestamp_str = data.get('timestamp')
            if timestamp_str:
                event_timestamp = normalize_to_ph_time(timestamp_str)
            else:
                event_timestamp = current_time
            
            # Prepare event data
            event_data = {
                'id': event_id,
                'camera_id': camera_id,
                'camera_name': camera_name,
                'location': location,
                'confidence': confidence,
                'snapshot_url': snapshot_url,
                'drowning_count': drowning_level,
                'timestamp': event_timestamp,
                'createdAt': current_time,
                'createdBy': user_id,
                'updatedAt': current_time,
                'handled': False,
                'confirmed': False,
                'drowning_detected': data.get('drowning_detected', True),
                'label': data.get('label', 'drowning')
            }
            
            # Save to Firestore
            event_ref = db.collection('accounts').document(account_id).collection('drowning_events').document(event_id)
            event_ref.set(event_data)
            
            print(f"[AUTO-CAPTURE] Saved snapshot {event_id} for camera {camera_name} at {location}")
            
            return jsonify({
                'success': True,
                'event_id': event_id,
                'event': {
                    'id': event_id,
                    'camera_id': event_data['camera_id'],
                    'camera_name': event_data['camera_name'],
                    'location': event_data['location'],
                    'confidence': event_data['confidence'],
                    'snapshot_url': event_data['snapshot_url'],
                    'drowning_count': event_data['drowning_count'],
                    'timestamp': event_timestamp.isoformat()
                }
            })
            
        except Exception as e:
            print(f"Error saving snapshot: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/delete_snapshot/<event_id>', methods=['DELETE'])
    @login_decorator
    def delete_snapshot(event_id):
        """Delete a single event from Firestore"""
        try:
            account_id = session.get('account_id')
            
            if not account_id:
                return jsonify({'success': False, 'error': 'Not authenticated'}), 401
            
            # Delete the event
            event_ref = db.collection('accounts').document(account_id).collection('drowning_events').document(event_id)
            event_ref.delete()
            
            print(f"Deleted event {event_id} for account {account_id}")
            
            return jsonify({
                'success': True,
                'message': 'Event deleted successfully'
            })
            
        except Exception as e:
            print(f"Error deleting event: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/clear_all_snapshots', methods=['POST'])
    @login_decorator
    def clear_all_snapshots():
        """Clear all events from Firestore"""
        try:
            account_id = session.get('account_id')
            
            if not account_id:
                return jsonify({'success': False, 'error': 'Not authenticated'}), 401
            
            # Get all events from the account's drowning_events collection
            events_ref = db.collection('accounts').document(account_id).collection('drowning_events')
            events_docs = events_ref.stream()
            
            deleted_count = 0
            for doc in events_docs:
                doc.reference.delete()
                deleted_count += 1
            
            print(f"Cleared {deleted_count} events for account {account_id}")
            
            return jsonify({
                'success': True, 
                'message': f'Successfully deleted {deleted_count} events',
                'deleted_count': deleted_count
            })
            
        except Exception as e:
            print(f"Error clearing all snapshots: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

def save_detection_event(db, detection_data, snapshot_url, camera_data, account_id, user_id):
    """Save a detection event to account's drowning_events subcollection"""
    try:
        if not db or not account_id:
            print("Firestore or account not available, skipping event save")
            return None
        
        current_time = datetime.now(PH_TZ)
        event_id = f"event-{uuid.uuid4().hex[:12]}"
        
        # Get confidence
        confidence = float(detection_data.get('confidence', 0.0))
        if confidence <= 1.0:
            confidence = int(confidence * 255)
        else:
            confidence = int(confidence)
        
        # Get ACTUAL drowning level from detection data
        drowning_level = detection_data.get('drowning_count', 0)
        
        event_data = {
            'id': event_id,
            'camera_id': camera_data.get('id', ''),
            'camera_name': camera_data.get('name', 'Unknown Camera'),
            'location': camera_data.get('location', 'Pool Area'),
            'timestamp': current_time,
            'confidence': confidence,
            'snapshot_url': snapshot_url or '/static/img/no-signal.png',
            'drowning_count': drowning_level,
            'confirmed': False,
            'handled': False,
            'createdBy': user_id,
            'createdAt': current_time,
            'updatedAt': current_time,
            'drowning_detected': detection_data.get('drowning_detected', True),
            'label': detection_data.get('label', 'drowning'),
            'active_tracks': detection_data.get('active_tracks', 0)
        }
        
        event_ref = db.collection('accounts').document(account_id).collection('drowning_events').document(event_id)
        event_ref.set(event_data)
        
        print(f"Detection event saved: {event_id} for camera {camera_data.get('name')} at {camera_data.get('location')}")
        return event_id
        
    except Exception as e:
        print(f"Error saving detection event: {e}")
        return None