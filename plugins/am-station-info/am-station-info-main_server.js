/*
    AM Station Info Plugin v1.1
    Server-side code
*/

'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express'); 
const { logInfo, logError } = require('../../server/console');
const endpointsRouter = require('../../server/endpoints');
endpointsRouter.use(
  '/assets',
  express.static(path.join(__dirname, 'assets'))
);

const pluginName = "AM-Station-Info";

function parseLatLon(latlonStr) {
    if (!latlonStr || typeof latlonStr !== 'string') return { latitude: 0, longitude: 0 };
    const dms_str = latlonStr.trim().toUpperCase();
    try {
        const lat_match = dms_str.match(/(\d{4,6}[NS])/);
        const lon_match = dms_str.match(/(\d{5,8}[EW])/);
        if (!lat_match || !lon_match) return { latitude: null, longitude: null };
        const convert = (s) => {
            const direction = s.slice(-1); const val = s.slice(0, -1); let deg, min, sec;
            if (direction === 'N' || direction === 'S') {
                deg = parseInt(val.substring(0, 2), 10); min = parseInt(val.substring(2, 4), 10); sec = val.length === 6 ? parseInt(val.substring(4, 6), 10) : 0;
            } else {
                deg = parseInt(val.substring(0, 3), 10); min = parseInt(val.substring(3, 5), 10); sec = val.length === 7 ? parseInt(val.substring(5, 7), 10) : 0;
            }
            let dd = deg + (min / 60.0) + (sec / 3600.0);
            if (direction === 'S' || direction === 'W') dd *= -1;
            return dd;
        };
        return { latitude: parseFloat(convert(lat_match[0]).toFixed(4)), longitude: parseFloat(convert(lon_match[0]).toFixed(4)) };
    } catch (e) {
        return { latitude: 0, longitude: 0 };
    }
}

let stasjonsData = [];
const pluginDirectory = __dirname;

try {
    const allFiles = fs.readdirSync(pluginDirectory);
    
    const stationFiles = allFiles.filter(file => {
        const lowerCaseFile = file.toLowerCase();
        return (lowerCaseFile.startsWith('aoki-') || lowerCaseFile.startsWith('user')) && lowerCaseFile.endsWith('.json');
    });

    if (stationFiles.length === 0) {
        logInfo(`${pluginName}: No station files found (e.g., aoki-a25.json or user.json).`);
    }

    for (const file of stationFiles) {
        const filePath = path.join(pluginDirectory, file);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(fileContent);

        const sourceName = path.basename(file, '.json').toUpperCase();

const stationsFromFile = jsonData.map(station => {
    const { latitude, longitude } = parseLatLon(station.latlon);
    return {
        frequency_khz: station.frequency_khz,
        name: station.station,
        time_utc: station.time_utc,
        days_active: station.days,
        language: station.language,
        power_kw: station.power_kw,
        location: station.location,
        country: station.country_code,
        latitude: latitude,
        longitude: longitude,
        source: sourceName,
        azimuth: station.azimuth,
        remarks: station.remarks
    };
});
        
        stasjonsData = stasjonsData.concat(stationsFromFile);
        logInfo(`${pluginName}: Loaded ${stationsFromFile.length} stations from ${file}.`);
    }


} catch (error) {
    logError(`${pluginName}: An error occurred while loading station files.`, error);
}
/*
function hasValidCoords(stasjon) {
  return Number.isFinite(stasjon.latitude) &&
         Number.isFinite(stasjon.longitude) &&
         stasjon.latitude !== 0 && stasjon.longitude !== 0;
}
*/
function beregnAvstand(lat1, lon1, lat2, lon2) {
    if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return 0;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 0.5 - Math.cos(dLat) / 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * (1 - Math.cos(dLon)) / 2;
    return Math.round(R * 2 * Math.asin(Math.sqrt(a)));
}

