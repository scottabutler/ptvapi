import { getQueryVariable, updateQueryVariable } from "./browserHelpers.js";
import { DateTimeHelpers } from "./dateTimeHelpers.js";
import { PTV_v2 } from "./ptv.js";
const _loadingElementId = "loading";
const _refreshTimeElementId = "refresh-time";
const _errorElementId = "error";
const _stopElementId = "stop";
const _followingDeparturesElementId = "following-departures";
const _nextStopsListElementId = "next-stops-list";
const _platformSelectElementId = "platform-select";
const _disruptionListElementId = "disruption-list";
const _nextDestDescriptionElementId = "next-dest-description";
const _runDescriptionElementId = "run-description";
let _stopsOnRouteCache = {
    date: new Date().setDate(new Date().getDate() - 1),
    data: new Map(),
};
let _devId = "";
let _secret = "";
const _useMockData = getQueryVariable("mode") == "mock";
const _onRequestStart = (description) => {
    document.getElementById(_loadingElementId).innerHTML = `Loading ${description}`;
};
let _PTV_v2 = new PTV_v2(_useMockData, _onRequestStart);
const PTV = {
    run: function (params) {
        const credentials = {
            id: params.dev_id,
            secret: params.dev_secret,
        };
        let validateDeparturesResponse = function (departuresResponse) {
            return new Promise((resolve, reject) => {
                if (departuresResponse == null ||
                    departuresResponse.departures == null ||
                    departuresResponse.departures.length == 0) {
                    reject("Departures error: No departures found.");
                }
                if (departuresResponse.departures[0].route_id == undefined) {
                    reject("Departures error: No routeId returned for next departure.");
                }
                if (departuresResponse.departures[0].run_id == undefined) {
                    reject("Departures error: No runId returned for next departure.");
                }
                if (departuresResponse.runs == undefined) {
                    reject("Departures error: Departure response contained no runs.");
                }
                return resolve(departuresResponse);
            });
        };
        let validateStopsOnRouteResponse = function (resolvedPromises) {
            return new Promise((resolve, reject) => {
                const stopsOnRouteResponse = resolvedPromises[0];
                if (stopsOnRouteResponse == undefined) {
                    reject("Stops on route cache is undefined.");
                }
                return resolve(resolvedPromises);
            });
        };
        let validateStoppingPatternResponse = function (resolvedPromises) {
            return new Promise((resolve, reject) => {
                const stoppingPatternResponse = resolvedPromises[1];
                if (stoppingPatternResponse == undefined) {
                    reject("Stopping pattern response is undefined.");
                }
                if (stoppingPatternResponse.departures == undefined) {
                    reject("Stopping pattern response contains no departures.");
                }
                return resolve(resolvedPromises);
            });
        };
        let validateDisruptionsResponse = function (resolvedPromises) {
            return new Promise((resolve, reject) => {
                const disruptionsResponse = resolvedPromises[2];
                if (disruptionsResponse == undefined) {
                    reject("Disruptions response is undefined.");
                }
                return resolve(resolvedPromises);
            });
        };
        let updateStopsOnRouteCache = function (stopsOnRouteResponse, cache, cacheKey) {
            return new Promise((resolve) => {
                if (cache.data != undefined &&
                    !cache.data.get(cacheKey) &&
                    stopsOnRouteResponse != undefined) {
                    console.log("Adding 'stops on route' data to the cache");
                    cache.data.set(cacheKey, stopsOnRouteResponse);
                    if (BrowserHelpers.hasLocalStorage() && !_useMockData) {
                        const cacheToSave = {
                            date: cache.date,
                            data: [...cache.data],
                        };
                        console.log("Saving cache to local storage");
                        localStorage.setItem(PTV.localStorageCacheKey, JSON.stringify(cacheToSave));
                    }
                }
                return resolve(cache);
            });
        };
        const routeType = params.route_type;
        const stopId = params.stop_id;
        const platformNumber = params.platform_number;
        let departuresPromise = _PTV_v2.requestDepartures(routeType, stopId, platformNumber, credentials).then(validateDeparturesResponse);
        let prepareStopsOnRouteCachePromise = this.prepareStopsOnRouteCache(_stopsOnRouteCache);
        Promise.all([departuresPromise, prepareStopsOnRouteCachePromise])
            .then((resolvedPromises) => {
            const departuresResponse = resolvedPromises[0];
            const departures = departuresResponse.departures;
            const runs = departuresResponse.runs;
            const routeId = departures[0].route_id;
            const runId = departures[0].run_id;
            const cacheKey = _PTV_v2.getStopsOnRouteCacheKey(routeType, routeId);
            let stopsOnRoutePromise = _PTV_v2.requestStopsOnRoute(routeType, routeId, credentials, resolvedPromises[1])
                .then((stopsOnRouteResponse) => updateStopsOnRouteCache(stopsOnRouteResponse, resolvedPromises[1], cacheKey))
                .then((updatedCache) => (_stopsOnRouteCache = updatedCache));
            let stoppingPatternPromise = _PTV_v2.requestStoppingPattern(routeType, runId, credentials);
            let disruptionsPromise = _PTV_v2.requestDisruptions(routeType, credentials);
            Promise.all([
                stopsOnRoutePromise,
                stoppingPatternPromise,
                disruptionsPromise,
            ])
                .then(validateStopsOnRouteResponse)
                .then(validateStoppingPatternResponse)
                .then(validateDisruptionsResponse)
                .then((resolvedPromises) => {
                const stopsOnRoute = resolvedPromises[0].data.get(cacheKey);
                const stoppingPattern = resolvedPromises[1];
                const disruptions = resolvedPromises[2];
                this.updatePage(stopId, routeId, disruptions.disruptions, departures, runs, stoppingPattern, stopsOnRoute);
            });
        })
            .catch(function (e) {
            document.getElementById(_errorElementId).innerHTML =
                "Error: " + e;
            document.getElementById(_loadingElementId).innerHTML =
                "Error.";
            document.getElementById("realtime").style.display = "none";
            PTV.clearPage();
        });
    },
    prepareStopsOnRouteCache: function (existingCache) {
        return new Promise(function (resolve) {
            if (existingCache != undefined &&
                new Date(existingCache.date).getTime() > new Date().getTime()) {
                console.log("Using existing cache");
                return resolve(existingCache);
            }
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 1);
            const expiryDateNew = expiryDate.getTime();
            const newCache = {
                date: expiryDateNew,
                data: new Map(),
            };
            console.log("Empty cache created with date", new Date(expiryDateNew).toDateString());
            if (BrowserHelpers.hasLocalStorage()) {
                const jsonFromStorage = localStorage.getItem(PTV.localStorageCacheKey);
                let cacheFromStorage = jsonFromStorage != undefined
                    ? JSON.parse(jsonFromStorage)
                    : undefined;
                if (cacheFromStorage != undefined) {
                    if (new Date(cacheFromStorage.date).getTime() <=
                        new Date().getTime()) {
                        console.log("Removing cache due to expired date", new Date(cacheFromStorage.date).toDateString());
                        localStorage.removeItem(PTV.localStorageCacheKey);
                        return resolve(newCache);
                    }
                    cacheFromStorage.data = new Map(cacheFromStorage.data);
                    return resolve(cacheFromStorage);
                }
            }
            else {
            }
            return resolve(newCache);
        });
    },
    localStorageCacheKey: "PTVAPI.stopsOnRouteCache",
    clearPage: function () {
        var _a;
        debug("clearPage");
        const elementsToClear = ((_a = document.getElementsByClassName("clearable")) !== null && _a !== void 0 ? _a : []);
        for (let i = 0; i < elementsToClear.length; i++) {
            elementsToClear[i].innerHTML = "";
        }
        clearStoppingPattern();
        clearFollowingDepartures();
        clearDisruptionList();
    },
    getColourForRoute: function (route_id) {
        switch (route_id) {
            case 5:
            case 8:
                return "red";
            case 6:
            case 16:
            case 17:
                return "green";
            case 14:
            case 3:
            case 15:
                return "yellow";
            case 2:
            case 9:
            case 1:
            case 7:
                return "dark-blue";
            case 4:
            case 11:
                return "light-blue";
            case 12:
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
            return "";
        }
        let result = "";
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
    getDisruptionDataForDeparture: function (departure, disruptionsMap) {
        const result = {
            className: "disruption goodservice mr-2",
            items: [],
        };
        if (departure.disruption_ids == undefined)
            return result;
        for (let i = 0; i < departure.disruption_ids.length; i++) {
            const id = departure.disruption_ids[i];
            const data = disruptionsMap.get(id);
            if (!data)
                continue;
            if (!data.display_on_board)
                continue;
            const disruptionType = data.disruption_type != undefined
                ? data.disruption_type.toLowerCase().replace(" ", "")
                : "";
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
                message: data.description,
            });
        }
        return result;
    },
    updatePage: function (stopId, routeId, disruptionsResponse, departures, runs, stoppingPattern, stopsOnRoute) {
        return new Promise(function (resolve, reject) {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
            debug("updatePage");
            document.getElementById(_loadingElementId).innerHTML = "Done.";
            const refresh_date = new Date();
            document.getElementById(_refreshTimeElementId).innerHTML =
                DateTimeHelpers.padSingleDigitWithZero(refresh_date.getHours()) +
                    ":" +
                    DateTimeHelpers.padSingleDigitWithZero(refresh_date.getMinutes()) +
                    ":" +
                    DateTimeHelpers.padSingleDigitWithZero(refresh_date.getSeconds());
            const metroTrainDisruptions = disruptionsResponse.metro_train != undefined
                ? disruptionsResponse.metro_train
                : [];
            const disruptionsMap = PTV.buildDisruptionsMap(metroTrainDisruptions);
            if (departures == null || departures.length == 0) {
                reject("Update page error: No departures found.");
            }
            if (_useMockData) {
                const now = new Date();
                let accumulatedOffset = 0;
                for (let i = 0; i < departures.length; i++) {
                    accumulatedOffset +=
                        (Math.floor(Math.random() * 9) + 1) * 60000;
                    const date = new Date(now.getTime() + accumulatedOffset);
                    departures[i].scheduled_departure_utc = date;
                    departures[i].estimated_departure_utc = date;
                }
            }
            const nextDeparture = departures[0];
            const nextDepartureRouteId = nextDeparture.route_id;
            document.body.setAttribute("data-colour", PTV.getColourForRoute(nextDepartureRouteId));
            document.getElementById(_errorElementId).innerHTML = "";
            let stop_name = "";
            if (stopsOnRoute != undefined && stopsOnRoute.stops != undefined) {
                for (let i = 0; i < stopsOnRoute.stops.length; i++) {
                    if (stopsOnRoute.stops[i].stop_id == stopId) {
                        stop_name = stopsOnRoute.stops[i].stop_name.toString();
                        break;
                    }
                }
            }
            else {
                reject("No stops found for route " + routeId + ".");
            }
            const shortStopName = stop_name.replace(" Station", "");
            document.getElementById(_stopElementId).innerHTML = shortStopName;
            if (nextDeparture.run_id == undefined)
                reject("No runId returned for next departure");
            if (runs == undefined)
                reject("No runs returned for run " + nextDeparture.run_id + ".");
            const nextDepartureName = runs[nextDeparture.run_id].destination_name;
            document.getElementById("next-dest").innerHTML =
                nextDepartureName != undefined
                    ? nextDepartureName
                    : "Unknown destination";
            clearDisruptionList();
            if (nextDeparture.disruption_ids != null) {
                const disruption_data = PTV.getDisruptionDataForDeparture(nextDeparture, disruptionsMap);
                const disruptionElement = document.getElementById("next-dest-disruption");
                disruptionElement.setAttribute("class", "clearable " + disruption_data.className);
                const disruption_list = document.getElementById(_disruptionListElementId);
                const template = "<small><strong>{type}: </strong>{message}</small>";
                const general_disruptions = PTV.getGeneralDisruptions(disruptionsResponse);
                if (general_disruptions && general_disruptions != "") {
                    const item = document.createElement("li");
                    item.innerHTML = template
                        .replace("{type}", "General")
                        .replace("{message}", general_disruptions);
                    disruption_list.appendChild(item);
                }
                for (const d of disruption_data.items) {
                    if (d.type == undefined || d.message == undefined)
                        continue;
                    const item = document.createElement("li");
                    item.innerHTML = template
                        .replace("{type}", d.type.toString())
                        .replace("{message}", d.message.toString());
                    disruption_list.appendChild(item);
                }
            }
            if (nextDeparture.scheduled_departure_utc == undefined)
                reject("No scheduled_departure_utc returned for next departure");
            const time = DateTimeHelpers.formatSingleTime(nextDeparture.scheduled_departure_utc, true);
            document.getElementById("next-time").innerHTML = time;
            let diff = DateTimeHelpers.getDifferenceFromNow(nextDeparture.estimated_departure_utc, nextDeparture.scheduled_departure_utc).toString();
            const diffSec = DateTimeHelpers.getDifferenceFromNowSec(nextDeparture.estimated_departure_utc, nextDeparture.scheduled_departure_utc);
            const isRt = isRealTime(nextDeparture.estimated_departure_utc);
            document.getElementById("realtime").style.display = isRt
                ? "none"
                : "block";
            let minsText = "min" + (isRt ? "" : "*");
            if (diffSec <= 60 && diffSec >= -60) {
                diff = "Now" + (isRt ? "" : "*");
                minsText = "";
            }
            document.getElementById("next-diff").innerHTML =
                diff + " " + minsText;
            document.title =
                diff +
                    " " +
                    minsText +
                    " " +
                    shortStopName +
                    " to " +
                    nextDepartureName;
            clearStoppingPattern();
            if (stopsOnRoute == undefined || stopsOnRoute.stops == undefined) {
                reject("No stops found for route " + routeId + ".");
            }
            const stops = new Map();
            for (let s = 0; s < stopsOnRoute.stops.length; s++) {
                stops.set(stopsOnRoute.stops[s].stop_id, stopsOnRoute.stops[s].stop_name);
            }
            const stopsFromCurrent = [];
            let foundCurrentStop = false;
            let stoppingPatternCount = 0;
            for (let j = 0; j < stoppingPattern.departures.length; j++) {
                const stoppingPatternStopId = stoppingPattern.departures[j].stop_id;
                const isCurrentStop = stoppingPatternStopId == stopId;
                if (isCurrentStop) {
                    stoppingPatternCount =
                        stoppingPattern.departures.length - j;
                    foundCurrentStop = true;
                }
                if (foundCurrentStop) {
                    const name = stops
                        .get(stoppingPatternStopId)
                        .replace(" Station", "");
                    stopsFromCurrent.push({
                        id: stoppingPatternStopId,
                        name: name,
                    });
                }
            }
            if (departures == null || departures.length == 0) {
                reject("No departures found.");
            }
            if (departures[0].route_id == undefined) {
                reject("No routeId returned for departure.");
            }
            const inbound = departures[0].direction_id == 1;
            const fullList = getStoppingPatternWithSkippedStations(stopsFromCurrent, departures[0].route_id, inbound, stopId);
            const desc = getShortStoppingPatternDescription(fullList, inbound, stopId);
            document.getElementById(_nextDestDescriptionElementId).innerText = desc;
            const nextRun = runs[nextDeparture.run_id];
            const directionText = ((_a = nextRun.vehicle_position) === null || _a === void 0 ? void 0 : _a.direction)
                ? ((_b = nextRun.vehicle_position) === null || _b === void 0 ? void 0 : _b.direction) + " "
                : "";
            const runDesc = ((_c = nextRun.vehicle_descriptor) === null || _c === void 0 ? void 0 : _c.description) &&
                ((_d = nextRun.vehicle_descriptor) === null || _d === void 0 ? void 0 : _d.id)
                ? directionText +
                    ((_f = (_e = nextRun.vehicle_descriptor) === null || _e === void 0 ? void 0 : _e.description) !== null && _f !== void 0 ? _f : "") +
                    " (" +
                    ((_h = (_g = nextRun.vehicle_descriptor) === null || _g === void 0 ? void 0 : _g.id) !== null && _h !== void 0 ? _h : "") +
                    ")"
                : "";
            document.getElementById(_runDescriptionElementId).innerText = runDesc;
            const hasCoords = ((_j = nextRun.vehicle_position) === null || _j === void 0 ? void 0 : _j.latitude) &&
                ((_k = nextRun.vehicle_position) === null || _k === void 0 ? void 0 : _k.longitude);
            const coords = hasCoords
                ? ((_l = nextRun.vehicle_position) === null || _l === void 0 ? void 0 : _l.latitude) +
                    "," +
                    ((_m = nextRun.vehicle_position) === null || _m === void 0 ? void 0 : _m.longitude)
                : "";
            const mapLink = document.getElementById("map-link");
            mapLink.style.display = hasCoords ? "inline-block" : "none";
            mapLink.setAttribute("href", hasCoords
                ? "https://www.google.com/maps/search/?api=1&query=" +
                    coords
                : "#");
            mapLink.innerText = "Map";
            fullList.map((x) => {
                addStoppingPatternItem(x.name, x.isSkipped, x.id == stopId);
            });
            const listElement = document.getElementById("next-stops-list");
            if (stoppingPatternCount > 7) {
                if (listElement.className.indexOf("two-columns") == -1) {
                    listElement.className += " two-columns";
                }
            }
            else {
                listElement.className = listElement.className.replace("two-columns", "");
            }
            clearFollowingDepartures();
            for (let i = 1; i < departures.length; i++) {
                const departure = departures[i];
                const runId = departure.run_id;
                if (runId == undefined)
                    reject("No runId returned for departure.");
                if (runs == undefined)
                    reject("No runs returned for departure.");
                const destinationName = runs[runId].destination_name != undefined
                    ? runs[runId].destination_name
                    : "Unknown destination";
                addFollowingDeparture(disruptionsMap, departure, destinationName);
            }
            debug("End updatePage ---");
            resolve();
        });
    },
};
function init() {
    _devId = getQueryVariable("d");
    _secret = getQueryVariable("s");
    const platform_number = getQueryVariable("p");
    const e = document.getElementById(_platformSelectElementId);
    e.value = platform_number;
    if (_useMockData) {
        console.log("Using mock data");
    }
    if (!_useMockData &&
        (_devId == null || _devId == "" || _secret == null || _secret == "")) {
        return;
    }
    updateView();
}
document.addEventListener("DOMContentLoaded", () => {
    const selectElement = document.querySelector("#platform-select");
    if (selectElement) {
        selectElement.addEventListener("change", (_) => {
            updateView();
        });
    }
    const autoRefreshElement = document.querySelector("#auto-refresh");
    if (autoRefreshElement) {
        autoRefreshElement.addEventListener("change", (_) => {
            updateTimer();
        });
    }
    init();
});
function updateView() {
    const loading = document.getElementById(_loadingElementId);
    loading.innerHTML = "Loading";
    document.getElementById(_refreshTimeElementId).innerHTML = "";
    const stop_id = _useMockData ? 1071 : getQueryVariable("stop_id");
    const route_type = _useMockData ? 0 : getQueryVariable("route_type");
    const route_id = _useMockData ? 7 : getQueryVariable("route_id");
    const e = document.getElementById(_platformSelectElementId);
    const platform_number = e.options[e.selectedIndex].value;
    const new_url = window.location.pathname + updateQueryVariable("p", platform_number);
    window.history.replaceState({}, "Platform View", new_url);
    updateTimer();
    const params = {
        route_type: Number(route_type),
        route_id: Number(route_id),
        stop_id: Number(stop_id),
        platform_number: platform_number,
        dev_id: Number(_devId),
        dev_secret: _secret,
    };
    PTV.run(params);
}
let timer;
function updateTimer() {
    clearTimeout(timer);
    const autoRefreshCheckBox = document.getElementById("auto-refresh");
    if (autoRefreshCheckBox.checked) {
        timer = setTimeout(function () {
            updateView();
        }, 30000);
    }
}
function getShortStoppingPatternDescription(stoppingPatternWithSkippedStations, isInbound, currentStopId) {
    let result = "";
    const skipped = [];
    const notSkipped = [];
    stoppingPatternWithSkippedStations.map((x) => {
        if (x.isSkipped == true) {
            skipped.push(x);
        }
        else {
            notSkipped.push(x);
        }
    });
    const notSkippedIds = notSkipped.map((x) => x.id);
    const skipCount = skipped.length;
    const isStoppingAtAnyLoopStation = isStoppingAtAnyCityLoopStation(notSkippedIds);
    const isNotRunningViaLoop = isNotRunningViaCityLoop(notSkippedIds);
    const nextNonLoopStationName = notSkipped.length >= 2 ? notSkipped[1].name : "";
    if (skipCount == 0) {
        result = "Stopping all stations";
    }
    else if (skipCount == 1) {
        result = "All except " + skipped[0].name;
    }
    else {
        result = "Limited express";
    }
    if (isStoppingAtAnyLoopStation) {
        result += " via the City Loop";
    }
    else if (isNotRunningViaLoop &&
        !isInbound &&
        isFlindersSt(currentStopId) &&
        nextNonLoopStationName != "") {
        result += " via " + nextNonLoopStationName;
    }
    return result;
}
function addFollowingDeparture(disruptionsMap, departure, destinationName) {
    const time = departure.scheduled_departure_utc != undefined
        ? DateTimeHelpers.formatSingleTime(departure.scheduled_departure_utc, true)
        : "--:--";
    const diff = departure.scheduled_departure_utc != undefined
        ? DateTimeHelpers.getDifferenceFromNow(departure.estimated_departure_utc, departure.scheduled_departure_utc)
        : "--";
    const disruption_data = PTV.getDisruptionDataForDeparture(departure, disruptionsMap);
    if (diff != "--" && diff >= 60) {
        return;
    }
    const wrapper = document.createElement("div");
    wrapper.setAttribute("class", "row ");
    const timeWrapper = createElementWithContent("div", "col-6 col-md-3 col-lg-2 order-2 order-md-1 ml-4 ml-md-0", "h4", "font-weight-light", time);
    wrapper.appendChild(timeWrapper);
    const disruptionSpan = document.createElement("span");
    disruptionSpan.setAttribute("class", disruption_data.className + " clearable");
    const destWrapper = document.createElement("div");
    destWrapper.setAttribute("class", "col-12 col-md-6 col-lg-8 order-1 order-md-2");
    const destContent = document.createElement("h4");
    destContent.setAttribute("class", "d-inline");
    destContent.innerText = destinationName;
    destWrapper.appendChild(disruptionSpan);
    destWrapper.appendChild(destContent);
    wrapper.appendChild(destWrapper);
    const diffWrapper = createElementWithContent("div", "col-5 col-md-3 col-lg-2 order-3 order-md-3 text-right", "h4", "font-weight-light text-white bg-dark d-inline px-2", diff + " min");
    wrapper.appendChild(diffWrapper);
    const disruption_list = document.createElement("ul");
    const template = "<small><strong>{type}: </strong>{message}</small>";
    for (var d of disruption_data.items) {
        if (d.type == undefined || d.message == undefined)
            continue;
        const item = document.createElement("li");
        item.innerHTML = template
            .replace("{type}", d.type.toString())
            .replace("{message}", d.message.toString());
        disruption_list.appendChild(item);
    }
    if (disruption_data.items.length > 0) {
        const disruptionDetailWrapper = document.createElement("div");
        disruptionDetailWrapper.setAttribute("class", "disruption-message col-12 col-md-9 offset-md-3 col-lg-8 offset-lg-2 order-4");
        disruptionDetailWrapper.appendChild(disruption_list);
        wrapper.appendChild(disruptionDetailWrapper);
    }
    document
        .getElementById(_followingDeparturesElementId)
        .appendChild(wrapper);
}
function getStoppingPatternWithSkippedStations(stopList, lineId, isInbound, currentStopId) {
    const allStops = isInbound
        ? getLine(lineId).data
        : reverseArray(getLine(lineId).data);
    const stopListIds = stopList.map((x) => x.id);
    const stopListNames = new Map();
    stopList.map((x) => stopListNames.set(x.id, x.name));
    let foundCurrentStop = false;
    const allStopsReduced = [];
    for (let i = 0; i < allStops.length; i++) {
        if (!foundCurrentStop && allStops[i].stop_id * 1 == currentStopId)
            foundCurrentStop = true;
        if (foundCurrentStop)
            allStopsReduced.push(allStops[i]);
        if (allStops[i].stop_id * 1 == stopList[stopList.length - 1].id)
            break;
    }
    let res;
    res = allStopsReduced.map((x) => stopListIds.indexOf(x.stop_id * 1) != -1
        ? {
            id: x.stop_id * 1,
            name: stopListNames.get(x.stop_id * 1),
            isSkipped: false,
        }
        : { id: x.stop_id * 1, name: x.name, isSkipped: true });
    if (isNotRunningViaCityLoop(stopListIds)) {
        const results = [];
        res.map((x) => {
            if (!isCityLoopStation(x.id) &&
                !(isSouthernCross(x.id) && x.isSkipped))
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
    wrapper.setAttribute("class", classVal);
    const child = document.createElement(childTag);
    child.setAttribute("class", childClassVal);
    child.textContent = childTextContent;
    wrapper.appendChild(child);
    return wrapper;
}
function addStoppingPatternItem(name, isSkipped, isCurrentStop) {
    const content = document.createElement("span");
    content.setAttribute("class", "px-1" +
        (isCurrentStop ? " active-colour" : "") +
        (isSkipped ? " skipped-colour" : ""));
    content.innerText = name;
    const wrapper = document.createElement("li");
    wrapper.appendChild(content);
    document.getElementById(_nextStopsListElementId).appendChild(wrapper);
}
const _PARLIAMENT_ID = 1155;
const _MELBOURNE_CENTRAL_ID = 1120;
const _FLAGSTAFF_ID = 1068;
const _FLINDERS_ST_ID = 1071;
const _SOUTHERN_CROSS_ID = 1181;
function isCityLoopStation(stopId) {
    return (stopId == _PARLIAMENT_ID ||
        stopId == _MELBOURNE_CENTRAL_ID ||
        stopId == _FLAGSTAFF_ID);
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
    return (stopIds.indexOf(_PARLIAMENT_ID) == -1 &&
        stopIds.indexOf(_MELBOURNE_CENTRAL_ID) == -1 &&
        stopIds.indexOf(_FLAGSTAFF_ID) == -1);
}
function isFlindersSt(stopId) {
    return stopId == _FLINDERS_ST_ID;
}
function isSouthernCross(stopId) {
    return stopId == _SOUTHERN_CROSS_ID;
}
const debug_mode = false;
function debug(message) {
    if (!debug_mode)
        return;
    console.log("DEBUG: " + message);
}
function clearFollowingDepartures() {
    document.getElementById(_followingDeparturesElementId).innerHTML = "";
}
function clearStoppingPattern() {
    document.getElementById(_nextStopsListElementId).innerHTML = "";
}
function clearDisruptionList() {
    document.getElementById(_disruptionListElementId).innerHTML = "";
    document
        .getElementById("next-dest-disruption")
        .setAttribute("class", "clearable");
}
function isRealTime(estimated) {
    return estimated != null && estimated != undefined;
}
class BrowserHelpers {
    static hasLocalStorage() {
        return typeof Storage !== "undefined";
    }
}
function reverseArray(input) {
    if (!input || input == undefined || input.length <= 0)
        return input;
    let result = [];
    for (let i = input.length - 1; i >= 0; i--) {
        result.push(input[i]);
    }
    return result;
}
const gw = [
    { key: "0", name: "Glen Waverley", stop_id: "1078" },
    { key: "1", name: "Syndal", stop_id: "1190" },
    { key: "2", name: "Mount Waverley", stop_id: "1137" },
    { key: "3", name: "Jordanville", stop_id: "1105" },
    { key: "4", name: "Holmesglen", stop_id: "1096" },
    { key: "5", name: "East Malvern", stop_id: "1058" },
    { key: "6", name: "Darling", stop_id: "1051" },
    { key: "7", name: "Glen Iris", stop_id: "1077" },
    { key: "8", name: "Gardiner", stop_id: "1075" },
    { key: "9", name: "Tooronga", stop_id: "1195" },
    { key: "10", name: "Kooyong", stop_id: "1110" },
    { key: "11", name: "Heyington", stop_id: "1094" },
    { key: "12", name: "Burnley", stop_id: "1030" },
    { key: "13", name: "East Richmond", stop_id: "1059" },
    { key: "14", name: "Richmond", stop_id: "1162" },
    { key: "15", name: "Parliament", stop_id: "1155" },
    { key: "16", name: "Melbourne Central", stop_id: "1120" },
    { key: "17", name: "Flagstaff", stop_id: "1068" },
    { key: "18", name: "Southern Cross", stop_id: "1181" },
    { key: "19", name: "Flinders Street", stop_id: "1071" },
];
const ld = [
    { key: "0", name: "Lilydale", stop_id: "1115" },
    { key: "1", name: "Mooroolbark", stop_id: "1133" },
    { key: "2", name: "Croydon", stop_id: "1048" },
    { key: "3", name: "Ringwood East", stop_id: "1164" },
    { key: "4", name: "Ringwood", stop_id: "1163" },
    { key: "5", name: "Heatherdale", stop_id: "1091" },
    { key: "6", name: "Mitcham", stop_id: "1128" },
    { key: "7", name: "Nunawading", stop_id: "1148" },
    { key: "8", name: "Blackburn", stop_id: "1023" },
    { key: "9", name: "Laburnum", stop_id: "1111" },
    { key: "10", name: "Box Hill", stop_id: "1026" },
    { key: "11", name: "Mont Albert", stop_id: "1129" },
    { key: "12", name: "Surrey Hills", stop_id: "1189" },
    { key: "13", name: "Chatham", stop_id: "1037" },
    { key: "14", name: "Canterbury", stop_id: "1033" },
    { key: "15", name: "East Camberwell", stop_id: "1057" },
    { key: "16", name: "Camberwell", stop_id: "1032" },
    { key: "17", name: "Auburn", stop_id: "1012" },
    { key: "18", name: "Glenferrie", stop_id: "1080" },
    { key: "19", name: "Hawthorn", stop_id: "1090" },
    { key: "20", name: "Burnley", stop_id: "1030" },
    { key: "21", name: "East Richmond", stop_id: "1059" },
    { key: "22", name: "Richmond", stop_id: "1162" },
    { key: "23", name: "Parliament", stop_id: "1155" },
    { key: "24", name: "Melbourne Central", stop_id: "1120" },
    { key: "25", name: "Flagstaff", stop_id: "1068" },
    { key: "26", name: "Southern Cross", stop_id: "1181" },
    { key: "27", name: "Flinders Street", stop_id: "1071" },
];
const bg = [
    { key: "0", name: "Belgrave", stop_id: "1018" },
    { key: "1", name: "Tecoma", stop_id: "1191" },
    { key: "2", name: "Upwey", stop_id: "1200" },
    { key: "4", name: "Upper Ferntree Gully", stop_id: "1199" },
    { key: "6", name: "Ferntree Gully", stop_id: "1067" },
    { key: "7", name: "Boronia", stop_id: "1025" },
    { key: "8", name: "Bayswater", stop_id: "1016" },
    { key: "9", name: "Heathmont", stop_id: "1092" },
    { key: "10", name: "Ringwood", stop_id: "1163" },
    { key: "11", name: "Heatherdale", stop_id: "1091" },
    { key: "12", name: "Mitcham", stop_id: "1128" },
    { key: "13", name: "Nunawading", stop_id: "1148" },
    { key: "14", name: "Blackburn", stop_id: "1023" },
    { key: "15", name: "Laburnum", stop_id: "1111" },
    { key: "16", name: "Box Hill", stop_id: "1026" },
    { key: "17", name: "Mont Albert", stop_id: "1129" },
    { key: "18", name: "Surrey Hills", stop_id: "1189" },
    { key: "19", name: "Chatham", stop_id: "1037" },
    { key: "20", name: "Canterbury", stop_id: "1033" },
    { key: "21", name: "East Camberwell", stop_id: "1057" },
    { key: "22", name: "Camberwell", stop_id: "1032" },
    { key: "23", name: "Auburn", stop_id: "1012" },
    { key: "24", name: "Glenferrie", stop_id: "1080" },
    { key: "25", name: "Hawthorn", stop_id: "1090" },
    { key: "26", name: "Burnley", stop_id: "1030" },
    { key: "27", name: "East Richmond", stop_id: "1059" },
    { key: "28", name: "Richmond", stop_id: "1162" },
    { key: "29", name: "Parliament", stop_id: "1155" },
    { key: "30", name: "Melbourne Central", stop_id: "1120" },
    { key: "31", name: "Flagstaff", stop_id: "1068" },
    { key: "32", name: "Southern Cross", stop_id: "1181" },
    { key: "33", name: "Flinders Street", stop_id: "1071" },
];
const al = [
    { key: "0", name: "Alamein", stop_id: "1002" },
    { key: "1", name: "Ashburton", stop_id: "1010" },
    { key: "2", name: "Burwood", stop_id: "1031" },
    { key: "3", name: "Hartwell", stop_id: "1087" },
    { key: "4", name: "Willison", stop_id: "1213" },
    { key: "5", name: "Riversdale", stop_id: "1166" },
    { key: "6", name: "Camberwell", stop_id: "1032" },
    { key: "7", name: "Auburn", stop_id: "1012" },
    { key: "8", name: "Glenferrie", stop_id: "1080" },
    { key: "9", name: "Hawthorn", stop_id: "1090" },
    { key: "10", name: "Burnley", stop_id: "1030" },
    { key: "11", name: "East Richmond", stop_id: "1059" },
    { key: "12", name: "Richmond", stop_id: "1162" },
    { key: "13", name: "Parliament", stop_id: "1155" },
    { key: "14", name: "Melbourne Central", stop_id: "1120" },
    { key: "15", name: "Flagstaff", stop_id: "1068" },
    { key: "16", name: "Southern Cross", stop_id: "1181" },
    { key: "17", name: "Flinders Street", stop_id: "1071" },
];
const cr = [
    { key: "0", name: "Craigieburn", stop_id: "1044" },
    { key: "1", name: "Roxburgh Park", stop_id: "1219" },
    { key: "2", name: "Coolaroo", stop_id: "1221" },
    { key: "3", name: "Broadmeadows", stop_id: "1028" },
    { key: "4", name: "Jacana", stop_id: "1102" },
    { key: "5", name: "Glenroy", stop_id: "1082" },
    { key: "6", name: "Oak Park", stop_id: "1149" },
    { key: "7", name: "Pascoe Vale", stop_id: "1156" },
    { key: "8", name: "Strathmore", stop_id: "1186" },
    { key: "9", name: "Glenbervie", stop_id: "1079" },
    { key: "10", name: "Essendon", stop_id: "1064" },
    { key: "11", name: "Moonee Ponds", stop_id: "1131" },
    { key: "12", name: "Ascot Vale", stop_id: "1009" },
    { key: "13", name: "Newmarket", stop_id: "1140" },
    { key: "14", name: "Kensington", stop_id: "1108" },
    { key: "15", name: "North Melbourne", stop_id: "1144" },
    { key: "16", name: "Flagstaff", stop_id: "1068" },
    { key: "17", name: "Melbourne Central", stop_id: "1120" },
    { key: "18", name: "Parliament", stop_id: "1155" },
    { key: "19", name: "Southern Cross", stop_id: "1181" },
    { key: "20", name: "Flinders Street", stop_id: "1071" },
];
const cb = [
    { key: "0", name: "Cranbourne", stop_id: "1045" },
    { key: "1", name: "Merinda Park", stop_id: "1123" },
    { key: "2", name: "Lynbrook", stop_id: "1222" },
    { key: "3", name: "Dandenong", stop_id: "1049" },
    { key: "5", name: "Yarraman", stop_id: "1215" },
    { key: "6", name: "Noble Park", stop_id: "1142" },
    { key: "7", name: "Sandown Park", stop_id: "1172" },
    { key: "8", name: "Springvale", stop_id: "1183" },
    { key: "9", name: "Westall", stop_id: "1208" },
    { key: "10", name: "Clayton", stop_id: "1040" },
    { key: "11", name: "Huntingdale", stop_id: "1099" },
    { key: "12", name: "Oakleigh", stop_id: "1150" },
    { key: "13", name: "Hughesdale", stop_id: "1098" },
    { key: "14", name: "Murrumbeena", stop_id: "1138" },
    { key: "15", name: "Carnegie", stop_id: "1034" },
    { key: "16", name: "Caulfield", stop_id: "1036" },
    { key: "17", name: "Malvern", stop_id: "1118" },
    { key: "18", name: "Armadale", stop_id: "1008" },
    { key: "19", name: "Toorak", stop_id: "1194" },
    { key: "20", name: "Hawksburn", stop_id: "1089" },
    { key: "21", name: "South Yarra", stop_id: "1180" },
    { key: "22", name: "Richmond", stop_id: "1162" },
    { key: "23", name: "Parliament", stop_id: "1155" },
    { key: "24", name: "Melbourne Central", stop_id: "1120" },
    { key: "25", name: "Flagstaff", stop_id: "1068" },
    { key: "26", name: "Southern Cross", stop_id: "1181" },
    { key: "27", name: "Flinders Street", stop_id: "1071" },
];
const fl = [
    { key: "0", name: "Flemington Racecourse", stop_id: "1070" },
    { key: "1", name: "North Melbourne", stop_id: "1144" },
    { key: "2", name: "Southern Cross", stop_id: "1181" },
    { key: "3", name: "Flinders Street", stop_id: "1071" },
];
const fr = [
    { key: "0", name: "Frankston", stop_id: "1073" },
    { key: "1", name: "Kananook", stop_id: "1106" },
    { key: "2", name: "Seaford", stop_id: "1174" },
    { key: "3", name: "Carrum", stop_id: "1035" },
    { key: "4", name: "Bonbeach", stop_id: "1024" },
    { key: "5", name: "Chelsea", stop_id: "1038" },
    { key: "6", name: "Edithvale", stop_id: "1060" },
    { key: "7", name: "Aspendale", stop_id: "1011" },
    { key: "8", name: "Mordialloc", stop_id: "1134" },
    { key: "9", name: "Parkdale", stop_id: "1154" },
    { key: "10", name: "Mentone", stop_id: "1122" },
    { key: "11", name: "Cheltenham", stop_id: "1039" },
    { key: "12", name: "Highett", stop_id: "1095" },
    { key: "13", name: "Moorabbin", stop_id: "1132" },
    { key: "14", name: "Patterson", stop_id: "1157" },
    { key: "15", name: "Bentleigh", stop_id: "1020" },
    { key: "16", name: "McKinnon", stop_id: "1119" },
    { key: "17", name: "Ormond", stop_id: "1152" },
    { key: "18", name: "Glenhuntly", stop_id: "1081" },
    { key: "19", name: "Caulfield", stop_id: "1036" },
    { key: "20", name: "Malvern", stop_id: "1118" },
    { key: "21", name: "Armadale", stop_id: "1008" },
    { key: "22", name: "Toorak", stop_id: "1194" },
    { key: "23", name: "Hawksburn", stop_id: "1089" },
    { key: "24", name: "South Yarra", stop_id: "1180" },
    { key: "25", name: "Richmond", stop_id: "1162" },
    { key: "26", name: "Parliament", stop_id: "1155" },
    { key: "27", name: "Melbourne Central", stop_id: "1120" },
    { key: "28", name: "Flagstaff", stop_id: "1068" },
    { key: "29", name: "Southern Cross", stop_id: "1181" },
    { key: "30", name: "Flinders Street", stop_id: "1071" },
];
const hb = [
    { key: "0", name: "Hurstbridge", stop_id: "1100" },
    { key: "1", name: "Wattle Glen", stop_id: "1204" },
    { key: "3", name: "Diamond Creek", stop_id: "1054" },
    { key: "4", name: "Eltham", stop_id: "1062" },
    { key: "6", name: "Montmorency", stop_id: "1130" },
    { key: "7", name: "Greensborough", stop_id: "1084" },
    { key: "8", name: "Watsonia", stop_id: "1203" },
    { key: "9", name: "Macleod", stop_id: "1117" },
    { key: "10", name: "Rosanna", stop_id: "1168" },
    { key: "11", name: "Heidelberg", stop_id: "1093" },
    { key: "12", name: "Eaglemont", stop_id: "1056" },
    { key: "13", name: "Ivanhoe", stop_id: "1101" },
    { key: "14", name: "Darebin", stop_id: "1050" },
    { key: "15", name: "Alphington", stop_id: "1004" },
    { key: "16", name: "Fairfield", stop_id: "1065" },
    { key: "17", name: "Dennis", stop_id: "1053" },
    { key: "18", name: "Westgarth", stop_id: "1209" },
    { key: "19", name: "Clifton Hill", stop_id: "1041" },
    { key: "20", name: "Victoria Park", stop_id: "1201" },
    { key: "21", name: "Collingwood", stop_id: "1043" },
    { key: "22", name: "North Richmond", stop_id: "1145" },
    { key: "23", name: "West Richmond", stop_id: "1207" },
    { key: "24", name: "Jolimont-MCG", stop_id: "1104" },
    { key: "25", name: "Flinders Street", stop_id: "1071" },
];
const pa = [
    { key: "0", name: "Pakenham", stop_id: "1153" },
    { key: "1", name: "Cardinia Road", stop_id: "1223" },
    { key: "2", name: "Officer", stop_id: "1151" },
    { key: "3", name: "Beaconsfield", stop_id: "1017" },
    { key: "4", name: "Berwick", stop_id: "1021" },
    { key: "5", name: "Narre Warren", stop_id: "1139" },
    { key: "6", name: "Hallam", stop_id: "1085" },
    { key: "7", name: "Dandenong", stop_id: "1049" },
    { key: "8", name: "Yarraman", stop_id: "1215" },
    { key: "9", name: "Noble Park", stop_id: "1142" },
    { key: "10", name: "Sandown Park", stop_id: "1172" },
    { key: "11", name: "Springvale", stop_id: "1183" },
    { key: "12", name: "Westall", stop_id: "1208" },
    { key: "13", name: "Clayton", stop_id: "1040" },
    { key: "14", name: "Huntingdale", stop_id: "1099" },
    { key: "15", name: "Oakleigh", stop_id: "1150" },
    { key: "16", name: "Hughesdale", stop_id: "1098" },
    { key: "17", name: "Murrumbeena", stop_id: "1138" },
    { key: "18", name: "Carnegie", stop_id: "1034" },
    { key: "19", name: "Caulfield", stop_id: "1036" },
    { key: "20", name: "Malvern", stop_id: "1118" },
    { key: "21", name: "Armadale", stop_id: "1008" },
    { key: "22", name: "Toorak", stop_id: "1194" },
    { key: "23", name: "Hawksburn", stop_id: "1089" },
    { key: "24", name: "South Yarra", stop_id: "1180" },
    { key: "25", name: "Richmond", stop_id: "1162" },
    { key: "26", name: "Parliament", stop_id: "1155" },
    { key: "27", name: "Melbourne Central", stop_id: "1120" },
    { key: "28", name: "Flagstaff", stop_id: "1068" },
    { key: "29", name: "Southern Cross", stop_id: "1181" },
    { key: "30", name: "Flinders Street", stop_id: "1071" },
];
const sa = [
    { key: "0", name: "Sandringham", stop_id: "1173" },
    { key: "1", name: "Hampton", stop_id: "1086" },
    { key: "2", name: "Brighton Beach", stop_id: "1027" },
    { key: "3", name: "Middle Brighton", stop_id: "1126" },
    { key: "4", name: "North Brighton", stop_id: "1143" },
    { key: "5", name: "Gardenvale", stop_id: "1074" },
    { key: "6", name: "Elsternwick", stop_id: "1061" },
    { key: "7", name: "Ripponlea", stop_id: "1165" },
    { key: "8", name: "Balaclava", stop_id: "1013" },
    { key: "9", name: "Windsor", stop_id: "1214" },
    { key: "10", name: "Prahran", stop_id: "1158" },
    { key: "11", name: "South Yarra", stop_id: "1180" },
    { key: "12", name: "Richmond", stop_id: "1162" },
    { key: "13", name: "Flinders Street", stop_id: "1071" },
];
const me = [
    { key: "0", name: "Mernda", stop_id: "1228" },
    { key: "1", name: "Hawkstowe", stop_id: "1227" },
    { key: "2", name: "Middle Gorge", stop_id: "1226" },
    { key: "3", name: "South Morang", stop_id: "1224" },
    { key: "4", name: "Epping", stop_id: "1063" },
    { key: "5", name: "Lalor", stop_id: "1112" },
    { key: "6", name: "Thomastown", stop_id: "1192" },
    { key: "7", name: "Keon Park", stop_id: "1109" },
    { key: "8", name: "Ruthven", stop_id: "1171" },
    { key: "9", name: "Reservoir", stop_id: "1161" },
    { key: "10", name: "Regent", stop_id: "1160" },
    { key: "11", name: "Preston", stop_id: "1159" },
    { key: "12", name: "Bell", stop_id: "1019" },
    { key: "13", name: "Thornbury", stop_id: "1193" },
    { key: "14", name: "Croxton", stop_id: "1047" },
    { key: "15", name: "Northcote", stop_id: "1147" },
    { key: "16", name: "Merri", stop_id: "1125" },
    { key: "17", name: "Rushall", stop_id: "1170" },
    { key: "18", name: "Clifton Hill", stop_id: "1041" },
    { key: "19", name: "Victoria Park", stop_id: "1201" },
    { key: "20", name: "Collingwood", stop_id: "1043" },
    { key: "21", name: "North Richmond", stop_id: "1145" },
    { key: "22", name: "West Richmond", stop_id: "1207" },
    { key: "23", name: "Jolimont-MCG", stop_id: "1104" },
    { key: "24", name: "Parliament", stop_id: "1155" },
    { key: "25", name: "Melbourne Central", stop_id: "1120" },
    { key: "26", name: "Flagstaff", stop_id: "1068" },
    { key: "27", name: "Southern Cross", stop_id: "1181" },
    { key: "28", name: "Flinders Street", stop_id: "1071" },
];
const sp = [
    { key: "0", name: "Stony Point", stop_id: "1185" },
    { key: "1", name: "Crib Point", stop_id: "1046" },
    { key: "2", name: "Morradoo", stop_id: "1136" },
    { key: "3", name: "Bittern", stop_id: "1022" },
    { key: "4", name: "Hastings", stop_id: "1088" },
    { key: "5", name: "Tyabb", stop_id: "1197" },
    { key: "6", name: "Somerville", stop_id: "1178" },
    { key: "7", name: "Baxter", stop_id: "1015" },
    { key: "8", name: "Leawarra", stop_id: "1114" },
    { key: "9", name: "Frankston", stop_id: "1073" },
];
const su = [
    { key: "0", name: "Sunbury", stop_id: "1187" },
    { key: "1", name: "Diggers Rest", stop_id: "1055" },
    { key: "2", name: "Watergardens", stop_id: "1202" },
    { key: "3", name: "Keilor Plains", stop_id: "1107" },
    { key: "4", name: "St Albans", stop_id: "1184" },
    { key: "5", name: "Ginifer", stop_id: "1076" },
    { key: "6", name: "Albion", stop_id: "1003" },
    { key: "7", name: "Sunshine", stop_id: "1218" },
    { key: "8", name: "Tottenham", stop_id: "1196" },
    { key: "9", name: "West Footscray", stop_id: "1206" },
    { key: "10", name: "Middle Footscray", stop_id: "1127" },
    { key: "11", name: "Footscray", stop_id: "1072" },
    { key: "12", name: "North Melbourne", stop_id: "1144" },
    { key: "13", name: "Flagstaff", stop_id: "1068" },
    { key: "14", name: "Melbourne Central", stop_id: "1120" },
    { key: "15", name: "Parliament", stop_id: "1155" },
    { key: "16", name: "Southern Cross", stop_id: "1181" },
    { key: "17", name: "Flinders Street", stop_id: "1071" },
];
const uf = [
    { key: "0", name: "Upfield", stop_id: "1198" },
    { key: "1", name: "Gowrie", stop_id: "1083" },
    { key: "2", name: "Fawkner", stop_id: "1066" },
    { key: "3", name: "Merlynston", stop_id: "1124" },
    { key: "4", name: "Batman", stop_id: "1014" },
    { key: "5", name: "Coburg", stop_id: "1042" },
    { key: "6", name: "Moreland", stop_id: "1135" },
    { key: "7", name: "Anstey", stop_id: "1006" },
    { key: "8", name: "Brunswick", stop_id: "1029" },
    { key: "9", name: "Jewell", stop_id: "1103" },
    { key: "10", name: "Royal Park", stop_id: "1169" },
    { key: "11", name: "Flemington Bridge", stop_id: "1069" },
    { key: "12", name: "Macaulay", stop_id: "1116" },
    { key: "13", name: "North Melbourne", stop_id: "1144" },
    { key: "14", name: "Flagstaff", stop_id: "1068" },
    { key: "15", name: "Melbourne Central", stop_id: "1120" },
    { key: "16", name: "Parliament", stop_id: "1155" },
    { key: "17", name: "Southern Cross", stop_id: "1181" },
    { key: "18", name: "Flinders Street", stop_id: "1071" },
];
const we = [
    { key: "0", name: "Werribee", stop_id: "1205" },
    { key: "1", name: "Hoppers Crossing", stop_id: "1097" },
    { key: "2", name: "Williams Landing", stop_id: "1225" },
    { key: "3", name: "Aircraft", stop_id: "1220" },
    { key: "4", name: "Laverton", stop_id: "1113" },
    { key: "5", name: "Westona", stop_id: "1210" },
    { key: "7", name: "Altona", stop_id: "1005" },
    { key: "8", name: "Seaholme", stop_id: "1175" },
    { key: "9", name: "Newport", stop_id: "1141" },
    { key: "10", name: "Spotswood", stop_id: "1182" },
    { key: "11", name: "Yarraville", stop_id: "1216" },
    { key: "12", name: "Seddon", stop_id: "1176" },
    { key: "13", name: "Footscray", stop_id: "1072" },
    { key: "14", name: "South Kensington", stop_id: "1179" },
    { key: "15", name: "North Melbourne", stop_id: "1144" },
    { key: "16", name: "Flagstaff", stop_id: "1068" },
    { key: "17", name: "Melbourne Central", stop_id: "1120" },
    { key: "18", name: "Parliament", stop_id: "1155" },
    { key: "19", name: "Southern Cross", stop_id: "1181" },
    { key: "20", name: "Flinders Street ARR", stop_id: "1071" },
];
const wi = [
    { key: "0", name: "Williamstown", stop_id: "1211" },
    { key: "1", name: "Williamstown Beach", stop_id: "1212" },
    { key: "2", name: "North Williamstown", stop_id: "1146" },
    { key: "3", name: "Newport", stop_id: "1141" },
    { key: "4", name: "Spotswood", stop_id: "1182" },
    { key: "5", name: "Yarraville", stop_id: "1216" },
    { key: "6", name: "Seddon", stop_id: "1176" },
    { key: "7", name: "Footscray", stop_id: "1072" },
    { key: "8", name: "South Kensington", stop_id: "1179" },
    { key: "9", name: "North Melbourne", stop_id: "1144" },
    { key: "10", name: "Flagstaff", stop_id: "1068" },
    { key: "11", name: "Melbourne Central", stop_id: "1120" },
    { key: "12", name: "Parliament", stop_id: "1155" },
    { key: "13", name: "Southern Cross", stop_id: "1181" },
    { key: "14", name: "Flinders Street", stop_id: "1071" },
];
const Lines = [
    { name: "Glen Waverley", data: gw, id: 7 },
    { name: "Lilydale", data: ld, id: 9 },
    { name: "Belgrave", data: bg, id: 2 },
    { name: "Alamein", data: al, id: 1 },
    { name: "Craigieburn", data: cr, id: 3 },
    { name: "Cranbourne", data: cb, id: 4 },
    { name: "Flemington Racecourse", data: fl },
    { name: "Frankston", data: fr, id: 6 },
    { name: "Hurstbridge", data: hb, id: 8 },
    { name: "Pakenham", data: pa, id: 11 },
    { name: "Sandringham", data: sa, id: 12 },
    { name: "Mernda", data: me, id: 5 },
    { name: "Stony Point", data: sp, id: 13 },
    { name: "Sunbury", data: su, id: 14 },
    { name: "Upfield", data: uf, id: 15 },
    { name: "Werribee", data: we, id: 16 },
    { name: "Williamstown", data: wi, id: 17 },
];
function getLine(id) {
    for (let i = 0; i < Lines.length; i++) {
        const line = Lines[i];
        if (line.id === id)
            return line;
    }
    return { name: "Unknown line", data: [], id: 0 };
}
