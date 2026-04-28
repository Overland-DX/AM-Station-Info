// AM-Station-Info v1.4.1
// -----------------------------------------------------------------------

(() => {
    'use strict';

    // --- Configuration ---
    const CONFIG = {
        name: 'AM-Station-Info',
        version: '1.4.1',
        apiEndpoint: '/aoki-api-proxy',
        auroraApi: 'https://api.auroras.live/v1/?type=all&lat=60.0&long=10.0&forecast=false',
        maxFreq: 27
    };

    // V1 Propagation Model
    const DYNAMIC_PROFILE_MODEL = [
        { event: 'nadir',      offsetHours: 0,    luf: 0,    greenStart: 0,    greenEnd: 9,    muf: 11 },
        { event: 'sunrise',    offsetHours: -1.5, luf: 0,    greenStart: 0.05, greenEnd: 8,    muf: 12 },
        { event: 'sunrise',    offsetHours: 0,    luf: 0.2,  greenStart: 2,    greenEnd: 10,   muf: 16 },
        { event: 'sunrise',    offsetHours: 1.5,  luf: 4,    greenStart: 8,    greenEnd: 16,   muf: 20 },
        { event: 'solarNoon',  offsetHours: 0,    luf: 7,    greenStart: 12,   greenEnd: 18,   muf: 22 },
        { event: 'solarNoon',  offsetHours: 3,    luf: 6,    greenStart: 10,   greenEnd: 17,   muf: 21 },
        { event: 'sunset',     offsetHours: -1,   luf: 2,    greenStart: 7,    greenEnd: 16,   muf: 18 },
        { event: 'sunset',     offsetHours: 0,    luf: 0,    greenStart: 2,    greenEnd: 15,   muf: 18 },
        { event: 'sunset',     offsetHours: 2,    luf: 0,    greenStart: 0,    greenEnd: 14,   muf: 16 }
    ];

    /**
     * SETTINGS MANAGER
     */
    class SettingsManager {
        constructor() {
            this.storageKey = 'am-station-settings-v2';
            this._settings = this._loadSettings();
            this.defaults = {
                selectedList: 'all',
                freqMargin: 0,
                useMiles: false,
                hideInactive: false,
                showKp: true,
                showTerminator: true,
                showPath: true,
                showCountryLabels: true,
                showCapitalLabels: true,
                showGraph: true,
                extendedInfo: true
            };
            this.isAdmin = false;
            this.favorites =[];
        }
        _loadSettings() {
            try { return JSON.parse(localStorage.getItem(this.storageKey)) || {}; } catch (e) { return {}; }
        }
        _saveSettings() {
            localStorage.setItem(this.storageKey, JSON.stringify(this._settings));
        }
        get(key) {
            return this._settings[key] !== undefined ? this._settings[key] : this.defaults[key];
        }
        set(key, value) {
            this._settings[key] = value;
            this._saveSettings();
        }
    }

    /**
     * SETTINGS MODAL UI
     */
    class SettingsModal {
        constructor(settingsManager, onSaveCallback) {
            this.settings = settingsManager;
            this.onSave = onSaveCallback;
            this.overlayId = 'am-settings-overlay';
            this._createModal();
        }

        _createModal() {
            if ($(`#${this.overlayId}`).length) return;
            
            const mkSwitch = (id, label) => `
                <div class="am-switch-row">
                    <span class="am-switch-text">${label}</span>
                    <div class="switch">
                        <input type="checkbox" id="${id}">
                        <label for="${id}"></label>
                    </div>
                </div>
            `;

            const html = `
            <div id="${this.overlayId}" class="am-native-modal" style="display:none;">
                <div class="am-native-content">
                    
                    <div class="am-native-header">
                        <span class="am-native-title">AM Station Settings</span>
                        <div class="am-native-close">&times;</div>
                    </div>
                    
                    <div class="am-native-body">
                        <fieldset class="am-fieldset">
                            <legend>Database & Units</legend>
                            <div class="am-row">
                                <label>Database List</label>
                                <select id="am-set-list" class="am-native-input">
                                    <option value="all">All Lists</option>
                                    <option value="aoki">Aoki Only</option>
                                    <option value="user">User DB Only</option>
                                    <option value="mwlist">MWList Only</option>
                                </select>
                            </div>
                            <div class="am-row">
                                <label>Freq Margin (+/- kHz)</label>
                                <input type="number" id="am-set-margin" class="am-native-input" min="0" max="10">
                            </div>
                            <div class="am-row">
                                <label>Distance Unit</label>
                                <select id="am-set-unit" class="am-native-input">
                                    <option value="km">Kilometers (km)</option>
                                    <option value="mi">Miles (mi)</option>
                                </select>
                            </div>
                            ${mkSwitch('am-set-hide-inactive', 'Hide 0kW listings')}
                        </fieldset>

                        <fieldset class="am-fieldset">
                            <legend>Map & Visuals</legend>
                            ${mkSwitch('am-set-kp', 'Show Kp Index')}
                            ${mkSwitch('am-set-terminator', 'Show Day/Night Terminator')}
                            ${mkSwitch('am-set-path', 'Show Signal Path (Line)')}
                            ${mkSwitch('am-set-country-lbl', 'Show Country Names')}
                            ${mkSwitch('am-set-capital-lbl', 'Show Capital Names')}
                            ${mkSwitch('am-set-graph', 'Show Prop. Graph (Footer)')}
                            ${mkSwitch('am-set-extended', 'Auto-open Info Box')}
                        </fieldset>
                    </div>
                    
                    <div class="am-native-footer">
                        <button id="am-save-btn" class="am-native-button">Save & Close</button>
                    </div>
                </div>
            </div>`;

            $('body').append(html);
            this.$el = $(`#${this.overlayId}`);
            
            this.$el.find('.am-native-close').click(() => this.close());
            this.$el.find('#am-save-btn').click(() => this._saveAndClose());
            this.$el.on('click', (e) => {
                if ($(e.target).is(`#${this.overlayId}`)) this.close();
            });
        }

        open() {
            $('#am-set-list').val(this.settings.get('selectedList'));
            $('#am-set-margin').val(this.settings.get('freqMargin'));
            $('#am-set-unit').val(this.settings.get('useMiles') ? 'mi' : 'km');
            $('#am-set-hide-inactive').prop('checked', this.settings.get('hideInactive'));
            $('#am-set-kp').prop('checked', this.settings.get('showKp'));
            $('#am-set-terminator').prop('checked', this.settings.get('showTerminator'));
            $('#am-set-path').prop('checked', this.settings.get('showPath'));
            $('#am-set-country-lbl').prop('checked', this.settings.get('showCountryLabels'));
            $('#am-set-capital-lbl').prop('checked', this.settings.get('showCapitalLabels'));
            $('#am-set-graph').prop('checked', this.settings.get('showGraph'));
            $('#am-set-extended').prop('checked', this.settings.get('extendedInfo'));
            
            this.$el.css('display', 'block');
            setTimeout(() => this.$el.addClass('visible'), 10);
        }

        close() { 
            this.$el.removeClass('visible');
            setTimeout(() => this.$el.css('display', 'none'), 300);
        }

        _saveAndClose() {
            this.settings.set('selectedList', $('#am-set-list').val());
            this.settings.set('freqMargin', parseInt($('#am-set-margin').val(), 10));
            this.settings.set('useMiles', $('#am-set-unit').val() === 'mi');
            this.settings.set('hideInactive', $('#am-set-hide-inactive').is(':checked'));
            this.settings.set('showKp', $('#am-set-kp').is(':checked'));
            this.settings.set('showTerminator', $('#am-set-terminator').is(':checked'));
            this.settings.set('showPath', $('#am-set-path').is(':checked'));
            this.settings.set('showCountryLabels', $('#am-set-country-lbl').is(':checked'));
            this.settings.set('showCapitalLabels', $('#am-set-capital-lbl').is(':checked'));
            this.settings.set('showGraph', $('#am-set-graph').is(':checked'));
            this.settings.set('extendedInfo', $('#am-set-extended').is(':checked'));
            this.onSave();
            this.close();
        }
    }

    /**
     * MAIN PLUGIN
     */
    class AmStationPlugin {
        constructor() {
            this.settings = new SettingsManager();
            this.modal = new SettingsModal(this.settings, () => this.onSettingsChanged());
            
            this.qth = { lat: 59.91, lon: 10.75 };
            this.stationList = [];
            this.currentIndex = 0;
            this.currentMode = 'FM';
            this.currentFreqKHz = 0;
            this.isLocked = false;
            this.lockedStationName = '';
			this.lastInteractionTime = 0;
            
            this.intervals = { activity: null, terminator: null };
            
            // NOTE: 'capitals' replaces the old big/med/small layers
            this.mapState = {
                map: null,
                layers: { terminator: null, line: null, qth: null, tx: null, capitals: null },
                basemapLoaded: false,
                leafletReadyPromise: null
            };
            
            this.elements = {}; 
            this.debounceTimer = null;
            this.tooltipTimer = null;
        }

        init() {
            this._injectCombinedStyles();
            this._buildUI();
            this._fetchStaticData();

            $.getJSON('/AM-Station_info/api/auth-check').done(data => { this.isAdmin = data.isAdmin; }).fail(() => { this.isAdmin = false; });
            this._loadFavorites();
            
            const targetNode = document.getElementById('data-frequency');
            if (targetNode) {
                const observer = new MutationObserver(() => this._handleFrequencyChange());
                observer.observe(targetNode, { childList: true, subtree: true, characterData: true });
            }
            setTimeout(() => this._handleFrequencyChange(), 1000);
            console.log(`AM-Station-Info v${CONFIG.version} initialized.`);
        }

        onSettingsChanged() {
            // Reload map visuals immediately if open
            if ($('#aoki-map-modal').is(':visible')) {
                this._updateMapVisuals(); 
            }
            this._handleFrequencyChange();
        }

        _loadFavorites() {
            $.getJSON('/AM-Station_info/favorites').done(data => {
                this.favorites = data ||[];
                if(this.elements.content && this.elements.content.is(':visible')) this._renderStation();
            });
        }

        _injectCombinedStyles() {
            const css = `
            /* --- NATIVE SERVER STYLE MODAL (SCOPED & COMPACT) --- */
            .am-native-modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); opacity: 0; transition: opacity 0.3s ease; z-index: 20000; color: var(--color-4); backdrop-filter: blur(10px); }
            .am-native-modal.visible { opacity: 1; }
            .am-native-content { box-sizing: border-box; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background-color: var(--color-main); padding: 20px; border-radius: 15px; min-width: 480px; max-width: 95%; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,0.5); border: 1px solid var(--color-4); }
            .am-native-header { margin-bottom: 15px; position: relative; height: 30px; flex-shrink: 0; }
            .am-native-title { font-size: 20px; font-weight: 300; position: absolute; left: 0; top: 5px; }
            .am-native-close { position: absolute; top: 0; right: 0; width: 32px; height: 32px; background-color: var(--color-2); border: 1px solid var(--color-4); border-radius: 5px; cursor: pointer; font-size: 20px; line-height: 28px; text-align: center; color: var(--color-text); transition: 0.3s ease background-color; }
            .am-native-close:hover { background-color: var(--color-4); color: var(--color-1); }
            .am-native-body { flex-grow: 1; overflow-y: auto; margin-bottom: 10px; padding-right: 5px; }
            .am-fieldset { border: 2px solid var(--color-5); border-radius: 10px; padding: 10px 15px; margin-bottom: 15px; background: transparent; }
            .am-fieldset legend { font-size: 1.0em; font-weight: bold; color: var(--color-main-bright); padding: 0 8px; }
            .am-row, .am-switch-row { background-color: transparent; border-bottom: 1px solid rgba(255,255,255,0.15); padding: 6px 0; margin-bottom: 2px; display: flex; justify-content: space-between; align-items: center; }
            .am-row:last-child, .am-switch-row:last-child { border-bottom: none; }
            .am-row label, .am-switch-text { font-size: 14px; font-weight: 500; color: var(--color-main-bright); }
            .am-native-input { width: 160px; height: 32px; background-color: var(--color-4); color: var(--color-main); border: none; border-radius: 15px; padding: 0 10px; font-weight: bold; font-size: 13px; cursor: pointer; outline: none; transition: 0.35s ease background-color; }
            .am-native-input:hover { background-color: var(--color-main-bright); }
            .am-native-input option { background-color: var(--color-main); color: var(--color-4); }
            .switch { user-select: none; }
            .switch input[type=checkbox] { height: 0; width: 0; margin: 0; visibility: hidden; position: absolute; }
            .switch label { cursor: pointer; min-width: 54px; max-width: 54px; height: 30px; background-color: var(--color-1); transition: 0.35s background-color; display: block; border-radius: 24px; margin: 0; position: relative; border: 2px solid var(--color-3); }
            .switch label::after { content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; background: var(--color-5); border-radius: 50%; transition: 0.3s; }
            .switch input[type=checkbox]:checked + label { background: var(--color-4); }
            .switch input[type=checkbox]:checked + label::after { left: calc(100% - 3px); transform: translateX(-100%); background-color: var(--color-1); }
            .am-native-footer { flex-shrink: 0; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); text-align: right; }
            .am-native-button { width: 130px; height: 40px; border-radius: 12px; background: var(--color-4); color: var(--color-main); font-weight: bold; border: 0; transition: 0.35s ease background; cursor: pointer; }
            .am-native-button:hover { background: var(--color-5); }
            @media (max-width: 500px) { .am-native-content { min-width: 90%; padding: 15px; } .am-native-input { width: 120px; } }

            /* --- PANEL STYLES --- */
            #aoki-plugin-display { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: var(--color-1); z-index: 1010; color: var(--color-text); box-sizing: border-box; display: none; text-align: center; border-radius: 15px; padding: 0px 10px; cursor: pointer; }
            #am-settings-gear { position: absolute; top: 5px; right: 5px; font-size: 16px; opacity: 0; transition: opacity 0.2s; cursor: pointer; z-index: 1020; color: var(--color-4); }
            #aoki-plugin-display:hover #am-settings-gear { opacity: 1; }
            #aoki-station-content { display: flex; flex-direction: column; justify-content: flex-start; height: 100%; }
            .station-name { margin-top: -3px; font-size: 1.4em; font-weight: bold; text-transform: uppercase; margin-bottom: 0px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--color-4); }
            .station-location { font-size: 0.9em; margin-top: -5px; margin-bottom: 0px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .station-meta { font-size: 0.9em; margin-top: -7px; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            #aoki-nav-controls { position: absolute; bottom: 5px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: default; }
            #aoki-nav-controls button { display: flex; align-items: center; justify-content: center; background: none; border: 1px solid var(--color-text); border-radius: 5px; color: var(--color-text); line-height: 1; cursor: pointer; opacity: 0.7; font-size: 13px; height: 26px; }
            #aoki-nav-controls button.nav-btn { width: 34px; }
            #aoki-nav-controls button:hover { opacity: 1; background-color: rgba(255,255,255,0.1); }
            #aoki-lock-btn { position: absolute; bottom: 5px; right: 5px; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; background: none; border: 1px solid var(--color-text); border-radius: 5px; color: var(--color-text); cursor: pointer; opacity: 0.7; font-size: 13px; }
            #aoki-lock-btn:hover { opacity: 1; background-color: rgba(255,255,255,0.1); }
            #aoki-lock-btn.locked { background-color: var(--color-4); color: var(--color-1); border-color: var(--color-4); opacity: 1; }
            #aoki-fav-btn { position: absolute; bottom: 5px; right: 35px; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; background: none; border: 1px solid var(--color-text); border-radius: 5px; color: var(--color-text); cursor: pointer; opacity: 0.7; font-size: 13px; transition: 0.3s; }
            #aoki-fav-btn:hover { opacity: 1; background-color: rgba(255,255,255,0.1); }
            #aoki-source-display { position: absolute; bottom: 0px; left: 5px; font-size: 11px; opacity: 0.6; cursor: default; }
            .alt-freq-list { height: calc(100% - 50px); overflow-y: auto; font-size: 14px; }
            .alt-freq-item { padding: 4px 0; cursor: pointer; border-radius: 5px; }
            .alt-freq-item:hover { background-color: rgba(255, 255, 255, 0.1); }
            .alt-freq-item.active-freq { font-weight: bold; color: var(--color-5); background-color: rgba(255, 255, 255, 0.05); cursor: default; pointer-events: none; border: 1px solid rgba(255,255,255,0.1); }
            #aoki-station-info-tooltip.aoki-tooltiptext { position: fixed; transform: translate(-50%, -100%); z-index: 5000; background-color: var(--color-2); border: 2px solid var(--color-3); color: var(--color-text); text-align: center; font-size: 14px; border-radius: 15px; padding: 8px 15px; opacity: 0; transition: opacity 0.3s ease; pointer-events: none; white-space: nowrap; }

            /* --- MAP & MODAL STYLES --- */
            #aoki-map-modal { position: fixed; inset: 0; z-index: 99998; display: none; }
            #aoki-map-modal .aoki-map-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, .6); backdrop-filter: blur(10px); }
            #aoki-map-modal .aoki-map-dialog { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column; width: 75vw; height: 80vh; max-width: 1400px; max-height: 850px; background: var(--color-main); border-radius: 15px; box-shadow: 0 10px 30px rgba(0, 0, 0, .35); overflow: hidden; z-index: 99999; }
            .aoki-map-header { display: flex; justify-content: space-between; align-items: center; height: 45px; padding: 5px 10px; background-color: var(--color-2); border-bottom: 1px solid var(--color-4); flex-shrink: 0; }
            .header-left-group { display: flex; align-items: center; gap: 15px; }
            .aoki-map-title { font-size: 20px; font-weight: bold; color: var(--color-main-bright); }
            #aoki-map-kp { font-size: 14px; font-weight: bold; padding: 2px 8px; border-radius: 4px; background-color: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); display: none; }
            .aoki-map-close { width: 100px; height: 34px; border-radius: 15px; background-color: var(--color-3); border: 1px solid var(--color-4); color: var(--color-main-bright); font-size: 20px; font-weight: normal; display: flex; align-items: center; justify-content: center; line-height: 1; cursor: pointer; transition: 0.3s ease background-color, 0.3s ease color; }
            .aoki-map-close:hover { background-color: var(--color-5); color: var(--color-1); }
            .aoki-map-footer { display: flex; align-items: center; justify-content: space-between; height: 45px; padding: 5px 10px; background-color: var(--color-2); border-top: 1px solid var(--color-4); flex-shrink: 0; gap: 10px; }
            .footer-data-left, .footer-data-right { flex: 0 0 100px; }
            #propagation-graph-container { flex-grow: 1; position: relative; height: 100%; }
            #propagation-graph { display: flex; width: 100%; height: 20px; border-radius: 5px; overflow: hidden; border: 1px solid rgba(255,255,255,0.2); position: absolute; bottom: 0; }
            .graph-zone { height: 100%; transition: width 0.5s ease; }
            .graph-labels { display: flex; justify-content: space-between; font-size: 10px; color: var(--color-text); opacity: 0.7; padding: 0 2px; }
            #graph-markers { position: absolute; bottom: 0; left: 0; width: 100%; height: 20px; pointer-events: none; }
            .marker { position: absolute; height: 100%; width: 1px; background-color: rgba(0, 0, 0, 0.2); }
            .marker.label { height: 150%; background-color: rgba(0, 0, 0, 0.4); }
            .marker.label::after { content: attr(data-label); position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); font-size: 9px; color: var(--color-text); opacity: 0.7; }
            #graph-red-luf { background-color: #c0392b; }  
            #graph-yellow-low { background-color: #f1c40f; } 
            #graph-green-optimal { background-color: #2ecc71; } 
            #graph-yellow-high { background-color: #f1c40f; }  
            #graph-red-muf { background-color: #c0392b; }  
            #frequency-pointer-container, #frequency-pointer-container-bottom { position: absolute; left: 0; width: 100%; height: 6px; z-index: 2; pointer-events: none; }
            #frequency-pointer-container { top: 9px; }
            #frequency-pointer-container-bottom { bottom: -5px; }
            #frequency-pointer-top, #frequency-pointer-bottom { position: absolute; width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; transform: translateX(-50%); display: none; }
            #frequency-pointer-top { border-top: 6px solid var(--color-4); }
            #frequency-pointer-bottom { border-bottom: 6px solid var(--color-4); }
            #aoki-map { width: 100%; height: 100%; flex-grow: 1; }
            .leaflet-top.leaflet-right .leaflet-control-zoom { margin-top: 12px; margin-right: 12px; }
            
            .country-label {
				background: transparent !important;
				border: none !important;
				box-shadow: none !important;
				color: #333 !important;
				font-size: 14px;
				font-weight: bold;
				text-shadow: 2px 0 0 #fff, -2px 0 0 #fff, 0 2px 0 #fff, 0 -2px 0 #fff, 1px 1px #fff, -1px -1px #fff, 1px -1px #fff, -1px 1px #fff;
				pointer-events: none;
				display: none;
			}
			/* SHOW LABELS AT ZOOM LEVEL 3+ */
			.leaflet-zoom-3 .country-label,
			.leaflet-zoom-4 .country-label,
			.leaflet-zoom-5 .country-label,
			.leaflet-zoom-6 .country-label { 
				display: block !important; 
			}
            .hide-country-labels .country-label { display: none !important; }

            .ne-place-label span { font-size: 11px; font-weight: bold; color: #333333; text-shadow: 1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff; white-space: nowrap; user-select: none; pointer-events: none; }
            
            #aoki-map-infobox { position: absolute; top: 60px; left: 15px; width: 280px; background: var(--color-1-transparent); border: 1px solid #777; border-radius: 8px; z-index: 100000; box-shadow: 0 2px 10px rgba(0, 0, 0, .5); color: var(--color-text); font-family: sans-serif; font-size: 14px; pointer-events: none; }
            #aoki-map-infobox > * { pointer-events: auto; }
            #aoki-map-infobox .info-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--color-2); border-bottom: 1px solid #777; border-radius: 8px 8px 0 0; cursor: pointer; }
            #aoki-map-infobox .info-header h4 { margin: 0; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            #aoki-map-infobox .info-toggle { padding: 0 5px; font-size: 20px; font-weight: bold; }
            #aoki-map-infobox .info-content { display: none; padding: 12px; max-height: 400px; overflow-y: auto; }
            #aoki-map-infobox.is-open .info-content { display: block; }
            #aoki-map-infobox .info-content p { margin: 0 0 8px 0; line-height: 1.4; }
            #aoki-map-infobox .info-content strong { display: inline-block; min-width: 90px; color: var(--color-main-bright); }
            .leaflet-control-zoom { border: none !important; box-shadow: 0 1px 5px rgba(0,0,0,0.4); }
            .leaflet-control-zoom-in, .leaflet-control-zoom-out { background-color: var(--color-2-transparent) !important; color: var(--color-main-bright) !important; transition: background-color 0.2s ease; }
            .leaflet-control-zoom-in:hover, .leaflet-control-zoom-out:hover { background-color: var(--color-4-transparent) !important; }
            .leaflet-control-zoom-in { border-top-left-radius: 10px !important; border-top-right-radius: 10px !important; border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
            .leaflet-control-zoom-out { border-bottom-left-radius: 10px !important; border-bottom-right-radius: 10px !important; border-top-left-radius: 0; border-top-right-radius: 0; border-top: none; }
            @media (max-width: 700px) { #aoki-map-modal .aoki-map-dialog { box-sizing: border-box; top: 10px; right: 10px; bottom: 10px; left: 10px; width: 95vw; height: 75vh; transform: none; } #aoki-map-infobox { width: 240px; left: 10px; top: 55px; } .aoki-map-title { font-size: 18px; } .aoki-map-close { width: 80px; } }
            @media (max-width: 600px) { body.am-station-info-active #af-list { display: none !important; } }
            `;
            $('<style>').text(css).appendTo('head');
        }

        _buildUI() {
            const container = $('#data-station-container');
            if (!container.length) return;
            container.parent().css('position', 'relative');

            const display = $('<div id="aoki-plugin-display"></div>');
            const settingsBtn = $('<div id="am-settings-gear">⚙️</div>');
            settingsBtn.click((e) => { e.stopPropagation(); this.modal.open(); });
            display.append(settingsBtn);

            display.on('mouseenter mouseover mousemove', e => e.stopPropagation());

            const content = $('<div id="aoki-station-content"></div>');
            const nav = $('<div id="aoki-nav-controls"></div>');
            const btnPrev = $('<button class="nav-btn">&lt;</button>').click((e) => { e.stopPropagation(); this._nav(-1); });
            const btnNext = $('<button class="nav-btn">&gt;</button>').click((e) => { e.stopPropagation(); this._nav(1); });
            const btnLock = $('<button id="aoki-lock-btn" title="Lock Networks">🔓</button>').click((e) => { e.stopPropagation(); this._toggleLock(); });
            const btnFav = $('<button id="aoki-fav-btn" style="display:none;"></button>').click((e) => { e.stopPropagation(); this._toggleFavorite(); });
            
            this.elements.counter = $('<span></span>');
            nav.append(btnPrev, this.elements.counter, btnNext);
            
            this.elements.source = $('<span id="aoki-source-display"></span>');
            
            display.append(content, nav, btnLock, btnFav, this.elements.source);
            container.parent().append(display);
            
            this.elements.display = display;
            this.elements.content = content;
            this.elements.lockBtn = btnLock;
            this.elements.favBtn = btnFav;
            this.elements.nav = nav;

            const tooltipHTML = 'This panel only shows information about available<br>stations in the database, this is not RDS data.<br><br>Click to open local map.';
            this.elements.tooltip = $('<span>', { id: 'aoki-station-info-tooltip', class: 'aoki-tooltiptext' }).html(tooltipHTML);
            $('body').append(this.elements.tooltip);
            this.elements.tooltip.hide();

            display.on('mouseenter', () => this._showTooltip());
            display.on('mouseleave', () => this._hideTooltip());
            
            this._buildMapModal(); 

            display.click((e) => {
                if (!$(e.target).closest('button, #am-settings-gear').length) {
                    const st = this.stationList[this.currentIndex];
                    if (st && st.distance !== null) this._openMap(st);
                    this._hideTooltip();
                }
            });
            
            $(document).on('click', (e) => { 
                if (!display.is(e.target) && display.has(e.target).length === 0) { 
                    if (this.elements.tooltip.is(':visible')) this._hideTooltip(); 
                } 
            });
        }

        _showTooltip() {
            if (this.tooltipTimer) clearTimeout(this.tooltipTimer);
            const rect = this.elements.display[0].getBoundingClientRect();
            this.elements.tooltip.css({
                top: `${rect.top - 10}px`,
                left: `${rect.left + (rect.width / 2)}px`,
                opacity: 0
            }).show();
            setTimeout(() => { this.elements.tooltip.css('opacity', 1); }, 10);
            this.tooltipTimer = setTimeout(() => { this._hideTooltip(); }, 6000); 
        }

        _hideTooltip() {
            if (this.tooltipTimer) { clearTimeout(this.tooltipTimer); this.tooltipTimer = null; }
            this.elements.tooltip.css('opacity', 0);
            setTimeout(() => { if (this.elements.tooltip.css('opacity') === '0') { this.elements.tooltip.hide(); } }, 300);
        }

        _buildMapModal() {
            const mapModal = $(`
            <div id="aoki-map-modal">
                <div class="aoki-map-backdrop"></div>
                <div class="aoki-map-dialog">
                  <div class="aoki-map-header">
                    <div class="header-left-group">
                        <span class="aoki-map-title">Station Map</span>
                        <span id="aoki-map-kp" title="Global Kp Index">Kp: -</span>
                    </div>
                    <button class="aoki-map-close" aria-label="Close">Close</button>
                  </div>
                  <div id="aoki-map"></div> 
                  <div class="aoki-map-footer">
                    <div class="footer-data-left"></div>
                    <div id="propagation-graph-container">
                      <div id="frequency-pointer-container"><div id="frequency-pointer-top"></div></div>
                      <div class="graph-labels"><span>0 MHz</span><span>27 MHz</span></div>
                      <div id="propagation-graph">
                        <div id="graph-red-luf" class="graph-zone"></div>
                        <div id="graph-yellow-low" class="graph-zone"></div>
                        <div id="graph-green-optimal" class="graph-zone"></div>
                        <div id="graph-yellow-high" class="graph-zone"></div>
                        <div id="graph-red-muf" class="graph-zone"></div>
                        <div id="frequency-line"></div>
                      </div>
                      <div id="frequency-pointer-container-bottom"><div id="frequency-pointer-bottom"></div></div>
                      <div id="graph-markers"></div>
                    </div>
                    <div class="footer-data-right"></div>
                  </div>
                </div>
            </div>`);
            
            $('body').append(mapModal);
            
            let markersHTML = '';
            for (let i = 1; i < 27; i++) {
                const percentPosition = (i / 27) * 100;
                let className = 'marker';
                let dataAttribute = '';
                if (i % 5 === 0) {
                    className += ' label';
                    dataAttribute = `data-label="${i}"`;
                }
                markersHTML += `<div class="${className}" style="left: ${percentPosition}%;" ${dataAttribute}></div>`;
            }
            $('#graph-markers').html(markersHTML);

            mapModal.find('.aoki-map-close, .aoki-map-backdrop').click(() => this._closeMap());
            $(document).on('keydown', e => { if (e.key === 'Escape' && $('#aoki-map-modal').is(':visible')) this._closeMap(); });
        }

        _fetchStaticData() {
            $.getJSON('/static_data', data => {
                if (data.qthLatitude && data.qthLongitude) {
                    this.qth.lat = parseFloat(data.qthLatitude);
                    this.qth.lon = parseFloat(data.qthLongitude);
                }
            });
        }

        _handleFrequencyChange() {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                const freqText = $('#data-frequency').text();
                if (!freqText) return;
                const freqMHz = parseFloat(freqText);
                
                if (this.intervals.activity) clearInterval(this.intervals.activity);

                if (freqMHz <= CONFIG.maxFreq) {
                    if (this.currentMode !== 'AM') {
                        this.currentMode = 'AM';
                        $('body').addClass('am-station-info-active');
                        $('#data-station-container').hide();
                        this.elements.display.show();
                    }
                    
                    this._fetchData(freqMHz);

                    this.intervals.activity = setInterval(() => {
                        const timeSinceInteraction = Date.now() - this.lastInteractionTime;
                        if (timeSinceInteraction < 60000) {
                            return; 
                        }

                        this._fetchData(freqMHz);
                    }, 10000);

                } else {
                    if (this.currentMode !== 'FM') {
                        this.currentMode = 'FM';
                        $('body').removeClass('am-station-info-active');
                        this.elements.display.hide();
                        $('#data-station-container').show();
                        $('#af-list').empty();
                        this.isLocked = false;
                        this.elements.lockBtn.removeClass('locked').html('🔓');
                        if(this.elements.tooltip) this._hideTooltip();
                    }
                }
            }, 100);
        }

        _fetchData(freqMHz) {
            this.currentFreqKHz = Math.round(freqMHz * 1000);
            const margin = this.settings.get('freqMargin');
            const url = `${CONFIG.apiEndpoint}?freq=${this.currentFreqKHz}&lat=${this.qth.lat}&lon=${this.qth.lon}&margin=${margin}`;
            
            $.getJSON(url).done(data => {
                if (this.currentMode !== 'AM') return;
                
                if (data && data.status === 'success' && data.stations && data.stations.length > 0) {
                    let stations = data.stations;
                    const selectedList = this.settings.get('selectedList');
                    if (selectedList !== 'all') {
                        stations = stations.filter(s => {
                            const src = (s.source || '').toLowerCase();
                            return src.includes(selectedList);
                        });
                    }
                    if (this.settings.get('hideInactive')) {
                        stations = stations.filter(s => {
                            const p = parseFloat(s.power);
                            return !isNaN(p) && p > 0;
                        });
                    }
                    stations.sort((a, b) => {
                        const pA = (a.power && !isNaN(a.power) && parseFloat(a.power) > 0) ? 1 : 0;
                        const pB = (b.power && !isNaN(b.power) && parseFloat(b.power) > 0) ? 1 : 0;
                        return pB - pA;
                    });
                    if (stations.length === 0) {
                        this._displayNoStations("No stations in selected list.");
                        return;
                    }
                    let foundLockedIndex = -1;
                    if (this.isLocked && this.lockedStationName) {
                        foundLockedIndex = stations.findIndex(s => s.name === this.lockedStationName);
                    }
                    if (!this._areListsEqual(this.stationList, stations)) {
                        this.currentIndex = (foundLockedIndex !== -1) ? foundLockedIndex : 0;
                    } else {
                        if (foundLockedIndex !== -1 && this.currentIndex !== foundLockedIndex) {
                            this.currentIndex = foundLockedIndex;
                        }
                    }
                    this.stationList = stations;
                    this._renderStation();
                } else {
                    this._displayNoStations(data.message || 'No active stations.');
                }
            }).fail(() => this._displayNoStations('Error loading data.'));
        }

        _displayNoStations(msg) {
            this.stationList = [];
            this.elements.content.html(`<h4 style="padding-top:25px;margin:0;">${msg}</h4>`);
            this.elements.nav.hide();
            this.elements.source.hide();
            this.elements.favBtn.hide();
            $('#af-list').empty();
        }

        _renderStation() {
            if (this.stationList.length === 0) return;
            const station = this.stationList[this.currentIndex];
            const useMiles = this.settings.get('useMiles');
            
            if (this.isLocked) this.lockedStationName = station.name;

            let distText = 'Dist: N/A';
            if (station.distance !== null) {
                if (useMiles) {
                    const miles = Math.round(station.distance * 0.621371);
                    distText = `${miles} mi`;
                } else {
                    distText = `${Math.round(station.distance)} km`;
                }
            }

            let loc = station.location || 'N/A';
            if (loc.length > 24) loc = loc.substring(0, 24) + '...';
            let power = (station.power !== null) ? station.power : 'N/A';

            const html = `
                <div class="station-name">${station.name}</div>
                <div class="station-location">${loc} <span class="text-gray">[${station.country}]</span> <span class="text-gray">▪</span> ${distText}</div>
                <div class="station-meta">${station.language} <span class="text-gray">▪</span> ${station.timeUTC}z <span class="text-gray">▪</span> ${power}kW</div>
            `;

            this.elements.content.html(html);
            this.elements.source.text(station.source).show();
            this.elements.nav.toggle(this.stationList.length > 0); 
            this.elements.counter.text(`${this.currentIndex + 1} / ${this.stationList.length}`);
            const currentStationFreq = station.frequency || this.currentFreqKHz;
            const isMWLW = currentStationFreq >= 144 && currentStationFreq <= 1701;
            
            if (this.isAdmin && isMWLW) {
                this.elements.favBtn.show();
                const isFav = this.favorites.some(f => f.name === station.name && f.frequency === currentStationFreq);
                if (isFav) {
                    this.elements.favBtn.html('❌').attr('title', 'Remove from Scale');
                } else {
                    this.elements.favBtn.html('⭐').attr('title', 'Add to Scale');
                }
            } else {
                this.elements.favBtn.hide();
            }
			this._renderAfList(station.alternative_frequencies, currentStationFreq);
            this.elements.display.css('cursor', station.distance !== null ? 'pointer' : 'default');
        }

        _renderAfList(freqs, current) {
            const container = $('#af-list');
            container.empty();
            let all = [...(freqs || [])];
            if(current) all.push(current);
            all = [...new Set(all)].sort((a,b)=>a-b);
            if(all.length === 0) return;
            let html = '<div class="alt-freq-list">';
            all.forEach(f => {
                const display = f > 1000 ? (f/1000).toFixed(3) : f;
                const activeClass = (f === current) ? ' active-freq' : '';
                html += `<div class="alt-freq-item${activeClass}" data-freq="${f}">${display}</div>`;
            });
            html += '</div>';
            container.html(html);
            container.find('.alt-freq-item').click((e) => {
                if ($(e.target).hasClass('active-freq')) return;
                const f = $(e.target).data('freq');
                if (typeof socket !== 'undefined' && socket.readyState === 1) socket.send("T"+f);
            });
        }

        _nav(dir) {
			this.lastInteractionTime = Date.now();
            if (this.stationList.length === 0) return;
            this.currentIndex = (this.currentIndex + dir + this.stationList.length) % this.stationList.length;
            if (this.isLocked) this.lockedStationName = this.stationList[this.currentIndex].name;
            this._renderStation();
        }

        _toggleLock() {
            this.isLocked = !this.isLocked;
            if (this.isLocked) {
                this.elements.lockBtn.addClass('locked').html('🔒');
                if (this.stationList.length > 0) this.lockedStationName = this.stationList[this.currentIndex].name;
            } else {
                this.elements.lockBtn.removeClass('locked').html('🔓');
                this.lockedStationName = '';
            }
        }

        _toggleFavorite() {
            const st = this.stationList[this.currentIndex];
            if(!st) return;
            const fKHz = st.frequency || this.currentFreqKHz;
            const isFav = this.favorites.some(f => f.name === st.name && f.frequency === fKHz);
            const endpoint = isFav ? '/AM-Station_info/favorites/remove' : '/AM-Station_info/favorites/add';

            $.ajax({
                url: endpoint, type: 'POST', contentType: 'application/json',
                data: JSON.stringify({ 
                    name: st.name, 
                    frequency: fKHz, 
                    country: st.country, 
                    location: st.location, 
                    power: st.power,
                    distance: st.distance ? Math.round(st.distance) : null,
                    azimuth: st.azimuth,
                    language: st.language,
                    timeUTC: st.timeUTC,
                    source: st.source
                })
            }).done(data => {
                if (data.success) {
                    this.favorites = data.favorites;
                    this._renderStation(); 
                    if (typeof AnalogScaleEngine !== 'undefined' && typeof AnalogScaleEngine.fetchMwLwFavorites === 'function') {
                        AnalogScaleEngine.fetchMwLwFavorites();
                    }
                }
            });
        }

        _areListsEqual(a, b) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) if (a[i].name !== b[i].name) return false;
            return true;
        }

        async _openMap(station) {
            $('#aoki-map-modal').show();
            
            if (this.settings.get('showKp')) {
                this._fetchKpIndex();
            } else {
                $('#aoki-map-kp').hide();
            }
            
            if(this.settings.get('showGraph')) {
                $('.aoki-map-footer').show();
                $('.aoki-map-dialog').css('padding-bottom', '0');
            } else {
                $('.aoki-map-footer').hide();
            }

            await this._ensureLeafletLoaded();
            this._ensureLeafletMap();

            setTimeout(() => { if (this.mapState.map) this.mapState.map.invalidateSize(); }, 10);
            if (this.intervals.terminator) clearInterval(this.intervals.terminator);

            await this._loadOfflineBasemapOnce();
            
            // Visuals update
            this._updateMapVisuals();

            if (this.settings.get('showGraph') || this.settings.get('showTerminator')) {
                const updateDynamics = () => {
                    if (this.mapState.layers.terminator) this.mapState.layers.terminator.remove();
                    if (this.settings.get('showTerminator')) {
                        this.mapState.layers.terminator = L.terminator({ 
							fillOpacity: 0.35, 
							color: '#051945', 
							interactive: false,
                            pane: 'terminatorPane'
						}).addTo(this.mapState.map);
                    }

                    if (this.settings.get('showGraph')) {
                        const activeProfile = this._getDynamicProfile();
                        if (activeProfile) {
                            this._updatePropagationGraph(activeProfile);
                            this._updateFrequencyMarker(this.currentFreqKHz, activeProfile);
                        }
                    }
                };
                updateDynamics();
                this.intervals.terminator = setInterval(updateDynamics, 300000);
            }

            if (this.mapState.layers.line) this.mapState.map.removeLayer(this.mapState.layers.line);
            if (this.mapState.layers.qth) this.mapState.map.removeLayer(this.mapState.layers.qth);
            if (this.mapState.layers.tx) this.mapState.map.removeLayer(this.mapState.layers.tx);
            $('#aoki-map-infobox').remove();

            const topPane = 'topVectorPane';

            this.mapState.layers.qth = L.circleMarker([this.qth.lat, this.qth.lon], { 
                radius: 7, color: '#ffffff', weight: 2, fillColor: '#007bff', fillOpacity: 1.0,
                pane: topPane
            }).addTo(this.mapState.map).bindPopup('QTH');
            
            const stLat = parseFloat(station.lat||station.latitude);
            const stLon = parseFloat(station.lon||station.longitude);
            const transmitterIcon = L.icon({ iconUrl: '/assets/leaflet/images/transmitter-icon.png', iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -30] });
            this.mapState.layers.tx = L.marker([stLat, stLon], { icon: transmitterIcon, pane: topPane }).addTo(this.mapState.map);

            if (this.settings.get('showPath')) {
                const generator = new arc.GreatCircle({ x: this.qth.lon, y: this.qth.lat }, { x: stLon, y: stLat });
                const lineData = generator.Arc(100, { offset: 10 });
                const points = lineData.geometries[0].coords.map(c => [c[1], c[0]]);
                this.mapState.layers.line = L.polyline(points, { 
                    weight: 3, 
                    color: '#FF0000',
                    opacity: 0.8,
                    pane: topPane 
                }).addTo(this.mapState.map);
                this.mapState.map.fitBounds(this.mapState.layers.line.getBounds(), { padding: [50, 50] });
            } else {
                 this.mapState.map.setView([stLat, stLon], 4);
            }

            const useMiles = this.settings.get('useMiles');
            let distText = 'N/A';
            if (station.distance != null) {
                const km = Math.round(station.distance);
                const miles = Math.round(km * 0.621371);
                distText = useMiles ? `${miles} mi` : `${km} km`;
            }
            let loc = station.location || 'N/A';
            if (loc.length > 24) loc = loc.substring(0, 24) + '...';

            const infoHTML = `
              <div id="aoki-map-infobox">
                <div class="info-header"><h4>${station.name}</h4><span class="info-toggle">${this.settings.get('extendedInfo') ? '−' : '+'}</span></div>
                <div class="info-content" style="${this.settings.get('extendedInfo') ? 'display:block' : ''}">
                  <p><strong>Location:</strong> ${loc}</p><p><strong>Distance:</strong> ${distText}</p>
                  <p><strong>Country:</strong> ${station.country||'N/A'}</p><p><strong>Frequency:</strong> ${station.frequency||this.currentFreqKHz} kHz</p>
                  <p><strong>Power:</strong> ${station.power||'N/A'} kW</p><p><strong>Broadcast:</strong> ${station.timeUTC||'N/A'} UTC</p>
                  <p><strong>Days:</strong> ${station.days||'N/A'}</p><p><strong>Language:</strong> ${station.language||'N/A'}</p>
                  <p><strong>Azimuth:</strong> ${station.azimuth||'N/A'}</p><p><strong>Info:</strong> ${station.remarks||'N/A'}</p>
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
            this.mapState.layers.tx.on('click', function() { 
                if (!$infoContent.is(':visible')) { $infoContent.slideDown(200); $infoBox.find('.info-toggle').text('−'); } 
            });
        }

        _closeMap() {
            $('#aoki-map-modal').hide();
            if (this.intervals.terminator) clearInterval(this.intervals.terminator);
            if (this.mapState.map) {
                this.mapState.map.remove();
                this.mapState.map = null;
                this.mapState.basemapLoaded = false; 
            }
        }

        _fetchKpIndex() {
            const $kp = $('#aoki-map-kp');
            $kp.text('Kp: ...').css('color', '#ccc').show();
            $.getJSON(CONFIG.auroraApi).done(data => {
                let kp = data.th_30_kp || (data.ace ? data.ace.kp : null) || data.wing_kp;
                if (kp !== null) {
                    const val = parseFloat(kp);
                    $kp.text(`Kp: ${val.toFixed(2)}`);
                    if(val < 4) $kp.css('color', '#2ecc71');
                    else if (val < 5) $kp.css('color', '#f1c40f');
                    else $kp.css('color', '#e74c3c');
                } else { $kp.text('Kp: N/A').css('color','#999'); }
            });
        }

        _ensureLeafletLoaded() {
            const loadCSS = href => new Promise((res, rej) => { const l=document.createElement('link');l.rel='stylesheet';l.href=href;l.onload=res;l.onerror=rej;document.head.appendChild(l); });
            const loadJS = src => new Promise((res, rej) => { const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s); });
            if (window.L && window.L.terminator && window.arc && window.SunCalc) return Promise.resolve();
            if (this.mapState.leafletReadyPromise) return this.mapState.leafletReadyPromise;
            this.mapState.leafletReadyPromise = loadCSS('/assets/leaflet/leaflet.css')
                .then(() => loadJS('/assets/leaflet/leaflet.js'))
                .then(() => loadJS('/assets/leaflet/L.Terminator.js'))
                .then(() => loadJS('/assets/leaflet/arc.js'))
                .then(() => loadJS('/assets/leaflet/SunCalc.js'));
            return this.mapState.leafletReadyPromise;
        }

        _ensureLeafletMap() {
            if (this.mapState.map) return;
            this.mapState.map = L.map('aoki-map', { zoomControl: false, attributionControl: false });
            L.control.zoom({ position: 'topright' }).addTo(this.mapState.map);
            this.mapState.map.setView([20, 0], 2);
            $('#aoki-map').css('background', '#BDE0FE');

            // --- DEFINE Z-INDEX ORDER HERE ---
            // 400: Default Overlay (Countries/Borders)
            // 550: Terminator (Night shadow)
            // 600: Default Marker (Leaflet markers)
            // 650: Top Vector (Our lines and QTH circle)

            this.mapState.map.createPane('terminatorPane');
            this.mapState.map.getPane('terminatorPane').style.zIndex = 550;
            this.mapState.map.getPane('terminatorPane').style.pointerEvents = 'none';

            this.mapState.map.createPane('topVectorPane');
            this.mapState.map.getPane('topVectorPane').style.zIndex = 650;
            this.mapState.map.getPane('topVectorPane').style.pointerEvents = 'none';

            const updateZoomClass = () => {
                const z = this.mapState.map.getZoom();
                const container = this.mapState.map.getContainer();
                for (let i = 0; i <= 20; i++) container.classList.remove('leaflet-zoom-' + i);
                container.classList.add('leaflet-zoom-' + z);
            };
            this.mapState.map.on('zoomend', updateZoomClass);
            updateZoomClass();
        }

        _updateMapVisuals() {
            if (!this.mapState.map) return;
            const mapContainer = this.mapState.map.getContainer();
            // Toggle country labels class
            if (this.settings.get('showCountryLabels')) {
                mapContainer.classList.remove('hide-country-labels');
            } else {
                mapContainer.classList.add('hide-country-labels');
            }
            // Trigger zoom event to re-check capitals layer
            this.mapState.map.fire('zoomend');
        }

        _loadOfflineBasemapOnce() {
            if (this.mapState.basemapLoaded) return Promise.resolve();
            const fetchJson = url => fetch(url).then(r => r.json());
            
            const countries = fetchJson('/assets/world_countries_50m.geojson').then(geo => {
                const geoJsonLayer = L.geoJSON(geo, {
                    style: { 
                        color: '#3f3f3f', 
                        weight: 1, 
                        opacity: 1, 
                        fillColor: '#f2e9d8', 
                        fillOpacity: 0.8 
                    },
                    onEachFeature: (feature, layer) => {
                        let labelLatlng;
                        if (feature.geometry.type === 'Polygon') {
                            labelLatlng = layer.getBounds().getCenter();
                        } else if (feature.geometry.type === 'MultiPolygon') {
                            let largestPolyIndex = 0;
                            let maxPoints = 0;
                            const coords = feature.geometry.coordinates;
                            for (let i = 0; i < coords.length; i++) {
                                if (coords[i][0].length > maxPoints) {
                                    maxPoints = coords[i][0].length;
                                    largestPolyIndex = i;
                                }
                            }
                            const ring = coords[largestPolyIndex][0];
                            let bounds = L.latLngBounds();
                            ring.forEach(pt => bounds.extend([pt[1], pt[0]]));
                            labelLatlng = bounds.getCenter();
                        }

                        if (feature.properties.NAME === 'Norway') {
                            labelLatlng = L.latLng(61.5, 8.5); 
                        }

                        if (feature.properties.NAME && labelLatlng) {
                            const labelMarker = L.marker(labelLatlng, {
                                icon: L.divIcon({ className: 'country-label-wrapper', html: '', iconSize: [0,0] }), 
                                interactive: false 
                            }).addTo(this.mapState.map);

                            labelMarker.bindTooltip(feature.properties.NAME, { 
                                permanent: true, 
                                direction: 'center', 
                                className: 'country-label',
                                interactive: false
                            });
                        }

                        layer.on({
                            mouseover: (e) => {
                                const l = e.target;
                                l.setStyle({ weight: 2, color: '#666', fillOpacity: 1.0, fillColor: '#ffffff' });
                                l.bringToFront(); 
                            },
                            mouseout: (e) => { geoJsonLayer.resetStyle(e.target); },
                            click: (e) => { this.mapState.map.fitBounds(e.target.getBounds()); }
                        });
                    }
                }).addTo(this.mapState.map);
            });

            const places = fetchJson('/assets/capitals.geojson').then(geo => {
                const mk = () => L.geoJSON(geo, {
                    pointToLayer: (feature, latlng) => L.marker(latlng, {
                        icon: L.divIcon({ className: 'ne-place-label', html: `<span>${feature.properties?.NAME || ''}</span>`, iconSize: [0, 0] }),
                        keyboard: false, interactive: false
                    })
                });
                
                this.mapState.layers.capitals = mk();
                
                const update = () => {
                    const z = this.mapState.map.getZoom();
                    const showCapitals = this.settings.get('showCapitalLabels');

                    if (z >= 3 && showCapitals) {
                        if (!this.mapState.map.hasLayer(this.mapState.layers.capitals)) {
                            this.mapState.map.addLayer(this.mapState.layers.capitals);
                        }
                    } else {
                        if (this.mapState.map.hasLayer(this.mapState.layers.capitals)) {
                            this.mapState.map.removeLayer(this.mapState.layers.capitals);
                        }
                    }
                };
                this.mapState.map.on('zoomend', update);
                update();
            }).catch(err => console.error('Places load failed', err));

            this.mapState.basemapLoaded = true;
            return Promise.all([countries, places]);
        }

        _getDynamicProfile() {
            const now = new Date();
            const sunTimes = SunCalc.getTimes(now, this.qth.lat, this.qth.lon);
            const timeline = DYNAMIC_PROFILE_MODEL.map(point => {
                const eventTime = sunTimes[point.event];
                const eventHours = eventTime.getHours() + eventTime.getMinutes() / 60;
                return { ...point, time: eventHours + point.offsetHours };
            }).sort((a, b) => a.time - b.time);
            
            timeline.unshift({ ...timeline[0], time: timeline[0].time - 24 });
            timeline.push({ ...timeline[timeline.length - 1], time: timeline[timeline.length - 1].time + 24 });

            const cur = now.getHours() + now.getMinutes() / 60;
            let before = timeline[0], after = timeline[timeline.length - 1];
            for (let i = 0; i < timeline.length; i++) {
                if (timeline[i].time <= cur) before = timeline[i];
                if (timeline[i].time >= cur) { after = timeline[i]; break; }
            }
            
            const p = (cur - before.time) / (after.time - before.time);
            const lerp = (a, b) => a + (b - a) * p;
            const luf = lerp(before.luf, after.luf);
            const muf = lerp(before.muf, after.muf);
            const gs = lerp(before.greenStart, after.greenStart);
            const ge = lerp(before.greenEnd, after.greenEnd);
            const bw = muf - luf;
            
            return { luf, muf, greenStartsAt: (gs-luf)/(bw||1), greenEndsAt: (ge-luf)/(bw||1) };
        }

        _updatePropagationGraph(profile) {
            const max = 27;
            const bw = profile.muf - profile.luf;
            const yLow = profile.luf + (bw * profile.greenStartsAt);
            const gEnd = profile.luf + (bw * profile.greenEndsAt);
            $('#graph-red-luf').css('width', (profile.luf/max)*100+'%');
            $('#graph-yellow-low').css('width', ((yLow-profile.luf)/max)*100+'%');
            $('#graph-green-optimal').css('width', ((gEnd-yLow)/max)*100+'%');
            $('#graph-yellow-high').css('width', ((profile.muf-gEnd)/max)*100+'%');
            $('#graph-red-muf').css('width', (100 - (profile.muf/max)*100)+'%');
        }

        _updateFrequencyMarker(freq, profile) {
            const pct = (freq/1000 / 27) * 100;
            $('#frequency-pointer-top').css('left', pct+'%').show();
            $('#frequency-pointer-bottom').css('left', pct+'%').show();
            $('#frequency-line').css('left', pct+'%').show();
            
            const fMhz = freq/1000;
            const bw = profile.muf - profile.luf;
            const yLow = profile.luf + (bw * profile.greenStartsAt);
            const gEnd = profile.luf + (bw * profile.greenEndsAt);
            
            let c = '#c0392b';
            if (fMhz < profile.luf || fMhz > profile.muf) c = '#fff';
            else if (fMhz < yLow || fMhz > gEnd) c = '#3498db';
            $('#frequency-line').css('background', c);
        }
    }

    $(document).ready(() => { new AmStationPlugin().init(); });
})();
