# Backend

This is the Python part that does the text hiding.

## How to run
```
pip install -r requirements.txt
python app/main.py
```

The server will start on http://localhost:8000

## Configuration

### Environment Variables

Create a `.env` file in the backend directory based on `.env.example`:

```bash
cp .env.example .env
```

#### CORS Configuration
The API uses specific allowed origins instead of wildcard (*) for security. Configure allowed origins using:

- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins
  - Example: `https://example.com,https://app.example.com`
  - Default: `http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001`

### Security Notes
- **CORS**: The API no longer allows all origins (*) by default. Only explicitly configured origins can access the API.
- **Environment-specific**: Configure different allowed origins for development, staging, and production environments.