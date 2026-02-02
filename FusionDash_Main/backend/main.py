from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from docker_scan import list_web_containers

app = FastAPI()

@app.get("/api/services")
def services():
    return list_web_containers()

app.mount("/", StaticFiles(directory="static", html=True), name="static")
