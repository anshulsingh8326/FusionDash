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
OVERRIDES_FILE = "docker_overrides.json" # New file for overrides

app = FastAPI()

@app.post("/api/settings/reset")
def reset_settings():
    """Factory Reset: Deletes the settings file to restore defaults."""
    if DATA_FILE.exists():
        os.remove(DATA_FILE)
    if os.path.exists(OVERRIDES_FILE):
        os.remove(OVERRIDES_FILE)
    return {"status": "reset"}

# --- HELPER FUNCTIONS ---

def load_settings():
    # Load Main Settings
    defaults = {
        "manual": [], 
        "hidden": [], 
        "theme": {
            "wallpaper": "",
            "accent": "#007cff",
            "glass": 0.7
        }
    }
    data = defaults
    if DATA_FILE.exists():
        try:
            loaded = json.loads(DATA_FILE.read_text())
            for key, val in defaults.items():
                if key not in loaded:
                    loaded[key] = val
            data = loaded
        except: pass

    # Load Overrides (Separate File)
    overrides = {}
    if os.path.exists(OVERRIDES_FILE):
        try:
            with open(OVERRIDES_FILE, 'r') as f:
                overrides = json.load(f)
        except: pass
    
    data["overrides"] = overrides
    return data

def save_settings(data):
    # Split overrides back to their own file
    overrides = data.pop("overrides", {})
    
    DATA_FILE.write_text(json.dumps(data, indent=2))
    
    with open(OVERRIDES_FILE, 'w') as f:
        json.dump(overrides, f, indent=2)

def get_all_services(settings):
    """Combines Docker Scan + Manual Apps + Overrides"""
    final_list = []

    # 1. Docker Scan (Overrides are applied inside docker_scan now for better architecture)
    try:
        docker_apps = scan_containers()
    except Exception as e:
        print(f"Docker Scan Error: {e}")
        docker_apps = []

    for app in docker_apps:
        # SKIP if Globally Hidden
        if app["id"] in settings["hidden"]:
            continue
        # DEFAULT: Pinned to Board = True
        app["pinned"] = True
        final_list.append(app)

    # 2. Manual Apps
    for m_app in settings["manual"]:
        if m_app["id"] not in settings["hidden"]:
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
        # Docker App: Save to overrides by ID
        if id not in settings["overrides"]:
            settings["overrides"][id] = {}
        settings["overrides"][id].update(payload)

    save_settings(settings)
    return {"status": "ok"}

@app.post("/api/services/add_manual")
def add_manual(payload: dict = Body(...)):
    settings = load_settings()
    payload["id"] = f"manual_{len(settings['manual']) + 100}"
    payload["source"] = "manual"
    payload["pinned"] = True 
    if "group" not in payload or not payload["group"]:
        payload["group"] = "Unsorted"
        
    settings["manual"].append(payload)
    save_settings(settings)
    return {"status": "created"}

@app.post("/api/services/{id}/hide")
def hide_service(id: str):
    """Global Hide"""
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

# --- UTILS & INTEGRATIONS ---

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

# --- UPDATED: SMART ARR STATISTICS ---
@app.get("/api/integration/arr/queue")
def arr_queue(url: str, api_key: str):
    """
    Fetches Queue AND Library Counts (Radarr Movies, Sonarr Series, etc.)
    Works for Docker, Windows, Linux, and Web Apps.
    """
    # Initialize default structure
    stats = {
        "count": 0,           # Queue count (Active Downloads)
        "libraryCount": 0,    # Total Items (Movies/Series)
        "type": "Generic",    # App Type detected
        "status": "online"
    }

    if not url or not api_key:
        return stats

    headers = {"X-Api-Key": api_key}
    base_url = url.rstrip('/')

    try:
        # 1. GET QUEUE (Universal for all *Arr apps)
        q_resp = requests.get(f"{base_url}/api/v3/queue", headers=headers, timeout=2, verify=False)
        if q_resp.status_code == 200:
            stats["count"] = q_resp.json().get("totalRecords", 0)
        else:
            return stats # If queue fails, likely auth error or offline

        # 2. DETECT & COUNT LIBRARY
        # Try Radarr (Movies)
        try:
            # Short timeout, check for movies endpoint
            m_resp = requests.get(f"{base_url}/api/v3/movie", headers=headers, timeout=3, verify=False)
            if m_resp.status_code == 200:
                movies = m_resp.json()
                stats["libraryCount"] = len(movies)
                stats["type"] = "Movies"
                return stats
        except: pass

        # Try Sonarr (Series)
        try:
            s_resp = requests.get(f"{base_url}/api/v3/series", headers=headers, timeout=3, verify=False)
            if s_resp.status_code == 200:
                series = s_resp.json()
                stats["libraryCount"] = len(series)
                stats["type"] = "Series"
                return stats
        except: pass

        # Try Lidarr (Artists)
        try:
            l_resp = requests.get(f"{base_url}/api/v1/artist", headers=headers, timeout=3, verify=False)
            if l_resp.status_code == 200:
                artists = l_resp.json()
                stats["libraryCount"] = len(artists)
                stats["type"] = "Artists"
                return stats
        except: pass
        
    except Exception as e:
        print(f"Arr Integration Error: {e}")
        stats["status"] = "offline"

    return stats

app.mount("/", StaticFiles(directory=BASE_DIR / "static", html=True), name="static")