from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://ledger:ledger@db:5432/ledger"
    cors_origins: str = "http://localhost:5173"
    secret_key_path: str = "/data/secret.key"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
