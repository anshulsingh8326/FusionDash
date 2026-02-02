import json
import requests
import docker
from fastapi import FastAPI, Body
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from docker_scan import scan_containers  # Keep your existing scan logic

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "user_settings.json"

app = FastAPI()

# 1. Load User Settings (Overrides & Manual Apps)
def load_settings():
    if not DATA_FILE.exists():
        return {"overrides": {}, "manual": []}
    try:
        return json.loads(DATA_FILE.read_text())
    except:
        return {"overrides": {}, "manual": []}

def save_settings(data):
    DATA_FILE.write_text(json.dumps(data, indent=2))

@app.get("/api/services")
def services():
    settings = load_settings()
    
    # A. Get Docker Apps
    docker_apps = scan_containers()
    
    # B. Apply Overrides (Name, Icon, Group, etc. from JSON)
    final_list = []
    for app in docker_apps:
        # We match by Name because IDs change if you recreate containers
        app_id = app["name"] 
        if app_id in settings["overrides"]:
            # Merge dictionary (override overwrites scanned data)
            app.update(settings["overrides"][app_id])
        final_list.append(app)

    # C. Add Manual Apps
    final_list.extend(settings["manual"])
    
    return final_list

@app.post("/api/services/{id}/update")
def update_service(id: str, payload: dict = Body(...)):
    settings = load_settings()
    
    # Check if it's a Manual App
    is_manual = False
    for i, m_app in enumerate(settings["manual"]):
        if m_app["id"] == id:
            settings["manual"][i].update(payload)
            is_manual = True
            break
    
    # If not manual, it's a Docker app -> Save as an Override
    if not is_manual:
        # We use the 'name' from the payload or ID as the key
        target_name = payload.get("name") # Careful here, relying on name consistency
        # Better strategy: Use the ID passed in URL, but save to overrides
        settings["overrides"][payload["name"]] = payload

    save_settings(settings)
    return {"status": "saved"}

@app.post("/api/services/add_manual")
def add_manual(payload: dict = Body(...)):
    settings = load_settings()
    payload["id"] = f"manual_{len(settings['manual']) + 1}"
    payload["source"] = "manual"
    settings["manual"].append(payload)
    save_settings(settings)
    return {"status": "created"}

# 2. STATUS CHECK (The Fix for "Offline")
@app.get("/api/status/ping")
def ping_service(url: str):
    try:
        # Increased timeout to 3s because apps like Sonarr can be slow
        # verify=False ignores SSL warnings if you use https
        resp = requests.get(url, timeout=3, verify=False) 
        
        # If the status code is less than 500, the server is UP.
        # (200 = OK, 302 = Redirect, 401 = Password Required)
        if resp.status_code < 500:
            return {"status": "online", "code": resp.status_code}
            
        return {"status": "error", "code": resp.status_code}
    except Exception as e:
        # This is the only true "Offline" (Network error, connection refused)
        return {"status": "offline"}

# ... existing Arr Queue endpoint ...
@app.get("/api/integration/arr/queue")
def arr_queue(url: str, api_key: str):
    try:
        target = f"{url.rstrip('/')}/api/v3/queue"
        res = requests.get(target, headers={"X-Api-Key": api_key}, timeout=2)
        if res.status_code == 200:
            return {"count": res.json().get("totalRecords", 0)}
    except:
        pass
    return {"count": 0}

app.mount("/", StaticFiles(directory=BASE_DIR / "static", html=True), name="static")