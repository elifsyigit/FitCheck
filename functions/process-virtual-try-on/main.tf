terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
  }
}

provider "google" {
  project = "fitcheck-475119"
  region  = "europe-west1"
}

resource "google_cloud_run_service" "virtual_try_on" {
  name     = "process-virtual-try-on"
  location = "europe-west1"

  template {
    spec {
      containers {
        image = "gcr.io/fitcheck-475119/process-virtual-try-on:latest"
        
        resources {
          limits = {
            cpu    = "2"
            memory = "2Gi"
          }
        }
        
        env {
          name  = "PORT"
          value = "8080"
        }
      }
      
      timeout_seconds = 900
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }
}

resource "google_cloud_run_service_iam_member" "noauth" {
  service  = google_cloud_run_service.virtual_try_on.name
  location = google_cloud_run_service.virtual_try_on.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
