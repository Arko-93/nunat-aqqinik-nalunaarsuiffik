export async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.json();
}

export function setStatus(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("error", isError);
}

export function municipalityName(place) {
  const memberships = place.administrative_memberships || [];
  const municipality = memberships.find((row) => row.level === "municipality");
  return municipality ? municipality.name : "—";
}

export function formatCoords(place) {
  const coordinates = place.coordinates;
  if (!coordinates) return "—";
  return `${coordinates.latitude}, ${coordinates.longitude}`;
}

export function badgeClass(status) {
  const known = new Set([
    "candidate",
    "candidate_exact_name",
    "waiting",
    "waiting_for_export",
    "unresolved",
    "matched",
    "conflicting",
    "missing",
  ]);
  if (status === "candidate_exact_name") return "candidate";
  if (status === "waiting_for_export") return "waiting";
  return known.has(status) ? status : "unresolved";
}
