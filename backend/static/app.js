fetch("/api/services")
  .then(r => r.json())
  .then(services => {
    const grid = document.getElementById("grid");
    services.forEach(s => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerText = s.name;
      card.onclick = () =>
        window.open(`http://localhost:${s.port}`, "_blank");
      grid.appendChild(card);
    });
  });
