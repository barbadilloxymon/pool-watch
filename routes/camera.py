from flask import render_template, request, redirect, url_for, flash, jsonify, Response, session
from utils.helpers import get_cameras, test_rtsp_connection
import uuid
import time
import json
import cv2
from datetime import datetime

def init_camera_routes(app, firebase_enabled, db, camera_manager, login_decorator):
    
    def check_duplicate_rtsp(rtsp_url, exclude_camera_id=None):
        """Check if RTSP URL already exists in the account"""
        account_id = session.get('account_id')
        if not firebase_enabled or not account_id:
            return False
        
        try:
            cameras = get_cameras(firebase_enabled, db, account_id)
            for camera in cameras:
                # Skip the current camera if editing
                if exclude_camera_id and camera['id'] == exclude_camera_id:
                    continue
                
                # Check for exact RTSP URL match
                if camera.get('rtsp_url', '').strip() == rtsp_url.strip():
                    return True
            return False
        except Exception as e:
            print(f"Error checking duplicate RTSP: {e}")
            return False
    
    @app.route('/stream')
    @login_decorator
    def stream():
        account_id = session.get('account_id')
        cameras = get_cameras(firebase_enabled, db, account_id)
        
        for camera in cameras:
            camera_manager.add_camera(
                camera['id'], 
                camera['rtsp_url'], 
                camera['name']
            )
        
        camera_statuses = camera_manager.get_all_status()
        for camera in cameras:
            status = camera_statuses.get(camera['id'], {})
            camera['active'] = status.get('connection_status') == 'connected'
            camera['connection_status'] = status.get('connection_status', 'disconnected')
        
        camera_id = request.args.get('camera_id')
        current_camera = None

        if camera_id:
            for camera in cameras:
                if str(camera['id']) == camera_id:
                    current_camera = camera
                    break
        elif cameras:
            current_camera = cameras[0]

        return render_template('stream.html',
                             cameras=cameras,
                             current_camera=current_camera,
                             active_page='stream')

    @app.route('/camera_management')
    @login_decorator
    def camera_management():
        account_id = session.get('account_id')
        cameras = get_cameras(firebase_enabled, db, account_id)
        
        for camera in cameras:
            camera_manager.add_camera(
                camera['id'], 
                camera['rtsp_url'], 
                camera['name']
            )
        
        camera_statuses = camera_manager.get_all_status()
        for camera in cameras:
            status = camera_statuses.get(camera['id'], {})
            camera['active'] = status.get('connection_status') == 'connected'
            camera['connection_status'] = status.get('connection_status', 'disconnected')
        
        return render_template('camera.html', 
                             cameras=cameras, 
                             active_page='camera_management')

    @app.route('/video_feed')
    @login_decorator
    def video_feed():
        """Video feed for specific camera"""
        camera_id = request.args.get('camera_id')
        thumbnail = request.args.get('thumbnail', '0') == '1'
        
        if not camera_id:
            account_id = session.get('account_id')
            cameras = get_cameras(firebase_enabled, db, account_id)
            if cameras:
                camera_id = cameras[0]['id']
            else:
                return "No cameras available", 404
        
        return Response(
            camera_manager.gen_frames(camera_id, thumbnail),
            mimetype='multipart/x-mixed-replace; boundary=frame'
        )

    @app.route('/camera_preview')
    @login_decorator
    def camera_preview():
        """Preview endpoint for testing camera connections"""
        rtsp_url = request.args.get('url')
        
        if not rtsp_url:
            return "No URL provided", 400
        
        def generate_preview():
            """Generate preview frames from RTSP URL"""
            cap = None
            frame_count = 0
            max_frames = 300
            
            try:
                cap = cv2.VideoCapture(rtsp_url)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                
                if not cap.isOpened():
                    error_img = cv2.imread('static/img/no-signal.png')
                    if error_img is None:
                        error_img = cv2.imread('static/img/cctv-cam-offline.png')
                    if error_img is not None:
                        ret, buffer = cv2.imencode('.jpg', error_img)
                        if ret:
                            yield (b'--frame\r\n'
                                   b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
                    return
                
                while frame_count < max_frames:
                    ret, frame = cap.read()
                    
                    if ret and frame is not None:
                        height, width = frame.shape[:2]
                        if height > 0 and width > 0:
                            new_width = 640
                            new_height = int(height * (new_width / width))
                            frame = cv2.resize(frame, (new_width, new_height))
                        
                        ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                        if ret:
                            frame_bytes = buffer.tobytes()
                            yield (b'--frame\r\n'
                                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                        
                        frame_count += 1
                    else:
                        time.sleep(0.1)
                    
                    time.sleep(0.033)
                    
            except Exception as e:
                print(f"Preview error: {e}")
            finally:
                if cap:
                    try:
                        cap.release()
                    except:
                        pass
        
        return Response(generate_preview(),
                       mimetype='multipart/x-mixed-replace; boundary=frame')

    @app.route('/save_camera', methods=['POST'])
    @login_decorator
    def save_camera():
        account_id = session.get('account_id')
        user_id = session.get('user_id')
        camera_id = request.form.get('camera_id')
        name = request.form.get('name', '').strip()
        rtsp_url = request.form.get('rtsp_url', '').strip()
        location = request.form.get('location', '').strip()
        description = request.form.get('description', '').strip()

        if not name or not rtsp_url:
            flash('Camera name and RTSP URL are required', 'error')
            return redirect(url_for('camera_management'))

        # Check for duplicate RTSP URL (exclude current camera if editing)
        exclude_id = camera_id if camera_id and camera_id != 'new' else None
        if check_duplicate_rtsp(rtsp_url, exclude_id):
            flash('This RTSP URL is already in use. Please use a different URL or check the channel/port.', 'error')
            return redirect(url_for('camera_management'))

        # Test connection
        success, stream_info = test_rtsp_connection(rtsp_url)

        if not success:
            flash(f'Could not connect to camera stream. Please check the RTSP IP address, port, and password. Error: {stream_info.get("error", "Unknown error")}', 'error')
            return redirect(url_for('camera_management'))

        try:
            if firebase_enabled and account_id:
                current_time = datetime.now()
                
                if camera_id and camera_id != 'new':
                    # Update existing camera
                    camera_ref = db.collection('accounts').document(account_id).collection('cameras').document(camera_id)
                    camera_ref.update({
                        'name': name,
                        'rtsp_url': rtsp_url,
                        'location': location,
                        'description': description,
                        'active': True,
                        'updatedAt': current_time
                    })
                    
                    camera_manager.update_camera(camera_id, rtsp_url, name)
                    flash('Camera updated successfully', 'success')
                else:
                    # Create new camera
                    new_id = f"camera-{uuid.uuid4().hex[:12]}"
                    camera_ref = db.collection('accounts').document(account_id).collection('cameras').document(new_id)
                    camera_data = {
                        'id': new_id,
                        'name': name,
                        'rtsp_url': rtsp_url,
                        'location': location,
                        'description': description,
                        'active': True,
                        'createdBy': user_id,
                        'createdAt': current_time,
                        'updatedAt': current_time,
                        'isPublic': False,
                        'allowedUsers': [user_id]
                    }
                    camera_ref.set(camera_data)
                    
                    camera_manager.add_camera(new_id, rtsp_url, name)
                    flash('Camera added successfully', 'success')
            else:
                flash('Camera saved successfully (local mode)', 'success')

        except Exception as e:
            print(f"Error saving camera: {e}")
            flash(f'Error saving camera: {e}', 'error')

        return redirect(url_for('camera_management'))

    @app.route('/delete_camera', methods=['POST'])
    @login_decorator
    def delete_camera():
        account_id = session.get('account_id')
        camera_id = request.form.get('camera_id')
        if not camera_id:
            flash('Camera ID is required', 'error')
            return redirect(url_for('camera_management'))

        try:
            if firebase_enabled and account_id:
                camera_ref = db.collection('accounts').document(account_id).collection('cameras').document(camera_id)
                camera_ref.delete()
                
                camera_manager.remove_camera(camera_id)
                flash('Camera deleted successfully', 'success')
            else:
                flash('Camera deleted successfully (local mode)', 'success')
        except Exception as e:
            print(f"Error deleting camera: {e}")
            flash(f'Error deleting camera: {e}', 'error')

        return redirect(url_for('camera_management'))

    @app.route('/camera_status')
    @login_decorator
    def camera_status():
        """Get real-time status of all cameras"""
        account_id = session.get('account_id')
        cameras = get_cameras(firebase_enabled, db, account_id)
        
        status_data = {}
        for camera in cameras:
            status = camera_manager.get_camera_status(camera['id'])
            if status:
                status_data[camera['id']] = status
        
        return jsonify(status_data)

    @app.route('/force_reconnect/<camera_id>')
    @login_decorator
    def force_reconnect(camera_id):
        """Force reconnection for a specific camera"""
        try:
            camera_manager.force_reconnect_camera(camera_id)
            return jsonify({'success': True, 'message': 'Reconnection initiated'})
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)})

    @app.route('/test_camera_connection', methods=['POST'])
    @login_decorator
    def test_camera_connection():
        data = request.get_json()
        if not data or 'rtsp_url' not in data:
            return jsonify({'error': 'Missing rtsp_url parameter', 'success': False}), 400

        rtsp_url = data['rtsp_url'].strip()
        
        # Check for duplicate RTSP URL (if camera_id provided, exclude it)
        camera_id = data.get('camera_id')
        exclude_id = camera_id if camera_id and camera_id != 'new' else None
        
        if check_duplicate_rtsp(rtsp_url, exclude_id):
            return jsonify({
                'success': False, 
                'error': 'This RTSP URL is already in use. Please use a different URL or check the channel/port.'
            }), 400

        success, stream_info = test_rtsp_connection(rtsp_url)

        if success:
            return jsonify({
                'success': True,
                'resolution': stream_info.get('resolution', 'Unknown'),
                'fps': stream_info.get('fps', 'Unknown')
            })
        else:
            return jsonify({
                'success': False, 
                'error': f'Could not connect to camera. Please check the RTSP IP address, port, and password. {stream_info.get("error", "Unknown error")}'
            })