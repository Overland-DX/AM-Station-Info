/* AM Station Info Plugin v2.5 (Server) 
   - Restored 100% Original API logic for Analog Scale compatibility.
   - Dynamic AOKI Auto-Updater (Cleans old databases, auto-names based on season).
   - Space Weather Forecast support.
   - Restructured Admin Panel
   - Custom Sorting & Multi-DB Auto Updates
   - Advanced Add/Import Modal
*/

'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const { logInfo, logError } = require('../../server/console');
const endpointsRouter = require('../../server/endpoints');

const pluginName = "AM-Station-Info";

endpointsRouter.use('/assets', express.static(path.join(__dirname, 'assets')));

// ==========================================
// CONFIGURATION & MULTI-INSTANCE
// ==========================================
const configArgIndex = process.argv.indexOf('--config');
const instanceName = (configArgIndex !== -1 && process.argv.length > configArgIndex + 1) ? `_${process.argv[configArgIndex + 1]}` : '';
const configFileName = `${pluginName}_config${instanceName}.json`;
const configFilePath = path.join(__dirname, configFileName);

let pluginConfig = {
    dbDirectoryName: 'databases',
    maxFreq: 27,
    freqMargin: 0,
    selectedList: 'all',
    useServerPos: true,
    sortType: 'power_high',
    useMapModal: true,
    useSettingsModal: true,
    autoUpdate: true,
    dbUpdate1: 'aoki_all', 
    updateUrl: 'https://odx.fmdx.no/downloads/aoki.json',
    dbUpdate2: 'none', 
    updateUrl2: '',
    useMiles: false,
    hideInactive: false,
    showKp: true,
    kpProvider: 'noaa', 
    showKpForecast: true,
    showTerminator: true,
    showPath: true,
    showCountryLabels: true,
    showCapitalLabels: true,
    showGraph: true,
    extendedInfo: true
};

function loadConfig() {
    if (fs.existsSync(configFilePath)) {
        try {
            pluginConfig = { ...pluginConfig, ...JSON.parse(fs.readFileSync(configFilePath, 'utf8')) };
            logInfo(`${pluginName}: Loaded config from ${configFileName}`);
        } catch (e) { logError(`${pluginName}: Config parse error.`, e); }
    } else { saveConfig(pluginConfig); }
}

function saveConfig(configData) {
    try { fs.writeFileSync(configFilePath, JSON.stringify(configData, null, 4)); } 
    catch (e) { logError(`${pluginName}: Failed to save config.`, e); }
}
loadConfig();

// ==========================================
// DATABASE LOADING (ORIGINAL LOGIC)
// ==========================================
let stasjonsData =[];
let dbDirectory = path.join(__dirname, pluginConfig.dbDirectoryName);

