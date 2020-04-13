//namespace PtvTypes {
    declare namespace CryptoJS {
        function HmacSHA1(a: string, b: string): string;
    }

    interface Credentials {
        id: number,
        secret: string
    }

    interface IncompleteState {
        data: any,
        departures: Array<V3Departure> | undefined,
        runs: RunCollection | undefined,
        pattern: any | undefined,
        stopsOnRoute: V3StopsOnRouteResponse | undefined,
        //disruptions: Map<number, V3Disruption> | undefined
    }

    interface State {
        data: any,
        departures: Array<V3Departure>,
        runs: RunCollection,
        pattern: any, //TODO
        stopsOnRoute: V3StopsOnRouteResponse,
        disruptions: Map<number, V3Disruption>
    }

    interface RunCollection {
        [key: string]: V3Run
    }

    interface RequestResult {
        state: IncompleteState,
        credentials: Credentials
    }

    interface StartParams {
        route_type: number,
        route_id: number,
        stop_id: number,
        platform_number: number,
        dev_id: number,
        dev_secret: string
    }

    interface DisruptionsForDeparture {
        className: string,
        items: DepartureDisruption[]
    }

    interface DepartureDisruption {
        type: string | undefined,
        message: string | undefined
    }

    interface StopsOnRouteCache {
        date: number,
        data: Map<string, V3StopsOnRouteResponse>
    }

    /*interface Departure {   
        stop_id: number,
        route_id: number,
        run_id: number,
        direction_id: number,
        disruption_ids: number[],
        scheduled_departure_utc: string,
        estimated_departure_utc: string,
        at_platform: boolean,
        platform_number: string,
        flags: string,
        departure_sequence: number
    }

    interface DeparturesResponse {
        departures: Departure[]
    }*/

    interface V3StoppingPatternResponse {
        /**
        * Disruption information applicable to relevant routes or stops
        */
        'disruptions'?: Array<V3Disruption>;
        /**
        * Timetabled and real-time service departures
        */
        'departures'?: Array<V3Departure>;
        /**
        * A train station, tram stop, bus stop, regional coach stop or Night Bus stop
        */
        'stops'?: { [key: string]: V3ResultStop; };
        /**
        * Train lines, tram routes, bus routes, regional coach routes, Night Bus routes
        */
        'routes'?: { [key: string]: V3Route; };
        /**
        * Individual trips/services of a route
        */
        'runs'?: { [key: string]: V3Run; };
        /**
        * Directions of travel of route
        */
        'directions'?: { [key: string]: V3Direction; };
        /**
        * API Status / Metadata
        */
        'status'?: V3Status;
    }

    interface V3StopOnRoute {
        /**
        * Disruption information identifier(s)
        */
        'disruption_ids'?: Array<number>;
        /**
        * suburb of stop
        */
        'stop_suburb'?: string;
        /**
        * Name of stop
        */
        'stop_name'?: string;
        /**
        * Stop identifier
        */
        'stop_id'?: number;
        /**
        * Transport mode identifier
        */
        'route_type'?: number;
        /**
        * Geographic coordinate of latitude at stop
        */
        'stop_latitude'?: number;
        /**
        * Geographic coordinate of longitude at stop
        */
        'stop_longitude'?: number;
        /**
        * Sequence of the stop on the route/run; return 0 when route_id or run_id not specified. Order ascendingly by this field (when non zero) to get physical order (earliest first) of stops on the route_id/run_id.
        */
        'stop_sequence'?: number;
    }

    interface V3StopsOnRouteResponse {
        /**
        * Train stations, tram stops, bus stops, regional coach stops or Night Bus stops
        */
        'stops'?: Array<V3StopOnRoute>;
        /**
        * Disruption information applicable to relevant routes or stops
        */
        'disruptions'?: { [key: string]: V3Disruption; };
        /**
        * API Status / Metadata
        */
        'status'?: V3Status;
    }

    interface V3DeparturesResponse {
        /**
        * Timetabled and real-time service departures
        */
        'departures'?: Array<V3Departure>;
        /**
        * A train station, tram stop, bus stop, regional coach stop or Night Bus stop
        */
        'stops'?: { [key: string]: V3ResultStop; };
        /**
        * Train lines, tram routes, bus routes, regional coach routes, Night Bus routes
        */
        'routes'?: { [key: string]: V3Route; };
        /**
        * Individual trips/services of a route
        */
        'runs'?: { [key: string]: V3Run; };
        /**
        * Directions of travel of route
        */
        'directions'?: { [key: string]: V3Direction; };
        /**
        * Disruption information applicable to relevant routes or stops
        */
        'disruptions'?: { [key: string]: V3Disruption; };
        /**
        * API Status / Metadata
        */
        'status'?: V3Status;
    }

    interface V3Direction {
        /**
        * Direction of travel identifier
        */
        'direction_id'?: number;
        /**
        * Name of direction of travel
        */
        'direction_name'?: string;
        /**
        * Route identifier
        */
        'route_id'?: number;
        /**
        * Transport mode identifier
        */
        'route_type'?: number;
    }

    interface V3Disruptions {
        /**
        * Subset of disruption information applicable to multiple route_types
        */
        'general'?: Array<V3Disruption>;
        /**
        * Subset of disruption information applicable to metropolitan train
        */
        'metro_train'?: Array<V3Disruption>;
        /**
        * Subset of disruption information applicable to metropolitan tram
        */
        'metro_tram'?: Array<V3Disruption>;
        /**
        * Subset of disruption information applicable to metropolitan bus
        */
        'metro_bus'?: Array<V3Disruption>;
        /**
        * Subset of disruption information applicable to V/Line train
        */
        'regional_train'?: Array<V3Disruption>;
        /**
        * Subset of disruption information applicable to V/Line coach
        */
        'regional_coach'?: Array<V3Disruption>;
        /**
        * Subset of disruption information applicable to regional bus
        */
        'regional_bus'?: Array<V3Disruption>;
        /**
        * Subset of disruption information applicable to school bus
        */
        'school_bus'?: Array<V3Disruption>;
        /**
        * Subset of disruption information applicable to telebus services
        */
        'telebus'?: Array<V3Disruption>;
        /**
        * Subset of disruption information applicable to night bus
        */
        'night_bus'?: Array<V3Disruption>;
        /**
        * Subset of disruption information applicable to ferry
        */
        'ferry'?: Array<V3Disruption>;
        /**
        * Subset of disruption information applicable to interstate train
        */
        'interstate_train'?: Array<V3Disruption>;
        /**
        * Subset of disruption information applicable to skybus
        */
        'skybus'?: Array<V3Disruption>;
        /**
        * Subset of disruption information applicable to taxi
        */
        'taxi'?: Array<V3Disruption>;
    }

    interface V3Disruption {
        /**
        * Disruption information identifier
        */
        'disruption_id'?: number;
        /**
        * Headline title summarising disruption information
        */
        'title'?: string;
        /**
        * URL of relevant article on PTV website
        */
        'url'?: string;
        /**
        * Description of the disruption
        */
        'description'?: string;
        /**
        * Status of the disruption (e.g. \"Planned\", \"Current\")
        */
        'disruption_status'?: string;
        /**
        * interface of disruption
        */
        'disruption_type'?: string;
        /**
        * Date and time disruption information is published on PTV website, in ISO 8601 UTC format
        */
        'published_on'?: Date;
        /**
        * Date and time disruption information was last updated by PTV, in ISO 8601 UTC format
        */
        'last_updated'?: Date;
        /**
        * Date and time at which disruption begins, in ISO 8601 UTC format
        */
        'from_date'?: Date;
        /**
        * Date and time at which disruption ends, in ISO 8601 UTC format (returns null if unknown)
        */
        'to_date'?: Date;
        /**
        * Route relevant to a disruption (if applicable)
        */
        'routes'?: Array<V3DisruptionRoute>;
        /**
        * Stop relevant to a disruption (if applicable)
        */
        'stops'?: Array<V3DisruptionStop>;
        'colour'?: string;
        'display_on_board'?: boolean;
        'display_status'?: boolean;
    }

    interface V3DisruptionRoute {
        /**
        * Transport mode identifier
        */
        'route_type'?: number;
        /**
        * Route identifier
        */
        'route_id'?: number;
        /**
        * Name of route
        */
        'route_name'?: string;
        /**
        * Route number presented to public (i.e. not route_id)
        */
        'route_number'?: string;
        /**
        * GTFS Identifer of the route
        */
        'route_gtfs_id'?: string;
        /**
        * Direction of travel relevant to a disruption (if applicable)
        */
        'direction'?: V3DisruptionDirection;
    }

    interface V3DisruptionDirection {
        /**
        * Route and direction of travel combination identifier
        */
        'route_direction_id'?: number;
        /**
        * Direction of travel identifier
        */
        'direction_id'?: number;
        /**
        * Name of direction of travel
        */
        'direction_name'?: string;
        /**
        * Time of service to which disruption applies, in 24 hour clock format (HH:MM:SS) AEDT/AEST; returns null if disruption applies to multiple (or no) services
        */
        'service_time'?: string;
    }

    interface V3DisruptionStop {
        /**
        * Stop identifier
        */
        'stop_id'?: number;
        /**
        * Name of stop
        */
        'stop_name'?: string;
    }

    interface V3Run {
        /**
        * Trip/service run identifier
        */
        'run_id'?: number;
        /**
        * Route identifier
        */
        'route_id'?: number;
        /**
        * Transport mode identifier
        */
        'route_type'?: number;
        /**
        * stop_id of final stop of run
        */
        'final_stop_id'?: number;
        /**
        * Name of destination of run
        */
        'destination_name'?: string;
        /**
        * Status of metropolitan train run; returns \"scheduled\" for other modes
        */
        'status'?: string;
        /**
        * Direction of travel identifier
        */
        'direction_id'?: number;
        /**
        * Chronological sequence of the trip/service run on the route in direction. Order ascendingly by this field to get chronological order (earliest first) of runs with the same route_id and direction_id.
        */
        'run_sequence'?: number;
        /**
        * The number of remaining skipped/express stations for the run/service from a stop
        */
        'express_stop_count'?: number;
        /**
        * Position of the trip/service run. Only available for some bus runs. May be null.
        */
        'vehicle_position'?: V3VehiclePosition;
        /**
        * Descriptor of the trip/service run. Only available for some runs. May be null.
        */
        'vehicle_descriptor'?: V3VehicleDescriptor;
    }

    interface V3VehiclePosition {
        /**
        * Geographic coordinate of latitude of the vehicle when known. May be null.              Only available for some bus runs.
        */
        'latitude'?: number;
        /**
        * Geographic coordinate of longitude of the vehicle when known.               Only available for some bus runs.
        */
        'longitude'?: number;
        /**
        * Compass bearing of the vehicle when known, clockwise from True North, i.e., 0 is North and 90 is East. May be null.              Only available for some bus runs.
        */
        'bearing'?: number;
        /**
        * Supplier of vehicle position data.
        */
        'supplier'?: string;
    }

    interface V3VehicleDescriptor {
        /**
        * Operator name of the vehicle such as \"Metro Trains Melbourne\", \"Yarra Trams\", \"Ventura Bus Line\", \"CDC\" or \"Sita Bus Lines\" . May be null/empty.              Only available for train, tram, v/line and some bus runs.
        */
        'operator'?: string;
        /**
        * Operator identifier of the vehicle such as \"26094\". May be null/empty. Only available for some tram and bus runs.
        */
        'id'?: string;
        /**
        * Indicator if vehicle has a low floor. May be null. Only available for some tram runs.
        */
        'low_floor'?: boolean;
        /**
        * Indicator if vehicle is air conditioned. May be null. Only available for some tram runs.
        */
        'air_conditioned'?: boolean;
        /**
        * Vehicle description such as \"6 Car Comeng\", \"6 Car Xtrapolis\", \"3 Car Comeng\", \"6 Car Siemens\", \"3 Car Siemens\". May be null/empty.              Only available for some metropolitan train runs.
        */
        'description'?: string;
        /**
        * Supplier of vehicle descriptor data.
        */
        'supplier'?: string;
    }

    interface V3Departure {
        /**
        * Stop identifier
        */
        'stop_id'?: number;
        /**
        * Route identifier
        */
        'route_id'?: number;
        /**
        * Trip/service run identifier
        */
        'run_id'?: number;
        /**
        * Direction of travel identifier
        */
        'direction_id'?: number;
        /**
        * Disruption information identifier(s)
        */
        'disruption_ids'?: Array<number>;
        /**
        * Scheduled (i.e. timetabled) departure time and date in ISO 8601 UTC format
        */
        'scheduled_departure_utc'?: Date;
        /**
        * Real-time estimate of departure time and date in ISO 8601 UTC format
        */
        'estimated_departure_utc'?: Date;
        /**
        * Indicates if the metropolitan train service is at the platform at the time of query; returns false for other modes
        */
        'at_platform'?: boolean;
        /**
        * Platform number at stop (metropolitan train only; returns null for other modes)
        */
        'platform_number'?: string;
        /**
        * Flag indicating special condition for run (e.g. RR Reservations Required, GC Guaranteed Connection, DOO Drop Off Only, PUO Pick Up Only, MO Mondays only, TU Tuesdays only, WE Wednesdays only, TH Thursdays only, FR Fridays only, SS School days only; ignore E flag)
        */
        'flags'?: string;
        /**
        * Chronological sequence of the departure for the run on the route. Order ascendingly by this field to get chronological order (earliest first) of departures with the same route_id and run_id.
        */
        'departure_sequence'?: number;
    }

    interface V3Status {
        /**
        * API Version number
        */
        'version'?: string;
        /**
        * API system health status (0=offline, 1=online)
        */
        'health'?: HealthEnum;
    }

    declare enum HealthEnum {
        NUMBER_0 = 0,
        NUMBER_1 = 1
    }

    interface V3ResultStop {
        /**
        * Distance of stop from input location (in metres); returns 0 if no location is input
        */
        'stop_distance'?: number;
        /**
        * suburb of stop
        */
        'stop_suburb'?: string;
        /**
        * Name of stop
        */
        'stop_name'?: string;
        /**
        * Stop identifier
        */
        'stop_id'?: number;
        /**
        * Transport mode identifier
        */
        'route_type'?: number;
        /**
        * Geographic coordinate of latitude at stop
        */
        'stop_latitude'?: number;
        /**
        * Geographic coordinate of longitude at stop
        */
        'stop_longitude'?: number;
        /**
        * Sequence of the stop on the route/run; return 0 when route_id or run_id not specified. Order ascendingly by this field (when non zero) to get physical order (earliest first) of stops on the route_id/run_id.
        */
        'stop_sequence'?: number;
    }

    interface V3Route {
        /**
        * Transport mode identifier
        */
        'route_type'?: number;
        /**
        * Route identifier
        */
        'route_id'?: number;
        /**
        * Name of route
        */
        'route_name'?: string;
        /**
        * Route number presented to public (nb. not route_id)
        */
        'route_number'?: string;
        /**
        * GTFS Identifer of the route
        */
        'route_gtfs_id'?: string;
    }
//}