// ============================================================
// Food Guessr — Country Database
// Used for autocomplete suggestions, hot/cold distance feedback,
// and progressive hint reveal (continent, region).
// ============================================================

window.FG_COUNTRIES = [
    // Europe
    { name: "Italy",          continent: "Europe", region: "Southern Europe",  lat: 41.87,  lng: 12.57 },
    { name: "France",         continent: "Europe", region: "Western Europe",   lat: 46.23,  lng: 2.21 },
    { name: "Spain",          continent: "Europe", region: "Southern Europe",  lat: 40.46,  lng: -3.75 },
    { name: "Portugal",       continent: "Europe", region: "Southern Europe",  lat: 39.40,  lng: -8.22 },
    { name: "Greece",         continent: "Europe", region: "Southern Europe",  lat: 39.07,  lng: 21.82 },
    { name: "Germany",        continent: "Europe", region: "Central Europe",   lat: 51.17,  lng: 10.45 },
    { name: "Austria",        continent: "Europe", region: "Central Europe",   lat: 47.52,  lng: 14.55 },
    { name: "Switzerland",    continent: "Europe", region: "Central Europe",   lat: 46.82,  lng: 8.23 },
    { name: "Belgium",        continent: "Europe", region: "Western Europe",   lat: 50.50,  lng: 4.47 },
    { name: "Netherlands",    continent: "Europe", region: "Western Europe",   lat: 52.13,  lng: 5.29 },
    { name: "United Kingdom", continent: "Europe", region: "Western Europe",   lat: 55.38,  lng: -3.44 },
    { name: "Ireland",        continent: "Europe", region: "Western Europe",   lat: 53.41,  lng: -8.24 },
    { name: "Denmark",        continent: "Europe", region: "Northern Europe",  lat: 56.26,  lng: 9.50 },
    { name: "Sweden",         continent: "Europe", region: "Northern Europe",  lat: 60.13,  lng: 18.64 },
    { name: "Norway",         continent: "Europe", region: "Northern Europe",  lat: 60.47,  lng: 8.47 },
    { name: "Finland",        continent: "Europe", region: "Northern Europe",  lat: 61.92,  lng: 25.75 },
    { name: "Iceland",        continent: "Europe", region: "Northern Europe",  lat: 64.96,  lng: -19.02 },
    { name: "Poland",         continent: "Europe", region: "Eastern Europe",   lat: 51.92,  lng: 19.15 },
    { name: "Czech Republic", continent: "Europe", region: "Central Europe",   lat: 49.82,  lng: 15.47 },
    { name: "Slovakia",       continent: "Europe", region: "Central Europe",   lat: 48.67,  lng: 19.70 },
    { name: "Hungary",        continent: "Europe", region: "Central Europe",   lat: 47.16,  lng: 19.50 },
    { name: "Romania",        continent: "Europe", region: "Eastern Europe",   lat: 45.94,  lng: 24.97 },
    { name: "Bulgaria",       continent: "Europe", region: "Eastern Europe",   lat: 42.73,  lng: 25.49 },
    { name: "Serbia",         continent: "Europe", region: "Southeast Europe", lat: 44.02,  lng: 21.01 },
    { name: "Croatia",        continent: "Europe", region: "Southeast Europe", lat: 45.10,  lng: 15.20 },
    { name: "Bosnia and Herzegovina", continent: "Europe", region: "Southeast Europe", lat: 43.92, lng: 17.68 },
    { name: "Albania",        continent: "Europe", region: "Southeast Europe", lat: 41.15,  lng: 20.17 },
    { name: "Russia",         continent: "Europe", region: "Eastern Europe",   lat: 61.52,  lng: 105.32 },
    { name: "Ukraine",        continent: "Europe", region: "Eastern Europe",   lat: 48.38,  lng: 31.17 },
    { name: "Georgia",        continent: "Asia",   region: "Caucasus",         lat: 42.32,  lng: 43.36 },
    { name: "Armenia",        continent: "Asia",   region: "Caucasus",         lat: 40.07,  lng: 45.04 },

    // Middle East / North Africa
    { name: "Turkey",         continent: "Asia",   region: "Middle East",      lat: 38.96,  lng: 35.24 },
    { name: "Israel",         continent: "Asia",   region: "Middle East",      lat: 31.05,  lng: 34.85 },
    { name: "Lebanon",        continent: "Asia",   region: "Middle East",      lat: 33.85,  lng: 35.86 },
    { name: "Syria",          continent: "Asia",   region: "Middle East",      lat: 34.80,  lng: 38.99 },
    { name: "Iraq",           continent: "Asia",   region: "Middle East",      lat: 33.22,  lng: 43.68 },
    { name: "Iran",           continent: "Asia",   region: "Middle East",      lat: 32.43,  lng: 53.69 },
    { name: "Saudi Arabia",   continent: "Asia",   region: "Middle East",      lat: 23.89,  lng: 45.08 },
    { name: "Jordan",         continent: "Asia",   region: "Middle East",      lat: 30.59,  lng: 36.24 },
    { name: "Egypt",          continent: "Africa", region: "North Africa",     lat: 26.82,  lng: 30.80 },
    { name: "Morocco",        continent: "Africa", region: "North Africa",     lat: 31.79,  lng: -7.09 },
    { name: "Tunisia",        continent: "Africa", region: "North Africa",     lat: 33.89,  lng: 9.54 },
    { name: "Algeria",        continent: "Africa", region: "North Africa",     lat: 28.03,  lng: 1.66 },
    { name: "Libya",          continent: "Africa", region: "North Africa",     lat: 26.34,  lng: 17.23 },

    // Sub-Saharan Africa
    { name: "Ethiopia",       continent: "Africa", region: "East Africa",      lat: 9.15,   lng: 40.49 },
    { name: "Kenya",          continent: "Africa", region: "East Africa",      lat: -0.02,  lng: 37.91 },
    { name: "Tanzania",       continent: "Africa", region: "East Africa",      lat: -6.37,  lng: 34.89 },
    { name: "Uganda",         continent: "Africa", region: "East Africa",      lat: 1.37,   lng: 32.29 },
    { name: "Somalia",        continent: "Africa", region: "East Africa",      lat: 5.15,   lng: 46.20 },
    { name: "Nigeria",        continent: "Africa", region: "West Africa",      lat: 9.08,   lng: 8.68 },
    { name: "Ghana",          continent: "Africa", region: "West Africa",      lat: 7.95,   lng: -1.02 },
    { name: "Senegal",        continent: "Africa", region: "West Africa",      lat: 14.50,  lng: -14.45 },
    { name: "Ivory Coast",    continent: "Africa", region: "West Africa",      lat: 7.54,   lng: -5.55 },
    { name: "South Africa",   continent: "Africa", region: "Southern Africa",  lat: -30.56, lng: 22.94 },

    // East Asia
    { name: "China",          continent: "Asia",   region: "East Asia",        lat: 35.86,  lng: 104.20 },
    { name: "Japan",          continent: "Asia",   region: "East Asia",        lat: 36.20,  lng: 138.25 },
    { name: "South Korea",    continent: "Asia",   region: "East Asia",        lat: 35.91,  lng: 127.77 },
    { name: "North Korea",    continent: "Asia",   region: "East Asia",        lat: 40.34,  lng: 127.51 },
    { name: "Mongolia",       continent: "Asia",   region: "East Asia",        lat: 46.86,  lng: 103.85 },
    { name: "Taiwan",         continent: "Asia",   region: "East Asia",        lat: 23.70,  lng: 120.96 },

    // South Asia
    { name: "India",          continent: "Asia",   region: "South Asia",       lat: 20.59,  lng: 78.96 },
    { name: "Pakistan",       continent: "Asia",   region: "South Asia",       lat: 30.38,  lng: 69.35 },
    { name: "Bangladesh",     continent: "Asia",   region: "South Asia",       lat: 23.68,  lng: 90.36 },
    { name: "Sri Lanka",      continent: "Asia",   region: "South Asia",       lat: 7.87,   lng: 80.77 },
    { name: "Nepal",          continent: "Asia",   region: "South Asia",       lat: 28.39,  lng: 84.12 },
    { name: "Afghanistan",    continent: "Asia",   region: "South Asia",       lat: 33.94,  lng: 67.71 },

    // Southeast Asia
    { name: "Thailand",       continent: "Asia",   region: "Southeast Asia",   lat: 15.87,  lng: 100.99 },
    { name: "Vietnam",        continent: "Asia",   region: "Southeast Asia",   lat: 14.06,  lng: 108.28 },
    { name: "Cambodia",       continent: "Asia",   region: "Southeast Asia",   lat: 12.57,  lng: 104.99 },
    { name: "Laos",           continent: "Asia",   region: "Southeast Asia",   lat: 19.86,  lng: 102.50 },
    { name: "Myanmar",        continent: "Asia",   region: "Southeast Asia",   lat: 21.92,  lng: 95.96 },
    { name: "Malaysia",       continent: "Asia",   region: "Southeast Asia",   lat: 4.21,   lng: 101.98 },
    { name: "Singapore",      continent: "Asia",   region: "Southeast Asia",   lat: 1.35,   lng: 103.82 },
    { name: "Indonesia",      continent: "Asia",   region: "Southeast Asia",   lat: -0.79,  lng: 113.92 },
    { name: "Philippines",    continent: "Asia",   region: "Southeast Asia",   lat: 12.88,  lng: 121.77 },

    // North America
    { name: "United States",  continent: "North America", region: "Northern America", lat: 37.09, lng: -95.71 },
    { name: "Canada",         continent: "North America", region: "Northern America", lat: 56.13, lng: -106.35 },
    { name: "Mexico",         continent: "North America", region: "Central America",  lat: 23.63, lng: -102.55 },
    { name: "Guatemala",      continent: "North America", region: "Central America",  lat: 15.78, lng: -90.23 },
    { name: "Cuba",           continent: "North America", region: "Caribbean",        lat: 21.52, lng: -77.78 },
    { name: "Jamaica",        continent: "North America", region: "Caribbean",        lat: 18.11, lng: -77.30 },
    { name: "Haiti",          continent: "North America", region: "Caribbean",        lat: 18.97, lng: -72.29 },
    { name: "Dominican Republic", continent: "North America", region: "Caribbean",    lat: 18.74, lng: -70.16 },
    { name: "Costa Rica",     continent: "North America", region: "Central America",  lat: 9.75,  lng: -83.75 },
    { name: "Panama",         continent: "North America", region: "Central America",  lat: 8.54,  lng: -80.78 },
    { name: "El Salvador",    continent: "North America", region: "Central America",  lat: 13.79, lng: -88.90 },
    { name: "Honduras",       continent: "North America", region: "Central America",  lat: 15.20, lng: -86.24 },
    { name: "Nicaragua",      continent: "North America", region: "Central America",  lat: 12.87, lng: -85.21 },

    // South America
    { name: "Brazil",         continent: "South America", region: "South America",    lat: -14.24, lng: -51.93 },
    { name: "Argentina",      continent: "South America", region: "South America",    lat: -38.42, lng: -63.62 },
    { name: "Peru",           continent: "South America", region: "South America",    lat: -9.19,  lng: -75.02 },
    { name: "Colombia",       continent: "South America", region: "South America",    lat: 4.57,   lng: -74.30 },
    { name: "Venezuela",      continent: "South America", region: "South America",    lat: 6.42,   lng: -66.59 },
    { name: "Chile",          continent: "South America", region: "South America",    lat: -35.68, lng: -71.54 },
    { name: "Ecuador",        continent: "South America", region: "South America",    lat: -1.83,  lng: -78.18 },
    { name: "Bolivia",        continent: "South America", region: "South America",    lat: -16.29, lng: -63.59 },
    { name: "Uruguay",        continent: "South America", region: "South America",    lat: -32.52, lng: -55.77 },
    { name: "Paraguay",       continent: "South America", region: "South America",    lat: -23.44, lng: -58.44 },

    // Oceania
    { name: "Australia",      continent: "Oceania", region: "Australia/NZ",     lat: -25.27, lng: 133.78 },
    { name: "New Zealand",    continent: "Oceania", region: "Australia/NZ",     lat: -40.90, lng: 174.89 },
    { name: "Fiji",           continent: "Oceania", region: "Pacific Islands",  lat: -16.58, lng: 179.41 },
    { name: "Samoa",          continent: "Oceania", region: "Pacific Islands",  lat: -13.76, lng: -172.10 },

    // Extras for autocomplete plausibility
    { name: "Qatar",          continent: "Asia",   region: "Middle East",      lat: 25.35,  lng: 51.18 },
    { name: "United Arab Emirates", continent: "Asia", region: "Middle East",  lat: 23.42,  lng: 53.85 },
    { name: "Kuwait",         continent: "Asia",   region: "Middle East",      lat: 29.31,  lng: 47.48 },
    { name: "Yemen",          continent: "Asia",   region: "Middle East",      lat: 15.55,  lng: 48.52 },
    { name: "Oman",           continent: "Asia",   region: "Middle East",      lat: 21.51,  lng: 55.92 },
    { name: "Cyprus",         continent: "Europe", region: "Southern Europe",  lat: 35.13,  lng: 33.43 },
    { name: "Malta",          continent: "Europe", region: "Southern Europe",  lat: 35.94,  lng: 14.38 },
    { name: "Slovenia",       continent: "Europe", region: "Central Europe",   lat: 46.15,  lng: 14.99 },
    { name: "Estonia",        continent: "Europe", region: "Northern Europe",  lat: 58.60,  lng: 25.01 },
    { name: "Latvia",         continent: "Europe", region: "Northern Europe",  lat: 56.88,  lng: 24.60 },
    { name: "Lithuania",      continent: "Europe", region: "Northern Europe",  lat: 55.17,  lng: 23.88 },
    { name: "Belarus",        continent: "Europe", region: "Eastern Europe",   lat: 53.71,  lng: 27.95 },
    { name: "Moldova",        continent: "Europe", region: "Eastern Europe",   lat: 47.41,  lng: 28.37 },
    { name: "Kazakhstan",     continent: "Asia",   region: "Central Asia",     lat: 48.02,  lng: 66.92 },
    { name: "Uzbekistan",     continent: "Asia",   region: "Central Asia",     lat: 41.38,  lng: 64.59 }
];

// Haversine distance in km
window.FG_distanceKm = function (lat1, lng1, lat2, lng2) {
    var R = 6371;
    var toRad = function (d) { return d * Math.PI / 180; };
    var dLat = toRad(lat2 - lat1);
    var dLng = toRad(lng2 - lng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
};

window.FG_findCountry = function (name) {
    if (!name) return null;
    var needle = String(name).trim().toLowerCase();
    for (var i = 0; i < window.FG_COUNTRIES.length; i++) {
        if (window.FG_COUNTRIES[i].name.toLowerCase() === needle) return window.FG_COUNTRIES[i];
    }
    return null;
};