function loadDatabases() {
    stasjonsData =[];
    dbDirectory = path.join(__dirname, pluginConfig.dbDirectoryName);
    try {
        if (!fs.existsSync(dbDirectory)) {
            fs.mkdirSync(dbDirectory);
            return;
        }

        const allFiles = fs.readdirSync(dbDirectory);
        const stationFiles = allFiles.filter(file => {
            const lowerCaseFile = file.toLowerCase();
            return (lowerCaseFile.startsWith('aoki-') || lowerCaseFile.startsWith('user') || lowerCaseFile.includes('mwlist')) && lowerCaseFile.endsWith('.json');
        });

        for (const file of stationFiles) {
            const filePath = path.join(dbDirectory, file);
            const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            let sourceName = file.toLowerCase().includes('mwlist') ? "©MWLIST" : path.basename(file, '.json').toUpperCase();

            const stationsFromFile = jsonData.map(station => {
                const { latitude, longitude } = parseLatLon(station.latlon);
                let rawPower = station.power_kw !== undefined && station.power_kw !== null ? station.power_kw : station.erp;
                
                return {
                    frequency_khz: station.frequency_khz,
                    name: station.station,
                    time_utc: station.time_utc,
                    days_active: station.days,
                    language: station.language,
                    power_kw: rawPower === undefined ? null : rawPower, 
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
            logInfo(`${pluginName}: Loaded ${stationsFromFile.length} stations from ${file}`);
        }
    } catch (error) { logError(`${pluginName}: Error loading databases.`, error); }
}
loadDatabases();

function parseLatLon(latlonStr) {
    if (!latlonStr || typeof latlonStr !== 'string') return { latitude: 0, longitude: 0 };
    const dms_str = latlonStr.trim().toUpperCase();
    try {
        const lat_match = dms_str.match(/(\d{4,6}[NS])/);
        const lon_match = dms_str.match(/(\d{5,8}[EW])/);
        if (!lat_match || !lon_match) return { latitude: null, longitude: null };
        const convert = (s) => {
            const direction = s.slice(-1); const val = s.slice(0, -1); let deg, min, sec;
            if (direction === 'N' || direction === 'S') { deg = parseInt(val.substring(0, 2), 10); min = parseInt(val.substring(2, 4), 10); sec = val.length === 6 ? parseInt(val.substring(4, 6), 10) : 0; } 
            else { deg = parseInt(val.substring(0, 3), 10); min = parseInt(val.substring(3, 5), 10); sec = val.length === 7 ? parseInt(val.substring(5, 7), 10) : 0; }
            let dd = deg + (min / 60.0) + (sec / 3600.0);
            return (direction === 'S' || direction === 'W') ? dd * -1 : dd;
        };
        return { latitude: parseFloat(convert(lat_match[0]).toFixed(4)), longitude: parseFloat(convert(lon_match[0]).toFixed(4)) };
    } catch (e) { return { latitude: 0, longitude: 0 }; }
}

function beregnAvstand(lat1, lon1, lat2, lon2) {
    if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return 0;
    const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 0.5 - Math.cos(dLat)/2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * (1-Math.cos(dLon))/2;
    return Math.round(R * 2 * Math.asin(Math.sqrt(a)));
}

function isTimeActive(timeUTC, currentTimeInMinutes) {
    if (!timeUTC || timeUTC.trim() === '') return true;
    if (timeUTC.indexOf('-') === -1) return false; 
    try {
        const [startStr, endStr] = timeUTC.split('-');
        const startInMinutes = parseInt(startStr.substring(0, 2), 10) * 60 + parseInt(startStr.substring(2, 4), 10);
        const endHour = endStr === '2400' ? 23 : parseInt(endStr.substring(0, 2), 10);
        const endMinute = endStr === '2400' ? 59 : parseInt(endStr.substring(2, 4), 10);
        const endInMinutes = endHour * 60 + endMinute;
        if (startInMinutes > endInMinutes) return currentTimeInMinutes >= startInMinutes || currentTimeInMinutes <= endInMinutes;
        else return currentTimeInMinutes >= startInMinutes && currentTimeInMinutes <= endInMinutes;
    } catch (e) { return false; }
}


// ==========================================
// KP-INDEX PROXY
// ==========================================
endpointsRouter.get('/AM-Station_info/api/kp-index', async (req, res) => {
    try {
        let currentKp = null;
        let forecastKp = null;
        const requestHeaders = { 'User-Agent': 'AM-Station-Info/2.5 (FM-DX Plugin)', 'Accept': 'application/json' };

        if (pluginConfig.kpProvider === 'noaa') {
            const noaaRes = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', { headers: requestHeaders });
            if (noaaRes.ok) {
                const data = await noaaRes.json();
                if (Array.isArray(data) && data.length > 0) currentKp = data[data.length - 1].Kp;
            }
            
            if (pluginConfig.showKpForecast) {
                const fcRes = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json', { headers: requestHeaders });
                if (fcRes.ok) {
                    const fcData = await fcRes.json();
                    if (Array.isArray(fcData) && fcData.length > 0) {
                        const now = new Date();
                        const futureBlocks = fcData.filter(d => new Date(d.time_tag + 'Z') > now);
                        if (futureBlocks.length > 0) {
                            forecastKp = futureBlocks[0].kp; 
                        }
                    }
                }
            }
        } else {
            const aurRes = await fetch('https://api.auroras.live/v1/?type=all&lat=60.0&long=10.0&forecast=false', { headers: requestHeaders });
            if (aurRes.ok) {
                const data = await aurRes.json();
                currentKp = data.th_30_kp || (data.ace ? data.ace.kp : null) || data.wing_kp;
            }
        }
        res.json({ success: true, current: currentKp, forecast: forecastKp });
    } catch (error) { 
        res.json({ success: false, error: error.message }); 
    }
});


// ==========================================
// SMART AUTO-UPDATER SERVICE
// ==========================================
async function fetchAndSaveDB(type, customUrl, filePrefix) {
    let fetchUrl = customUrl;
    
    // 1. DYNAMISK SØK ETTER NYESTE AOKI-FIL PÅ WEBSERVEREN
    if (type === 'aoki_all' || type === 'aoki_sw') {
        const baseUrl = 'https://odx.fmdx.no/downloads/';
        try {
            // Last ned HTML-visningen av mappen
            const dirRes = await fetch(baseUrl, { headers: { 'User-Agent': 'AM-Station-Info/2.5' } });
            if (dirRes.ok) {
                const html = await dirRes.text();
                // Finn alle filer som heter f.eks aoki-a26.json, aoki-b26.json (case-insensitive)
                const regex = /aoki-[ab]\d{2}\.json/gi;
                const matches = html.match(regex);
                
                if (matches && matches.length > 0) {
                    const uniqueFiles = [...new Set(matches)];
                    
                    // Sorter filene slik at høyeste år/sesong kommer først (eks: B26 > A26 > B25)
                    uniqueFiles.sort((a, b) => {
                        const getScore = (filename) => {
                            const m = filename.match(/aoki-([ab])(\d{2})\.json/i);
                            if (!m) return 0;
                            const season = m[1].toLowerCase(); // 'a' eller 'b'
                            const year = parseInt(m[2], 10);
                            // Gir 'b' litt mer verdi enn 'a' innenfor samme år (eks: År 26, B = 261, A = 260)
                            return (year * 10) + (season === 'b' ? 1 : 0);
                        };
                        return getScore(b) - getScore(a); 
                    });
                    
                    // Den første i listen vil nå alltid være den nyeste sesongen
                    const newestFile = uniqueFiles[0];
                    fetchUrl = baseUrl + newestFile;
                    logInfo(`${pluginName}: Auto-Updater fant nyeste AOKI-fil: ${newestFile}`);
                } else {
                    fetchUrl = baseUrl + 'aoki.json'; // Fallback hvis ingen ble funnet
                }
            } else {
                fetchUrl = baseUrl + 'aoki.json'; // Fallback ved server-feil
            }
        } catch (e) {
            logError(`${pluginName}: Klarte ikke å sjekke /downloads/ for AOKI-filer`, e);
            fetchUrl = 'https://odx.fmdx.no/downloads/aoki.json';
        }
    }

    if (!fetchUrl) return "No URL provided.";

    logInfo(`${pluginName}: Auto-Updater fetching ${fetchUrl} for ${type}`);
    const response = await fetch(fetchUrl, { headers: { 'User-Agent': 'AM-Station-Info/2.5' } });
    if (!response.ok) throw new Error("Remote server returned " + response.status);
    
    let data = await response.json();
    
    // Hent dato for når filen ble oppdatert på serveren
    const lastMod = new Date(response.headers.get('Last-Modified') || Date.now());
    const day = String(lastMod.getDate()).padStart(2, '0');
    const month = String(lastMod.getMonth() + 1).padStart(2, '0');
    const fallbackYear = String(lastMod.getFullYear()).slice(-2);
    
    let newFilename;

    if (type.startsWith('aoki')) {
        // 2. BRUK RIKTIG SESONG FRA DET FAKTISKE FILNAVNET TIL LOKAL LAGRING
        let seasonAndYear = '';
        const urlMatch = fetchUrl.match(/aoki-([ab]\d{2})\.json/i);
        if (urlMatch) {
            seasonAndYear = urlMatch[1].toUpperCase(); // Eks: Blir til "B26" eller "A27"
        } else {
            // Tradisjonell fallback til måneden den lastes ned (hvis filnavnet er "aoki.json")
            const season = (parseInt(month, 10) >= 4 && parseInt(month, 10) <= 10) ? 'A' : 'B';
            seasonAndYear = `${season}${fallbackYear}`;
        }
        
        newFilename = `AOKI-${seasonAndYear}_${month}${day}.json`;
        
        if (type === 'aoki_sw') {
            data = data.filter(s => s.frequency_khz > 1700);
        }
        
        // Slett alle gamle AOKI-databaser for å rydde plass til den nye
        fs.readdirSync(dbDirectory).forEach(f => {
            if (f.toLowerCase().startsWith('aoki-') && f.endsWith('.json') && f !== newFilename) {
                fs.unlinkSync(path.join(dbDirectory, f));
            }
        });
    } else {
        newFilename = `${filePrefix}_${month}${day}.json`;
        fs.readdirSync(dbDirectory).forEach(f => {
            if (f.startsWith(`${filePrefix}_`) && f.endsWith('.json') && f !== newFilename) {
                fs.unlinkSync(path.join(dbDirectory, f));
            }
        });
    }
    
    const newPath = path.join(dbDirectory, newFilename);
    if (fs.existsSync(newPath)) return `Already up to date (${newFilename}).`;
    
    fs.writeFileSync(newPath, JSON.stringify(data, null, 2));
    return `Updated to ${newFilename}`;
}

async function performAutoUpdate(manualTrigger) {
    const isEnabled = pluginConfig.autoUpdate;
    if (!isEnabled && !manualTrigger) {
        return "Auto-update disabled.";
    }
    
    const resultsArray = new Array();
    
    try {
        if (pluginConfig.dbUpdate1 && pluginConfig.dbUpdate1 !== 'none') {
            const res1 = await fetchAndSaveDB(pluginConfig.dbUpdate1, pluginConfig.updateUrl, "custom-auto1");
            resultsArray.push("DB1: " + res1);
        }
        if (pluginConfig.dbUpdate2 && pluginConfig.dbUpdate2 !== 'none') {
            const res2 = await fetchAndSaveDB(pluginConfig.dbUpdate2, pluginConfig.updateUrl2, "custom-auto2");
            resultsArray.push("DB2: " + res2);
        }
        loadDatabases();
        return resultsArray.join(" | ");
    } catch(err) {
        logError(pluginName + ": Auto-update failed", err);
        return "Error: " + err.message;
    }
}

setTimeout(() => {
    if (pluginConfig.autoUpdate) performAutoUpdate();
    setInterval(() => { if (pluginConfig.autoUpdate) performAutoUpdate(); }, 6 * 60 * 60 * 1000);
}, 60000);


// ==========================================
// 100% ORIGINAL FRONTEND API (ANALOG SCALE)
// ==========================================
endpointsRouter.get('/aoki-api-proxy', (req, res) => { 
    const { lat, lon, freq, freqStart, freqEnd } = req.query;

    if (!lat || !lon || (!freq && (!freqStart || !freqEnd))) {
        return res.status(400).json({ status: 'error', message: 'Missing parameters.' });
    }

    const now = new Date();
    const currentUTCDay = now.getUTCDay() + 1;
    const dayString = currentUTCDay.toString();
    const nowInMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const margin = req.query.margin ? parseInt(req.query.margin, 10) : pluginConfig.freqMargin;

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
      // Beregn kun avstand dersom server location er aktivert
      const avstand = (pluginConfig.useServerPos && hasCoords) ? beregnAvstand(userLat, userLon, stasjon.latitude, stasjon.longitude) : null;

      return {
        name: stasjon.name,
        location: stasjon.location,
        country: stasjon.country,
        language: stasjon.language,
        timeUTC: stasjon.time_utc,
        power: parseFloat(stasjon.power_kw) || 0,
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

    if (fStart !== null && fEnd !== null) {
        const grouped = {};
        bearbeidet.forEach(st => {
            const f = st.frequency;
            if (!grouped[f]) {
                grouped[f] = st;
            } else {
                if (st.power > grouped[f].power) {
                    grouped[f] = st; 
                }
            }
        });
        resultat = Object.values(grouped);
    } else {
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

    resultat.sort((a, b) => {
        const isZeroPower = (p) => p === 0;

        const aIsZero = isZeroPower(a.power);
        const bIsZero = isZeroPower(b.power);

        if (aIsZero && !bIsZero) return 1; 
        if (!aIsZero && bIsZero) return -1; 

        if (pluginConfig.useServerPos) {
            // Sortering etter avstand hvis server-posisjon er i bruk
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
        } else {
            // Sortering etter kraft hvis avstand ignoreres
            const pA = a.power || 0;
            const pB = b.power || 0;
            if (pluginConfig.sortType === 'power_high') {
                return pB - pA;
            } else {
                return pA - pB;
            }
        }
    });

    res.json({ status: 'success', stations: resultat });
});


// ==========================================
// 100% ORIGINAL AUTH & FAVORITES
// ==========================================
const checkAdminAm = (req, res, next) => { 
    if (req.session && req.session.isAdminAuthenticated) return next(); 
    return res.status(401).json({ error: 'Unauthorized' }); 
};

const checkAdminHTML = (req, res, next) => {
    if (req.session && req.session.isAdminAuthenticated) return next();
    return res.status(401).send(`<body style="background:#121212;color:white;text-align:center;padding:50px;"><h2>401 Unauthorized</h2></body>`);
};

endpointsRouter.get('/AM-Station_info/api/auth-check', (req, res) => {
    res.json({ isAdmin: (req.session && req.session.isAdminAuthenticated) || false, config: pluginConfig }); 
});

const favoritesFile = path.join(dbDirectory, 'scale_favorites.json');

function getFavorites() { 
    if (!fs.existsSync(favoritesFile)) return[]; 
    try { return JSON.parse(fs.readFileSync(favoritesFile, 'utf8')); } catch (e) { return[]; } 
}
function saveFavorites(favs) { fs.writeFileSync(favoritesFile, JSON.stringify(favs, null, 2)); }

endpointsRouter.get('/AM-Station_info/favorites', (req, res) => {
    res.json(getFavorites()); 
});

endpointsRouter.post('/AM-Station_info/favorites/add', checkAdminAm, express.json(), (req, res) => { 
    const favs = getFavorites(); const station = req.body; 
    if (!favs.some(s => s.name === station.name && s.frequency === station.frequency)) { 
        favs.push(station); saveFavorites(favs); 
    } 
    res.json({ success: true, favorites: favs }); 
});

endpointsRouter.post('/AM-Station_info/favorites/remove', checkAdminAm, express.json(), (req, res) => { 
    let favs = getFavorites(); const { name, frequency } = req.body; 
    favs = favs.filter(s => !(s.name === name && s.frequency === frequency)); saveFavorites(favs); 
    res.json({ success: true, favorites: favs }); 
});


// ==========================================
// ADMIN PANEL ENDPOINTS
// ==========================================
endpointsRouter.post('/AM-Station_info/api/config', checkAdminAm, express.json(), async (req, res) => {
    const oldDbUpdate1 = pluginConfig.dbUpdate1;
    
    pluginConfig = { ...pluginConfig, ...req.body };
    saveConfig(pluginConfig);
    
    if (req.body.dbDirectoryName && req.body.dbDirectoryName !== path.basename(dbDirectory)) {
        loadDatabases();
    }

    // Hvis AOKI-modusen er endret, slett gammel fil for å fjerne gammel filtrering og tving ny nedlasting
    if (oldDbUpdate1 !== pluginConfig.dbUpdate1 && pluginConfig.dbUpdate1.startsWith('aoki')) {
        logInfo(`${pluginName}: AOKI mode changed (${oldDbUpdate1} -> ${pluginConfig.dbUpdate1}). Forcing database reinstall...`);
        try {
            // Slett eksisterende AOKI-lister
            const files = fs.readdirSync(dbDirectory);
            for (const f of files) {
                if (f.toLowerCase().startsWith('aoki-') && f.endsWith('.json')) {
                    fs.unlinkSync(path.join(dbDirectory, f));
                }
            }
            // Kjør Auto-Updater umiddelbart (selv om bryteren evt. står av, overstyres det her)
            await performAutoUpdate(true);
        } catch(e) {
            logError(`${pluginName}: Failed to clean and reinstall AOKI database`, e);
        }
    }

    res.json({ success: true, config: pluginConfig });
});

endpointsRouter.post('/AM-Station_info/api/force-update', checkAdminAm, async (req, res) => {
    const msg = await performAutoUpdate(true);
    if (msg.startsWith("Error")) return res.status(500).json({ success: false, error: msg });
    res.json({ success: true, message: msg });
});

endpointsRouter.get('/AM-Station_info/api/databases', checkAdminAm, (req, res) => {
    try {
        if (!fs.existsSync(dbDirectory)) fs.mkdirSync(dbDirectory);
        const files = fs.readdirSync(dbDirectory).filter(f => f.endsWith('.json'));
        res.json({ success: true, files });
    } catch(e) { res.status(500).json({error: e.message}); }
});

endpointsRouter.get('/AM-Station_info/api/databases/:file', checkAdminAm, (req, res) => {
    try {
        const data = fs.readFileSync(path.join(dbDirectory, req.params.file), 'utf8');
        res.json(JSON.parse(data));
    } catch(e) { res.status(500).json({error: e.message}); }
});

endpointsRouter.post('/AM-Station_info/api/databases/:file', checkAdminAm, express.text({ limit: '100mb', type: 'text/plain' }), (req, res) => {
    try {
        const parsedData = JSON.parse(req.body);
        fs.writeFileSync(path.join(dbDirectory, req.params.file), JSON.stringify(parsedData, null, 2));
        loadDatabases();
        res.json({ success: true });
    } catch(e) { res.status(500).json({error: e.message}); }
});

endpointsRouter.delete('/AM-Station_info/api/databases/:file', checkAdminAm, (req, res) => {
    try { fs.unlinkSync(path.join(dbDirectory, req.params.file)); loadDatabases(); res.json({ success: true }); } 
    catch(e) { res.status(500).json({error: e.message}); }
});


// ==========================================
// ADMIN PANEL HTML GENERATION (UPDATED UI)
// ==========================================
endpointsRouter.get('/AM-Station_info/admin', checkAdminHTML, (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AM Station Info - Admin Panel</title>
        <style>
            :root { --bg-base: #111111; --bg-sidebar: #161616; --bg-card: #1c1c1c; --border-color: #2a2a2a; --text-main: #f0f0f0; --text-muted: #888888; --accent: #3ba5fc; --accent-hover: #1e87db; --danger: #dc3545; --success: #28a745; }
            
            body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #050505; color: var(--text-main); display: block; height: 100vh; overflow: hidden; }
            
            /* Wrapper som sentrerer og begrenser bredden til 1920px for store skjermer */
            .admin-wrapper { display: flex; flex-direction: row; width: 100%; max-width: 1920px; margin: 0 auto; height: 100%; background: var(--bg-base); position: relative; box-shadow: 0 0 50px rgba(0,0,0,0.8); }
            
            /* Sidebar */
            .sidebar { width: 250px; background: var(--bg-sidebar); border-right: 1px solid var(--border-color); display: flex; flex-direction: column; flex-shrink: 0; z-index: 100; }
            .sidebar-header { padding: 25px 20px; border-bottom: 1px solid var(--border-color); }
            .sidebar-header h2 { margin: 0; font-size: 18px; font-weight: 600; color: var(--text-main); }
            .nav-tabs { padding: 20px 0; }
            .nav-item { padding: 15px 25px; cursor: pointer; color: var(--text-muted); font-size: 15px; border-left: 3px solid transparent; transition: 0.2s; }
            .nav-item:hover { color: var(--text-main); background: rgba(255,255,255,0.02); }
            .nav-item.active { color: var(--accent); border-left-color: var(--accent); background: rgba(59, 165, 252, 0.05); font-weight: 500; }
            .sidebar-footer { padding: 20px; border-top: 1px solid var(--border-color); background: var(--bg-sidebar); }
            
            /* Discord-style Unsaved Bar */
            .unsaved-bar { position: absolute; top: 0; left: 250px; right: 0; height: 44px; background-color: var(--accent); color: white; display: flex; justify-content: center; align-items: center; gap: 15px; font-size: 14px; font-weight: 500; transform: translateY(-100%); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); z-index: 1000; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
            .unsaved-bar.visible { transform: translateY(0); }
            .unsaved-bar a { color: #ffebee; text-decoration: underline; cursor: pointer; font-weight: 700; transition: color 0.2s; }
            .unsaved-bar a:hover { color: white; }
            
            /* Main Content */
            .content { flex: 1; padding: 30px 40px; overflow-y: auto; display: flex; flex-direction: column; position: relative; margin-top: 15px;}
            h1.page-title { margin-top: 0; margin-bottom: 30px; font-weight: 500; font-size: 24px; color: var(--accent); }
            .card { background: var(--bg-card); border-radius: 8px; margin-bottom: 25px; border: 1px solid var(--border-color); box-shadow: 0 4px 6px rgba(0,0,0,0.2); overflow: hidden; }
            .setting-row { display: flex; justify-content: space-between; align-items: center; padding: 20px 25px; border-bottom: 1px solid var(--border-color); }
            .setting-row:last-child { border-bottom: none; }
            .setting-info { flex: 1; padding-right: 20px; }
            .setting-info h4 { margin: 0 0 5px 0; font-size: 15px; font-weight: 600; color: var(--text-main); }
            .setting-info p { margin: 0; font-size: 13px; color: var(--text-muted); line-height: 1.4; }
            .setting-control { display: flex; align-items: center; gap: 10px; }
            
            /* Inputs & Toggles */
            .form-control { background: transparent; border: 1px solid #444; color: var(--text-main); padding: 8px 12px; border-radius: 6px; font-size: 14px; outline: none; min-width: 150px; text-align: center; transition: 0.2s; }
            .form-control:focus { border-color: var(--accent); }
            .form-control.wide { width: 300px; text-align: left; }
            select.form-control { text-align: left; appearance: none; background-color: var(--bg-card); cursor: pointer; }
            .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #444; transition: .3s; border-radius: 34px; }
            .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%; }
            input:checked + .slider { background-color: var(--accent); }
            input:checked + .slider:before { transform: translateX(20px); }
            
            /* Buttons */
            .btn { background: var(--border-color); color: var(--text-main); border: 1px solid #444; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; transition: 0.2s; white-space: nowrap; }
            .btn:hover { background: #333; }
            .btn.primary { background: var(--accent); color: white; border-color: var(--accent); }
            .btn.primary:hover { background: var(--accent-hover); }
            .btn.danger { background: rgba(220, 53, 69, 0.1); color: var(--danger); border-color: rgba(220, 53, 69, 0.3); }
            .btn.danger:hover { background: var(--danger); color: white; }
            
            /* Editor Toolbar & Table */
            .toolbar { display: flex; gap: 15px; padding: 20px 25px; background: rgba(0,0,0,0.2); border-bottom: 1px solid var(--border-color); align-items: center; flex-wrap: wrap; }
            .table-container { overflow-x: auto; max-height: calc(100vh - 350px); }
            table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; }
            th, td { padding: 12px 15px; border-bottom: 1px solid var(--border-color); white-space: nowrap; }
            th { background: rgba(0,0,0,0.4); font-weight: 600; color: var(--text-muted); position: sticky; top: 0; z-index: 10; border-bottom: 2px solid var(--border-color); }
            tr:hover { background: rgba(255,255,255,0.03); }
            
            /* Modals & Toast */
            .modal { display: none; position: fixed; z-index: 1000; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(5px); overflow-y:auto; padding: 40px 0; }
            .modal-content { background: var(--bg-card); margin: auto; padding: 30px; width: 90%; max-width: 800px; border-radius: 10px; border: 1px solid var(--border-color); }
            .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 20px; }
            .form-group label { display: block; margin-bottom: 8px; font-size: 13px; color: var(--text-muted); }
            .form-group input { width: 100%; box-sizing: border-box; text-align: left; }
            
            /* Import Tabs */
            .im-tab { background: var(--border-color); color: var(--text-main); margin: 0; border-radius: 4px; border: none; padding: 8px 16px; cursor: pointer; font-size: 13px; font-weight: 500; }
            .im-tab.primary { background: var(--accent); color: white; }
            
            .toast { visibility: hidden; min-width: 250px; background-color: var(--success); color: white; text-align: center; border-radius: 8px; padding: 16px; position: fixed; z-index: 2000; top: 20px; left: calc(50% + 125px); transform: translateX(-50%) translateY(-50px); font-size: 14px; font-weight: 500; opacity: 0; transition: 0.3s; box-shadow: 0 5px 15px rgba(0,0,0,0.5); }
            .toast.show { visibility: visible; opacity: 1; transform: translateX(-50%) translateY(0); }

            /* ========================================================================= */
            /* RESPONSIV MOBILVISNING (ADMIN PANEL) */
            /* ========================================================================= */
            @media (max-width: 850px) {
                /* Wrapper endres til kolonne */
                .admin-wrapper { flex-direction: column; }
                
                /* Sidebar gjøres om til topbar */
                .sidebar { width: 100%; border-right: none; border-bottom: 1px solid var(--border-color); position: sticky; top: 0; z-index: 100; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
                .sidebar-header { padding: 12px 15px; text-align: center; }
                .nav-tabs { display: flex; flex-direction: row; padding: 0; }
                .nav-item { flex: 1; text-align: center; padding: 12px 5px; font-size: 13px; border-left: none; border-bottom: 3px solid transparent; }
                .nav-item.active { border-left-color: transparent; border-bottom-color: var(--accent); }
                .sidebar-footer { padding: 10px 15px; text-align: center; }
                .sidebar-footer .btn { font-size: 13px !important; padding: 10px !important; }
                .unsaved-bar { left: 0; }
                
                /* Juster innhold */
                .content { padding: 15px 10px; margin-top: 0; overflow-y: auto; }
                h1.page-title { font-size: 20px; margin-bottom: 20px; text-align: center; }
                
                /* Settings rader stablest */
                .setting-row { flex-direction: column; align-items: flex-start; gap: 12px; padding: 15px; }
                .setting-info { padding-right: 0; width: 100%; }
                .setting-control { width: 100%; justify-content: flex-start; }
                .form-control.wide { width: 100%; }
                
                /* Editor Toolbar stablest */
                .toolbar { flex-direction: column; align-items: stretch; gap: 10px; padding: 15px; }
                .toolbar > * { width: 100% !important; margin-left: 0 !important; }
                .toolbar .btn { width: 100%; }
                .toolbar span { text-align: center !important; }
                
                /* Tabell - Skjuler alt unntatt Freq, Name, og Actions */
                .hide-mob { display: none !important; }
                table { font-size: 12px; width: 100%; }
                th, td { padding: 10px 5px; white-space: normal; word-break: break-word; }
                
                /* Modaler */
                .modal-content { width: 95%; padding: 20px 15px; margin: 5% auto; }
                .form-grid { grid-template-columns: 1fr; gap: 15px; }
                
                /* Import tabs på mobil */
                #import-modal > div > div:nth-child(2) { display: flex; flex-wrap: wrap; }
                .im-tab { flex: 1 1 45%; text-align: center; font-size: 12px; padding: 8px 5px; margin-bottom: 5px; }
            }
        </style>
    </head>
    <body>
        
      <div class="admin-wrapper">
        <div class="unsaved-bar" id="unsavedBar">
            <span>Careful — you have unsaved changes!</span>
            <a onclick="discardChanges()">Discard changes</a>
        </div>

        <div class="sidebar">
            <div style="flex: 1;">
                <div class="sidebar-header"><h2>AM Station Info</h2></div>
                <div class="nav-tabs">
                    <div class="nav-item active" onclick="switchTab('settings')">1. Settings & UI</div>
                    <div class="nav-item" onclick="switchTab('editor')">2. Database Editor</div>
                </div>
            </div>
            <div class="sidebar-footer">
                <button class="btn primary" style="width: 100%; font-size: 15px; padding: 12px; border-radius: 8px;" onclick="globalSave()">💾 Save All Changes</button>
            </div>
        </div>

        <div class="content">
            
            <!-- TAB 1: SETTINGS -->
            <div id="tab-settings" style="display: block; padding-bottom: 50px;">
                
                <h1 class="page-title">General Config</h1>
                <div class="card">
                    <div class="setting-row">
                        <div class="setting-info">
                            <h4>Use Server Position</h4>
                            <p>Calculate station distances based on the SDR server's physical location.</p>
                        </div>
                        <div class="setting-control">
                            <label class="switch"><input type="checkbox" id="cfg-useServerPos" ${pluginConfig.useServerPos ? 'checked' : ''}><span class="slider"></span></label>
                        </div>
                    </div>
                    
                    <div class="setting-row" id="row-sortType">
                        <div class="setting-info">
                            <h4>Sort N/A Position</h4>
                            <p>How to sort stations when server position is OFF.</p>
                        </div>
                        <div class="setting-control">
                            <select id="cfg-sortType" class="form-control wide">
                                <option value="power_high" ${pluginConfig.sortType === 'power_high' ? 'selected' : ''}>Power (High to Low)</option>
                                <option value="power_low" ${pluginConfig.sortType === 'power_low' ? 'selected' : ''}>Power (Low to High)</option>
                            </select>
                        </div>
                    </div>

                    <div class="setting-row">
                        <div class="setting-info">
                            <h4>Use Map Modal</h4>
                            <p>Allow users to open the global map by clicking on the station.</p>
                        </div>
                        <div class="setting-control">
                            <label class="switch"><input type="checkbox" id="cfg-useMapModal" ${pluginConfig.useMapModal ? 'checked' : ''}><span class="slider"></span></label>
                        </div>
                    </div>

                    <div class="setting-row">
                        <div class="setting-info">
                            <h4>Use Settings Modal</h4>
                            <p>Allow users to access the frontend visual settings. (Admins will be redirected here).</p>
                        </div>
                        <div class="setting-control">
                            <label class="switch"><input type="checkbox" id="cfg-useSettingsModal" ${pluginConfig.useSettingsModal ? 'checked' : ''}><span class="slider"></span></label>
                        </div>
                    </div>
                    
                    <div class="setting-row">
                        <div class="setting-info">
                            <h4>Default Frequency Tolerance</h4>
                            <p>How many kHz off the exact frequency to still show a station.</p>
                            </div>
                        <div class="setting-control" style="display: flex; align-items: center; gap: 15px;">
                                <input type="range" id="cfg-freqMargin" min="0" max="3" step="1" value="${pluginConfig.freqMargin}" style="cursor: pointer; width: 120px;" oninput="document.getElementById('freqMarginDisplay').innerText = this.value + ' kHz'">
                            <span id="freqMarginDisplay" style="font-weight: bold; width: 45px; text-align: right; color: var(--accent);">${pluginConfig.freqMargin} kHz</span>
                        </div>
                    </div>
                    
                    <div class="setting-row">
                        <div class="setting-info">
                            <h4>Default Station List</h4>
                            <p>Which database should be selected by default on load.</p>
                        </div>
                        <div class="setting-control">
                            <select id="cfg-selectedList" class="form-control wide">
                                <option value="all" ${pluginConfig.selectedList === 'all' ? 'selected' : ''}>All Lists</option>
                                <option value="aoki" ${pluginConfig.selectedList === 'aoki' ? 'selected' : ''}>Aoki Only</option>
                                <option value="user" ${pluginConfig.selectedList === 'user' ? 'selected' : ''}>User DB Only</option>
                                <option value="mwlist" ${pluginConfig.selectedList === 'mwlist' ? 'selected' : ''}>MWList Only</option>
                            </select>
                        </div>
                    </div>
                </div>

                <h1 class="page-title" style="margin-top:40px;">Auto-Update Database</h1>
                <div class="card">
                    <div class="setting-row">
                        <div class="setting-info">
                            <h4>Enable Auto-Update</h4>
                            <p>Automatically download database(s) from remote URLs every 24 hours.</p>
                        </div>
                        <div class="setting-control">
                            <label class="switch"><input type="checkbox" id="cfg-autoUpdate" ${pluginConfig.autoUpdate ? 'checked' : ''}><span class="slider"></span></label>
                        </div>
                    </div>
                    
                    <div class="setting-row">
                        <div class="setting-info">
                            <h4>Database 1</h4>
                            <p>Primary database format to fetch automatically.</p>
                        </div>
                        <div class="setting-control">
                            <select id="cfg-dbUpdate1" class="form-control wide">
                                <option value="aoki_all" ${pluginConfig.dbUpdate1 === 'aoki_all' ? 'selected' : ''}>AOKI (All Bands)</option>
                                <option value="aoki_sw" ${pluginConfig.dbUpdate1 === 'aoki_sw' ? 'selected' : ''}>AOKI (SW Only)</option>
                                <option value="custom" ${pluginConfig.dbUpdate1 === 'custom' ? 'selected' : ''}>Custom URL</option>
                            </select>
                        </div>
                    </div>
                    <div class="setting-row" id="row-updateUrl">
                        <div class="setting-info">
                            <h4>Custom URL (DB 1)</h4>
                        </div>
                        <div class="setting-control">
                            <input type="text" id="cfg-updateUrl" class="form-control wide" placeholder="https://..." value="${pluginConfig.updateUrl}">
                        </div>
                    </div>

                    <div class="setting-row">
                        <div class="setting-info">
                            <h4>Database 2</h4>
                            <p>Optional secondary database to fetch alongside Database 1.</p>
                        </div>
                        <div class="setting-control">
                            <select id="cfg-dbUpdate2" class="form-control wide">
                                <option value="none" ${pluginConfig.dbUpdate2 === 'none' ? 'selected' : ''}>None</option>
                                <option value="custom" ${pluginConfig.dbUpdate2 === 'custom' ? 'selected' : ''}>Custom URL</option>
                            </select>
                        </div>
                    </div>
                    <div class="setting-row" id="row-updateUrl2">
                        <div class="setting-info">
                            <h4>Custom URL (DB 2)</h4>
                        </div>
                        <div class="setting-control">
                            <input type="text" id="cfg-updateUrl2" class="form-control wide" placeholder="https://..." value="${pluginConfig.updateUrl2}">
                        </div>
                    </div>

                    <div class="setting-row" style="background: rgba(0,0,0,0.1);">
                        <div class="setting-info">
                            <h4 style="color: var(--accent);">Manual Trigger</h4>
                            <p>Force a check and download right now.</p>
                        </div>
                        <div class="setting-control">
                            <button class="btn primary" onclick="forceAutoUpdate()">Check Now</button>
                        </div>
                    </div>
                </div>

                <h1 class="page-title" style="margin-top:40px;">Maps & UI</h1>
                <div class="card">
                    <div class="setting-row">
                        <div class="setting-info"><h4>Use Distance Unit</h4></div>
                        <div class="setting-control">
                            <select id="cfg-useMiles" class="form-control wide">
                                <option value="false" ${!pluginConfig.useMiles ? 'selected' : ''}>Kilometers (KM)</option>
                                <option value="true" ${pluginConfig.useMiles ? 'selected' : ''}>Miles</option>
                            </select>
                        </div>
                    </div>

                    <div class="setting-row">
                        <div class="setting-info"><h4>Hide Inactive Stations</h4></div>
                        <div class="setting-control">
                            <label class="switch"><input type="checkbox" id="cfg-hideInactive" ${pluginConfig.hideInactive ? 'checked' : ''}><span class="slider"></span></label>
                        </div>
                    </div>

                    <div class="setting-row">
                        <div class="setting-info"><h4>Show Kp Index</h4></div>
                        <div class="setting-control">
                            <label class="switch"><input type="checkbox" id="cfg-showKp" ${pluginConfig.showKp ? 'checked' : ''}><span class="slider"></span></label>
                        </div>
                    </div>

                    <div class="setting-row" id="row-kpProvider">
                        <div class="setting-info">
                            <h4 style="padding-left: 20px; color:var(--text-muted);">↳ Space Weather Provider</h4>
                        </div>
                        <div class="setting-control">
                            <select id="cfg-kpProvider" class="form-control wide">
                                <option value="noaa" ${pluginConfig.kpProvider === 'noaa' ? 'selected' : ''}>NOAA SWPC</option>
                                <option value="auroraslive" ${pluginConfig.kpProvider === 'auroraslive' ? 'selected' : ''}>Auroras.live</option>
                            </select>
                        </div>
                    </div>
                    <div class="setting-row" id="row-showKpForecast">
                        <div class="setting-info">
                            <h4 style="padding-left: 20px; color:var(--text-muted);">↳ Show 3-Hour Forecast</h4>
                        </div>
                        <div class="setting-control">
                            <label class="switch"><input type="checkbox" id="cfg-showKpForecast" ${pluginConfig.showKpForecast ? 'checked' : ''}><span class="slider"></span></label>
                        </div>
                    </div>

                    ${[
                        { id: 'showTerminator', title: 'Show Day/Night Terminator' },
                        { id: 'showPath', title: 'Show Signal Path' },
                        { id: 'showCountryLabels', title: 'Show Country Labels' },
                        { id: 'showCapitalLabels', title: 'Show Capital Cities' },
                        { id: 'showGraph', title: 'Show Propagation Graph' },
                        { id: 'extendedInfo', title: 'Auto-Open Extended Info' }
                    ].map(cfg => `
                    <div class="setting-row">
                        <div class="setting-info"><h4>${cfg.title}</h4></div>
                        <div class="setting-control">
                            <label class="switch"><input type="checkbox" id="cfg-${cfg.id}" ${pluginConfig[cfg.id] ? 'checked' : ''}><span class="slider"></span></label>
                        </div>
                    </div>`).join('')}
                </div>
            </div>

            <!-- TAB 2: DATABASE EDITOR -->
            <div id="tab-editor" style="display: none; height:100%; flex-direction:column;">
                <h1 class="page-title">Database Editor</h1>
                
                <div class="card" style="display:flex; flex-direction:column; flex-grow:1;">
                    <div class="toolbar">
                        <select id="ed-serverFiles" class="form-control" style="width: 200px;"></select>
                        <button class="btn" onclick="loadServerDB()">Load File</button>
                        <button class="btn danger" onclick="deleteServerDB()">Delete File</button>
                        
                        <button class="btn primary" onclick="openImportModal()" style="margin-left: auto;">ADD / IMPORT</button>
                    </div>

                    <div class="toolbar" style="background: transparent;">
                        <input type="text" id="ed-search" class="form-control" placeholder="Strict Search: Frequency, Exact Name, or Exact Country..." style="flex-grow:1;" oninput="renderTable()">
                        
                        <select id="ed-band" class="form-control" style="width: 150px;" onchange="renderTable()"></select>
                        <button class="btn danger" id="ed-delBandBtn" onclick="deleteBand()" style="display:none;">Delete Band</button>
                        
                        <span id="ed-info" style="font-size:13px; color:var(--text-muted); min-width:130px; text-align:right;">0 stations</span>
                        
                        <button class="btn" onclick="openModal(-1)">+ Add Station</button>
                    </div>

                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Freq</th>
                                    <th>Station</th>
                                    <!-- Disse kolonnene får .hide-mob klassen og skjules på mobil -->
                                    <th class="hide-mob">UTC</th>
                                    <th class="hide-mob">Days</th>
                                    <th class="hide-mob">kW</th>
                                    <th class="hide-mob">Country</th>
                                    <th class="hide-mob">Coord</th>
                                    <th style="width:90px;">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="ed-tbody"></tbody>
                        </table>
                    </div>

                    <div style="display:flex; justify-content:center; align-items:center; gap:20px; padding: 20px; background: rgba(0,0,0,0.2); border-top: 1px solid var(--border-color);">
                        <button class="btn" onclick="edPage(-1)">&lt; Previous</button>
                        <span id="ed-pageInfo" style="font-weight:500; font-size:14px; color: var(--text-main);">Page 1</span>
                        <button class="btn" onclick="edPage(1)">Next &gt;</button>
                    </div>
                </div>
            </div>
        </div>
      </div> <!-- End of .admin-wrapper -->

        <!-- STATION EDIT MODAL -->
        <div id="ed-modal" class="modal">
            <div class="modal-content">
                <h3 id="ed-modalTitle" style="margin-top:0; border-bottom: 1px solid var(--border-color); padding-bottom:15px; color:var(--accent);">Edit Station</h3>
                <form id="ed-form" onsubmit="saveStation(event)">
                    <input type="hidden" id="ed-index">
                    <div class="form-grid">
                        <div class="form-group"><label>Frequency (kHz)</label><input type="number" id="f-freq" class="form-control" required></div>
                        <div class="form-group"><label>Station Name</label><input type="text" id="f-name" class="form-control" required></div>
                        <div class="form-group"><label>Power (kW)</label><input type="number" step="any" id="f-power" class="form-control"></div>
                        <div class="form-group"><label>Country Code (ITU)</label><input type="text" id="f-country" class="form-control"></div>
                        <div class="form-group"><label>Time (UTC)</label><input type="text" id="f-time" class="form-control" placeholder="0000-2400"></div>
                        <div class="form-group"><label>Days (1=Sun)</label><input type="text" id="f-days" class="form-control" placeholder="1234567"></div>
                        <div class="form-group"><label>Language</label><input type="text" id="f-lang" class="form-control"></div>
                        <div class="form-group"><label>Azimuth</label><input type="text" id="f-azimuth" class="form-control" placeholder="ND"></div>
                        <div class="form-group" style="grid-column: 1 / -1;"><label>Location (Transmitter Site)</label><input type="text" id="f-loc" class="form-control"></div>
                        <div class="form-group" style="grid-column: 1 / -1;"><label>Coordinates (DMS: DDMMSS(N/S)DDDMMSS(E/W))</label><input type="text" id="f-latlon" class="form-control" placeholder="e.g. 332756N1301032E"></div>
                        <div class="form-group" style="grid-column: 1 / -1;"><label>Remarks / Info</label><input type="text" id="f-rem" class="form-control"></div>
                    </div>
                    <div style="text-align:right; margin-top:30px;">
                        <button type="button" class="btn" style="margin-right: 10px;" onclick="closeModal()">Cancel</button>
                        <button type="submit" class="btn primary">Update List</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- IMPORT & ADD MODAL -->
        <div id="import-modal" class="modal">
            <div class="modal-content" style="max-width: 650px;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:15px; margin-bottom:15px;">
                    <h3 style="margin:0; color:var(--accent);">Add / Import Database</h3>
                    <span style="font-size:24px; cursor:pointer;" onclick="closeImportModal()">&times;</span>
                </div>
                
                <div style="display:flex; gap:10px; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
                    <button class="im-tab primary" id="btn-im-new" onclick="switchImportTab('im-new')">New DB</button>
                    <button class="im-tab" id="btn-im-json" onclick="switchImportTab('im-json')">JSON</button>
                    <button class="im-tab" id="btn-im-aoki" onclick="switchImportTab('im-aoki')">AOKI (TXT)</button>
                    <button class="im-tab" id="btn-im-csv" onclick="switchImportTab('im-csv')">MWList (CSV)</button>
                </div>

                <!-- New DB Tab -->
                <div id="im-new" class="im-pane" style="display:block;">
                    <p style="font-size:13px; color:var(--text-muted);">Create an empty database and start adding stations manually.</p>
                    <input type="text" id="im-new-name" class="form-control wide" placeholder="e.g. user.json" style="margin-bottom: 15px;">
                    <br><button class="btn primary" onclick="createNewDB()">Create Database</button>
                </div>

                <!-- JSON Tab -->
                <div id="im-json" class="im-pane" style="display:none;">
                    <p style="font-size:13px; color:var(--text-muted);">Import an existing AM-Station-Info JSON database from your computer.</p>
                    <input type="file" id="im-json-file" accept=".json" class="form-control wide" style="margin-bottom: 15px;">
                </div>

                <!-- AOKI Tab -->
                <div id="im-aoki" class="im-pane" style="display:none;">
                    <div style="background:rgba(255, 193, 7, 0.1); border-left:3px solid #ffc107; padding:10px; font-size:12px; margin-bottom:15px; color: #ffc107;">
                        <strong>Warning:</strong> If you use the Auto-Update Database feature, you will get 2 different AOKI lists.<br> It is recommended that you disable Auto-Update Database and delete the existing AOKI database before adding your own.
                    </div>
                    <p style="font-size:13px; color:var(--text-muted);">
                        Download the latest <strong>Axx/Bxx shortwave schedule ziped file</strong> zip from <a href="https://www1.s2.starcat.ne.jp/ndxc/" target="_blank" style="color:var(--accent);">NDXC</a>.<br> Extract and upload xxxxx.txt here.<br>Filenames will be similar to <strong>xta26.txt</strong> or <strong>nsb25.txt</strong>. and are typically around 700-800 kB.
                    </p>
                    <div style="display:flex; gap:10px; margin-bottom: 15px;">
                        <input type="number" id="im-aoki-min" class="form-control" placeholder="Min Freq (kHz)" style="width: 140px;">
                        <input type="number" id="im-aoki-max" class="form-control" placeholder="Max Freq (kHz)" style="width: 140px;">
                    </div>
                    <input type="file" id="im-aoki-file" accept=".txt" class="form-control wide" style="margin-bottom: 15px;">
                </div>

                <!-- CSV Tab -->
                <div id="im-csv" class="im-pane" style="display:none;">
                    <div style="background:rgba(255, 193, 7, 0.1); border-left:3px solid #ffc107; padding:10px; font-size:12px; margin-bottom:15px; color: #ffc107;">
                        <strong>Note:</strong> This will overwrite any existing MWList.json upon saving.
                    </div>
                    <p style="font-size:13px; color:var(--text-muted);">
                        1. Go to <a href="https://fmscan.org/index.php" target="_blank" style="color:var(--accent);">fmscan.org/index.php</a> (Requires FMLIST/MWLIST account).<br>
                        2. Click <strong>Tools (userlist etc.)</strong> and <strong>Userlists for Perseus / ELAD / Winradio / Stationlist / SDR Console</strong><br>
                        3. Select <strong>LW/MW/SW (0-30 MHz)</strong>, <strong>CSV format</strong> and <strong>semicolon</strong>.<br>
                        4. Click <strong>DOWNLOAD userlist1.csv</strong> and wait a few seconds while fresh data is retrieved. Save it on your computer.<br>
                        5. Upload <strong>userlist1.csv</strong> here.
                    </p>
                    <div style="display:flex; gap:10px; margin-bottom: 15px;">
                        <input type="number" id="im-csv-min" class="form-control" placeholder="Min Freq (kHz)" style="width: 140px;">
                        <input type="number" id="im-csv-max" class="form-control" placeholder="Max Freq (kHz)" style="width: 140px;">
                    </div>
                    <input type="file" id="im-csv-file" accept=".csv,.txt" class="form-control wide" style="margin-bottom: 15px;">
                </div>
            </div>
        </div>

        <div id="toast" class="toast">Success!</div>

        <script>
            let originalSettings = {};
            let dbIsDirty = false;
            let originalDB =[]; 

            function captureSettings() {
                document.querySelectorAll('#tab-settings input, #tab-settings select').forEach(el => {
                    originalSettings[el.id] = el.type === 'checkbox' ? el.checked : el.value;
                });
            }

            function checkUnsavedState() {
                let settingsChanged = false;
                document.querySelectorAll('#tab-settings input, #tab-settings select').forEach(el => {
                    let currentVal = el.type === 'checkbox' ? el.checked : el.value;
                    if (originalSettings[el.id] !== currentVal) settingsChanged = true;
                });

                if (settingsChanged || dbIsDirty) {
                    document.getElementById('unsavedBar').classList.add('visible');
                } else {
                    document.getElementById('unsavedBar').classList.remove('visible');
                }
            }

            function checkVisibility() {
                const useServerPos = document.getElementById('cfg-useServerPos').checked;
                document.getElementById('row-sortType').style.display = useServerPos ? 'none' : 'flex';

                const showKp = document.getElementById('cfg-showKp').checked;
                document.getElementById('row-kpProvider').style.display = showKp ? 'flex' : 'none';
                document.getElementById('row-showKpForecast').style.display = showKp ? 'flex' : 'none';

                const db1 = document.getElementById('cfg-dbUpdate1').value;
                document.getElementById('row-updateUrl').style.display = (db1 === 'custom') ? 'flex' : 'none';

                const db2 = document.getElementById('cfg-dbUpdate2').value;
                document.getElementById('row-updateUrl2').style.display = (db2 === 'custom') ? 'flex' : 'none';
            }

            function discardChanges() {
                document.querySelectorAll('#tab-settings input, #tab-settings select').forEach(el => {
                    if (originalSettings[el.id] !== undefined) {
                        if (el.type === 'checkbox') el.checked = originalSettings[el.id];
                        else el.value = originalSettings[el.id];
                    }
                });
                
                checkVisibility();

                if (dbIsDirty) {
                    activeDB = JSON.parse(JSON.stringify(originalDB));
                    renderTable();
                    dbIsDirty = false;
                }

                checkUnsavedState();
                showToast("All changes discarded.", true); 
            }

            document.addEventListener('DOMContentLoaded', () => {
                captureSettings();
                checkVisibility();
                
                document.querySelectorAll('#tab-settings input, #tab-settings select').forEach(el => {
                    el.addEventListener('change', () => {
                        checkUnsavedState();
                        checkVisibility();
                    });
                    el.addEventListener('input', () => {
                        checkUnsavedState();
                        checkVisibility();
                    });
                });
            });

            function showToast(msg, isError = false) {
                const t = document.getElementById("toast"); 
                t.innerText = msg; t.style.backgroundColor = isError ? "var(--danger)" : "var(--success)";
                t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 3000);
            }

            function switchTab(tab) {
                document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
                event.target.classList.add('active');
                document.getElementById('tab-settings').style.display = tab === 'settings' ? 'block' : 'none';
                document.getElementById('tab-editor').style.display = tab === 'editor' ? 'flex' : 'none';
                if(tab === 'editor') { fetchServerFilesList(); initBands(); }
            }

            async function globalSave() {
                const keys =['freqMargin', 'selectedList', 'sortType', 'dbUpdate1', 'updateUrl', 'dbUpdate2', 'updateUrl2', 'kpProvider'];
                const bools =['useServerPos', 'useMapModal', 'useSettingsModal', 'autoUpdate', 'hideInactive', 'showKp', 'showKpForecast', 'showTerminator', 'showPath', 'showCountryLabels', 'showCapitalLabels', 'showGraph', 'extendedInfo'];
    
                let data = {};
                keys.forEach(k => data[k] = document.getElementById('cfg-'+k).value);
                data.freqMargin = parseInt(data.freqMargin, 10);
    
                bools.forEach(k => data[k] = document.getElementById('cfg-'+k).checked);
                data.useMiles = document.getElementById('cfg-useMiles').value === 'true';

                let configSuccess = true;
                try {
                    const res = await fetch('/AM-Station_info/api/config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
                    if (!res.ok) configSuccess = false;
                } catch (e) { configSuccess = false; }

                let dbSuccess = true;
                if (dbIsDirty && activeDB.length > 0) {
                    if (!activeFilename) {
                        activeFilename = prompt("Enter filename for the database (must end with .json):", "user.json");
                    }
                    if (activeFilename) {
                        try {
                            const resDb = await fetch('/AM-Station_info/api/databases/' + encodeURIComponent(activeFilename), { method: 'POST', headers: {'Content-Type': 'text/plain'}, body: JSON.stringify(activeDB) });
                            if(!resDb.ok) dbSuccess = false;
                            else {
                                fetchServerFilesList();
                                originalDB = JSON.parse(JSON.stringify(activeDB)); 
                            }
                        } catch(e) { dbSuccess = false; }
                    }
                }

                if (configSuccess && dbSuccess) {
                    showToast("Successfully saved all changes!");
                    dbIsDirty = false;
                    captureSettings(); 
                    checkUnsavedState(); 
                } else {
                    showToast("Failed to save some changes.", true);
                }
            }

            // ==========================================
            // DATABASE EDITOR LOGIC (TAB 2)
            // ==========================================
            let activeDB = [], filteredDB =[], currentPage = 1, activeFilename = "";
            const ITEMS_PER_PAGE = 50;
            const bands = {
                'All Bands': { min: 0, max: 99999 }, 'LW': { min: 153, max: 279 }, 'MW': { min: 531, max: 1701 },
                'SW 120m': { min: 2300, max: 2495 }, 'SW 90m': { min: 3200, max: 3400 }, 'SW 75m': { min: 3900, max: 4000 },
                'SW 60m': { min: 4750, max: 5060 }, 'SW 49m': { min: 5900, max: 6200 }, 'SW 41m': { min: 7200, max: 7600 },
                'SW 31m': { min: 9400, max: 9900 }, 'SW 25m': { min: 11600, max: 12100 }, 'SW 22m': { min: 13570, max: 13870 },
                'SW 19m': { min: 15100, max: 15830 }, 'SW 16m': { min: 17480, max: 17900 }, 'SW 15m': { min: 18900, max: 19020 },
                'SW 13m': { min: 21450, max: 21850 }, 'SW 11m': { min: 25670, max: 26100 }
            };

            function initBands() {
                const sel = document.getElementById('ed-band');
                if (sel.options.length > 0) return;
                for (const band in bands) sel.innerHTML += "<option value='" + band + "'>" + band + "</option>";
            }

            function deleteBand() {
                const bName = document.getElementById('ed-band').value;
                if (bName === 'All Bands') return;
                const b = bands[bName];
                const count = activeDB.filter(s => {
                    const f = s.frequency_khz || s.frequency || 0;
                    return f >= b.min && f <= b.max;
                }).length;
                if(count === 0) return alert("No stations found in this band.");
                
                if(confirm("Are you sure you want to delete " + count + " stations in " + bName + " (" + b.min + "-" + b.max + " kHz)?")) {
                    activeDB = activeDB.filter(s => {
                        const f = s.frequency_khz || s.frequency || 0;
                        return f < b.min || f > b.max;
                    });
                    renderTable(); 
                    dbIsDirty = true; checkUnsavedState();
                }
            }

            async function fetchServerFilesList() {
                const res = await fetch('/AM-Station_info/api/databases');
                if (!res.ok) return;
                const data = await res.json();
                const sel = document.getElementById('ed-serverFiles');
                sel.innerHTML = '<option value="">-- Select File --</option>';
                data.files.forEach(f => sel.innerHTML += "<option value='" + f + "'>" + f + "</option>");
            }

            async function loadServerDB() {
                const f = document.getElementById('ed-serverFiles').value;
                if(!f) return; showToast("Downloading...");
                activeDB = await (await fetch('/AM-Station_info/api/databases/'+f)).json();
                originalDB = JSON.parse(JSON.stringify(activeDB)); 
                activeFilename = f; currentPage = 1; document.getElementById('ed-search').value = ""; document.getElementById('ed-band').value = "All Bands";
                renderTable(); 
                dbIsDirty = false; checkUnsavedState(); 
                showToast("Loaded " + f);
            }

            async function deleteServerDB() {
                const f = document.getElementById('ed-serverFiles').value;
                if(!f || !confirm("Are you absolutely sure you want to delete " + f + "?")) return;
                if((await fetch('/AM-Station_info/api/databases/'+f, { method: 'DELETE' })).ok) { 
                    fetchServerFilesList(); 
                    activeDB =[]; originalDB =[];
                    renderTable(); 
                    dbIsDirty = false; checkUnsavedState(); 
                    showToast("Deleted " + f); 
                }
            }

            function renderTable() {
                const q = document.getElementById('ed-search').value.toLowerCase().trim();
                const b = bands[document.getElementById('ed-band').value];
                document.getElementById('ed-delBandBtn').style.display = document.getElementById('ed-band').value === 'All Bands' ? 'none' : 'block';

                filteredDB = activeDB.filter(s => {
                    const f = s.frequency_khz || s.frequency || 0;
                    if (f < b.min || f > b.max) return false;
                    if (!q) return true;
                    const stat = (s.station || s.name || '').toLowerCase();
                    const ctry = (s.country_code || s.country || '').toLowerCase();
                    return String(f) === q || stat.includes(q) || ctry === q;
                });
                filteredDB.sort((a,b) => (a.frequency_khz || a.frequency || 0) - (b.frequency_khz || b.frequency || 0));
                
                const tbody = document.getElementById('ed-tbody'); tbody.innerHTML = '';
                const start = (currentPage - 1) * ITEMS_PER_PAGE;
                filteredDB.slice(start, start + ITEMS_PER_PAGE).forEach(s => {
                    const realIdx = activeDB.indexOf(s);
                    
                    const f = s.frequency_khz || s.frequency || '';
                    const name = s.station || s.name || '?';
                    const utc = s.time_utc || s.timeUTC || '';
                    const days = s.days || '';
                    const pwr = s.power_kw !== undefined && s.power_kw !== null ? s.power_kw : (s.power !== undefined && s.power !== null ? s.power : '');
                    const ctry = s.country_code || s.country || '';
                    const latlon = s.latlon || '';

                    // Vi legger class='hide-mob' på kolonnene vi ikke vil ha på mobil, pluss at "Actions" kolonnen får knappene side-om-side med bittelitt mellomrom
                    tbody.innerHTML += "<tr>" +
                        "<td><strong style='color:var(--accent);'>" + f + "</strong></td>" +
                        "<td style='font-weight:500; white-space:normal;'>" + name + "</td>" +
                        "<td class='hide-mob'>" + utc + "</td>" +
                        "<td class='hide-mob'>" + days + "</td>" +
                        "<td class='hide-mob'>" + pwr + "</td>" +
                        "<td class='hide-mob'>" + ctry + "</td>" +
                        "<td class='hide-mob' style='font-family:monospace; color:var(--text-muted);'>" + latlon + "</td>" +
                        "<td><button class='btn' style='padding:4px 8px; font-size:12px; margin-right:4px;' onclick='openModal(" + realIdx + ")'>Edit</button><button class='btn danger' style='padding:4px 8px; font-size:12px;' onclick='delStation(" + realIdx + ")'>Del</button></td>" +
                        "</tr>";
                });
                document.getElementById('ed-info').innerText = activeDB.length + " total (Filtered: " + filteredDB.length + ")";
                document.getElementById('ed-pageInfo').innerText = "Page " + currentPage + " / " + Math.max(1, Math.ceil(filteredDB.length / ITEMS_PER_PAGE));
            }

            function edPage(dir) { const max = Math.ceil(filteredDB.length / ITEMS_PER_PAGE); if(currentPage + dir > 0 && currentPage + dir <= max) { currentPage += dir; renderTable(); } }

            function openModal(idx) {
                document.getElementById('ed-index').value = idx; 
                const s = idx >= 0 ? activeDB[idx] : {};
                document.getElementById('ed-modalTitle').innerText = idx >= 0 ? "Edit Station" : "Add New Station";['freq','name','power','country','time','days','lang','azimuth','loc','latlon','rem'].forEach(k => {
                    let val = "";
                    if(k==='freq') val = s.frequency_khz || s.frequency || ''; 
                    else if(k==='name') val = s.station || s.name || ''; 
                    else if(k==='power') val = s.power_kw !== undefined && s.power_kw !== null ? s.power_kw : (s.power !== undefined && s.power !== null ? s.power : ''); 
                    else if(k==='country') val = s.country_code || s.country || ''; 
                    else if(k==='time') val = s.time_utc || s.timeUTC || ''; 
                    else if(k==='days') val = s.days || ''; 
                    else if(k==='lang') val = s.language || ''; 
                    else if(k==='loc') val = s.location || ''; 
                    else if(k==='latlon') val = s.latlon || ''; 
                    else if(k==='rem') val = s.remarks || ''; 
                    else if(k==='azimuth') val = s.azimuth || '';
                    document.getElementById('f-'+k).value = val;
                });
                document.getElementById('ed-modal').style.display = 'block';
            }

            function closeModal() { document.getElementById('ed-modal').style.display = 'none'; }
            
            function delStation(idx) { 
                if(confirm("Remove this station?")) { 
                    activeDB.splice(idx,1); renderTable(); 
                    dbIsDirty = true; checkUnsavedState(); 
                } 
            }

            function saveStation(e) {
                e.preventDefault();
                const idx = parseInt(document.getElementById('ed-index').value);
                const pwrRaw = document.getElementById('f-power').value;
                
                const stFreq = parseInt(document.getElementById('f-freq').value) || 0;
                const stName = document.getElementById('f-name').value;
                const stPwr = pwrRaw !== "" ? parseFloat(pwrRaw) : null;
                const stCtry = document.getElementById('f-country').value;
                const stTime = document.getElementById('f-time').value;
                const stDays = document.getElementById('f-days').value;
                const stLang = document.getElementById('f-lang').value;
                const stAz = document.getElementById('f-azimuth').value;
                const stLoc = document.getElementById('f-loc').value;
                const stLatlon = document.getElementById('f-latlon').value;
                const stRem = document.getElementById('f-rem').value;

                let st;
                if (activeFilename === 'scale_favorites.json') {
                    st = {
                        name: stName,
                        frequency: stFreq,
                        country: stCtry,
                        location: stLoc,
                        power: stPwr,
                        distance: (idx !== -1 && activeDB[idx] && activeDB[idx].distance !== undefined) ? activeDB[idx].distance : null,
                        azimuth: stAz,
                        language: stLang,
                        timeUTC: stTime,
                        source: (idx !== -1 && activeDB[idx] && activeDB[idx].source) ? activeDB[idx].source : "©USER-EDIT"
                    };
                } else {
                    st = {
                        frequency_khz: stFreq,
                        station: stName,
                        power_kw: stPwr,
                        country_code: stCtry,
                        time_utc: stTime,
                        days: stDays,
                        language: stLang,
                        azimuth: stAz,
                        location: stLoc,
                        latlon: stLatlon,
                        remarks: stRem
                    };
                }
                
                if(idx === -1) activeDB.push(st); 
                else activeDB[idx] = st;
                
                closeModal(); 
                renderTable(); 
                dbIsDirty = true; 
                checkUnsavedState();
            }

            // ==========================================
            // ADD / IMPORT MODAL LOGIC
            // ==========================================
            function openImportModal() { document.getElementById('import-modal').style.display = 'block'; }
            function closeImportModal() { document.getElementById('import-modal').style.display = 'none'; }
            
            function switchImportTab(tabId) {
                document.querySelectorAll('.im-pane').forEach(el => el.style.display = 'none');
                document.querySelectorAll('.im-tab').forEach(el => { el.classList.remove('primary'); });
                
                document.getElementById(tabId).style.display = 'block';
                const btn = document.getElementById('btn-' + tabId);
                if (btn) btn.classList.add('primary');
            }

            function createNewDB() {
                let name = document.getElementById('im-new-name').value.trim();
                if (!name) return alert("Please enter a filename.");
                if (!name.endsWith('.json')) name += '.json';
                
                activeDB =[];
                activeFilename = name;
                showToast("Created empty DB: " + name);
                document.getElementById('im-new-name').value = '';
                closeImportModal();
                currentPage = 1; document.getElementById('ed-search').value = ""; document.getElementById('ed-band').value = "All Bands"; 
                renderTable(); dbIsDirty = true; checkUnsavedState();
            }

            document.getElementById('im-json-file').addEventListener('change', e => {
                const file = e.target.files[0]; if(!file) return;
                const reader = new FileReader();
                reader.onload = ev => {
                    try { 
                        activeDB = JSON.parse(ev.target.result); 
                        activeFilename = file.name; 
                        showToast("Imported " + activeDB.length + " stations from JSON."); 
                        closeImportModal();
                        currentPage = 1; document.getElementById('ed-search').value = ""; document.getElementById('ed-band').value = "All Bands"; 
                        renderTable(); dbIsDirty = true; checkUnsavedState();
                    } catch(err) { alert("Invalid JSON file."); }
                    document.getElementById('im-json-file').value = '';
                };
                reader.readAsText(file, 'utf8');
            });

            document.getElementById('im-aoki-file').addEventListener('change', e => {
                const file = e.target.files[0]; if(!file) return;
                const minFreq = parseInt(document.getElementById('im-aoki-min').value) || 0;
                const maxFreq = parseInt(document.getElementById('im-aoki-max').value) || 999999;
                const reader = new FileReader();
                reader.onload = ev => {
                    const text = ev.target.result;
                    activeDB = text.split(/\\r?\\n/).map(line => {
                        if (!line.trim() || !/^\\s*\\d{2,5}/.test(line)) return null;
                        const f = parseInt(line.substring(0, 5).trim()); 
                        if (f < minFreq || f > maxFreq) return null; 
                        const p = parseFloat(line.substring(76, 80).trim());
                        return { frequency_khz: f, station: line.substring(6, 37).trim(), time_utc: line.substring(38, 47).trim(), days: line.substring(48, 55).trim(), language: line.substring(56, 76).trim(), power_kw: isNaN(p) ? null : p, azimuth: line.substring(81, 84).trim(), location: line.substring(85, 109).trim(), country_code: line.substring(109, 112).trim(), latlon: line.substring(113, 129).trim(), remarks: line.substring(129).trim() };
                    }).filter(s => s !== null);
                    activeFilename = 'aoki-' + file.name.replace('.txt','.json'); 
                    showToast("Imported " + activeDB.length + " stations from Aoki!");
                    document.getElementById('im-aoki-file').value = '';
                    closeImportModal();
                    currentPage = 1; document.getElementById('ed-search').value = ""; document.getElementById('ed-band').value = "All Bands"; 
                    renderTable(); dbIsDirty = true; checkUnsavedState();
                };
                reader.readAsText(file, 'ISO-8859-1');
            });

            document.getElementById('im-csv-file').addEventListener('change', e => {
                const file = e.target.files[0]; if(!file) return;
                const minFreq = parseInt(document.getElementById('im-csv-min').value) || 0;
                const maxFreq = parseInt(document.getElementById('im-csv-max').value) || 999999;
                const reader = new FileReader();
                
                const toDMS = (val, isLat) => { 
                    const dir = val >= 0 ? (isLat ? 'N' : 'E') : (isLat ? 'S' : 'W'); 
                    val = Math.abs(val); 
                    const deg = Math.floor(val); 
                    const min = Math.floor((val - deg) * 60); 
                    const sec = Math.round(((val - deg) * 60 - min) * 60); 
                    const pad = (n, w) => n.toString().padStart(w || 2, '0');
                    const degStr = isLat ? pad(deg, 2) : pad(deg, 3);
                    return degStr + pad(min) + pad(sec) + dir; 
                };

                reader.onload = ev => {
                    const parsed =[]; 
                    const lines = ev.target.result.split(/\\r?\\n/);
                    for (let i = 0; i < lines.length; i++) {
                        const cols = lines[i].trim().split(';').map(c => c.replace(/"/g, '').trim()); 
                        if (cols.length < 10 || lines[i].trim().startsWith('=')) continue;
                        let f = parseFloat(cols[0]); if (isNaN(f)) continue; 
                        if (f > 30000) f = f / 1000; f = Math.round(f); 
                        if (f < minFreq || f > maxFreq) continue;
                        
                        let lat = parseFloat(cols[6]), lon = parseFloat(cols[7]);
                        let latlonStr = (!isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0)) ? toDMS(lat, true) + toDMS(lon, false) : "";
                        
                        parsed.push({ frequency_khz: f, station: cols[3] || 'Unknown', time_utc: cols[15] || '0000-2400', days: cols[16] || '1234567', language: cols[2] || '', power_kw: isNaN(parseFloat(cols[9])) ? null : parseFloat(cols[9]), azimuth: '', location: cols[5] || '', country_code: cols[1] || '', latlon: latlonStr, remarks: 'FMSCAN Import' });
                    }
                    activeDB = parsed; 
                    activeFilename = 'MWList.json'; 
                    showToast("Imported " + activeDB.length + " stations from FMSCAN!");
                    document.getElementById('im-csv-file').value = '';
                    closeImportModal();
                    currentPage = 1; document.getElementById('ed-search').value = ""; document.getElementById('ed-band').value = "All Bands"; 
                    renderTable(); dbIsDirty = true; checkUnsavedState();
                };
                reader.readAsText(file, 'ISO-8859-1');
            });
            
            async function forceAutoUpdate() {
                showToast("Checking remote server for updates...");
                try {
                    const res = await fetch('/AM-Station_info/api/force-update', { method: 'POST' });
                    const data = await res.json();
                    if (data.success) {
                        showToast(data.message);
                    } else {
                        showToast(data.error, true);
                    }
                } catch(e) { 
                    showToast("Connection error while updating.", true); 
                }
            }
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

logInfo(`${pluginName}: Initialized (Dynamic Admin Panel layout)`);
