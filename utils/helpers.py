import cv2
import json
import uuid
from datetime import datetime

def get_cameras(firebase_enabled, db=None, account_id=None):
    """Get all cameras from Firestore for specific account"""
    try:
        if firebase_enabled and db and account_id:
            print(f"Getting cameras for account: {account_id}")
            # Get from Firestore subcollection
            cameras_ref = db.collection('accounts').document(account_id).collection('cameras')
            cameras_data = cameras_ref.stream()

            cameras = []
            for camera_doc in cameras_data:
                camera_data = camera_doc.to_dict()
                camera_data['id'] = camera_doc.id
                # Ensure all required fields exist
                camera_data.setdefault('name', 'Unnamed Camera')
                camera_data.setdefault('location', 'Unknown Location')
                camera_data.setdefault('active', False)
                camera_data.setdefault('rtsp_url', '')
                cameras.append(camera_data)

            print(f"Found {len(cameras)} cameras for account {account_id}")
            return cameras
        else:
            # Get from local JSON file
            try:
                with open('cameras.json', 'r') as f:
                    return json.load(f)
            except (FileNotFoundError, json.JSONDecodeError):
                return []
    except Exception as e:
        print(f"Error getting cameras: {e}")
        return []

def get_account_users(firebase_enabled, db=None, account_id=None):
    """Get all additional users for specific account (not including account owner)"""
    try:
        if firebase_enabled and db and account_id:
            print(f"Getting additional users for account: {account_id}")
            users_ref = db.collection('accounts').document(account_id).collection('users')
            users_data = users_ref.stream()

            users = []
            for user_doc in users_data:
                user_data = user_doc.to_dict()
                user_data['email'] = user_doc.id
                
                # Set default values for missing fields
                user_data.setdefault('fullName', user_data.get('email', 'Unknown User').split('@')[0])
                user_data.setdefault('role', 'user')
                user_data.setdefault('active', True)
                user_data.setdefault('createdAt', datetime.now())
                user_data.setdefault('updatedAt', datetime.now())
                user_data.setdefault('lastLogin', datetime.now())
                
                users.append(user_data)

            print(f"Found {len(users)} additional users for account {account_id}")
            return users
        else:
            return []
    except Exception as e:
        print(f"Error getting users: {e}")
        return []

def test_rtsp_connection(rtsp_url):
    """Test connection to RTSP URL and return stream info"""
    try:
        cap = cv2.VideoCapture(rtsp_url)
        if not cap.isOpened():
            return False, {'error': 'Could not open RTSP stream'}

        # Get stream info
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)

        # Read a frame to confirm connection
        ret, _ = cap.read()
        if not ret:
            cap.release()
            return False, {'error': 'Could not read frame from stream'}

        cap.release()
        return True, {
            'resolution': f"{width}x{height}",
            'fps': round(fps, 1)
        }
    except Exception as e:
        return False, {'error': str(e)}

def datetimeformat(value, format='%Y-%m-%d %H:%M'):
    """Template filter for datetime formatting with better error handling"""
    if value is None:
        return "N/A"
    
    # Handle Firestore timestamp objects
    if hasattr(value, 'strftime'):
        try:
            return value.strftime(format)
        except:
            return "Invalid date"
    
    # Handle string timestamps
    elif isinstance(value, str):
        try:
            # Try to parse as ISO format string
            if 'T' in value:
                value = datetime.fromisoformat(value.replace('Z', '+00:00'))
            else:
                return value  # Return as-is if not a recognizable date format
        except (ValueError, AttributeError):
            return value  # Return as-is if parsing fails
    
    # Handle datetime objects
    if hasattr(value, 'strftime'):
        try:
            return value.strftime(format)
        except:
            return "Invalid date"
    else:
        return str(value)