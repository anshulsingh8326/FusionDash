import docker

ARR_APPS = {
    "sonarr":  {"name": "Sonarr",  "icon": "sonarr",  "group": "media"},
    "radarr":  {"name": "Radarr",  "icon": "radarr",  "group": "media"},
    "lidarr":  {"name": "Lidarr",  "icon": "lidarr",  "group": "media"},
    "readarr": {"name": "Readarr", "icon": "readarr", "group": "media"},
    "bazarr":  {"name": "Bazarr",  "icon": "bazarr",  "group": "media"},
    "prowlarr":{"name": "Prowlarr","icon": "prowlarr","group": "media"},
}


def detect_arr(container):
    name = container.name.lower()
    image = container.image.tags[0].lower() if container.image.tags else ""

    haystack = f"{name} {image}"

    for key, meta in ARR_APPS.items():
        if key in haystack:
            return meta

    return None


def scan_containers():
    client = docker.from_env()
    results = []

    for c in client.containers.list():
        ports = c.attrs.get("NetworkSettings", {}).get("Ports", {})
        published_ports = [
            v[0]["HostPort"]
            for v in ports.values()
            if v and isinstance(v, list)
        ]

        if not published_ports:
            continue

        labels = c.labels or {}

        # Optional hide flag (always respected)
        if labels.get("fusiondash.hidden") == "true":
            continue

        detected = detect_arr(c)

        # Inclusion rules
        enabled = labels.get("fusiondash.enable") == "true"
        if not enabled and not detected:
            continue

        results.append(build_entry(
            container=c,
            ports=published_ports,
            labels=labels,
            detected=detected,
            source="label" if enabled else "arr"
        ))

    return sorted(results, key=lambda x: x.get("order", 100))

def update_container_labels(container_id: str, updates: dict):
    client = docker.from_env()
    container = client.containers.get(container_id)

    labels = container.labels or {}

    mapping = {
        "name": "fusiondash.name",
        "icon": "fusiondash.icon",
        "group": "fusiondash.group",
        "order": "fusiondash.order",
        "href": "fusiondash.href",
        "enabled": "fusiondash.enable",
        "hidden": "fusiondash.hidden",
    }

    for key, label_key in mapping.items():
        if key in updates:
            labels[label_key] = str(updates[key])

    container.update(labels=labels)


def select_web_port(ports):
    # Prefer common web UI ports
    for p in ports:
        if p.startswith(("80", "90", "30")):
            return p
    return ports[0]


def build_entry(container, ports, labels, detected, source):
    host = "http://localhost"

    if labels.get("fusiondash.href"):
        href = labels["fusiondash.href"]
    else:
        web_port = select_web_port(ports)
        href = f"{host}:{web_port}"

    name = (
        labels.get("fusiondash.name")
        or (detected["name"] if detected else container.name)
    )

    icon = (
        labels.get("fusiondash.icon")
        or (detected["icon"] if detected else "generic")
    )

    group = (
        labels.get("fusiondash.group")
        or (detected["group"] if detected else "custom")
    )

    order = int(labels.get("fusiondash.order", 100))
    stack = labels.get("fusiondash.stack")

    return {
        "id": container.id,
        "container": container.name,
        "name": name,
        "icon": icon,
        "group": group,
        "href": href,
        "ports": ports,
        "order": order,
        "stack": stack,
        "source": source,
    }


