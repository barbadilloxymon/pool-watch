import firebase_admin
from firebase_admin import credentials, firestore
import os

# Ensure the credentials file exists
cred_path = "firebase_db/pool-watch-main-firebase-adminsdk-fbsvc-b658d0f0c2.json"

if not os.path.exists(cred_path):
    raise FileNotFoundError(f"Credential file not found at: {cred_path}")

# Check if Firebase is already initialized (to prevent RuntimeError)
if not firebase_admin._apps:
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)

# Connect to Firestore
db = firestore.client()
