const AVAILABLE_CITIES = [
  { name: "Sofia", tz: "Europe/Sofia", query: "Sofia, Bulgaria" },
  { name: "Paris", tz: "Europe/Paris", query: "Paris, France" },
  { name: "Athens", tz: "Europe/Athens", query: "Athens, Greece" },
  { name: "Tunis", tz: "Africa/Tunis", query: "Tunis, Tunisia" },
  { name: "London", tz: "Europe/London", query: "London, United Kingdom" },
  { name: "New York", tz: "America/New_York", query: "New York, United States" },
  { name: "Geneva", tz: "Europe/Zurich", query: "Geneva, Switzerland" },
  { name: "New Delhi", tz: "Asia/Kolkata", query: "New Delhi, India" },
  { name: "Tokyo", tz: "Asia/Tokyo", query: "Tokyo, Japan" },
  { name: "Dubai", tz: "Asia/Dubai", query: "Dubai, United Arab Emirates" },
  { name: "Casablanca", tz: "Africa/Casablanca", query: "Casablanca, Morocco" },
  { name: "Algiers", tz: "Africa/Algiers", query: "Algiers, Algeria" },
  { name: "Rome", tz: "Europe/Rome", query: "Rome, Italy" },
  { name: "Berlin", tz: "Europe/Berlin", query: "Berlin, Germany" },
  { name: "Madrid", tz: "Europe/Madrid", query: "Madrid, Spain" },
  { name: "Istanbul", tz: "Europe/Istanbul", query: "Istanbul, Turkey" },
  { name: "Cairo", tz: "Africa/Cairo", query: "Cairo, Egypt" },
  { name: "Riyadh", tz: "Asia/Riyadh", query: "Riyadh, Saudi Arabia" },
  { name: "Montreal", tz: "America/Toronto", query: "Montreal, Canada" },
  { name: "Los Angeles", tz: "America/Los_Angeles", query: "Los Angeles, United States" },
];

const WEATHER_CACHE = new Map(); // key: cityName -> { data, fetchedAt }
const WEATHER_TTL_MS = 10 * 60 * 1000;

const PRAYER_CACHE = new Map(); // key: yyyy-mm-dd -> { timings, fetchedAt }
const PRAYER_TTL_MS = 12 * 60 * 60 * 1000;

function $(root, selector) {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}

function formatClock(now, timeZone) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(now);
}

function formatDate(now, timeZone) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone,
  }).format(now);
}

