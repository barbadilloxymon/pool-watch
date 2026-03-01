from functools import wraps
from flask import redirect, url_for, flash, session, jsonify, request
import time

def login_required(firebase_enabled, db=None):
    """Decorator: Require login before accessing a route."""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Skip authentication for static files and auth endpoints
            if request.endpoint in ['static', 'login', 'logout', 'signup', 'index', 'home']:
                return f(*args, **kwargs)
                
            # If Firebase is disabled, skip login check
            if not firebase_enabled:
                return f(*args, **kwargs)

            # Check if logged in and session is valid
            if not session.get('logged_in') or not session.get('account_id'):
                # For API endpoints, return JSON instead of redirect
                if request.path.startswith(('/detection_status', '/health', '/video_feed', '/detection_feed')):
                    return jsonify({'error': 'Authentication required'}), 401
                
                # Avoid redirect loop - only redirect if we're not already on login page
                if request.endpoint != 'login':
                    flash('Please log in to access this page.', 'error')
                    return redirect(url_for('login'))
                else:
                    return f(*args, **kwargs)
            
            # Additional session validation
            current_agent = request.headers.get('User-Agent', '')
            stored_agent = session.get('user_agent', '')
            
            # If user agent changed, force re-login for security
            if current_agent != stored_agent:
                session.clear()
                if request.path.startswith(('/detection_status', '/health', '/video_feed', '/detection_feed')):
                    return jsonify({'error': 'Session invalidated'}), 401
                
                # Avoid redirect loop
                if request.endpoint != 'login':
                    flash('Session security violation. Please log in again.', 'error')
                    return redirect(url_for('login'))
                else:
                    return f(*args, **kwargs)

            # Refresh session to prevent timeout
            session.modified = True
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def admin_required(firebase_enabled, db):
    """Decorator: Require admin role before accessing a route."""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Skip authentication for static files and auth endpoints
            if request.endpoint in ['static', 'login', 'logout', 'signup', 'index', 'home']:
                return f(*args, **kwargs)
                
            # If Firebase is disabled, skip admin check
            if not firebase_enabled:
                return f(*args, **kwargs)

            # Require login first with session validation
            if not session.get('logged_in') or not session.get('account_id'):
                # Avoid redirect loop
                if request.endpoint != 'login':
                    flash('Please log in to access this page.', 'error')
                    return redirect(url_for('login'))
                else:
                    return f(*args, **kwargs)
            
            # Additional session validation
            current_agent = request.headers.get('User-Agent', '')
            stored_agent = session.get('user_agent', '')
            
            # If user agent changed, force re-login for security
            if current_agent != stored_agent:
                session.clear()
                # Avoid redirect loop
                if request.endpoint != 'login':
                    flash('Session security violation. Please log in again.', 'error')
                    return redirect(url_for('login'))
                else:
                    return f(*args, **kwargs)

            email = session.get('email')
            account_id = session.get('account_id')
            
            if not email or not account_id:
                # Avoid redirect loop
                if request.endpoint != 'login':
                    flash('Session invalid. Please log in again.', 'error')
                    return redirect(url_for('login'))
                else:
                    return f(*args, **kwargs)

            try:
                # For account owner, check the account document directly
                account_ref = db.collection('accounts').document(account_id)
                account_data = account_ref.get()

                if not account_data.exists:
                    # Avoid redirect loop
                    if request.endpoint != 'login':
                        flash('Account not found', 'error')
                        return redirect(url_for('stream'))
                    else:
                        return f(*args, **kwargs)

                account_dict = account_data.to_dict()
                
                # Check if user is account owner (always admin) or has admin role in users subcollection
                if account_dict.get('email') == email:
                    # Account owner - always has admin access
                    if not account_dict.get('active', True):
                        # Avoid redirect loop
                        if request.endpoint != 'login':
                            flash('Your account has been deactivated', 'error')
                            return redirect(url_for('logout'))
                        else:
                            return f(*args, **kwargs)
                    
                    # Update session with owner status
                    session['role'] = 'admin'
                    session['is_owner'] = True
                    session.modified = True
                    return f(*args, **kwargs)
                else:
                    # Additional user - check users subcollection
                    user_ref = db.collection('accounts').document(account_id).collection('users').document(email)
                    user_data = user_ref.get()

                    if not user_data.exists:
                        # Avoid redirect loop
                        if request.endpoint != 'login':
                            flash('User not found', 'error')
                            return redirect(url_for('stream'))
                        else:
                            return f(*args, **kwargs)

                    user_dict = user_data.to_dict()
                    current_role = user_dict.get('role', 'user')
                    
                    # Update session with current role
                    session['role'] = current_role
                    session['is_owner'] = False
                    session.modified = True
                    
                    if current_role != 'admin':
                        # Avoid redirect loop
                        if request.endpoint != 'login':
                            flash('Admin access required. You do not have permission to access this page.', 'error')
                            return redirect(url_for('stream'))
                        else:
                            return f(*args, **kwargs)
                            
                    if not user_dict.get('active', True):
                        # Avoid redirect loop
                        if request.endpoint != 'login':
                            flash('Your account has been deactivated', 'error')
                            return redirect(url_for('logout'))
                        else:
                            return f(*args, **kwargs)

            except Exception as e:
                print(f"Error checking admin status: {e}")
                # Avoid redirect loop
                if request.endpoint != 'login':
                    flash('Error verifying permissions', 'error')
                    return redirect(url_for('stream'))
                else:
                    return f(*args, **kwargs)

            # Refresh session to prevent timeout
            session.modified = True
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def role_based_access(firebase_enabled, db):
    """
    Decorator: Check user role and refresh it from database on each request.
    This ensures role changes are reflected immediately without requiring re-login.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Skip for static files and auth endpoints
            if request.endpoint in ['static', 'login', 'logout', 'signup', 'index', 'home']:
                return f(*args, **kwargs)
            
            # If Firebase is disabled, skip role check
            if not firebase_enabled:
                return f(*args, **kwargs)
            
            # Require login first
            if not session.get('logged_in') or not session.get('account_id'):
                if request.path.startswith(('/detection_status', '/health', '/video_feed', '/detection_feed')):
                    return jsonify({'error': 'Authentication required'}), 401
                    
                if request.endpoint != 'login':
                    flash('Please log in to access this page.', 'error')
                    return redirect(url_for('login'))
                return f(*args, **kwargs)
            
            email = session.get('email')
            account_id = session.get('account_id')
            
            if not email or not account_id:
                if request.endpoint != 'login':
                    flash('Session invalid. Please log in again.', 'error')
                    return redirect(url_for('login'))
                return f(*args, **kwargs)
            
            try:
                # Fetch current role from database
                account_ref = db.collection('accounts').document(account_id)
                account_data = account_ref.get()
                
                if not account_data.exists:
                    flash('Account not found', 'error')
                    return redirect(url_for('stream'))
                
                account_dict = account_data.to_dict()
                
                # Check if account owner
                if account_dict.get('email') == email:
                    current_role = 'admin'  # Account owner is always admin
                    is_owner = True
                else:
                    # Get role from users subcollection
                    user_ref = db.collection('accounts').document(account_id).collection('users').document(email)
                    user_data = user_ref.get()
                    
                    if not user_data.exists:
                        flash('User not found', 'error')
                        return redirect(url_for('stream'))
                    
                    user_dict = user_data.to_dict()
                    current_role = user_dict.get('role', 'user')
                    is_owner = False
                    
                    if not user_dict.get('active', True):
                        flash('Your account has been deactivated', 'error')
                        return redirect(url_for('logout'))
                
                # Update session with current role
                session['role'] = current_role
                session['is_owner'] = is_owner
                session.modified = True
                
                # Define restricted pages for regular users
                user_allowed_endpoints = [
                    'stream', 'events', 'video_feed', 'detection_feed', 
                    'detection_status', 'health', 'download_snapshot',
                    'play_alarm', 'stop_alarm', 'camera_preview',
                    'account_info', 'update_name', 'change_password', 'delete_account'
                ]
                
                # If user role and trying to access restricted page
                if current_role == 'user' and request.endpoint not in user_allowed_endpoints:
                    # For API endpoints, return JSON
                    if request.path.startswith(('/api/', '/camera_status', '/test_camera')):
                        return jsonify({'error': 'Admin access required'}), 403
                    
                    flash('You do not have permission to access this page. Only admins can access Camera Management and User Management.', 'error')
                    return redirect(url_for('stream'))
                
            except Exception as e:
                print(f"Error checking role: {e}")
                import traceback
                print(traceback.format_exc())
                flash('Error verifying permissions', 'error')
                return redirect(url_for('stream'))
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator