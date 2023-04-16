export class DateTimeHelpers {
    static getIsoDate(): string {
        return new Date().toISOString();
    }

    static padSingleDigitWithZero(input: number): string {
        return input < 10 ? "0" + input : input.toString();
    }

    static formatSingleTime(date: Date, includeDesignator: boolean): string {
        const hours = new Date(date).getHours();
        const isPm = hours >= 12;
        const hrs = isPm ? hours - 12 : hours;
        const designator = isPm ? "pm" : "am";
        const mins = this.padSingleDigitWithZero(new Date(date).getMinutes());

        return includeDesignator
            ? hrs + ":" + mins + designator
            : hrs + ":" + mins;
    }

    static getDifferenceFromNow(
        estimated: Date | undefined,
        scheduled: Date
    ): number {
        return Math.floor(
            DateTimeHelpers.getDifferenceFromNowSec(estimated, scheduled) / 60
        );
    }

    static getDifferenceFromNowSec(
        estimated: Date | undefined,
        scheduled: Date
    ): number {
        const date = estimated == null ? scheduled : estimated;

        const now = new Date();

        const result = (new Date(date).getTime() - now.getTime()) / 1000;
        //console.log(result);
        return result;
    }
}