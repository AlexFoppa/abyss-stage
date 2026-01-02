from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from jose import jwt
import time

API_KEY = "lk_dev_1234567890"
API_SECRET = "PASTE_64_HEX_SECRET_HERE"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/token")
def token(room: str, user: str):
    payload = {
        "iss": API_KEY,
        "sub": user,
        "nbf": int(time.time()),
        "exp": int(time.time()) + 3600,
        "video": {"roomJoin": True, "room": room},
    }
    return {"token": jwt.encode(payload, API_SECRET, algorithm="HS256")}
