// AM-Station-Info v1.2 — Added Day/Night Terminator Overlay
// -----------------------------------------------------------------------

(function() {
  $(document).ready(function() {
    const AM_MAX_FREQ_MHZ = 27;
    const AOKI_API_URL = '/aoki-api-proxy';
	const SHOW_PROPAGATION_GRAPH = true;

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
        top: `${rect.top - 10}px`,
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
      /* 
      ==============================================
      ==  1. AOKI PLUGIN DISPLAY (MAIN INFO BOX)  ==
      ==============================================
      */
      
      #aoki-plugin-display {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: var(--color-1);
        z-index: 1010;
        color: var(--color-text);
        box-sizing: border-box;
        display: none;
        text-align: center;
        border-radius: 15px;
        padding: 0px 10px;
        cursor: pointer;
      }
      
      #aoki-station-content {
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        height: 100%;
      }
      
      .station-name {
        margin-top: 0;
        font-size: 1.4em;
        font-weight: bold;
        text-transform: uppercase;
        margin-bottom: 1px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--color-4);
      }
      
      .station-location {
        font-size: 0.9em;
        margin-bottom: 0px;
      }
      
      .station-meta {
        font-size: 0.9em;
        line-height: 1.4;
      }
      
      #aoki-nav-controls {
        position: absolute;
        bottom: 2px;
        right: 5px;
        display: flex;
        align-items: center;
        gap: 2px;
        font-size: 11px;
        cursor: default;
      }
      
      #aoki-nav-controls button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        background: none;
        border: 1px solid var(--color-text);
        border-radius: 5px;
        color: var(--color-text);
        font-size: 11px;
        line-height: 1;
        cursor: pointer;
        opacity: 0.6;
      }
      
      #aoki-nav-controls button:hover {
        opacity: 1;
      }
      
      #aoki-source-display {
        position: absolute;
        bottom: 0px;
        left: 5px;
        font-size: 11px;
        opacity: 0.6;
        cursor: default;
      }
      
      .alt-freq-list {
        height: calc(100% - 50px);
        overflow-y: auto;
        font-size: 14px;
      }
      
      .alt-freq-item {
        padding: 4px 0;
        cursor: pointer;
        border-radius: 5px;
      }
      
      .alt-freq-item:hover {
        background-color: rgba(255, 255, 255, 0.1);
      }
      
      #aoki-station-info-tooltip.aoki-tooltiptext {
        position: fixed;
        transform: translate(-50%, -100%);
        z-index: 1;
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
      }

      /* 
      ==================================
      ==  2. MAP MODAL & COMPONENTS   ==
      ==================================
      */
      
      #aoki-map-modal {
        position: fixed;
        inset: 0;
        z-index: 99998;
        display: none;
      }
      
      #aoki-map-modal .aoki-map-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, .6);
        backdrop-filter: blur(10px);
      }
      
      #aoki-map-modal .aoki-map-dialog {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        display: flex;
        flex-direction: column;
        width: 75vw;
        height: 80vh;
        max-width: 1400px;
        max-height: 850px;
        background: var(--color-main);
        border-radius: 15px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, .35);
        overflow: hidden;
        z-index: 99999;
      }
      
      .aoki-map-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        height: 45px;
        padding: 5px 5px;
        background-color: var(--color-2);
        border-bottom: 1px solid var(--color-4);
        flex-shrink: 0;
      }
      
      .aoki-map-title {
        font-size: 20px;
        font-weight: bold;
        color: var(--color-main-bright);
      }
      
      .aoki-map-close {
        width: 100px;
        height: 34px;
        border-radius: 15px;
        
        background-color: var(--color-3);
        border: 1px solid var(--color-4);
        
        color: var(--color-main-bright);
        font-size: 20px;
        font-weight: normal;
        
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        
        cursor: pointer;
        transition: 0.3s ease background-color, 0.3s ease color;
      }
      
      .aoki-map-close:hover {
        background-color: var(--color-5);
        color: var(--color-1);
      }

      .aoki-map-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 45px;
        padding: 5px 10px;
        background-color: var(--color-2);
        border-top: 1px solid var(--color-4);
        flex-shrink: 0;
        gap: 10px;
      }

      .footer-data-left, .footer-data-right {
        flex: 0 0 100px;
      }

      #propagation-graph-container {
        flex-grow: 1;
        position: relative;
        height: 100%;
      }

      #propagation-graph {
        display: flex;
        width: 100%;
        height: 20px;
        border-radius: 5px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.2);
        position: absolute;
        bottom: 0;
      }

      .graph-zone {
        height: 100%;
        transition: width 0.5s ease; 
      }

      #graph-red-luf { background-color: #e74c3c; }
      #graph-green-window { background-color: #2ecc71; }
      #graph-yellow-muf { background-color: #f1c40f; }

      .graph-labels {
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        color: var(--color-text);
        opacity: 0.7;
        padding: 0 2px;
      }
	  #graph-markers {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 20px; 
        pointer-events: none;
      }

      .marker {
        position: absolute;
        height: 100%;
        width: 1px;
        background-color: rgba(0, 0, 0, 0.2);
      }

      .marker.label {
        height: 150%; 
        background-color: rgba(0, 0, 0, 0.4);
      }
      
      .marker.label::after {
        content: attr(data-label); 
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%); 
        font-size: 9px;
        color: var(--color-text);
        opacity: 0.7;
      }
      #graph-red-luf { background-color: #c0392b; }  
      #graph-yellow-low { background-color: #f1c40f; } 
      #graph-green-optimal { background-color: #2ecc71; } 
      #graph-yellow-high { background-color: #f1c40f; }  
      #graph-red-muf { background-color: #c0392b; }  

	  #frequency-pointer-container,
      #frequency-pointer-container-bottom {
        position: absolute;
        left: 0;
        width: 100%;
        height: 6px;
        z-index: 2;
        pointer-events: none;
      }

      #frequency-pointer-container {
        top: 9px;
      }
      
      #frequency-pointer-container-bottom {
        bottom: -5px;
      }

      #frequency-pointer-top,
      #frequency-pointer-bottom {
        position: absolute;
        width: 0; 
        height: 0; 
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        transform: translateX(-50%);
        display: none;
      }

      #frequency-pointer-top {
        border-top: 6px solid var(--color-4); /* Peker nedover */
      }

      #frequency-pointer-bottom {
        border-bottom: 6px solid var(--color-4); /* Peker oppover */
      }

      /* 
      ==================================
      ==  3. MAP CONTENT & OVERLAYS   ==
      ==================================
      */
      
      #aoki-map {
        width: 100%;
        height: 100%;
        flex-grow: 1;
      }
      
      .leaflet-top.leaflet-right .leaflet-control-zoom {
        margin-top: 12px;
        margin-right: 12px;
      }

      .country-label {
        background: transparent;
        border: none;
        box-shadow: none;
        color: rgba(0, 0, 0, 0.6);
        font-size: 14px;
        font-weight: bold;
        text-shadow: 0 0 2px #fff, 0 0 2px #fff;
        pointer-events: none;
        display: none;
      }

      .leaflet-zoom-3 .country-label,
      .leaflet-zoom-4 .country-label,
      .leaflet-zoom-5 .country-label {
        display: block;
      }
      
      .ne-place-label span {
        font-size: 12px;
        color: #f0f0f0;
        text-shadow: 0 1px 3px rgba(0, 0, 0, .9);
        white-space: nowrap;
        user-select: none;
        pointer-events: none;
      }
      
      #aoki-map-infobox {
        position: absolute;
        top: 60px;
        left: 15px;
        width: 280px;
        background: var(--color-1-transparent);
        border: 1px solid #777;
        border-radius: 8px;
        z-index: 100000;
        box-shadow: 0 2px 10px rgba(0, 0, 0, .5);
        color: var(--color-text);
        font-family: sans-serif;
        font-size: 14px;
        pointer-events: none;
      }
      
      #aoki-map-infobox > * {
        pointer-events: auto;
      }
      
      #aoki-map-infobox .info-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: var(--color-2);
        border-bottom: 1px solid #777;
        border-radius: 8px 8px 0 0;
        cursor: pointer;
      }
      
      #aoki-map-infobox .info-header h4 {
        margin: 0;
        font-size: 16px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      #aoki-map-infobox .info-toggle {
        padding: 0 5px;
        font-size: 20px;
        font-weight: bold;
      }
      
      #aoki-map-infobox .info-content {
        display: none;
        padding: 12px;
        max-height: 400px;
        overflow-y: auto;
      }
      
      #aoki-map-infobox.is-open .info-content {
        display: block;
      }
      
      #aoki-map-infobox .info-content p {
        margin: 0 0 8px 0;
        line-height: 1.4;
      }
      
      #aoki-map-infobox .info-content strong {
        display: inline-block;
        min-width: 90px;
        color: var(--color-main-bright);
      }

      .leaflet-control-zoom {
        border: none !important;
        box-shadow: 0 1px 5px rgba(0,0,0,0.4);
      }

      .leaflet-control-zoom-in,
      .leaflet-control-zoom-out {
        background-color: var(--color-2-transparent) !important;
        color: var(--color-main-bright) !important;
        transition: background-color 0.2s ease;
      }

      .leaflet-control-zoom-in:hover,
      .leaflet-control-zoom-out:hover {
        background-color: var(--color-4-transparent) !important;
      }

      .leaflet-control-zoom-in {
        border-top-left-radius: 10px !important;
        border-top-right-radius: 10px !important;
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
      }

      .leaflet-control-zoom-out {
        border-bottom-left-radius: 10px !important;
        border-bottom-right-radius: 10px !important;
        border-top-left-radius: 0;
        border-top-right-radius: 0;
        border-top: none;
      }

      /* 
      ====================================
      ==  4. RESPONSIVE DESIGN (MEDIA)  ==
      ====================================
      */
      
	@media (max-width: 700px) {
        #aoki-map-modal .aoki-map-dialog {
          box-sizing: border-box;

          top: 10px;
          right: 10px;
          bottom: 10px;
          left: 10px;
          
          width: 95vw;
          height: 75vh;
          transform: none;
        }

        #aoki-map-infobox {
          width: 240px;
          left: 10px;
          top: 55px;
        }

        .aoki-map-title {
          font-size: 18px;
        }

        .aoki-map-close {
          width: 80px;
        }
      }
      
      @media (max-width: 600px) {
        .station-name {
          font-size: 1.2em;
        }
        #af-list,
        #aoki-custom-tooltip.tooltiptext {
          display: none !important;
        }
      }
    `;

    document.head.appendChild(style);
    $stationContainer.parent().append($aokiDisplay);
    $aokiDisplay.on('mouseenter mouseover mousemove', e => e.stopPropagation());

	const $mapModal = $(`
      <div id="aoki-map-modal">
        <div class="aoki-map-backdrop"></div>
        <div class="aoki-map-dialog">
          <div class="aoki-map-header">
            <span class="aoki-map-title">Station Map</span>
            <button class="aoki-map-close" aria-label="Close">Close</button>
          </div>
          <div id="aoki-map"></div> 
          
          ${SHOW_PROPAGATION_GRAPH ? `
            <div class="aoki-map-footer">
              <div class="footer-data-left"></div>
              <div id="propagation-graph-container">
                <div id="frequency-pointer-container">
                  <div id="frequency-pointer-top"></div>
                </div>
                <div class="graph-labels">
                  <span>0 MHz</span>
                  <span>27 MHz</span>
                </div>
                <div id="propagation-graph">
                  <div id="graph-red-luf" class="graph-zone"></div>
                  <div id="graph-yellow-low" class="graph-zone"></div>
                  <div id="graph-green-optimal" class="graph-zone"></div>
                  <div id="graph-yellow-high" class="graph-zone"></div>
                  <div id="graph-red-muf" class="graph-zone"></div>
                  <div id="frequency-line"></div>
                </div>
                <div id="frequency-pointer-container-bottom">
                    <div id="frequency-pointer-bottom"></div>
                </div>
                <div id="graph-markers"></div>
              </div>
              <div class="footer-data-right"></div>
            </div>
          ` : ''}

        </div>
      </div>
    `);


    $('body').append($mapModal);

    const LOCAL_LEAFLET_CSS = '/assets/leaflet/leaflet.css';
    const LOCAL_LEAFLET_JS = '/assets/leaflet/leaflet.js';
    const LOCAL_LEAFLET_TERMINATOR_JS = '/assets/leaflet/L.Terminator.js';
	const LOCAL_LEAFLET_ARC_JS = '/assets/leaflet/arc.js';
	const LOCAL_LEAFLET_SUNCALC_JS = '/assets/leaflet/SunCalc.js';

    const dynamicProfileModel = [

        { event: 'nadir',      offsetHours: 0,    luf: 0,    greenStart: 0,    greenEnd: 9,    muf: 11 }, // Midt på natten
        { event: 'sunrise',    offsetHours: -1.5, luf: 0,    greenStart: 0.05, greenEnd: 8,    muf: 12 }, // 1.5t FØR soloppgang
        { event: 'sunrise',    offsetHours: 0,    luf: 0.2,  greenStart: 2,    greenEnd: 10,   muf: 16 }, // Nøyaktig soloppgang
        { event: 'sunrise',    offsetHours: 1.5,  luf: 4,    greenStart: 8,    greenEnd: 16,   muf: 20 }, // 1.5t ETTER soloppgang
        { event: 'solarNoon',  offsetHours: 0,    luf: 7,    greenStart: 12,   greenEnd: 18,   muf: 22 }, // Når solen er på sitt høyeste
        { event: 'solarNoon',  offsetHours: 3,    luf: 6,    greenStart: 10,   greenEnd: 17,   muf: 21 }, // 3t ETTER høyeste punkt (ettermiddag)
        { event: 'sunset',     offsetHours: -1,   luf: 2,    greenStart: 7,    greenEnd: 16,   muf: 18 }, // 1t FØR solnedgang
        { event: 'sunset',     offsetHours: 0,    luf: 0,    greenStart: 2,    greenEnd: 15,   muf: 18 }, // Nøyaktig solnedgang
        { event: 'sunset',     offsetHours: 2,    luf: 0,    greenStart: 0,    greenEnd: 14,   muf: 16 }  // 2t ETTER solnedgang
    ];

    function loadCSS(href) { return new Promise((res, rej) => { const l=document.createElement('link');l.rel='stylesheet';l.href=href;l.onload=()=>res();l.onerror=()=>rej();document.head.appendChild(l); }); }
    function loadJS(src) { return new Promise((res, rej) => { const s=document.createElement('script');s.src=src;s.onload=()=>res();s.onerror=()=>rej();document.head.appendChild(s); }); }

    let leafletReady = null;

function createGraphMarkers() {
    const container = $('#graph-markers');
    if (container.children().length > 0) return; 

    let markersHTML = '';
    const maxFreq = 27;

    for (let i = 1; i < maxFreq; i++) {
        const percentPosition = (i / maxFreq) * 100;
        let className = 'marker';
        let dataAttribute = '';

        if (i % 5 === 0) {
            className += ' label';
            dataAttribute = `data-label="${i}"`;
        }
        
        markersHTML += `<div class="${className}" style="left: ${percentPosition}%;" ${dataAttribute}></div>`;
    }
    container.html(markersHTML);
}

function updateFrequencyMarker(freqKHz, activeProfile) {
    const freqMHz = freqKHz / 1000;
    const maxFreq = 27;

    if (freqMHz <= 0 || freqMHz > maxFreq) {
        $('#frequency-pointer-top, #frequency-pointer-bottom, #frequency-line').hide();
        return;
    }

    const percentPosition = (freqMHz / maxFreq) * 100;

    $('#frequency-pointer-top').css('left', `${percentPosition}%`).show();
    $('#frequency-pointer-bottom').css('left', `${percentPosition}%`).show();
    $('#frequency-line').css('left', `${percentPosition}%`).show();

    const { luf, muf, greenStartsAt, greenEndsAt } = activeProfile;
    const usableBandwidth = muf - luf;
    const yellowLowEnd = luf + (usableBandwidth * greenStartsAt);
    const greenEnd = luf + (usableBandwidth * greenEndsAt);
    
    let lineColor = '#ff0000';

    if (freqMHz < luf || freqMHz > muf) {
        lineColor = '#ffffff';
    } else if (freqMHz < yellowLowEnd || freqMHz > greenEnd) {
        lineColor = '#3498db';
    } else {
        lineColor = '#c0392b';
    }

    $('#frequency-line').css('background-color', lineColor);
}

	function ensureLeafletLoaded() {
        // Sjekk om alt er lastet (inkludert SunCalc hvis grafen er på)
        if (window.L && window.L.terminator && window.arc && (window.SunCalc || !SHOW_PROPAGATION_GRAPH)) {
            return Promise.resolve();
        }
        if (leafletReady) return leafletReady;

        // Start lastesekvensen
        let loadingPromise = loadCSS(LOCAL_LEAFLET_CSS)
            .then(() => loadJS(LOCAL_LEAFLET_JS))
            .then(() => loadJS(LOCAL_LEAFLET_TERMINATOR_JS))
            .then(() => loadJS(LOCAL_LEAFLET_ARC_JS));
        
        // Legg kun til SunCalc i sekvensen HVIS grafen skal vises
        if (SHOW_PROPAGATION_GRAPH) {
            loadingPromise = loadingPromise.then(() => loadJS(LOCAL_LEAFLET_SUNCALC_JS));
        }
        
        leafletReady = loadingPromise;
        return leafletReady;
    }

    const COUNTRIES_GEOJSON = '/assets/world_countries_50m.geojson';
    const PLACES_GEOJSON = '/assets/places_rich.geojson';
    let leafletMap = null, currentLine = null, qthMarker = null, txMarker = null, basemapLoaded = false;
    let mapNeedsResize = false;
    let terminatorLayer = null;
    let terminatorInterval = null;

function getDynamicProfile() {
    const now = new Date();
    const qthLat = parseFloat(qthLatitude);
    const qthLon = parseFloat(qthLongitude);

    const sunTimes = SunCalc.getTimes(now, qthLat, qthLon);

    const timeline = dynamicProfileModel.map(point => {
        const eventTime = sunTimes[point.event];
        const eventHours = eventTime.getHours() + eventTime.getMinutes() / 60;
        const time = eventHours + point.offsetHours;
        return { ...point, time };
    }).sort((a, b) => a.time - b.time);

    const firstPoint = { ...timeline[0], time: timeline[0].time - 24 };
    const lastPoint = { ...timeline[timeline.length - 1], time: timeline[timeline.length - 1].time + 24 };
    timeline.unshift(firstPoint);
    timeline.push(lastPoint);

    const currentTime = now.getHours() + now.getMinutes() / 60;

    let before = timeline[0];
    let after = timeline[timeline.length - 1];

    for (let i = 0; i < timeline.length; i++) {
        if (timeline[i].time <= currentTime) {
            before = timeline[i];
        }
        if (timeline[i].time >= currentTime) {
            after = timeline[i];
            break;
        }
    }

    const timeRange = after.time - before.time;
    const timeProgress = (currentTime - before.time) / timeRange;

    if (!isFinite(timeProgress)) { 
        return {
            luf: before.luf, muf: before.muf,
            greenStartsAt: (before.greenStart - before.luf) / (before.muf - before.luf || 1),
            greenEndsAt: (before.greenEnd - before.luf) / (before.muf - before.luf || 1)
        };
    }

    const interpolate = (valBefore, valAfter) => valBefore + (valAfter - valBefore) * timeProgress;

    const luf = interpolate(before.luf, after.luf);
    const muf = interpolate(before.muf, after.muf);
    const greenStart = interpolate(before.greenStart, after.greenStart);
    const greenEnd = interpolate(before.greenEnd, after.greenEnd);

    const usableBandwidth = muf - luf;
    const greenStartsAt = (greenStart - luf) / (usableBandwidth || 1);
    const greenEndsAt = (greenEnd - luf) / (usableBandwidth || 1);

    return { luf, muf, greenStartsAt, greenEndsAt };
}

    function ensureLeafletMap() {
        if (leafletMap) return;
        leafletMap = L.map('aoki-map', { zoomControl: false, attributionControl: false });
        L.control.zoom({ position: 'topright' }).addTo(leafletMap);
        leafletMap.setView([20, 0], 2);
    }

function updatePropagationGraph(activeProfile) {
    const maxFreq = 27;

    const { luf, muf, greenStartsAt, greenEndsAt } = activeProfile;

    const usableBandwidth = muf - luf;

    const yellowLowEnd = luf + (usableBandwidth * greenStartsAt);
    const greenEnd = luf + (usableBandwidth * greenEndsAt);
    
    const redLufMHz = luf;
    const yellowLowMHz = yellowLowEnd - luf;
    const greenMHz = greenEnd - yellowLowEnd;
    const yellowHighMHz = muf - greenEnd;
    
    const redLufPercent = (redLufMHz / maxFreq) * 100;
    const yellowLowPercent = (yellowLowMHz / maxFreq) * 100;
    const greenOptimalPercent = (greenMHz / maxFreq) * 100;
    const yellowHighPercent = (yellowHighMHz / maxFreq) * 100;
    const redMufPercent = 100 - redLufPercent - yellowLowPercent - greenOptimalPercent - yellowHighPercent;

    $('#graph-red-luf').css('width', `${redLufPercent}%`);
    $('#graph-yellow-low').css('width', `${yellowLowPercent}%`);
    $('#graph-green-optimal').css('width', `${greenOptimalPercent}%`);
    $('#graph-yellow-high').css('width', `${yellowHighPercent}%`);
    $('#graph-red-muf').css('width', `${redMufPercent}%`);
}
    
	function loadOfflineBasemapOnce() {
        if (basemapLoaded) return Promise.resolve();

        $('#aoki-map').css('background', '#BDE0FE'); 
        
        const fetchJson = (url) => fetch(url).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
        
        const countriesPromise = fetchJson(COUNTRIES_GEOJSON).then(geo => {
            L.geoJSON(geo, {
                style: { color: '#3f3f3f', weight: 1, opacity: 1, fillColor: '#f2e9d8', fillOpacity: 0.8 },
                onEachFeature: function(feature, layer) {
                    const countryName = feature.properties.NAME; 
                    if (countryName) {
                        layer.bindTooltip(countryName, {
                            permanent: true, 
                            direction: 'center', 
                            className: 'country-label' 
                        });
                    }
                }
            }).addTo(leafletMap);
        });
        
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

            const placesBigLayer = mk(isBig);
            const placesMedLayer = mk(isMed);
            const placesSmallLayer = mk(p => !isBig(p) && !isMed(p));

            const update = () => {
                const z = leafletMap.getZoom();

                if (z >= 3 && !leafletMap.hasLayer(placesBigLayer)) {
                    leafletMap.addLayer(placesBigLayer);
                } else if (z < 3 && leafletMap.hasLayer(placesBigLayer)) {
                    leafletMap.removeLayer(placesBigLayer);
                }

                if (z >= 5 && !leafletMap.hasLayer(placesMedLayer)) {
                    leafletMap.addLayer(placesMedLayer);
                } else if (z < 5 && leafletMap.hasLayer(placesMedLayer)) {
                    leafletMap.removeLayer(placesMedLayer);
                }

                if (z >= 7 && !leafletMap.hasLayer(placesSmallLayer)) {
                    leafletMap.addLayer(placesSmallLayer);
                } else if (z < 7 && leafletMap.hasLayer(placesSmallLayer)) {
                    leafletMap.removeLayer(placesSmallLayer);
                }
            };

            leafletMap.on('zoomend', update);
            update();
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
        if (terminatorInterval) {
            clearInterval(terminatorInterval);
            terminatorInterval = null;
        }
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
        
        setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 10);

        if (terminatorInterval) clearInterval(terminatorInterval);

        loadOfflineBasemapOnce().then(() => {
            if (mapNeedsResize) mapNeedsResize = false;
            if (SHOW_PROPAGATION_GRAPH) {
                createGraphMarkers();

                const updateDynamicElements = () => {
                    if (terminatorLayer) {
                        terminatorLayer.remove();
                    }
                    terminatorLayer = L.terminator({ fillOpacity: 0.35, color: '#051945' }).addTo(leafletMap);
                    
                    const activeProfile = getDynamicProfile();
                    if (activeProfile) {
                        updatePropagationGraph(activeProfile);
                        updateFrequencyMarker(currentFreqKHz, activeProfile);
                    }
                };
                
                updateDynamicElements();
                terminatorInterval = setInterval(updateDynamicElements, 60000);
            } else {
                // Hvis grafen er av, tegn kun natt/dag-laget én gang
                if (terminatorLayer) terminatorLayer.remove();
                terminatorLayer = L.terminator({ fillOpacity: 0.35, color: '#051945' }).addTo(leafletMap);
            }

            if (currentLine) leafletMap.removeLayer(currentLine);
            if (qthMarker) leafletMap.removeLayer(qthMarker);
            if (txMarker) leafletMap.removeLayer(txMarker);
            $('#aoki-map-infobox').remove();

            const qthLat = parseFloat(qthLatitude), qthLon = parseFloat(qthLongitude);

            qthMarker = L.circleMarker([qthLat, qthLon], {
                radius: 7, color: '#ffffff', weight: 2, fillColor: '#007bff', fillOpacity: 1.0
            }).addTo(leafletMap).bindPopup('QTH (Receiver)');

            const transmitterIcon = L.icon({
                iconUrl: '/assets/leaflet/images/transmitter-icon.png', 
                iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -30] 
            });
            
            txMarker = L.marker([stationLL.lat, stationLL.lon], { icon: transmitterIcon })
                .addTo(leafletMap)
                .bindPopup(`<b>${station.name}</b><br>${station.location}<br>Distance: ${station.distance} km`);

            const startPoint = { x: qthLon, y: qthLat };
            const endPoint = { x: stationLL.lon, y: stationLL.lat };
            const generator = new arc.GreatCircle(startPoint, endPoint);
            const lineData = generator.Arc(100, { offset: 10 });
            const greatCirclePoints = lineData.geometries[0].coords.map(c => [c[1], c[0]]);

            currentLine = L.polyline(greatCirclePoints, { 
                weight: 3, opacity: 0.9, dashArray: '6,8' 
            }).addTo(leafletMap);
            
            leafletMap.fitBounds(currentLine.getBounds(), { padding: [50, 50] });

            let distanceText = 'N/A';
            if (station.distance != null && !isNaN(station.distance)) {
                const km = Math.round(station.distance);
                const miles = Math.round(km * 0.621371);
                distanceText = `${km} km / ${miles} mi`;
            }

            const infoHTML = `
              <div id="aoki-map-infobox">
                <div class="info-header">
                  <h4>${station.name}</h4>
                  <span class="info-toggle" title="Show/hide details">+</span>
                </div>
                <div class="info-content">
                  <p><strong>Location:</strong> ${station.location||'N/A'}</p>
                  <p><strong>Distance:</strong> ${distanceText}</p>
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
            
            $infoBox.find('.info-header').on('click', function(e) {
                e.stopPropagation();
                $infoContent.slideToggle(200);
                $(this).find('.info-toggle').text((i, text) => text === '−' ? '+' : '−');
            });

            txMarker.on('click', function() {
                if (!$infoContent.is(':visible')) {
                    $infoContent.slideDown(200);
                    $infoBox.find('.info-toggle').text('−');
                }
            });

        });
    }).catch(err => {
        console.error("Could not load Leaflet or a plugin:", err);
        alert("Error: The map library or a required plugin could not be loaded.");
    });
}
    
    $mapModal.on('click', '.aoki-map-backdrop, .aoki-map-close', closeAndDestroyMap);
    $(document).on('keydown', e => { if (e.key === 'Escape' && $('#aoki-map-modal').is(':visible')) closeAndDestroyMap(); });

    function fetchStaticData(){$.getJSON('/static_data',data=>{if(data.qthLatitude&&data.qthLongitude){qthLatitude=data.qthLatitude;qthLongitude=data.qthLongitude;}});}
    function displayAlternativeFrequencies(frequencies){$afContainer.empty();if(!frequencies||frequencies.length===0)return;let afHTML=`<div class="alt-freq-list" style="height:100%;">`;frequencies.forEach(freq=>{const displayFreq=freq>1000?(freq/1000).toFixed(3):freq;afHTML+=`<div class="alt-freq-item" data-freq="${freq}">${displayFreq}</div>`;});afHTML+=`</div>`;$afContainer.html(afHTML);}
    function tuneToFrequency(freqKHz){if(typeof socket!=='undefined'&&socket.readyState===WebSocket.OPEN){socket.send("T"+freqKHz);}}
    function areStationListsEqual(listA,listB){if(listA.length!==listB.length)return!1;for(let i=0;i<listA.length;i++){if(listA[i].name!==listB[i].name)return!1;}return!0;}

