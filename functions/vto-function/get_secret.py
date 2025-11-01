#git.ignore
from google.cloud import secretmanager

def get_secret_value(project_id: str, secret_id: str, version_id: str = "latest") -> str:
    """
    Retrieves the secret value from Google Secret Manager.
    
    Args:
        project_id: The ID of the Google Cloud project.
        secret_id: The ID (name) of the secret.
        version_id: The secret version to access (e.g., 'latest' or '1').

    Returns:
        The decoded secret payload as a string.
    """
    client = secretmanager.SecretManagerServiceClient()

    name = client.secret_version_path(project_id, secret_id, version_id) #'projects/{project_id}/secrets/{secret_id}/versions/{version_id}'

    try:
        response = client.access_secret_version(request={"name": name})
        secret_value = response.payload.data.decode("UTF-8")
        return secret_value
    except Exception as e:
        print(f"Error accessing secret: {e}")
        return None

YOUR_PROJECT_ID = "fitcheck-475119" 
YOUR_SECRET_ID = "GEMINI_API_KEY_FITCHECK"  
VERSION_ID = "latest"
