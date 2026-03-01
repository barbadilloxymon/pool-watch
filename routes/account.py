from flask import request, session, jsonify, flash, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

def init_account_routes(app, firebase_enabled, db, login_decorator):
    """Initialize account management routes"""
    
    @app.route('/update-name', methods=['POST'])
    @login_decorator
    def update_name():
        """Update user's display name"""
        try:
            data = request.get_json()
            new_name = data.get('name', '').strip()
            
            if not new_name:
                return jsonify({'success': False, 'message': 'Name is required'}), 400
            
            email = session.get('email')
            account_id = session.get('account_id')
            
            if not email or not account_id:
                return jsonify({'success': False, 'message': 'Session invalid'}), 401
            
            if firebase_enabled and db:
                current_time = datetime.now()
                
                # Check if this is the account owner
                account_ref = db.collection('accounts').document(account_id)
                account_data = account_ref.get()
                
                if not account_data.exists:
                    return jsonify({'success': False, 'message': 'Account not found'}), 404
                
                account_dict = account_data.to_dict()
                
                if account_dict.get('email') == email:
                    # Update account owner name
                    account_ref.update({
                        'accountName': new_name,
                        'updatedAt': current_time
                    })
                else:
                    # Update user in subcollection
                    user_ref = db.collection('accounts').document(account_id).collection('users').document(email)
                    user_data = user_ref.get()
                    
                    if not user_data.exists:
                        return jsonify({'success': False, 'message': 'User not found'}), 404
                    
                    user_ref.update({
                        'fullName': new_name,
                        'updatedAt': current_time
                    })
                
                # Update session
                session['full_name'] = new_name
                session.modified = True
                
                return jsonify({'success': True, 'message': 'Name updated successfully'})
            else:
                # Local mode
                session['full_name'] = new_name
                session.modified = True
                return jsonify({'success': True, 'message': 'Name updated successfully (local mode)'})
                
        except Exception as e:
            print(f"Error updating name: {e}")
            import traceback
            print(traceback.format_exc())
            return jsonify({'success': False, 'message': f'Server error: {str(e)}'}), 500
    
    @app.route('/change-password', methods=['POST'])
    @login_decorator
    def change_password():
        """Change user password"""
        try:
            data = request.get_json()
            current_password = data.get('current_password', '').strip()
            new_password = data.get('new_password', '').strip()
            
            if not current_password or not new_password:
                return jsonify({'success': False, 'message': 'All password fields are required'}), 400
            
            if len(new_password) < 8:
                return jsonify({'success': False, 'message': 'New password must be at least 8 characters'}), 400
            
            email = session.get('email')
            account_id = session.get('account_id')
            
            if not email or not account_id:
                return jsonify({'success': False, 'message': 'Session invalid'}), 401
            
            if firebase_enabled and db:
                current_time = datetime.now()
                
                # Check if this is the account owner
                account_ref = db.collection('accounts').document(account_id)
                account_data = account_ref.get()
                
                if not account_data.exists:
                    return jsonify({'success': False, 'message': 'Account not found'}), 404
                
                account_dict = account_data.to_dict()
                
                if account_dict.get('email') == email:
                    # Verify current password for account owner
                    stored_password = account_dict.get('password')
                    if not stored_password or not check_password_hash(stored_password, current_password):
                        return jsonify({'success': False, 'message': 'Current password is incorrect'}), 400
                    
                    # Update account owner password
                    account_ref.update({
                        'password': generate_password_hash(new_password),
                        'updatedAt': current_time
                    })
                else:
                    # Update user in subcollection
                    user_ref = db.collection('accounts').document(account_id).collection('users').document(email)
                    user_data = user_ref.get()
                    
                    if not user_data.exists:
                        return jsonify({'success': False, 'message': 'User not found'}), 404
                    
                    user_dict = user_data.to_dict()
                    stored_password = user_dict.get('password')
                    
                    if not stored_password or not check_password_hash(stored_password, current_password):
                        return jsonify({'success': False, 'message': 'Current password is incorrect'}), 400
                    
                    user_ref.update({
                        'password': generate_password_hash(new_password),
                        'updatedAt': current_time
                    })
                
                return jsonify({'success': True, 'message': 'Password changed successfully'})
            else:
                # Local mode
                return jsonify({'success': True, 'message': 'Password changed successfully (local mode)'})
                
        except Exception as e:
            print(f"Error changing password: {e}")
            import traceback
            print(traceback.format_exc())
            return jsonify({'success': False, 'message': f'Server error: {str(e)}'}), 500
    
    @app.route('/delete-account', methods=['POST'])
    @login_decorator
    def delete_account():
        """Delete user account - requires password confirmation"""
        try:
            data = request.get_json()
            password = data.get('password', '').strip()
            
            if not password:
                return jsonify({'success': False, 'message': 'Password is required'}), 400
            
            email = session.get('email')
            account_id = session.get('account_id')
            
            if not email or not account_id:
                return jsonify({'success': False, 'message': 'Session invalid'}), 401
            
            if firebase_enabled and db:
                # Check if this is account owner
                account_ref = db.collection('accounts').document(account_id)
                account_data = account_ref.get()
                
                if not account_data.exists:
                    return jsonify({'success': False, 'message': 'Account not found'}), 404
                
                account_dict = account_data.to_dict()
                
                if account_dict.get('email') == email:
                    # Verify password for account owner
                    stored_password = account_dict.get('password')
                    if not stored_password or not check_password_hash(stored_password, password):
                        return jsonify({'success': False, 'message': 'Incorrect password'}), 400
                    
                    # Delete entire account
                    account_ref.delete()
                    
                    # Delete all related users
                    users_ref = db.collection('accounts').document(account_id).collection('users')
                    users = users_ref.stream()
                    for user in users:
                        user.reference.delete()
                else:
                    # Verify password for regular user
                    user_ref = db.collection('accounts').document(account_id).collection('users').document(email)
                    user_data = user_ref.get()
                    
                    if not user_data.exists:
                        return jsonify({'success': False, 'message': 'User not found'}), 404
                    
                    user_dict = user_data.to_dict()
                    stored_password = user_dict.get('password')
                    
                    if not stored_password or not check_password_hash(stored_password, password):
                        return jsonify({'success': False, 'message': 'Incorrect password'}), 400
                    
                    # Delete only this user
                    user_ref.delete()
                
                # Clear session and logout
                session.clear()
                session.permanent = False
                
                return jsonify({'success': True, 'message': 'Account deleted successfully'})
            else:
                # Local mode - still require password field for consistency
                session.clear()
                return jsonify({'success': True, 'message': 'Account deleted successfully (local mode)'})
                
        except Exception as e:
            print(f"Error deleting account: {e}")
            import traceback
            print(traceback.format_exc())
            return jsonify({'success': False, 'message': f'Server error: {str(e)}'}), 500
    
    @app.route('/account-info')
    @login_decorator
    def get_account_info():
        """Get current user account information"""
        try:
            return jsonify({
                'success': True,
                'data': {
                    'email': session.get('email', ''),
                    'full_name': session.get('full_name', ''),
                    'role': session.get('role', 'user'),
                    'account_id': session.get('account_id', ''),
                    'is_owner': session.get('is_owner', False)
                }
            })
        except Exception as e:
            print(f"Error getting account info: {e}")
            return jsonify({'success': False, 'message': str(e)}), 500