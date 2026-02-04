import docker

# Auto-detect these apps
ARR_APPS = {
    "sonarr":      {"name": "Sonarr",      "icon": "sonarr",      "group": "Media"},
    "radarr":      {"name": "Radarr",      "icon": "radarr",      "group": "Media"},
    "lidarr":      {"name": "Lidarr",      "icon": "lidarr",      "group": "Media"},
    "readarr":     {"name": "Readarr",     "icon": "readarr",     "group": "Media"},
    "bazarr":      {"name": "Bazarr",      "icon": "bazarr",      "group": "Media"},
    "prowlarr":    {"name": "Prowlarr",    "icon": "prowlarr",    "group": "Media"},
    "plex":        {"name": "Plex",        "icon": "plex",        "group": "Media"},
    "jellyfin":    {"name": "Jellyfin",    "icon": "jellyfin",    "group": "Media"},
    "tautulli":    {"name": "Tautulli",    "icon": "tautulli",    "group": "Admin"},
    "portainer":   {"name": "Portainer",   "icon": "portainer",   "group": "Admin"},
    "transmission":{"name": "Transmission","icon": "transmission","group":"Downloads"},
    "qbittorrent": {"name": "qBittorrent", "icon": "qbittorrent", "group":"Downloads"},
    "saber":       {"name": "Saber",       "icon": "notes",       "group": "Tools"},
}

def detect_arr(container):
    # Check by Image Name first
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

def scan_containers():
    try:
        client = docker.from_env()
    except Exception as e:
        print(f"Docker connection failed: {e}")
        return []

    results = []

    # CHANGE: all=True fetches stopped/exited containers too
    for c in client.containers.list(all=True):
        # Get Ports
        ports = c.attrs.get("NetworkSettings", {}).get("Ports", {})
        published_ports = []
        if ports:
            for k, v in ports.items():
                if v and isinstance(v, list):
                    # v is [{'HostIp': '0.0.0.0', 'HostPort': '8080'}]
                    published_ports.append(v[0]["HostPort"])

        labels = c.labels or {}

        # 1. Skip if explicitly hidden via label
        if labels.get("fusiondash.hidden") == "true":
            continue

        # 2. Check if it's a known app
        detected = detect_arr(c)

        # 3. Determine Group & Name
        results.append(build_entry(
            container=c,
            ports=published_ports,
            labels=labels,
            detected=detected
        ))

    return sorted(results, key=lambda x: x.get("order", 100))

def select_web_port(ports):
    if not ports: return None
    # Prefer common web ports
    preferences = ["80", "443", "8080", "8000", "9000", "3000"]
    for pref in preferences:
        if pref in ports: return pref
    # Otherwise just take the first one
    return ports[0]

def build_entry(container, ports, labels, detected):
    host = "http://localhost"

    # URL Logic
    if labels.get("fusiondash.href"):
        href = labels["fusiondash.href"]
    elif ports:
        web_port = select_web_port(ports)
        href = f"{host}:{web_port}"
    else:
        href = "" # No ports exposed

    # Name Logic
    if labels.get("fusiondash.name"):
        name = labels["fusiondash.name"]
    elif detected:
        name = detected["name"]
    else:
        # Capitalize container name
        name = container.name.replace("-", " ").title()

    # Icon Logic
    if labels.get("fusiondash.icon"):
        icon = labels["fusiondash.icon"]
    elif detected:
        icon = detected["icon"]
    else:
        icon = "" 

    # Group Logic
    if labels.get("fusiondash.group"):
        group = labels["fusiondash.group"]
    elif detected:
        group = detected["group"]
    else:
        group = "Other"

    order = int(labels.get("fusiondash.order", 999))
    
    # State Logic
    state = container.status # 'running', 'exited', 'created'

    return {
        "id": container.id,
        "container": container.name,
        "name": name,
        "icon": icon,
        "group": group,
        "href": href,
        "ports": ports,
        "order": order,
        "source": "docker",
        "state": state # Pass exact state to frontend
    }