/* QUERY STRING HELPERS */

//https://css-tricks.com/snippets/javascript/get-url-variables/
function getQueryVariable(variable) {
   var query = window.location.search.substring(1);
   var vars = query.split("&");
   for (var i=0;i<vars.length;i++) {
	   var pair = vars[i].split("=");
	   if(pair[0] == variable){return pair[1];}
   }
   return(false);
}

function updateQueryVariable(key, value) {
	var query = window.location.search.substring(1);
	var vars = query.split("&");
	var result = "";
	for (var i=0;i<vars.length;i++) {
		var pair = vars[i].split("=");
		if(pair[0] == key){
			result = result + "&" + pair[0] + "=" + value;
		} else {
			result = result + "&" + pair[0] + "=" + pair[1];
		}
	}
	return "?" + result.substring(1);
}

/* BROWSER HELPERS */
class BrowserHelpers {
	static hasLocalStorage() {
		return typeof(Storage) !== "undefined";
	}
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

	static formatSingleTime(time, includeDesignator) {
		var date = new Date(time);
		
		var hrs = date.getHours();
		var designator = "am";
		if (hrs > 12) {
			hrs -= 12;
			designator = "pm";
		}
		var mins = padSingleDigitWithZero(date.getMinutes());
		
		return includeDesignator
			? hrs + ":" + mins + designator
			: hrs + ":" + mins;
	}

	static getDifferenceFromNow(estimated, scheduled) {
		var date = estimated == null
			? new Date(scheduled)
			: new Date(estimated);
		
		var now = new Date();
		
		return Math.floor(DateTimeHelpers.getDifferenceFromNowSec(estimated, scheduled) / 60);
	}
	
	static getDifferenceFromNowSec(estimated, scheduled) {
		var date = estimated == null
			? new Date(scheduled)
			: new Date(estimated);
		
		var now = new Date();
		
		var result = ((date.getTime() - now.getTime()) / 1000);
		//console.log(result);
		return result;
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

/* STATION HELPERS */
const _PARLIAMENT_ID = 1155;
const _MELBOURNE_CENTRAL_ID = 1120;
const _FLAGSTAFF_ID = 1068;
const _FLINDERS_ST_ID = 1071;

function isCityLoopStation(stopId) {
	return stopId == _PARLIAMENT_ID || //Parliament
			stopId == _MELBOURNE_CENTRAL_ID || //Melbourne Central
			stopId == _FLAGSTAFF_ID; //Flagstaff
}

function isStoppingAtAnyCityLoopStation(stopIds) {
	var result = false;
	for (var i = 0; i < stopIds.length; i++) {
		if (isCityLoopStation(stopIds[i])) {			
			result = true;
			break;
		}
	}
	return result;
}

function isNotRunningViaCityLoop(stopIds) {	
	return !stopIds.includes(_PARLIAMENT_ID) &&
		!stopIds.includes(_MELBOURNE_CENTRAL_ID) &&
		!stopIds.includes(_FLAGSTAFF_ID);
}

function isFlindersSt(stopId) {
	return stopId === _FLINDERS_ST_ID;
}

/* OTHER RANDOM CODE */

function padSingleDigitWithZero(input) {
	return input < 10 ? '0' + input : input;
}

function isRealTime(estimated) {
	return estimated != null;
}

