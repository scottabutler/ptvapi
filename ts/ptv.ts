
import { DateTimeHelpers } from "./dateTimeHelpers.js";

export class PTV_v2 {
    private _isMockMode: boolean;
    private _baseUrl: string;
    private _proxyUrl: string;

    constructor(isMockMode: boolean) {
        this._isMockMode = isMockMode;
        this._baseUrl = isMockMode ? "" : "http://timetableapi.ptv.vic.gov.au";
        this._proxyUrl = "https://ptvproxy20170416075948.azurewebsites.net/api/proxy?url=";
    }

    async requestDepartures(
        routeType: number,
        stopId: number,
        platformNumber: number,
        credentials: Credentials
    ): Promise<V3DeparturesResponse> {
        const endpoint = this.buildDeparturesEndpoint(
            routeType,
            stopId,
            platformNumber
        ); //TODO
        return await this.sendRequest<V3DeparturesResponse>(
            endpoint,
            credentials
        );
    }

    async requestStopsOnRoute(
        routeType: number,
        routeId: number,
        credentials: Credentials,
        stopsOnRouteCache: StopsOnRouteCache
    ): Promise<V3StopsOnRouteResponse | undefined> {
        const key = this.getStopsOnRouteCacheKey(routeType, routeId);

        if (
            stopsOnRouteCache.data != undefined &&
            stopsOnRouteCache.data.get(key) &&
            this._isMockMode
        ) {
            //TODO date check?
            console.log("Using cached 'stops on route' data");
            return stopsOnRouteCache.data.get(key);
        } else {
            const endpoint = this.buildStopsOnRouteEndpoint(
                routeType,
                routeId
            );
            return await
                this.sendRequest<V3StopsOnRouteResponse>(
                    endpoint,
                    credentials
                );
        }
    }

    async requestDisruptions(
        routeType: number,
        credentials: Credentials
    ): Promise<V3DisruptionsResponse> {
        const endpoint = this.buildDisruptionsEndpoint(routeType);
        return await this.sendRequest<V3DisruptionsResponse>(endpoint, credentials);
    }

    async requestStoppingPattern(
        routeType: number,
        runId: number,
        credentials: Credentials
    ): Promise<V3StoppingPatternResponse> {
        const endpoint = this.buildStoppingPatternEndpoint(routeType, runId);
        return await this.sendRequest<V3StoppingPatternResponse>(
            endpoint,
            credentials
        );
    }

    //Departures
    private buildDeparturesEndpoint(
        routeType: number,
        stopId: number,
        platformNumber: number
    ) {
        const date_utc = DateTimeHelpers.getIsoDate();
        const template =
            "/v3/departures/route_type/{route_type}/stop/{stop_id}" +
            "?max_results=6&date_utc={date_utc}&platform_numbers={platform_number}&expand=stop&expand=Run&expand=VehiclePosition&expand=VehicleDescriptor";

        const endpoint = template
            .replace("{route_type}", routeType.toString())
            .replace("{stop_id}", stopId.toString())
            .replace("{platform_number}", platformNumber.toString())
            .replace("{date_utc}", date_utc);
        return this._isMockMode ? "mocks/departures.json" : endpoint;
    }

    //Stops on route
    private buildStopsOnRouteEndpoint(routeType: number, routeId: number) {
        const dateUtc = DateTimeHelpers.getIsoDate();
        const template =
            "/v3/stops/route/{route_id}/route_type/{route_type}" +
            "?date_utc={date_utc}";
        const endpoint = template
            .replace("{route_type}", routeType.toString())
            .replace("{route_id}", routeId.toString())
            .replace("{date_utc}", dateUtc);
        return this._isMockMode ? "mocks/stopsOnRoute.json" : endpoint;
    }

    //Stopping pattern
    private buildStoppingPatternEndpoint(routeType: number, runId: number) {
        const date_utc = DateTimeHelpers.getIsoDate();
        const template =
            "/v3/pattern/run/{run_id}/route_type/{route_type}" +
            "?date_utc={date_utc}";
        const endpoint = template
            .replace("{route_type}", routeType.toString())
            .replace("{run_id}", runId.toString())
            .replace("{date_utc}", date_utc);
        return this._isMockMode ? "mocks/stoppingPattern.json" : endpoint;
    }

    //Disruptions
    private buildDisruptionsEndpoint(routeType: number) {
        const template =
            "/v3/disruptions?route_types={route_type}&disruption_status={disruption_status}";
        const endpoint = template
            .replace("{route_type}", routeType.toString())
            .replace("{disruption_status}", "current");
        return this._isMockMode ? "mocks/disruptions.json" : endpoint;
    }

    // TODO make private
    getStopsOnRouteCacheKey(routeType: number, routeId: number): string {
        return routeType + "_" + routeId;
    }

    private sendRequest<TResponse>(
        endpoint: string,
        credentials: Credentials
    ): Promise<TResponse> {
        // TODO - move out
        //document.getElementById(_loadingElementId)!.innerHTML += ".";

        if (this._isMockMode) {
            return this.fetchTyped<TResponse>(endpoint);
        }

        const qs = endpoint.indexOf("?") == -1 ? "?" : "&";
        const endpointWithCredentials =
            endpoint.indexOf("devId=") == -1
                ? endpoint + qs + "devid=" + credentials.id
                : endpoint;
        const sig = this.generateSignature(
            endpointWithCredentials,
            credentials.secret
        );
        const urlWithSignature =
            this._baseUrl + endpointWithCredentials + "&signature=" + sig;
        const url = this._proxyUrl + encodeURIComponent(urlWithSignature);

        const result: Promise<TResponse> = this.fetchTyped<TResponse>(url);
        return result;
    }

    private generateSignature(request: string, secret: string): string {
        const hash: string = CryptoJS.HmacSHA1(request, secret);
        return hash;
    }

    private async fetchTyped<T>(request: RequestInfo): Promise<T> {
        const response = await fetch(request);
        const body = await response.json();
        return body;
    }
}