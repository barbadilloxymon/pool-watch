from flask import jsonify, Response, render_template, session, request
import time
import cv2
from utils.helpers import get_cameras
import threading

# Import save_detection_event from events module
from routes.events import save_detection_event


def init_detection_routes(app, firebase_enabled, ai_detection, camera_manager, alarm_sound, login_decorator):
    
    # Thread-safe alarm control
    alarm_lock = threading.Lock()
    last_saved_event_time = {}  # Track last saved event per camera to avoid duplicates
    
    @app.route('/detection_feed')
    @login_decorator
    def detection_feed():
        """Stream video with AI detection overlay and tracking"""
        camera_id = request.args.get('camera_id')
        
        if not camera_id:
            # Default to first camera if none specified
            account_id = session.get('account_id')
            cameras = get_cameras(firebase_enabled, app.db, account_id)
            if cameras:
                camera_id = cameras[0]['id']
            else:
                return "No cameras available", 404

        def gen_frames_with_detection():
            """Generate frames with AI detection, tracking, and CONTINUOUS alarm handling"""
            
            # Initialize last event time for this camera
            if camera_id not in last_saved_event_time:
                last_saved_event_time[camera_id] = 0
            
            try:
                while True:
                    frame = camera_manager.get_camera_frame(camera_id)
                    
                    if frame is not None:
                        try:
                            # Run AI detection with tracking
                            detection_data = None
                            drowning_detected = False
                            
                            if ai_detection is not None:
                                annotated_frame, drowning_detected, detections = ai_detection.detect(frame)
                                frame = annotated_frame
                                
                                detection_data = {
                                    'drowning_detected': drowning_detected,
                                    'objects': detections,
                                    'label': 'potential_drowning' if drowning_detected else 'normal',
                                    'confidence': max(
                                        [det.get('confidence', 0) for det in detections]
                                    ) if detections else 0.0,
                                    'active_tracks': len(detections)
                                }
                                
                                # CONTINUOUS ALARM LOGIC - No cooldown needed
                                # Alarm plays while ANY track >= 100, stops when ALL tracks < 100
                                current_time = time.time()
                                if alarm_sound is not None:
                                    with alarm_lock:
                                        if drowning_detected and not ai_detection.alarm_playing:
                                            # START alarm - any track >= 100
                                            try:
                                                alarm_sound.play(-1)  # Loop continuously
                                                ai_detection.set_alarm_state(True)
                                                print(f"[ALARM] Started - Drowning detected at {time.strftime('%H:%M:%S')}")
                                                
                                                # Save detection event to Firestore (avoid duplicates)
                                                if (firebase_enabled and app.db and 
                                                    current_time - last_saved_event_time[camera_id] > 30):  # 30 second cooldown
                                                    
                                                    account_id = session.get('account_id')
                                                    user_id = session.get('user_id')
                                                    cameras = get_cameras(firebase_enabled, app.db, account_id)
                                                    current_camera = next(
                                                        (cam for cam in cameras if cam['id'] == camera_id), 
                                                        None
                                                    )
                                                    
                                                    if current_camera and account_id and user_id:
                                                        snapshot_url = f"/detection_feed?camera_id={camera_id}&t={int(current_time)}"
                                                        event_id = save_detection_event(
                                                            app.db, detection_data, snapshot_url, 
                                                            current_camera, account_id, user_id
                                                        )
                                                        if event_id:
                                                            last_saved_event_time[camera_id] = current_time
                                                            print(f"[EVENT SAVED] Drowning event {event_id} saved to Firestore")
                                            except Exception as e:
                                                print(f"Error playing alarm or saving event: {e}")
                                        
                                        elif not drowning_detected and ai_detection.alarm_playing:
                                            # STOP alarm - all tracks < 100
                                            try:
                                                alarm_sound.stop()
                                                ai_detection.set_alarm_state(False)
                                                print(f"[ALARM] Stopped - Threshold below 100 at {time.strftime('%H:%M:%S')}")
                                            except Exception as e:
                                                print(f"Error stopping alarm: {e}")
                            
                            # Encode frame as JPEG
                            ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                            if ret:
                                frame_bytes = buffer.tobytes()
                                yield (b'--frame\r\n'
                                       b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                            
                        except GeneratorExit:
                            print("Client disconnected from detection feed")
                            break
                        except Exception as e:
                            print(f"Error encoding frame: {e}")
                            time.sleep(0.1)
                    else:
                        time.sleep(0.1)
                        
            except GeneratorExit:
                print("Detection feed generator closed")
            finally:
                # Stop alarm if playing when stream ends
                if ai_detection and ai_detection.alarm_playing and alarm_sound:
                    with alarm_lock:
                        try:
                            alarm_sound.stop()
                            ai_detection.set_alarm_state(False)
                        except:
                            pass
        
        return Response(gen_frames_with_detection(),
                       mimetype='multipart/x-mixed-replace; boundary=frame')

    @app.route('/detection_status')
    @login_decorator
    def detection_status():
        """Get current detection status with tracking info"""
        if ai_detection is None:
            return jsonify({'error': 'AI detection not initialized'}), 500
        
        try:
            camera_id = request.args.get('camera_id')
            
            # If no camera_id provided, try to get current camera
            if not camera_id:
                account_id = session.get('account_id')
                cameras = get_cameras(firebase_enabled, app.db, account_id)
                if cameras:
                    camera_id = cameras[0]['id']
                else:
                    return jsonify({'error': 'No cameras available'}), 400
            
            status = ai_detection.get_detection_status()
            
            return jsonify({
                camera_id: {
                    'drowning_detected': status['drowning_detected'],
                    'objects': status['objects'],
                    'last_detection_time': status['last_detection_time'],
                    'alarm_playing': status['alarm_playing'],
                    'active_tracks': status['active_tracks'],
                    'fps': status['fps']
                }
            })
        
        except Exception as e:
            print(f"Error getting detection status: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/play_alarm', methods=['POST'])
    @login_decorator
    def play_alarm():
        """Play alarm (called by frontend)"""
        if alarm_sound is None:
            return jsonify({'error': 'Alarm not initialized'}), 500
        
        try:
            with alarm_lock:
                if not ai_detection.alarm_playing:
                    alarm_sound.play(-1)  # Loop continuously
                    ai_detection.set_alarm_state(True)
                    print("[ALARM] Manually started")
            return jsonify({'status': 'playing'})
        except Exception as e:
            print(f"Error playing alarm: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/stop_alarm', methods=['POST'])
    @login_decorator
    def stop_alarm():
        """Stop alarm (called by frontend)"""
        if alarm_sound is None:
            return jsonify({'error': 'Alarm not initialized'}), 500
        
        try:
            with alarm_lock:
                if ai_detection.alarm_playing:
                    alarm_sound.stop()
                    ai_detection.set_alarm_state(False)
                    print("[ALARM] Manually stopped")
            return jsonify({'status': 'stopped'})
        except Exception as e:
            print(f"Error stopping alarm: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/health')
    @login_decorator
    def health_check():
        """Health check endpoint for camera and AI status"""
        account_id = session.get('account_id')
        cameras = get_cameras(firebase_enabled, app.db, account_id)
        
        camera_statuses = camera_manager.get_all_status()
        
        # Get current camera status
        current_camera_id = request.args.get('camera_id')
        current_camera_connected = False
        if current_camera_id and current_camera_id in camera_statuses:
            current_camera_connected = camera_statuses[current_camera_id].get('connection_status') == 'connected'
        
        # Get detection stats
        detection_stats = {}
        if ai_detection:
            status = ai_detection.get_detection_status()
            detection_stats = {
                'active_tracks': status['active_tracks'],
                'fps': status['fps'],
                'alarm_playing': status['alarm_playing'],
                'drowning_detected': status['drowning_detected']
            }
        
        return jsonify({
            'camera_manager_status': 'running',
            'ai_initialized': ai_detection is not None,
            'alarm_initialized': alarm_sound is not None,
            'current_camera_connected': current_camera_connected,
            'detection_stats': detection_stats,
            'cameras': [
                {
                    'id': cam['id'],
                    'name': cam['name'],
                    'active': camera_statuses.get(cam['id'], {}).get('connection_status') == 'connected',
                    'connection_status': camera_statuses.get(cam['id'], {}).get('connection_status', 'disconnected')
                } for cam in cameras
            ]
        })

    @app.route('/toggle_alarm', methods=['POST'])
    @login_decorator
    def toggle_alarm():
        """Manually toggle the alarm on/off (for testing)"""
        if alarm_sound is None:
            return jsonify({'error': 'Alarm not initialized', 'status': 'unavailable'}), 500
        
        try:
            with alarm_lock:
                if ai_detection and ai_detection.alarm_playing:
                    alarm_sound.stop()
                    ai_detection.set_alarm_state(False)
                    return jsonify({'status': 'stopped'})
                else:
                    alarm_sound.play(-1)
                    if ai_detection:
                        ai_detection.set_alarm_state(True)
                    return jsonify({'status': 'playing'})
        
        except Exception as e:
            print(f"Error toggling alarm: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/reset_tracks', methods=['POST'])
    @login_decorator
    def reset_tracks():
        """Reset all tracking data"""
        if ai_detection is None:
            return jsonify({'error': 'AI detection not initialized'}), 500
        
        try:
            ai_detection.reset_tracks()
            return jsonify({'status': 'success', 'message': 'All tracks reset'})
        except Exception as e:
            print(f"Error resetting tracks: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/drowning_events')
    @login_decorator
    def drowning_events():
        """Get history of drowning events"""
        events = []
        if firebase_enabled and hasattr(app, 'db'):
            try:
                account_id = session.get('account_id')
                events_ref = app.db.collection('accounts').document(account_id).collection('drowning_events')
                events_data = events_ref.order_by('timestamp', direction='DESCENDING').limit(100).stream()

                for event_doc in events_data:
                    event_data = event_doc.to_dict()
                    event_data['id'] = event_doc.id
                    events.append(event_data)
                    
            except Exception as e:
                print(f"Error getting drowning events: {e}")

        return render_template('events.html', events=events, active_page='events')

    @app.route('/detection_config')
    @login_decorator
    def detection_config():
        """Get current detection configuration"""
        if ai_detection is None:
            return jsonify({'error': 'AI detection not initialized'}), 500
        
        return jsonify({
            'confidence_threshold': ai_detection.confidence_threshold,
            'iou_threshold': ai_detection.iou_threshold,
            'max_missed_frames': ai_detection.max_missed_frames,
            'window_size': ai_detection.window_size,
            'drown_threshold': ai_detection.drown_threshold,
            'alarm_repeat_seconds': ai_detection.alarm_repeat_seconds,
            'class_map': ai_detection.class_map
        })