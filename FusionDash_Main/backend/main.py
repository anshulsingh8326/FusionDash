import json
import requests
import docker
from fastapi import FastAPI, Body
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from docker_scan import scan_containers
import os

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "user_settings.json"

app = FastAPI()

@app.post("/api/settings/reset")
def reset_settings():
    """Factory Reset: Deletes the settings file to restore defaults."""
    if DATA_FILE.exists():
        os.remove(DATA_FILE)
    return {"status": "reset"}

# --- HELPER FUNCTIONS ---

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
        # SKIP if Globally Hidden (The "Uninstall" logic)
        if app["id"] in settings["hidden"]:
            continue
            
        # DEFAULT: Pinned to Board = True
        app["pinned"] = True

        # Apply Overrides (Name, Icon, PINNED status)
        if app["name"] in settings["overrides"]:
            app.update(settings["overrides"][app["name"]])
            
        final_list.append(app)

    # 2. Manual Apps
    for m_app in settings["manual"]:
        # SKIP if Globally Hidden
        if m_app["id"] not in settings["hidden"]:
            # Default manual apps to pinned if not specified
            if "pinned" not in m_app:
                m_app["pinned"] = True
            final_list.append(m_app)

    return final_list

# --- API ENDPOINTS ---

@app.get("/api/init")
def init_dashboard():
    settings = load_settings()
    services = get_all_services(settings)
    return {
        "services": services,
        "theme": settings["theme"]
    }

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
        # Docker App: Save to overrides
        # Ensure we have the name to use as key
        name = payload.get("name")
        if name:
            if name not in settings["overrides"]:
                settings["overrides"][name] = {}
            settings["overrides"][name].update(payload)

    save_settings(settings)
    return {"status": "ok"}

@app.post("/api/services/add_manual")
def add_manual(payload: dict = Body(...)):
    settings = load_settings()
    payload["id"] = f"manual_{len(settings['manual']) + 100}"
    payload["source"] = "manual"
    payload["pinned"] = True # Default new apps to pinned
    if "group" not in payload or not payload["group"]:
        payload["group"] = "Unsorted"
        
    settings["manual"].append(payload)
    save_settings(settings)
    return {"status": "created"}

@app.post("/api/services/{id}/hide")
def hide_service(id: str):
    """Global Hide (The 'Uninstall' logic)"""
    settings = load_settings()
    if id not in settings["hidden"]:
        settings["hidden"].append(id)
        save_settings(settings)
    return {"status": "hidden"}

@app.post("/api/settings/theme")
def update_theme(payload: dict = Body(...)):
    settings = load_settings()
    settings["theme"].update(payload)
    save_settings(settings)
    return {"status": "ok"}

# --- UTILS ---

@app.get("/api/status/ping")
def ping_service(url: str):
    if not url: return {"status": "offline"}
    try:
        resp = requests.get(url, timeout=2, verify=False)
        if resp.status_code < 500:
            return {"status": "online", "code": resp.status_code}
        return {"status": "error", "code": resp.status_code}
    except:
        return {"status": "offline"}

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