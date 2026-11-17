# TheoryLens

## Deploy to Render

This repository includes a Render Blueprint for the Next.js frontend and FastAPI backend.

1. Push the repository, including `render.yaml`, to GitHub.
2. In Render, choose **New → Blueprint** and connect this repository.
3. Review the two free web services and deploy them.

The frontend proxies `/api/*` requests to the backend, so no browser CORS setting is
needed for the hosted app. The backend uses preset demos unless an `NVIDIA_API_KEY`
is added to its environment variables in Render.