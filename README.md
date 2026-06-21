<<<<<<< Updated upstream
# taxi-booking-system
A full-stack taxi booking system featuring a FastAPI backend for fare quoting, booking management, and admin email notifications, paired with a React.js frontend for a seamless user experience. Includes Docker support for easy deployment
=======
# Taxi Booking System

## Description
A full-stack taxi booking system featuring a FastAPI backend for fare quoting, booking management, and admin email notifications, paired with a React.js frontend for a seamless user experience. Includes Docker support for easy deployment to platforms like Google Cloud Run.

## Features
*   **Fare Quoting**: Calculates fixed-price taxi fares based on distance, passengers, and vehicle type.
*   **Booking Management**: Allows users to create and cancel bookings.
*   **Child Seat Surcharge**: Automatically adds a 5 EUR surcharge if "child seat" is requested in booking notes.
*   **Admin Email Notifications**: Sends detailed email alerts to administrators upon new bookings.
*   **Pydantic Models**: Robust data validation and serialization for API requests and responses.
*   **React Frontend**: Modern, interactive user interface for booking taxis.
*   **Dockerized Deployment**: Multi-stage Dockerfile for efficient building and deployment of both frontend and backend.

## Technologies Used
### Backend
*   **Python 3.12+**
*   **FastAPI**: Web framework for building APIs.
*   **Pydantic**: Data validation and settings management.
*   **Uvicorn**: ASGI server for running FastAPI.
*   **python-dotenv**: For loading environment variables.
*   **smtplib**: For sending email notifications.

### Frontend
*   **React 19**: JavaScript library for building user interfaces.
*   **Vite**: Fast frontend build tool.
*   **npm**: Package manager for JavaScript.

### Deployment
*   **Docker**: Containerization for consistent environments.
*   **Google Cloud Run**: Serverless platform for deploying containerized applications.

## Getting Started

### Prerequisites
*   Python 3.12+
*   Node.js and npm
*   Git
*   Docker (optional, for containerized development/deployment)

### 1. Clone the Repository
```bash
git clone https://github.com/YOUR_USERNAME/taxi-booking-system.git
cd taxi-booking-system
```

### 2. Backend Setup
1.  **Create a Python Virtual Environment**:
    ```bash
    python -m venv .venv
    source .venv/Scripts/activate # On Windows
    # source .venv/bin/activate # On macOS/Linux
    ```
2.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```
3.  **Environment Variables**:
    Create a `.env` file in the project root (`taxi_booking_system/.env`) with your email configuration:
    ```
    ADMIN_EMAIL="your-admin-email@example.com"
    SMTP_SERVER="smtp.gmail.com"
    SMTP_PORT="587"
    SMTP_USERNAME="your-gmail-username@gmail.com"
    SMTP_PASSWORD="your-app-password" # Use an App Password for Gmail
    ```
    *Note: For Gmail, you'll need to generate an App Password if you have 2-Factor Authentication enabled.*

### 3. Frontend Setup
1.  **Navigate to the Frontend Directory**:
    ```bash
    cd frontend
    ```
2.  **Install Node.js Dependencies**:
    ```bash
    npm install
    ```
3.  **Build the Frontend for Production**:
    ```bash
    npm run build
    ```
    This will create the `dist` folder which the FastAPI backend serves.

## Running the Application Locally

### 1. Start the Backend (from the project root)
```bash
# Make sure your virtual environment is active
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
The backend will serve the React frontend from `frontend/dist`.

### 2. Access the Application
Open your web browser and go to:
*   **Frontend**: `http://localhost:8000`
*   **API Documentation (Swagger UI)**: `http://localhost:8000/docs`
*   **API Documentation (ReDoc)**: `http://localhost:8000/redoc`

## Docker Deployment

### 1. Build the Docker Image
From the project root, build the Docker image:
```bash
docker build -t taxi-booking-system .
```

### 2. Run the Docker Container
Run the container, exposing port 8000 and passing your environment variables:
```bash
docker run -p 8000:8000 \
  --env-file .env \
  taxi-booking-system
```
Access the application at `http://localhost:8000`.

### 3. Deploy to Google Cloud Run
1.  **Authenticate Docker to GCP**:
    ```bash
    gcloud auth configure-docker us-central1-docker.pkg.dev
    ```
2.  **Tag your image**: (Replace `YOUR_PROJECT_ID` with your GCP Project ID)
    ```bash
    docker tag taxi-booking-system us-central1-docker.pkg.dev/YOUR_PROJECT_ID/taxi-repo/taxi-app:v1
    ```
3.  **Push the image to Artifact Registry**:
    ```bash
    docker push us-central1-docker.pkg.dev/YOUR_PROJECT_ID/taxi-repo/taxi-app:v1
    ```
4.  **Deploy to Cloud Run**: (Replace `YOUR_PROJECT_ID` and environment variables)
    ```bash
    gcloud run deploy taxi-service \
        --image us-central1-docker.pkg.dev/YOUR_PROJECT_ID/taxi-repo/taxi-app:v1 \
        --platform managed \
        --region us-central1 \
        --allow-unauthenticated \
        --set-env-vars="ADMIN_EMAIL=your-email@example.com,SMTP_SERVER=smtp.gmail.com,SMTP_USERNAME=your-user,SMTP_PASSWORD=your-app-password" \
        --port 8000 # Specify the port your app listens on
    ```
    Cloud Run will provide a URL for your deployed service.

## Contributing
Contributions are welcome! Please feel free to open issues or submit pull requests.

## License
This project is licensed under the MIT License.
>>>>>>> Stashed changes
