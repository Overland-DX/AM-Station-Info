// AM-Station-Info v1.1 — Fixed Resizing & Zoom Controls
// -----------------------------------------------------------------------

(function() {
  $(document).ready(function() {
    const AM_MAX_FREQ_MHZ = 27;
    const AOKI_API_URL = '/aoki-api-proxy';

    let qthLatitude = '59.91';
    let qthLongitude = '10.75';
    let debounceTimer;
    let stationList = [];
    let currentIndex = 0;
    let currentMode = 'FM';
    let currentFreqKHz = 0;
    let activityCheckInterval = null;
	

    const $stationContainer = $('#data-station-container');
    const $afContainer = $('#af-list');
    if ($stationContainer.length === 0) return;
    $stationContainer.parent().css('position', 'relative');

    const $aokiDisplay = $('<div>', { id: 'aoki-plugin-display' });
    const $aokiContent = $('<div>', { id: 'aoki-station-content' });
    const $navControls = $('<div>', { id: 'aoki-nav-controls' });
    const $prevButton = $('<button>').html('&lt;');
    const $counter = $('<span>');
    const $nextButton = $('<button>').html('&gt;');
    const $aokiSource = $('<span>', { id: 'aoki-source-display' });
    $navControls.append($prevButton, $counter, $nextButton).appendTo($aokiDisplay);
    $aokiDisplay.append($aokiContent, $aokiSource);

const tooltipHTML = 'This panel only shows information about available<br>stations in the database, this is not RDS data.<br><br>Click to open local map.';
const $tooltipText = $('<span>', { id: 'aoki-station-info-tooltip', class: 'aoki-tooltiptext' }).html(tooltipHTML);
$('body').append($tooltipText);
$tooltipText.hide();


function showTooltip() {
    const rect = $aokiDisplay[0].getBoundingClientRect();
    $tooltipText.css({
        top: `${rect.top}px`,
        left: `${rect.left + (rect.width / 2)}px`,
        opacity: 0
    }).show();
    setTimeout(() => { $tooltipText.css('opacity', 1); }, 10);
}

function hideTooltip() {
    $tooltipText.css('opacity', 0);
    setTimeout(() => {
        if ($tooltipText.css('opacity') === '0') {
            $tooltipText.hide();
        }
    }, 300); 
}

$aokiDisplay.on('mouseenter', showTooltip).on('mouseleave', hideTooltip);

$aokiDisplay.on('click', function(e) {
    e.stopPropagation(); 
    
    if ($tooltipText.is(':visible')) {
        hideTooltip();
    } else {
        showTooltip();
    }
});

$(document).on('click', function(e) {
    if (!$aokiDisplay.is(e.target) && $aokiDisplay.has(e.target).length === 0) {
        if ($tooltipText.is(':visible')) {
            hideTooltip();
        }
    }
});

    const style = document.createElement('style');
    style.textContent = `
      #aoki-plugin-display { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: var(--color-1); z-index: 1010; color: var(--color-text); box-sizing: border-box; display: none; text-align: center; border-radius: 15px; padding: 0px 10px; cursor: pointer; }
      #aoki-station-content { display: flex; flex-direction: column; justify-content: flex-start; height: 100%; }
      .station-name { margin-top: 0; font-size: 1.4em; font-weight: bold; text-transform: uppercase; margin-bottom: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--color-4); }
      .station-location { font-size: 0.9em; margin-bottom: 0px; }
      .station-meta { font-size: 0.9em; line-height: 1.4; }
      #aoki-nav-controls { position: absolute; bottom: 2px; right: 5px; display: flex; align-items: center; gap: 2px; font-size: 11px; cursor: default; }
      #aoki-nav-controls button { background: none; border: 1px solid var(--color-text); border-radius: 5px; color: var(--color-text); font-size: 11px; line-height: 1; cursor: pointer; opacity: 0.6; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; }
      #aoki-nav-controls button:hover { opacity: 1; }
      #aoki-source-display { position: absolute; bottom: 0px; left: 5px; font-size: 11px; opacity: 0.6; cursor: default; }
      .alt-freq-list { height: calc(100% - 50px); overflow-y: auto; font-size: 14px; }
      .alt-freq-item { padding: 4px 0; cursor: pointer; border-radius: 5px; }
      .alt-freq-item:hover { background-color: rgba(255, 255, 255, 0.1); }
#aoki-station-info-tooltip.aoki-tooltiptext {
    position: fixed;
    background-color: var(--color-2);
    border: 2px solid var(--color-3);
    color: var(--color-text);
    text-align: center;
    font-size: 14px;
    border-radius: 15px;
    padding: 8px 15px;
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
    white-space: nowrap;
    transform: translate(-50%, -100%);
    z-index: 1;
}
      #aoki-map-modal { position: fixed; inset: 0; z-index: 99998; display: none; }
      #aoki-map-modal .aoki-map-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.45); }
#aoki-map-modal .aoki-map-dialog {
    position: absolute;
    
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 75vw; 
    height: 80vh; 
    max-width: 1400px;
    max-height: 850px;
    background: var(--color-1);
    border-radius: 14px;
    box-shadow: 0 10px 30px rgba(0,0,0,.35);
    overflow: hidden;
    z-index: 99999;
}
.leaflet-top.leaflet-right .leaflet-control-zoom {
    margin-top: 50px;
    margin-right: 12px;
}
      #aoki-map-modal .aoki-map-close { position: absolute; top: 8px; right: 10px; width: 34px; height: 34px; border-radius: 8px; border: 1px solid rgba(255,255,255,.3); background: rgba(0,0,0,.25); color: #fff; font-size: 20px; cursor: pointer; z-index: 100001; }
      #aoki-map { width:100%; height:100%; }
      .ne-place-label span { font-size: 12px; color: #f0f0f0; text-shadow: 0 1px 3px rgba(0,0,0,.9); white-space: nowrap; user-select: none; pointer-events: none; }
      #aoki-map-infobox { position: absolute; top: 15px; left: 15px; width: 280px; background: rgba(20, 20, 20, 0.85); border: 1px solid #777; border-radius: 8px; z-index: 100000; box-shadow: 0 2px 10px rgba(0,0,0,.5); color: #f0f0f0; font-family: sans-serif; font-size: 14px; pointer-events: none; }
      #aoki-map-infobox > * { pointer-events: auto; }
      #aoki-map-infobox .info-header { padding: 8px 12px; background: rgba(40, 40, 40, 0.9); border-bottom: 1px solid #777; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-radius: 8px 8px 0 0; }
      #aoki-map-infobox .info-header h4 { margin: 0; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      #aoki-map-infobox .info-toggle { font-size: 20px; font-weight: bold; padding: 0 5px; }
      #aoki-map-infobox .info-content { padding: 12px; max-height: 400px; overflow-y: auto; display: none; }
	  #aoki-map-infobox.is-open .info-content { display: block; }
      #aoki-map-infobox .info-content p { margin: 0 0 8px 0; line-height: 1.4; }
      #aoki-map-infobox .info-content strong { color: #fff; min-width: 90px; display: inline-block; }
      @media (max-width: 700px) { #aoki-map-modal .aoki-map-dialog { inset: 8% 3% auto 3%; height: 84%; } }
      @media (max-width: 600px) { .station-name { font-size: 1.2em; } #af-list, #aoki-custom-tooltip.tooltiptext { display: none !important; } }
    `;
    document.head.appendChild(style);
    $stationContainer.parent().append($aokiDisplay);
    $aokiDisplay.on('mouseenter mouseover mousemove', e => e.stopPropagation());

    const $mapModal = $(`<div id="aoki-map-modal"><div class="aoki-map-backdrop"></div><div class="aoki-map-dialog"><button class="aoki-map-close" aria-label="Close">×</button><div id="aoki-map"></div></div></div>`);
    $('body').append($mapModal);

    const LOCAL_LEAFLET_CSS = '/assets/leaflet/leaflet.css';
    const LOCAL_LEAFLET_JS = '/assets/leaflet/leaflet.js';


    function loadCSS(href) { return new Promise((res, rej) => { const l=document.createElement('link');l.rel='stylesheet';l.href=href;l.onload=()=>res();l.onerror=()=>rej();document.head.appendChild(l); }); }
    function loadJS(src) { return new Promise((res, rej) => { const s=document.createElement('script');s.src=src;s.onload=()=>res();s.onerror=()=>rej();document.head.appendChild(s); }); }

    let leafletReady = null;
    function ensureLeafletLoaded() {
        if (window.L) return Promise.resolve();
        if (leafletReady) return leafletReady;
        leafletReady = loadCSS(LOCAL_LEAFLET_CSS)
            .catch(() => loadCSS(CDN_LEAFLET_CSS))
            .then(() => loadJS(LOCAL_LEAFLET_JS).catch(() => loadJS(CDN_LEAFLET_JS)));
        return leafletReady;
    }

    const COUNTRIES_GEOJSON = '/assets/world_countries_50m.geojson';
    const PLACES_GEOJSON = '/assets/places_rich.geojson';
    let leafletMap = null, currentLine = null, qthMarker = null, txMarker = null, basemapLoaded = false;
    let mapNeedsResize = false; 
    function ensureLeafletMap() {
        if (leafletMap) return;
        leafletMap = L.map('aoki-map', { zoomControl: false, attributionControl: false });
        L.control.zoom({ position: 'topright' }).addTo(leafletMap);
        leafletMap.setView([20, 0], 2);
    }
    
    function loadOfflineBasemapOnce() {
        if (basemapLoaded) return Promise.resolve();
        $('#aoki-map').css('background', '#e9ecef');
        const fetchJson = (url) => fetch(url).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
        const countriesPromise = fetchJson(COUNTRIES_GEOJSON).then(geo => L.geoJSON(geo, { style: { color: '#3f3f3f', weight: 1, opacity: 1, fillColor: '#8c8c8c', fillOpacity: 0.8 } }).addTo(leafletMap));
        const placesPromise = fetchJson(PLACES_GEOJSON).then(geo => {
            const readRank = p => (p?.SCALERANK == null ? 3 : +p.SCALERANK);
            const isBig = p => readRank(p) <= 2;
            const isMed = p => readRank(p) > 2 && readRank(p) <= 4;
            const mk = (filterFn) => L.geoJSON(geo, {
                filter: f => filterFn(f.properties || {}),
                pointToLayer: (feature, latlng) => L.marker(latlng, {
                    icon: L.divIcon({ className: 'ne-place-label', html: `<span>${feature.properties?.NAME || ''}</span>`, iconSize: [0, 0] }),
                    keyboard: false, interactive: false
                })
            });
            const placesBigLayer = mk(isBig).addTo(leafletMap);
            const placesMedLayer = mk(isMed);
            const placesSmallLayer = mk(p => !isBig(p) && !isMed(p));
            const update = () => {
                const z = leafletMap.getZoom();
                if (z >= 4 && !leafletMap.hasLayer(placesMedLayer)) leafletMap.addLayer(placesMedLayer);
                else if (z < 4 && leafletMap.hasLayer(placesMedLayer)) leafletMap.removeLayer(placesMedLayer);
                if (z >= 6 && !leafletMap.hasLayer(placesSmallLayer)) leafletMap.addLayer(placesSmallLayer);
                else if (z < 6 && leafletMap.hasLayer(placesSmallLayer)) leafletMap.removeLayer(placesSmallLayer);
            };
            leafletMap.on('zoomend', update); update();
        }).catch(err => console.error('Places load failed:', err));
        basemapLoaded = true;
        return Promise.all([countriesPromise, placesPromise]);
    }

    function getStationCoords(station) {
        const lat = station.lat ?? station.latitude;
        const lon = station.lon ?? station.longitude;
        if (lat == null || lon == null) return null;
        const numLat = parseFloat(lat), numLon = parseFloat(lon);
        return (Number.isFinite(numLat) && Number.isFinite(numLon)) ? { lat: numLat, lon: numLon } : null;
    }

function closeAndDestroyMap() {
    $('#aoki-map-modal').hide();
    if (leafletMap) {
        leafletMap.remove();
        leafletMap = null;
        basemapLoaded = false;
    }
}

 function openMapModalForStationOffline(station) {
    const stationLL = getStationCoords(station);
    if (!stationLL) { alert('Missing transmitter coordinates in station data.'); return; }

    $('#aoki-map-modal').show();

    ensureLeafletLoaded().then(() => {
        ensureLeafletMap();
        loadOfflineBasemapOnce().then(() => {
            if (mapNeedsResize) {

                mapNeedsResize = false;
            }

            if (currentLine) leafletMap.removeLayer(currentLine);
            if (qthMarker) leafletMap.removeLayer(qthMarker);
            if (txMarker) leafletMap.removeLayer(txMarker);
            $('#aoki-map-infobox').remove();

            const qthLat = parseFloat(qthLatitude), qthLon = parseFloat(qthLongitude);

            qthMarker = L.marker([qthLat, qthLon]).addTo(leafletMap).bindPopup('QTH (Receiver)');
            txMarker = L.marker([stationLL.lat, stationLL.lon]).addTo(leafletMap).bindPopup(`<b>${station.name}</b><br>${station.location}<br>Distance: ${station.distance} km`);

            currentLine = L.polyline([[qthLat, qthLon], [stationLL.lat, stationLL.lon]], { weight: 3, opacity: 0.9, dashArray: '6,8' }).addTo(leafletMap);
            leafletMap.fitBounds(currentLine.getBounds(), { padding: [50, 50] });

            const infoHTML = `
              <div id="aoki-map-infobox">
                <div class="info-header">
                  <h4>${station.name}</h4>
                  <span class="info-toggle" title="Show/hide details">−</span>
                </div>
                <div class="info-content">
                  <p><strong>Location:</strong> ${station.location||'N/A'}</p>
				  <p><strong>Distance:</strong> ${station.distance||'N/A'} km</p>
                  <p><strong>Country:</strong> ${station.country||'N/A'}</p>
                  <p><strong>Frequency:</strong> ${station.frequency||'N/A'} kHz</p>
                  <p><strong>Power:</strong> ${station.power||'N/A'} kW</p>
                  <p><strong>Broadcast:</strong> ${station.timeUTC||'N/A'} UTC</p>
                  <p><strong>Days:</strong> ${station.days||'N/A'}</p>
                  <p><strong>Language:</strong> ${station.language||'N/A'}</p>
                  <p><strong>Azimuth:</strong> ${station.azimuth||'N/A'}</p>
                  <p><strong>Info:</strong> ${station.remarks||'N/A'}</p>
                  <p><strong>Source:</strong> ${station.source||'N/A'}</p>
                </div>
              </div>`;
            
            const $infoBox = $(infoHTML).appendTo('#aoki-map-modal .aoki-map-dialog');
            
const $infoContent = $infoBox.find('.info-content');
$infoContent.show();

$infoBox.find('.info-header').on('click', function(e) {
    e.stopPropagation();
    $infoContent.slideToggle(200);
    $(this).find('.info-toggle').text((i, text) => text === '−' ? '+' : '−');
});
        });
    }).catch(err => {
        console.error("Could not load Leaflet:", err);
        alert("Error: The map library could not be loaded.");
    });
}
    
    $mapModal.on('click', '.aoki-map-backdrop, .aoki-map-close', closeAndDestroyMap);
    $(document).on('keydown', e => { if (e.key === 'Escape' && $('#aoki-map-modal').is(':visible')) closeAndDestroyMap(); });


    function fetchStaticData(){$.getJSON('/static_data',data=>{if(data.qthLatitude&&data.qthLongitude){qthLatitude=data.qthLatitude;qthLongitude=data.qthLongitude;}});}
    function displayAlternativeFrequencies(frequencies){$afContainer.empty();if(!frequencies||frequencies.length===0)return;let afHTML=`<div class="alt-freq-list" style="height:100%;">`;frequencies.forEach(freq=>{const displayFreq=freq>1000?(freq/1000).toFixed(3):freq;afHTML+=`<div class="alt-freq-item" data-freq="${freq}">${displayFreq}</div>`;});afHTML+=`</div>`;$afContainer.html(afHTML);}
    function tuneToFrequency(freqKHz){if(typeof socket!=='undefined'&&socket.readyState===WebSocket.OPEN){socket.send("T"+freqKHz);}}
    function areStationListsEqual(listA,listB){if(listA.length!==listB.length)return!1;for(let i=0;i<listA.length;i++){if(listA[i].name!==listB[i].name)return!1;}return!0;}
    function displayStation(){if(stationList.length===0){$aokiContent.html('<h4 style="padding-top:25px;margin:0;">No active stations found.</h4>');$navControls.hide();return;}
    const station=stationList[currentIndex];const stationHTML=`<div class="station-name">${station.name}</div><div class="station-location">${station.location} <span class="text-gray">[${station.country}]</span></div><div class="station-meta">${station.language} <span class="text-gray">▪</span> ${station.timeUTC}z</div><div class="station-meta">${station.power}kW <span class="text-gray">▪</span> ${station.distance}km</div>`;$aokiContent.html(stationHTML);$aokiSource.text(station.source).show();if(station.alternative_frequencies)displayAlternativeFrequencies(station.alternative_frequencies);else $afContainer.empty();$counter.text(`${currentIndex+1} / ${stationList.length}`);$navControls.toggle(stationList.length>1);}
    function fetchAndDisplayAokiData(freqMHz){currentFreqKHz=Math.round(freqMHz*1000);const url=`${AOKI_API_URL}?freq=${currentFreqKHz}&lat=${qthLatitude}&lon=${qthLongitude}`;$.getJSON(url).done(data=>{if(currentMode!=='AM')return;if(data&&data.status==='success'&&data.stations&&data.stations.length>0){const newStationList=data.stations;if(!areStationListsEqual(stationList,newStationList)){currentIndex=0;}
    stationList=newStationList;displayStation();}else{stationList=[];const errorMessage=data&&data.message?data.message:'No active stations found.';$aokiContent.html(`<h4 style="padding-top:25px;margin:0;">${errorMessage}</h4>`);$navControls.hide();$aokiSource.hide();$afContainer.empty();}}).fail(()=>{if(currentMode!=='AM')return;stationList=[];$aokiContent.html('<h4 style="padding-top:25px;margin:0;">Error loading data.</h4>');$navControls.hide();$aokiSource.hide();$afContainer.empty();});}
    function handleFrequencyChange(){clearTimeout(debounceTimer);debounceTimer=setTimeout(()=>{const freqText=$('#data-frequency').text();if(!freqText)return;const freqMHz=parseFloat(freqText);clearInterval(activityCheckInterval);if(freqMHz<=AM_MAX_FREQ_MHZ){if(currentMode!=='AM'){currentMode='AM';$stationContainer.hide();$aokiDisplay.show();}
    fetchAndDisplayAokiData(freqMHz);activityCheckInterval=setInterval(function(){fetchAndDisplayAokiData(freqMHz);},10000);}else{if(currentMode!=='FM'){currentMode='FM';$aokiDisplay.hide();$stationContainer.show();$afContainer.empty();$tooltipText.hide().css('opacity',0);}}},100);}

    $aokiDisplay.off('click').on('click', e => { if (!$(e.target).closest('button').length) { const station = stationList[currentIndex]; if (station) openMapModalForStationOffline(station); } });
    $prevButton.on('click', e => { e.stopPropagation(); currentIndex = (currentIndex - 1 + stationList.length) % stationList.length; displayStation(); });
    $nextButton.on('click', e => { e.stopPropagation(); currentIndex = (currentIndex + 1) % stationList.length; displayStation(); });
    $afContainer.on('click', '.alt-freq-item', function() { const freqKHz = $(this).data('freq'); if (freqKHz) tuneToFrequency(freqKHz); });

    fetchStaticData();
    const targetNode = document.getElementById('data-frequency');
    if (targetNode) {
        const observer = new MutationObserver(handleFrequencyChange);
        observer.observe(targetNode, { childList: true, subtree: true, characterData: true });
    }
    setTimeout(handleFrequencyChange, 1000);
    console.log('AM-Station-Info v1.1 - Loaded and Ready.');
  });
})();