function displayStation() {
    if (stationList.length === 0) {
        $aokiContent.html('<h4 style="padding-top:25px;margin:0;">No active stations found.</h4>');
        $navControls.hide();
        return;
    }

    const station = stationList[currentIndex];
    const hasPosition = station.distance !== null;

    let distanceText = 'Distance N/A';
    if (hasPosition && !isNaN(station.distance)) {
        const km = Math.round(station.distance);
        const miles = Math.round(km * 0.621371);
        distanceText = `${km}km/${miles}mi`; 
    }

    const stationHTML = `
        <div class="station-name">${station.name}</div>
        <div class="station-location">${station.location} <span class="text-gray">[${station.country}]</span></div>
        <div class="station-meta">${station.language} <span class="text-gray">▪</span> ${station.timeUTC}z</div>
        <div class="station-meta">${station.power}kW <span class="text-gray">▪</span> ${distanceText}</div>
    `;

    $aokiContent.html(stationHTML);
    $aokiSource.text(station.source).show();

    if (station.alternative_frequencies) {
        displayAlternativeFrequencies(station.alternative_frequencies);
    } else {
        $afContainer.empty();
    }

    $counter.text(`${currentIndex + 1} / ${stationList.length}`);
    $navControls.toggle(stationList.length > 1);

    $aokiDisplay.css('cursor', hasPosition ? 'pointer' : 'default');
}


    function fetchAndDisplayAokiData(freqMHz){currentFreqKHz=Math.round(freqMHz*1000);const url=`${AOKI_API_URL}?freq=${currentFreqKHz}&lat=${qthLatitude}&lon=${qthLongitude}`;$.getJSON(url).done(data=>{if(currentMode!=='AM')return;if(data&&data.status==='success'&&data.stations&&data.stations.length>0){const newStationList=data.stations;if(!areStationListsEqual(stationList,newStationList)){currentIndex=0;}
    stationList=newStationList;displayStation();}else{stationList=[];const errorMessage=data&&data.message?data.message:'No active stations found.';$aokiContent.html(`<h4 style="padding-top:25px;margin:0;">${errorMessage}</h4>`);$navControls.hide();$aokiSource.hide();$afContainer.empty();}}).fail(()=>{if(currentMode!=='AM')return;stationList=[];$aokiContent.html('<h4 style="padding-top:25px;margin:0;">Error loading data.</h4>');$navControls.hide();$aokiSource.hide();$afContainer.empty();});}
    function handleFrequencyChange(){clearTimeout(debounceTimer);debounceTimer=setTimeout(()=>{const freqText=$('#data-frequency').text();if(!freqText)return;const freqMHz=parseFloat(freqText);clearInterval(activityCheckInterval);if(freqMHz<=AM_MAX_FREQ_MHZ){if(currentMode!=='AM'){currentMode='AM';$stationContainer.hide();$aokiDisplay.show();}
    fetchAndDisplayAokiData(freqMHz);activityCheckInterval=setInterval(function(){fetchAndDisplayAokiData(freqMHz);},10000);}else{if(currentMode!=='FM'){currentMode='FM';$aokiDisplay.hide();$stationContainer.show();$afContainer.empty();$tooltipText.hide().css('opacity',0);}}},100);}


    $aokiDisplay.off('click').on('click', e => {
        if (!$(e.target).closest('button').length) {
            const station = stationList[currentIndex];
            if (station && station.distance !== null) {
                openMapModalForStationOffline(station);
            }
        }
    });

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
    console.log('AM-Station-Info v1.2 - Loaded and Ready.');
  });
})();