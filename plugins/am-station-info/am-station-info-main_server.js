/*
    AM Station Info Plugin v1.4.1 (Server)
    Server-side code - Now reads from /databases/ directory
    Updates: 
    - MWList source name support
    - Priority sorting: "0" power goes to bottom.
    - Missing power ("N/A") sorts normally by distance.
    - EXACT frequency matching (no +/- 2kHz tolerance)
    - Fix: Stations with missing time in DB are treated as 24/7 active
    - NEW: Range search for SW subbands with "Highest power per frequency" filtering
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

let stasjonsData =[];
const dbDirectory = path.join(__dirname, 'databases');

try {
    const allFiles = fs.readdirSync(dbDirectory);
    
    const stationFiles = allFiles.filter(file => {
        const lowerCaseFile = file.toLowerCase();
        return (lowerCaseFile.startsWith('aoki-') || lowerCaseFile.startsWith('user') || lowerCaseFile.includes('mwlist')) && lowerCaseFile.endsWith('.json');
    });

    if (stationFiles.length === 0) {
        logInfo(`${pluginName}: No station files found in the 'databases' directory.`);
    }

    for (const file of stationFiles) {
        const filePath = path.join(dbDirectory, file);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(fileContent);

        let sourceName;
        if (file.toLowerCase().includes('mwlist')) {
            sourceName = "©MWLIST";
        } else {
            sourceName = path.basename(file, '.json').toUpperCase();
        }

        const stationsFromFile = jsonData.map(station => {
            const { latitude, longitude } = parseLatLon(station.latlon);
            
            let rawPower = station.power_kw;
            if (rawPower === undefined || rawPower === null) {
                rawPower = station.erp;
            }
            if (rawPower === undefined) {
                rawPower = null;
            }

            return {
                frequency_khz: station.frequency_khz,
                name: station.station,
                time_utc: station.time_utc,
                days_active: station.days,
                language: station.language,
                power_kw: rawPower, 
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
        logInfo(`${pluginName}: Loaded ${stationsFromFile.length} stations from ${file} (Source: ${sourceName}).`);
    }

} catch (error) {
    if (error.code === 'ENOENT') {
        logError(`${pluginName}: The 'databases' directory was not found. Please create it and add your station files.`);
    } else {
        logError(`${pluginName}: An error occurred while loading station files.`, error);
    }
}

function beregnAvstand(lat1, lon1, lat2, lon2) {
    if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return 0;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 0.5 - Math.cos(dLat) / 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * (1 - Math.cos(dLon)) / 2;
    return Math.round(R * 2 * Math.asin(Math.sqrt(a)));
}

function isTimeActive(timeUTC, currentTimeInMinutes) {
    if (!timeUTC || timeUTC.trim() === '') return true;
    
    if (timeUTC.indexOf('-') === -1) return false; 
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
    const { lat, lon, freq, freqStart, freqEnd } = req.query;
    
    // Vi må enten ha en spesifikk frekvens, eller en range for underbåndet.
    if (!lat || !lon || (!freq && (!freqStart || !freqEnd))) {
        return res.status(400).json({ status: 'error', message: 'Missing parameters.' });
    }

    const now = new Date();
    const currentUTCDay = now.getUTCDay() + 1;
    const dayString = currentUTCDay.toString();
    const nowInMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const margin = req.query.margin ? parseInt(req.query.margin, 10) : 0;
    
    const userLat = parseFloat(lat);
    const userLon = parseFloat(lon);
    
    const fStart = freqStart ? parseInt(freqStart, 10) : null;
    const fEnd = freqEnd ? parseInt(freqEnd, 10) : null;
    const requestFreq = freq ? parseInt(freq, 10) : null;
    
    const filtrerteStasjoner = stasjonsData.filter(stasjon => {
      let freqMatch = false;
      if (fStart !== null && fEnd !== null) {
          freqMatch = stasjon.frequency_khz >= fStart && stasjon.frequency_khz <= fEnd;
      } else if (requestFreq !== null) {
          freqMatch = stasjon.frequency_khz && Math.abs(stasjon.frequency_khz - requestFreq) <= margin;
      }
      
      const dayMatch  = stasjon.days_active && stasjon.days_active.includes(dayString);
      const timeMatch = isTimeActive(stasjon.time_utc, nowInMinutes);
      return freqMatch && dayMatch && timeMatch;
    });

    if (filtrerteStasjoner.length === 0) return res.json({ status: 'success', message: 'No active stations found.', stations:[] });

    const bearbeidet = filtrerteStasjoner.map(stasjon => {
      const hasCoords = stasjon.latitude !== null && stasjon.longitude !== null;
      const avstand = hasCoords ? beregnAvstand(userLat, userLon, stasjon.latitude, stasjon.longitude) : null;

      return {
        name: stasjon.name,
        location: stasjon.location,
        country: stasjon.country,
        language: stasjon.language,
        timeUTC: stasjon.time_utc,
        power: parseFloat(stasjon.power_kw) || 0, // Gjør det enkelt å sortere senere
        distance: avstand,
        source: stasjon.source,
        latitude: stasjon.latitude,
        longitude: stasjon.longitude,
        frequency: stasjon.frequency_khz,
        days: stasjon.days_active,
        azimuth: stasjon.azimuth,
        remarks: stasjon.remarks
      };
    });

    let resultat;

    // Hvis vi har valgt et område (Analog Scale), filtrer kun til de sterkeste stasjonene per frekvens
    if (fStart !== null && fEnd !== null) {
        const grouped = {};
        bearbeidet.forEach(st => {
            const f = st.frequency;
            if (!grouped[f]) {
                grouped[f] = st;
            } else {
                if (st.power > grouped[f].power) {
                    grouped[f] = st; // Overskriv med høyere effekt
                }
            }
        });
        resultat = Object.values(grouped);
    } else {
        // Enkelt-frekvens søk: behold alternativ-frekvens logikk
        resultat = bearbeidet.map(st => {
            const altFreqs = stasjonsData
                .filter(other =>
                    other.name === st.name &&
                    other.frequency_khz !== st.frequency &&
                    other.days_active && other.days_active.includes(dayString) &&
                    isTimeActive(other.time_utc, nowInMinutes)
                ).map(alt => alt.frequency_khz);
            return {
                ...st,
                alternative_frequencies: [...new Set(altFreqs)]
            };
        });
    }

    // Sortering: 0-effekt nederst, ellers distanse
    resultat.sort((a, b) => {
        const isZeroPower = (p) => p === 0;

        const aIsZero = isZeroPower(a.power);
        const bIsZero = isZeroPower(b.power);

        if (aIsZero && !bIsZero) return 1; 
        if (!aIsZero && bIsZero) return -1; 

        const aHasDist = a.distance !== null;
        const bHasDist = b.distance !== null;

        if (aHasDist && bHasDist) {
            return a.distance - b.distance;
        } else if (aHasDist) {
            return -1;
        } else if (bHasDist) {
            return 1;
        } else {
            return 0;
        }
    });

    res.json({ status: 'success', stations: resultat });

});

const favoritesFile = path.join(dbDirectory, 'scale_favorites.json');

function getFavorites() {
    if (!fs.existsSync(favoritesFile)) return[];
    try { return JSON.parse(fs.readFileSync(favoritesFile, 'utf8')); }
    catch (e) { return[]; }
}

function saveFavorites(favs) {
    fs.writeFileSync(favoritesFile, JSON.stringify(favs, null, 2));
}

const checkAdminAm = (req, res, next) => {
    if (req.session && req.session.isAdminAuthenticated) return next();
    return res.status(401).json({ error: 'Unauthorized' });
};

endpointsRouter.get('/AM-Station_info/api/auth-check', (req, res) => {
    res.json({ isAdmin: (req.session && req.session.isAdminAuthenticated) || false });
});

endpointsRouter.get('/AM-Station_info/favorites', (req, res) => {
    res.json(getFavorites());
});

endpointsRouter.post('/AM-Station_info/favorites/add', checkAdminAm, express.json(), (req, res) => {
    const favs = getFavorites();
    const station = req.body;
    // Unngå duplikater
    if (!favs.some(s => s.name === station.name && s.frequency === station.frequency)) {
        favs.push(station);
        saveFavorites(favs);
    }
    res.json({ success: true, favorites: favs });
});

endpointsRouter.post('/AM-Station_info/favorites/remove', checkAdminAm, express.json(), (req, res) => {
    let favs = getFavorites();
    const { name, frequency } = req.body;
    favs = favs.filter(s => !(s.name === name && s.frequency === frequency));
    saveFavorites(favs);
    res.json({ success: true, favorites: favs });
});

logInfo(`${pluginName}: AM-Station-Info endpoint initialized (Range Search & Peak-Power filtering).`);
