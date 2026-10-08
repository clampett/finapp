from fastapi import FastAPI

app = FastAPI(title="Finapp Analytics & AI")


@app.get("/health")
def health():
    return {"status": "ok"}
    