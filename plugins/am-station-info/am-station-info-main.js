// AM-Station-Info v1.0
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
        $aokiDisplay.append($aokiContent);
		$aokiDisplay.append($aokiSource);

        const tooltipHTML = 'This panel only shows information about available stations, this is not RDS data.<br>Click to show on map.';
        const $tooltipText = $('<span>', { id: 'aoki-custom-tooltip', class: 'tooltiptext' }).html(tooltipHTML);
        $('body').append($tooltipText);
        $tooltipText.hide(); 

        $aokiDisplay.on('mouseenter', function() {
            const rect = this.getBoundingClientRect();
            $tooltipText.css({
                top: `${rect.top}px`,
                left: `${rect.left + (rect.width / 2)}px`,
                opacity: 0
            }).show(); 

            setTimeout(() => {
                $tooltipText.css('opacity', 1);
            }, 10);

        }).on('mouseleave', function() {
            $tooltipText.css('opacity', 0);
            setTimeout(function() {
                if ($tooltipText.css('opacity') === '0') {
                    $tooltipText.hide();
                }
            }, 300);
        });

        const style = document.createElement('style');
		style.textContent = `
            #aoki-plugin-display {
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                background-color: var(--color-1); z-index: 1010;
                color: var(--color-text); box-sizing: border-box; display: none;
                text-align: center; border-radius: 15px;
                padding: 0px 10px; 
                cursor: pointer;
            }

            #aoki-station-content {
                display: flex;
                flex-direction: column;
                justify-content: flex-start;
                height: 100%;
            }
            .station-name { margin-top: 0; font-size: 1.4em; font-weight: bold; text-transform: uppercase; margin-bottom: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--color-4); }
            .station-location { font-size: 0.9em; margin-bottom: 0px; }
            .station-meta { font-size: 0.9em; line-height: 1.4; }
            #aoki-nav-controls {
                position: absolute; bottom: 2px; right: 5px;
                display: flex; align-items: center; gap: 2px; font-size: 11px;
                cursor: default;
            }
            #aoki-nav-controls button { background: none; border: 1px solid var(--color-text); border-radius: 5px; color: var(--color-text); font-size: 11px; line-height: 1; cursor: pointer; opacity: 0.6; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; }
			#aoki-source-display { position: absolute; bottom: 0px; left: 5px; font-size: 11px; opacity: 0.6; cursor: default; }
            #aoki-nav-controls button:hover { opacity: 1; }
			.alt-freq-list { height: calc(100% - 50px); overflow-y: auto; font-size: 14px; }
            .alt-freq-item { padding: 4px 0; cursor: pointer; border-radius: 5px; }
            .alt-freq-item:hover { background-color: rgba(255, 255, 255, 0.1); }

            #aoki-custom-tooltip.tooltiptext {
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
                z-index: 99999;
            }

            #aoki-plugin-display:hover #aoki-custom-tooltip.tooltiptext {
                opacity: 1;
            }

            @media (max-width: 600px) {
                .station-name { font-size: 1.2em; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; }
                #af-list { display: none !important; }
                #aoki-custom-tooltip.tooltiptext { display: none !important; }
            }
        `;
        document.head.appendChild(style);
        $stationContainer.parent().append($aokiDisplay);

		$aokiDisplay.on('mouseenter mouseover mousemove', function(e) {
            e.stopPropagation();
        });

        function fetchStaticData() {
            $.getJSON('/static_data', data => {
                if (data.qthLatitude && data.qthLongitude) {
                    qthLatitude = data.qthLatitude;
                    qthLongitude = data.qthLongitude;
                }
            });
        }
		
		function displayAlternativeFrequencies(frequencies) {
            $afContainer.empty();
            if (!frequencies || frequencies.length === 0) return;

            let afHTML = `<div class="alt-freq-list" style="height: 100%;">`; 

            frequencies.forEach(freq => {
                const displayFreq = freq > 1000 ? (freq / 1000).toFixed(3) : freq;
                afHTML += `<div class="alt-freq-item" data-freq="${freq}">${displayFreq}</div>`;
            });
            afHTML += `</div>`;
            $afContainer.html(afHTML);
        }
		
		function tuneToFrequency(freqKHz) {
            if (typeof socket !== 'undefined' && socket.readyState === WebSocket.OPEN) {
                socket.send("T" + freqKHz);
            }
        }
		
		function areStationListsEqual(listA, listB) {
            if (listA.length !== listB.length) {
                return false;
            }

            for (let i = 0; i < listA.length; i++) {
                if (listA[i].name !== listB[i].name) {
                    return false; 
                }
            }

            return true;
        }

        function displayStation() {
            if (stationList.length === 0) {
                $aokiContent.html('<h4 style="padding-top: 25px; margin:0;">No active stations found.</h4>');
                $navControls.hide();
                return;
            }

            const station = stationList[currentIndex];
            
            const stationHTML = `
                <div class="station-name">${station.name}</div>
                <div class="station-location">${station.location} <span class="text-gray">[${station.country}]</span></div>
                <div class="station-meta">${station.language} <span class="text-gray">▪</span> ${station.timeUTC}z</div>
                <div class="station-meta">${station.power}kW <span class="text-gray">▪</span> ${station.distance}km</div>
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
        }

        function isStationActiveNow(serverTime, timeUTC) {
            if (!timeUTC || !serverTime || timeUTC.indexOf('-') === -1) return false;
            try {
                const [startStr, endStr] = timeUTC.split('-');
                const currentUTCHours = serverTime.getUTCHours();
                const currentUTCMinutes = serverTime.getUTCMinutes();
                const nowInMinutes = currentUTCHours * 60 + currentUTCMinutes;
                const startHour = parseInt(startStr.substring(0, 2), 10);
                const startMinute = parseInt(startStr.substring(2, 4), 10);
                const startInMinutes = startHour * 60 + startMinute;
                const endHour = endStr === '2400' ? 23 : parseInt(endStr.substring(0, 2), 10);
                const endMinute = endStr === '2400' ? 59 : parseInt(endStr.substring(2, 4), 10);
                const endInMinutes = endHour * 60 + endMinute;
                if (startInMinutes > endInMinutes) {
                    return nowInMinutes >= startInMinutes || nowInMinutes <= endInMinutes;
                } else {
                    return nowInMinutes >= startInMinutes && nowInMinutes <= endInMinutes;
                }
            } catch (e) {
                return false;
            }
        }

        function fetchAndDisplayAokiData(freqMHz) {
            currentFreqKHz = Math.round(freqMHz * 1000);
            const url = `${AOKI_API_URL}?freq=${currentFreqKHz}&lat=${qthLatitude}&lon=${qthLongitude}`;

            $.getJSON(url).done(data => {
                if (currentMode !== 'AM') return;

                if (data && data.status === 'success' && data.stations && data.stations.length > 0) {
                    const newStationList = data.stations;

                    if (!areStationListsEqual(stationList, newStationList)) {
                        currentIndex = 0;
                    }

                    stationList = newStationList;
                    displayStation();

                } else {
                    stationList = [];
                    const errorMessage = data.message || 'No active stations found.';
                    $aokiContent.html(`<h4 style="padding-top: 25px; margin:0;">${errorMessage}</h4>`);
                    $navControls.hide();
                    $aokiSource.hide();
                    $afContainer.empty();
                }

            }).fail(() => {
                if (currentMode !== 'AM') return;
                stationList = [];
                $aokiContent.html('<h4 style="padding-top: 25px; margin:0;">Error loading data.</h4>');
                $navControls.hide();
                $aokiSource.hide();
                $afContainer.empty();
            });
        }

		function handleFrequencyChange() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const freqText = $('#data-frequency').text();
                if (!freqText) return;
                const freqMHz = parseFloat(freqText);
                
                clearInterval(activityCheckInterval); 

                if (freqMHz <= AM_MAX_FREQ_MHZ) {
                    if (currentMode !== 'AM') {
                        currentMode = 'AM';
                        $stationContainer.hide();
                        $aokiDisplay.show();
                    }
                    
                    fetchAndDisplayAokiData(freqMHz);
                    
                    activityCheckInterval = setInterval(function() {
                        fetchAndDisplayAokiData(freqMHz); 
                    }, 10000);

                } else {
                    if (currentMode !== 'FM') {
                        currentMode = 'FM';
                        $aokiDisplay.hide();
                        $stationContainer.show();
                        $afContainer.empty();

                        $tooltipText.hide().css('opacity', 0);
                    }
                }
            }, 100);
        }

        $aokiDisplay.on('click', function(e) {
            if ($(e.target).is('button') || $(e.target).closest('button').length > 0) { return; }
            if (currentFreqKHz > 0) {
                const url = `https://odx.fmdx.no/sw_list/index.php?q=&freq=${currentFreqKHz}&lat=${qthLatitude}&lon=${qthLongitude}&limit=100&show_lines=1&only_active=1`;
                window.open(url, '_blank');
            }
        });
        $prevButton.on('click', (e) => {
            e.stopPropagation();
            currentIndex = (currentIndex - 1 + stationList.length) % stationList.length;
            displayStation();
        });
        $nextButton.on('click', (e) => {
            e.stopPropagation();
            currentIndex = (currentIndex + 1) % stationList.length;
            displayStation();
        });
		$afContainer.on('click', '.alt-freq-item', function() {
            const freqKHz = $(this).data('freq');
            if (freqKHz) {
                tuneToFrequency(freqKHz);
            }
        });
        fetchStaticData();
        const targetNode = document.getElementById('data-frequency');
        if (targetNode) {
            const observer = new MutationObserver(handleFrequencyChange);
            observer.observe(targetNode, { childList: true, subtree: true, characterData: true });
        }
        setTimeout(handleFrequencyChange, 1000);
        console.log('AM-Station-Info Loaded and Ready.');
    });
})();