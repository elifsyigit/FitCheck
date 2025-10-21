# Use the official Python runtime as a parent image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

# Set the working directory in the container
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the current directory contents into the container at /app
COPY . .

# Make port 8080 available to the world outside this container
EXPOSE 8080

# Define environment variable
ENV NAME World

# Run the application using Functions Framework
CMD exec functions-framework --target=process_virtual_try_on --source=main.py --port=$PORT
