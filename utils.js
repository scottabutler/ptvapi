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
}