function formatUpdated(tsMs) {
  if (!tsMs) return "—";
  const d = new Date(tsMs);
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function setStatus(message) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = message || "";
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function safeText(v, fallback = "—") {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s.length ? s : fallback;
}

function yyyyMmDdInTz(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function fetchTunisPrayerTimes(yyyyMmDd) {
  const cached = PRAYER_CACHE.get(yyyyMmDd);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < PRAYER_TTL_MS) return cached.timings;

  // AlAdhan API (no key): timings by city
  const url =
    "https://api.aladhan.com/v1/timingsByCity/" +
    encodeURIComponent(yyyyMmDd) +
    "?" +
    new URLSearchParams({
      city: "Tunis",
      country: "Tunisia",
      method: "3", // Muslim World League
    }).toString();

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Prayer times failed (${res.status})`);
  const json = await res.json();
  const t = json?.data?.timings;
  if (!t) throw new Error("Prayer times missing timings");

  const timings = {
    Fajr: t.Fajr,
    Dhuhr: t.Dhuhr,
    Asr: t.Asr,
    Maghrib: t.Maghrib,
    Isha: t.Isha,
  };

  PRAYER_CACHE.set(yyyyMmDd, { timings, fetchedAt: now });
  return timings;
}

async function renderTunisPrayerTimes() {
  const tunisCard = document.querySelector('.card[data-city="Tunis"]');
  if (!tunisCard) return;

  const tz = tunisCard.getAttribute("data-tz") || "Africa/Tunis";
  const today = yyyyMmDdInTz(new Date(), tz);

  try {
    const timings = await fetchTunisPrayerTimes(today);
    const set = (role, value) => {
      const el = tunisCard.querySelector(`[data-role="${role}"]`);
      if (el) el.textContent = safeText(value, "—");
    };
    set("p-fajr", timings.Fajr);
    set("p-dhuhr", timings.Dhuhr);
    set("p-asr", timings.Asr);
    set("p-maghrib", timings.Maghrib);
    set("p-isha", timings.Isha);
  } catch (e) {
    console.error(e);
  }
}

function weatherCodeToText(code) {
  const c = Number(code);
  if (Number.isNaN(c)) return "Unknown";
  // Open-Meteo weather codes:
  // https://open-meteo.com/en/docs#weathervariables
  if (c === 0) return "Clear";
  if (c === 1) return "Mostly clear";
  if (c === 2) return "Partly cloudy";
  if (c === 3) return "Overcast";
  if ([45, 48].includes(c)) return "Fog";
  if ([51, 53, 55].includes(c)) return "Drizzle";
  if ([56, 57].includes(c)) return "Freezing drizzle";
  if ([61, 63, 65].includes(c)) return "Rain";
  if ([66, 67].includes(c)) return "Freezing rain";
  if ([71, 73, 75].includes(c)) return "Snow";
  if (c === 77) return "Snow grains";
  if ([80, 81, 82].includes(c)) return "Rain showers";
  if ([85, 86].includes(c)) return "Snow showers";
  if (c === 95) return "Thunderstorm";
  if ([96, 99].includes(c)) return "Thunderstorm (hail)";
  return "Unknown";
}

function iconForWeather(code, windKmh) {
  const c = Number(code);
  const w = Number(windKmh);

  const isWindy = !Number.isNaN(w) && w >= 28; // ~ strong breeze
  const isRainy =
    [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(c);
  const isSnowy = [71, 73, 75, 77, 85, 86].includes(c);
  const isStorm = [95, 96, 99].includes(c);
  const isFog = [45, 48].includes(c);
  const isCloudy = [1, 2, 3].includes(c);
  const isClear = c === 0;

  // Use emoji so it's colored on most OS/browsers.
  if (isStorm) return "⛈️";
  if (isSnowy) return "❄️";
  if (isRainy) return "🌧️";
  if (isFog) return "🌫️";
  if (isWindy && !isClear) return "💨";
  if (isCloudy) return "☁️";
  if (isClear) return "☀️";
  return "☁️";
}

// (SVG icon set removed in favor of emoji icons.)

async function geocodeCity(query) {
  const url =
    "https://geocoding-api.open-meteo.com/v1/search?" +
    new URLSearchParams({
      name: query,
      count: "1",
      language: "en",
      format: "json",
    }).toString();

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const json = await res.json();
  const r = json?.results?.[0];
  if (!r) throw new Error(`No geocoding result for "${query}"`);
  return { latitude: r.latitude, longitude: r.longitude };
}

async function fetchWeather({ latitude, longitude }) {
  const url =
    "https://api.open-meteo.com/v1/forecast?" +
    new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current_weather: "true",
      hourly: "relative_humidity_2m",
      forecast_days: "1",
      timezone: "auto",
    }).toString();

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Weather failed (${res.status})`);
  return await res.json();
}

function pickHumidity(json) {
  const times = json?.hourly?.time;
  const hum = json?.hourly?.relative_humidity_2m;
  if (!Array.isArray(times) || !Array.isArray(hum) || !times.length) return null;

  const nowIso = json?.current_weather?.time;
  if (!nowIso) return hum[0] ?? null;

  const idx = times.indexOf(nowIso);
  if (idx >= 0) return hum[idx] ?? null;

  // fallback: nearest hour by string compare, within a small range
  const target = nowIso.slice(0, 13);
  const approxIdx = times.findIndex((t) => t.startsWith(target));
  return approxIdx >= 0 ? hum[approxIdx] ?? null : hum[0] ?? null;
}

async function loadCityWeather(city) {
  const cached = WEATHER_CACHE.get(city.name);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < WEATHER_TTL_MS) return cached;

  const coords = await geocodeCity(city.query);
  const json = await fetchWeather(coords);

  const current = json?.current_weather;
  const humidity = pickHumidity(json);

  const data = {
    tempC: current?.temperature ?? null,
    windKmh: current?.windspeed ?? null,
    weatherCode: current?.weathercode ?? null,
    isDay: current?.is_day ?? null,
    humidity: humidity,
    fetchedAt: now,
  };

  const out = { data, fetchedAt: now };
  WEATHER_CACHE.set(city.name, out);
  return out;
}

function renderCityTime(card, timeZone) {
  const now = new Date();
  $(card, '[data-role="time"]').textContent = formatClock(now, timeZone);
  $(card, '[data-role="date"]').textContent = formatDate(now, timeZone);
}