function isTimeActive(timeUTC, currentTimeInMinutes) {
    if (!timeUTC || timeUTC.indexOf('-') === -1) return false;
    try {
        const [startStr, endStr] = timeUTC.split('-');
        const startHour = parseInt(startStr.substring(0, 2), 10);
        const startMinute = parseInt(startStr.substring(2, 4), 10);
        const startInMinutes = startHour * 60 + startMinute;
        const endHour = endStr === '2400' ? 23 : parseInt(endStr.substring(0, 2), 10);
        const endMinute = endStr === '2400' ? 59 : parseInt(endStr.substring(2, 4), 10);
        const endInMinutes = endHour * 60 + endMinute;
        if (startInMinutes > endInMinutes) {
            return currentTimeInMinutes >= startInMinutes || currentTimeInMinutes <= endInMinutes;
        } else {
            return currentTimeInMinutes >= startInMinutes && currentTimeInMinutes <= endInMinutes;
        }
    } catch (e) {
        return false;
    }
}

endpointsRouter.get('/aoki-api-proxy', (req, res) => {
    const { lat, lon, freq } = req.query;
    if (!lat || !lon || !freq) return res.status(400).json({ status: 'error', message: 'Missing parameters.' });
    const now = new Date();
    const currentUTCDay = now.getUTCDay() + 1;
    const dayString = currentUTCDay.toString();
    const nowInMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const requestFreq = parseInt(freq, 10);
    const userLat = parseFloat(lat);
    const userLon = parseFloat(lon);
    
const filtrerteStasjoner = stasjonsData.filter(stasjon => {
  const freqMatch = stasjon.frequency_khz && Math.abs(stasjon.frequency_khz - requestFreq) <= 2;
  const dayMatch  = stasjon.days_active && stasjon.days_active.includes(dayString);
  const timeMatch = isTimeActive(stasjon.time_utc, nowInMinutes);
  // return freqMatch && dayMatch && timeMatch && hasValidCoords(stasjon);
  return freqMatch && dayMatch && timeMatch; // Ny
});

    if (filtrerteStasjoner.length === 0) return res.json({ status: 'success', message: 'No active stations found.', stations: [] });

const resultat = filtrerteStasjoner.map(stasjon => {
  // Sjekk om vi har gyldige koordinater før vi beregner avstand
  const hasCoords = stasjon.latitude !== null && stasjon.longitude !== null;
  const avstand = hasCoords 
    ? beregnAvstand(userLat, userLon, stasjon.latitude, stasjon.longitude) 
    : null; // Sett avstand til null hvis koordinater mangler

  const alternative_frequencies = stasjonsData
    .filter(other =>
      other.name === stasjon.name &&
      other.frequency_khz !== stasjon.frequency_khz &&
      other.days_active && other.days_active.includes(dayString) &&
      isTimeActive(other.time_utc, nowInMinutes)
    )
    .map(alt => alt.frequency_khz);

  const unikeAlternativer = [...new Set(alternative_frequencies)];

  return {
    name: stasjon.name,
    location: stasjon.location,
    country: stasjon.country,
    language: stasjon.language,
    timeUTC: stasjon.time_utc,
    power: stasjon.power_kw,
    distance: avstand, // Bruk den nye 'avstand'-variabelen
    source: stasjon.source,
    alternative_frequencies: unikeAlternativer,
    latitude: stasjon.latitude,
    longitude: stasjon.longitude,
    lat: stasjon.latitude,
    lon: stasjon.longitude,
    frequency: stasjon.frequency_khz,
    days: stasjon.days_active,
    azimuth: stasjon.azimuth,
    remarks: stasjon.remarks
  };
});

// Oppdatert sorteringsfunksjon som håndterer null-verdier
resultat.sort((a, b) => {
    const aHasDist = a.distance !== null;
    const bHasDist = b.distance !== null;

    if (aHasDist && bHasDist) {
        // Begge har avstand, sorter normalt
        return a.distance - b.distance;
    } else if (aHasDist) {
        // Kun 'a' har avstand, 'a' kommer først
        return -1;
    } else if (bHasDist) {
        // Kun 'b' har avstand, 'b' kommer først
        return 1;
    } else {
        // Ingen har avstand, behold rekkefølgen
        return 0;
    }
});

    res.json({ status: 'success', stations: resultat });
});

logInfo(`${pluginName}: AM-Station-Info endpoint initialized (v1.1 - Final Source Logic).`);