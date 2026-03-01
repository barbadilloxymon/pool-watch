import os
from datetime import timedelta
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Config:
    # Flask Configuration
    SECRET_KEY = os.environ.get('SECRET_KEY', os.urandom(24).hex())
    FLASK_ENV = os.environ.get('FLASK_ENV', 'development')
    DEBUG = os.environ.get('FLASK_DEBUG', 'True').lower() == 'true'
    
    # Session Configuration
    SESSION_COOKIE_SECURE = os.environ.get('SESSION_COOKIE_SECURE', 'False').lower() == 'true'
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = os.environ.get('SESSION_COOKIE_SAMESITE', 'Lax')
    PERMANENT_SESSION_LIFETIME = timedelta(
        days=int(os.environ.get('AUTO_LOGOUT_DAYS', 30))
    )
    
    # CSRF Protection
    WTF_CSRF_ENABLED = True
    WTF_CSRF_CHECK_DEFAULT = True
    WTF_CSRF_SSL_STRICT = False
    
    # Firebase Configuration
    FIREBASE_CREDENTIALS = os.environ.get(
        'FIREBASE_CREDENTIALS', 
        "firebase_db/pool-watch-main-firebase-adminsdk-fbsvc-50ae673f8a.json"
    )
    
    FIREBASE_DATABASE_URL = os.environ.get(
        'FIREBASE_DATABASE_URL', 
        "https://pool-watch-main-default-rtdb.asia-southeast1.firebasedatabase.app/"
    )
    
    # AI Model Configuration
    AI_MODEL_PATH = os.environ.get('AI_MODEL_PATH', "weights/best.pt")
    ALARM_SOUND_PATH = os.environ.get('ALARM_SOUND_PATH', "static/sounds/drown-alarm3.mp3")
    
    # OPTIMIZED Detection Settings - FOR SPEED AND ACCURACY
    DETECTION_CONFIDENCE = float(os.environ.get('DETECTION_CONFIDENCE', 0.70))  # Balanced
    ALARM_DURATION = int(os.environ.get('ALARM_DURATION', 15))
    
    # OPTIMIZED detection parameters
    DETECTION_IOU_THRESHOLD = float(os.environ.get('DETECTION_IOU_THRESHOLD', 0.30))
    MAX_DETECTIONS = int(os.environ.get('MAX_DETECTIONS', 1000))
    FRAME_RESIZE_MAX_WIDTH = int(os.environ.get('FRAME_RESIZE_MAX_WIDTH', 480))  # Reduced for speed
    FRAME_RESIZE_MAX_HEIGHT = int(os.environ.get('FRAME_RESIZE_MAX_HEIGHT', 360))  # Reduced for speed
    
    # Performance settings
    ENABLE_DETECTION_DEBUG = os.environ.get('ENABLE_DETECTION_DEBUG', 'False').lower() == 'true'  # Off for speed
    DETECTION_FRAME_SKIP = int(os.environ.get('DETECTION_FRAME_SKIP', 2))  # Process every N frames
    
    # Database structure settings
    ACCOUNTS_COLLECTION = 'accounts'
    USERS_SUBCOLLECTION = 'users'
    CAMERAS_SUBCOLLECTION = 'cameras'
    DROWNING_EVENTS_SUBCOLLECTION = 'drowning_events'