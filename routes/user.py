from flask import (
    render_template, request, redirect,
    url_for, flash, session, jsonify
)
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
import time
import uuid
from utils.helpers import get_account_users

def init_user_routes(app, firebase_enabled, db, login_decorator, admin_decorator):
    @app.route('/user_management')
    @admin_decorator
    def user_management():
        account_id = session.get('account_id')
        if not account_id:
            flash('Account not found', 'error')
            return redirect(url_for('stream'))
            
        users = get_account_users(firebase_enabled, db, account_id)
        return render_template('user.html', users=users, active_page='user_management')

    @app.route('/update_user', methods=['POST'])
    @admin_decorator
    def update_user():
        """Update user information"""
        try:
            account_id = session.get('account_id')
            if not account_id:
                flash('Account not found', 'error')
                return redirect(url_for('user_management'))
                
            # Get form data
            edit_email = request.form.get('edit_email', '').lower().strip()
            full_name = request.form.get('full_name', '').strip()
            role = request.form.get('role', 'user')
            
            if not edit_email:
                flash('User email is required', 'error')
                return redirect(url_for('user_management'))

            if firebase_enabled and account_id:
                user_ref = db.collection('accounts').document(account_id).collection('users').document(edit_email)
                
                # Ensure user exists
                if not user_ref.get().exists:
                    flash('User not found', 'error')
                    return redirect(url_for('user_management'))

                # Prepare update payload
                update_data = {
                    "role": role,
                    "fullName": full_name,
                    "updatedAt": datetime.now()
                }

                # Update user in Firestore
                user_ref.update(update_data)
                flash('User updated successfully', 'success')
            else:
                # Local/dev mode
                flash('User updated successfully (local mode)', 'success')

        except Exception as e:
            flash(f'Failed to update user: {str(e)}', 'error')

        return redirect(url_for('user_management'))

    @app.route('/save_user', methods=['POST'])
    @admin_decorator
    def save_user():
        """Create new user only (not for account owner)"""
        account_id = session.get('account_id')
        if not account_id:
            flash('Account not found', 'error')
            return redirect(url_for('user_management'))
            
        email = request.form.get('email', '').lower().strip()
        full_name = request.form.get('full_name', '').strip()
        password = request.form.get('password', '').strip()
        role = request.form.get('role', 'user')
        
        # Validation
        if not email:
            flash('Email is required', 'error')
            return redirect(url_for('user_management'))

        if not password:
            flash('Password is required for new users', 'error')
            return redirect(url_for('user_management'))

        try:
            if firebase_enabled and account_id:
                # Check if email already exists in this account's users subcollection
                user_ref = db.collection('accounts').document(account_id).collection('users').document(email)
                if user_ref.get().exists:
                    flash('Email already exists in this account', 'error')
                    return redirect(url_for('user_management'))
                
                # Check if this is the account owner's email (should not create user for account owner)
                account_ref = db.collection('accounts').document(account_id)
                account_data = account_ref.get().to_dict()
                if account_data.get('email') == email:
                    flash('This email is already the account owner. Use a different email for additional users.', 'error')
                    return redirect(url_for('user_management'))

                current_time = datetime.now()
                # Generate unique UID
                unique_uid = str(uuid.uuid4())
                
                user_data = {
                    'uid': unique_uid,  
                    'email': email,
                    'fullName': full_name,
                    'role': role,
                    'active': True,
                    'password': generate_password_hash(password),
                    'createdAt': current_time,
                    'updatedAt': current_time,
                    'lastLogin': current_time
                }

                # Save to Firestore users subcollection
                user_ref.set(user_data)
                flash('User created successfully', 'success')
            else:
                flash('User created successfully (local mode)', 'success')
                
        except Exception as e:
            flash(f'Error creating user: {e}', 'error')

        return redirect(url_for('user_management'))

    @app.route('/get_user')
    @admin_decorator
    def get_user():
        account_id = session.get('account_id')
        email = request.args.get('email')
        if not email or not account_id:
            return jsonify({'error': 'Email and account ID required'}), 400

        if firebase_enabled and account_id:
            user_ref = db.collection('accounts').document(account_id).collection('users').document(email)
            user_data = user_ref.get()
            if user_data.exists:
                user_dict = user_data.to_dict()
                
                # Return only the fields needed for the edit form
                response_data = {
                    'email': email,
                    'full_name': user_dict.get('fullName', ''),
                    'role': user_dict.get('role', 'user'),
                    'status': 'active' if user_dict.get('active', True) else 'inactive',
                    'uid': user_dict.get('uid', email)  # Include UID
                }
                
                return jsonify(response_data)

        return jsonify({'error': 'User not found'}), 404

    @app.route('/delete_user', methods=['POST'])
    @admin_decorator
    def delete_user():
        account_id = session.get('account_id')
        if not account_id:
            if request.is_json:
                return jsonify({'success': False, 'message': 'Account not found'}), 400
            flash('Account not found', 'error')
            return redirect(url_for('user_management'))
        
        # Handle both JSON and form data
        if request.is_json:
            data = request.get_json()
            email = data.get('email', '').lower().strip() if data else ''
        else:
            email = request.form.get('email', '').lower().strip()

        if not email:
            if request.is_json:
                return jsonify({'success': False, 'message': 'Email is required'}), 400
            flash('Email is required', 'error')
            return redirect(url_for('user_management'))

        # Prevent deleting the account owner
        account_ref = db.collection('accounts').document(account_id)
        account_data = account_ref.get().to_dict()
        if account_data.get('email') == email:
            if request.is_json:
                return jsonify({'success': False, 'message': 'You cannot delete the account owner'}), 400
            flash('You cannot delete the account owner', 'error')
            return redirect(url_for('user_management'))

        if email == session.get('email'):
            if request.is_json:
                return jsonify({'success': False, 'message': 'You cannot delete your own account'}), 400
            flash('You cannot delete your own account', 'error')
            return redirect(url_for('user_management'))

        try:
            if firebase_enabled and account_id:
                # Delete from account's users subcollection
                user_ref = db.collection('accounts').document(account_id).collection('users').document(email)
                if not user_ref.get().exists:
                    if request.is_json:
                        return jsonify({'success': False, 'message': 'User not found'}), 404
                    flash('User not found', 'error')
                    return redirect(url_for('user_management'))
                
                user_ref.delete()
                if request.is_json:
                    return jsonify({'success': True, 'message': 'User deleted successfully'})
                flash('User deleted successfully', 'success')
            else:
                if request.is_json:
                    return jsonify({'success': True, 'message': 'User deleted successfully (local mode)'})
                flash('User deleted successfully (local mode)', 'success')
        except Exception as e:
            if request.is_json:
                return jsonify({'success': False, 'message': f'Error deleting user: {str(e)}'}), 500
            flash(f'Error deleting user: {e}', 'error')

        return redirect(url_for('user_management'))