var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { DateTimeHelpers } from "./dateTimeHelpers.js";
export class PTV_v2 {
    constructor(isMockMode) {
        this._isMockMode = isMockMode;
        this._baseUrl = isMockMode ? "" : "http://timetableapi.ptv.vic.gov.au";
        this._proxyUrl = "https://ptvproxy20170416075948.azurewebsites.net/api/proxy?url=";
    }
    requestDepartures(routeType, stopId, platformNumber, credentials) {
        return __awaiter(this, void 0, void 0, function* () {
            const endpoint = this.buildDeparturesEndpoint(routeType, stopId, platformNumber);
            return yield this.sendRequest(endpoint, credentials);
        });
    }
    requestStopsOnRoute(routeType, routeId, credentials, stopsOnRouteCache) {
        return __awaiter(this, void 0, void 0, function* () {
            const key = this.getStopsOnRouteCacheKey(routeType, routeId);
            if (stopsOnRouteCache.data != undefined &&
                stopsOnRouteCache.data.get(key) &&
                this._isMockMode) {
                console.log("Using cached 'stops on route' data");
                return stopsOnRouteCache.data.get(key);
            }
            else {
                const endpoint = this.buildStopsOnRouteEndpoint(routeType, routeId);
                return yield this.sendRequest(endpoint, credentials);
            }
        });
    }
    requestDisruptions(routeType, credentials) {
        return __awaiter(this, void 0, void 0, function* () {
            const endpoint = this.buildDisruptionsEndpoint(routeType);
            return yield this.sendRequest(endpoint, credentials);
        });
    }
    requestStoppingPattern(routeType, runId, credentials) {
        return __awaiter(this, void 0, void 0, function* () {
            const endpoint = this.buildStoppingPatternEndpoint(routeType, runId);
            return yield this.sendRequest(endpoint, credentials);
        });
    }
    buildDeparturesEndpoint(routeType, stopId, platformNumber) {
        const date_utc = DateTimeHelpers.getIsoDate();
        const template = "/v3/departures/route_type/{route_type}/stop/{stop_id}" +
            "?max_results=6&date_utc={date_utc}&platform_numbers={platform_number}&expand=stop&expand=Run&expand=VehiclePosition&expand=VehicleDescriptor";
        const endpoint = template
            .replace("{route_type}", routeType.toString())
            .replace("{stop_id}", stopId.toString())
            .replace("{platform_number}", platformNumber.toString())
            .replace("{date_utc}", date_utc);
        return this._isMockMode ? "mocks/departures.json" : endpoint;
    }
    buildStopsOnRouteEndpoint(routeType, routeId) {
        const dateUtc = DateTimeHelpers.getIsoDate();
        const template = "/v3/stops/route/{route_id}/route_type/{route_type}" +
            "?date_utc={date_utc}";
        const endpoint = template
            .replace("{route_type}", routeType.toString())
            .replace("{route_id}", routeId.toString())
            .replace("{date_utc}", dateUtc);
        return this._isMockMode ? "mocks/stopsOnRoute.json" : endpoint;
    }
    buildStoppingPatternEndpoint(routeType, runId) {
        const date_utc = DateTimeHelpers.getIsoDate();
        const template = "/v3/pattern/run/{run_id}/route_type/{route_type}" +
            "?date_utc={date_utc}";
        const endpoint = template
            .replace("{route_type}", routeType.toString())
            .replace("{run_id}", runId.toString())
            .replace("{date_utc}", date_utc);
        return this._isMockMode ? "mocks/stoppingPattern.json" : endpoint;
    }
    buildDisruptionsEndpoint(routeType) {
        const template = "/v3/disruptions?route_types={route_type}&disruption_status={disruption_status}";
        const endpoint = template
            .replace("{route_type}", routeType.toString())
            .replace("{disruption_status}", "current");
        return this._isMockMode ? "mocks/disruptions.json" : endpoint;
    }
    getStopsOnRouteCacheKey(routeType, routeId) {
        return routeType + "_" + routeId;
    }
    sendRequest(endpoint, credentials) {
        if (this._isMockMode) {
            return this.fetchTyped(endpoint);
        }
        const qs = endpoint.indexOf("?") == -1 ? "?" : "&";
        const endpointWithCredentials = endpoint.indexOf("devId=") == -1
            ? endpoint + qs + "devid=" + credentials.id
            : endpoint;
        const sig = this.generateSignature(endpointWithCredentials, credentials.secret);
        const urlWithSignature = this._baseUrl + endpointWithCredentials + "&signature=" + sig;
        const url = this._proxyUrl + encodeURIComponent(urlWithSignature);
        const result = this.fetchTyped(url);
        return result;
    }
    generateSignature(request, secret) {
        const hash = CryptoJS.HmacSHA1(request, secret);
        return hash;
    }
    fetchTyped(request) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield fetch(request);
            const body = yield response.json();
            return body;
        });
    }
}