function renderWeather(card, cityName, payload) {
  const d = payload?.data;
  const temp = d?.tempC;
  const wind = d?.windKmh;
  const humidity = d?.humidity;
  const code = d?.weatherCode;

  $(card, '[data-role="temp"]').textContent =
    temp === null || temp === undefined
      ? "—"
      : `${Math.round(clamp(temp, -80, 80))}°C`;

  $(card, '[data-role="wind"]').textContent =
    wind === null || wind === undefined ? "—" : `${Math.round(wind)} km/h`;

  $(card, '[data-role="humidity"]').textContent =
    humidity === null || humidity === undefined ? "—" : `${Math.round(humidity)}%`;

  const desc = weatherCodeToText(code);
  $(card, '[data-role="desc"]').textContent = safeText(desc, "Unknown");
  $(card, '[data-role="icon"]').textContent = iconForWeather(code, wind);

  $(card, '[data-role="updated"]').textContent = `Updated ${formatUpdated(
    payload?.fetchedAt
  )}`;

  setStatus(`Last refresh: ${formatUpdated(Date.now())}`);
}

function renderWeatherError(card, err) {
  $(card, '[data-role="desc"]').textContent = "Weather unavailable";
  $(card, '[data-role="icon"]').textContent = "☁️";
  $(card, '[data-role="updated"]').textContent = "—";
  console.error(err);
}

function getCards() {
  return Array.from(document.querySelectorAll(".card"));
}

function cardCity(card) {
  const name = card.getAttribute("data-city");
  const tz = card.getAttribute("data-tz");
  if (!name || !tz) throw new Error("Card missing data-city or data-tz");
  return { name, tz };
}

function getCityMap() {
  return new Map(AVAILABLE_CITIES.map((c) => [c.name, c]));
}

async function refreshWeatherForCard(card) {
  const { name } = cardCity(card);
  const city = getCityMap().get(name);
  if (!city) {
    renderWeatherError(card, new Error(`Unknown city: ${name}`));
    return;
  }
  try {
    const payload = await loadCityWeather(city);
    renderWeather(card, name, payload);
  } catch (e) {
    renderWeatherError(card, e);
  }
}

async function refreshAllWeather() {
  const cards = getCards();
  await Promise.all(cards.map((card) => refreshWeatherForCard(card)));
}

function fillCitySelect(selectEl) {
  const frag = document.createDocumentFragment();
  for (const c of AVAILABLE_CITIES) {
    const opt = document.createElement("option");
    opt.value = c.name;
    opt.textContent = c.name;
    frag.appendChild(opt);
  }
  selectEl.replaceChildren(frag);
}

function setupCustomCards() {
  const cityMap = getCityMap();
  const customCards = Array.from(document.querySelectorAll(".card--custom"));

  for (const card of customCards) {
    const customId = card.getAttribute("data-custom") || "x";
    const storageKey = `tw.custom.${customId}.city`;

    const selectEl = card.querySelector('[data-role="city-select"]');
    const titleEl = card.querySelector('[data-role="title"]');
    if (!(selectEl instanceof HTMLSelectElement) || !titleEl) continue;

    fillCitySelect(selectEl);

    const fallback = card.getAttribute("data-city") || "London";
    const saved = localStorage.getItem(storageKey);
    const chosen = cityMap.has(saved || "") ? saved : fallback;

    selectEl.value = chosen;
    const city = cityMap.get(chosen);
    if (city) {
      card.setAttribute("data-city", city.name);
      card.setAttribute("data-tz", city.tz);
      titleEl.textContent = city.name;
    }

    selectEl.addEventListener("change", async () => {
      const next = selectEl.value;
      const c = cityMap.get(next);
      if (!c) return;
      localStorage.setItem(storageKey, c.name);
      card.setAttribute("data-city", c.name);
      card.setAttribute("data-tz", c.tz);
      titleEl.textContent = c.name;
      await refreshWeatherForCard(card);
    });
  }
}

function startTimeTicker() {
  const cards = getCards();
  function tick() {
    for (const card of cards) {
      const { tz } = cardCity(card);
      renderCityTime(card, tz);
    }
  }
  tick();
  setInterval(tick, 1000);
}

function startWeatherRefresher() {
  refreshAllWeather();
  setInterval(refreshAllWeather, WEATHER_TTL_MS);
}

window.addEventListener("DOMContentLoaded", () => {
  setupCustomCards();
  startTimeTicker();
  startWeatherRefresher();
  renderTunisPrayerTimes();
  setInterval(renderTunisPrayerTimes, 30 * 60 * 1000);
});

