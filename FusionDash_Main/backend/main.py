import json
import requests
import docker
from fastapi import FastAPI, Body
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from docker_scan import scan_containers

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "user_settings.json"

app = FastAPI()

# --- Helper Functions ---

def load_settings():
    defaults = {
        "overrides": {}, 
        "manual": [], 
        "hidden": [], 
        "theme": {
            "wallpaper": "",
            "accent": "#007cff",
            "glass": 0.7
        }
    }
    if not DATA_FILE.exists():
        return defaults
    try:
        data = json.loads(DATA_FILE.read_text())
        # Ensure all default keys exist
        for key, val in defaults.items():
            if key not in data:
                data[key] = val
        return data
    except:
        return defaults

def save_settings(data):
    DATA_FILE.write_text(json.dumps(data, indent=2))

def get_all_services(settings):
    """Combines Docker Scan + Manual Apps + Overrides"""
    final_list = []

    # 1. Docker Scan
    try:
        docker_apps = scan_containers()
    except Exception as e:
        print(f"Docker Scan Error: {e}")
        docker_apps = []

    for app in docker_apps:
        # Skip hidden
        if app["id"] in settings["hidden"]:
            continue
            
        # Apply Overrides (Name, Group, Icon)
        if app["name"] in settings["overrides"]:
            app.update(settings["overrides"][app["name"]])
            
        final_list.append(app)

    # 2. Manual Apps
    for m_app in settings["manual"]:
        if m_app["id"] not in settings["hidden"]:
            final_list.append(m_app)

    return final_list

# --- API Endpoints ---

# NEW: The main endpoint for the V2 Dashboard
@app.get("/api/init")
def init_dashboard():
    settings = load_settings()
    services = get_all_services(settings)
    return {
        "services": services,
        "theme": settings["theme"]
    }

# RESTORED: The old endpoint (for debugging or old frontend code)
@app.get("/api/services")
def services_legacy():
    settings = load_settings()
    return get_all_services(settings)

@app.post("/api/services/{id}/update")
def update_service(id: str, payload: dict = Body(...)):
    settings = load_settings()
    
    # Check manual first
    is_manual = False
    for app in settings["manual"]:
        if app["id"] == id:
            app.update(payload)
            is_manual = True
            break
            
    if not is_manual:
        # Save to overrides using name as key
        settings["overrides"][payload["name"]] = payload

    save_settings(settings)
    return {"status": "ok"}

@app.post("/api/services/{id}/hide")
def hide_service(id: str):
    settings = load_settings()
    if id not in settings["hidden"]:
        settings["hidden"].append(id)
        save_settings(settings)
    return {"status": "hidden"}

@app.post("/api/settings/theme")
def update_theme(payload: dict = Body(...)):
    settings = load_settings()
    if "theme" not in settings: settings["theme"] = {}
    settings["theme"].update(payload)
    save_settings(settings)
    return {"status": "ok"}

# Status Ping (with SSL ignore and timeout)
@app.get("/api/status/ping")
def ping_service(url: str):
    try:
        resp = requests.get(url, timeout=2, verify=False)
        # Accept 401/403 as "Online" (Auth required = Server is up)
        if resp.status_code < 500:
            return {"status": "online", "code": resp.status_code}
        return {"status": "error", "code": resp.status_code}
    except:
        return {"status": "offline"}

# Arr Queue Proxy
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