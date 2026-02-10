import docker
import json
import os

OVERRIDES_FILE = 'docker_overrides.json'
# Auto-detect these apps
ARR_APPS = {
    "sonarr":       {"name": "Sonarr",       "icon": "sonarr",       "group": "Media"},
    "radarr":       {"name": "Radarr",       "icon": "radarr",       "group": "Media"},
    "lidarr":       {"name": "Lidarr",       "icon": "lidarr",       "group": "Media"},
    "readarr":      {"name": "Readarr",      "icon": "readarr",      "group": "Media"},
    "bazarr":       {"name": "Bazarr",       "icon": "bazarr",       "group": "Media"},
    "prowlarr":     {"name": "Prowlarr",     "icon": "prowlarr",     "group": "Media"},
    "plex":         {"name": "Plex",         "icon": "plex",         "group": "Media"},
    "jellyfin":     {"name": "Jellyfin",     "icon": "jellyfin",     "group": "Media"},
    "tautulli":     {"name": "Tautulli",     "icon": "tautulli",     "group": "Admin"},
    "portainer":    {"name": "Portainer",    "icon": "portainer",    "group": "Admin"},
    "transmission": {"name": "Transmission", "icon": "transmission", "group": "Downloads"},
    "qbittorrent":  {"name": "qBittorrent",  "icon": "qbittorrent",  "group": "Downloads"},
    "saber":        {"name": "Saber",        "icon": "notes",        "group": "Tools"},
    "open-webui":   {"name": "Open-Webui",   "icon": "ai",           "group": "Tools"},
    "n8n":          {"name": "N8N",          "icon": "n8n",          "group": "Tools"},
    "grafana":      {"name": "Grafana",      "icon": "grafana",      "group": "Tools"},
    "nginx":        {"name": "Nginx",        "icon": "nginx",        "group": "Admin"},
    "SearXNG":      {"name": "SearXNG",      "icon": "searchxng",       "group": "Tools"},
    "syncthing":    {"name": "Syncthing",    "icon": "syncthing",    "group": "Admin"},
    "affine":       {"name": "Affine",       "icon": "affine",       "group": "Tools"},
    "trillium":     {"name": "Trillium",     "icon": "trillium",     "group": "Tools"},
    "wiki.js":      {"name": "Wiki.js",      "icon": "wikijs",       "group": "Tools"},
    "joplin":       {"name": "Joplin",       "icon": "joplin",       "group": "Tools"},
    "excalidraw":   {"name": "Excalidraw",   "icon": "excalidraw",   "group": "Tools"},
    "drawio":        {"name": "Draw.io",      "icon": "drawio",       "group": "Tools"},
    "pihole":       {"name": "Pi-hole",      "icon": "pihole",       "group": "Admin"},
    "heimdall":    {"name": "Heimdall",     "icon": "heimdall",     "group": "Admin"},
    "homeassistant": {"name": "Home Assistant", "icon": "homeassistant", "group": "Home"},
    "python":      {"name": "Python App",   "icon": "python",       "group": "Other"},
    "docker":      {"name": "Docker App",   "icon": "docker",       "group": "Other"},
    "traefik":     {"name": "Traefik",      "icon": "traefik",      "group": 	"Admin"},
    "mysql":        {"name": "MySQL",         "icon": "mysql",         "group": "Database"},
    "postgresql":  {"name": "PostgreSQL",   "icon": "postgresql",   "group": "Database"},
    "mongodb":     {"name": "MongoDB",      "icon": "mongodb",      "group": "Database"},
    "elasticsearch": {"name": "Elasticsearch", "icon": "elasticsearch", "group": "Database"},
    "nextcloud":    {"name": "Nextcloud",     "icon": "nextcloud",     "group": "Admin"},
    "owncloud":     {"name": "OwnCloud",      "icon": "owncloud",      "group": "Admin"},
    "immich":       {"name": "Immich",        "icon": "immich",        "group": "Media"},
    "bitwarden":    {"name": "Bitwarden",     "icon": "bitwarden",     "group": "Admin"},
    "vaultwarden":  {"name": "Vaultwarden",   "icon": "vaultwarden",   "group": "Admin"},
    "caddy":        {"name": "Caddy",         "icon": "caddy",         "group": "Admin"},
    "tensorflow":     {"name": "TensorFlow",    "icon": "tensorflow",    "group": "AI"},
    "pytorch":       {"name": "PyTorch",       "icon": "pytorch",       "group": "AI"},
    "keras":         {"name": "Keras",         "icon": "keras",         "group": "AI"},
    "langchain":      {"name": "LangChain",      "icon": "langchain",      "group": "AI"},
    "confluence":      {"name": "Confluence",      "icon": "confluence",      "group": "Admin"},
    "context7":      {"name": "Context7",      "icon": "context7",      "group": "AI"},
    "FusionDash":   {"name": "FusionDash",    "icon": "fusiondash",    "group": "Admin"},
    "FusionHex-Assist":   {"name": "Fusion Assist",  "icon": "fusionassist",  "group": "Tools"},
    "FusionHex" :   {"name": "FusionHex",      "icon": "fusionhex",     "group": "Web"},
}

