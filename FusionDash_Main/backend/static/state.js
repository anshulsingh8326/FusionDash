const DEFAULT_UI_STATE = {
  theme: "dark",
  accent: "#7c7cff",
  background: "",
  layout: "grid",
};

export function loadUIState() {
  return JSON.parse(localStorage.getItem("fusiondash_ui")) || DEFAULT_UI_STATE;
}

export function saveUIState(state) {
  localStorage.setItem("fusiondash_ui", JSON.stringify(state));
}
