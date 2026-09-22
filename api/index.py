from backend.app.main import app
from backend.app.reprocess import router as reprocess_router

app.include_router(reprocess_router)

# Vercel's Python runtime discovers this FastAPI ASGI application.
