from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, BooleanField, SubmitField
from wtforms.validators import DataRequired, Email, Length, EqualTo, ValidationError
import re

class LoginForm(FlaskForm):
    email = StringField('Email', validators=[DataRequired(), Email()])
    password = PasswordField('Password', validators=[DataRequired()])
    submit = SubmitField('Sign In')

class SignupForm(FlaskForm):
    fullName = StringField('Full Name', validators=[DataRequired(), Length(min=2, max=100)])
    email = StringField('Email', validators=[DataRequired(), Email()])
    password = PasswordField('Password', validators=[
        DataRequired(),
        Length(min=8, message='Password must be at least 8 characters long')
    ])
    confirmPassword = PasswordField('Confirm Password', validators=[
        DataRequired(),
        EqualTo('password', message='Passwords must match')
    ])
    terms = BooleanField('I agree to the Terms and Policies', validators=[DataRequired()])
    submit = SubmitField('Create Account')

    def validate_password(self, field):
        """
        Validate password meets ALL of the following requirements:
        - Minimum of 8 characters
        - At least 1 uppercase letter (A-Z)
        - At least 1 lowercase letter (a-z)
        - At least 1 number (0-9)
        - At least 1 special character (!@#$%^&*)
        """
        password = field.data
        errors = []
        
        # Check minimum length
        if len(password) < 8:
            errors.append('at least 8 characters')
        
        # Check for uppercase letter
        if not re.search(r'[A-Z]', password):
            errors.append('at least 1 uppercase letter (A-Z)')
        
        # Check for lowercase letter
        if not re.search(r'[a-z]', password):
            errors.append('at least 1 lowercase letter (a-z)')
        
        # Check for number
        if not re.search(r'[0-9]', password):
            errors.append('at least 1 number (0-9)')
        
        # Check for special character
        if not re.search(r'[!@#$%^&*]', password):
            errors.append('at least 1 special character (!@#$%^&*)')
        
        # Raise validation error if any requirements are not met
        if errors:
            if len(errors) == 1:
                raise ValidationError(f'Password must contain {errors[0]}.')
            else:
                requirements = ', '.join(errors[:-1]) + f', and {errors[-1]}'
                raise ValidationError(f'Password must contain {requirements}.')