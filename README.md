# TheoryLens

## Deploy to Render

This repository includes a Render Blueprint for the Next.js frontend and FastAPI backend.

1. Push the repository, including `render.yaml`, to GitHub.
2. In Render, choose **New → Blueprint** and connect this repository.
3. Review the two free web services and deploy them.

The frontend is configured to call the backend's public Render URL, and the backend
allows the hosted frontend's origin. The backend uses preset demos unless an
`NVIDIA_API_KEY` is added to its environment variables in Render.