"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
//}
/// <reference path="types.ts" />
const _loadingElementId = "loading";
const _refreshTimeElementId = 'refresh-time';
const _errorElementId = 'error';
const _stopElementId = 'stop';
const _platformElementId = 'platform';
const _followingDeparturesElementId = 'following-departures';
const _nextStopsListElementId = 'next-stops-list';
const _platformSelectElementId = 'platform-select';
const _disruptionListElementId = 'disruption-list';
let _stopsOnRouteCache = {
    date: new Date().setDate(new Date().getDate() - 1),
    data: new Map()
};
const PTV = {
    //Fields
    //NOTE: Use of the developer ID and secret key contained in this site 
    //is subject to the Terms of Use of the PTV API. Unauthorised use of 
    //these credentials is prohibited. You can request your own key from 
    //PTV via email.
    // 
    //Methods
    generateSignature: function (request, secret) {
        const hash = CryptoJS.HmacSHA1(request, secret);
        return hash;
    },
    //TODO generics for return type
    /*sendRequest: function(endpoint:string, name:string, state:IncompleteState, credentials:Credentials):Promise<RequestResult> {
        return new Promise(function(resolve, reject) {
            document.getElementById(_loadingElementId)!.innerHTML += '.';
            const xmlhttp = new XMLHttpRequest();
            xmlhttp.onreadystatechange = function() {
                if (xmlhttp.readyState === XMLHttpRequest.DONE) {
                    if (xmlhttp.status === 200) {
                        debug('sendRequest end ' + name);
                        state.data = JSON.parse(xmlhttp.responseText);

                        const result: RequestResult = { state: state, credentials: credentials };
                        resolve(result);
                    } else {
                        reject('Something went wrong: ' + xmlhttp.status);
                    }
                }
            };
            
            const settings = PTV.getGlobalSettings();
        
            const qs = endpoint.indexOf("?") == -1 ? "?" : "&";
            const theEndpoint = endpoint.indexOf("devId=") == -1
                ? endpoint + qs + "devid=" + credentials.id
                : endpoint;
            const sig = PTV.generateSignature(theEndpoint, credentials.secret);
            const urlWithSignature = settings.baseUrl + theEndpoint + "&signature=" + sig;
            const url = settings.useCorsBypass == true
                ? settings.proxyUrl + encodeURIComponent(urlWithSignature)
                : urlWithSignature;
            
            debug('sendRequest start ' + name);
            xmlhttp.open("GET", url, true);
            xmlhttp.send();
        });
    }, */
    doStuff: function (params) {
        const credentials = {
            id: params.dev_id,
            secret: params.dev_secret
        };
        const stateParams = {
            platform_number: params.platform_number,
            route_type: params.route_type,
            run_id: 0,
            stop_id: params.stop_id,
            sor_route_id: 0,
            credentials: credentials
        };
        let validateDeparturesResponse = function (departuresResponse) {
            return new Promise((resolve, reject) => {
                if (departuresResponse == null || departuresResponse.departures == null || departuresResponse.departures.length == 0) {
                    reject('Departures error: No departures found.');
                }
                if (departuresResponse.departures[0].route_id == undefined) {
                    reject('Departures error: No routeId returned for next departure.');
                }
                if (departuresResponse.departures[0].run_id == undefined) {
                    reject('Departures error: No runId returned for next departure.');
                }
                return resolve(departuresResponse);
            });
        };
        let updateStopsOnRouteCache = function (stopsOnRouteResponse, cache, cacheKey) {
            return new Promise((resolve) => {
                //Only modify the cache if the key is not already in there
                //otherwise we'd just be overwriting with the same data
                if (cache.data != undefined
                    && !cache.data.get(cacheKey)
                    && stopsOnRouteResponse != undefined) {
                    cache.data.set(cacheKey, stopsOnRouteResponse);
                    if (BrowserHelpers.hasLocalStorage()) {
                        localStorage.setItem(PTV.localStorageCacheKey, JSON.stringify(cache));
                    }
                }
                //Return the (possibly updated) cache
                return resolve(cache);
            });
        };
        let departuresPromise = this.requestDepartures2(stateParams)
            .then(validateDeparturesResponse);
        let prepareStopsOnRouteCachePromise = this.prepareStopsOnRouteCache2();
        Promise.all([departuresPromise, prepareStopsOnRouteCachePromise])
            .then((resolvedPromises) => {
            const departuresResponse = resolvedPromises[0];
            const departures = departuresResponse.departures;
            const runs = departuresResponse.runs;
            const routeId = departures[0].route_id;
            const runId = departures[0].run_id;
            const routeType = params.route_type;
            const cacheKey = PTV.getStopsOnRouteCacheKey2(routeType, routeId);
            let stopsOnRoutePromise = this.requestStopsOnRoute2(params.route_type, routeId, stateParams, resolvedPromises[1])
                .then((stopsOnRouteResponse) => updateStopsOnRouteCache(stopsOnRouteResponse, _stopsOnRouteCache, cacheKey))
                .then((updatedCache) => _stopsOnRouteCache = updatedCache);
            let stoppingPatternPromise = this.requestStoppingPattern2(routeType, runId, credentials);
            let disruptionsPromise = this.requestDisruptions2(routeType, credentials);
            Promise.all([stopsOnRoutePromise, stoppingPatternPromise, disruptionsPromise])
                .then((resolvedPromises) => {
                const stopsOnRoute = _stopsOnRouteCache.data.get(cacheKey); //resolvedPromises[0].data!.get(cacheKey);
                const stoppingPattern = resolvedPromises[1];
                const disruptions = resolvedPromises[2];
                //TODO - This is legacy code to connect up to the old updatePage function
                const stateParams = {
                    route_type: routeType,
                    sor_route_id: routeId,
                    run_id: runId,
                    stop_id: params.stop_id,
                    platform_number: params.platform_number,
                    credentials: credentials
                };
                const incompleteState = {
                    data: disruptions,
                    params: stateParams,
                    departures: departures,
                    runs: runs,
                    pattern: stoppingPattern,
                    stopsOnRoute: stopsOnRoute
                };
                const requestResult = {
                    state: incompleteState,
                    credentials: credentials
                };
                Promise.resolve(requestResult).then(this.updatePage);
            });
        })
            .catch(function (e) {
            document.getElementById(_errorElementId).innerHTML = 'Error: ' + e;
            document.getElementById(_loadingElementId).innerHTML = 'Error.';
            document.getElementById("realtime").style.display = 'none';
            PTV.clearPage();
        });
        /*Promise.resolve(stateParams)
            .then(this.prepareStopsOnRouteCache)
            .then(this.requestDepartures)
            .then(this.requestStopsOnRoute)
            .then(this.requestStoppingPattern)
            .then(this.requestDisruptions)
            .then(this.updatePage)
            .catch(function(e:string) {
                document.getElementById(_errorElementId)!.innerHTML = 'Error: ' + e;
                document.getElementById(_loadingElementId)!.innerHTML = 'Error.';
                document.getElementById("realtime")!.style.display = 'none';
                console.log(e);
                PTV.clearPage();
            })*/
    },
    /*prepareStopsOnRouteCache: function(params: StateParams): Promise<StateParams> {
        return new Promise(function(resolve, reject) {
            debug('prepareStopsOnRouteCache');
            
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 1);
            const expiryDateNew = expiryDate.getTime();

            //Initialise default cache
            //_stopsOnRouteCache = {
            //    date: expiryDate.getTime(),
            //    data: undefined
            //};
            
            //Try and load the cache from local storage
            if (BrowserHelpers.hasLocalStorage()) {
                const fromStorage = localStorage.getItem(PTV.localStorageCacheKey);
                let cache: StopsOnRouteCache =
                    fromStorage != undefined
                        ? JSON.parse(fromStorage)
                        : undefined; //TODO immutable?
                
                if (cache != undefined) {
                    //Check if the cache has expired
                    if (new Date(cache.date).getTime() <= new Date().getTime()) {
                        localStorage.removeItem(PTV.localStorageCacheKey);
                        cache = {
                            date: expiryDateNew,
                            data: undefined //no data yet
                        };
                    }
                
                    _stopsOnRouteCache = cache;
                }
            } else {
                // Sorry! No Web Storage support..
            }
        
            //Pass the params through to the next function
            resolve(params);
        });
    },*/
    prepareStopsOnRouteCache2: function () {
        return new Promise(function (resolve) {
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 1);
            const expiryDateNew = expiryDate.getTime();
            const newCache = {
                date: expiryDateNew,
                data: undefined //no data yet
            };
            //Try and load the cache from local storage
            if (BrowserHelpers.hasLocalStorage()) {
                const fromStorage = localStorage.getItem(PTV.localStorageCacheKey);
                let cache = fromStorage != undefined
                    ? JSON.parse(fromStorage)
                    : undefined; //TODO immutable?
                if (cache != undefined) {
                    //Check if the cache has expired
                    if (new Date(cache.date).getTime() <= new Date().getTime()) {
                        localStorage.removeItem(PTV.localStorageCacheKey);
                        return resolve(newCache);
                    }
                    return resolve(cache);
                }
            }
            else {
                // Sorry! No Web Storage support..
            }
            return resolve(newCache);
        });
    },
    localStorageCacheKey: "PTVAPI.stopsOnRouteCache",
    /*getStopsOnRouteCacheKey: function(state:IncompleteState) {
        return state.params.route_type + '_' + state.params.sor_route_id;
    },*/
    getStopsOnRouteCacheKey2: function (routeType, routeId) {
        return routeType + '_' + routeId;
    },
    /*requestDepartures: function(params:StateParams): Promise<RequestResult> {
        return new Promise(function(resolve, reject) {
            debug('requestDepartures');
            const endpoint = PTV.buildDeparturesEndpoint(params);
            resolve(PTV.sendRequest(endpoint, 'Departures', {
                data: undefined,
                params: params,
                departures: undefined,
                pattern: undefined,
                stopsOnRoute: undefined,
                disruptions: undefined
            }, params.credentials));
        });
    },*/
    sendRequest2: function (endpoint, credentials) {
        document.getElementById(_loadingElementId).innerHTML += '.';
        const settings = PTV.getGlobalSettings();
        const qs = endpoint.indexOf("?") == -1 ? "?" : "&";
        const endpointWithCredentials = endpoint.indexOf("devId=") == -1
            ? endpoint + qs + "devid=" + credentials.id
            : endpoint;
        const sig = PTV.generateSignature(endpointWithCredentials, credentials.secret);
        const urlWithSignature = settings.baseUrl + endpointWithCredentials + "&signature=" + sig;
        const url = settings.useCorsBypass == true
            ? settings.proxyUrl + encodeURIComponent(urlWithSignature)
            : urlWithSignature;
        const result = PTV.fetchTyped(url);
        return result;
    },
    fetchTyped: function (request) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield fetch(request);
            const body = yield response.json();
            return body;
        });
    },
    requestDepartures2: function (params) {
        return __awaiter(this, void 0, void 0, function* () {
            const endpoint = PTV.buildDeparturesEndpoint(params);
            return yield PTV.sendRequest2(endpoint, params.credentials);
        });
    },
    requestStopsOnRoute2: function (routeType, routeId, params, stopsOnRouteCache) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise(function (resolve) {
                const key = PTV.getStopsOnRouteCacheKey2(routeType, routeId);
                if (stopsOnRouteCache.data != undefined && stopsOnRouteCache.data.get(key)) {
                    resolve(stopsOnRouteCache.data.get(key));
                }
                else {
                    const endpoint = PTV.buildStopsOnRouteEndpoint2(routeType, routeId);
                    resolve(PTV.sendRequest2(endpoint, params.credentials));
                }
            });
        });
    },
    /*requestStopsOnRoute: function(input:RequestResult): Promise<RequestResult> {
        return new Promise(function(resolve, reject) {
            debug('requestStopsOnRoute');
            input.state.departures = input.state.data;
            input.state.data = null;
        
            if (input.state.departures == null || input.state.departures.departures == null || input.state.departures.departures.length == 0) {
                reject('No departures found.');
            }

            if (input.state.departures!.departures![0].route_id == undefined) {
                reject('No routeId returned for next departure.');
            }

            if (input.state.departures!.departures![0].run_id == undefined) {
                reject('No runId returned for next departure.');
            }
        
            input.state.params.sor_route_id = input.state.departures!.departures![0].route_id!;
            input.state.params.run_id = input.state.departures!.departures![0].run_id!;
            
            const endpoint = PTV.buildStopsOnRouteEndpoint(input.state.params);
                                                    
            const key = PTV.getStopsOnRouteCacheKey(input.state); //state.params.route_type + '_' + state.params.sor_route_id;
            if (_stopsOnRouteCache.data != undefined && _stopsOnRouteCache.data.get(key)) {
                input.state.data = _stopsOnRouteCache.data.get(key);
                resolve(input);
            } else {
                resolve(PTV.sendRequest(endpoint, 'Stops on route', input.state, input.credentials));
            }
        });
    },*/
    /*requestDisruptions: function(input:RequestResult): Promise<RequestResult> {
        return new Promise(function(resolve, reject) {
            debug('requestDisruptions');
            input.state.pattern = input.state.data;
            input.state.data = null;
            
            const endpoint = PTV.buildDisruptionsEndpoint(input.state.params);
            resolve(PTV.sendRequest(endpoint, 'Disruptions', input.state, input.credentials));
        });
    },*/
    requestDisruptions2: function (routeType, credentials) {
        return new Promise(function (resolve) {
            const endpoint = PTV.buildDisruptionsEndpoint2(routeType);
            resolve(PTV.sendRequest2(endpoint, credentials));
        });
    },
    /*requestStoppingPattern: function(input:RequestResult): Promise<RequestResult> {
        return new Promise(function(resolve, reject) {
            debug('requestStoppingPattern');
            input.state.stopsOnRoute = input.state.data;
            const key = PTV.getStopsOnRouteCacheKey(input.state);
            
            //Only modify the cache if the key is not already in there
            //otherwise we'd just be overwriting with the same data
            if (_stopsOnRouteCache.data != undefined
                && !_stopsOnRouteCache.data.get(key)
                && input.state.stopsOnRoute != undefined) {
                _stopsOnRouteCache.data.set(key, input.state.stopsOnRoute);
                
                if (BrowserHelpers.hasLocalStorage()) {
                    localStorage.setItem(PTV.localStorageCacheKey, JSON.stringify(_stopsOnRouteCache));
                }
            }
            
            input.state.data = null;
        
            const endpoint = PTV.buildStoppingPatternEndpoint(input.state.params);
        
            resolve(PTV.sendRequest(endpoint, 'Stopping pattern', input.state, input.credentials));
        });
    },*/
    requestStoppingPattern2: function (routeType, runId, credentials) {
        return new Promise(function (resolve) {
            const endpoint = PTV.buildStoppingPatternEndpoint2(routeType, runId);
            resolve(PTV.sendRequest2(endpoint, credentials));
        });
    },
    clearPage: function () {
        debug('clearPage');
        const elementsToClear = document.getElementsByClassName('clearable');
        for (let i = 0; i < elementsToClear.length; i++) {
            elementsToClear[i].innerHTML = '';
        }
        clearStoppingPattern();
        clearFollowingDepartures();
        clearDisruptionList();
    },
    getColourForRoute: function (route_id) {
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
    buildDisruptionsMap: function (items) {
        const map = new Map();
        for (let i = 0; i < items.length; i++) {
            map.set(items[i].disruption_id, items[i]);
        }
        return map;
    },
    getGeneralDisruptions: function (disruptions) {
        if (disruptions.general == undefined) {
            return '';
        }
        //TODO replace mutation with a map/select?
        let result = '';
        for (let i = 0; i < disruptions.general.length; i++) {
            const data = disruptions.general[i];
            if (!data)
                continue;
            if (!data.display_on_board)
                continue;
            result += data.description;
        }
        return result;
    },
    getDisruptionDataForDeparture: function (departure, disruptions) {
        const result = {
            className: 'disruption goodservice mr-2',
            items: []
        };
        if (departure.disruption_ids == undefined)
            return result;
        for (let i = 0; i < departure.disruption_ids.length; i++) {
            const id = departure.disruption_ids[i];
            const data = disruptions.get(id);
            if (!data)
                continue;
            if (!data.display_on_board)
                continue;
            const disruptionType = data.disruption_type != undefined
                ? data.disruption_type.toLowerCase().replace(' ', '')
                : '';
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
    updatePage: function (input) {
        return new Promise(function (resolve, reject) {
            debug('updatePage');
            //Update the loading indicator and display the current time
            document.getElementById(_loadingElementId).innerHTML = 'Done.';
            const refresh_date = new Date();
            document.getElementById(_refreshTimeElementId).innerHTML = padSingleDigitWithZero(refresh_date.getHours()) +
                ':' + padSingleDigitWithZero(refresh_date.getMinutes()) + ':' + padSingleDigitWithZero(refresh_date.getSeconds());
            const disruptionsResponse = input.state.data.disruptions;
            const metroTrainDisruptions = disruptionsResponse.metro_train != undefined
                ? disruptionsResponse.metro_train
                : [];
            const state = {
                data: input.state.data,
                params: input.state.params,
                departures: input.state.departures,
                runs: input.state.runs,
                pattern: input.state.pattern,
                stopsOnRoute: input.state.stopsOnRoute,
                disruptions: PTV.buildDisruptionsMap(metroTrainDisruptions)
            };
            if (state.departures == null || state.departures.length == 0) {
                reject('No departures found.');
            }
            const next_departure = state.departures[0];
            const route_id = next_departure.route_id;
            document.body.setAttribute('data-colour', PTV.getColourForRoute(route_id));
            //Reset some elements
            document.getElementById(_errorElementId).innerHTML = '';
            //Set stop name
            let stop_name = '';
            if (state.stopsOnRoute != undefined && state.stopsOnRoute.stops != undefined) {
                for (let i = 0; i < state.stopsOnRoute.stops.length; i++) {
                    if (state.stopsOnRoute.stops[i].stop_id == state.params.stop_id) {
                        stop_name = state.stopsOnRoute.stops[i].stop_name.toString();
                        break;
                    }
                }
            }
            else {
                reject('No stops found for route ' + state.params.sor_route_id + '.');
            }
            const short_stop_name = stop_name.replace(' Station', '');
            document.getElementById(_stopElementId).innerHTML = short_stop_name;
            //Set platform number
            document.getElementById(_platformElementId).innerHTML = 'Platform ' + next_departure.platform_number;
            //Set next departure
            if (next_departure.run_id == undefined)
                reject('No runId returned for next departure');
            if (state.runs == undefined || state.runs.length == 0)
                reject('No runs returned for run ' + next_departure.run_id + '.');
            const next_departure_name = state.runs[next_departure.run_id].destination_name;
            document.getElementById('next-dest').innerHTML = next_departure_name != undefined ? next_departure_name : 'Unknown destination';
            //Set disruption information
            clearDisruptionList();
            if (next_departure.disruption_ids != null) {
                const disruption_data = PTV.getDisruptionDataForDeparture(next_departure, state.disruptions);
                const disruptionElement = document.getElementById('next-dest-disruption');
                disruptionElement.setAttribute('class', 'clearable ' + disruption_data.className);
                const disruption_list = document.getElementById(_disruptionListElementId);
                const template = '<small><strong>{type}: </strong>{message}</small>';
                const general_disruptions = PTV.getGeneralDisruptions(disruptionsResponse);
                if (general_disruptions && general_disruptions != '') {
                    const item = document.createElement('li');
                    item.innerHTML = template.replace('{type}', 'General').replace('{message}', general_disruptions);
                    disruption_list.appendChild(item);
                }
                for (const d of disruption_data.items) {
                    if (d.type == undefined || d.message == undefined)
                        continue;
                    const item = document.createElement('li');
                    item.innerHTML = template.replace('{type}', d.type.toString()).replace('{message}', d.message.toString());
                    disruption_list.appendChild(item);
                }
            }
            //Set time and difference information
            if (next_departure.scheduled_departure_utc == undefined)
                reject('No scheduled_departure_utc returned for next departure');
            const time = DateTimeHelpers.formatSingleTime(next_departure.scheduled_departure_utc, true);
            document.getElementById('next-time').innerHTML = time;
            //TODO immutable for diff
            let diff = DateTimeHelpers.getDifferenceFromNow(next_departure.estimated_departure_utc, next_departure.scheduled_departure_utc).toString();
            const diffSec = DateTimeHelpers.getDifferenceFromNowSec(next_departure.estimated_departure_utc, next_departure.scheduled_departure_utc);
            const isRt = isRealTime(next_departure.estimated_departure_utc);
            document.getElementById("realtime").style.display = (isRt ? "none" : "block");
            let mins_text = "min" + (isRt ? "" : "*"); //TODO immutable
            if (diffSec <= 60 && diffSec >= -60) {
                diff = "Now" + (isRt ? "" : "*");
                mins_text = "";
            }
            document.getElementById('next-diff').innerHTML = diff + ' ' + mins_text;
            //Set title
            document.title = diff + ' ' + mins_text + ' ' + short_stop_name + ' to ' + next_departure_name;
            //Set stopping pattern
            clearStoppingPattern();
            if (state.stopsOnRoute == undefined || state.stopsOnRoute.stops == undefined) {
                reject('No stops found for route ' + state.params.sor_route_id + '.');
            }
            const stops = new Map();
            for (let s = 0; s < state.stopsOnRoute.stops.length; s++) {
                stops.set(state.stopsOnRoute.stops[s].stop_id, state.stopsOnRoute.stops[s].stop_name);
            }
            const stopsFromCurrent = [];
            let found_current_stop = false;
            let stopping_pattern_count = 0;
            for (let j = 0; j < state.pattern.departures.length; j++) {
                const stop_id = state.pattern.departures[j].stop_id;
                const is_current_stop = stop_id == state.params.stop_id;
                if (is_current_stop) {
                    stopping_pattern_count = state.pattern.departures.length - j;
                    found_current_stop = true;
                }
                if (found_current_stop) {
                    const name = stops.get(stop_id).replace(' Station', '');
                    stopsFromCurrent.push({ id: stop_id, name: name });
                }
            }
            if (state.departures == null || state.departures == null || state.departures.length == 0) {
                reject('No departures found.');
            }
            if (state.departures[0].route_id == undefined) {
                reject('No routeId returned for departure.');
            }
            const inbound = state.departures[0].direction_id == 1;
            const fullList = getStoppingPatternWithSkippedStations(stopsFromCurrent, state.departures[0].route_id, inbound, state.params.stop_id);
            const desc = getShortStoppingPatternDescription(fullList, inbound, state.params.stop_id);
            document.getElementById("next-dest-description").innerText = desc; //TODO const for id
            fullList.map(x => {
                addStoppingPatternItem(x.name, x.isSkipped, x.id == state.params.stop_id);
            });
            const list_element = document.getElementById('next-stops-list');
            if (stopping_pattern_count > 7) {
                if (list_element.className.indexOf('two-columns') == -1) {
                    list_element.className += ' two-columns';
                }
            }
            else {
                list_element.className = list_element.className.replace('two-columns', '');
            }
            //Set following departures
            clearFollowingDepartures();
            for (let i = 1; i < state.departures.length; i++) {
                const departure = state.departures[i];
                const runId = departure.run_id;
                if (runId == undefined)
                    reject('No runId returned for departure.');
                if (state.runs == undefined)
                    reject('No runs returned for departure.');
                const destinationName = state.runs[runId].destination_name != undefined
                    ? state.runs[runId].destination_name
                    : 'Unknown destination'; //TODO this is duplicated somewhere
                addFollowingDeparture(state, departure, destinationName);
            }
            debug('End updatePage ---');
            resolve();
        });
    },
    /* Util functions */
    getGlobalSettings: function () {
        return {
            baseUrl: 'http://timetableapi.ptv.vic.gov.au',
            useCorsBypass: true,
            proxyUrl: 'https://ptvproxy20170416075948.azurewebsites.net/api/proxy?url='
            //'https://cors-anywhere.herokuapp.com/'
        };
    },
    /* Request functions */
    //Departures
    buildDeparturesEndpoint: function (params) {
        const date_utc = DateTimeHelpers.getIsoDate();
        const template = '/v3/departures/route_type/{route_type}/stop/{stop_id}' +
            '?max_results=6&date_utc={date_utc}&platform_numbers={platform_number}&expand=stop&expand=run';
        const endpoint = template
            .replace('{route_type}', params.route_type.toString())
            .replace('{stop_id}', params.stop_id.toString())
            .replace('{platform_number}', params.platform_number.toString())
            .replace('{date_utc}', date_utc);
        return endpoint;
    },
    //Stops on route
    /*buildStopsOnRouteEndpoint: function(params: StateParams) {
        const date_utc = DateTimeHelpers.getIsoDate();
        const template = '/v3/stops/route/{route_id}/route_type/{route_type}' +
                '?date_utc={date_utc}';
        const endpoint = template
                            .replace('{route_type}', params.route_type.toString())
                            .replace('{route_id}', params.sor_route_id.toString())
                            .replace('{date_utc}', date_utc);
        return endpoint;
    },*/
    buildStopsOnRouteEndpoint2: function (routeType, routeId) {
        const dateUtc = DateTimeHelpers.getIsoDate();
        const template = '/v3/stops/route/{route_id}/route_type/{route_type}' +
            '?date_utc={date_utc}';
        return template
            .replace('{route_type}', routeType.toString())
            .replace('{route_id}', routeId.toString())
            .replace('{date_utc}', dateUtc);
    },
    //Stopping pattern
    /*buildStoppingPatternEndpoint: function(params: StateParams) {
        const date_utc = DateTimeHelpers.getIsoDate();
        const template = '/v3/pattern/run/{run_id}/route_type/{route_type}' +
                '?date_utc={date_utc}';
        const endpoint = template
                            .replace('{route_type}', params.route_type.toString())
                            .replace('{run_id}', params.run_id.toString())
                            .replace('{date_utc}', date_utc);
        return endpoint;
    },*/
    buildStoppingPatternEndpoint2: function (routeType, runId) {
        const date_utc = DateTimeHelpers.getIsoDate();
        const template = '/v3/pattern/run/{run_id}/route_type/{route_type}' +
            '?date_utc={date_utc}';
        const endpoint = template
            .replace('{route_type}', routeType.toString())
            .replace('{run_id}', runId.toString())
            .replace('{date_utc}', date_utc);
        return endpoint;
    },
    //Disruptions
    /*buildDisruptionsEndpoint: function(params: StateParams) {
        const template = '/v3/disruptions?route_types={route_type}&disruption_status={disruption_status}';
        const endpoint = template
            .replace('{route_type}', params.route_type.toString())
            .replace('{disruption_status}', 'current');
        return endpoint;
    },*/
    buildDisruptionsEndpoint2: function (routeType) {
        const template = '/v3/disruptions?route_types={route_type}&disruption_status={disruption_status}';
        const endpoint = template
            .replace('{route_type}', routeType.toString())
            .replace('{disruption_status}', 'current');
        return endpoint;
    }
};
let _devId = '';
let _secret = '';
function init() {
    _devId = getQueryVariable('d');
    _secret = getQueryVariable('s');
    const platform_number = getQueryVariable('p');
    const e = document.getElementById(_platformSelectElementId);
    e.value = platform_number;
    if (_devId == null || _devId == '' || _secret == null || _secret == '') {
        return;
    }
    updateView();
}
function getQueryVariable(variable) {
    const query = window.location.search.substring(1);
    const vars = query.split("&");
    for (var i = 0; i < vars.length; i++) {
        const pair = vars[i].split("=");
        if (pair[0] == variable) {
            return pair[1];
        }
    }
    return ('');
}
function updateQueryVariable(key, value) {
    const query = window.location.search.substring(1);
    const vars = query.split("&");
    let result = "";
    for (var i = 0; i < vars.length; i++) {
        const pair = vars[i].split("=");
        if (pair[0] == key) {
            result = result + "&" + pair[0] + "=" + value;
        }
        else {
            result = result + "&" + pair[0] + "=" + pair[1];
        }
    }
    return "?" + result.substring(1);
}
function updateView() {
    const loading = document.getElementById(_loadingElementId);
    loading.innerHTML = 'Loading';
    document.getElementById(_refreshTimeElementId).innerHTML = '';
    const stop_id = getQueryVariable('stop_id');
    const route_type = getQueryVariable('route_type');
    const route_id = getQueryVariable('route_id');
    const e = document.getElementById(_platformSelectElementId);
    const platform_number = e.options[e.selectedIndex].value;
    const new_url = window.location.pathname + updateQueryVariable('p', platform_number);
    window.history.replaceState({}, 'Platform View', new_url);
    //Set an auto-refresh timer
    updateTimer();
    const params = {
        route_type: Number(route_type),
        route_id: Number(route_id),
        stop_id: Number(stop_id),
        platform_number: platform_number,
        dev_id: Number(_devId),
        dev_secret: _secret
    };
    PTV.doStuff(params);
}
let timer;
function updateTimer() {
    clearTimeout(timer);
    const autoRefreshCheckBox = document.getElementById('auto-refresh');
    if (autoRefreshCheckBox.checked) {
        timer = setTimeout(function () { updateView(); }, 30000);
    }
}
function getShortStoppingPatternDescription(stoppingPatternWithSkippedStations, isInbound, currentStopId) {
    //PREFIX
    //If only skipped one stop - 'All stations except X'
    //If skipped more than one non-loop stop - 'Limited express'
    //SUFFIX
    //If stopping at Flagstaff, Melb Central or Parliament - 'via the city loop'
    //If skipped all loop stops - 'via (stop after loop)'
    let result = '';
    const skipped = [];
    const notSkipped = [];
    stoppingPatternWithSkippedStations.map(x => {
        if (x.isSkipped == true) {
            skipped.push(x);
        }
        else {
            notSkipped.push(x);
        }
    });
    const notSkippedIds = notSkipped.map(x => x.id);
    const skipCount = skipped.length;
    const isStoppingAtAnyLoopStation = isStoppingAtAnyCityLoopStation(notSkippedIds);
    const isNotRunningViaLoop = isNotRunningViaCityLoop(notSkippedIds);
    const nextNonLoopStationName = notSkipped.length >= 2 ? notSkipped[1].name : '';
    //console.log('Stopping any loop: ' + isStoppingAtAnyLoopStation);
    //console.log('Not running via loop: ' + isNotRunningViaLoop);
    //console.log('Inbound: ' + inbound);
    //console.log('Flinders: ' + isFlindersSt(currentStopId));
    //console.log('Current stop id: ' + currentStopId);
    //console.log('Next non-loop: ' + nextNonLoopStationName);
    //Type (all stations or express)
    if (skipCount == 0) {
        result = 'Stopping all stations';
    }
    else if (skipCount == 1) {
        result = 'All except ' + skipped[0].name;
    }
    else {
        result = 'Limited express';
    }
    //Direct or via loop
    if (isStoppingAtAnyLoopStation) {
        result += ' via the City Loop';
    }
    else if (isNotRunningViaLoop
        && !isInbound
        && isFlindersSt(currentStopId)
        && nextNonLoopStationName != '') {
        result += ' via ' + nextNonLoopStationName;
    }
    return result;
}
//TODO Assign these render functions to PTV object
function addFollowingDeparture(state, departure, destinationName) {
    const time = departure.scheduled_departure_utc != undefined
        ? DateTimeHelpers.formatSingleTime(departure.scheduled_departure_utc, true)
        : '--:--';
    const diff = departure.scheduled_departure_utc != undefined
        ? DateTimeHelpers.getDifferenceFromNow(departure.estimated_departure_utc, departure.scheduled_departure_utc)
        : '--';
    const disruption_data = PTV.getDisruptionDataForDeparture(departure, state.disruptions);
    const route_id = departure.route_id;
    if (diff >= 60) {
        return;
    }
    const wrapper = document.createElement('div');
    wrapper.setAttribute('class', 'row ');
    //Time
    const timeWrapper = createElementWithContent('div', 'col-6 col-md-3 col-lg-2 order-2 order-md-1 ml-4 ml-md-0', 'h4', 'font-weight-light', time);
    wrapper.appendChild(timeWrapper);
    //Disruption
    const disruptionSpan = document.createElement('span');
    disruptionSpan.setAttribute('class', disruption_data.className + ' clearable');
    //Destination
    const destWrapper = document.createElement('div');
    destWrapper.setAttribute('class', 'col-12 col-md-6 col-lg-8 order-1 order-md-2');
    const destContent = document.createElement('h4');
    destContent.setAttribute('class', 'd-inline');
    destContent.innerText = destinationName;
    destWrapper.appendChild(disruptionSpan);
    destWrapper.appendChild(destContent);
    wrapper.appendChild(destWrapper);
    //Diff
    const diffWrapper = createElementWithContent('div', 'col-5 col-md-3 col-lg-2 order-3 order-md-3 text-right', 'h4', 'font-weight-light text-white bg-dark d-inline px-2', diff + ' min');
    wrapper.appendChild(diffWrapper);
    //Disruption details
    const disruption_list = document.createElement('ul');
    const template = '<small><strong>{type}: </strong>{message}</small>';
    for (var d of disruption_data.items) {
        if (d.type == undefined || d.message == undefined)
            continue;
        const item = document.createElement('li');
        item.innerHTML = template.replace('{type}', d.type.toString()).replace('{message}', d.message.toString());
        disruption_list.appendChild(item);
    }
    if (disruption_data.items.length > 0) {
        const disruptionDetailWrapper = document.createElement('div');
        disruptionDetailWrapper.setAttribute('class', 'disruption-message col-12 col-md-9 offset-md-3 col-lg-8 offset-lg-2 order-4');
        disruptionDetailWrapper.appendChild(disruption_list);
        wrapper.appendChild(disruptionDetailWrapper);
    }
    document.getElementById(_followingDeparturesElementId).appendChild(wrapper);
}
function getStoppingPatternWithSkippedStations(stopList, lineId, isInbound, currentStopId) {
    const allStops = isInbound
        ? getLine(lineId).data
        : reverseArray(getLine(lineId).data); //Don't use .reverse() here as it mutates my static source line data!
    const stopListIds = stopList.map(x => x.id);
    const stopListNames = new Map();
    stopList.map(x => stopListNames.set(x.id, x.name));
    let foundCurrentStop = false;
    const allStopsReduced = [];
    for (let i = 0; i < allStops.length; i++) {
        if (!foundCurrentStop && allStops[i].stop_id * 1 == currentStopId)
            foundCurrentStop = true;
        if (foundCurrentStop)
            allStopsReduced.push(allStops[i]);
        //Check if we've found the last stop in the stopping pattern for this run
        if (allStops[i].stop_id * 1 == stopList[stopList.length - 1].id)
            break;
    }
    let res;
    res = allStopsReduced.map(x => stopListIds.indexOf(x.stop_id * 1) != -1
        ? { id: x.stop_id * 1, name: stopListNames.get(x.stop_id * 1), isSkipped: false }
        : { id: x.stop_id * 1, name: x.name, isSkipped: true });
    //If the train is not going through the city loop, don't show any city loop stops (not even as skipped)
    if (isNotRunningViaCityLoop(stopListIds)) {
        const results = [];
        res.map(x => {
            if (!isCityLoopStation(x.id) && !(isSouthernCross(x.id) && x.isSkipped))
                results.push(x);
        });
        return results;
    }
    else {
        return res;
    }
}
function createElementWithContent(tag, classVal, childTag, childClassVal, childTextContent) {
    const wrapper = document.createElement(tag);
    wrapper.setAttribute('class', classVal);
    const child = document.createElement(childTag);
    child.setAttribute('class', childClassVal);
    child.textContent = childTextContent;
    wrapper.appendChild(child);
    return wrapper;
}
function addStoppingPatternItem(name, isSkipped, isCurrentStop) {
    const content = document.createElement('span');
    content.setAttribute('class', 'px-1' + (isCurrentStop ? ' active-colour' : '') + (isSkipped ? ' skipped-colour' : ''));
    content.innerText = name;
    const wrapper = document.createElement('li');
    wrapper.appendChild(content);
    document.getElementById(_nextStopsListElementId).appendChild(wrapper);
}
/* STATION HELPERS */
const _PARLIAMENT_ID = 1155;
const _MELBOURNE_CENTRAL_ID = 1120;
const _FLAGSTAFF_ID = 1068;
const _FLINDERS_ST_ID = 1071;
const _SOUTHERN_CROSS_ID = 1181;
function isCityLoopStation(stopId) {
    return stopId == _PARLIAMENT_ID || //Parliament
        stopId == _MELBOURNE_CENTRAL_ID || //Melbourne Central
        stopId == _FLAGSTAFF_ID; //Flagstaff
}
function isStoppingAtAnyCityLoopStation(stopIds) {
    let result = false;
    for (var i = 0; i < stopIds.length; i++) {
        if (isCityLoopStation(stopIds[i])) {
            result = true;
            break;
        }
    }
    return result;
}
function isNotRunningViaCityLoop(stopIds) {
    return stopIds.indexOf(_PARLIAMENT_ID) == -1 &&
        stopIds.indexOf(_MELBOURNE_CENTRAL_ID) == -1 &&
        stopIds.indexOf(_FLAGSTAFF_ID) == -1;
}
function isFlindersSt(stopId) {
    return stopId == _FLINDERS_ST_ID;
}
function isSouthernCross(stopId) {
    return stopId == _SOUTHERN_CROSS_ID;
}
//TODO move inside PTV object (or another object)
const debug_mode = false;
//const previous_milliseconds = new Date().getTime();
function debug(message) {
    if (!debug_mode)
        return;
    //const date = new Date().getTime();
    //const elapsed = date - previous_milliseconds;
    //previous_milliseconds = date;
    //console.log('DEBUG: (' + elapsed + 'ms) ' + message);
    console.log('DEBUG: ' + message);
}
function clearFollowingDepartures() {
    document.getElementById(_followingDeparturesElementId).innerHTML = '';
}
function clearStoppingPattern() {
    document.getElementById(_nextStopsListElementId).innerHTML = '';
}
function clearDisruptionList() {
    //TODO add const for this id
    document.getElementById(_disruptionListElementId).innerHTML = '';
    document.getElementById('next-dest-disruption').setAttribute('class', 'clearable');
}
function padSingleDigitWithZero(input) {
    return input < 10 ? '0' + input : input.toString();
}
function isRealTime(estimated) {
    return estimated != null && estimated != undefined;
}
class BrowserHelpers {
    static hasLocalStorage() {
        return typeof (Storage) !== "undefined";
    }
}
/* ARRAY FUNCTIONS */
function reverseArray(input) {
    if (!input || input == undefined || input.length <= 0)
        return input;
    let result = [];
    for (let i = input.length - 1; i >= 0; i--) {
        result.push(input[i]);
    }
    return result;
}
/* DATETIME HELPERS */
class DateTimeHelpers {
    static getIsoDate() {
        return new Date().toISOString();
    }
    /*static formatTime(estimated, scheduled) {
        var date = estimated == null
            ? new Date(scheduled)
            : new Date(estimated);
        
        var hrs = padSingleDigitWithZero(date.getHours());
        var mins = padSingleDigitWithZero(date.getMinutes());
        var result = hrs + ":" + mins;
        return result;
    }*/
    static formatSingleTime(date, includeDesignator) {
        const hours = new Date(date).getHours();
        const isPm = hours > 12;
        const hrs = isPm ? hours - 12 : hours;
        const designator = isPm ? "pm" : "am";
        const mins = padSingleDigitWithZero(new Date(date).getMinutes());
        return includeDesignator
            ? hrs + ":" + mins + designator
            : hrs + ":" + mins;
    }
    static getDifferenceFromNow(estimated, scheduled) {
        const date = estimated == null
            ? scheduled
            : estimated;
        const now = new Date();
        return Math.floor(DateTimeHelpers.getDifferenceFromNowSec(estimated, scheduled) / 60);
    }
    static getDifferenceFromNowSec(estimated, scheduled) {
        const date = estimated == null
            ? scheduled
            : estimated;
        const now = new Date();
        const result = ((new Date(date).getTime() - now.getTime()) / 1000);
        //console.log(result);
        return result;
    }
}
//Copyright (c) Scott Butler 2014
const gw = [
    { "key": "0", "name": "Glen Waverley", "stop_id": "1078" },
    { "key": "1", "name": "Syndal", "stop_id": "1190" },
    { "key": "2", "name": "Mount Waverley", "stop_id": "1137" },
    { "key": "3", "name": "Jordanville", "stop_id": "1105" },
    { "key": "4", "name": "Holmesglen", "stop_id": "1096" },
    { "key": "5", "name": "East Malvern", "stop_id": "1058" },
    { "key": "6", "name": "Darling", "stop_id": "1051" },
    { "key": "7", "name": "Glen Iris", "stop_id": "1077" },
    { "key": "8", "name": "Gardiner", "stop_id": "1075" },
    { "key": "9", "name": "Tooronga", "stop_id": "1195" },
    { "key": "10", "name": "Kooyong", "stop_id": "1110" },
    { "key": "11", "name": "Heyington", "stop_id": "1094" },
    { "key": "12", "name": "Burnley", "stop_id": "1030" },
    { "key": "13", "name": "East Richmond", "stop_id": "1059" },
    { "key": "14", "name": "Richmond", "stop_id": "1162" },
    { "key": "15", "name": "Parliament", "stop_id": "1155" },
    { "key": "16", "name": "Melbourne Central", "stop_id": "1120" },
    { "key": "17", "name": "Flagstaff", "stop_id": "1068" },
    { "key": "18", "name": "Southern Cross", "stop_id": "1181" },
    { "key": "19", "name": "Flinders Street", "stop_id": "1071" }
];
const ld = [
    { "key": "0", "name": "Lilydale", "stop_id": "1115" },
    { "key": "1", "name": "Mooroolbark", "stop_id": "1133" },
    { "key": "2", "name": "Croydon", "stop_id": "1048" },
    { "key": "3", "name": "Ringwood East", "stop_id": "1164" },
    { "key": "4", "name": "Ringwood", "stop_id": "1163" },
    { "key": "5", "name": "Heatherdale", "stop_id": "1091" },
    { "key": "6", "name": "Mitcham", "stop_id": "1128" },
    { "key": "7", "name": "Nunawading", "stop_id": "1148" },
    { "key": "8", "name": "Blackburn", "stop_id": "1023" },
    { "key": "9", "name": "Laburnum", "stop_id": "1111" },
    { "key": "10", "name": "Box Hill", "stop_id": "1026" },
    { "key": "11", "name": "Mont Albert", "stop_id": "1129" },
    { "key": "12", "name": "Surrey Hills", "stop_id": "1189" },
    { "key": "13", "name": "Chatham", "stop_id": "1037" },
    { "key": "14", "name": "Canterbury", "stop_id": "1033" },
    { "key": "15", "name": "East Camberwell", "stop_id": "1057" },
    { "key": "16", "name": "Camberwell", "stop_id": "1032" },
    { "key": "17", "name": "Auburn", "stop_id": "1012" },
    { "key": "18", "name": "Glenferrie", "stop_id": "1080" },
    { "key": "19", "name": "Hawthorn", "stop_id": "1090" },
    { "key": "20", "name": "Burnley", "stop_id": "1030" },
    { "key": "21", "name": "East Richmond", "stop_id": "1059" },
    { "key": "22", "name": "Richmond", "stop_id": "1162" },
    { "key": "23", "name": "Parliament", "stop_id": "1155" },
    { "key": "24", "name": "Melbourne Central", "stop_id": "1120" },
    { "key": "25", "name": "Flagstaff", "stop_id": "1068" },
    { "key": "26", "name": "Southern Cross", "stop_id": "1181" },
    { "key": "27", "name": "Flinders Street", "stop_id": "1071" }
];
const bg = [
    { "key": "0", "name": "Belgrave", "stop_id": "1018" },
    { "key": "1", "name": "Tecoma", "stop_id": "1191" },
    { "key": "2", "name": "Upwey", "stop_id": "1200" },
    { "key": "4", "name": "Upper Ferntree Gully", "stop_id": "1199" },
    { "key": "6", "name": "Ferntree Gully", "stop_id": "1067" },
    { "key": "7", "name": "Boronia", "stop_id": "1025" },
    { "key": "8", "name": "Bayswater", "stop_id": "1016" },
    { "key": "9", "name": "Heathmont", "stop_id": "1092" },
    { "key": "10", "name": "Ringwood", "stop_id": "1163" },
    { "key": "11", "name": "Heatherdale", "stop_id": "1091" },
    { "key": "12", "name": "Mitcham", "stop_id": "1128" },
    { "key": "13", "name": "Nunawading", "stop_id": "1148" },
    { "key": "14", "name": "Blackburn", "stop_id": "1023" },
    { "key": "15", "name": "Laburnum", "stop_id": "1111" },
    { "key": "16", "name": "Box Hill", "stop_id": "1026" },
    { "key": "17", "name": "Mont Albert", "stop_id": "1129" },
    { "key": "18", "name": "Surrey Hills", "stop_id": "1189" },
    { "key": "19", "name": "Chatham", "stop_id": "1037" },
    { "key": "20", "name": "Canterbury", "stop_id": "1033" },
    { "key": "21", "name": "East Camberwell", "stop_id": "1057" },
    { "key": "22", "name": "Camberwell", "stop_id": "1032" },
    { "key": "23", "name": "Auburn", "stop_id": "1012" },
    { "key": "24", "name": "Glenferrie", "stop_id": "1080" },
    { "key": "25", "name": "Hawthorn", "stop_id": "1090" },
    { "key": "26", "name": "Burnley", "stop_id": "1030" },
    { "key": "27", "name": "East Richmond", "stop_id": "1059" },
    { "key": "28", "name": "Richmond", "stop_id": "1162" },
    { "key": "29", "name": "Parliament", "stop_id": "1155" },
    { "key": "30", "name": "Melbourne Central", "stop_id": "1120" },
    { "key": "31", "name": "Flagstaff", "stop_id": "1068" },
    { "key": "32", "name": "Southern Cross", "stop_id": "1181" },
    { "key": "33", "name": "Flinders Street", "stop_id": "1071" }
];
const al = [
    { "key": "0", "name": "Alamein", "stop_id": "1002" },
    { "key": "1", "name": "Ashburton", "stop_id": "1010" },
    { "key": "2", "name": "Burwood", "stop_id": "1031" },
    { "key": "3", "name": "Hartwell", "stop_id": "1087" },
    { "key": "4", "name": "Willison", "stop_id": "1213" },
    { "key": "5", "name": "Riversdale", "stop_id": "1166" },
    { "key": "6", "name": "Camberwell", "stop_id": "1032" },
    { "key": "7", "name": "Auburn", "stop_id": "1012" },
    { "key": "8", "name": "Glenferrie", "stop_id": "1080" },
    { "key": "9", "name": "Hawthorn", "stop_id": "1090" },
    { "key": "10", "name": "Burnley", "stop_id": "1030" },
    { "key": "11", "name": "East Richmond", "stop_id": "1059" },
    { "key": "12", "name": "Richmond", "stop_id": "1162" },
    { "key": "13", "name": "Parliament", "stop_id": "1155" },
    { "key": "14", "name": "Melbourne Central", "stop_id": "1120" },
    { "key": "15", "name": "Flagstaff", "stop_id": "1068" },
    { "key": "16", "name": "Southern Cross", "stop_id": "1181" },
    { "key": "17", "name": "Flinders Street", "stop_id": "1071" }
];
const cr = [
    { "key": "0", "name": "Craigieburn", "stop_id": "1044" },
    { "key": "1", "name": "Roxburgh Park", "stop_id": "1219" },
    { "key": "2", "name": "Coolaroo", "stop_id": "1221" },
    { "key": "3", "name": "Broadmeadows", "stop_id": "1028" },
    { "key": "4", "name": "Jacana", "stop_id": "1102" },
    { "key": "5", "name": "Glenroy", "stop_id": "1082" },
    { "key": "6", "name": "Oak Park", "stop_id": "1149" },
    { "key": "7", "name": "Pascoe Vale", "stop_id": "1156" },
    { "key": "8", "name": "Strathmore", "stop_id": "1186" },
    { "key": "9", "name": "Glenbervie", "stop_id": "1079" },
    { "key": "10", "name": "Essendon", "stop_id": "1064" },
    { "key": "11", "name": "Moonee Ponds", "stop_id": "1131" },
    { "key": "12", "name": "Ascot Vale", "stop_id": "1009" },
    { "key": "13", "name": "Newmarket", "stop_id": "1140" },
    { "key": "14", "name": "Kensington", "stop_id": "1108" },
    { "key": "15", "name": "North Melbourne", "stop_id": "1144" },
    { "key": "16", "name": "Flagstaff", "stop_id": "1068" },
    { "key": "17", "name": "Melbourne Central", "stop_id": "1120" },
    { "key": "18", "name": "Parliament", "stop_id": "1155" },
    { "key": "19", "name": "Southern Cross", "stop_id": "1181" },
    { "key": "20", "name": "Flinders Street", "stop_id": "1071" }
];
const cb = [
    { "key": "0", "name": "Cranbourne", "stop_id": "1045" },
    { "key": "1", "name": "Merinda Park", "stop_id": "1123" },
    { "key": "2", "name": "Lynbrook", "stop_id": "1222" },
    { "key": "3", "name": "Dandenong", "stop_id": "1049" },
    { "key": "5", "name": "Yarraman", "stop_id": "1215" },
    { "key": "6", "name": "Noble Park", "stop_id": "1142" },
    { "key": "7", "name": "Sandown Park", "stop_id": "1172" },
    { "key": "8", "name": "Springvale", "stop_id": "1183" },
    { "key": "9", "name": "Westall", "stop_id": "1208" },
    { "key": "10", "name": "Clayton", "stop_id": "1040" },
    { "key": "11", "name": "Huntingdale", "stop_id": "1099" },
    { "key": "12", "name": "Oakleigh", "stop_id": "1150" },
    { "key": "13", "name": "Hughesdale", "stop_id": "1098" },
    { "key": "14", "name": "Murrumbeena", "stop_id": "1138" },
    { "key": "15", "name": "Carnegie", "stop_id": "1034" },
    { "key": "16", "name": "Caulfield", "stop_id": "1036" },
    { "key": "17", "name": "Malvern", "stop_id": "1118" },
    { "key": "18", "name": "Armadale", "stop_id": "1008" },
    { "key": "19", "name": "Toorak", "stop_id": "1194" },
    { "key": "20", "name": "Hawksburn", "stop_id": "1089" },
    { "key": "21", "name": "South Yarra", "stop_id": "1180" },
    { "key": "22", "name": "Richmond", "stop_id": "1162" },
    { "key": "23", "name": "Parliament", "stop_id": "1155" },
    { "key": "24", "name": "Melbourne Central", "stop_id": "1120" },
    { "key": "25", "name": "Flagstaff", "stop_id": "1068" },
    { "key": "26", "name": "Southern Cross", "stop_id": "1181" },
    { "key": "27", "name": "Flinders Street", "stop_id": "1071" }
];
const fl = [
    { "key": "0", "name": "Flemington Racecourse", "stop_id": "1070" },
    { "key": "1", "name": "North Melbourne", "stop_id": "1144" },
    { "key": "2", "name": "Southern Cross", "stop_id": "1181" },
    { "key": "3", "name": "Flinders Street", "stop_id": "1071" }
];
const fr = [
    { "key": "0", "name": "Frankston", "stop_id": "1073" },
    { "key": "1", "name": "Kananook", "stop_id": "1106" },
    { "key": "2", "name": "Seaford", "stop_id": "1174" },
    { "key": "3", "name": "Carrum", "stop_id": "1035" },
    { "key": "4", "name": "Bonbeach", "stop_id": "1024" },
    { "key": "5", "name": "Chelsea", "stop_id": "1038" },
    { "key": "6", "name": "Edithvale", "stop_id": "1060" },
    { "key": "7", "name": "Aspendale", "stop_id": "1011" },
    { "key": "8", "name": "Mordialloc", "stop_id": "1134" },
    { "key": "9", "name": "Parkdale", "stop_id": "1154" },
    { "key": "10", "name": "Mentone", "stop_id": "1122" },
    { "key": "11", "name": "Cheltenham", "stop_id": "1039" },
    { "key": "12", "name": "Highett", "stop_id": "1095" },
    { "key": "13", "name": "Moorabbin", "stop_id": "1132" },
    { "key": "14", "name": "Patterson", "stop_id": "1157" },
    { "key": "15", "name": "Bentleigh", "stop_id": "1020" },
    { "key": "16", "name": "McKinnon", "stop_id": "1119" },
    { "key": "17", "name": "Ormond", "stop_id": "1152" },
    { "key": "18", "name": "Glenhuntly", "stop_id": "1081" },
    { "key": "19", "name": "Caulfield", "stop_id": "1036" },
    { "key": "20", "name": "Malvern", "stop_id": "1118" },
    { "key": "21", "name": "Armadale", "stop_id": "1008" },
    { "key": "22", "name": "Toorak", "stop_id": "1194" },
    { "key": "23", "name": "Hawksburn", "stop_id": "1089" },
    { "key": "24", "name": "South Yarra", "stop_id": "1180" },
    { "key": "25", "name": "Richmond", "stop_id": "1162" },
    { "key": "26", "name": "Parliament", "stop_id": "1155" },
    { "key": "27", "name": "Melbourne Central", "stop_id": "1120" },
    { "key": "28", "name": "Flagstaff", "stop_id": "1068" },
    { "key": "29", "name": "Southern Cross", "stop_id": "1181" },
    { "key": "30", "name": "Flinders Street", "stop_id": "1071" }
];
const hb2 = [
    { "key": "0", "name": "Hurstbridge", "stop_id": "1100" },
    { "key": "1", "name": "Wattle Glen", "stop_id": "1204" },
    { "key": "2", "name": "Diamond Creek", "stop_id": "1054" },
    { "key": "3", "name": "Eltham", "stop_id": "1062" },
    { "key": "4", "name": "Montmorency", "stop_id": "1130" },
    { "key": "5", "name": "Greensborough", "stop_id": "1084" },
    { "key": "6", "name": "Watsonia", "stop_id": "1203" },
    { "key": "7", "name": "Macleod", "stop_id": "1117" },
    { "key": "8", "name": "Rosanna", "stop_id": "1168" },
    { "key": "9", "name": "Heidelberg", "stop_id": "1093" },
    { "key": "10", "name": "Eaglemont", "stop_id": "1056" },
    { "key": "11", "name": "Ivanhoe", "stop_id": "1101" },
    { "key": "12", "name": "Darebin", "stop_id": "1050" },
    { "key": "13", "name": "Alphington", "stop_id": "1004" },
    { "key": "14", "name": "Fairfield", "stop_id": "1065" },
    { "key": "15", "name": "Dennis", "stop_id": "1053" },
    { "key": "16", "name": "Westgarth", "stop_id": "1209" },
    { "key": "17", "name": "Clifton Hill", "stop_id": "1041" },
    { "key": "18", "name": "Victoria Park", "stop_id": "1201" },
    { "key": "19", "name": "Collingwood", "stop_id": "1043" },
    { "key": "20", "name": "North Richmond", "stop_id": "1145" },
    { "key": "21", "name": "West Richmond", "stop_id": "1207" },
    { "key": "22", "name": "Jolimont-MCG", "stop_id": "1104" },
    { "key": "23", "name": "Parliament", "stop_id": "1155" },
    { "key": "24", "name": "Melbourne Central", "stop_id": "1120" },
    { "key": "25", "name": "Flagstaff", "stop_id": "1068" },
    { "key": "26", "name": "Southern Cross", "stop_id": "1181" },
    { "key": "27", "name": "Flinders Street", "stop_id": "1071" }
];
const hb = [
    { "key": "0", "name": "Hurstbridge", "stop_id": "1100" },
    { "key": "1", "name": "Wattle Glen", "stop_id": "1204" },
    { "key": "3", "name": "Diamond Creek", "stop_id": "1054" },
    { "key": "4", "name": "Eltham", "stop_id": "1062" },
    { "key": "6", "name": "Montmorency", "stop_id": "1130" },
    { "key": "7", "name": "Greensborough", "stop_id": "1084" },
    { "key": "8", "name": "Watsonia", "stop_id": "1203" },
    { "key": "9", "name": "Macleod", "stop_id": "1117" },
    { "key": "10", "name": "Rosanna", "stop_id": "1168" },
    { "key": "11", "name": "Heidelberg", "stop_id": "1093" },
    { "key": "12", "name": "Eaglemont", "stop_id": "1056" },
    { "key": "13", "name": "Ivanhoe", "stop_id": "1101" },
    { "key": "14", "name": "Darebin", "stop_id": "1050" },
    { "key": "15", "name": "Alphington", "stop_id": "1004" },
    { "key": "16", "name": "Fairfield", "stop_id": "1065" },
    { "key": "17", "name": "Dennis", "stop_id": "1053" },
    { "key": "18", "name": "Westgarth", "stop_id": "1209" },
    { "key": "19", "name": "Clifton Hill", "stop_id": "1041" },
    { "key": "20", "name": "Victoria Park", "stop_id": "1201" },
    { "key": "21", "name": "Collingwood", "stop_id": "1043" },
    { "key": "22", "name": "North Richmond", "stop_id": "1145" },
    { "key": "23", "name": "West Richmond", "stop_id": "1207" },
    { "key": "24", "name": "Jolimont-MCG", "stop_id": "1104" },
    { "key": "25", "name": "Flinders Street", "stop_id": "1071" }
];
const pa = [
    { "key": "0", "name": "Pakenham", "stop_id": "1153" },
    { "key": "1", "name": "Cardinia Road", "stop_id": "1223" },
    { "key": "2", "name": "Officer", "stop_id": "1151" },
    { "key": "3", "name": "Beaconsfield", "stop_id": "1017" },
    { "key": "4", "name": "Berwick", "stop_id": "1021" },
    { "key": "5", "name": "Narre Warren", "stop_id": "1139" },
    { "key": "6", "name": "Hallam", "stop_id": "1085" },
    { "key": "7", "name": "Dandenong", "stop_id": "1049" },
    { "key": "8", "name": "Yarraman", "stop_id": "1215" },
    { "key": "9", "name": "Noble Park", "stop_id": "1142" },
    { "key": "10", "name": "Sandown Park", "stop_id": "1172" },
    { "key": "11", "name": "Springvale", "stop_id": "1183" },
    { "key": "12", "name": "Westall", "stop_id": "1208" },
    { "key": "13", "name": "Clayton", "stop_id": "1040" },
    { "key": "14", "name": "Huntingdale", "stop_id": "1099" },
    { "key": "15", "name": "Oakleigh", "stop_id": "1150" },
    { "key": "16", "name": "Hughesdale", "stop_id": "1098" },
    { "key": "17", "name": "Murrumbeena", "stop_id": "1138" },
    { "key": "18", "name": "Carnegie", "stop_id": "1034" },
    { "key": "19", "name": "Caulfield", "stop_id": "1036" },
    { "key": "20", "name": "Malvern", "stop_id": "1118" },
    { "key": "21", "name": "Armadale", "stop_id": "1008" },
    { "key": "22", "name": "Toorak", "stop_id": "1194" },
    { "key": "23", "name": "Hawksburn", "stop_id": "1089" },
    { "key": "24", "name": "South Yarra", "stop_id": "1180" },
    { "key": "25", "name": "Richmond", "stop_id": "1162" },
    { "key": "26", "name": "Parliament", "stop_id": "1155" },
    { "key": "27", "name": "Melbourne Central", "stop_id": "1120" },
    { "key": "28", "name": "Flagstaff", "stop_id": "1068" },
    { "key": "29", "name": "Southern Cross", "stop_id": "1181" },
    { "key": "30", "name": "Flinders Street", "stop_id": "1071" }
];
const sa = [
    { "key": "0", "name": "Sandringham", "stop_id": "1173" },
    { "key": "1", "name": "Hampton", "stop_id": "1086" },
    { "key": "2", "name": "Brighton Beach", "stop_id": "1027" },
    { "key": "3", "name": "Middle Brighton", "stop_id": "1126" },
    { "key": "4", "name": "North Brighton", "stop_id": "1143" },
    { "key": "5", "name": "Gardenvale", "stop_id": "1074" },
    { "key": "6", "name": "Elsternwick", "stop_id": "1061" },
    { "key": "7", "name": "Ripponlea", "stop_id": "1165" },
    { "key": "8", "name": "Balaclava", "stop_id": "1013" },
    { "key": "9", "name": "Windsor", "stop_id": "1214" },
    { "key": "10", "name": "Prahran", "stop_id": "1158" },
    { "key": "11", "name": "South Yarra", "stop_id": "1180" },
    { "key": "12", "name": "Richmond", "stop_id": "1162" },
    { "key": "13", "name": "Flinders Street", "stop_id": "1071" }
];
const me = [
    { "key": "0", "name": "Mernda", "stop_id": "1228" },
    { "key": "1", "name": "Hawkstowe", "stop_id": "1227" },
    { "key": "2", "name": "Middle Gorge", "stop_id": "1226" },
    { "key": "3", "name": "South Morang", "stop_id": "1224" },
    { "key": "4", "name": "Epping", "stop_id": "1063" },
    { "key": "5", "name": "Lalor", "stop_id": "1112" },
    { "key": "6", "name": "Thomastown", "stop_id": "1192" },
    { "key": "7", "name": "Keon Park", "stop_id": "1109" },
    { "key": "8", "name": "Ruthven", "stop_id": "1171" },
    { "key": "9", "name": "Reservoir", "stop_id": "1161" },
    { "key": "10", "name": "Regent", "stop_id": "1160" },
    { "key": "11", "name": "Preston", "stop_id": "1159" },
    { "key": "12", "name": "Bell", "stop_id": "1019" },
    { "key": "13", "name": "Thornbury", "stop_id": "1193" },
    { "key": "14", "name": "Croxton", "stop_id": "1047" },
    { "key": "15", "name": "Northcote", "stop_id": "1147" },
    { "key": "16", "name": "Merri", "stop_id": "1125" },
    { "key": "17", "name": "Rushall", "stop_id": "1170" },
    { "key": "18", "name": "Clifton Hill", "stop_id": "1041" },
    { "key": "19", "name": "Victoria Park", "stop_id": "1201" },
    { "key": "20", "name": "Collingwood", "stop_id": "1043" },
    { "key": "21", "name": "North Richmond", "stop_id": "1145" },
    { "key": "22", "name": "West Richmond", "stop_id": "1207" },
    { "key": "23", "name": "Jolimont-MCG", "stop_id": "1104" },
    { "key": "24", "name": "Parliament", "stop_id": "1155" },
    { "key": "25", "name": "Melbourne Central", "stop_id": "1120" },
    { "key": "26", "name": "Flagstaff", "stop_id": "1068" },
    { "key": "27", "name": "Southern Cross", "stop_id": "1181" },
    { "key": "28", "name": "Flinders Street", "stop_id": "1071" }
];
const sp = [
    { "key": "0", "name": "Stony Point", "stop_id": "1185" },
    { "key": "1", "name": "Crib Point", "stop_id": "1046" },
    { "key": "2", "name": "Morradoo", "stop_id": "1136" },
    { "key": "3", "name": "Bittern", "stop_id": "1022" },
    { "key": "4", "name": "Hastings", "stop_id": "1088" },
    { "key": "5", "name": "Tyabb", "stop_id": "1197" },
    { "key": "6", "name": "Somerville", "stop_id": "1178" },
    { "key": "7", "name": "Baxter", "stop_id": "1015" },
    { "key": "8", "name": "Leawarra", "stop_id": "1114" },
    { "key": "9", "name": "Frankston", "stop_id": "1073" }
];
const su = [
    { "key": "0", "name": "Sunbury", "stop_id": "1187" },
    { "key": "1", "name": "Diggers Rest", "stop_id": "1055" },
    { "key": "2", "name": "Watergardens", "stop_id": "1202" },
    { "key": "3", "name": "Keilor Plains", "stop_id": "1107" },
    { "key": "4", "name": "St Albans", "stop_id": "1184" },
    { "key": "5", "name": "Ginifer", "stop_id": "1076" },
    { "key": "6", "name": "Albion", "stop_id": "1003" },
    { "key": "7", "name": "Sunshine", "stop_id": "1218" },
    { "key": "8", "name": "Tottenham", "stop_id": "1196" },
    { "key": "9", "name": "West Footscray", "stop_id": "1206" },
    { "key": "10", "name": "Middle Footscray", "stop_id": "1127" },
    { "key": "11", "name": "Footscray", "stop_id": "1072" },
    { "key": "12", "name": "North Melbourne", "stop_id": "1144" },
    { "key": "13", "name": "Flagstaff", "stop_id": "1068" },
    { "key": "14", "name": "Melbourne Central", "stop_id": "1120" },
    { "key": "15", "name": "Parliament", "stop_id": "1155" },
    { "key": "16", "name": "Southern Cross", "stop_id": "1181" },
    { "key": "17", "name": "Flinders Street", "stop_id": "1071" }
];
const uf = [
    { "key": "0", "name": "Upfield", "stop_id": "1198" },
    { "key": "1", "name": "Gowrie", "stop_id": "1083" },
    { "key": "2", "name": "Fawkner", "stop_id": "1066" },
    { "key": "3", "name": "Merlynston", "stop_id": "1124" },
    { "key": "4", "name": "Batman", "stop_id": "1014" },
    { "key": "5", "name": "Coburg", "stop_id": "1042" },
    { "key": "6", "name": "Moreland", "stop_id": "1135" },
    { "key": "7", "name": "Anstey", "stop_id": "1006" },
    { "key": "8", "name": "Brunswick", "stop_id": "1029" },
    { "key": "9", "name": "Jewell", "stop_id": "1103" },
    { "key": "10", "name": "Royal Park", "stop_id": "1169" },
    { "key": "11", "name": "Flemington Bridge", "stop_id": "1069" },
    { "key": "12", "name": "Macaulay", "stop_id": "1116" },
    { "key": "13", "name": "North Melbourne", "stop_id": "1144" },
    { "key": "14", "name": "Flagstaff", "stop_id": "1068" },
    { "key": "15", "name": "Melbourne Central", "stop_id": "1120" },
    { "key": "16", "name": "Parliament", "stop_id": "1155" },
    { "key": "17", "name": "Southern Cross", "stop_id": "1181" },
    { "key": "18", "name": "Flinders Street", "stop_id": "1071" }
];
const we = [
    { "key": "0", "name": "Werribee", "stop_id": "1205" },
    { "key": "1", "name": "Hoppers Crossing", "stop_id": "1097" },
    { "key": "2", "name": "Williams Landing", "stop_id": "1225" },
    { "key": "3", "name": "Aircraft", "stop_id": "1220" },
    { "key": "4", "name": "Laverton", "stop_id": "1113" },
    { "key": "5", "name": "Westona", "stop_id": "1210" },
    { "key": "7", "name": "Altona", "stop_id": "1005" },
    { "key": "8", "name": "Seaholme", "stop_id": "1175" },
    { "key": "9", "name": "Newport", "stop_id": "1141" },
    { "key": "10", "name": "Spotswood", "stop_id": "1182" },
    { "key": "11", "name": "Yarraville", "stop_id": "1216" },
    { "key": "12", "name": "Seddon", "stop_id": "1176" },
    { "key": "13", "name": "Footscray", "stop_id": "1072" },
    { "key": "14", "name": "South Kensington", "stop_id": "1179" },
    { "key": "15", "name": "North Melbourne", "stop_id": "1144" },
    { "key": "16", "name": "Flagstaff", "stop_id": "1068" },
    { "key": "17", "name": "Melbourne Central", "stop_id": "1120" },
    { "key": "18", "name": "Parliament", "stop_id": "1155" },
    { "key": "19", "name": "Southern Cross", "stop_id": "1181" },
    { "key": "20", "name": "Flinders Street ARR", "stop_id": "1071" }
];
const wi = [
    { "key": "0", "name": "Williamstown", "stop_id": "1211" },
    { "key": "1", "name": "Williamstown Beach", "stop_id": "1212" },
    { "key": "2", "name": "North Williamstown", "stop_id": "1146" },
    { "key": "3", "name": "Newport", "stop_id": "1141" },
    { "key": "4", "name": "Spotswood", "stop_id": "1182" },
    { "key": "5", "name": "Yarraville", "stop_id": "1216" },
    { "key": "6", "name": "Seddon", "stop_id": "1176" },
    { "key": "7", "name": "Footscray", "stop_id": "1072" },
    { "key": "8", "name": "South Kensington", "stop_id": "1179" },
    { "key": "9", "name": "North Melbourne", "stop_id": "1144" },
    { "key": "10", "name": "Flagstaff", "stop_id": "1068" },
    { "key": "11", "name": "Melbourne Central", "stop_id": "1120" },
    { "key": "12", "name": "Parliament", "stop_id": "1155" },
    { "key": "13", "name": "Southern Cross", "stop_id": "1181" },
    { "key": "14", "name": "Flinders Street", "stop_id": "1071" }
];
const Lines = [
    { "name": "Glen Waverley", "data": gw, "id": 7 },
    { "name": "Lilydale", "data": ld, "id": 9 },
    { "name": "Belgrave", "data": bg, "id": 2 },
    { "name": "Alamein", "data": al, "id": 1 },
    { "name": "Craigieburn", "data": cr, "id": 3 },
    { "name": "Cranbourne", "data": cb, "id": 4 },
    { "name": "Flemington Racecourse", "data": fl },
    { "name": "Frankston", "data": fr, "id": 6 },
    { "name": "Hurstbridge", "data": hb, "id": 8 },
    { "name": "Pakenham", "data": pa, "id": 11 },
    { "name": "Sandringham", "data": sa, "id": 12 },
    { "name": "Mernda", "data": me, "id": 5 },
    { "name": "Stony Point", "data": sp, "id": 13 },
    { "name": "Sunbury", "data": su, "id": 14 },
    { "name": "Upfield", "data": uf, "id": 15 },
    { "name": "Werribee", "data": we, "id": 16 },
    { "name": "Williamstown", "data": wi, "id": 17 }
];
function getLine(id) {
    for (let i = 0; i < Lines.length; i++) {
        const line = Lines[i];
        if (line.id === id)
            return line;
    }
    return { "name": "Unknown line", "data": [], "id": 0 };
}