def load_overrides():
    if not os.path.exists(OVERRIDES_FILE):
        return {}
    try:
        with open(OVERRIDES_FILE, 'r') as f:
            return json.load(f)
    except:
        return {}

def detect_arr(container):
    if container.image and container.image.tags:
        image = container.image.tags[0].lower()
    else:
        image = ""
    name = container.name.lower()
    haystack = f"{name} {image}"
    for key, meta in ARR_APPS.items():
        if key in haystack:
            return meta
    return None

def select_web_port(ports):
    if not ports: return None
    preferences = ["80", "443", "8080", "8000", "9000", "3000"]
    for pref in preferences:
        if pref in ports: return pref
    return ports[0]

def build_entry(container, ports, labels, detected):
    host = "http://localhost"
    if labels.get("fusiondash.href"):
        href = labels["fusiondash.href"]
    elif ports:
        web_port = select_web_port(ports)
        href = f"{host}:{web_port}"
    else:
        href = ""

    if labels.get("fusiondash.name"):
        name = labels["fusiondash.name"]
    elif detected:
        name = detected["name"]
    else:
        name = container.name.replace("-", " ").title()

    desc = labels.get("fusiondash.description", "")

    if labels.get("fusiondash.icon"):
        icon = labels["fusiondash.icon"]
    elif detected:
        icon = detected["icon"]
    else:
        icon = "" 

    if labels.get("fusiondash.group"):
        group = labels["fusiondash.group"]
    elif detected:
        group = detected["group"]
    else:
        group = "Other"

    order = int(labels.get("fusiondash.order", 999))
    state = container.status 

    return {
        "id": container.id,
        "container": container.name,
        "name": name,
        "description": desc,
        "icon": icon,
        "group": group,
        "href": href,
        "ports": ports,
        "order": order,
        "source": "docker",
        "state": state,
        # Default empty, will be filled by overrides if they exist
        "apiKey": "",
        "widgetType": ""
    }

def scan_containers():
    try:
        client = docker.from_env()
    except Exception as e:
        print(f"Docker connection failed: {e}")
        return []

    overrides = load_overrides()
    results = []

    for c in client.containers.list(all=True):
        # Port Logic
        ports = c.attrs.get("NetworkSettings", {}).get("Ports", {})
        if not ports:
            ports = c.attrs.get("HostConfig", {}).get("PortBindings", {})

        published_ports = []
        if ports:
            for k, v in ports.items():
                if v and isinstance(v, list):
                    published_ports.append(v[0]["HostPort"])

        labels = c.labels or {}
        if labels.get("fusiondash.hidden") == "true":
            continue

        detected = detect_arr(c)
        entry = build_entry(c, published_ports, labels, detected)

        # --- APPLY OVERRIDES (FIXED) ---
        if entry['id'] in overrides:
            saved = overrides[entry['id']]
            if saved.get('name'): entry['name'] = saved['name']
            if saved.get('group'): entry['group'] = saved['group']
            if saved.get('icon'): entry['icon'] = saved['icon']
            if saved.get('description'): entry['description'] = saved['description']
            if saved.get('href'): entry['href'] = saved['href']
            
            # THE MISSING LINK:
            if saved.get('apiKey'): entry['apiKey'] = saved['apiKey']
            if saved.get('widgetType'): entry['widgetType'] = saved['widgetType']
        
        results.append(entry)

    return sorted(results, key=lambda x: x.get("order", 100))