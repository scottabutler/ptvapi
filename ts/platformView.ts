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

let _stopsOnRouteCache: StopsOnRouteCache = {
    date: new Date().setDate(new Date().getDate() - 1),
    data: new Map<string, V3StopsOnRouteResponse>()
};

const PTV = {
    //Fields
    //NOTE: Use of the developer ID and secret key contained in this site 
    //is subject to the Terms of Use of the PTV API. Unauthorised use of 
    //these credentials is prohibited. You can request your own key from 
    //PTV via email.
    // 
    //Methods
    generateSignature: function(request:string, secret:string) {
        const hash:string = CryptoJS.HmacSHA1(request, secret);
        return hash;
    },
    
    doStuff: function(params: StartParams) {			
        const credentials: Credentials = {
            id: params.dev_id,
            secret: params.dev_secret
        };

        let validateDeparturesResponse = function(departuresResponse:V3DeparturesResponse):Promise<V3DeparturesResponse> {
            return new Promise<V3DeparturesResponse>((resolve, reject) => {
                if (departuresResponse == null || departuresResponse.departures == null || departuresResponse.departures.length == 0) {
                    reject('Departures error: No departures found.');
                }

                if (departuresResponse.departures![0].route_id == undefined) {
                    reject('Departures error: No routeId returned for next departure.');
                }

                if (departuresResponse.departures![0].run_id == undefined) {
                    reject('Departures error: No runId returned for next departure.');
                }

                return resolve(departuresResponse);
            });
        };

        let updateStopsOnRouteCache = function(stopsOnRouteResponse:V3StopsOnRouteResponse, cache:StopsOnRouteCache, cacheKey:string)
            :Promise<StopsOnRouteCache> {
            return new Promise<StopsOnRouteCache>((resolve) => {
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
        }

        const routeType = params.route_type;
        const stopId = params.stop_id;
        const platformNumber = params.platform_number;

        let departuresPromise = 
            this.requestDepartures(routeType, stopId, platformNumber, credentials)
                .then(validateDeparturesResponse);
        
        let prepareStopsOnRouteCachePromise = 
            this.prepareStopsOnRouteCache();

        Promise.all([departuresPromise, prepareStopsOnRouteCachePromise])
            .then((resolvedPromises) => {
                const departuresResponse:V3DeparturesResponse = resolvedPromises[0];
                const departures:Array<V3Departure> = departuresResponse.departures!;
                const runs = departuresResponse.runs;
                const routeId = departures![0].route_id!;
                const runId = departures![0].run_id!;                                
                
                const cacheKey = PTV.getStopsOnRouteCacheKey(routeType, routeId);

                let stopsOnRoutePromise = 
                    this.requestStopsOnRoute(routeType, routeId, credentials, resolvedPromises[1])
                    .then((stopsOnRouteResponse) => updateStopsOnRouteCache(stopsOnRouteResponse, _stopsOnRouteCache, cacheKey))
                    .then((updatedCache) => _stopsOnRouteCache = updatedCache);

                let stoppingPatternPromise =
                    this.requestStoppingPattern(routeType, runId, credentials);

                let disruptionsPromise =
                    this.requestDisruptions(routeType, credentials);
                
                Promise.all([stopsOnRoutePromise, stoppingPatternPromise, disruptionsPromise])
                    .then((resolvedPromises) => {
                        const stopsOnRoute = _stopsOnRouteCache.data!.get(cacheKey);
                        const stoppingPattern = resolvedPromises[1];
                        const disruptions = resolvedPromises[2];

                        //TODO ensure the following are not undefined:
                        // runs
                        // departures
                        // stoppingPattern
                        // stoppingPattern.departures
                        // stopsOnRoute

                        this.updatePage(stopId, routeId, disruptions, 
                            departures!, runs!, stoppingPattern!, stopsOnRoute!);
                    });
            })
            .catch(function(e:string) {
                document.getElementById(_errorElementId)!.innerHTML = 'Error: ' + e;
                document.getElementById(_loadingElementId)!.innerHTML = 'Error.';
                document.getElementById("realtime")!.style.display = 'none'
                PTV.clearPage();					
            });
    },

    prepareStopsOnRouteCache: function(): Promise<StopsOnRouteCache> {
        return new Promise(function(resolve) {
            
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 1);
            const expiryDateNew = expiryDate.getTime();
            const newCache:StopsOnRouteCache = {
                date: expiryDateNew,
                data: new Map<string, V3StopsOnRouteResponse>() //no data yet
            };
            
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
                        return resolve(newCache);
                    }
                
                    return resolve(cache);
                }
            } else {
                // Sorry! No Web Storage support..
            }
        
            return resolve(newCache);
        });
    },
        
    localStorageCacheKey: "PTVAPI.stopsOnRouteCache",
    
    getStopsOnRouteCacheKey: function(routeType:number, routeId:number) {
        return routeType + '_' + routeId;
    },

    sendRequest: function<TResponse>(endpoint:string, credentials:Credentials):Promise<TResponse> {				
        document.getElementById(_loadingElementId)!.innerHTML += '.';
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

        const result:Promise<TResponse> = PTV.fetchTyped<TResponse>(url);
        return result;
    },

    fetchTyped: async function<T>(request: RequestInfo) : Promise<T> {
        const response = await fetch(request);
        const body = await response.json();
        return body;
    },

    requestDepartures: async function(routeType:number, stopId:number, platformNumber:number, credentials:Credentials): Promise<V3DeparturesResponse> {
        const endpoint = PTV.buildDeparturesEndpoint(routeType, stopId, platformNumber); //TODO
        return await PTV.sendRequest<V3DeparturesResponse>(endpoint, credentials);
    },

    requestStopsOnRoute: async function(
        routeType: number, 
        routeId:number,
        credentials:Credentials,
        stopsOnRouteCache:StopsOnRouteCache): Promise<V3StopsOnRouteResponse> {							
        return new Promise(function(resolve) {                                                  
            const key = PTV.getStopsOnRouteCacheKey(routeType, routeId);

            if (stopsOnRouteCache.data != undefined && stopsOnRouteCache.data.get(key)) {
                resolve(stopsOnRouteCache.data.get(key));
            } else {
                const endpoint = PTV.buildStopsOnRouteEndpoint(routeType, routeId); 
                resolve(PTV.sendRequest<V3StopsOnRouteResponse>(endpoint, credentials));
            }
        });
    },

    requestDisruptions: function(routeType:number, credentials:Credentials): Promise<V3Disruptions> {
        return new Promise(function(resolve) {
            const endpoint = PTV.buildDisruptionsEndpoint(routeType);
            resolve(PTV.sendRequest<V3Disruptions>(endpoint, credentials));
        });
    },

    requestStoppingPattern: function(routeType:number, runId:number, credentials:Credentials): Promise<V3StoppingPatternResponse> {
        return new Promise(function(resolve) {
            const endpoint = PTV.buildStoppingPatternEndpoint(routeType, runId);        
            resolve(PTV.sendRequest<V3StoppingPatternResponse>(endpoint, credentials));
        });
    },
    
    clearPage: function(): void {
        debug('clearPage');
        
        const elementsToClear = document.getElementsByClassName('clearable')!;
        for (let i = 0; i < elementsToClear.length; i++) {
            elementsToClear[i].innerHTML = '';
        }
        
        clearStoppingPattern();
        clearFollowingDepartures();
        clearDisruptionList();
    },
    
    getColourForRoute: function(route_id: number | undefined): string {
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

    buildDisruptionsMap: function(items: V3Disruption[]): Map<number, V3Disruption> {
        const map = new Map();
        for (let i = 0; i < items.length; i++) {
            map.set(items[i].disruption_id, items[i]);
        }
        return map;
    },

    getGeneralDisruptions: function(disruptions: V3Disruptions): string {
        if (disruptions.general == undefined) {
            return '';
        }

        //TODO replace mutation with a map/select?
        let result = '';

        for (let i = 0; i < disruptions.general.length; i++) {
            const data = disruptions.general[i];

            if (!data) continue;
            if (!data.display_on_board) continue;

            result += data.description;
        }

        return result;
    },

    getDisruptionDataForDeparture: function(departure: V3Departure, disruptionsMap: Map<number, V3Disruption>): DisruptionsForDeparture {
        const result: DisruptionsForDeparture = {
            className: 'disruption goodservice mr-2',
            items: []
        };

        if (departure.disruption_ids == undefined) return result;

        for (let i = 0; i < departure.disruption_ids.length; i++) {
            const id = departure.disruption_ids[i];
            const data:V3Disruption|undefined = disruptionsMap.get(id);

            if (!data) continue;
            if (!data.display_on_board) continue;

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

    updatePage: function( 
        stopId:number, 
        routeId:number, 
        disruptionsResponse:V3Disruptions,
        departures:Array<V3Departure>,
        runs:RunCollection,
        stoppingPattern:V3StoppingPatternResponse,
        stopsOnRoute:V3StopsOnRouteResponse
        ): Promise<void> { //TODO break up this function
        return new Promise(function(resolve, reject) {
            debug('updatePage');            

            //Update the loading indicator and display the current time
            document.getElementById(_loadingElementId)!.innerHTML = 'Done.';
            const refresh_date = new Date();
            document.getElementById(_refreshTimeElementId)!.innerHTML = padSingleDigitWithZero(refresh_date.getHours()) + 
                ':' + padSingleDigitWithZero(refresh_date.getMinutes()) + ':' + padSingleDigitWithZero(refresh_date.getSeconds());					

            const metroTrainDisruptions: V3Disruption[] = disruptionsResponse.metro_train != undefined
                ? disruptionsResponse.metro_train
                : [];

            const disruptionsMap = PTV.buildDisruptionsMap(metroTrainDisruptions);

            //TODO is this required?
            if (departures == null || departures.length == 0) {
                reject('Update page error: No departures found.');
            }

            const nextDeparture:V3Departure = departures![0];
        
            const nextDepartureRouteId = nextDeparture.route_id;
            document.body.setAttribute('data-colour', PTV.getColourForRoute(nextDepartureRouteId));

            //Reset some elements
            document.getElementById(_errorElementId)!.innerHTML = '';
        
            //Set stop name
            let stop_name = '';
            if (stopsOnRoute != undefined && stopsOnRoute.stops != undefined) {
                for (let i = 0; i < stopsOnRoute.stops.length; i++) {
                    if (stopsOnRoute.stops[i].stop_id == stopId) {
                        stop_name = stopsOnRoute.stops[i].stop_name!.toString();
                        break;
                    }
                }
            } else {
                reject('No stops found for route ' + routeId + '.');
            }
            
            const shortStopName = stop_name.replace(' Station', '');
            document.getElementById(_stopElementId)!.innerHTML = shortStopName;
        
            //Set platform number
            document.getElementById(_platformElementId)!.innerHTML = 'Platform ' + nextDeparture.platform_number;
        
            //Set next departure
            if (nextDeparture.run_id == undefined)
                reject('No runId returned for next departure');

            if (runs == undefined || runs.length == 0)
                reject('No runs returned for run ' + nextDeparture.run_id + '.');
            
            const nextDepartureName = runs![nextDeparture.run_id!].destination_name;				
            document.getElementById('next-dest')!.innerHTML = nextDepartureName != undefined ? nextDepartureName : 'Unknown destination';

            //Set disruption information
            clearDisruptionList();

            if (nextDeparture.disruption_ids != null) {
                const disruption_data = PTV.getDisruptionDataForDeparture(nextDeparture, disruptionsMap);
                const disruptionElement = document.getElementById('next-dest-disruption')!;
                disruptionElement.setAttribute('class', 'clearable ' + disruption_data.className);

                const disruption_list = document.getElementById(_disruptionListElementId)!;

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
            if (nextDeparture.scheduled_departure_utc == undefined)
                reject('No scheduled_departure_utc returned for next departure');
            const time = DateTimeHelpers.formatSingleTime(nextDeparture.scheduled_departure_utc!, true);				
            document.getElementById('next-time')!.innerHTML = time;

            //TODO immutable for diff
            let diff = DateTimeHelpers.getDifferenceFromNow(nextDeparture.estimated_departure_utc, nextDeparture.scheduled_departure_utc!).toString();
            const diffSec = DateTimeHelpers.getDifferenceFromNowSec(nextDeparture.estimated_departure_utc, nextDeparture.scheduled_departure_utc!);
            
            const isRt = isRealTime(nextDeparture.estimated_departure_utc);
            document.getElementById("realtime")!.style.display = (isRt ? "none" : "block");
            
            let minsText = "min" + (isRt ? "" : "*"); //TODO immutable
            if (diffSec <= 60 && diffSec >= -60) {
                diff = "Now" + (isRt ? "" : "*");
                minsText = "";
            }
            
            document.getElementById('next-diff')!.innerHTML = diff + ' ' + minsText;
            
            //Set title
            document.title = diff + ' ' + minsText + ' ' + shortStopName + ' to ' +  nextDepartureName;
        
            //Set stopping pattern
            clearStoppingPattern();

            if (stopsOnRoute == undefined || stopsOnRoute.stops == undefined) {
                reject('No stops found for route ' + routeId + '.');
            }
            const stops = new Map();
            for (let s = 0; s < stopsOnRoute.stops!.length; s++) {
                stops.set(stopsOnRoute.stops![s].stop_id, stopsOnRoute.stops![s].stop_name);
            }

            const stopsFromCurrent:IdName[] = [];

            let foundCurrentStop = false;
            let stoppingPatternCount = 0;
            
            for (let j = 0; j < stoppingPattern.departures!.length; j++) {
                const stoppingPatternStopId = stoppingPattern.departures![j].stop_id!;
                const isCurrentStop = stoppingPatternStopId == stopId;

                if (isCurrentStop) {
                    stoppingPatternCount = stoppingPattern.departures!.length - j;
                    foundCurrentStop = true;
                }

                if (foundCurrentStop) {				
                    const name = stops.get(stoppingPatternStopId).replace(' Station', '');
                    stopsFromCurrent.push({id: stoppingPatternStopId, name: name});
                }
            }

            //TODO is this required?
            if (departures == null || departures.length == 0) {
                reject('No departures found.');
            }

            if (departures![0].route_id == undefined) {
                reject('No routeId returned for departure.');
            }

            const inbound = departures![0].direction_id == 1;
            const fullList = getStoppingPatternWithSkippedStations(stopsFromCurrent, departures![0].route_id!, inbound, stopId);
            const desc = getShortStoppingPatternDescription(fullList, inbound, stopId);
            document.getElementById("next-dest-description")!.innerText = desc; //TODO const for id

            fullList.map(x => {
                addStoppingPatternItem(x.name, x.isSkipped, x.id == stopId)
            })

            const listElement = document.getElementById('next-stops-list')!;
            if (stoppingPatternCount > 7) {
                if (listElement.className.indexOf('two-columns') == -1) {
                    listElement.className += ' two-columns';
                }
            } else {
                listElement.className = listElement.className.replace('two-columns', '');
            }
            
            //Set following departures
            clearFollowingDepartures();
            for (let i = 1; i < departures!.length; i++) {
                const departure = departures![i];
                const runId = departure.run_id;
                if (runId == undefined)
                    reject('No runId returned for departure.');
                
                if (runs == undefined)
                    reject('No runs returned for departure.');

                const destinationName = runs![runId!].destination_name != undefined
                    ? runs![runId!].destination_name!
                    : 'Unknown destination'; //TODO this is duplicated somewhere

                addFollowingDeparture(disruptionsMap, departure, destinationName);
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
    buildDeparturesEndpoint: function(routeType:number, stopId:number, platformNumber:number) {
        const date_utc = DateTimeHelpers.getIsoDate();
        const template = '/v3/departures/route_type/{route_type}/stop/{stop_id}' +
                '?max_results=6&date_utc={date_utc}&platform_numbers={platform_number}&expand=stop&expand=run';
        const endpoint = template
                            .replace('{route_type}', routeType.toString())
                            .replace('{stop_id}', stopId.toString())
                            .replace('{platform_number}', platformNumber.toString())					
                            .replace('{date_utc}', date_utc);
        return endpoint;
    },
    
    //Stops on route
    buildStopsOnRouteEndpoint: function(routeType:number, routeId:number) {
        const dateUtc = DateTimeHelpers.getIsoDate();
        const template = '/v3/stops/route/{route_id}/route_type/{route_type}' +
                '?date_utc={date_utc}';
        return template
                .replace('{route_type}', routeType.toString())
                .replace('{route_id}', routeId.toString())					
                .replace('{date_utc}', dateUtc);
    },

    //Stopping pattern
    buildStoppingPatternEndpoint: function(routeType:number, runId:number) {
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
    buildDisruptionsEndpoint: function(routeType:number) {
        const template = '/v3/disruptions?route_types={route_type}&disruption_status={disruption_status}';
        const endpoint = template
            .replace('{route_type}', routeType.toString())
            .replace('{disruption_status}', 'current');
        return endpoint;
    }
};

let _devId:string = '';
let _secret: string = '';

function init() {
    _devId = getQueryVariable('d');
    _secret = getQueryVariable('s');
    const platform_number = getQueryVariable('p');
    const e:any = document.getElementById(_platformSelectElementId)!;
    e.value = platform_number;
    
    if (_devId == null || _devId == '' || _secret == null || _secret == '') {
        return;
    }
    
    updateView();
}

function getQueryVariable(variable:string):string {
   const query = window.location.search.substring(1);
   const vars = query.split("&");
   for (var i=0;i<vars.length;i++) {
	   const pair = vars[i].split("=");
	   if(pair[0] == variable){return pair[1];}
   }
   return('');
}

function updateQueryVariable(key:string, value:string):string {
	const query = window.location.search.substring(1);
	const vars = query.split("&");
	let result = "";
	for (var i=0;i<vars.length;i++) {
		const pair = vars[i].split("=");
		if(pair[0] == key){
			result = result + "&" + pair[0] + "=" + value;
		} else {
			result = result + "&" + pair[0] + "=" + pair[1];
		}
	}
	return "?" + result.substring(1);
}

function updateView():void {
    const loading = document.getElementById(_loadingElementId)!;
    loading.innerHTML = 'Loading';
    document.getElementById(_refreshTimeElementId)!.innerHTML = '';
    
    const stop_id = getQueryVariable('stop_id');
    const route_type = getQueryVariable('route_type');
    const route_id = getQueryVariable('route_id');
    const e:any = document.getElementById(_platformSelectElementId);
    const platform_number = e.options[e.selectedIndex].value;
    
    const new_url = window.location.pathname + updateQueryVariable('p', platform_number);
    window.history.replaceState( {} , 'Platform View', new_url );
    
    //Set an auto-refresh timer
    updateTimer();
    
    const params:StartParams = {
        route_type: Number(route_type),
        route_id: Number(route_id),
        stop_id: Number(stop_id),
        platform_number: platform_number,
        dev_id: Number(_devId),
        dev_secret: _secret
    };
    
    PTV.doStuff(params);
}

let timer : any;
function updateTimer() {			
    clearTimeout(timer);
    const autoRefreshCheckBox: any = document.getElementById('auto-refresh');
    if (autoRefreshCheckBox!.checked) {
        timer = setTimeout(function(){updateView()}, 30000);
    }
}

function getShortStoppingPatternDescription(stoppingPatternWithSkippedStations:IdNameSkipped[], isInbound: boolean, currentStopId: number) {
    //PREFIX
    //If only skipped one stop - 'All stations except X'
    //If skipped more than one non-loop stop - 'Limited express'

    //SUFFIX
    //If stopping at Flagstaff, Melb Central or Parliament - 'via the city loop'
    //If skipped all loop stops - 'via (stop after loop)'

    let result = '';

    const skipped:IdNameSkipped[] = [];
    const notSkipped:IdNameSkipped[] = [];
    stoppingPatternWithSkippedStations.map(x => {
        if (x.isSkipped == true) {
            skipped.push(x);
        } else {
            notSkipped.push(x);
        }
    });
    const notSkippedIds = notSkipped.map(x => x.id);
    const skipCount = skipped.length;
    const isStoppingAtAnyLoopStation = isStoppingAtAnyCityLoopStation(notSkippedIds);
    const isNotRunningViaLoop = isNotRunningViaCityLoop(notSkippedIds);

    const nextNonLoopStationName = notSkipped.length >=2 ? notSkipped[1].name : '';

    //console.log('Stopping any loop: ' + isStoppingAtAnyLoopStation);
    //console.log('Not running via loop: ' + isNotRunningViaLoop);
    //console.log('Inbound: ' + inbound);
    //console.log('Flinders: ' + isFlindersSt(currentStopId));
    //console.log('Current stop id: ' + currentStopId);
    //console.log('Next non-loop: ' + nextNonLoopStationName);

    //Type (all stations or express)
    if (skipCount == 0) {
        result = 'Stopping all stations';
    } else if (skipCount == 1) {
        result = 'All except ' + skipped[0].name;
    } else {
        result = 'Limited express';
    }

    //Direct or via loop
    if (isStoppingAtAnyLoopStation) {
        result += ' via the City Loop';
    } else if (isNotRunningViaLoop 
        && !isInbound 
        && isFlindersSt(currentStopId)
        && nextNonLoopStationName != '') {
        result += ' via ' + nextNonLoopStationName;
    }

    return result;
}

//TODO Assign these render functions to PTV object
function addFollowingDeparture(disruptionsMap: Map<number, V3Disruption>, departure:V3Departure, destinationName: string): void {
    const time = departure.scheduled_departure_utc != undefined
        ? DateTimeHelpers.formatSingleTime(departure.scheduled_departure_utc!, true)
        : '--:--';
    const diff = departure.scheduled_departure_utc != undefined
        ? DateTimeHelpers.getDifferenceFromNow(departure.estimated_departure_utc, departure.scheduled_departure_utc)
        : '--'; 
    const disruption_data = PTV.getDisruptionDataForDeparture(departure, disruptionsMap);
    const route_id = departure.route_id;

    if (diff >= 60) {
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.setAttribute('class', 'row ');

    //Time
    const timeWrapper = createElementWithContent(
        'div', 'col-6 col-md-3 col-lg-2 order-2 order-md-1 ml-4 ml-md-0',
        'h4', 'font-weight-light', time);

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
    const diffWrapper = createElementWithContent(
        'div', 'col-5 col-md-3 col-lg-2 order-3 order-md-3 text-right',
        'h4', 'font-weight-light text-white bg-dark d-inline px-2', diff + ' min');

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
        disruptionDetailWrapper.setAttribute('class', 
                'disruption-message col-12 col-md-9 offset-md-3 col-lg-8 offset-lg-2 order-4');
        disruptionDetailWrapper.appendChild(disruption_list);

        wrapper.appendChild(disruptionDetailWrapper);
    }

    document.getElementById(_followingDeparturesElementId)!.appendChild(wrapper);
}

function getStoppingPatternWithSkippedStations(stopList:IdName[], lineId: number, isInbound: boolean, currentStopId: number): IdNameSkipped[] {
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
        if (allStops[i].stop_id * 1 == stopList[stopList.length-1].id)
            break;
    }

    let res: IdNameSkipped[];
    res = allStopsReduced.map(x =>
        stopListIds.indexOf(x.stop_id * 1) != -1
        ? {id: x.stop_id * 1, name: stopListNames.get(x.stop_id * 1), isSkipped: false}
        : {id: x.stop_id * 1, name: x.name, isSkipped: true}
    );

    //If the train is not going through the city loop, don't show any city loop stops (not even as skipped)
    if (isNotRunningViaCityLoop(stopListIds))
    {
        const results: IdNameSkipped[] = [];
        res.map(x => {
            if (!isCityLoopStation(x.id) && !(isSouthernCross(x.id) && x.isSkipped))
                results.push(x);
        });
        return results;
    } else {
        return res;
    }
}

function createElementWithContent(tag:string, classVal:string, childTag:string, childClassVal:string, childTextContent:string) {
    const wrapper = document.createElement(tag);
    wrapper.setAttribute('class', classVal);

    const child = document.createElement(childTag);
    child.setAttribute('class', childClassVal);
    child.textContent = childTextContent;

    wrapper.appendChild(child);
    return wrapper;
}

function addStoppingPatternItem(name:string, isSkipped:boolean, isCurrentStop:boolean) {
    const content = document.createElement('span');
    content.setAttribute('class', 'px-1' + (isCurrentStop ? ' active-colour' : '') + (isSkipped ? ' skipped-colour' : ''));
    content.innerText = name;
    
    const wrapper = document.createElement('li');
    wrapper.appendChild(content);
    document.getElementById(_nextStopsListElementId)!.appendChild(wrapper);
}

type IdNameSkipped = {
    id: number,
    name: string,
    isSkipped: boolean
}

type IdName = {
    id: number,
    name: string
}

/* STATION HELPERS */
const _PARLIAMENT_ID = 1155;
const _MELBOURNE_CENTRAL_ID = 1120;
const _FLAGSTAFF_ID = 1068;
const _FLINDERS_ST_ID = 1071;
const _SOUTHERN_CROSS_ID = 1181;

function isCityLoopStation(stopId: number) {
	return stopId == _PARLIAMENT_ID || //Parliament
			stopId == _MELBOURNE_CENTRAL_ID || //Melbourne Central
			stopId == _FLAGSTAFF_ID; //Flagstaff
}

function isStoppingAtAnyCityLoopStation(stopIds: number[]) {
    let result = false;    
	for (var i = 0; i < stopIds.length; i++) {
		if (isCityLoopStation(stopIds[i])) {			
			result = true;
			break;
		}
	}
	return result;
}

function isNotRunningViaCityLoop(stopIds: number[]) {	
	return stopIds.indexOf(_PARLIAMENT_ID) == -1 &&
		stopIds.indexOf(_MELBOURNE_CENTRAL_ID) == -1 &&
		stopIds.indexOf(_FLAGSTAFF_ID) == -1;
}

function isFlindersSt(stopId: number): boolean {
	return stopId == _FLINDERS_ST_ID;
}

function isSouthernCross(stopId: number): boolean {
	return stopId == _SOUTHERN_CROSS_ID;
}

//TODO move inside PTV object (or another object)
const debug_mode = false;
//const previous_milliseconds = new Date().getTime();
function debug(message: string): void {
    if (!debug_mode) return;
    
    //const date = new Date().getTime();
    //const elapsed = date - previous_milliseconds;
    //previous_milliseconds = date;
    //console.log('DEBUG: (' + elapsed + 'ms) ' + message);
    console.log('DEBUG: ' + message);
}

function clearFollowingDepartures(): void {
    document.getElementById(_followingDeparturesElementId)!.innerHTML = '';
}
            
function clearStoppingPattern(): void {
    document.getElementById(_nextStopsListElementId)!.innerHTML = '';
}

function clearDisruptionList(): void {
    //TODO add const for this id
    document.getElementById(_disruptionListElementId)!.innerHTML = '';
    document.getElementById('next-dest-disruption')!.setAttribute('class', 'clearable');
}

function padSingleDigitWithZero(input: number): string {
	return input < 10 ? '0' + input : input.toString();
}

function isRealTime(estimated:Date | undefined) {
	return estimated != null && estimated != undefined;
}

class BrowserHelpers {
	static hasLocalStorage(): boolean {
		return typeof(Storage) !== "undefined";
	}
}

/* ARRAY FUNCTIONS */
function reverseArray(input: any[]): any[] {
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
	static getIsoDate(): string {
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

	static formatSingleTime(date: Date, includeDesignator: boolean): string {
        const hours = new Date(date).getHours();
        const isPm = hours > 12;
		const hrs = isPm ? hours - 12 : hours;
		const designator = isPm ? "pm" : "am";
		const mins = padSingleDigitWithZero(new Date(date).getMinutes());
		
		return includeDesignator
			? hrs + ":" + mins + designator
			: hrs + ":" + mins;
	}

	static getDifferenceFromNow(estimated: Date | undefined, scheduled: Date): number {
		const date = estimated == null
			? scheduled
			: estimated;
		
		const now = new Date();
		
		return Math.floor(DateTimeHelpers.getDifferenceFromNowSec(estimated, scheduled) / 60);
	}
	
	static getDifferenceFromNowSec(estimated: Date | undefined, scheduled: Date): number {
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
    {"key": "0", "name": "Glen Waverley", "stop_id": "1078"},
    {"key": "1", "name": "Syndal", "stop_id": "1190"},
    {"key": "2", "name": "Mount Waverley", "stop_id": "1137"},
    {"key": "3", "name": "Jordanville", "stop_id": "1105"},
    {"key": "4", "name": "Holmesglen", "stop_id": "1096"},
    {"key": "5", "name": "East Malvern", "stop_id": "1058"},
    {"key": "6", "name": "Darling", "stop_id": "1051"},
    {"key": "7", "name": "Glen Iris", "stop_id": "1077"},
    {"key": "8", "name": "Gardiner", "stop_id": "1075"},
    {"key": "9", "name": "Tooronga", "stop_id": "1195"},
    {"key": "10", "name": "Kooyong", "stop_id": "1110"},
    {"key": "11", "name": "Heyington", "stop_id": "1094"},
    {"key": "12", "name": "Burnley", "stop_id": "1030"},
    {"key": "13", "name": "East Richmond", "stop_id": "1059"},
    {"key": "14", "name": "Richmond", "stop_id": "1162"},
    {"key": "15", "name": "Parliament", "stop_id": "1155"},
    {"key": "16", "name": "Melbourne Central", "stop_id": "1120"},
    {"key": "17", "name": "Flagstaff", "stop_id": "1068"},
    {"key": "18", "name": "Southern Cross", "stop_id": "1181"},
    {"key": "19", "name": "Flinders Street", "stop_id": "1071"}
];
const ld = [
    {"key": "0", "name": "Lilydale", "stop_id": "1115"},
    {"key": "1", "name": "Mooroolbark", "stop_id": "1133"},
    {"key": "2", "name": "Croydon", "stop_id": "1048"},
    {"key": "3", "name": "Ringwood East", "stop_id": "1164"},
    {"key": "4", "name": "Ringwood", "stop_id": "1163"},
    {"key": "5", "name": "Heatherdale", "stop_id": "1091"},
    {"key": "6", "name": "Mitcham", "stop_id": "1128"},
    {"key": "7", "name": "Nunawading", "stop_id": "1148"},
    {"key": "8", "name": "Blackburn", "stop_id": "1023"},
    {"key": "9", "name": "Laburnum", "stop_id": "1111"},
    {"key": "10", "name": "Box Hill", "stop_id": "1026"},
    {"key": "11", "name": "Mont Albert", "stop_id": "1129"},
    {"key": "12", "name": "Surrey Hills", "stop_id": "1189"},
    {"key": "13", "name": "Chatham", "stop_id": "1037"},
    {"key": "14", "name": "Canterbury", "stop_id": "1033"},
    {"key": "15", "name": "East Camberwell", "stop_id": "1057"},
    {"key": "16", "name": "Camberwell", "stop_id": "1032"},
    {"key": "17", "name": "Auburn", "stop_id": "1012"},
    {"key": "18", "name": "Glenferrie", "stop_id": "1080"},
    {"key": "19", "name": "Hawthorn", "stop_id": "1090"},
    {"key": "20", "name": "Burnley", "stop_id": "1030"},
    {"key": "21", "name": "East Richmond", "stop_id": "1059"},
    {"key": "22", "name": "Richmond", "stop_id": "1162"},
    {"key": "23", "name": "Parliament", "stop_id": "1155"},
    {"key": "24", "name": "Melbourne Central", "stop_id": "1120"},
    {"key": "25", "name": "Flagstaff", "stop_id": "1068"},
    {"key": "26", "name": "Southern Cross", "stop_id": "1181"},
    {"key": "27", "name": "Flinders Street", "stop_id": "1071"}
];
const bg = [
    {"key": "0", "name": "Belgrave", "stop_id": "1018"},
    {"key": "1", "name": "Tecoma", "stop_id": "1191"},
    {"key": "2", "name": "Upwey", "stop_id": "1200"},
    {"key": "4", "name": "Upper Ferntree Gully", "stop_id": "1199"},
    {"key": "6", "name": "Ferntree Gully", "stop_id": "1067"},
    {"key": "7", "name": "Boronia", "stop_id": "1025"},
    {"key": "8", "name": "Bayswater", "stop_id": "1016"},
    {"key": "9", "name": "Heathmont", "stop_id": "1092"},
    {"key": "10", "name": "Ringwood", "stop_id": "1163"},
    {"key": "11", "name": "Heatherdale", "stop_id": "1091"},
    {"key": "12", "name": "Mitcham", "stop_id": "1128"},
    {"key": "13", "name": "Nunawading", "stop_id": "1148"},
    {"key": "14", "name": "Blackburn", "stop_id": "1023"},
    {"key": "15", "name": "Laburnum", "stop_id": "1111"},
    {"key": "16", "name": "Box Hill", "stop_id": "1026"},
    {"key": "17", "name": "Mont Albert", "stop_id": "1129"},
    {"key": "18", "name": "Surrey Hills", "stop_id": "1189"},
    {"key": "19", "name": "Chatham", "stop_id": "1037"},
    {"key": "20", "name": "Canterbury", "stop_id": "1033"},
    {"key": "21", "name": "East Camberwell", "stop_id": "1057"},
    {"key": "22", "name": "Camberwell", "stop_id": "1032"},
    {"key": "23", "name": "Auburn", "stop_id": "1012"},
    {"key": "24", "name": "Glenferrie", "stop_id": "1080"},
    {"key": "25", "name": "Hawthorn", "stop_id": "1090"},
    {"key": "26", "name": "Burnley", "stop_id": "1030"},
    {"key": "27", "name": "East Richmond", "stop_id": "1059"},
    {"key": "28", "name": "Richmond", "stop_id": "1162"},
    {"key": "29", "name": "Parliament", "stop_id": "1155"},
    {"key": "30", "name": "Melbourne Central", "stop_id": "1120"},
    {"key": "31", "name": "Flagstaff", "stop_id": "1068"},
    {"key": "32", "name": "Southern Cross", "stop_id": "1181"},
    {"key": "33", "name": "Flinders Street", "stop_id": "1071"}
];
const al = [
    {"key": "0", "name": "Alamein", "stop_id": "1002"},
    {"key": "1", "name": "Ashburton", "stop_id": "1010"},
    {"key": "2", "name": "Burwood", "stop_id": "1031"},
    {"key": "3", "name": "Hartwell", "stop_id": "1087"},
    {"key": "4", "name": "Willison", "stop_id": "1213"},
    {"key": "5", "name": "Riversdale", "stop_id": "1166"},
    {"key": "6", "name": "Camberwell", "stop_id": "1032"},
    {"key": "7", "name": "Auburn", "stop_id": "1012"},
    {"key": "8", "name": "Glenferrie", "stop_id": "1080"},
    {"key": "9", "name": "Hawthorn", "stop_id": "1090"},
    {"key": "10", "name": "Burnley", "stop_id": "1030"},
    {"key": "11", "name": "East Richmond", "stop_id": "1059"},
    {"key": "12", "name": "Richmond", "stop_id": "1162"},
    {"key": "13", "name": "Parliament", "stop_id": "1155"},
    {"key": "14", "name": "Melbourne Central", "stop_id": "1120"},
    {"key": "15", "name": "Flagstaff", "stop_id": "1068"},
    {"key": "16", "name": "Southern Cross", "stop_id": "1181"},
    {"key": "17", "name": "Flinders Street", "stop_id": "1071"}
];
const cr = [
    {"key": "0", "name": "Craigieburn", "stop_id": "1044"},
    {"key": "1", "name": "Roxburgh Park", "stop_id": "1219"},
    {"key": "2", "name": "Coolaroo", "stop_id": "1221"},
    {"key": "3", "name": "Broadmeadows", "stop_id": "1028"},
    {"key": "4", "name": "Jacana", "stop_id": "1102"},
    {"key": "5", "name": "Glenroy", "stop_id": "1082"},
    {"key": "6", "name": "Oak Park", "stop_id": "1149"},
    {"key": "7", "name": "Pascoe Vale", "stop_id": "1156"},
    {"key": "8", "name": "Strathmore", "stop_id": "1186"},
    {"key": "9", "name": "Glenbervie", "stop_id": "1079"},
    {"key": "10", "name": "Essendon", "stop_id": "1064"},
    {"key": "11", "name": "Moonee Ponds", "stop_id": "1131"},
    {"key": "12", "name": "Ascot Vale", "stop_id": "1009"},
    {"key": "13", "name": "Newmarket", "stop_id": "1140"},
    {"key": "14", "name": "Kensington", "stop_id": "1108"},
    {"key": "15", "name": "North Melbourne", "stop_id": "1144"},
    {"key": "16", "name": "Flagstaff", "stop_id": "1068"},
    {"key": "17", "name": "Melbourne Central", "stop_id": "1120"},
    {"key": "18", "name": "Parliament", "stop_id": "1155"},
    {"key": "19", "name": "Southern Cross", "stop_id": "1181"},
    {"key": "20", "name": "Flinders Street", "stop_id": "1071"}
];
const cb = [
    {"key": "0", "name": "Cranbourne", "stop_id": "1045"},
    {"key": "1", "name": "Merinda Park", "stop_id": "1123"},
    {"key": "2", "name": "Lynbrook", "stop_id": "1222"},
    {"key": "3", "name": "Dandenong", "stop_id": "1049"},
    {"key": "5", "name": "Yarraman", "stop_id": "1215"},
    {"key": "6", "name": "Noble Park", "stop_id": "1142"},
    {"key": "7", "name": "Sandown Park", "stop_id": "1172"},
    {"key": "8", "name": "Springvale", "stop_id": "1183"},
    {"key": "9", "name": "Westall", "stop_id": "1208"},
    {"key": "10", "name": "Clayton", "stop_id": "1040"},
    {"key": "11", "name": "Huntingdale", "stop_id": "1099"},
    {"key": "12", "name": "Oakleigh", "stop_id": "1150"},
    {"key": "13", "name": "Hughesdale", "stop_id": "1098"},
    {"key": "14", "name": "Murrumbeena", "stop_id": "1138"},
    {"key": "15", "name": "Carnegie", "stop_id": "1034"},
    {"key": "16", "name": "Caulfield", "stop_id": "1036"},
    {"key": "17", "name": "Malvern", "stop_id": "1118"},
    {"key": "18", "name": "Armadale", "stop_id": "1008"},
    {"key": "19", "name": "Toorak", "stop_id": "1194"},
    {"key": "20", "name": "Hawksburn", "stop_id": "1089"},
    {"key": "21", "name": "South Yarra", "stop_id": "1180"},
    {"key": "22", "name": "Richmond", "stop_id": "1162"},
    {"key": "23", "name": "Parliament", "stop_id": "1155"},
    {"key": "24", "name": "Melbourne Central", "stop_id": "1120"},
    {"key": "25", "name": "Flagstaff", "stop_id": "1068"},
    {"key": "26", "name": "Southern Cross", "stop_id": "1181"},
    {"key": "27", "name": "Flinders Street", "stop_id": "1071"}
];
const fl = [
    {"key": "0", "name": "Flemington Racecourse", "stop_id": "1070"},
    {"key": "1", "name": "North Melbourne", "stop_id": "1144"},
    {"key": "2", "name": "Southern Cross", "stop_id": "1181"},
    {"key": "3", "name": "Flinders Street", "stop_id": "1071"}
];
const fr = [
    {"key": "0", "name": "Frankston", "stop_id": "1073"},
    {"key": "1", "name": "Kananook", "stop_id": "1106"},
    {"key": "2", "name": "Seaford", "stop_id": "1174"},
    {"key": "3", "name": "Carrum", "stop_id": "1035"},
    {"key": "4", "name": "Bonbeach", "stop_id": "1024"},
    {"key": "5", "name": "Chelsea", "stop_id": "1038"},
    {"key": "6", "name": "Edithvale", "stop_id": "1060"},
    {"key": "7", "name": "Aspendale", "stop_id": "1011"},
    {"key": "8", "name": "Mordialloc", "stop_id": "1134"},
    {"key": "9", "name": "Parkdale", "stop_id": "1154"},
    {"key": "10", "name": "Mentone", "stop_id": "1122"},
    {"key": "11", "name": "Cheltenham", "stop_id": "1039"},
    {"key": "12", "name": "Highett", "stop_id": "1095"},
    {"key": "13", "name": "Moorabbin", "stop_id": "1132"},
    {"key": "14", "name": "Patterson", "stop_id": "1157"},
    {"key": "15", "name": "Bentleigh", "stop_id": "1020"},
    {"key": "16", "name": "McKinnon", "stop_id": "1119"},
    {"key": "17", "name": "Ormond", "stop_id": "1152"},
    {"key": "18", "name": "Glenhuntly", "stop_id": "1081"},
    {"key": "19", "name": "Caulfield", "stop_id": "1036"},
    {"key": "20", "name": "Malvern", "stop_id": "1118"},
    {"key": "21", "name": "Armadale", "stop_id": "1008"},
    {"key": "22", "name": "Toorak", "stop_id": "1194"},
    {"key": "23", "name": "Hawksburn", "stop_id": "1089"},
    {"key": "24", "name": "South Yarra", "stop_id": "1180"},
    {"key": "25", "name": "Richmond", "stop_id": "1162"},
    {"key": "26", "name": "Parliament", "stop_id": "1155"},
    {"key": "27", "name": "Melbourne Central", "stop_id": "1120"},
    {"key": "28", "name": "Flagstaff", "stop_id": "1068"},
    {"key": "29", "name": "Southern Cross", "stop_id": "1181"},
    {"key": "30", "name": "Flinders Street", "stop_id": "1071"}
];
const hb2 = [
    {"key": "0", "name": "Hurstbridge", "stop_id": "1100"},
    {"key": "1", "name": "Wattle Glen", "stop_id": "1204"},
    {"key": "2", "name": "Diamond Creek", "stop_id": "1054"},
    {"key": "3", "name": "Eltham", "stop_id": "1062"},
    {"key": "4", "name": "Montmorency", "stop_id": "1130"},
    {"key": "5", "name": "Greensborough", "stop_id": "1084"},
    {"key": "6", "name": "Watsonia", "stop_id": "1203"},
    {"key": "7", "name": "Macleod", "stop_id": "1117"},
    {"key": "8", "name": "Rosanna", "stop_id": "1168"},
    {"key": "9", "name": "Heidelberg", "stop_id": "1093"},
    {"key": "10", "name": "Eaglemont", "stop_id": "1056"},
    {"key": "11", "name": "Ivanhoe", "stop_id": "1101"},
    {"key": "12", "name": "Darebin", "stop_id": "1050"},
    {"key": "13", "name": "Alphington", "stop_id": "1004"},
    {"key": "14", "name": "Fairfield", "stop_id": "1065"},
    {"key": "15", "name": "Dennis", "stop_id": "1053"},
    {"key": "16", "name": "Westgarth", "stop_id": "1209"},
    {"key": "17", "name": "Clifton Hill", "stop_id": "1041"},
    {"key": "18", "name": "Victoria Park", "stop_id": "1201"},
    {"key": "19", "name": "Collingwood", "stop_id": "1043"},
    {"key": "20", "name": "North Richmond", "stop_id": "1145"},
    {"key": "21", "name": "West Richmond", "stop_id": "1207"},
    {"key": "22", "name": "Jolimont-MCG", "stop_id": "1104"},
    {"key": "23", "name": "Parliament", "stop_id": "1155"},
    {"key": "24", "name": "Melbourne Central", "stop_id": "1120"},
    {"key": "25", "name": "Flagstaff", "stop_id": "1068"},
    {"key": "26", "name": "Southern Cross", "stop_id": "1181"},
    {"key": "27", "name": "Flinders Street", "stop_id": "1071"}
];
const hb = [
    {"key": "0", "name": "Hurstbridge", "stop_id": "1100"},
    {"key": "1", "name": "Wattle Glen", "stop_id": "1204"},
    {"key": "3", "name": "Diamond Creek", "stop_id": "1054"},
    {"key": "4", "name": "Eltham", "stop_id": "1062"},
    {"key": "6", "name": "Montmorency", "stop_id": "1130"},
    {"key": "7", "name": "Greensborough", "stop_id": "1084"},
    {"key": "8", "name": "Watsonia", "stop_id": "1203"},
    {"key": "9", "name": "Macleod", "stop_id": "1117"},
    {"key": "10", "name": "Rosanna", "stop_id": "1168"},
    {"key": "11", "name": "Heidelberg", "stop_id": "1093"},
    {"key": "12", "name": "Eaglemont", "stop_id": "1056"},
    {"key": "13", "name": "Ivanhoe", "stop_id": "1101"},
    {"key": "14", "name": "Darebin", "stop_id": "1050"},
    {"key": "15", "name": "Alphington", "stop_id": "1004"},
    {"key": "16", "name": "Fairfield", "stop_id": "1065"},
    {"key": "17", "name": "Dennis", "stop_id": "1053"},
    {"key": "18", "name": "Westgarth", "stop_id": "1209"},
    {"key": "19", "name": "Clifton Hill", "stop_id": "1041"},
    {"key": "20", "name": "Victoria Park", "stop_id": "1201"},
    {"key": "21", "name": "Collingwood", "stop_id": "1043"},
    {"key": "22", "name": "North Richmond", "stop_id": "1145"},
    {"key": "23", "name": "West Richmond", "stop_id": "1207"},
    {"key": "24", "name": "Jolimont-MCG", "stop_id": "1104"},
    {"key": "25", "name": "Flinders Street", "stop_id": "1071"}
];
const pa = [
    {"key": "0", "name": "Pakenham", "stop_id": "1153"},
    {"key": "1", "name": "Cardinia Road", "stop_id": "1223"},
    {"key": "2", "name": "Officer", "stop_id": "1151"},
    {"key": "3", "name": "Beaconsfield", "stop_id": "1017"},
    {"key": "4", "name": "Berwick", "stop_id": "1021"},
    {"key": "5", "name": "Narre Warren", "stop_id": "1139"},
    {"key": "6", "name": "Hallam", "stop_id": "1085"},
    {"key": "7", "name": "Dandenong", "stop_id": "1049"},
    {"key": "8", "name": "Yarraman", "stop_id": "1215"},
    {"key": "9", "name": "Noble Park", "stop_id": "1142"},
    {"key": "10", "name": "Sandown Park", "stop_id": "1172"},
    {"key": "11", "name": "Springvale", "stop_id": "1183"},
    {"key": "12", "name": "Westall", "stop_id": "1208"},
    {"key": "13", "name": "Clayton", "stop_id": "1040"},
    {"key": "14", "name": "Huntingdale", "stop_id": "1099"},
    {"key": "15", "name": "Oakleigh", "stop_id": "1150"},
    {"key": "16", "name": "Hughesdale", "stop_id": "1098"},
    {"key": "17", "name": "Murrumbeena", "stop_id": "1138"},
    {"key": "18", "name": "Carnegie", "stop_id": "1034"},
    {"key": "19", "name": "Caulfield", "stop_id": "1036"},
    {"key": "20", "name": "Malvern", "stop_id": "1118"},
    {"key": "21", "name": "Armadale", "stop_id": "1008"},
    {"key": "22", "name": "Toorak", "stop_id": "1194"},
    {"key": "23", "name": "Hawksburn", "stop_id": "1089"},
    {"key": "24", "name": "South Yarra", "stop_id": "1180"},
    {"key": "25", "name": "Richmond", "stop_id": "1162"},
    {"key": "26", "name": "Parliament", "stop_id": "1155"},
    {"key": "27", "name": "Melbourne Central", "stop_id": "1120"},
    {"key": "28", "name": "Flagstaff", "stop_id": "1068"},
    {"key": "29", "name": "Southern Cross", "stop_id": "1181"},
    {"key": "30", "name": "Flinders Street", "stop_id": "1071"}
];
const sa = [
    {"key": "0", "name": "Sandringham", "stop_id": "1173"},
    {"key": "1", "name": "Hampton", "stop_id": "1086"},
    {"key": "2", "name": "Brighton Beach", "stop_id": "1027"},
    {"key": "3", "name": "Middle Brighton", "stop_id": "1126"},
    {"key": "4", "name": "North Brighton", "stop_id": "1143"},
    {"key": "5", "name": "Gardenvale", "stop_id": "1074"},
    {"key": "6", "name": "Elsternwick", "stop_id": "1061"},
    {"key": "7", "name": "Ripponlea", "stop_id": "1165"},
    {"key": "8", "name": "Balaclava", "stop_id": "1013"},
    {"key": "9", "name": "Windsor", "stop_id": "1214"},
    {"key": "10", "name": "Prahran", "stop_id": "1158"},
    {"key": "11", "name": "South Yarra", "stop_id": "1180"},
    {"key": "12", "name": "Richmond", "stop_id": "1162"},
    {"key": "13", "name": "Flinders Street", "stop_id": "1071"}
];
const me = [
    {"key": "0", "name": "Mernda", "stop_id": "1228"},
    {"key": "1", "name": "Hawkstowe", "stop_id": "1227"},
    {"key": "2", "name": "Middle Gorge", "stop_id": "1226"},
    {"key": "3", "name": "South Morang", "stop_id": "1224"},
    {"key": "4", "name": "Epping", "stop_id": "1063"},
    {"key": "5", "name": "Lalor", "stop_id": "1112"},
    {"key": "6", "name": "Thomastown", "stop_id": "1192"},
    {"key": "7", "name": "Keon Park", "stop_id": "1109"},
    {"key": "8", "name": "Ruthven", "stop_id": "1171"},
    {"key": "9", "name": "Reservoir", "stop_id": "1161"},
    {"key": "10", "name": "Regent", "stop_id": "1160"},
    {"key": "11", "name": "Preston", "stop_id": "1159"},
    {"key": "12", "name": "Bell", "stop_id": "1019"},
    {"key": "13", "name": "Thornbury", "stop_id": "1193"},
    {"key": "14", "name": "Croxton", "stop_id": "1047"},
    {"key": "15", "name": "Northcote", "stop_id": "1147"},
    {"key": "16", "name": "Merri", "stop_id": "1125"},
    {"key": "17", "name": "Rushall", "stop_id": "1170"},
    {"key": "18", "name": "Clifton Hill", "stop_id": "1041"},
    {"key": "19", "name": "Victoria Park", "stop_id": "1201"},
    {"key": "20", "name": "Collingwood", "stop_id": "1043"},
    {"key": "21", "name": "North Richmond", "stop_id": "1145"},
    {"key": "22", "name": "West Richmond", "stop_id": "1207"},
    {"key": "23", "name": "Jolimont-MCG", "stop_id": "1104"},
    {"key": "24", "name": "Parliament", "stop_id": "1155"},
    {"key": "25", "name": "Melbourne Central", "stop_id": "1120"},
    {"key": "26", "name": "Flagstaff", "stop_id": "1068"},
    {"key": "27", "name": "Southern Cross", "stop_id": "1181"},
    {"key": "28", "name": "Flinders Street", "stop_id": "1071"}
];
const sp = [
    {"key": "0", "name": "Stony Point", "stop_id": "1185"},
    {"key": "1", "name": "Crib Point", "stop_id": "1046"},
    {"key": "2", "name": "Morradoo", "stop_id": "1136"},
    {"key": "3", "name": "Bittern", "stop_id": "1022"},
    {"key": "4", "name": "Hastings", "stop_id": "1088"},
    {"key": "5", "name": "Tyabb", "stop_id": "1197"},
    {"key": "6", "name": "Somerville", "stop_id": "1178"},
    {"key": "7", "name": "Baxter", "stop_id": "1015"},
    {"key": "8", "name": "Leawarra", "stop_id": "1114"},
    {"key": "9", "name": "Frankston", "stop_id": "1073"}
];
const su = [
    {"key": "0", "name": "Sunbury", "stop_id": "1187"},
    {"key": "1", "name": "Diggers Rest", "stop_id": "1055"},
    {"key": "2", "name": "Watergardens", "stop_id": "1202"},
    {"key": "3", "name": "Keilor Plains", "stop_id": "1107"},
    {"key": "4", "name": "St Albans", "stop_id": "1184"},
    {"key": "5", "name": "Ginifer", "stop_id": "1076"},
    {"key": "6", "name": "Albion", "stop_id": "1003"},
    {"key": "7", "name": "Sunshine", "stop_id": "1218"},
    {"key": "8", "name": "Tottenham", "stop_id": "1196"},
    {"key": "9", "name": "West Footscray", "stop_id": "1206"},
    {"key": "10", "name": "Middle Footscray", "stop_id": "1127"},
    {"key": "11", "name": "Footscray", "stop_id": "1072"},
    {"key": "12", "name": "North Melbourne", "stop_id": "1144"},
    {"key": "13", "name": "Flagstaff", "stop_id": "1068"},
    {"key": "14", "name": "Melbourne Central", "stop_id": "1120"},
    {"key": "15", "name": "Parliament", "stop_id": "1155"},
    {"key": "16", "name": "Southern Cross", "stop_id": "1181"},
    {"key": "17", "name": "Flinders Street", "stop_id": "1071"}
];
const uf = [
    {"key": "0", "name": "Upfield", "stop_id": "1198"},
    {"key": "1", "name": "Gowrie", "stop_id": "1083"},
    {"key": "2", "name": "Fawkner", "stop_id": "1066"},
    {"key": "3", "name": "Merlynston", "stop_id": "1124"},
    {"key": "4", "name": "Batman", "stop_id": "1014"},
    {"key": "5", "name": "Coburg", "stop_id": "1042"},
    {"key": "6", "name": "Moreland", "stop_id": "1135"},
    {"key": "7", "name": "Anstey", "stop_id": "1006"},
    {"key": "8", "name": "Brunswick", "stop_id": "1029"},
    {"key": "9", "name": "Jewell", "stop_id": "1103"},
    {"key": "10", "name": "Royal Park", "stop_id": "1169"},
    {"key": "11", "name": "Flemington Bridge", "stop_id": "1069"},
    {"key": "12", "name": "Macaulay", "stop_id": "1116"},
    {"key": "13", "name": "North Melbourne", "stop_id": "1144"},
    {"key": "14", "name": "Flagstaff", "stop_id": "1068"},
    {"key": "15", "name": "Melbourne Central", "stop_id": "1120"},
    {"key": "16", "name": "Parliament", "stop_id": "1155"},
    {"key": "17", "name": "Southern Cross", "stop_id": "1181"},
    {"key": "18", "name": "Flinders Street", "stop_id": "1071"}
];
const we = [
    {"key": "0", "name": "Werribee", "stop_id": "1205"},
    {"key": "1", "name": "Hoppers Crossing", "stop_id": "1097"},
    {"key": "2", "name": "Williams Landing", "stop_id": "1225"},
    {"key": "3", "name": "Aircraft", "stop_id": "1220"},
    {"key": "4", "name": "Laverton", "stop_id": "1113"},
    {"key": "5", "name": "Westona", "stop_id": "1210"},
    {"key": "7", "name": "Altona", "stop_id": "1005"},
    {"key": "8", "name": "Seaholme", "stop_id": "1175"},
    {"key": "9", "name": "Newport", "stop_id": "1141"},
    {"key": "10", "name": "Spotswood", "stop_id": "1182"},
    {"key": "11", "name": "Yarraville", "stop_id": "1216"},
    {"key": "12", "name": "Seddon", "stop_id": "1176"},
    {"key": "13", "name": "Footscray", "stop_id": "1072"},
    {"key": "14", "name": "South Kensington", "stop_id": "1179"},
    {"key": "15", "name": "North Melbourne", "stop_id": "1144"},
    {"key": "16", "name": "Flagstaff", "stop_id": "1068"},
    {"key": "17", "name": "Melbourne Central", "stop_id": "1120"},
    {"key": "18", "name": "Parliament", "stop_id": "1155"},
    {"key": "19", "name": "Southern Cross", "stop_id": "1181"},
    {"key": "20", "name": "Flinders Street ARR", "stop_id": "1071"}
];
const wi = [
    {"key": "0", "name": "Williamstown", "stop_id": "1211"},
    {"key": "1", "name": "Williamstown Beach", "stop_id": "1212"},
    {"key": "2", "name": "North Williamstown", "stop_id": "1146"},
    {"key": "3", "name": "Newport", "stop_id": "1141"},
    {"key": "4", "name": "Spotswood", "stop_id": "1182"},
    {"key": "5", "name": "Yarraville", "stop_id": "1216"},
    {"key": "6", "name": "Seddon", "stop_id": "1176"},
    {"key": "7", "name": "Footscray", "stop_id": "1072"},
    {"key": "8", "name": "South Kensington", "stop_id": "1179"},
    {"key": "9", "name": "North Melbourne", "stop_id": "1144"},
    {"key": "10", "name": "Flagstaff", "stop_id": "1068"},
    {"key": "11", "name": "Melbourne Central", "stop_id": "1120"},
    {"key": "12", "name": "Parliament", "stop_id": "1155"},
    {"key": "13", "name": "Southern Cross", "stop_id": "1181"},
    {"key": "14", "name": "Flinders Street", "stop_id": "1071"}
];
 
const Lines = [
    {"name": "Glen Waverley", "data": gw, "id": 7},
    {"name": "Lilydale", "data": ld, "id": 9},
    {"name": "Belgrave", "data": bg, "id": 2},
    {"name": "Alamein", "data": al, "id": 1},
    {"name": "Craigieburn", "data": cr, "id": 3},
    {"name": "Cranbourne", "data": cb, "id": 4},
    {"name": "Flemington Racecourse", "data": fl},
    {"name": "Frankston", "data": fr, "id": 6},
    {"name": "Hurstbridge", "data": hb, "id": 8},
    {"name": "Pakenham", "data": pa, "id": 11},
    {"name": "Sandringham", "data": sa, "id": 12},
    {"name": "Mernda", "data": me, "id": 5},
    {"name": "Stony Point", "data": sp, "id": 13},
    {"name": "Sunbury", "data": su, "id": 14},
    {"name": "Upfield", "data": uf, "id": 15},
    {"name": "Werribee", "data": we, "id": 16},
    {"name": "Williamstown", "data": wi, "id": 17}
];

function getLine(id: number) {
    for (let i = 0; i < Lines.length; i++) {
        const line = Lines[i];
        if (line.id === id) return line;
    }
    return {"name": "Unknown line", "data": [], "id": 0};
}