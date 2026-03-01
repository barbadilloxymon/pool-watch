from flask import render_template, request, redirect, url_for, flash, session
from forms import LoginForm, SignupForm
from werkzeug.security import check_password_hash, generate_password_hash
import time
from datetime import datetime
import uuid

def init_auth_routes(app, firebase_enabled, db):
    @app.route('/')
    def index():
        
        return redirect(url_for('home'))

    @app.route('/home')
    def home():
        logged_in = session.get('logged_in', False)
        about_section = render_template('home_sections/about_section.html')
        tutorial_section = render_template('home_sections/tutorial_section.html')
        safety_section = render_template('home_sections/safety_emergency_section.html')
        return render_template(
            'home.html',
            logged_in=logged_in,
            about_section=about_section,
            tutorial_section=tutorial_section,
            safety_section=safety_section
        )

    @app.route('/login', methods=['GET', 'POST'])
    def login():
        
        if session.get('logged_in'):
            return redirect(url_for('stream'))
            
        form = LoginForm()
        
        if request.method == 'POST' and form.validate_on_submit():
            email = form.email.data.lower().strip()
            password = form.password.data.strip()

            if firebase_enabled:
                try:
                    print(f"Attempting login for email: {email}")
                    
                    
                    accounts_ref = db.collection('accounts')
                    accounts_query = accounts_ref.where('email', '==', email).stream()
                    
                    account_found = None
                    for account_doc in accounts_query:
                        account_found = account_doc
                        break
                    
                    if account_found:
                       
                        account_id = account_found.id
                        account_data = account_found.to_dict()
                        stored_password = account_data.get('password')
                        
                        print(f"Account owner found: {account_id}")
                        
                        
                        if stored_password and check_password_hash(stored_password, password):
                            
                            if not account_data.get('active', True):
                                flash('Account is deactivated. Please contact administrator.', 'error')
                                return render_template('login.html', form=form)
                            
                            
                            current_time = datetime.now()
                            account_ref = db.collection('accounts').document(account_id)
                            account_ref.update({
                                'lastLogin': current_time,
                                'updatedAt': current_time
                            })
                            
                            
                            session.permanent = True  
                            session['logged_in'] = True
                            session['email'] = email
                            session['account_id'] = account_id
                            session['user_id'] = email
                            session['role'] = 'admin'  
                            session['is_owner'] = True  
                            session['full_name'] = account_data.get('accountName', '')
                            session['user_agent'] = request.headers.get('User-Agent', '')
                            session['login_time'] = time.time()
                            session.modified = True  
                            
                            print(f"Account owner {email} logged in successfully to account {account_id}")
                            flash('Login successful!', 'success')
                            return redirect(url_for('stream'))
                        else:
                            print("Password mismatch for account owner")
                            flash('Invalid email or password', 'error')
                            return render_template('login.html', form=form)
                    
                   
                    print(f"Not an account owner, checking users subcollections...")
                    
                   
                    all_accounts = db.collection('accounts').stream()
                    
                    user_found = None
                    parent_account_id = None
                    
                    for account_doc in all_accounts:
                        account_id = account_doc.id
                        
                       
                        user_ref = db.collection('accounts').document(account_id).collection('users').document(email)
                        user_doc = user_ref.get()
                        
                        if user_doc.exists:
                            user_found = user_doc
                            parent_account_id = account_id
                            print(f"Additional user found in account: {account_id}")
                            break
                    
                    if user_found and parent_account_id:
                        # This is an ADDITIONAL USER login
                        user_data = user_found.to_dict()
                        stored_password = user_data.get('password')
                        
                        # Check if password is correct
                        if stored_password and check_password_hash(stored_password, password):
                            # Check if user is active
                            if not user_data.get('active', True):
                                flash('Your account has been deactivated. Please contact administrator.', 'error')
                                return render_template('login.html', form=form)
                            
                            # Check if parent account is active
                            parent_account_ref = db.collection('accounts').document(parent_account_id)
                            parent_account_data = parent_account_ref.get().to_dict()
                            
                            if not parent_account_data.get('active', True):
                                flash('The parent account has been deactivated. Please contact administrator.', 'error')
                                return render_template('login.html', form=form)
                            
                           
                            current_time = datetime.now()
                            user_ref = db.collection('accounts').document(parent_account_id).collection('users').document(email)
                            user_ref.update({
                                'lastLogin': current_time,
                                'updatedAt': current_time
                            })
                            
                            # Set session
                            session.permanent = True  
                            session['logged_in'] = True
                            session['email'] = email
                            session['account_id'] = parent_account_id
                            session['user_id'] = user_data.get('uid', email)
                            session['role'] = user_data.get('role', 'user')
                            session['is_owner'] = False  
                            session['full_name'] = user_data.get('fullName', '')
                            session['user_agent'] = request.headers.get('User-Agent', '')
                            session['login_time'] = time.time()
                            session.modified = True  
                            
                            print(f"Additional user {email} logged in successfully to account {parent_account_id}")
                            flash('Login successful!', 'success')
                            return redirect(url_for('stream'))
                        else:
                            print("Password mismatch for additional user")
                            flash('Invalid email or password', 'error')
                            return render_template('login.html', form=form)
                    
                    
                    print(f"No account or user found for email: {email}")
                    flash('Invalid email or password', 'error')
                            
                except Exception as e:
                    print(f"Firebase login error: {e}")
                    import traceback
                    print(f"Traceback: {traceback.format_exc()}")
                    flash('Login error. Please try again.', 'error')
            else:
                
                session.permanent = True
                session['logged_in'] = True
                session['email'] = email
                session['account_id'] = 'local-account'
                session['user_id'] = email
                session['role'] = 'admin'
                session['is_owner'] = True
                session['full_name'] = 'Local User'
                session['user_agent'] = request.headers.get('User-Agent', '')
                session['login_time'] = time.time()
                session.modified = True
                flash('Login successful!', 'success')
                return redirect(url_for('stream'))

        return render_template('login.html', form=form)
        
    @app.route('/signup', methods=['GET', 'POST'])
    def signup():
        if session.get('logged_in'):
            return redirect(url_for('stream'))
        
        form = SignupForm()
        if form.validate_on_submit():
            email = form.email.data.lower().strip()
            password = form.password.data.strip()
            fullName = form.fullName.data.strip()
            
            print(f"Attempting signup for: {email}, Name: {fullName}")
            
            if firebase_enabled:
                try:
                    
                    accounts_ref = db.collection('accounts')
                    existing_accounts_query = accounts_ref.where('email', '==', email).stream()
                    
                    existing_accounts = list(existing_accounts_query)
                    if existing_accounts:
                        print(f"Email already exists in {len(existing_accounts)} accounts")
                        flash('An account with this email already exists', 'error')
                        return render_template('signup.html', form=form)
                    
                    
                    current_time = datetime.now()
                    account_id = f"account-{uuid.uuid4().hex[:12]}"
                    
                    print(f"Creating new account with ID: {account_id}")
                    
                    
                    account_data = {
                        'accountName': fullName,
                        'email': email,
                        'password': generate_password_hash(password),  
                        'role': 'admin',  
                        'active': True,
                        'createdAt': current_time,
                        'updatedAt': current_time,
                        'lastLogin': current_time
                    }
                    
                    print(f"Account data: {account_data}")
                    
                    account_ref = db.collection('accounts').document(account_id)
                    account_ref.set(account_data)
                    print("Account document created")
                    
                   
                    account_check = account_ref.get()
                    
                    if account_check.exists:
                        print("Signup verification passed - account created successfully")
                        flash('Account created successfully! Please sign in.', 'success')
                        return redirect(url_for('login'))
                    else:
                        print("Signup verification failed - account not created")
                        flash('Error creating account. Please try again.', 'error')
                    
                except Exception as e:
                    print(f"Firebase signup error: {str(e)}")
                    import traceback
                    print(f"Full traceback: {traceback.format_exc()}")
                    flash('Error creating account. Please try again.', 'error')
            else:
                
                print("🔧 Local mode signup - no Firebase")
                flash('Account created successfully! Please sign in.', 'success')
                return redirect(url_for('login'))
        
        return render_template('signup.html', form=form)

    @app.route('/logout')
    def logout():
        """Handle user logout"""
        
        session.clear()
        session.permanent = False
        
        flash('You have been logged out successfully.', 'success')
        
        
        return redirect(url_for('home'))