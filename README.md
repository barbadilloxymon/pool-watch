# Pool Watch Monitoring System

The Pool Watch Monitoring System is an AI-powered real-time CCTV surveillance solution that detects drowning and motion events in a swimming pool area using **YOLOv8**, **Flask**, **OpenCV**, **RTSP streaming**, and **Tailwind CSS** for the frontend design.

## Features

- Live CCTV RTSP stream with real-time drowning detection
- Drowning detection using YOLOv8
- Tailwind-based dashboard UI

## Tech Stack

- **Backend**: Python, Flask
- **Computer Vision**: YOLOv8, OpenCV
- **Frontend**: Tailwind CSS, JavaScript, Html
- **Streaming**: RTSP
- **Database**: (Firebase)

# Generate a strong secret key
python -c "import os; print(f'SECRET_KEY={os.urandom(24).hex()}')"

## How to Run

```bash
# Clone the repo
git clone https://github.com/your-username/pool-watch-main.git
cd pool-watch-main

# Create virtual environment and activate
python -m venv venv
.\venv\Scripts\activate  # For Windows

# Install dependencies
pip install -r requirements.txt

# Run Flask app
python app.py
