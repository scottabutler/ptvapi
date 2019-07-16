var PTV = {
    //Fields
    //NOTE: Use of the developer ID and secret key contained in this site 
    //is subject to the Terms of Use of the PTV API. Unauthorised use of 
    //these credentials is prohibited. You can request your own key from 
    //PTV via email.
    
    //Methods
    generateSignature: function(request) {
        var hash = CryptoJS.HmacSHA1(request, this._secret);
        return hash;
    },
            
    sendRequest: function(endpoint, name, state) {				
        return new Promise(function(resolve, reject) {
            document.getElementById(_loadingElementId).innerHTML += '.';
            var xmlhttp = new XMLHttpRequest();
            xmlhttp.onreadystatechange = function() {					
                if (xmlhttp.readyState === XMLHttpRequest.DONE) {
                    if (xmlhttp.status === 200) {
                        debug('sendRequest end ' + name);
                        state.data = JSON.parse(xmlhttp.responseText);
                        resolve(state);
                    } else {
                        reject('Something went wrong: ' + xmlhttp.status);
                    }
                }
            };
            
            var settings = PTV.getGlobalSettings();
        
            var qs = endpoint.indexOf("?") == -1 ? "?" : "&";
            endpoint = endpoint.indexOf("devId=") == -1 ? endpoint + qs + "devid=" + PTV._devId : endpoint;
            var sig = PTV.generateSignature(endpoint);
            var url = settings.baseUrl + endpoint + "&signature=" + sig;
        
            if (settings.useCorsBypass == true) {
                url = settings.proxyUrl + encodeURIComponent(url);
            }
            
            debug('sendRequest start ' + name);
            xmlhttp.open("GET", url, true);
            xmlhttp.send();
        });
    },
    
    doStuff: function(params) {			
        Promise.resolve(params)
            .then(this.prepareStopsOnRouteCache)
            .then(this.requestDepartures)
            .then(this.requestStopsOnRoute)
            .then(this.requestStoppingPattern)
            .then(this.requestDisruptions)
            .then(this.updatePage)
            .catch(function(e) {
                document.getElementById(_errorElementId).innerHTML = 'Error: ' + e;
                document.getElementById(_loadingElementId).innerHTML = 'Error.';
                document.getElementById("realtime").style.display = 'none';						
                console.log(e);
                PTV.clearPage();					
            })
    },
    
    requestDepartures: function(params) {
        return new Promise(function(resolve, reject) {
            debug('requestDepartures');
            var endpoint = PTV.buildDeparturesEndpoint(params);
            resolve(PTV.sendRequest(endpoint, 'Departures', { data: null, params: params }));
        });
    },
    
    prepareStopsOnRouteCache: function(params) {
        return new Promise(function(resolve, reject) {
            debug('prepareStopsOnRouteCache');
            
            var expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 1);
            expiryDate = expiryDate.getTime();
            
            PTV.stopsOnRouteCache = {
                date: expiryDate
            };
            
            //Try and load the cache from local storage
            if (BrowserHelpers.hasLocalStorage()) {						
                var cache = JSON.parse(localStorage.getItem(PTV.localStorageCacheKey));
                
                if (cache) {						
                    //Check if the cache has expired
                    if (new Date(cache.date) <= new Date().getTime()) {
                        localStorage.removeItem(PTV.localStorageCacheKey);
                        cache = {
                            date: expiryDate
                        };
                    }
                
                    PTV.stopsOnRouteCache = cache;
                }
            } else {
                // Sorry! No Web Storage support..
            }
        
            //Pass the params through to the next function
            resolve(params);
        });
    },
    
    stopsOnRouteCache: {},
    
    localStorageCacheKey: "PTVAPI.stopsOnRouteCache",
    
    getStopsOnRouteCacheKey: function(state) {
        return state.params.route_type + '_' + state.params.sor_route_id;
    },
            
    requestStopsOnRoute: function(state) {							
        return new Promise(function(resolve, reject) {
            debug('requestStopsOnRoute');
            state.departures = state.data;
            state.data = null;
        
            if (state.departures == null || state.departures.departures == null || state.departures.departures.length == 0) {
                reject('No departures found.');
            }
        
            state.params.sor_route_id = state.departures.departures[0].route_id;
            state.params.run_id = state.departures.departures[0].run_id;
            
            var endpoint = PTV.buildStopsOnRouteEndpoint(state.params);
                                                    
            var key = PTV.getStopsOnRouteCacheKey(state);
            if (PTV.stopsOnRouteCache[key]) {
                state.data = PTV.stopsOnRouteCache[key];
                resolve(state);
            } else {
                resolve(PTV.sendRequest(endpoint, 'Stops on route', state));
            }
        });
    },

    requestDisruptions: function(state) {							
        return new Promise(function(resolve, reject) {
            debug('requestDisruptions');
            state.pattern = state.data;
            state.data = null;
            
            var endpoint = PTV.buildDisruptionsEndpoint(state.params);
            resolve(PTV.sendRequest(endpoint, 'Disruptions', state));
        });
    },
    
    requestStoppingPattern: function(state) {
        return new Promise(function(resolve, reject) {
            debug('requestStoppingPattern');
            state.stopsOnRoute = state.data;
            var key = PTV.getStopsOnRouteCacheKey(state);
            
            //Only modify the cache if the key is not already in there
            //otherwise we'd just be overwriting with the same data
            if (!PTV.stopsOnRouteCache[key]) {
                PTV.stopsOnRouteCache[key] = state.stopsOnRoute;
                
                if (BrowserHelpers.hasLocalStorage) {
                    localStorage.setItem(PTV.localStorageCacheKey, JSON.stringify(PTV.stopsOnRouteCache));
                }
            }
            
            state.data = null;
        
            var endpoint = PTV.buildStoppingPatternEndpoint(state.params);
        
            resolve(PTV.sendRequest(endpoint, 'Stopping pattern', state));
        });
    },
    
    clearPage: function() {
        debug('clearPage');
        
        var elementsToClear = document.getElementsByClassName('clearable');
        for (var i = 0; i < elementsToClear.length; i++) {
            elementsToClear[i].innerHTML = '';
        }
        
        clearStoppingPattern();
        clearFollowingDepartures();
        clearDisruptionList();
    },
    
    getColourForRoute: function(route_id) {
        switch (route_id) {
            case 5: //Mernda
            case 8: //Hurstbridge
                return "red";
            case 6: //Frankston
            case 16: //Werribee
            case 17: //Williamstown
                return "green";
            case 14: //Sunbury
            case 3: //Craigieburn
            case 15: //Upfield
                return "yellow";
            case 2: //Belgrave
            case 9: //Lilydale
            case 1: //Alamein
            case 7: //Glen Waverley
                return "dark-blue";
            case 4: //Cranbourne
            case 11: //Pakenham
                return "light-blue";
            case 12: //Sandringham
                return "pink";
            default:
                return "dark-blue";
        }
    },

    buildDisruptionsMap: function(items) {
        var map = new Map();
        for (var i = 0; i < items.length; i++) {
            map.set(items[i].disruption_id, items[i]);
        }
        return map;
    },

    getGeneralDisruptions: function(disruptions) {
        if (disruptions.general == undefined) {
            return '';
        }

        var result = '';

        for (var i = 0; i < disruptions.general.length; i++) {
            var data = disruptions.general[i];

            if (!data) continue;
            if (!data.display_on_board) continue;

            result += data.description;
        }

        return result;
    },

    getDisruptionDataForDeparture: function(departure, disruptions) {
        if (departure.disruption_ids == undefined) {
            return {};
        }

        var result = {};
        result.items = [];
        result.className = 'disruption goodservice mr-2';

        for (var i = 0; i < departure.disruption_ids.length; i++) {
            var id = departure.disruption_ids[i];
            var data = disruptions.get(id);

            if (!data) continue;
            if (!data.display_on_board) continue;

            var disruptionType = data.disruption_type.toLowerCase().replace(' ', '');
            switch (disruptionType) {
                case "minordelays":
                case "majordelays":
                case "plannedworks":
                case "worksalert":
                case "travelalert":
                case "serviceinformation":
                case "suspended":
                case "partsuspended":
                    result.className = "disruption " + disruptionType + " mr-2";
                    break;
                default:
                    result.className = "disruption goodservice mr-2";
            }

            result.items.push({
                type: data.disruption_type,
                message: data.description
            });
        }

        return result;
    },

    updatePage: function(state) {
        return new Promise(function(resolve, reject) {
            debug('updatePage');
            //Update the loading indicator and display the current time
            document.getElementById(_loadingElementId).innerHTML = 'Done.';
            var refresh_date = new Date();
            document.getElementById(_refreshTimeElementId).innerHTML = padSingleDigitWithZero(refresh_date.getHours()) + 
                ':' + padSingleDigitWithZero(refresh_date.getMinutes()) + ':' + padSingleDigitWithZero(refresh_date.getSeconds());					
            
            state.disruptions = PTV.buildDisruptionsMap(state.data.disruptions.metro_train);
            state.data = null;

            var next_departure = state.departures.departures[0];
        
            var route_id = next_departure.route_id;
            document.body.setAttribute('data-colour', PTV.getColourForRoute(route_id));

            //Reset some elements
            document.getElementById(_errorElementId).innerHTML = '';
        
            //Set stop name
            var stop_name = '';
            for (var i = 0; i < state.stopsOnRoute.stops.length; i++) {
                if (state.stopsOnRoute.stops[i].stop_id == state.params.stop_id) {
                    stop_name = state.stopsOnRoute.stops[i].stop_name;
                    break;
                }
            }
            
            var short_stop_name = stop_name.replace(' Station', '');
            document.getElementById(_stopElementId).innerHTML = short_stop_name;
        
            //Set platform number
            document.getElementById(_platformElementId).innerHTML = 'Platform ' + next_departure.platform_number;
        
            //Set next departure
            var next_departure_name = state.departures.runs[next_departure.run_id].destination_name;				
            document.getElementById('next-dest').innerHTML = next_departure_name;

            //Set disruption information
            clearDisruptionList();
            var disruption_data = PTV.getDisruptionDataForDeparture(next_departure, state.disruptions);        
            var disruptionElement = document.getElementById('next-dest-disruption');
            disruptionElement.setAttribute('class', 'clearable ' + disruption_data.className);
            
            var disruption_list = document.getElementById('disruption-list');

            var template = '<small><strong>{type}: </strong>{message}</small>';
            var general_disruptions = PTV.getGeneralDisruptions(state.disruptions);
                        
            if (general_disruptions && general_disruptions != '') {
                var item = document.createElement('li');                
                item.innerHTML = template.replace('{type}', 'General').replace('{message}', general_disruptions);
                disruption_list.appendChild(item);
            }
            
            for (var d of disruption_data.items) {
                var item = document.createElement('li');                
                item.innerHTML = template.replace('{type}', d.type).replace('{message}', d.message);
                disruption_list.appendChild(item);
            }
            
            //Set time and difference information
            var time = DateTimeHelpers.formatSingleTime(next_departure.scheduled_departure_utc, true);				
            document.getElementById('next-time').innerHTML = time;
        
            var diff = DateTimeHelpers.getDifferenceFromNow(next_departure.estimated_departure_utc, next_departure.scheduled_departure_utc);
            var diffSec = DateTimeHelpers.getDifferenceFromNowSec(next_departure.estimated_departure_utc, next_departure.scheduled_departure_utc);
            
            var isRt = isRealTime(next_departure.estimated_departure_utc);
            document.getElementById("realtime").style.display = (isRt ? "none" : "block");
            
            var mins_text = "min" + (isRt ? "" : "*");
            if (diffSec <= 60 && diffSec >= -60) {
                diff = "Now" + (isRt ? "" : "*");
                mins_text = "";
            }
            
            document.getElementById('next-diff').innerHTML = diff + ' ' + mins_text;
            
            //Set title
            document.title = diff + ' ' + mins_text + ' ' + short_stop_name + ' to ' +  next_departure_name;
        
            //Set stopping pattern
            clearStoppingPattern();
            var stops = new Map();
            for (var s = 0; s < state.stopsOnRoute.stops.length; s++) {
                stops.set(state.stopsOnRoute.stops[s].stop_id, state.stopsOnRoute.stops[s].stop_name);
            }

            var stopsFromCurrent = [];

            var found_current_stop = false;
            var stopping_pattern_count = 0;
            for (var j = 0; j < state.pattern.departures.length; j++) {
                var stop_id = state.pattern.departures[j].stop_id;
                var is_current_stop = stop_id == state.params.stop_id;

                if (is_current_stop) {
                    stopping_pattern_count = state.pattern.departures.length - j;
                    found_current_stop = true;
                }

                if (found_current_stop) {						
                    var name = stops.get(stop_id).replace(' Station', '');
                    stopsFromCurrent.push({id: stop_id, name: name});
                }
            }
            
            var inbound = state.departures.departures[0].direction_id == 1;
            var fullList = getStoppingPatternWithSkippedStations(stopsFromCurrent, state.departures.departures[0].route_id, inbound, state.params.stop_id);
            var desc = getShortStoppingPatternDescription(fullList, inbound, state.params.stop_id);
            
            fullList.map(x => {
                addStoppingPatternItem(x.name, x.isSkipped, x.id == state.params.stop_id)
            })

            var list_element = document.getElementById('next-stops-list');
            if (stopping_pattern_count > 7) {
                if (list_element.className.indexOf('two-columns') == -1) {
                    list_element.className += ' two-columns';
                }
            } else {
                list_element.className = list_element.className.replace('two-columns', '');
            }
            
            //Set following departures
            clearFollowingDepartures();
            for (var i = 1; i < state.departures.departures.length; i++) {
                addFollowingDeparture(state, i);
            }
            debug('End updatePage ---');
            resolve();
        });
    },
    
    
    /* Util functions */
    getGlobalSettings: function() {
        return {
            baseUrl: 'http://timetableapi.ptv.vic.gov.au',
            useCorsBypass: true,
            proxyUrl: 'https://ptvproxy20170416075948.azurewebsites.net/api/proxy?url='
            //'https://cors-anywhere.herokuapp.com/'
        }
    },
    
    /* Request functions */
    
    //Departures
    buildDeparturesEndpoint: function(params) {
        var date_utc = DateTimeHelpers.getIsoDate();
        var template = '/v3/departures/route_type/{route_type}/stop/{stop_id}' +
                '?max_results=6&date_utc={date_utc}&platform_numbers={platform_number}&expand=stop&expand=run';
        var endpoint = template
                            .replace('{route_type}', params.route_type)
                            .replace('{stop_id}', params.stop_id)
                            .replace('{platform_number}', params.platform_number)					
                            .replace('{date_utc}', date_utc);
        return endpoint;
    },
    
    //Stops on route
    buildStopsOnRouteEndpoint: function(params) {
        var date_utc = DateTimeHelpers.getIsoDate();
        var template = '/v3/stops/route/{route_id}/route_type/{route_type}' +
                '?date_utc={date_utc}';
        var endpoint = template
                            .replace('{route_type}', params.route_type)
                            .replace('{route_id}', params.sor_route_id)					
                            .replace('{date_utc}', date_utc);
        return endpoint;
    },

    //Stopping pattern
    buildStoppingPatternEndpoint: function(params) {
        var date_utc = DateTimeHelpers.getIsoDate();
        var template = '/v3/pattern/run/{run_id}/route_type/{route_type}' +
                '?date_utc={date_utc}';
        var endpoint = template
                            .replace('{route_type}', params.route_type)
                            .replace('{run_id}', params.run_id)					
                            .replace('{date_utc}', date_utc);
        return endpoint;
    },

    //Disruptions
    buildDisruptionsEndpoint: function(params) {
        var template = '/v3/disruptions?route_types={route_type}&disruption_status={disruption_status}';
        var endpoint = template
            .replace('{route_type}', params.route_type)
            .replace('{disruption_status}', 'current');
        return endpoint;
    }
};

//TODO move inside PTV object (or another object)
var debug_mode = false;
var previous_milliseconds = new Date().getTime();
function debug(message) {
    if (!debug_mode) return;
    
    var date = new Date().getTime();
    var elapsed = date - previous_milliseconds;
    previous_milliseconds = date;
    console.log('DEBUG: (' + elapsed + 'ms) ' + message);
}