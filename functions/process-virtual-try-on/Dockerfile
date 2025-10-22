# Use a lean base image for Python
FROM python:3.11-slim

# Set the working directory inside the container
WORKDIR /app

# Copy and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy your application code (app.py, utilities.py, get_secret.py, etc.)
COPY . .

# Set the PORT environment variable (Cloud Run injects this, but it's good practice)
ENV PORT 8080
EXPOSE ${PORT}

# This command executes Gunicorn, binding it to the required address (0.0.0.0:8080)
# This solves the "failed to start and listen" error.
# It runs the 'app' object inside your 'app.py' file.
CMD exec gunicorn --bind 0.0.0.0:${PORT} --workers 2 app:app