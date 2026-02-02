import docker

def list_web_containers():
    client = docker.from_env()
    containers = client.containers.list()
    services = []

    for c in containers:
        ports = c.attrs["NetworkSettings"]["Ports"]
        if not ports:
            continue

        for _, mappings in ports.items():
            if mappings:
                services.append({
                    "id": c.id,
                    "name": c.name,
                    "image": c.image.tags[0] if c.image.tags else "",
                    "port": mappings[0]["HostPort"]
                })
                break

    return services
