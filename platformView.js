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
            elementsToClear[0].innerHTML = '';
        }
        
        clearStoppingPattern();
        clearFollowingDepartures();
    },
    
    updatePage: function(state) {
        return new Promise(function(resolve, reject) {
            debug('updatePage');
            //Update the loading indicator and display the current time
            document.getElementById(_loadingElementId).innerHTML = 'Done.';
            var refresh_date = new Date();
            document.getElementById(_refreshTimeElementId).innerHTML = padSingleDigitWithZero(refresh_date.getHours()) + 
                ':' + padSingleDigitWithZero(refresh_date.getMinutes()) + ':' + padSingleDigitWithZero(refresh_date.getSeconds());					
            
            state.pattern = state.data;
            state.data = null;
            var next_departure = state.departures.departures[0];
        
            //Reset some elements
            document.getElementById(_errorElementId).innerHTML = '';
        
            //Set stop name
            var stop_name = '';
            var selected_stop_index = 0;
            for (var i = 0; i < state.stopsOnRoute.stops.length; i++) {
                if (state.stopsOnRoute.stops[i].stop_id == state.params.stop_id) {
                    stop_name = state.stopsOnRoute.stops[i].stop_name;
                    selected_stop_index = i;
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
        
            var time = DateTimeHelpers.formatSingleTime(next_departure.scheduled_departure_utc);				
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
            
            var found_current_stop = false;
            var stopping_pattern_count = 0;
            for (var j = 0; j < state.pattern.departures.length; j++) {
                var stop_id = state.pattern.departures[j].stop_id;
                                        
                if (found_current_stop) {						
                    var name = stops.get(stop_id).replace(' Station', '');
                    addStoppingPatternItem(name);
                }
                
                if (stop_id == state.params.stop_id) {
                    stopping_pattern_count = state.pattern.departures.length - j;
                    found_current_stop = true;
                }
            }				
            
            var list_element = document.getElementById('next-stops-list');
            if (stopping_pattern_count > 7) {
                if (list_element.className.indexOf('two-columns') == -1) {
                    list_element.className += 'two-columns';
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